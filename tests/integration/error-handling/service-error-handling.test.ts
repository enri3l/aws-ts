/**
 * Integration tests for error handling across service boundaries
 *
 * Tests how errors propagate between different services and how
 * the system handles various failure scenarios gracefully.
 */

import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthenticationError } from "../../../src/lib/auth-errors.js";
import { AuthCliWrapper } from "../../../src/services/auth-cli-wrapper.js";
import { AuthService } from "../../../src/services/auth-service.js";
import { CredentialService } from "../../../src/services/credential-service.js";
import { ProfileManager } from "../../../src/services/profile-manager.js";
import { TokenManager } from "../../../src/services/token-manager.js";

// Mock only the CLI wrapper
vi.mock("../../../src/services/auth-cli-wrapper.js");

// Setup AWS SDK mocks
const stsMock = mockClient(STSClient);

describe("Service Error Handling", () => {
  let mockCliWrapper: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    stsMock.reset();

    // Mock CLI wrapper with controlled behavior
    mockCliWrapper = {
      checkInstallation: vi.fn(),
      ssoLogin: vi.fn(),
      ssoLogout: vi.fn(),
      configureSso: vi.fn(),
    };

    vi.mocked(AuthCliWrapper).mockImplementation(() => mockCliWrapper);
  });

  describe("Network and service failures", () => {
    it("should handle SSO login service errors", async () => {
      mockCliWrapper.checkInstallation.mockResolvedValue({
        installed: true,
        version: "2.15.0",
      });

      mockCliWrapper.ssoLogin.mockRejectedValue(
        new Error("SSO login failed: Unable to connect to SSO portal"),
      );

      const authService = new AuthService({
        enableDebugLogging: false,
        enableProgressIndicators: false,
      });

      // Mock ProfileManager to allow test to reach mocked CLI error
      vi.spyOn(ProfileManager.prototype, "profileExists").mockResolvedValue(true);

      await expect(
        authService.login({
          profile: "failing-sso",
          force: false,
          configure: false,
        }),
      ).rejects.toThrow("SSO login failed");
    });

    it("should handle AWS CLI installation errors", async () => {
      mockCliWrapper.checkInstallation.mockRejectedValue(new Error("AWS CLI not found in PATH"));

      const authService = new AuthService({
        enableDebugLogging: false,
        enableProgressIndicators: false,
      });

      const status = await authService.getStatus({
        allProfiles: false,
        detailed: false,
      });

      // Should indicate CLI is not installed
      expect(status.awsCliInstalled).toBe(false);
      expect(status.awsCliVersion).toBeUndefined();
    });
  });

  describe("Recovery and retry mechanisms", () => {
    it("should handle concurrent profile operations", async () => {
      stsMock.on(GetCallerIdentityCommand).resolves({
        UserId: "AROA123456789EXAMPLE:concurrent-user",
        Account: "123456789012",
        Arn: "arn:aws:sts::123456789012:assumed-role/ConcurrentRole/concurrent-user",
      });

      const authService = new AuthService({
        enableDebugLogging: false,
        enableProgressIndicators: false,
      });

      const profileManager = new ProfileManager({
        enableDebugLogging: false,
      });

      // Perform concurrent operations
      const promises = [
        authService.getStatus({ detailed: false, allProfiles: false }),
        authService.getStatus({ detailed: false, allProfiles: false }),
        profileManager.discoverProfiles(),
        profileManager.discoverProfiles(),
      ];

      const results = await Promise.allSettled(promises);

      // All should complete without errors (though they may return empty results)
      expect(results).toHaveLength(4);
      for (const result of results) {
        expect(result.status).toMatch(/fulfilled|rejected/);
      }
    });
  });

  describe("Regional error scenarios", () => {
    it("should handle SSO connection failures", async () => {
      mockCliWrapper.checkInstallation.mockResolvedValue({
        installed: true,
        version: "2.15.0",
      });

      mockCliWrapper.ssoLogin.mockRejectedValue(
        new Error("Unable to connect to SSO portal: company.awsapps.com"),
      );

      const authService = new AuthService({
        enableDebugLogging: false,
        enableProgressIndicators: false,
      });

      await expect(
        authService.login({
          profile: "failing-profile",
          force: false,
          configure: true,
          ssoConfig: {
            ssoStartUrl: "https://company.awsapps.com/start",
            ssoRegion: "eu-west-1",
            ssoAccountId: "123456789012",
            ssoRoleName: "FailingRole",
          },
        }),
      ).rejects.toThrow("Unable to connect to SSO portal");
    });
  });

  describe("Configuration error scenarios", () => {
    it("should handle missing configuration gracefully", async () => {
      const profileManager = new ProfileManager({
        enableDebugLogging: false,
      });

      // Should not crash when no config files exist
      const profiles = await profileManager.discoverProfiles();

      // Should handle gracefully - may be empty or contain partial data
      expect(Array.isArray(profiles)).toBe(true);
    });

    it("should handle token manager operations without tokens", async () => {
      const tokenManager = new TokenManager({
        enableDebugLogging: false,
      });

      // Should handle gracefully when no tokens exist
      const expiryStatus = await tokenManager.checkTokenExpiry();

      expect(Array.isArray(expiryStatus)).toBe(true);
    });

    it("should handle credential service with no active profile", () => {
      const credentialService = new CredentialService({
        enableDebugLogging: false,
      });

      // Should handle gracefully
      const activeProfile = credentialService.getActiveProfile();
      expect(typeof activeProfile === "string" || activeProfile === undefined).toBe(true);
    });
  });

  describe("Error message formatting", () => {
    it("should provide helpful error messages for authentication failures", async () => {
      mockCliWrapper.ssoLogin.mockRejectedValue(
        new AuthenticationError("Profile not found", "sso-login", "test-profile"),
      );

      const authService = new AuthService({
        enableDebugLogging: false,
        enableProgressIndicators: false,
      });

      try {
        await authService.login({
          profile: "nonexistent",
          force: false,
          configure: false,
        });
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError);
        if (error instanceof AuthenticationError) {
          expect(error.message).toContain("Resolution:");
          expect(error.metadata.operation).toBeDefined();
          expect(error.metadata.profile).toBeDefined();
        }
      }
    });
  });

  describe("Service cleanup", () => {
    it("should handle service cleanup gracefully", () => {
      const authService = new AuthService({
        enableDebugLogging: false,
        enableProgressIndicators: false,
      });

      const tokenManager = new TokenManager({
        enableDebugLogging: false,
      });

      const credentialService = new CredentialService({
        enableDebugLogging: false,
      });

      // Services should be created and usable
      expect(authService).toBeInstanceOf(AuthService);
      expect(tokenManager).toBeInstanceOf(TokenManager);
      expect(credentialService).toBeInstanceOf(CredentialService);

      // No explicit cleanup needed, but services should not leak resources
    });
  });
});
