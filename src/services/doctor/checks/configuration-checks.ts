/**
 * Configuration validation checks for AWS setup
 *
 * Provides AWS configuration file validation including config file accessibility,
 * profile completeness verification, and credentials file structure validation.
 * These checks depend on environment stage completion and validate the foundation
 * for subsequent authentication operations.
 *
 */

import { access, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { CheckExecutionError } from "../../../lib/diagnostic-errors.js";
import {
  ProfileManager,
  type AwsProfileConfig,
  type ProfileManagerOptions,
} from "../../profile-manager.js";
import type { CheckResult, DoctorContext, ICheck } from "../types.js";

/**
 * AWS config file existence and accessibility check
 *
 * Validates that the AWS configuration file (~/.aws/config) exists and is
 * accessible for reading. Provides specific guidance for configuration setup
 * when issues are detected.
 *
 * @public
 */
export class ConfigFileExistsCheck implements ICheck {
  /**
   * Unique identifier for this check
   */
  readonly id = "config-file-exists";

  /**
   * Human-readable name for this check
   */
  readonly name = "AWS Config File";

  /**
   * Description of what this check validates
   */
  readonly description = "Verifies AWS config file exists and is accessible";

  /**
   * Validation stage this check belongs to
   */
  readonly stage = "configuration" as const;

  /**
   * Execute the AWS config file accessibility check
   *
   * Attempts to access the standard AWS configuration file and validates
   * basic file structure and syntax. Provides detailed guidance for
   * configuration setup when issues are detected.
   *
   * @param _context - Shared execution context with environment results
   * @returns Promise resolving to check result with file accessibility details
   * @throws When file access validation fails unexpectedly
   */
  // Context parameter required by ICheck interface but unused for configuration file validation
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_context: DoctorContext): Promise<CheckResult> {
    try {
      const configFilePath = process.env.AWS_CONFIG_FILE ?? path.join(homedir(), ".aws", "config");

      try {
        await access(configFilePath);

        const configContent = await readFile(configFilePath, "utf8");
        const syntaxValidation = this.validateConfigSyntax(configContent);

        if (syntaxValidation.isValid) {
          return {
            status: "pass",
            message: "AWS config file is accessible and properly formatted",
            details: {
              configFilePath,
              fileSize: configContent.length,
              sectionsCount: syntaxValidation.sectionsCount,
            },
          };
        }

        return {
          status: "warn",
          message: "AWS config file has potential syntax issues",
          details: {
            configFilePath,
            fileSize: configContent.length,
            syntaxIssues: syntaxValidation.issues,
          },
          remediation: "Review AWS config file syntax. Use 'aws configure' to recreate if needed.",
        };
      } catch (error) {
        if (error instanceof Error && error.message.includes("ENOENT")) {
          return {
            status: "fail",
            message: "AWS config file not found",
            details: {
              configFilePath,
              expectedLocation: path.join(homedir(), ".aws", "config"),
            },
            remediation:
              "Run 'aws configure' or create AWS config file manually. See https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-files.html",
          };
        }

        if (error instanceof Error && error.message.includes("EACCES")) {
          return {
            status: "fail",
            message: "AWS config file exists but is not accessible",
            details: {
              configFilePath,
              error: "Permission denied",
            },
            remediation: "Check file permissions. Expected readable by current user.",
          };
        }

        throw error;
      }
    } catch (error) {
      throw new CheckExecutionError(
        "Failed to validate AWS config file accessibility",
        this.id,
        this.stage,
        error,
        { configFilePath: process.env.AWS_CONFIG_FILE ?? path.join(homedir(), ".aws", "config") },
      );
    }
  }

  /**
   * Validate basic AWS config file syntax
   *
   * @param content - Config file content to validate
   * @returns Validation result with issues and section count
   * @internal
   */
  private validateConfigSyntax(content: string): {
    isValid: boolean;
    sectionsCount: number;
    issues: string[];
  } {
    const issues: string[] = [];
    let sectionsCount = 0;
    let hasProfileSection = false;

    const lines = content.split("\n");

    for (const [index, line] of lines.entries()) {
      const lineResult = this.validateConfigLine(line, index + 1);

      if (lineResult.skip) {
        continue;
      }

      if (lineResult.isSection) {
        sectionsCount++;
        if (lineResult.isProfileSection) {
          hasProfileSection = true;
        }
        continue;
      }

      if (lineResult.error) {
        issues.push(lineResult.error);
      }
    }

    if (!hasProfileSection && sectionsCount > 0) {
      issues.push("No valid profile sections found");
    }

    return {
      isValid: issues.length === 0,
      sectionsCount,
      issues,
    };
  }

  /**
   * Validate a single config file line
   *
   * @param line - Line content to validate
   * @param lineNumber - Line number for error reporting
   * @returns Validation result for the line
   * @internal
   */
  private validateConfigLine(
    line: string,
    lineNumber: number,
  ): {
    skip: boolean;
    isSection: boolean;
    isProfileSection: boolean;
    error?: string;
  } {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return { skip: true, isSection: false, isProfileSection: false };
    }

    if (trimmedLine.startsWith("[") && trimmedLine.endsWith("]")) {
      const isProfileSection = trimmedLine.includes("profile ") || trimmedLine === "[default]";
      return { skip: false, isSection: true, isProfileSection };
    }

    if (trimmedLine.includes("=")) {
      const error = this.validateKeyValuePair(trimmedLine, lineNumber);
      return error
        ? { skip: false, isSection: false, isProfileSection: false, error }
        : { skip: false, isSection: false, isProfileSection: false };
    }

    return {
      skip: false,
      isSection: false,
      isProfileSection: false,
      error: `Line ${lineNumber}: Unrecognized line format`,
    };
  }

  /**
   * Validate a key-value pair format
   *
   * @param line - Line content containing key-value pair
   * @param lineNumber - Line number for error reporting
   * @returns Error message if invalid, undefined if valid
   * @internal
   */
  private validateKeyValuePair(line: string, lineNumber: number): string | undefined {
    const [key, value] = line.split("=", 2);
    if (!key?.trim() || !value?.trim()) {
      return `Line ${lineNumber}: Invalid key-value pair format`;
    }
    return undefined;
  }
}

