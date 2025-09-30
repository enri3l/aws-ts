/**
 * @module authentication-checks
 * Authentication validation checks for AWS credentials and tokens
 *
 * Provides authentication validation leveraging existing
 * authentication infrastructure including credential validation, SSO token
 * status checking, and profile switching capabilities. These checks depend
 * on configuration stage completion and validate authentication readiness.
 *
 */

import type { ProfileInfo } from "../../../lib/auth-schemas.js";
import { CheckExecutionError } from "../../../lib/diagnostic-errors.js";
import type { AuthServiceOptions } from "../../auth-service.js";
import { AuthService } from "../../auth-service.js";
import type { TokenManagerOptions } from "../../token-manager.js";
import { TokenManager } from "../../token-manager.js";
import type { CheckResult, DoctorContext, ICheck } from "../types.js";
import { BaseCheck } from "./base-check.js";

/**
 * Credential validation check using existing AuthService
 *
 * Leverages AuthService.getStatus() to validate current credential configuration
 * and authentication state. Provides validation through the
 * existing authentication infrastructure without duplicating validation logic.
 *
 * @public
 */
export class CredentialValidationCheck extends BaseCheck {
  /**
   * Unique identifier for this check
   */
  readonly id = "credential-validation";

  /**
   * Human-readable name for this check
   */
  readonly name = "Credential Validation";

  /**
   * Description of what this check validates
   */
  readonly description = "Validates AWS credential configuration and authentication status";

  /**
   * Validation stage this check belongs to
   */
  readonly stage = "authentication" as const;

  /**
   * Authentication service for credential validation
   */
  private readonly authService: AuthService;

  /**
   * Create a new credential validation check
   *
   * @param authServiceOptions - Optional authentication service configuration
   */
  constructor(authServiceOptions?: AuthServiceOptions) {
    super();
    this.authService = new AuthService({
      enableProgressIndicators: false, // Disable UI for diagnostic checks
      ...authServiceOptions,
    });
  }

  /**
   * Run the credential validation check
   *
   * Uses AuthService.getStatus() to perform credential validation
   * including profile verification, token status, and authentication readiness.
   * Provides detailed validation results and specific guidance for issues.
   *
   * @param context - Shared execution context with previous stage results
   * @returns Promise resolving to check result with credential validation details
   */
  protected async run(context: DoctorContext): Promise<CheckResult> {
    // Use AuthService.getStatus() for validation
    const authStatusInput = {
      profile: context.profile,
      detailed: context.detailed ?? false,
      allProfiles: false,
    };

    const authStatus = await this.authService.getStatus(authStatusInput);

    // Analyze overall authentication status
    if (authStatus.authenticated) {
      const activeProfile = authStatus.activeProfile ?? "default";
      const profileInfo = authStatus.profiles.find((p) => p.name === activeProfile);

      return {
        status: "pass",
        message: `Credentials are valid for profile '${activeProfile}'`,
        details: {
          activeProfile,
          profileType: profileInfo?.type,
          credentialsValid: profileInfo?.credentialsValid ?? false,
          region: profileInfo?.region,
          tokenExpiry: profileInfo?.tokenExpiry,
          totalProfiles: authStatus.profiles.length,
        },
      };
    }

    // Authentication failed - analyze specific issues
    const targetProfile = context.profile ?? authStatus.activeProfile ?? "default";
    const profileInfo = authStatus.profiles.find((p) => p.name === targetProfile);

    if (!profileInfo) {
      return {
        status: "fail",
        message: `Profile '${targetProfile}' not found`,
        details: {
          targetProfile,
          availableProfiles: authStatus.profiles.map((p) => p.name),
          authenticated: false,
        },
        remediation: `Configure profile '${targetProfile}' using 'aws configure' or 'aws configure sso'`,
      };
    }

    if (!profileInfo.credentialsValid) {
      const remediation =
        profileInfo.type === "sso"
          ? `Run 'aws sso login --profile ${targetProfile}' to authenticate`
          : `Verify credentials for profile '${targetProfile}' using 'aws configure'`;

      return {
        status: "fail",
        message: `Credentials are invalid for profile '${targetProfile}'`,
        details: {
          targetProfile,
          profileType: profileInfo.type,
          credentialsValid: false,
          tokenExpiry: profileInfo.tokenExpiry,
          authenticated: false,
        },
        remediation,
      };
    }

    // Credentials exist but authentication failed for other reasons
    return {
      status: "fail",
      message: `Authentication failed for profile '${targetProfile}'`,
      details: {
        targetProfile,
        profileType: profileInfo.type,
        credentialsValid: profileInfo.credentialsValid,
        authenticated: false,
        awsCliInstalled: authStatus.awsCliInstalled,
      },
      remediation: "Check AWS service connectivity and verify profile configuration",
    };
  }
}

