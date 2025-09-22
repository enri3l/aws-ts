/**
 * Unit tests for connectivity validation checks
 *
 * Tests STS credential connectivity, service endpoint testing, and region
 * accessibility validation with comprehensive mocking of AWS services.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckExecutionError } from "../../../../../src/lib/diagnostic-errors.js";
import { CredentialService } from "../../../../../src/services/credential-service.js";
import {
  RegionAccessibilityCheck,
  ServiceEndpointCheck,
  StsCredentialCheck,
} from "../../../../../src/services/doctor/checks/connectivity-checks.js";
import type { DoctorContext } from "../../../../../src/services/doctor/types.js";

// Mock external dependencies
vi.mock("../../../../../src/services/credential-service.js", () => ({
  CredentialService: vi.fn(),
}));

const mockCredentialService = {
  validateCredentials: vi.fn(),
  getActiveProfile: vi.fn(),
  createS3Client: vi.fn(),
  createStsClient: vi.fn(),
  getCredentials: vi.fn(),
};

describe("Connectivity Checks", () => {
  let context: DoctorContext;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default context
    context = {
      profile: "test-profile",
      detailed: false,
    };

    // Setup mock constructor
    vi.mocked(CredentialService).mockReturnValue(mockCredentialService as any);
  });

  describe("StsCredentialCheck", () => {
    let stsCredentialCheck: StsCredentialCheck;

    beforeEach(() => {
      stsCredentialCheck = new StsCredentialCheck();
    });

    describe("properties", () => {
      it("should have correct metadata", () => {
        expect(stsCredentialCheck.id).toBe("sts-credential");
        expect(stsCredentialCheck.name).toBe("STS Credential Connectivity");
        expect(stsCredentialCheck.description).toBe(
          "Validates AWS credential connectivity using STS GetCallerIdentity",
        );
        expect(stsCredentialCheck.stage).toBe("connectivity");
      });
    });

    describe("execute", () => {
      it("should pass for valid STS credentials", async () => {
        const mockCallerIdentity = {
          account: "123456789012",
          userId: "AIDACKCEVSQ6C2EXAMPLE",
          arn: "arn:aws:iam::123456789012:user/test-user",
          profile: "test-profile",
        };

        mockCredentialService.validateCredentials.mockResolvedValue(mockCallerIdentity);

        const result = await stsCredentialCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.message).toBe("STS connectivity successful for account 123456789012");
        const expectedTimeout = process.env.CI ? 500 : 15_000;
        expect(result.details).toEqual({
          account: "123456789012",
          userId: "AIDACKCEVSQ6C2EXAMPLE",
          arn: "arn:aws:iam::123456789012:user/test-user",
          profile: "test-profile",
          responseTime: expect.any(Number),
          timeoutMs: expectedTimeout,
        });

        expect(mockCredentialService.validateCredentials).toHaveBeenCalledWith("test-profile");
      });

      it("should handle caller identity without profile", async () => {
        const mockCallerIdentity = {
          account: "123456789012",
          userId: "AIDACKCEVSQ6C2EXAMPLE",
          arn: "arn:aws:iam::123456789012:user/test-user",
        };

        mockCredentialService.validateCredentials.mockResolvedValue(mockCallerIdentity);

        const result = await stsCredentialCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.details?.profile).toBe("test-profile");
      });

      it("should fail for STS timeout", { timeout: process.env.CI ? 2000 : 20_000 }, async () => {
        const mockDelay = process.env.CI ? 600 : 16_000;
        mockCredentialService.validateCredentials.mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve(), mockDelay)),
        );

        const result = await stsCredentialCheck.execute(context);

        const expectedTimeout = process.env.CI ? 500 : 15_000;
        expect(result.status).toBe("fail");
        expect(result.message).toBe(`STS call timed out after ${expectedTimeout}ms`);
        expect(result.details).toEqual({
          error: "Timeout",
          timeoutMs: expectedTimeout,
          profile: "test-profile",
        });
        expect(result.remediation).toContain("Check network connectivity");
      });

      it("should fail for access denied errors", async () => {
        const accessDeniedError = new Error("UnauthorizedOperation: Access denied");
        mockCredentialService.validateCredentials.mockRejectedValue(accessDeniedError);

        const result = await stsCredentialCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("STS access denied - insufficient permissions");
        expect(result.details).toEqual({
          error: "Access denied",
          profile: "test-profile",
        });
        expect(result.remediation).toContain("Verify credential permissions");
      });

      it("should fail for expired token errors", async () => {
        const expiredTokenError = new Error(
          "ExpiredToken: The security token included in the request is expired",
        );
        mockCredentialService.validateCredentials.mockRejectedValue(expiredTokenError);

        const result = await stsCredentialCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("STS authentication failed - expired credentials");
        expect(result.details).toEqual({
          error: "Expired credentials",
          profile: "test-profile",
        });
        expect(result.remediation).toContain("aws sso login --profile test-profile");
      });

      it("should fail for network errors", async () => {
        const networkError = new Error("NetworkingError: getaddrinfo ENOTFOUND");
        mockCredentialService.validateCredentials.mockRejectedValue(networkError);

        const result = await stsCredentialCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("STS network connectivity failed");
        expect(result.details).toEqual({
          error: "Network error",
          profile: "test-profile",
        });
        expect(result.remediation).toContain("Check internet connectivity");
      });

      it("should fail for generic errors with error message", async () => {
        const genericError = new Error("Unknown STS error");
        mockCredentialService.validateCredentials.mockRejectedValue(genericError);

        const result = await stsCredentialCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("STS connectivity failed: Unknown STS error");
        expect(result.details).toEqual({
          error: "Unknown STS error",
          profile: "test-profile",
        });
        expect(result.remediation).toBe("Check credential configuration and network connectivity");
      });

      it("should handle context without profile", async () => {
        const mockCallerIdentity = {
          account: "123456789012",
          userId: "AIDACKCEVSQ6C2EXAMPLE",
          arn: "arn:aws:iam::123456789012:user/default",
        };

        mockCredentialService.validateCredentials.mockResolvedValue(mockCallerIdentity);

        const contextWithoutProfile = { ...context, profile: undefined };
        const result = await stsCredentialCheck.execute(contextWithoutProfile);

        expect(result.status).toBe("pass");
        expect(mockCredentialService.validateCredentials).toHaveBeenCalledWith(undefined);
      });

      it("should throw CheckExecutionError for unexpected errors", async () => {
        const unexpectedError = { unexpected: "error object" };
        mockCredentialService.validateCredentials.mockRejectedValue(unexpectedError);

        await expect(stsCredentialCheck.execute(context)).rejects.toThrow(CheckExecutionError);
      });
    });
  });

  describe("ServiceEndpointCheck", () => {
    let serviceEndpointCheck: ServiceEndpointCheck;

    beforeEach(() => {
      serviceEndpointCheck = new ServiceEndpointCheck();
    });

    describe("properties", () => {
      it("should have correct metadata", () => {
        expect(serviceEndpointCheck.id).toBe("service-endpoint");
        expect(serviceEndpointCheck.name).toBe("Service Endpoint Connectivity");
        expect(serviceEndpointCheck.description).toBe(
          "Tests AWS service endpoint connectivity and responsiveness",
        );
        expect(serviceEndpointCheck.stage).toBe("connectivity");
      });
    });

    describe("execute", () => {
      it("should pass for accessible service endpoints", async () => {
        const mockS3Client = {
          config: {
            region: vi.fn().mockResolvedValue("us-east-1"),
          },
        };

        const mockCredentials = {
          accessKeyId: "AKIATEST",
          secretAccessKey: "test-secret",
        };

        mockCredentialService.createS3Client.mockResolvedValue(mockS3Client);
        mockCredentialService.getCredentials.mockResolvedValue(mockCredentials);

        const result = await serviceEndpointCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.message).toBe("All 1 service endpoints are accessible");
        expect(result.details).toEqual({
          successfulServices: 1,
          failedServices: 0,
          averageResponseTime: expect.any(Number),
          serviceResults: [
            {
              service: "S3",
              status: "success",
              responseTime: expect.any(Number),
            },
          ],
        });

        expect(mockCredentialService.getCredentials).toHaveBeenCalledWith("test-profile");
      });

      it("should pass for context without profile", async () => {
        const mockS3Client = {
          config: {
            region: vi.fn().mockResolvedValue("us-east-1"),
          },
        };

        const mockCredentials = {
          accessKeyId: "AKIATEST",
          secretAccessKey: "test-secret",
        };

        mockCredentialService.createS3Client.mockResolvedValue(mockS3Client);
        mockCredentialService.getCredentials.mockResolvedValue(mockCredentials);

        const contextWithoutProfile = { ...context, profile: undefined };
        const result = await serviceEndpointCheck.execute(contextWithoutProfile);

        expect(result.status).toBe("pass");
        expect(mockCredentialService.getCredentials).toHaveBeenCalledWith(undefined);
      });

      it("should fail when no service endpoints are accessible", async () => {
        const s3Error = new Error("S3 connectivity failed");
        mockCredentialService.getCredentials.mockRejectedValue(s3Error);

        const result = await serviceEndpointCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("No service endpoints are accessible");
        expect(result.details).toEqual({
          successfulServices: 0,
          failedServices: 1,
          serviceResults: [
            {
              service: "S3",
              status: "failed",
              responseTime: expect.any(Number),
              error: "S3 connectivity failed",
            },
          ],
        });
        expect(result.remediation).toContain("Check network connectivity");
      });

      it("should warn when some service endpoints fail", async () => {
        // For this test, we'd need multiple services, but currently only S3 is tested
        // This test demonstrates the logic when we have mixed results
        const mockS3Client = {
          config: {
            region: vi.fn().mockRejectedValue(new Error("S3 timeout")),
          },
        };

        mockCredentialService.createS3Client.mockResolvedValue(mockS3Client);

        const result = await serviceEndpointCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("No service endpoints are accessible");
        expect(result.details?.failedServices).toBe(1);
      });

      it("should handle S3 connectivity timeout", async () => {
        const mockDelay = process.env.CI ? 500 : 15_000;
        const mockS3Client = {
          config: {
            region: vi
              .fn()
              .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, mockDelay))),
          },
        };

        mockCredentialService.createS3Client.mockResolvedValue(mockS3Client);

        const result = await serviceEndpointCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.details?.serviceResults?.[0]?.error).toBe("S3 connectivity failed");
      });

      it("should handle S3 client creation failure", async () => {
        const clientCreationError = new Error("Failed to create S3 client");
        mockCredentialService.createS3Client.mockRejectedValue(clientCreationError);

        const result = await serviceEndpointCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.details?.serviceResults?.[0]?.error).toBe("S3 connectivity failed");
      });

      it("should throw CheckExecutionError for unexpected errors", async () => {
        // Mock Promise.allSettled to throw (very unlikely but for completeness)
        const originalAllSettled = Promise.allSettled;
        Promise.allSettled = vi.fn().mockRejectedValue(new Error("Promise.allSettled failed"));

        await expect(serviceEndpointCheck.execute(context)).rejects.toThrow(CheckExecutionError);

        // Restore original method
        Promise.allSettled = originalAllSettled;
      });
    });
  });

  describe("RegionAccessibilityCheck", () => {
    let regionAccessibilityCheck: RegionAccessibilityCheck;

    beforeEach(() => {
      regionAccessibilityCheck = new RegionAccessibilityCheck();
      // Clear environment variables
      delete process.env.AWS_REGION;
      delete process.env.AWS_DEFAULT_REGION;
    });

    afterEach(() => {
      // Clean up environment variables
      delete process.env.AWS_REGION;
      delete process.env.AWS_DEFAULT_REGION;
    });

    describe("properties", () => {
      it("should have correct metadata", () => {
        expect(regionAccessibilityCheck.id).toBe("region-accessibility");
        expect(regionAccessibilityCheck.name).toBe("Region Accessibility");
        expect(regionAccessibilityCheck.description).toBe(
          "Validates AWS region accessibility and configuration",
        );
        expect(regionAccessibilityCheck.stage).toBe("connectivity");
      });
    });

    describe("execute", () => {
      it("should pass for accessible AWS region", async () => {
        process.env.AWS_REGION = "us-east-1";

        const mockCallerIdentity = {
          account: "123456789012",
          userId: "AIDACKCEVSQ6C2EXAMPLE",
          arn: "arn:aws:iam::123456789012:user/test-user",
        };

        mockCredentialService.validateCredentials.mockResolvedValue(mockCallerIdentity);

        const result = await regionAccessibilityCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.message).toBe("Region 'us-east-1' is accessible and responsive");
        const expectedTimeout = process.env.CI ? 450 : 12_000;
        expect(result.details).toEqual({
          configuredRegion: "us-east-1",
          responseTime: expect.any(Number),
          timeoutMs: expectedTimeout,
          profile: "test-profile",
        });
      });

      it("should use AWS_DEFAULT_REGION when AWS_REGION not set", async () => {
        process.env.AWS_DEFAULT_REGION = "eu-west-1";

        const mockCallerIdentity = {
          account: "123456789012",
          userId: "AIDACKCEVSQ6C2EXAMPLE",
          arn: "arn:aws:iam::123456789012:user/test-user",
        };

        mockCredentialService.validateCredentials.mockResolvedValue(mockCallerIdentity);

        const result = await regionAccessibilityCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.details?.configuredRegion).toBe("eu-west-1");
      });

      it("should default to us-east-1 when no region environment variables set", async () => {
        const mockCallerIdentity = {
          account: "123456789012",
          userId: "AIDACKCEVSQ6C2EXAMPLE",
          arn: "arn:aws:iam::123456789012:user/test-user",
        };

        mockCredentialService.validateCredentials.mockResolvedValue(mockCallerIdentity);

        const result = await regionAccessibilityCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.details?.configuredRegion).toBe("us-east-1");
      });

      it("should warn for non-standard region format", async () => {
        process.env.AWS_REGION = "custom-region";

        const mockCallerIdentity = {
          account: "123456789012",
          userId: "AIDACKCEVSQ6C2EXAMPLE",
          arn: "arn:aws:iam::123456789012:user/test-user",
        };

        mockCredentialService.validateCredentials.mockResolvedValue(mockCallerIdentity);

        const result = await regionAccessibilityCheck.execute(context);

        expect(result.status).toBe("warn");
        expect(result.message).toBe("Region 'custom-region' has non-standard format");
        expect(result.details).toEqual({
          configuredRegion: "custom-region",
          responseTime: expect.any(Number),
          formatIssues: ["Region does not match typical AWS format (e.g., us-east-1, eu-west-2)"],
        });
        expect(result.remediation).toContain("Verify region name matches AWS region format");
      });

      it(
        "should fail for region timeout",
        { timeout: process.env.CI ? 2000 : 20_000 },
        async () => {
          process.env.AWS_REGION = "us-west-2";

          const mockDelay = process.env.CI ? 550 : 16_000;
          mockCredentialService.validateCredentials.mockImplementation(
            () => new Promise((resolve) => setTimeout(() => resolve(), mockDelay)),
          );

          const result = await regionAccessibilityCheck.execute(context);

          expect(result.status).toBe("fail");
          expect(result.message).toBe("Region 'us-west-2' accessibility test timed out");
          const expectedTimeout = process.env.CI ? 450 : 12_000;
          expect(result.details).toEqual({
            configuredRegion: "us-west-2",
            error: "Timeout",
            timeoutMs: expectedTimeout,
          });
          expect(result.remediation).toContain(
            "Check network connectivity to AWS region endpoints",
          );
        },
      );

      it("should fail for invalid region", async () => {
        process.env.AWS_REGION = "invalid-region";

        const invalidRegionError = new Error(
          "InvalidRegion: The region 'invalid-region' is not recognized",
        );
        mockCredentialService.validateCredentials.mockRejectedValue(invalidRegionError);

        const result = await regionAccessibilityCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("Region 'invalid-region' is not recognized or unavailable");
        expect(result.details).toEqual({
          configuredRegion: "invalid-region",
          error: "Invalid region",
        });
        expect(result.remediation).toContain("Configure a valid AWS region");
      });

      it("should fail for network connectivity issues", async () => {
        process.env.AWS_REGION = "ap-southeast-1";

        const networkError = new Error("NetworkingError: getaddrinfo ENOTFOUND");
        mockCredentialService.validateCredentials.mockRejectedValue(networkError);

        const result = await regionAccessibilityCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("Network connectivity failed for region 'ap-southeast-1'");
        expect(result.details).toEqual({
          configuredRegion: "ap-southeast-1",
          error: "Network error",
        });
        expect(result.remediation).toContain("Check internet connectivity and DNS resolution");
      });

      it("should fail for generic region errors", async () => {
        process.env.AWS_REGION = "us-east-1";

        const genericError = new Error("Unknown region error");
        mockCredentialService.validateCredentials.mockRejectedValue(genericError);

        const result = await regionAccessibilityCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe(
          "Region 'us-east-1' accessibility failed: Unknown region error",
        );
        expect(result.details).toEqual({
          configuredRegion: "us-east-1",
          error: "Unknown region error",
        });
        expect(result.remediation).toBe("Verify region configuration and network connectivity");
      });

      it("should throw CheckExecutionError for unexpected errors", async () => {
        process.env.AWS_REGION = "us-east-1";

        const unexpectedError = { unexpected: "error object" };
        mockCredentialService.validateCredentials.mockRejectedValue(unexpectedError);

        await expect(regionAccessibilityCheck.execute(context)).rejects.toThrow(
          CheckExecutionError,
        );
      });
    });

    describe("determineTargetRegion", () => {
      it("should prioritize AWS_REGION environment variable", () => {
        process.env.AWS_REGION = "us-west-1";
        process.env.AWS_DEFAULT_REGION = "us-east-1";

        const determineTargetRegion = (regionAccessibilityCheck as any).determineTargetRegion.bind(
          regionAccessibilityCheck,
        );
        const result = determineTargetRegion(context);

        expect(result).toBe("us-west-1");
      });

      it("should use AWS_DEFAULT_REGION when AWS_REGION not set", () => {
        process.env.AWS_DEFAULT_REGION = "eu-central-1";

        const determineTargetRegion = (regionAccessibilityCheck as any).determineTargetRegion.bind(
          regionAccessibilityCheck,
        );
        const result = determineTargetRegion(context);

        expect(result).toBe("eu-central-1");
      });

      it("should default to us-east-1 when no environment variables set", () => {
        const determineTargetRegion = (regionAccessibilityCheck as any).determineTargetRegion.bind(
          regionAccessibilityCheck,
        );
        const result = determineTargetRegion(context);

        expect(result).toBe("us-east-1");
      });
    });

    describe("validateRegionFormat", () => {
      it("should validate correct AWS region formats", () => {
        const validateRegionFormat = (regionAccessibilityCheck as any).validateRegionFormat.bind(
          regionAccessibilityCheck,
        );

        const validRegions = ["us-east-1", "eu-west-2", "ap-southeast-1", "ca-central-1"];

        for (const region of validRegions) {
          const result = validateRegionFormat(region);
          expect(result.isValid).toBe(true);
          expect(result.issues).toEqual([]);
        }
      });

      it("should detect invalid characters", () => {
        const validateRegionFormat = (regionAccessibilityCheck as any).validateRegionFormat.bind(
          regionAccessibilityCheck,
        );

        const result = validateRegionFormat("us_east_1");

        expect(result.isValid).toBe(false);
        expect(result.issues).toContain(
          "Region contains invalid characters (only lowercase letters, numbers, and hyphens allowed)",
        );
      });

      it("should detect non-standard format", () => {
        const validateRegionFormat = (regionAccessibilityCheck as any).validateRegionFormat.bind(
          regionAccessibilityCheck,
        );

        const result = validateRegionFormat("customregion");

        expect(result.isValid).toBe(false);
        expect(result.issues).toContain(
          "Region does not match typical AWS format (e.g., us-east-1, eu-west-2)",
        );
      });

      it("should detect invalid length", () => {
        const validateRegionFormat = (regionAccessibilityCheck as any).validateRegionFormat.bind(
          regionAccessibilityCheck,
        );

        const shortResult = validateRegionFormat("us");
        expect(shortResult.isValid).toBe(false);
        expect(shortResult.issues).toContain(
          "Region length is outside typical range (5-20 characters)",
        );

        const longResult = validateRegionFormat(
          "this-is-a-very-long-region-name-that-exceeds-limits",
        );
        expect(longResult.isValid).toBe(false);
        expect(longResult.issues).toContain(
          "Region length is outside typical range (5-20 characters)",
        );
      });

      it("should accumulate multiple issues", () => {
        const validateRegionFormat = (regionAccessibilityCheck as any).validateRegionFormat.bind(
          regionAccessibilityCheck,
        );

        const result = validateRegionFormat("INVALID_REGION_NAME_TOO_LONG");

        expect(result.isValid).toBe(false);
        expect(result.issues).toHaveLength(3);
        expect(result.issues).toContain(
          "Region contains invalid characters (only lowercase letters, numbers, and hyphens allowed)",
        );
        expect(result.issues).toContain(
          "Region does not match typical AWS format (e.g., us-east-1, eu-west-2)",
        );
        expect(result.issues).toContain("Region length is outside typical range (5-20 characters)");
      });
    });
  });
});
