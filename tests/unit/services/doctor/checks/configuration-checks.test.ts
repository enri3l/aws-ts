/**
 * Unit tests for configuration validation checks
 *
 * Tests AWS config file validation, profile completeness verification, and
 * credentials file structure validation with comprehensive mocking strategies.
 */

import * as fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckExecutionError } from "../../../../../src/lib/diagnostic-errors.js";
import {
  ConfigFileExistsCheck,
  CredentialsFileCheck,
  ProfileValidationCheck,
} from "../../../../../src/services/doctor/checks/configuration-checks.js";
import type { DoctorContext } from "../../../../../src/services/doctor/types.js";
import { ProfileManager } from "../../../../../src/services/profile-manager.js";

// Mock external dependencies
vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/home/test"),
}));

vi.mock("../../../../../src/services/profile-manager.js", () => ({
  ProfileManager: vi.fn(),
}));

const mockAccess = vi.fn();
const mockReadFile = vi.fn();
const mockProfileManager = {
  discoverProfiles: vi.fn(),
  profileExists: vi.fn(),
  getProfileInfo: vi.fn(),
  switchProfile: vi.fn(),
};

describe("Configuration Checks", () => {
  let context: DoctorContext;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default context
    context = {
      profile: "test-profile",
      detailed: false,
    };

    // Setup module mocks
    vi.mocked(fs.access).mockImplementation(mockAccess);
    vi.mocked(fs.readFile).mockImplementation(mockReadFile);

    vi.mocked(ProfileManager).mockReturnValue(mockProfileManager as any);
  });

  describe("ConfigFileExistsCheck", () => {
    let configFileCheck: ConfigFileExistsCheck;

    beforeEach(() => {
      configFileCheck = new ConfigFileExistsCheck();
    });

    describe("properties", () => {
      it("should have correct metadata", () => {
        expect(configFileCheck.id).toBe("config-file-exists");
        expect(configFileCheck.name).toBe("AWS Config File");
        expect(configFileCheck.description).toBe(
          "Verifies AWS config file exists and is accessible",
        );
        expect(configFileCheck.stage).toBe("configuration");
      });
    });

    describe("execute", () => {
      it("should pass for valid config file", async () => {
        const validConfig = `[default]
region = us-east-1
output = json

[profile production]
region = us-west-2
output = table`;

        mockAccess.mockResolvedValue();
        mockReadFile.mockResolvedValue(validConfig);

        const result = await configFileCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.message).toBe("AWS config file is accessible and properly formatted");
        expect(result.details).toEqual({
          configFilePath: "/home/test/.aws/config",
          fileSize: validConfig.length,
          sectionsCount: 2,
        });
      });

      it("should pass for config file with comments", async () => {
        const configWithComments = `# AWS Configuration
[default]
region = us-east-1
# Default output format
output = json

# Production profile
[profile production]
region = us-west-2
output = table`;

        mockAccess.mockResolvedValue();
        mockReadFile.mockResolvedValue(configWithComments);

        const result = await configFileCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.details?.sectionsCount).toBe(2);
      });

      it("should warn for config file with syntax issues", async () => {
        const invalidConfig = `[default]
region = us-east-1
invalid_line_without_equals
= missing_key

[profile production
region = us-west-2`;

        mockAccess.mockResolvedValue();
        mockReadFile.mockResolvedValue(invalidConfig);

        const result = await configFileCheck.execute(context);

        expect(result.status).toBe("warn");
        expect(result.message).toBe("AWS config file has potential syntax issues");
        expect(result.details?.syntaxIssues).toEqual([
          "Line 3: Unrecognized line format",
          "Line 4: Invalid key-value pair format",
          "Line 6: Unrecognized line format",
        ]);
        expect(result.remediation).toContain("Review AWS config file syntax");
      });

      it("should fail when config file not found", async () => {
        const enoentError = new Error("ENOENT: no such file or directory");
        mockAccess.mockRejectedValue(enoentError);

        const result = await configFileCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("AWS config file not found");
        expect(result.details).toEqual({
          configFilePath: "/home/test/.aws/config",
          expectedLocation: "/home/test/.aws/config",
        });
        expect(result.remediation).toContain("Run 'aws configure'");
      });

      it("should fail when config file access denied", async () => {
        const eaccesError = new Error("EACCES: permission denied");
        mockAccess.mockRejectedValue(eaccesError);

        const result = await configFileCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("AWS config file exists but is not accessible");
        expect(result.details).toEqual({
          configFilePath: "/home/test/.aws/config",
          error: "Permission denied",
        });
        expect(result.remediation).toContain("Check file permissions");
      });

      it("should use custom config file path from environment", async () => {
        const customPath = "/custom/aws/config";
        process.env.AWS_CONFIG_FILE = customPath;

        const validConfig = "[default]\nregion = us-east-1";
        mockAccess.mockResolvedValue();
        mockReadFile.mockResolvedValue(validConfig);

        const result = await configFileCheck.execute(context);

        expect(result.details?.configFilePath).toBe(customPath);

        // Cleanup
        delete process.env.AWS_CONFIG_FILE;
      });

      it("should throw CheckExecutionError for unexpected errors", async () => {
        const unexpectedError = new Error("Unexpected file system error");
        mockAccess.mockRejectedValue(unexpectedError);

        await expect(configFileCheck.execute(context)).rejects.toThrow(CheckExecutionError);
      });
    });

    describe("validateConfigSyntax", () => {
      it("should validate correct config syntax", () => {
        const validateConfigSyntax = (configFileCheck as any).validateConfigSyntax.bind(
          configFileCheck,
        );

        const validConfig = `[default]
region = us-east-1
output = json

[profile prod]
region = us-west-2`;

        const result = validateConfigSyntax(validConfig);

        expect(result.isValid).toBe(true);
        expect(result.sectionsCount).toBe(2);
        expect(result.issues).toEqual([]);
      });

      it("should detect missing profile sections", () => {
        const validateConfigSyntax = (configFileCheck as any).validateConfigSyntax.bind(
          configFileCheck,
        );

        const configWithoutProfiles = `[section]
some_key = some_value`;

        const result = validateConfigSyntax(configWithoutProfiles);

        expect(result.isValid).toBe(false);
        expect(result.issues).toContain("No valid profile sections found");
      });

      it("should handle empty config file", () => {
        const validateConfigSyntax = (configFileCheck as any).validateConfigSyntax.bind(
          configFileCheck,
        );

        const result = validateConfigSyntax("");

        expect(result.isValid).toBe(true);
        expect(result.sectionsCount).toBe(0);
        expect(result.issues).toEqual([]);
      });

      it("should handle config file with only comments", () => {
        const validateConfigSyntax = (configFileCheck as any).validateConfigSyntax.bind(
          configFileCheck,
        );

        const configOnlyComments = `# AWS Configuration
# This is a comment
# Another comment`;

        const result = validateConfigSyntax(configOnlyComments);

        expect(result.isValid).toBe(true);
        expect(result.sectionsCount).toBe(0);
      });
    });
  });

  describe("ProfileValidationCheck", () => {
    let profileValidationCheck: ProfileValidationCheck;

    beforeEach(() => {
      profileValidationCheck = new ProfileValidationCheck();
    });

    describe("properties", () => {
      it("should have correct metadata", () => {
        expect(profileValidationCheck.id).toBe("profile-validation");
        expect(profileValidationCheck.name).toBe("Profile Validation");
        expect(profileValidationCheck.description).toBe(
          "Validates AWS profile completeness and configuration",
        );
        expect(profileValidationCheck.stage).toBe("configuration");
      });
    });

    describe("execute", () => {
      it("should pass for valid profiles", async () => {
        const validProfiles = [
          {
            name: "default",
            region: "us-east-1",
            awsAccessKeyId: "AKIA...",
            awsSecretAccessKey: "secret",
          },
          {
            name: "production",
            region: "us-west-2",
            ssoSession: "prod-session",
            ssoAccountId: "123456789012",
            ssoRoleName: "AdminRole",
          },
          {
            name: "test-profile",
            region: "us-east-1",
            awsAccessKeyId: "AKIA...",
            awsSecretAccessKey: "secret",
          },
        ];

        mockProfileManager.discoverProfiles.mockResolvedValue(validProfiles);

        const result = await profileValidationCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.message).toBe("3 AWS profiles found and properly configured");
        expect(result.details).toEqual({
          profilesFound: 3,
          configuredProfiles: ["default", "production", "test-profile"],
          targetProfile: "test-profile",
        });
      });

      it("should fail when no profiles found", async () => {
        mockProfileManager.discoverProfiles.mockResolvedValue([]);

        const result = await profileValidationCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("No AWS profiles found");
        expect(result.details).toEqual({
          profilesFound: 0,
          configuredProfiles: [],
        });
        expect(result.remediation).toContain("Configure AWS profiles");
      });

      it("should fail when target profile not found", async () => {
        const profiles = [
          { name: "default", region: "us-east-1" },
          { name: "production", region: "us-west-2" },
        ];

        mockProfileManager.discoverProfiles.mockResolvedValue(profiles);

        const contextWithSpecificProfile = { ...context, profile: "staging" };
        const result = await profileValidationCheck.execute(contextWithSpecificProfile);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("Target profile 'staging' not found");
        expect(result.details).toEqual({
          targetProfile: "staging",
          availableProfiles: ["default", "production"],
          profilesFound: 2,
        });
        expect(result.remediation).toContain("Configure profile 'staging'");
      });

      it("should warn for profiles with minor issues", async () => {
        const profilesWithIssues = [
          {
            name: "complete",
            region: "us-east-1",
            awsAccessKeyId: "AKIA...",
            awsSecretAccessKey: "secret",
          },
          {
            name: "missing-region",
            awsAccessKeyId: "AKIA...",
            awsSecretAccessKey: "secret",
          },
          {
            name: "test-profile",
            region: "us-east-1",
            awsAccessKeyId: "AKIA...",
            awsSecretAccessKey: "secret",
          },
        ];

        mockProfileManager.discoverProfiles.mockResolvedValue(profilesWithIssues);

        const result = await profileValidationCheck.execute(context);

        expect(result.status).toBe("warn");
        expect(result.message).toBe("1 profiles have configuration issues");
        expect(result.details?.incompleteProfiles).toEqual(["missing-region"]);
        expect(result.details?.profileIssues).toEqual([
          {
            profile: "missing-region",
            issues: ["Missing region configuration"],
          },
        ]);
      });

      it("should fail when most profiles are incomplete", async () => {
        const mostlyIncompleteProfiles = [
          { name: "incomplete1" }, // Missing everything
          { name: "incomplete2" }, // Missing everything
          {
            name: "complete",
            region: "us-east-1",
            awsAccessKeyId: "AKIA...",
            awsSecretAccessKey: "secret",
          },
          { name: "test-profile", awsAccessKeyId: "AKIA...", awsSecretAccessKey: "secret" }, // Missing region
        ];

        mockProfileManager.discoverProfiles.mockResolvedValue(mostlyIncompleteProfiles);

        const result = await profileValidationCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("3 profiles have configuration issues");
        expect(result.details?.incompleteProfiles).toHaveLength(3);
      });

      it("should handle SSO profile validation", async () => {
        const ssoProfiles = [
          {
            name: "complete-sso",
            region: "us-east-1",
            ssoSession: "my-session",
            ssoAccountId: "123456789012",
            ssoRoleName: "AdminRole",
          },
          {
            name: "incomplete-sso",
            region: "us-east-1",
            ssoSession: "my-session",
            // Missing ssoAccountId and ssoRoleName
          },
          {
            name: "test-profile",
            region: "us-east-1",
            awsAccessKeyId: "AKIA...",
            awsSecretAccessKey: "secret",
          },
        ];

        mockProfileManager.discoverProfiles.mockResolvedValue(ssoProfiles);

        const result = await profileValidationCheck.execute(context);

        expect(result.status).toBe("warn");
        expect(result.details?.profileIssues?.[0]?.issues).toEqual([
          "SSO profile missing account ID",
          "SSO profile missing role name",
        ]);
      });

      it("should handle context without target profile", async () => {
        const profiles = [
          {
            name: "default",
            region: "us-east-1",
            awsAccessKeyId: "AKIA...",
            awsSecretAccessKey: "secret",
          },
        ];
        mockProfileManager.discoverProfiles.mockResolvedValue(profiles);

        const contextWithoutProfile = { ...context, profile: undefined };
        const result = await profileValidationCheck.execute(contextWithoutProfile);

        expect(result.status).toBe("pass");
        expect(result.details?.targetProfile).toBeUndefined();
      });

      it("should throw CheckExecutionError for profile manager failures", async () => {
        mockProfileManager.discoverProfiles.mockRejectedValue(
          new Error("Profile discovery failed"),
        );

        await expect(profileValidationCheck.execute(context)).rejects.toThrow(CheckExecutionError);
      });
    });

    describe("validateProfile", () => {
      it("should validate complete access key profile", () => {
        const validateProfile = (profileValidationCheck as any).validateProfile.bind(
          profileValidationCheck,
        );

        const completeProfile = {
          name: "default",
          region: "us-east-1",
          awsAccessKeyId: "AKIA...",
          awsSecretAccessKey: "secret",
        };

        const result = validateProfile(completeProfile);

        expect(result.isComplete).toBe(true);
        expect(result.issues).toEqual([]);
        expect(result.profileName).toBe("default");
      });

      it("should validate complete SSO profile", () => {
        const validateProfile = (profileValidationCheck as any).validateProfile.bind(
          profileValidationCheck,
        );

        const ssoProfile = {
          name: "sso-profile",
          region: "us-east-1",
          ssoSession: "my-session",
          ssoAccountId: "123456789012",
          ssoRoleName: "AdminRole",
        };

        const result = validateProfile(ssoProfile);

        expect(result.isComplete).toBe(true);
        expect(result.issues).toEqual([]);
      });

      it("should detect missing region", () => {
        const validateProfile = (profileValidationCheck as any).validateProfile.bind(
          profileValidationCheck,
        );

        const profileWithoutRegion = {
          name: "no-region",
          awsAccessKeyId: "AKIA...",
          awsSecretAccessKey: "secret",
        };

        const result = validateProfile(profileWithoutRegion);

        expect(result.isComplete).toBe(false);
        expect(result.issues).toContain("Missing region configuration");
      });

      it("should detect incomplete SSO configuration", () => {
        const validateProfile = (profileValidationCheck as any).validateProfile.bind(
          profileValidationCheck,
        );

        const incompleteSsoProfile = {
          name: "incomplete-sso",
          region: "us-east-1",
          ssoSession: "my-session",
          // Missing ssoAccountId and ssoRoleName
        };

        const result = validateProfile(incompleteSsoProfile);

        expect(result.isComplete).toBe(false);
        expect(result.issues).toEqual([
          "SSO profile missing account ID",
          "SSO profile missing role name",
        ]);
      });

      it("should detect missing credentials", () => {
        const validateProfile = (profileValidationCheck as any).validateProfile.bind(
          profileValidationCheck,
        );

        const profileWithoutCredentials = {
          name: "no-creds",
          region: "us-east-1",
          // No access keys, SSO config, or source profile
        };

        const result = validateProfile(profileWithoutCredentials);

        expect(result.isComplete).toBe(false);
        expect(result.issues).toContain("Missing credentials - no access key or source profile");
      });
    });
  });

  describe("CredentialsFileCheck", () => {
    let credentialsFileCheck: CredentialsFileCheck;

    beforeEach(() => {
      credentialsFileCheck = new CredentialsFileCheck();
    });

    describe("properties", () => {
      it("should have correct metadata", () => {
        expect(credentialsFileCheck.id).toBe("credentials-file");
        expect(credentialsFileCheck.name).toBe("AWS Credentials File");
        expect(credentialsFileCheck.description).toBe(
          "Verifies AWS credentials file structure and accessibility",
        );
        expect(credentialsFileCheck.stage).toBe("configuration");
      });
    });

    describe("execute", () => {
      it("should pass for valid credentials file", async () => {
        const validCredentials = `[default]
aws_access_key_id = AKIA...
aws_secret_access_key = secret...

[production]
aws_access_key_id = AKIA...
aws_secret_access_key = secret...
aws_session_token = token...`;

        mockAccess.mockResolvedValue();
        mockReadFile.mockResolvedValue(validCredentials);

        const result = await credentialsFileCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.message).toBe("AWS credentials file is accessible and properly structured");
        expect(result.details).toEqual({
          credentialsFilePath: "/home/test/.aws/credentials",
          fileSize: validCredentials.length,
          profilesFound: 2,
        });
      });

      it("should warn for credentials file with structural issues", async () => {
        const invalidCredentials = `[default]
aws_access_key_id = AKIA...
# Missing secret access key

[incomplete]
aws_access_key_id =
aws_secret_access_key = secret

[orphaned]
aws_secret_access_key = secret`;

        mockAccess.mockResolvedValue();
        mockReadFile.mockResolvedValue(invalidCredentials);

        const result = await credentialsFileCheck.execute(context);

        expect(result.status).toBe("warn");
        expect(result.message).toBe("AWS credentials file has structural issues");
        expect(result.details?.structureIssues).toEqual([
          "Line 6: Invalid credential format",
          "Profile 'default': Missing aws_secret_access_key",
          "Profile 'incomplete': Missing aws_access_key_id",
          "Profile 'orphaned': Missing aws_access_key_id",
        ]);
      });

      it("should warn when credentials file not found (SSO-acceptable)", async () => {
        const enoentError = new Error("ENOENT: no such file or directory");
        mockAccess.mockRejectedValue(enoentError);

        const result = await credentialsFileCheck.execute(context);

        expect(result.status).toBe("warn");
        expect(result.message).toBe(
          "AWS credentials file not found (may be acceptable for SSO-only configuration)",
        );
        expect(result.details).toEqual({
          credentialsFilePath: "/home/test/.aws/credentials",
          expectedLocation: "/home/test/.aws/credentials",
        });
        expect(result.remediation).toContain("For SSO profiles, credentials file is optional");
      });

      it("should fail when credentials file access denied", async () => {
        const eaccesError = new Error("EACCES: permission denied");
        mockAccess.mockRejectedValue(eaccesError);

        const result = await credentialsFileCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("AWS credentials file exists but is not accessible");
        expect(result.details).toEqual({
          credentialsFilePath: "/home/test/.aws/credentials",
          error: "Permission denied",
        });
        expect(result.remediation).toContain(
          "Credentials file should be readable by current user only",
        );
      });

      it("should use custom credentials file path from environment", async () => {
        const customPath = "/custom/aws/credentials";
        process.env.AWS_SHARED_CREDENTIALS_FILE = customPath;

        const validCredentials =
          "[default]\naws_access_key_id = AKIA...\naws_secret_access_key = secret";
        mockAccess.mockResolvedValue();
        mockReadFile.mockResolvedValue(validCredentials);

        const result = await credentialsFileCheck.execute(context);

        expect(result.details?.credentialsFilePath).toBe(customPath);

        // Cleanup
        delete process.env.AWS_SHARED_CREDENTIALS_FILE;
      });

      it("should throw CheckExecutionError for unexpected errors", async () => {
        const unexpectedError = new Error("Unexpected file system error");
        mockAccess.mockRejectedValue(unexpectedError);

        await expect(credentialsFileCheck.execute(context)).rejects.toThrow(CheckExecutionError);
      });
    });

    describe("validateCredentialsStructure", () => {
      it("should validate correct credentials structure", () => {
        const validateCredentialsStructure = (
          credentialsFileCheck as any
        ).validateCredentialsStructure.bind(credentialsFileCheck);

        const validCredentials = `[default]
aws_access_key_id = AKIA...
aws_secret_access_key = secret

[production]
aws_access_key_id = AKIA...
aws_secret_access_key = secret
aws_session_token = token`;

        const result = validateCredentialsStructure(validCredentials);

        expect(result.isValid).toBe(true);
        expect(result.profilesCount).toBe(2);
        expect(result.issues).toEqual([]);
      });

      it("should detect credentials outside profile sections", () => {
        const validateCredentialsStructure = (
          credentialsFileCheck as any
        ).validateCredentialsStructure.bind(credentialsFileCheck);

        const invalidCredentials = `aws_access_key_id = AKIA...
[default]
aws_secret_access_key = secret`;

        const result = validateCredentialsStructure(invalidCredentials);

        expect(result.isValid).toBe(false);
        expect(result.issues).toContain("Line 1: Credential outside of profile section");
      });

      it("should detect incomplete credential pairs", () => {
        const validateCredentialsStructure = (
          credentialsFileCheck as any
        ).validateCredentialsStructure.bind(credentialsFileCheck);

        const incompleteCredentials = `[profile1]
aws_access_key_id = AKIA...

[profile2]
aws_secret_access_key = secret`;

        const result = validateCredentialsStructure(incompleteCredentials);

        expect(result.isValid).toBe(false);
        expect(result.issues).toEqual([
          "Profile 'profile1': Missing aws_secret_access_key",
          "Profile 'profile2': Missing aws_access_key_id",
        ]);
      });

      it("should handle empty credentials file", () => {
        const validateCredentialsStructure = (
          credentialsFileCheck as any
        ).validateCredentialsStructure.bind(credentialsFileCheck);

        const result = validateCredentialsStructure("");

        expect(result.isValid).toBe(true);
        expect(result.profilesCount).toBe(0);
        expect(result.issues).toEqual([]);
      });

      it("should handle credentials file with comments", () => {
        const validateCredentialsStructure = (
          credentialsFileCheck as any
        ).validateCredentialsStructure.bind(credentialsFileCheck);

        const credentialsWithComments = `# AWS Credentials
[default]
# Access key for default profile
aws_access_key_id = AKIA...
aws_secret_access_key = secret`;

        const result = validateCredentialsStructure(credentialsWithComments);

        expect(result.isValid).toBe(true);
        expect(result.profilesCount).toBe(1);
      });
    });
  });
});