/**
 * Profile validation and completeness check
 *
 * Uses ProfileManager to discover and validate AWS profiles for completeness
 * and proper configuration. Leverages existing profile discovery infrastructure
 * to identify configuration issues and missing required settings.
 *
 * @public
 */
export class ProfileValidationCheck implements ICheck {
  /**
   * Unique identifier for this check
   */
  readonly id = "profile-validation";

  /**
   * Human-readable name for this check
   */
  readonly name = "Profile Validation";

  /**
   * Description of what this check validates
   */
  readonly description = "Validates AWS profile completeness and configuration";

  /**
   * Validation stage this check belongs to
   */
  readonly stage = "configuration" as const;

  /**
   * Profile manager instance for profile operations
   */
  private readonly profileManager: ProfileManager;

  /**
   * Create a new profile validation check
   *
   * @param profileManagerOptions - Optional profile manager configuration
   */
  constructor(profileManagerOptions?: ProfileManagerOptions) {
    this.profileManager = new ProfileManager(profileManagerOptions);
  }

  /**
   * Execute the profile validation check
   *
   * Discovers available AWS profiles and validates their completeness including
   * required settings, SSO configuration, and profile accessibility. Provides
   * specific guidance for profile configuration issues.
   *
   * @param context - Shared execution context with previous stage results
   * @returns Promise resolving to check result with profile validation details
   * @throws When profile validation fails unexpectedly
   */
  async execute(context: DoctorContext): Promise<CheckResult> {
    try {
      const profiles = await this.profileManager.discoverProfiles();

      if (profiles.length === 0) {
        return {
          status: "fail",
          message: "No AWS profiles found",
          details: {
            profilesFound: 0,
            configuredProfiles: [],
          },
          remediation: "Configure AWS profiles using 'aws configure' or 'aws configure sso'",
        };
      }

      // Validate each discovered profile
      const profileValidationResults = profiles.map((profile) => this.validateProfile(profile));
      const incompleteProfiles = profileValidationResults.filter((result) => !result.isComplete);
      const profilesWithIssues = profileValidationResults.filter(
        (result) => result.issues.length > 0,
      );

      const hasTargetProfile = context.profile
        ? profiles.some((p) => p.name === context.profile)
        : true;

      if (!hasTargetProfile) {
        return {
          status: "fail",
          message: `Target profile '${context.profile}' not found`,
          details: {
            targetProfile: context.profile,
            availableProfiles: profiles.map((p) => p.name),
            profilesFound: profiles.length,
          },
          remediation: `Configure profile '${context.profile}' or use an existing profile`,
        };
      }

      if (incompleteProfiles.length === 0 && profilesWithIssues.length === 0) {
        return {
          status: "pass",
          message: `${profiles.length} AWS profiles found and properly configured`,
          details: {
            profilesFound: profiles.length,
            configuredProfiles: profiles.map((p) => p.name),
            targetProfile: context.profile,
          },
        };
      }

      // Some profiles have issues
      const severity = incompleteProfiles.length > profiles.length / 2 ? "fail" : "warn";

      return {
        status: severity,
        message: `${incompleteProfiles.length} profiles have configuration issues`,
        details: {
          profilesFound: profiles.length,
          incompleteProfiles: incompleteProfiles.map((r) => r.profileName),
          profileIssues: profilesWithIssues.map((r) => ({
            profile: r.profileName,
            issues: r.issues,
          })),
        },
        remediation:
          "Review profile configurations and use 'aws configure' to fix incomplete profiles",
      };
    } catch (error) {
      throw new CheckExecutionError(
        "Failed to validate AWS profile configuration",
        this.id,
        this.stage,
        error,
        { targetProfile: context.profile },
      );
    }
  }

