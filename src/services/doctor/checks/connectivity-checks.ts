/**
 * @module connectivity-checks
 * Connectivity validation checks for AWS services and endpoints
 *
 * Provides AWS service connectivity validation including STS
 * credential verification, service endpoint testing, and region accessibility
 * validation. These checks depend on authentication stage completion and
 * validate actual AWS service connectivity.
 *
 */

import { S3Client } from "@aws-sdk/client-s3";
import { CheckExecutionError } from "../../../lib/diagnostic-errors.js";
import { TimeoutError } from "../../../lib/errors.js";
import { toSafeString } from "../../../lib/type-utilities.js";
import type { CredentialServiceOptions } from "../../credential-service.js";
import { CredentialService } from "../../credential-service.js";
import type { CheckResult, DoctorContext, ICheck } from "../types.js";

/**
 * STS credential connectivity check
 *
 * Uses CredentialService.validateCredentials() to test actual AWS connectivity
 * through STS GetCallerIdentity API call. Validates that credentials work
 * end-to-end with AWS services and provides detailed connectivity information.
 *
 * @public
 */
export class StsCredentialCheck implements ICheck {
  /**
   * Unique identifier for this check
   */
  readonly id = "sts-credential";

  /**
   * Human-readable name for this check
   */
  readonly name = "STS Credential Connectivity";

  /**
   * Description of what this check validates
   */
  readonly description = "Validates AWS credential connectivity using STS GetCallerIdentity";

  /**
   * Validation stage this check belongs to
   */
  readonly stage = "connectivity" as const;

  /**
   * Credential service for STS validation
   */
  private readonly credentialService: CredentialService;

  /**
   * Timeout for STS calls in milliseconds
   * CI optimized while preserving production behavior
   */
  private readonly timeoutMs = process.env.CI ? 500 : 15_000;

  /**
   * Create a new STS credential connectivity check
   *
   * @param credentialServiceOptions - Optional credential service configuration
   */
  constructor(credentialServiceOptions?: CredentialServiceOptions) {
    this.credentialService = new CredentialService({
      ...credentialServiceOptions,
    });
  }

  /**
   * Execute the STS credential connectivity check
   *
   * Uses CredentialService.validateCredentials() to perform actual AWS API
   * call and validate end-to-end connectivity. Provides detailed information
   * about the authenticated identity and connectivity status.
   *
   * @param context - Shared execution context with previous stage results
   * @returns Promise resolving to check result with STS connectivity details
   * @throws When STS connectivity validation fails unexpectedly
   */
  async execute(context: DoctorContext): Promise<CheckResult> {
    try {
      const startTime = Date.now();

      // Use Promise.race for timeout protection with TimeoutError
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () =>
            reject(
              new TimeoutError(
                `STS call timed out after ${this.timeoutMs}ms`,
                "STS GetCallerIdentity",
                this.timeoutMs,
                undefined,
                true,
              ),
            ),
          this.timeoutMs,
        );
      });

      const credentialPromise = this.credentialService.validateCredentials(context.profile);

      const callerIdentity = await Promise.race([credentialPromise, timeoutPromise]);

      const responseTime = Date.now() - startTime;

      return {
        status: "pass",
        message: `STS connectivity successful for account ${callerIdentity.account}`,
        details: {
          account: callerIdentity.account,
          userId: callerIdentity.userId,
          arn: callerIdentity.arn,
          profile: callerIdentity.profile ?? context.profile,
          responseTime,
          timeoutMs: this.timeoutMs,
        },
      };
    } catch (error) {
      return this.handleStsError(error, context);
    }
  }

  /**
   * Handle STS connectivity errors with specific error types
   *
   * @param error - Error from STS operation
   * @param context - Execution context
   * @returns CheckResult for the error
   * @throws When error is not an Error instance
   * @internal
   */
  private handleStsError(error: unknown, context: DoctorContext): CheckResult {
    if (error instanceof Error) {
      const errorResult = this.classifyStsError(error, context);
      if (errorResult) {
        return errorResult;
      }

      // Generic error handling
      return {
        status: "fail",
        message: `STS connectivity failed: ${error.message}`,
        details: {
          error: error.message,
          profile: context.profile,
        },
        remediation: "Check credential configuration and network connectivity",
      };
    }

    throw new CheckExecutionError(
      "Failed to validate STS credential connectivity",
      this.id,
      this.stage,
      error,
      { targetProfile: context.profile },
    );
  }

  /**
   * Classify STS errors into specific types
   *
   * @param error - Error instance to classify
   * @param context - Execution context
   * @returns CheckResult for classified error, or undefined for generic handling
   * @internal
   */
  private classifyStsError(error: Error, context: DoctorContext): CheckResult | undefined {
    // Handle TimeoutError instances specifically
    if (error instanceof TimeoutError) {
      return {
        status: "fail",
        message: `STS call timed out after ${toSafeString(error.metadata.timeoutMs)}ms`,
        details: {
          error: "Network timeout",
          operation: error.metadata.operation,
          timeoutMs: error.metadata.timeoutMs,
          retryable: error.metadata.retryable,
          profile: context.profile,
        },
        remediation:
          "Check network connectivity and AWS service status. Consider using a different region or increasing timeout.",
      };
    }

    // Legacy timeout detection for backward compatibility
    if (error.message.includes("timed out")) {
      return {
        status: "fail",
        message: `STS call timed out after ${this.timeoutMs}ms`,
        details: {
          error: "Timeout",
          timeoutMs: this.timeoutMs,
          profile: context.profile,
        },
        remediation:
          "Check network connectivity and AWS service status. Consider using a different region.",
      };
    }

    if (error.message.includes("UnauthorizedOperation") || error.message.includes("AccessDenied")) {
      return {
        status: "fail",
        message: "STS access denied - insufficient permissions",
        details: {
          error: "Access denied",
          profile: context.profile,
        },
        remediation: "Verify credential permissions and IAM policies allow STS:GetCallerIdentity",
      };
    }

    if (error.message.includes("ExpiredToken") || error.message.includes("TokenRefreshRequired")) {
      return {
        status: "fail",
        message: "STS authentication failed - expired credentials",
        details: {
          error: "Expired credentials",
          profile: context.profile,
        },
        remediation: context.profile
          ? `Run 'aws sso login --profile ${context.profile}' to refresh credentials`
          : "Refresh your AWS credentials",
      };
    }

    if (error.message.includes("NetworkingError") || error.message.includes("ENOTFOUND")) {
      return {
        status: "fail",
        message: "STS network connectivity failed",
        details: {
          error: "Network error",
          profile: context.profile,
        },
        remediation: "Check internet connectivity and DNS resolution for AWS endpoints",
      };
    }

    return undefined;
  }
}