/**
 * SSO token expiry validation check
 *
 * Uses TokenManager to check SSO token status including expiry detection
 * and warning for tokens approaching expiration. Provides proactive
 * notification for token refresh requirements.
 *
 * @public
 */
export class SsoTokenExpiryCheck implements ICheck {
  /**
   * Unique identifier for this check
   */
  readonly id = "sso-token-expiry";

  /**
   * Human-readable name for this check
   */
  readonly name = "SSO Token Expiry";

  /**
   * Description of what this check validates
   */
  readonly description = "Checks SSO token expiry status and warns of approaching expiration";

  /**
   * Validation stage this check belongs to
   */
  readonly stage = "authentication" as const;

  /**
   * Token manager for SSO token operations
   */
  private readonly tokenManager: TokenManager;

  /**
   * Create a new SSO token expiry check
   *
   * @param tokenManagerOptions - Optional token manager configuration
   */
  constructor(tokenManagerOptions?: TokenManagerOptions) {
    this.tokenManager = new TokenManager({
      ...tokenManagerOptions,
    });
  }

  /**
   * Execute the SSO token expiry validation check
   *
   * Uses TokenManager.getTokenStatus() and checkTokenExpiry() to validate
   * token status for the target profile and provide early warning for
   * tokens approaching expiration.
   *
   * @param context - Shared execution context with previous stage results
   * @returns Promise resolving to check result with token expiry details
   * @throws When token expiry validation fails unexpectedly
   */
  async execute(context: DoctorContext): Promise<CheckResult> {
    try {
      // Check for expired tokens across all profiles
      const expiredTokens = await this.tokenManager.checkTokenExpiry();

      if (context.profile) {
        // Check specific profile token status
        const tokenStatus = await this.tokenManager.getTokenStatus(context.profile);

        if (!tokenStatus.hasToken) {
          return {
            status: "warn",
            message: `No SSO token found for profile '${context.profile}'`,
            details: {
              profileName: tokenStatus.profileName,
              hasToken: false,
              isValid: false,
            },
            remediation: `Run 'aws sso login --profile ${context.profile}' to authenticate`,
          };
        }

        if (!tokenStatus.isValid) {
          return {
            status: "fail",
            message: `SSO token has expired for profile '${context.profile}'`,
            details: {
              profileName: tokenStatus.profileName,
              hasToken: true,
              isValid: false,
              expiresAt: tokenStatus.expiresAt,
              startUrl: tokenStatus.startUrl,
            },
            remediation: `Run 'aws sso login --profile ${context.profile}' to refresh the token`,
          };
        }

        if (tokenStatus.isNearExpiry) {
          const timeUntilExpiry = tokenStatus.timeUntilExpiry
            ? Math.round(tokenStatus.timeUntilExpiry / (1000 * 60 * 60))
            : 0;

          return {
            status: "warn",
            message: `SSO token for profile '${context.profile}' expires in ${timeUntilExpiry} hours`,
            details: {
              profileName: tokenStatus.profileName,
              hasToken: true,
              isValid: true,
              isNearExpiry: true,
              expiresAt: tokenStatus.expiresAt,
              timeUntilExpiry: tokenStatus.timeUntilExpiry,
            },
            remediation: `Consider refreshing the token with 'aws sso login --profile ${context.profile}'`,
          };
        }

        // Token is valid and not near expiry
        return {
          status: "pass",
          message: `SSO token for profile '${context.profile}' is valid`,
          details: {
            profileName: tokenStatus.profileName,
            hasToken: true,
            isValid: true,
            isNearExpiry: false,
            expiresAt: tokenStatus.expiresAt,
            timeUntilExpiry: tokenStatus.timeUntilExpiry,
          },
        };
      }

      // No specific profile - check for any expired tokens
      if (expiredTokens.length === 0) {
        return {
          status: "pass",
          message: "No expired SSO tokens found",
          details: {
            expiredTokensCount: 0,
            checkedProfiles: expiredTokens.length,
          },
        };
      }

      // Some tokens are expired
      const criticalExpired = expiredTokens.filter((token) => token.status === "expired");
      const nearExpiry = expiredTokens.filter((token) => token.status === "near-expiry");

      if (criticalExpired.length > 0) {
        return {
          status: "fail",
          message: `${criticalExpired.length} SSO tokens have expired`,
          details: {
            expiredTokensCount: criticalExpired.length,
            nearExpiryCount: nearExpiry.length,
            expiredProfiles: criticalExpired.map((token) => token.profileName),
            nearExpiryProfiles: nearExpiry.map((token) => token.profileName),
          },
          remediation: "Run 'aws sso login' for each expired profile to refresh tokens",
        };
      }

      // Only warnings for near expiry
      return {
        status: "warn",
        message: `${nearExpiry.length} SSO tokens are approaching expiration`,
        details: {
          expiredTokensCount: 0,
          nearExpiryCount: nearExpiry.length,
          nearExpiryProfiles: nearExpiry.map((token) => token.profileName),
        },
        remediation: "Consider refreshing tokens that are approaching expiration",
      };
    } catch (error) {
      throw new CheckExecutionError(
        "Failed to validate SSO token expiry status",
        this.id,
        this.stage,
        error,
        { targetProfile: context.profile },
      );
    }
  }
}