  /**
   * Validate individual profile completeness
   *
   * @param profile - Profile configuration to validate
   * @returns Validation result with completeness and issues
   * @internal
   */
  private validateProfile(profile: AwsProfileConfig): {
    profileName: string;
    isComplete: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    // Check for required basic settings
    if (!profile.region) {
      issues.push("Missing region configuration");
    }

    // Validate SSO profile completeness
    if (profile.ssoSession || profile.ssoStartUrl) {
      if (!profile.ssoSession && !profile.ssoStartUrl) {
        issues.push("Incomplete SSO configuration - missing start URL or session");
      }

      if (profile.ssoSession && !profile.ssoAccountId) {
        issues.push("SSO profile missing account ID");
      }

      if (profile.ssoSession && !profile.ssoRoleName) {
        issues.push("SSO profile missing role name");
      }
    }

    // Check for credential-based profile requirements
    if (
      !profile.ssoSession &&
      !profile.ssoStartUrl &&
      !profile.awsAccessKeyId &&
      !profile.sourceProfile
    ) {
      issues.push("Missing credentials - no access key or source profile");
    }

    return {
      profileName: profile.name,
      isComplete: issues.length === 0,
      issues,
    };
  }
}

/**
 * AWS credentials file structure validation check
 *
 * Validates that the AWS credentials file exists, is accessible, and contains
 * properly formatted credential information. Provides guidance for credential
 * setup and file structure issues.
 *
 * @public
 */
export class CredentialsFileCheck implements ICheck {
  /**
   * Unique identifier for this check
   */
  readonly id = "credentials-file";

  /**
   * Human-readable name for this check
   */
  readonly name = "AWS Credentials File";

  /**
   * Description of what this check validates
   */
  readonly description = "Verifies AWS credentials file structure and accessibility";

  /**
   * Validation stage this check belongs to
   */
  readonly stage = "configuration" as const;