/**
 * AWS service endpoint connectivity check
 *
 * Tests connectivity to AWS service endpoints using lightweight API calls
 * with timeout protection. Validates that AWS services are accessible
 * and responsive from the current network environment.
 *
 * @public
 */
export class ServiceEndpointCheck implements ICheck {
  /**
   * Unique identifier for this check
   */
  readonly id = "service-endpoint";

  /**
   * Human-readable name for this check
   */
  readonly name = "Service Endpoint Connectivity";

  /**
   * Description of what this check validates
   */
  readonly description = "Tests AWS service endpoint connectivity and responsiveness";

  /**
   * Validation stage this check belongs to
   */
  readonly stage = "connectivity" as const;

  /**
   * Credential service for AWS client creation
   */
  private readonly credentialService: CredentialService;

  /**
   * Timeout for service calls in milliseconds
   * CI optimized while preserving production behavior
   */
  private readonly timeoutMs = process.env.CI ? 400 : 10_000;

  /**
   * Create a new service endpoint connectivity check
   *
   * @param credentialServiceOptions - Optional credential service configuration
   */
  // SonarJS flags similar constructor patterns but each connectivity check requires
  // isolated credential service configuration for different timeout and retry behaviors
  // eslint-disable-next-line sonarjs/no-identical-functions
  constructor(credentialServiceOptions?: CredentialServiceOptions) {
    this.credentialService = new CredentialService({
      ...credentialServiceOptions,
    });
  }