/**
 * Profile switching capability validation check
 *
 * Validates that profile switching works correctly by testing profile
 * accessibility and configuration consistency. Ensures that the
 * authentication system can properly switch between configured profiles.
 *
 * @public
 */
export class ProfileSwitchCheck implements ICheck {
  /**
   * Unique identifier for this check
   */
  readonly id = "profile-switch";

  /**
   * Human-readable name for this check
   */
  readonly name = "Profile Switching";

  /**
   * Description of what this check validates
   */
  readonly description = "Validates profile switching capability and configuration consistency";

  /**
   * Validation stage this check belongs to
   */
  readonly stage = "authentication" as const;

  /**
   * Authentication service for profile operations
   */
  private readonly authService: AuthService;

  /**
   * Create a new profile switching validation check
   *
   * @param authServiceOptions - Optional authentication service configuration
   */
  constructor(authServiceOptions?: AuthServiceOptions) {
    this.authService = new AuthService({
      enableProgressIndicators: false, // Disable UI for diagnostic checks
      ...authServiceOptions,
    });
  }

  /**
   * Execute the profile switching validation check
   *
   * Tests profile switching capability by validating profile accessibility
   * and configuration consistency. Provides validation without actually
   * changing the active profile to avoid side effects.
   *
   * @param context - Shared execution context with previous stage results
   * @returns Promise resolving to check result with profile switching details
   * @throws When profile switching validation fails unexpectedly
   */
  async execute(context: DoctorContext): Promise<CheckResult> {
    try {
      // Get all available profiles for validation
      const authStatus = await this.authService.getStatus({
        allProfiles: true,
        detailed: false,
      });

      const availableProfiles = authStatus.profiles;
      const currentActiveProfile = authStatus.activeProfile;

      if (availableProfiles.length === 0) {
        return {
          status: "fail",
          message: "No profiles available for switching",
          details: {
            availableProfiles: 0,
            currentActiveProfile,
          },
          remediation:
            "Configure at least one AWS profile using 'aws configure' or 'aws configure sso'",
        };
      }

      if (availableProfiles.length === 1) {
        return this.validateSingleProfile(
          availableProfiles[0] as ProfileInfo,
          context,
          currentActiveProfile,
        );
      }

      return this.validateMultipleProfiles(availableProfiles, context, currentActiveProfile);
    } catch (error) {
      throw new CheckExecutionError(
        "Failed to validate profile switching capability",
        this.id,
        this.stage,
        error,
        { targetProfile: context.profile },
      );
    }
  }

  /**
   * Validate single profile scenario
   *
   * @param singleProfile - The single available profile
   * @param context - Execution context
   * @param currentActiveProfile - Current active profile name
   * @returns Check result for single profile validation
   * @internal
   */
  private validateSingleProfile(
    singleProfile: ProfileInfo,
    context: DoctorContext,
    currentActiveProfile: string | undefined,
  ): CheckResult {
    if (!singleProfile) {
      return {
        status: "fail",
        message: "Profile array inconsistency detected",
      };
    }

    // If a target profile is specified, check if it matches and validate credentials
    if (context.profile) {
      return this.validateTargetProfile(singleProfile, context, currentActiveProfile, true);
    }

    return {
      status: "pass",
      message: `Single profile '${singleProfile.name}' is configured and accessible`,
      details: {
        availableProfiles: 1,
        currentActiveProfile,
        profileName: singleProfile.name,
        profileType: singleProfile.type,
        credentialsValid: singleProfile.credentialsValid,
      },
    };
  }

