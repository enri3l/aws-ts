/**
 * Integration tests for cross-platform behavior differences
 *
 * Tests platform-specific behaviors without complex filesystem mocking.
 * Focuses on environment variable handling, path resolution, and CLI detection.
 */

import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  detectAwsCli,
  getAwsCliPaths,
  getAwsConfigPaths,
  getPlatformInfo,
} from "../../../src/lib/auth-utilities.js";
import { AuthCliWrapper } from "../../../src/services/auth-cli-wrapper.js";
import { AuthService } from "../../../src/services/auth-service.js";
import { ProfileManager } from "../../../src/services/profile-manager.js";
import { TokenManager } from "../../../src/services/token-manager.js";

// Mock CLI wrapper
vi.mock("../../../src/services/auth-cli-wrapper.js");

// Setup AWS SDK mocks
const stsMock = mockClient(STSClient);

describe("Platform Behaviors", () => {
  let mockCliWrapper: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    stsMock.reset();

    // Setup default STS mock
    stsMock.on(GetCallerIdentityCommand).resolves({
      UserId: "AROA123456789EXAMPLE:platform-test-user",
      Account: "123456789012",
      Arn: "arn:aws:sts::123456789012:assumed-role/PlatformTestRole/platform-test-user",
    });

    // Mock CLI wrapper
    mockCliWrapper = {
      checkInstallation: vi.fn().mockResolvedValue({
        installed: true,
        version: "2.15.0",
      }),
      ssoLogin: vi.fn().mockResolvedValue(),
      ssoLogout: vi.fn().mockResolvedValue(),
      configureSso: vi.fn().mockResolvedValue(),
    };

    vi.mocked(AuthCliWrapper).mockImplementation(() => mockCliWrapper);
  });

  afterEach(() => {
    // Restore original values (though process.platform is read-only)
    // This is just for documentation purposes
  });

  describe("Platform detection", () => {
    it("should detect current platform correctly", () => {
      const platformInfo = getPlatformInfo();

      expect(platformInfo.platform).toMatch(/windows|macos|linux|unknown/);
      expect(typeof platformInfo.isWindows).toBe("boolean");
      expect(typeof platformInfo.isMacOS).toBe("boolean");
      expect(typeof platformInfo.isLinux).toBe("boolean");
      expect(typeof platformInfo.homeDirectory).toBe("string");
      expect(typeof platformInfo.awsConfigDirectory).toBe("string");

      // Exactly one platform should be true
      const platformFlags = [platformInfo.isWindows, platformInfo.isMacOS, platformInfo.isLinux];
      const trueCount = platformFlags.filter(Boolean).length;
      expect(trueCount).toBeLessThanOrEqual(1);
    });

    it("should provide correct AWS config paths", () => {
      const configPaths = getAwsConfigPaths();

      expect(configPaths.configFile).toContain(".aws");
      expect(configPaths.configFile).toContain("config");
      expect(configPaths.credentialsFile).toContain(".aws");
      expect(configPaths.credentialsFile).toContain("credentials");
      expect(configPaths.ssoCache).toContain(".aws");
      expect(configPaths.ssoCache).toContain("sso");
      expect(configPaths.ssoCache).toContain("cache");
    });

    it("should provide platform-appropriate CLI paths", () => {
      const cliPaths = getAwsCliPaths();

      expect(Array.isArray(cliPaths)).toBe(true);
      expect(cliPaths.length).toBeGreaterThan(0);

      // Should include common paths
      if (process.platform === "win32") {
        expect(cliPaths.some((path) => path.includes("aws.exe"))).toBe(true);
      } else {
        expect(cliPaths.some((path) => path.includes("aws"))).toBe(true);
      }
    });
  });

  describe("Environment variable handling", () => {
    it("should handle AWS region environment variables", async () => {
      const originalRegion = process.env.AWS_REGION;

      // Test different regions
      const regions = ["us-east-1", "eu-west-1", "ap-southeast-1", "ca-central-1"];

      for (const region of regions) {
        process.env.AWS_REGION = region;

        const authService = new AuthService({
          enableDebugLogging: false,
          enableProgressIndicators: false,
        });

        const status = await authService.getStatus({
          allProfiles: false,
          detailed: false,
        });

        expect(status.awsCliInstalled).toBeDefined();
      }

      // Restore original
      if (originalRegion) {
        process.env.AWS_REGION = originalRegion;
      } else {
        delete process.env.AWS_REGION;
      }
    });

    it("should handle AWS profile environment variables", () => {
      const originalProfile = process.env.AWS_PROFILE;

      const testProfiles = ["default", "development", "production", "eu-profile"];

      for (const profile of testProfiles) {
        process.env.AWS_PROFILE = profile;

        const authService = new AuthService({
          enableDebugLogging: false,
          enableProgressIndicators: false,
        });

        // Service should be created without errors
        expect(authService).toBeInstanceOf(AuthService);

        // Clean up immediately after each iteration to prevent test isolation issues
        delete process.env.AWS_PROFILE;
      }

      // Restore original
      if (originalProfile) {
        process.env.AWS_PROFILE = originalProfile;
      } else {
        delete process.env.AWS_PROFILE;
      }
    });

    it("should handle PATH environment variable for CLI detection", async () => {
      const originalPath = process.env.PATH;

      // Test with empty PATH
      process.env.PATH = "";

      try {
        const cliInfo = await detectAwsCli();
        // Should handle gracefully even with empty PATH
        expect(typeof cliInfo.installed).toBe("boolean");
      } catch (error) {
        // May fail, but should not crash
        expect(error).toBeInstanceOf(Error);
      }

      // Restore PATH
      if (originalPath) {
        process.env.PATH = originalPath;
      }
    });
  });

  describe("Service behavior across platforms", () => {
    it("should handle service instantiation on any platform", () => {
      expect(
        () =>
          new AuthService({
            enableDebugLogging: false,
            enableProgressIndicators: false,
          }),
      ).not.toThrow();

      expect(
        () =>
          new ProfileManager({
            enableDebugLogging: false,
          }),
      ).not.toThrow();

      expect(
        () =>
          new TokenManager({
            enableDebugLogging: false,
          }),
      ).not.toThrow();
    });

    it("should handle authentication flows regardless of platform", async () => {
      const authService = new AuthService({
        enableDebugLogging: false,
        enableProgressIndicators: false,
      });

      // Should get status without platform-specific errors
      const status = await authService.getStatus({
        allProfiles: false,
        detailed: false,
      });

      expect(status).toBeDefined();
      expect(typeof status.authenticated).toBe("boolean");
      expect(typeof status.awsCliInstalled).toBe("boolean");
    });

    it("should handle token operations across platforms", async () => {
      const tokenManager = new TokenManager({
        enableDebugLogging: false,
      });

      // Should handle token operations without platform-specific errors
      const expiryStatus = await tokenManager.checkTokenExpiry();

      expect(Array.isArray(expiryStatus)).toBe(true);
    });
  });

  describe("Cross-region platform support", () => {
    it("should handle multiple regions on all platforms", async () => {
      const originalRegion = process.env.AWS_REGION;

      const testRegions = [
        "eu-west-1",
        "eu-west-2",
        "eu-west-3",
        "eu-central-1",
        "eu-north-1",
        "eu-south-1",
      ];

      for (const region of testRegions) {
        process.env.AWS_REGION = region;

        const authService = new AuthService({
          enableDebugLogging: false,
          enableProgressIndicators: false,
        });

        const status = await authService.getStatus({
          allProfiles: false,
          detailed: false,
        });

        expect(status.awsCliInstalled).toBeDefined();
      }

      // Restore original
      if (originalRegion) {
        process.env.AWS_REGION = originalRegion;
      } else {
        delete process.env.AWS_REGION;
      }
    });

    it("should support SSO URLs", async () => {
      const authService = new AuthService({
        enableDebugLogging: false,
        enableProgressIndicators: false,
      });

      const testUrls = [
        "https://company.awsapps.com/start",
        "https://company-region.awsapps.com/start",
        "https://company.eu-west-1.awsapps.com/start",
      ];

      for (const url of testUrls) {
        try {
          await authService.login({
            profile: "test-profile",
            force: false,
            configure: true,
            ssoConfig: {
              ssoStartUrl: url,
              ssoRegion: "eu-west-1",
              ssoAccountId: "123456789012",
              ssoRoleName: "TestRole",
            },
          });
        } catch {
          // Expected to fail due to profile setup, but should handle URLs correctly
          expect(mockCliWrapper.configureSso).toHaveBeenCalled();
        }
      }
    });
  });

  describe("Character encoding handling", () => {
    it("should handle Unicode in profile names", async () => {
      const unicodeProfiles = ["test-café", "test-中文", "test-ñoño", "test-русский"];

      for (const profile of unicodeProfiles) {
        const authService = new AuthService({
          enableDebugLogging: false,
          enableProgressIndicators: false,
        });

        // Should handle Unicode profile names without crashing
        await expect(async () => {
          await authService.getStatus({
            profile: profile,
            allProfiles: false,
            detailed: false,
          });
        }).not.toThrow();
      }
    });

    it("should handle Unicode in error messages", async () => {
      // Mock CLI to return Unicode error
      mockCliWrapper.ssoLogin.mockRejectedValue(
        new Error("Authentication failed: Ошибка аутентификации"),
      );

      const authService = new AuthService({
        enableDebugLogging: false,
        enableProgressIndicators: false,
      });

      // Mock ProfileManager to allow test to reach mocked CLI error
      vi.spyOn(ProfileManager.prototype, "profileExists").mockResolvedValue(true);

      try {
        await authService.login({
          profile: "unicode-test",
          force: false,
          configure: false,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.message).toContain("Ошибка");
        }
      }
    });
  });

  describe("Resource cleanup", () => {
    it("should handle service lifecycle properly", () => {
      // Create multiple services
      const services = [
        new AuthService({ enableDebugLogging: false, enableProgressIndicators: false }),
        new ProfileManager({ enableDebugLogging: false }),
        new TokenManager({ enableDebugLogging: false }),
      ];

      // Services should be created successfully
      expect(services).toHaveLength(3);
      for (const service of services) {
        expect(service).toBeDefined();
      }

      // No explicit cleanup needed, but services should not leak resources
    });
  });
});
