/**
 * Unit tests for ProfileManager
 *
 * Tests AWS profile discovery and management with mocked file system operations
 * for comprehensive INI parsing, profile validation, and error handling scenarios.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileError } from "../../../src/lib/auth-errors.js";
import { ProfileManager } from "../../../src/services/profile-manager.js";

// Mock node:fs/promises module
vi.mock("node:fs/promises", () => ({
  default: {
    access: vi.fn(),
    readFile: vi.fn(),
  },
}));

// Mock node:os module
vi.mock("node:os", () => ({
  default: {
    homedir: vi.fn(),
  },
}));

const mockFs = vi.mocked(await import("node:fs/promises")).default;
const mockOs = vi.mocked(await import("node:os")).default;

describe("ProfileManager", () => {
  let profileManager: ProfileManager;
  let originalAwsProfile: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();

    // Store and clear AWS_PROFILE environment variable
    originalAwsProfile = process.env.AWS_PROFILE;
    delete process.env.AWS_PROFILE;

    // Setup default os.homedir mock
    mockOs.homedir.mockReturnValue("/home/user");

    profileManager = new ProfileManager({
      enableDebugLogging: false,
      enableProfileCache: false, // Disable cache for testing
    });
  });

  afterEach(() => {
    // Restore AWS_PROFILE environment variable
    if (originalAwsProfile === undefined) {
      delete process.env.AWS_PROFILE;
    } else {
      process.env.AWS_PROFILE = originalAwsProfile;
    }
  });

  describe("discoverProfiles", () => {
    it("should discover profiles from both config and credentials files", async () => {
      const configContent = `
[default]
region = us-east-1
output = json

[profile dev]
region = us-west-2
sso_start_url = https://example.awsapps.com/start
sso_region = us-east-1
sso_account_id = 123456789012
sso_role_name = PowerUserAccess

[profile prod]
region = eu-west-1
role_arn = arn:aws:iam::123456789012:role/ProductionRole
source_profile = default
mfa_serial = arn:aws:iam::123456789012:mfa/user
`;

      const credentialsContent = `
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY

[staging]
aws_access_key_id = AKIAIOSFODNN7STAGING
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYSTAGING
`;

      mockFs.access.mockResolvedValue();
      mockFs.readFile
        .mockResolvedValueOnce(configContent)
        .mockResolvedValueOnce(credentialsContent);

      const profiles = await profileManager.discoverProfiles();

      expect(profiles).toHaveLength(4);

      // Check default profile (merged from both files)
      const defaultProfile = profiles.find((p) => p.name === "default");
      expect(defaultProfile).toEqual({
        name: "default",
        region: "us-east-1",
        output: "json",
        awsAccessKeyId: "AKIAIOSFODNN7EXAMPLE",
        hasSecretAccessKey: true,
      });

      // Check SSO profile
      const developmentProfile = profiles.find((p) => p.name === "dev");
      expect(developmentProfile).toEqual({
        name: "dev",
        region: "us-west-2",
        ssoStartUrl: "https://example.awsapps.com/start",
        ssoRegion: "us-east-1",
        ssoAccountId: "123456789012",
        ssoRoleName: "PowerUserAccess",
      });

      // Check IAM role profile
      const productionProfile = profiles.find((p) => p.name === "prod");
      expect(productionProfile).toEqual({
        name: "prod",
        region: "eu-west-1",
        roleArn: "arn:aws:iam::123456789012:role/ProductionRole",
        sourceProfile: "default",
        mfaSerial: "arn:aws:iam::123456789012:mfa/user",
      });

      // Check credentials-only profile
      const stagingProfile = profiles.find((p) => p.name === "staging");
      expect(stagingProfile).toEqual({
        name: "staging",
        awsAccessKeyId: "AKIAIOSFODNN7STAGING",
        hasSecretAccessKey: true,
      });
    });

    it("should handle missing config file gracefully", async () => {
      const credentialsContent = `
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
`;

      mockFs.access
        .mockRejectedValueOnce(new Error("ENOENT: no such file or directory"))
        .mockResolvedValueOnce();
      mockFs.readFile.mockResolvedValueOnce(credentialsContent);

      const profiles = await profileManager.discoverProfiles();

      expect(profiles).toHaveLength(1);
      expect(profiles[0]).toEqual({
        name: "default",
        awsAccessKeyId: "AKIAIOSFODNN7EXAMPLE",
        hasSecretAccessKey: true,
      });
    });

    it("should handle missing credentials file gracefully", async () => {
      const configContent = `
[default]
region = us-east-1

[profile dev]
sso_start_url = https://example.awsapps.com/start
sso_region = us-east-1
`;

      mockFs.access
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(new Error("ENOENT: no such file or directory"));
      mockFs.readFile.mockResolvedValueOnce(configContent);

      const profiles = await profileManager.discoverProfiles();

      expect(profiles).toHaveLength(2);
      expect(profiles.find((p) => p.name === "default")).toEqual({
        name: "default",
        region: "us-east-1",
      });
    });

    it("should handle empty configuration files", async () => {
      mockFs.access.mockResolvedValue();
      mockFs.readFile.mockResolvedValueOnce("").mockResolvedValueOnce("");

      const profiles = await profileManager.discoverProfiles();

      expect(profiles).toHaveLength(0);
    });

    it("should handle configuration files with comments and empty lines", async () => {
      const configContent = `
# This is a comment
; This is also a comment

[default]
region = us-east-1
# Another comment
output = json

# Empty section should be ignored

[profile test]
region = us-west-2
`;

      mockFs.access.mockResolvedValueOnce().mockRejectedValueOnce(new Error("ENOENT"));
      mockFs.readFile.mockResolvedValueOnce(configContent);

      const profiles = await profileManager.discoverProfiles();

      expect(profiles).toHaveLength(2);
      expect(profiles.find((p) => p.name === "default")?.region).toBe("us-east-1");
      expect(profiles.find((p) => p.name === "test")?.region).toBe("us-west-2");
    });

    it("should throw ProfileError when file parsing fails", async () => {
      mockFs.access.mockResolvedValue();
      mockFs.readFile.mockRejectedValueOnce(new Error("Permission denied"));

      await expect(profileManager.discoverProfiles()).rejects.toThrow(ProfileError);
    });
  });

  describe("getProfileInfo", () => {
    beforeEach(() => {
      // Setup basic profile data for getProfileInfo tests
      const configContent = `
[default]
region = us-east-1

[profile sso-profile]
sso_start_url = https://example.awsapps.com/start
sso_region = us-east-1
sso_account_id = 123456789012
sso_role_name = PowerUserAccess
region = us-west-2

[profile iam-profile]
role_arn = arn:aws:iam::123456789012:role/TestRole
source_profile = default
region = eu-west-1

[profile creds-profile]
region = ap-southeast-1
`;

      const credentialsContent = `
[creds-profile]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
`;

      mockFs.access.mockResolvedValue();
      mockFs.readFile
        .mockResolvedValueOnce(configContent)
        .mockResolvedValueOnce(credentialsContent);
    });

    it("should return SSO profile information", async () => {
      const profileInfo = await profileManager.getProfileInfo("sso-profile");

      expect(profileInfo).toEqual({
        name: "sso-profile",
        type: "sso",
        active: false,
        credentialsValid: false,
        region: "us-west-2",
        ssoStartUrl: "https://example.awsapps.com/start",
        ssoRegion: "us-east-1",
        ssoAccountId: "123456789012",
        ssoRoleName: "PowerUserAccess",
      });
    });

    it("should return IAM role profile information", async () => {
      const profileInfo = await profileManager.getProfileInfo("iam-profile");

      expect(profileInfo).toEqual({
        name: "iam-profile",
        type: "iam",
        active: false,
        credentialsValid: false,
        region: "eu-west-1",
        output: undefined,
        ssoStartUrl: undefined,
        ssoRegion: undefined,
        ssoAccountId: undefined,
        ssoRoleName: undefined,
        roleArn: "arn:aws:iam::123456789012:role/TestRole",
        sourceProfile: "default",
      });
    });

    it("should return credentials profile information", async () => {
      const profileInfo = await profileManager.getProfileInfo("creds-profile");

      expect(profileInfo).toEqual({
        name: "creds-profile",
        type: "credentials",
        active: false,
        credentialsValid: false,
        region: "ap-southeast-1",
      });
    });

    it("should mark profile as active when it matches AWS_PROFILE environment variable", async () => {
      process.env.AWS_PROFILE = "sso-profile";

      const profileInfo = await profileManager.getProfileInfo("sso-profile");

      expect(profileInfo.active).toBe(true);
    });

    it("should mark default profile as active when no AWS_PROFILE is set", async () => {
      delete process.env.AWS_PROFILE;

      const profileInfo = await profileManager.getProfileInfo("default");

      expect(profileInfo.active).toBe(true);
    });

    it("should throw ProfileError when profile is not found", async () => {
      await expect(profileManager.getProfileInfo("nonexistent")).rejects.toThrow(ProfileError);
    });

    it("should throw ProfileError when profile discovery fails", async () => {
      mockFs.access.mockRejectedValue(new Error("File system error"));

      await expect(profileManager.getProfileInfo("any-profile")).rejects.toThrow(ProfileError);
    });
  });

  describe("profileExists", () => {
    beforeEach(() => {
      const configContent = `
[default]
region = us-east-1

[profile test]
region = us-west-2
`;

      mockFs.access.mockResolvedValueOnce().mockRejectedValueOnce(new Error("ENOENT"));
      mockFs.readFile.mockResolvedValue(configContent);
    });

    it("should return true for existing profile", async () => {
      const exists = await profileManager.profileExists("default");
      expect(exists).toBe(true);
    });

    it("should return false for non-existing profile", async () => {
      const exists = await profileManager.profileExists("nonexistent");
      expect(exists).toBe(false);
    });
  });

  describe("getActiveProfileName", () => {
    it("should return AWS_PROFILE environment variable when set", () => {
      process.env.AWS_PROFILE = "test-profile";

      const activeProfile = profileManager.getActiveProfileName();

      expect(activeProfile).toBe("test-profile");
    });

    it("should return 'default' when AWS_PROFILE is not set", () => {
      delete process.env.AWS_PROFILE;

      const activeProfile = profileManager.getActiveProfileName();

      expect(activeProfile).toBe("default");
    });
  });

  describe("switchProfile", () => {
    beforeEach(() => {
      const configContent = `
[default]
region = us-east-1

[profile target]
region = us-west-2
`;

      // Config file exists, credentials file doesn't
      mockFs.access
        .mockResolvedValueOnce() // config file access succeeds
        .mockRejectedValueOnce(new Error("ENOENT")); // credentials file access fails
      mockFs.readFile.mockResolvedValue(configContent);
    });

    it("should switch to existing profile successfully", async () => {
      // Set initial profile value
      vi.stubEnv("AWS_PROFILE", "current-profile");

      await profileManager.switchProfile("target");

      expect(process.env.AWS_PROFILE).toBe("target");
    });

    it("should throw ProfileError when switching to non-existing profile", async () => {
      // Set initial profile value
      vi.stubEnv("AWS_PROFILE", "current-profile");
      const originalProfile = process.env.AWS_PROFILE;

      await expect(profileManager.switchProfile("nonexistent")).rejects.toThrow(ProfileError);

      // Profile should remain unchanged after failed switch
      expect(process.env.AWS_PROFILE).toBe(originalProfile);
    });

    it("should throw ProfileError when profile existence check fails", async () => {
      mockFs.access.mockRejectedValue(new Error("File system error"));

      await expect(profileManager.switchProfile("any-profile")).rejects.toThrow(ProfileError);
    });

    it("should handle concurrent profile switches safely", async () => {
      // Set up mock for additional profiles needed for this test
      const extendedConfigContent = `
[default]
region = us-east-1

[profile target]
region = us-west-2

[profile another-target]
region = eu-west-1
`;

      mockFs.access
        .mockResolvedValue() // Both config and credentials file access succeed
        .mockResolvedValue();
      mockFs.readFile.mockResolvedValue(extendedConfigContent);

      // Set initial profile
      vi.stubEnv("AWS_PROFILE", "initial");

      // Launch multiple concurrent profile switches
      const promises = [
        profileManager.switchProfile("target"),
        profileManager.switchProfile("another-target"),
        profileManager.switchProfile("default"),
      ];

      // All should complete, but only one will be the final result
      await Promise.all(promises);

      // Final AWS_PROFILE should be one of the target profiles
      const finalProfile = process.env.AWS_PROFILE;
      expect(["target", "another-target", "default"]).toContain(finalProfile);
    });

    it("should handle profile switch with environment variable changes during operation", async () => {
      let switchCount = 0;

      // Mock that simulates environment variable being changed externally during switch
      const originalProfileExists = profileManager.profileExists.bind(profileManager);
      vi.spyOn(profileManager, "profileExists").mockImplementation(async (profileName) => {
        switchCount++;
        if (switchCount === 1) {
          // External process changes AWS_PROFILE during existence check
          process.env.AWS_PROFILE = "external-change";
        }
        return originalProfileExists(profileName);
      });

      await profileManager.switchProfile("target");

      // Should still complete the switch despite external changes
      expect(process.env.AWS_PROFILE).toBe("target");
    });

    it("should handle profile switch when cache is cleared during operation", async () => {
      // Setup initial state
      vi.stubEnv("AWS_PROFILE", "initial");

      // Create a spy to track when clearCache is called
      const clearCacheSpy = vi.spyOn(profileManager, "clearCache");

      // Mock profile existence check to clear cache during operation
      let callCount = 0;
      vi.spyOn(profileManager, "profileExists").mockImplementation((profileName) => {
        callCount++;
        if (callCount === 1) {
          // Clear cache during profile switch
          profileManager.clearCache();
        }
        // Return true for existing profiles
        return ["default", "target", "another-target"].includes(profileName);
      });

      await profileManager.switchProfile("target");

      expect(process.env.AWS_PROFILE).toBe("target");
      expect(clearCacheSpy).toHaveBeenCalled();
    });

    it("should handle profile switch when config files change during operation", async () => {
      vi.stubEnv("AWS_PROFILE", "initial");

      let readCount = 0;
      mockFs.readFile.mockImplementation(() => {
        readCount++;
        return readCount === 1
          ? `
[default]
region = us-east-1

[profile target]
region = us-west-2
` // First read: original config
          : `
[default]
region = us-east-1
`; // Subsequent reads: config changed (profile removed)
      });

      // First switch should work
      await profileManager.switchProfile("target");
      expect(process.env.AWS_PROFILE).toBe("target");

      // Second switch attempt should fail due to changed config
      await expect(profileManager.switchProfile("target")).rejects.toThrow(ProfileError);
    });

    it("should handle rapid profile switching with getActiveProfileName calls", async () => {
      // Set up mock for additional profiles needed for this test
      const extendedConfigContent = `
[default]
region = us-east-1

[profile target]
region = us-west-2

[profile target1]
region = eu-west-1

[profile target2]
region = ap-southeast-1
`;

      mockFs.access
        .mockResolvedValue() // Both config and credentials file access succeed
        .mockResolvedValue();
      mockFs.readFile.mockResolvedValue(extendedConfigContent);

      vi.stubEnv("AWS_PROFILE", "initial");

      // Launch concurrent switches and profile name retrievals
      const switchPromises = [
        profileManager.switchProfile("target1"),
        profileManager.switchProfile("target2"),
      ];

      const getActivePromises = Array.from({ length: 10 }, () =>
        Promise.resolve(profileManager.getActiveProfileName()),
      );

      const allPromises = [...switchPromises, ...getActivePromises];
      const results = await Promise.all(allPromises);

      // Switches should complete
      expect(results.slice(0, 2)).toEqual([undefined, undefined]);

      // All getActiveProfileName calls should return valid profile names
      const profileNames = results.slice(2);
      for (const name of profileNames) {
        expect(["initial", "target1", "target2"]).toContain(name);
      }
    });

    it("should handle profile switch with concurrent profile discovery", async () => {
      // Set up mock for profile discovery operations
      const configContent = `
[default]
region = us-east-1

[profile target]
region = us-west-2
sso_start_url = https://example.awsapps.com/start
sso_region = us-east-1
sso_account_id = 123456789012
sso_role_name = PowerUserAccess
`;

      const credentialsContent = `
[default]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
`;

      // Setup mocks to handle multiple concurrent calls
      mockFs.access.mockResolvedValue(); // Always succeed for file access
      mockFs.readFile.mockImplementation((path: string) => {
        if (path.includes("config")) {
          return configContent;
        } else if (path.includes("credentials")) {
          return credentialsContent;
        }
        return "";
      });

      vi.stubEnv("AWS_PROFILE", "initial");

      // Launch concurrent profile switch and discovery
      const promises = [
        profileManager.switchProfile("target"),
        profileManager.discoverProfiles(),
        profileManager.getSsoProfiles(),
      ];

      const results = await Promise.all(promises);

      // Switch should complete
      expect(results[0]).toBeUndefined();
      expect(process.env.AWS_PROFILE).toBe("target");

      // Discovery operations should return valid results
      expect(Array.isArray(results[1])).toBe(true);
      expect(Array.isArray(results[2])).toBe(true);
    });

    it("should handle profile switch when AWS_PROFILE is deleted externally", async () => {
      vi.stubEnv("AWS_PROFILE", "initial");

      // Mock profile existence to delete AWS_PROFILE during check
      vi.spyOn(profileManager, "profileExists").mockImplementation((profileName) => {
        // External process deletes AWS_PROFILE
        delete process.env.AWS_PROFILE;
        return ["default", "target", "another-target"].includes(profileName);
      });

      await profileManager.switchProfile("target");

      // Should set the profile despite external deletion
      expect(process.env.AWS_PROFILE).toBe("target");
    });

    it("should handle profile switch with file system errors during validation", async () => {
      vi.stubEnv("AWS_PROFILE", "initial");

      let accessCount = 0;
      mockFs.access.mockImplementation(() => {
        accessCount++;
        if (accessCount === 2) {
          // Second access fails (config file becomes inaccessible)
          throw new Error("EACCES: permission denied");
        }
        // First access succeeds
      });

      // First switch should work
      await profileManager.switchProfile("target");
      expect(process.env.AWS_PROFILE).toBe("target");

      // Second switch should fail due to file system error
      await expect(profileManager.switchProfile("another-target")).rejects.toThrow(ProfileError);
    });
  });

  describe("getSsoProfiles", () => {
    it("should return only SSO profiles", async () => {
      const configContent = `
[default]
region = us-east-1

[profile sso1]
sso_start_url = https://example1.awsapps.com/start
sso_region = us-east-1

[profile sso2]
sso_start_url = https://example2.awsapps.com/start
sso_region = us-west-2

[profile iam-role]
role_arn = arn:aws:iam::123456789012:role/TestRole
source_profile = default
`;

      const credentialsContent = `
[creds-profile]
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
`;

      mockFs.access.mockResolvedValue();
      mockFs.readFile
        .mockResolvedValueOnce(configContent)
        .mockResolvedValueOnce(credentialsContent);

      const ssoProfiles = await profileManager.getSsoProfiles();

      expect(ssoProfiles).toEqual(["sso1", "sso2"]);
    });

    it("should return empty array when no SSO profiles exist", async () => {
      const configContent = `
[default]
region = us-east-1

[profile iam-role]
role_arn = arn:aws:iam::123456789012:role/TestRole
source_profile = default
`;

      mockFs.access.mockResolvedValueOnce().mockRejectedValueOnce(new Error("ENOENT"));
      mockFs.readFile.mockResolvedValueOnce(configContent);

      const ssoProfiles = await profileManager.getSsoProfiles();

      expect(ssoProfiles).toEqual([]);
    });

    it("should throw ProfileError when profile discovery fails", async () => {
      // Mock both parseConfigFile and parseCredentialsFile access calls to fail
      mockFs.access
        .mockRejectedValueOnce(new Error("File system error"))
        .mockRejectedValueOnce(new Error("File system error"));

      await expect(profileManager.getSsoProfiles()).rejects.toThrow(ProfileError);
    });
  });

  describe("clearCache", () => {
    it("should clear the profile cache", () => {
      // This method is synchronous and doesn't throw, so we just verify it doesn't error
      expect(() => profileManager.clearCache()).not.toThrow();
    });
  });

  describe("configuration file parsing edge cases", () => {
    it("should handle malformed INI sections gracefully", async () => {
      const configContent = `
[default]
region = us-east-1

[invalid section without closing bracket
region = us-west-2

[profile valid]
region = eu-west-1
`;

      mockFs.access.mockResolvedValueOnce().mockRejectedValueOnce(new Error("ENOENT"));
      mockFs.readFile.mockResolvedValueOnce(configContent);

      const profiles = await profileManager.discoverProfiles();

      // Should only find valid profiles
      expect(profiles).toHaveLength(2);
      expect(profiles.find((p) => p.name === "default")).toBeDefined();
      expect(profiles.find((p) => p.name === "valid")).toBeDefined();
    });

    it("should handle malformed key-value pairs gracefully", async () => {
      const configContent = `
[default]
region = us-east-1
invalid_line_without_equals
= value_without_key
key_without_value =
normal_key = normal_value
`;

      mockFs.access.mockResolvedValueOnce().mockRejectedValueOnce(new Error("ENOENT"));
      mockFs.readFile.mockResolvedValueOnce(configContent);

      const profiles = await profileManager.discoverProfiles();

      expect(profiles).toHaveLength(1);
      expect(profiles[0]).toEqual({
        name: "default",
        region: "us-east-1",
        // Invalid lines should be ignored, only valid ones processed
      });
    });

    it("should handle configuration with underscores in keys", async () => {
      const configContent = `
[profile test]
sso_start_url = https://example.awsapps.com/start
sso_region = us-east-1
sso_account_id = 123456789012
sso_role_name = PowerUserAccess
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
`;

      mockFs.access.mockResolvedValueOnce().mockRejectedValueOnce(new Error("ENOENT"));
      mockFs.readFile.mockResolvedValueOnce(configContent);

      const profiles = await profileManager.discoverProfiles();

      expect(profiles).toHaveLength(1);
      expect(profiles[0]).toEqual({
        name: "test",
        ssoStartUrl: "https://example.awsapps.com/start",
        ssoRegion: "us-east-1",
        ssoAccountId: "123456789012",
        ssoRoleName: "PowerUserAccess",
        awsAccessKeyId: "AKIAIOSFODNN7EXAMPLE",
      });
    });

    it("should handle completely corrupted config file", async () => {
      // Simulate a file that contains binary data or encoding issues
      const corruptedContent =
        "\u0000\u0001\u0002\u00FF\u00FE\u00FD invalid binary content \u0000\u0000";

      mockFs.access.mockResolvedValueOnce().mockRejectedValueOnce(new Error("ENOENT"));
      mockFs.readFile.mockResolvedValueOnce(corruptedContent);

      // Should handle corruption gracefully and return empty profile list
      const profiles = await profileManager.discoverProfiles();
      expect(profiles).toHaveLength(0);
    });

    it("should handle partially corrupted config file with mixed content", async () => {
      const partiallyCorruptedContent = `
[default]
region = us-east-1

\u0000\u00FF corrupted section \u0000\u00FF
invalid binary data here

[profile valid]
region = eu-west-1
sso_start_url = https://example.awsapps.com/start
`;

      mockFs.access.mockResolvedValueOnce().mockRejectedValueOnce(new Error("ENOENT"));
      mockFs.readFile.mockResolvedValueOnce(partiallyCorruptedContent);

      const profiles = await profileManager.discoverProfiles();

      // Should recover valid profiles despite corruption
      expect(profiles).toHaveLength(2);
      expect(profiles.find((p) => p.name === "default")).toBeDefined();
      expect(profiles.find((p) => p.name === "valid")).toBeDefined();
    });

    it("should handle config file with extremely long lines", async () => {
      const longValue = "x".repeat(100_000); // 100KB line
      const configContent = `
[default]
region = us-east-1
extremely_long_key = ${longValue}

[profile normal]
region = us-west-2
`;

      mockFs.access.mockResolvedValueOnce().mockRejectedValueOnce(new Error("ENOENT"));
      mockFs.readFile.mockResolvedValueOnce(configContent);

      const profiles = await profileManager.discoverProfiles();

      // Should handle long lines gracefully
      expect(profiles).toHaveLength(2);
      expect(profiles.find((p) => p.name === "default")).toBeDefined();
      expect(profiles.find((p) => p.name === "normal")).toBeDefined();
    });

    it("should handle config file with Unicode and special characters", async () => {
      const configContent = `
[default]
region = us-east-1
# Comment with émojis: 🚀 🌟 ⚡
description = "Profile with Unicode: café, naïve, 中文"

[profile special-chars]
region = us-west-2
description = "Special chars: @#$%^&*(){}[]|\\:;<>?,./"
`;

      mockFs.access.mockResolvedValueOnce().mockRejectedValueOnce(new Error("ENOENT"));
      mockFs.readFile.mockResolvedValueOnce(configContent);

      const profiles = await profileManager.discoverProfiles();

      expect(profiles).toHaveLength(2);
      expect(profiles.find((p) => p.name === "default")).toBeDefined();
      expect(profiles.find((p) => p.name === "special-chars")).toBeDefined();
    });

    it("should handle config file read errors during parsing", async () => {
      // Simulate file becoming inaccessible during read
      mockFs.access.mockResolvedValueOnce().mockRejectedValueOnce(new Error("ENOENT"));
      mockFs.readFile.mockRejectedValueOnce(new Error("EIO: I/O error, read"));

      await expect(profileManager.discoverProfiles()).rejects.toThrow(ProfileError);
    });

    it("should handle config file with nested brackets and malformed sections", async () => {
      const configContent = `
[default]
region = us-east-1

[[nested brackets]]
invalid = section

[profile [invalid]]
region = us-west-2

[profile valid]
region = eu-west-1
`;

      mockFs.access.mockResolvedValueOnce().mockRejectedValueOnce(new Error("ENOENT"));
      mockFs.readFile.mockResolvedValueOnce(configContent);

      const profiles = await profileManager.discoverProfiles();

      // Parser is resilient and finds valid parts
      expect(profiles.length).toBeGreaterThanOrEqual(2);
      expect(profiles.find((p) => p.name === "default")).toBeDefined();
      expect(profiles.find((p) => p.name === "valid")).toBeDefined();
    });

    it("should handle config file with empty sections and whitespace-only lines", async () => {
      const configContent = `

\t\t\t

[default]
region = us-east-1

[profile empty]


   \t

[profile whitespace-only]

\t\t\t
region = us-west-2

`;

      mockFs.access.mockResolvedValueOnce().mockRejectedValueOnce(new Error("ENOENT"));
      mockFs.readFile.mockResolvedValueOnce(configContent);

      const profiles = await profileManager.discoverProfiles();

      // Parser handles empty sections gracefully
      expect(profiles.length).toBeGreaterThanOrEqual(2);
      expect(profiles.find((p) => p.name === "default")).toBeDefined();
      expect(profiles.find((p) => p.name === "whitespace-only")).toBeDefined();
    });

    it("should handle config file with circular SSO session references", async () => {
      const configContent = `
[sso-session session1]
sso_start_url = https://session1.awsapps.com/start
sso_region = us-east-1

[sso-session session2]
sso_start_url = https://session2.awsapps.com/start
sso_region = us-west-2

[profile circular1]
sso_session = session2
region = us-east-1

[profile circular2]
sso_session = session1
region = us-west-2
`;

      mockFs.access.mockResolvedValueOnce().mockRejectedValueOnce(new Error("ENOENT"));
      mockFs.readFile.mockResolvedValueOnce(configContent);

      const profiles = await profileManager.discoverProfiles();

      // Parser handles SSO sessions and profiles correctly
      expect(profiles.length).toBeGreaterThanOrEqual(2);
      expect(profiles.find((p) => p.name === "circular1")).toBeDefined();
      expect(profiles.find((p) => p.name === "circular2")).toBeDefined();
    });

    it("should handle config file with missing closing quotes", async () => {
      const configContent = `
[default]
region = us-east-1
description = "unclosed quote
another_key = value

[profile valid]
region = us-west-2
description = "properly closed quote"
`;

      mockFs.access.mockResolvedValueOnce().mockRejectedValueOnce(new Error("ENOENT"));
      mockFs.readFile.mockResolvedValueOnce(configContent);

      const profiles = await profileManager.discoverProfiles();

      // Should parse what it can
      expect(profiles).toHaveLength(2);
      expect(profiles.find((p) => p.name === "default")).toBeDefined();
      expect(profiles.find((p) => p.name === "valid")).toBeDefined();
    });

    it("should handle custom file paths in options", async () => {
      const customProfileManager = new ProfileManager({
        configFilePath: "/custom/path/config",
        credentialsFilePath: "/custom/path/credentials",
        enableDebugLogging: false,
      });

      const configContent = `
[default]
region = us-east-1
`;

      mockFs.access.mockResolvedValue();
      mockFs.readFile.mockResolvedValueOnce(configContent).mockResolvedValueOnce("");

      await customProfileManager.discoverProfiles();

      expect(mockFs.readFile).toHaveBeenCalledWith("/custom/path/config", "utf8");
      expect(mockFs.readFile).toHaveBeenCalledWith("/custom/path/credentials", "utf8");
    });
  });

  describe("profile type detection", () => {
    beforeEach(() => {
      const configContent = `
[profile mixed-sso]
sso_start_url = https://example.awsapps.com/start
role_arn = arn:aws:iam::123456789012:role/TestRole

[profile mixed-iam]
role_arn = arn:aws:iam::123456789012:role/TestRole
aws_access_key_id = AKIAIOSFODNN7EXAMPLE
`;

      const credentialsContent = `
[mixed-iam]
aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
`;

      mockFs.access.mockResolvedValue();
      mockFs.readFile
        .mockResolvedValue(configContent)
        .mockResolvedValueOnce(configContent)
        .mockResolvedValueOnce(credentialsContent);
    });

    it("should prioritize SSO type when both SSO and role_arn are present", async () => {
      const profileInfo = await profileManager.getProfileInfo("mixed-sso");

      expect(profileInfo.type).toBe("sso");
    });

    it("should use IAM type when role_arn is present but no SSO", async () => {
      const profileInfo = await profileManager.getProfileInfo("mixed-iam");

      expect(profileInfo.type).toBe("iam");
    });
  });

  describe("SSO session caching", () => {
    beforeEach(() => {
      const configContent = `
[sso-session dev]
sso_start_url = https://dev.awsapps.com/start
sso_region = us-east-1

[profile test-sso]
sso_session = dev
sso_account_id = 123456789012
sso_role_name = TestRole
region = us-west-2
`;

      mockFs.access.mockResolvedValue();
      mockFs.readFile.mockResolvedValue(configContent);
    });

    it("should cache complete SSO session configurations", async () => {
      const profileInfo = await profileManager.getProfileInfo("test-sso");

      expect(profileInfo.ssoSession).toBe("dev");
      expect(profileInfo.ssoStartUrl).toBe("https://dev.awsapps.com/start");
      expect(profileInfo.ssoRegion).toBe("us-east-1");
    });

    it("should handle SSO session property assignment", async () => {
      const configContent = `
[profile test-profile]
sso_session = production
sso_account_id = 987654321098
sso_role_name = PowerUserAccess
region = us-east-1
`;

      mockFs.readFile.mockResolvedValue(configContent);

      const profileInfo = await profileManager.getProfileInfo("test-profile");

      expect(profileInfo.ssoSession).toBe("production");
    });
  });
});