  /**
   * Validate multiple profiles scenario
   *
   * @param availableProfiles - All available profiles
   * @param context - Execution context
   * @param currentActiveProfile - Current active profile name
   * @returns Check result for multiple profiles validation
   * @internal
   */
  private validateMultipleProfiles(
    availableProfiles: ProfileInfo[],
    context: DoctorContext,
    currentActiveProfile: string | undefined,
  ): CheckResult {
    const validProfiles = availableProfiles.filter((profile) => profile.credentialsValid);
    const invalidProfiles = availableProfiles.filter((profile) => !profile.credentialsValid);

    // Check if target profile is specified and valid
    if (context.profile) {
      const targetProfile = availableProfiles.find((p) => p.name === context.profile);

      if (!targetProfile) {
        return {
          status: "fail",
          message: `Target profile '${context.profile}' not found`,
          details: {
            targetProfile: context.profile,
            availableProfiles: availableProfiles.length,
            profileNames: availableProfiles.map((p) => p.name),
          },
          remediation: `Use one of the available profiles: ${availableProfiles.map((p) => p.name).join(", ")}`,
        };
      }

      return this.validateTargetProfile(
        targetProfile,
        context,
        currentActiveProfile,
        false,
        validProfiles.length,
      );
    }

    return this.assessOverallCapability(
      availableProfiles,
      validProfiles,
      invalidProfiles,
      currentActiveProfile,
    );
  }

  /**
   * Validate target profile credentials and accessibility
   *
   * @param targetProfile - Target profile to validate
   * @param context - Execution context
   * @param currentActiveProfile - Current active profile name
   * @param isSingle - Whether this is single profile validation
   * @param validProfilesCount - Count of valid profiles (for multiple profile scenario)
   * @returns Check result for target profile validation
   * @internal
   */
  private validateTargetProfile(
    targetProfile: ProfileInfo,
    context: DoctorContext,
    currentActiveProfile: string | undefined,
    isSingle: boolean,
    validProfilesCount?: number,
  ): CheckResult {
    if (isSingle && targetProfile.name !== context.profile) {
      return {
        status: "fail",
        message: `Target profile '${context.profile}' not found`,
        details: {
          targetProfile: context.profile,
          availableProfiles: 1,
          profileNames: [targetProfile.name],
        },
        remediation: `Use the available profile: ${targetProfile.name}`,
      };
    }

    if (!targetProfile.credentialsValid) {
      const remediation =
        targetProfile.type === "sso"
          ? `Run 'aws sso login --profile ${context.profile}' to authenticate`
          : `Verify credentials for profile '${context.profile}' using 'aws configure'`;

      return {
        status: "fail",
        message: `Target profile '${context.profile}' has invalid credentials`,
        details: {
          targetProfile: context.profile,
          profileType: targetProfile.type,
          credentialsValid: false,
          currentActiveProfile,
        },
        remediation,
      };
    }

    // Target profile is valid
    const baseDetails = {
      targetProfile: context.profile,
      profileType: targetProfile.type,
      credentialsValid: true,
      currentActiveProfile,
    };

    const details = isSingle
      ? { ...baseDetails, availableProfiles: 1 }
      : {
          ...baseDetails,
          availableProfiles: validProfilesCount,
          validProfiles: validProfilesCount,
        };

    return {
      status: "pass",
      message: `Profile switching to '${context.profile}' is available`,
      details,
    };
  }

  /**
   * Assess overall profile switching capability
   *
   * @param availableProfiles - All available profiles
   * @param validProfiles - Profiles with valid credentials
   * @param invalidProfiles - Profiles with invalid credentials
   * @param currentActiveProfile - Current active profile name
   * @returns Check result for overall capability assessment
   * @internal
   */
  private assessOverallCapability(
    availableProfiles: ProfileInfo[],
    validProfiles: ProfileInfo[],
    invalidProfiles: ProfileInfo[],
    currentActiveProfile: string | undefined,
  ): CheckResult {
    if (validProfiles.length === availableProfiles.length) {
      return {
        status: "pass",
        message: `All ${availableProfiles.length} profiles are configured and accessible for switching`,
        details: {
          availableProfiles: availableProfiles.length,
          validProfiles: validProfiles.length,
          invalidProfiles: 0,
          currentActiveProfile,
          profileNames: availableProfiles.map((p) => p.name),
        },
      };
    }

    if (validProfiles.length === 0) {
      return {
        status: "fail",
        message: "No profiles have valid credentials for switching",
        details: {
          availableProfiles: availableProfiles.length,
          validProfiles: 0,
          invalidProfiles: invalidProfiles.length,
          invalidProfileNames: invalidProfiles.map((p) => p.name),
        },
        remediation:
          "Authenticate profiles using 'aws sso login' or verify credential configuration",
      };
    }

    // Some profiles are valid, some are not
    return {
      status: "warn",
      message: `${invalidProfiles.length} of ${availableProfiles.length} profiles have credential issues`,
      details: {
        availableProfiles: availableProfiles.length,
        validProfiles: validProfiles.length,
        invalidProfiles: invalidProfiles.length,
        validProfileNames: validProfiles.map((p) => p.name),
        invalidProfileNames: invalidProfiles.map((p) => p.name),
        currentActiveProfile,
      },
      remediation: "Fix credential issues for invalid profiles to enable full switching capability",
    };
  }
}