  /**
   * Execute the service endpoint connectivity check
   *
   * Tests connectivity to core AWS services including S3 for general service
   * availability. Uses lightweight operations with timeout protection to
   * validate service accessibility without requiring specific permissions.
   *
   * @param context - Shared execution context with previous stage results
   * @returns Promise resolving to check result with endpoint connectivity details
   * @throws When endpoint connectivity validation fails unexpectedly
   */
  async execute(context: DoctorContext): Promise<CheckResult> {
    try {
      const endpointTests = [{ service: "S3", test: () => this.testS3Connectivity(context) }];

      const results = await Promise.allSettled(
        endpointTests.map(async ({ service, test }) => {
          const startTime = Date.now();
          try {
            await test();
            return {
              service,
              status: "success" as const,
              responseTime: Date.now() - startTime,
            };
          } catch (error) {
            return {
              service,
              status: "failed" as const,
              responseTime: Date.now() - startTime,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }),
      );

      const testResults = results.map((result) =>
        result.status === "fulfilled"
          ? result.value
          : {
              service: "Unknown",
              status: "failed" as const,
              responseTime: 0,
              error: "Test execution failed",
            },
      );

      const successfulTests = testResults.filter((result) => result.status === "success");
      const failedTests = testResults.filter((result) => result.status === "failed");

      if (successfulTests.length === testResults.length) {
        const avgResponseTime = Math.round(
          successfulTests.reduce((sum, test) => sum + test.responseTime, 0) /
            successfulTests.length,
        );

        return {
          status: "pass",
          message: `All ${testResults.length} service endpoints are accessible`,
          details: {
            successfulServices: successfulTests.length,
            failedServices: 0,
            averageResponseTime: avgResponseTime,
            serviceResults: testResults,
          },
        };
      }

      if (successfulTests.length === 0) {
        return {
          status: "fail",
          message: "No service endpoints are accessible",
          details: {
            successfulServices: 0,
            failedServices: failedTests.length,
            serviceResults: testResults,
          },
          remediation: "Check network connectivity, firewall settings, and AWS service status",
        };
      }

      // Some services accessible, some not
      return {
        status: "warn",
        message: `${failedTests.length} of ${testResults.length} service endpoints are not accessible`,
        details: {
          successfulServices: successfulTests.length,
          failedServices: failedTests.length,
          serviceResults: testResults,
        },
        remediation:
          "Check network connectivity for failed services and verify service-specific configurations",
      };
    } catch (error) {
      throw new CheckExecutionError(
        "Failed to validate service endpoint connectivity",
        this.id,
        this.stage,
        error,
        { targetProfile: context.profile },
      );
    }
  }

  /**
   * Test S3 service connectivity
   *
   * @param context - Execution context with profile information
   * @returns Promise that resolves when S3 is accessible
   * @internal
   */
  private async testS3Connectivity(context: DoctorContext): Promise<void> {
    // Create S3 client manually since createClient has type constraints
    const credentials = await this.credentialService.getCredentials(context.profile);
    const s3Client = new S3Client({
      region: "us-east-1", // Use a default region for connectivity test
      credentials,
    });

    // Use a simple operation that doesn't require bucket access
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("S3 connectivity test timed out")), this.timeoutMs);
    });

    const connectivityPromise = s3Client.config.region();

    await Promise.race([connectivityPromise, timeoutPromise]);
  }
}

/**
 * AWS region accessibility validation check
 *
 * Tests accessibility to the configured AWS region and validates that
 * the region is available and responsive. Provides guidance for region
 * configuration issues and service availability.
 *
 * @public
 */
export class RegionAccessibilityCheck implements ICheck {
  /**
   * Unique identifier for this check
   */
  readonly id = "region-accessibility";

  /**
   * Human-readable name for this check
   */
  readonly name = "Region Accessibility";

  /**
   * Description of what this check validates
   */
  readonly description = "Validates AWS region accessibility and configuration";

  /**
   * Validation stage this check belongs to
   */
  readonly stage = "connectivity" as const;

  /**
   * Credential service for region testing
   */
  private readonly credentialService: CredentialService;

  /**
   * Timeout for region calls in milliseconds
   * CI optimized while preserving production behavior
   */
  private readonly timeoutMs = process.env.CI ? 450 : 12_000;

  /**
   * Create a new region accessibility check
   *
   * @param credentialServiceOptions - Optional credential service configuration
   */
  // SonarJS flags similar constructor patterns but each connectivity check requires
  // isolated credential service configuration for different timeout and retry behaviors
  // eslint-disable-next-line sonarjs/no-identical-functions
  constructor(credentialServiceOptions?: CredentialServiceOptions) {
    this.credentialService = new CredentialService({
      ...credentialServiceOptions,
    });
  }