  /**
   * Execute the AWS credentials file validation check
   *
   * Checks for credentials file existence, accessibility, and basic structure
   * validation. Handles cases where credentials file may not be required
   * for SSO-only configurations.
   *
   * @param _context - Shared execution context with previous stage results
   * @returns Promise resolving to check result with credentials file details
   * @throws When credentials file validation fails unexpectedly
   */
  // Context parameter required by ICheck interface but unused for credentials file validation
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_context: DoctorContext): Promise<CheckResult> {
    try {
      const credentialsFilePath =
        process.env.AWS_SHARED_CREDENTIALS_FILE ?? path.join(homedir(), ".aws", "credentials");

      try {
        // Check file accessibility
        await access(credentialsFilePath);

        // Read and validate file structure
        const credentialsContent = await readFile(credentialsFilePath, "utf8");
        const structureValidation = this.validateCredentialsStructure(credentialsContent);

        if (structureValidation.isValid) {
          return {
            status: "pass",
            message: "AWS credentials file is accessible and properly structured",
            details: {
              credentialsFilePath,
              fileSize: credentialsContent.length,
              profilesFound: structureValidation.profilesCount,
            },
          };
        }

        // File exists but has structure issues
        return {
          status: "warn",
          message: "AWS credentials file has structural issues",
          details: {
            credentialsFilePath,
            fileSize: credentialsContent.length,
            profilesFound: structureValidation.profilesCount,
            structureIssues: structureValidation.issues,
          },
          remediation:
            "Review credentials file format. Consider using 'aws configure' to recreate profiles.",
        };
      } catch (error) {
        if (error instanceof Error && error.message.includes("ENOENT")) {
          // Credentials file not found - this may be acceptable for SSO-only setups
          return {
            status: "warn",
            message:
              "AWS credentials file not found (may be acceptable for SSO-only configuration)",
            details: {
              credentialsFilePath,
              expectedLocation: path.join(homedir(), ".aws", "credentials"),
            },
            remediation:
              "For SSO profiles, credentials file is optional. For access key profiles, run 'aws configure'.",
          };
        }

        if (error instanceof Error && error.message.includes("EACCES")) {
          return {
            status: "fail",
            message: "AWS credentials file exists but is not accessible",
            details: {
              credentialsFilePath,
              error: "Permission denied",
            },
            remediation:
              "Check file permissions. Credentials file should be readable by current user only.",
          };
        }

        throw error;
      }
    } catch (error) {
      throw new CheckExecutionError(
        "Failed to validate AWS credentials file",
        this.id,
        this.stage,
        error,
        {
          credentialsFilePath:
            process.env.AWS_SHARED_CREDENTIALS_FILE ?? path.join(homedir(), ".aws", "credentials"),
        },
      );
    }
  }

  /**
   * Validate AWS credentials file structure
   *
   * @param content - Credentials file content to validate
   * @returns Validation result with issues and profile count
   * @internal
   */
  private validateCredentialsStructure(content: string): {
    isValid: boolean;
    profilesCount: number;
    issues: string[];
  } {
    const issues: string[] = [];
    let profilesCount = 0;
    let currentProfile = "";
    const profileCredentials = new Map<string, Set<string>>();

    const lines = content.split("\n");

    for (const [index, line] of lines.entries()) {
      const lineResult = this.validateCredentialsLine(line, index + 1, currentProfile);

      if (lineResult.skip) {
        continue;
      }

      if (lineResult.isProfileSection) {
        profilesCount++;
        currentProfile = lineResult.profileName!;
        profileCredentials.set(currentProfile, new Set());
        continue;
      }

      if (lineResult.credentialKey) {
        profileCredentials.get(currentProfile)?.add(lineResult.credentialKey);
      }

      if (lineResult.error) {
        issues.push(lineResult.error);
      }
    }

    // Validate profile completeness
    const completenessIssues = this.validateProfileCompleteness(profileCredentials);
    issues.push(...completenessIssues);

    return {
      isValid: issues.length === 0,
      profilesCount,
      issues,
    };
  }

  /**
   * Validate a single credentials file line
   *
   * @param line - Line content to validate
   * @param lineNumber - Line number for error reporting
   * @param currentProfile - Current profile context
   * @returns Validation result for the line
   * @internal
   */
  private validateCredentialsLine(
    line: string,
    lineNumber: number,
    currentProfile: string,
  ): {
    skip: boolean;
    isProfileSection: boolean;
    profileName?: string;
    credentialKey?: string;
    error?: string;
  } {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return { skip: true, isProfileSection: false };
    }

    // Check for profile sections
    if (trimmedLine.startsWith("[") && trimmedLine.endsWith("]")) {
      const profileName = trimmedLine.slice(1, -1);
      return { skip: false, isProfileSection: true, profileName };
    }

    // Check for credential key-value pairs
    if (trimmedLine.includes("=")) {
      const [key, value] = trimmedLine.split("=", 2);
      const cleanKey = key?.trim();
      const cleanValue = value?.trim();

      if (!cleanKey || !cleanValue) {
        return {
          skip: false,
          isProfileSection: false,
          error: `Line ${lineNumber}: Invalid credential format`,
        };
      }

      if (!currentProfile) {
        return {
          skip: false,
          isProfileSection: false,
          error: `Line ${lineNumber}: Credential outside of profile section`,
        };
      }

      return { skip: false, isProfileSection: false, credentialKey: cleanKey };
    }

    return {
      skip: false,
      isProfileSection: false,
      error: `Line ${lineNumber}: Unrecognized line format`,
    };
  }

  /**
   * Validate completeness of all profiles' credentials
   *
   * @param profileCredentials - Map of profile names to their credential keys
   * @returns Array of validation issues
   * @internal
   */
  private validateProfileCompleteness(profileCredentials: Map<string, Set<string>>): string[] {
    const issues: string[] = [];

    for (const [profileName, credentials] of profileCredentials.entries()) {
      if (credentials.has("aws_access_key_id") && !credentials.has("aws_secret_access_key")) {
        issues.push(`Profile '${profileName}': Missing aws_secret_access_key`);
      }

      if (credentials.has("aws_secret_access_key") && !credentials.has("aws_access_key_id")) {
        issues.push(`Profile '${profileName}': Missing aws_access_key_id`);
      }
    }

    return issues;
  }
}