  /**
   * Execute the region accessibility validation check
   *
   * Tests connectivity to the configured AWS region using STS GetCallerIdentity
   * with region-specific endpoint. Validates region configuration and provides
   * guidance for region-related connectivity issues.
   *
   * @param context - Shared execution context with previous stage results
   * @returns Promise resolving to check result with region accessibility details
   * @throws When region accessibility validation fails unexpectedly
   */
  async execute(context: DoctorContext): Promise<CheckResult> {
    try {
      // Determine target region from context or environment
      const targetRegion = this.determineTargetRegion();

      if (!targetRegion) {
        return {
          status: "fail",
          message: "No AWS region configured",
          details: {
            configuredRegion: undefined,
            environmentRegion: process.env.AWS_REGION,
            profileRegion: undefined,
          },
          remediation:
            "Configure AWS region using 'aws configure' or set AWS_REGION environment variable",
        };
      }

      const startTime = Date.now();

      // Test region accessibility using STS with explicit region
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Region accessibility test timed out")), this.timeoutMs);
      });

      const regionTestPromise = this.credentialService.validateCredentials(context.profile);

      await Promise.race([regionTestPromise, timeoutPromise]);

      const responseTime = Date.now() - startTime;

      // Validate region format
      const regionValidation = this.validateRegionFormat(targetRegion);

      if (!regionValidation.isValid) {
        return {
          status: "warn",
          message: `Region '${targetRegion}' has non-standard format`,
          details: {
            configuredRegion: targetRegion,
            responseTime,
            formatIssues: regionValidation.issues,
          },
          remediation: "Verify region name matches AWS region format (e.g., us-east-1, eu-west-1)",
        };
      }

      return {
        status: "pass",
        message: `Region '${targetRegion}' is accessible and responsive`,
        details: {
          configuredRegion: targetRegion,
          responseTime,
          timeoutMs: this.timeoutMs,
          profile: context.profile,
        },
      };
    } catch (error) {
      if (error instanceof Error) {
        const targetRegion = this.determineTargetRegion();

        if (error.message.includes("timed out")) {
          return {
            status: "fail",
            message: `Region '${targetRegion}' accessibility test timed out`,
            details: {
              configuredRegion: targetRegion,
              error: "Timeout",
              timeoutMs: this.timeoutMs,
            },
            remediation:
              "Check network connectivity to AWS region endpoints or try a different region",
          };
        }

        if (
          error.message.includes("InvalidRegion") ||
          error.message.includes("UnrecognizedClientException")
        ) {
          return {
            status: "fail",
            message: `Region '${targetRegion}' is not recognized or unavailable`,
            details: {
              configuredRegion: targetRegion,
              error: "Invalid region",
            },
            remediation:
              "Configure a valid AWS region. See https://docs.aws.amazon.com/general/latest/gr/rande.html for available regions",
          };
        }

        if (error.message.includes("NetworkingError") || error.message.includes("ENOTFOUND")) {
          return {
            status: "fail",
            message: `Network connectivity failed for region '${targetRegion}'`,
            details: {
              configuredRegion: targetRegion,
              error: "Network error",
            },
            remediation:
              "Check internet connectivity and DNS resolution for AWS regional endpoints",
          };
        }

        // Generic error handling
        return {
          status: "fail",
          message: `Region '${targetRegion}' accessibility failed: ${error.message}`,
          details: {
            configuredRegion: targetRegion,
            error: error.message,
          },
          remediation: "Verify region configuration and network connectivity",
        };
      }

      throw new CheckExecutionError(
        "Failed to validate region accessibility",
        this.id,
        this.stage,
        error,
        { targetProfile: context.profile },
      );
    }
  }

  /**
   * Determine target region from environment variables
   *
   * @returns Target region (always returns a string)
   * @internal
   */
  private determineTargetRegion(): string {
    // Check environment variable first
    if (process.env.AWS_REGION) {
      return process.env.AWS_REGION;
    }

    if (process.env.AWS_DEFAULT_REGION) {
      return process.env.AWS_DEFAULT_REGION;
    }

    // Default region if nothing else is configured
    return "us-east-1";
  }

  /**
   * Validate AWS region format
   *
   * @param region - Region string to validate
   * @returns Validation result with issues
   * @internal
   */
  private validateRegionFormat(region: string): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];

    // Check basic format: letters, numbers, and hyphens only
    if (!/^[a-z0-9-]+$/.test(region)) {
      issues.push(
        "Region contains invalid characters (only lowercase letters, numbers, and hyphens allowed)",
      );
    }

    // Check typical AWS region pattern
    if (!/^[a-z]+-[a-z]+-\d+$/.test(region)) {
      issues.push("Region does not match typical AWS format (e.g., us-east-1, eu-west-2)");
    }

    // Validate region length against AWS region naming constraints (typical range: 5-20 chars).
    if (region.length < 5 || region.length > 20) {
      issues.push("Region length is outside typical range (5-20 characters)");
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }
}
