/**
 * Unit tests for AuthService
 *
 * Tests high-level authentication orchestration with mocked service dependencies
 * for comprehensive workflow testing and error handling scenarios.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationError, ProfileError } from "../../../src/lib/auth-errors.js";
import type {
  AuthLogin,
  AuthLogout,
  AuthProfiles,
  AuthStatus,
  AuthSwitch,
} from "../../../src/lib/auth-schemas.js";
import { AuthCliWrapper } from "../../../src/services/auth-cli-wrapper.js";
import { AuthService } from "../../../src/services/auth-service.js";
import { CredentialService } from "../../../src/services/credential-service.js";
import { ProfileManager } from "../../../src/services/profile-manager.js";
import { TokenManager } from "../../../src/services/token-manager.js";

// Mock all service dependencies
vi.mock("../../../src/services/auth-cli-wrapper.js", () => ({
  AuthCliWrapper: vi.fn(),
}));

vi.mock("../../../src/services/credential-service.js", () => ({
  CredentialService: vi.fn(),
}));

vi.mock("../../../src/services/profile-manager.js", () => ({
  ProfileManager: vi.fn(),
}));

vi.mock("../../../src/services/token-manager.js", () => ({
  TokenManager: vi.fn(),
}));

// Mock ora spinner with stderr suppression
const mockSpinner = {
  start: vi.fn().mockReturnThis(),
  succeed: vi.fn().mockReturnThis(),
  fail: vi.fn().mockReturnThis(),
  warn: vi.fn().mockReturnThis(),
  stop: vi.fn().mockReturnThis(),
  text: "",
  isSpinning: false,
};

vi.mock("ora", () => ({
  default: vi.fn(() => mockSpinner),
}));

const mockAuthCliWrapper = {
  checkInstallation: vi.fn(),
  configureSso: vi.fn(),
  ssoLogin: vi.fn(),
  ssoLogout: vi.fn(),
};

const mockCredentialService = {
  getActiveProfile: vi.fn(),
  validateCredentials: vi.fn(),
  setActiveProfile: vi.fn(),
  clearCredentialCache: vi.fn(),
  clearAllCredentialCaches: vi.fn(),
};

const mockProfileManager = {
  profileExists: vi.fn(),
  discoverProfiles: vi.fn(),
  getSsoProfiles: vi.fn(),
  getProfileInfo: vi.fn(),
  switchProfile: vi.fn(),
  listProfiles: vi.fn(),
  getActiveProfile: vi.fn(),
};

const mockTokenManager = {
  getTokenStatus: vi.fn(),
};

describe("AuthService", () => {
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock console methods to prevent stderr contamination
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    // Setup mock constructors to return mock instances
    vi.mocked(AuthCliWrapper).mockReturnValue(mockAuthCliWrapper as any);
    vi.mocked(CredentialService).mockReturnValue(mockCredentialService as any);
    vi.mocked(ProfileManager).mockReturnValue(mockProfileManager as any);
    vi.mocked(TokenManager).mockReturnValue(mockTokenManager as any);

    authService = new AuthService({
      enableDebugLogging: false,
      enableProgressIndicators: false, // Disable for testing
    });
  });

  describe("login", () => {
    it("should perform successful login with existing profile", async () => {
      const loginInput: AuthLogin = {
        profile: "test-profile",
        force: false,
        configure: false,
      };

      mockAuthCliWrapper.checkInstallation.mockResolvedValue({
        installed: true,
        version: "2.15.30",
      });

      mockCredentialService.getActiveProfile.mockReturnValue("test-profile");
      mockProfileManager.profileExists.mockResolvedValue(true);
      mockCredentialService.validateCredentials.mockResolvedValue({
        userId: "test-user",
        account: "123456789012",
        arn: "arn:aws:iam::123456789012:user/test",
        profile: "test-profile",
      });

      await authService.login(loginInput);

      expect(mockAuthCliWrapper.checkInstallation).toHaveBeenCalled();
      expect(mockProfileManager.profileExists).toHaveBeenCalledWith("test-profile");
      expect(mockCredentialService.validateCredentials).toHaveBeenCalledWith("test-profile");
      expect(mockCredentialService.setActiveProfile).toHaveBeenCalledWith("test-profile");
      expect(mockAuthCliWrapper.ssoLogin).not.toHaveBeenCalled(); // Already authenticated
    });

    it("should perform login with SSO authentication when credentials invalid", async () => {
      const loginInput: AuthLogin = {
        profile: "test-profile",
        force: false,
        configure: false,
      };

      mockAuthCliWrapper.checkInstallation.mockResolvedValue({
        installed: true,
        version: "2.15.30",
      });

      mockCredentialService.getActiveProfile.mockReturnValue("test-profile");
      mockProfileManager.profileExists.mockResolvedValue(true);
      mockCredentialService.validateCredentials
        .mockRejectedValueOnce(
          new AuthenticationError("Invalid credentials", "credential-validation", "test-profile"),
        )
        .mockResolvedValueOnce({
          userId: "test-user",
          account: "123456789012",
          arn: "arn:aws:iam::123456789012:user/test",
          profile: "test-profile",
        });

      await authService.login(loginInput);

      expect(mockAuthCliWrapper.ssoLogin).toHaveBeenCalledWith("test-profile");
      expect(mockCredentialService.validateCredentials).toHaveBeenCalledTimes(2);
      expect(mockCredentialService.setActiveProfile).toHaveBeenCalledWith("test-profile");
    });

    it("should configure SSO profile when profile doesn't exist and configure flag is true", async () => {
      const ssoConfig = {
        ssoStartUrl: "https://example.awsapps.com/start",
        ssoRegion: "us-east-1",
        ssoAccountId: "123456789012",
        ssoRoleName: "PowerUserAccess",
        region: "us-west-2",
        output: "json",
      };

      const loginInput: AuthLogin = {
        profile: "new-profile",
        force: false,
        configure: true,
        ssoConfig,
      };

      mockAuthCliWrapper.checkInstallation.mockResolvedValue({
        installed: true,
        version: "2.15.30",
      });

      mockCredentialService.getActiveProfile.mockReturnValue("default");
      mockProfileManager.profileExists.mockResolvedValue(false);
      mockCredentialService.validateCredentials
        .mockRejectedValueOnce(
          new AuthenticationError("Invalid credentials", "credential-validation", "new-profile"),
        )
        .mockResolvedValueOnce({
          userId: "test-user",
          account: "123456789012",
          arn: "arn:aws:iam::123456789012:user/test",
          profile: "new-profile",
        });

      await authService.login(loginInput);

      expect(mockAuthCliWrapper.configureSso).toHaveBeenCalledWith("new-profile", ssoConfig);
      expect(mockAuthCliWrapper.ssoLogin).toHaveBeenCalledWith("new-profile");
      expect(mockCredentialService.setActiveProfile).toHaveBeenCalledWith("new-profile");
    });

    it("should force re-authentication when force flag is true", async () => {
      const loginInput: AuthLogin = {
        profile: "test-profile",
        force: true,
        configure: false,
      };

      mockAuthCliWrapper.checkInstallation.mockResolvedValue({
        installed: true,
        version: "2.15.30",
      });

      mockCredentialService.getActiveProfile.mockReturnValue("test-profile");
      mockProfileManager.profileExists.mockResolvedValue(true);
      mockCredentialService.validateCredentials.mockResolvedValue({
        userId: "test-user",
        account: "123456789012",
        arn: "arn:aws:iam::123456789012:user/test",
        profile: "test-profile",
      });

      await authService.login(loginInput);

      expect(mockAuthCliWrapper.ssoLogin).toHaveBeenCalledWith("test-profile");
      expect(mockCredentialService.validateCredentials).toHaveBeenCalledTimes(1); // Only final validation
    });

    it("should throw error when profile doesn't exist and no SSO config provided", async () => {
      const loginInput: AuthLogin = {
        profile: "nonexistent-profile",
        force: false,
        configure: true,
      };

      mockAuthCliWrapper.checkInstallation.mockResolvedValue({
        installed: true,
        version: "2.15.30",
      });

      mockCredentialService.getActiveProfile.mockReturnValue("default");
      mockProfileManager.profileExists.mockResolvedValue(false);

      await expect(authService.login(loginInput)).rejects.toThrow(AuthenticationError);
    });

    it("should handle AWS CLI installation failure", async () => {
      const loginInput: AuthLogin = {
        profile: "test-profile",
        force: false,
        configure: false,
      };

      mockAuthCliWrapper.checkInstallation.mockRejectedValue(new Error("AWS CLI not found"));

      await expect(authService.login(loginInput)).rejects.toThrow("AWS CLI not found");
    });
  });

  describe("getStatus", () => {
    it("should get status for single profile", async () => {
      const statusInput: AuthStatus = {
        profile: "test-profile",
        allProfiles: false,
      };

      mockAuthCliWrapper.checkInstallation.mockResolvedValue({
        installed: true,
        version: "2.15.30",
      });

      mockCredentialService.getActiveProfile.mockReturnValue("test-profile");
      mockProfileManager.getProfileInfo.mockResolvedValue({
        name: "test-profile",
        type: "sso",
        active: true,
        region: "us-east-1",
        ssoStartUrl: "https://example.awsapps.com/start",
        ssoRoleName: "PowerUserAccess",
        ssoAccountId: "123456789012",
      });

      mockCredentialService.validateCredentials.mockResolvedValue({
        userId: "test-user",
        account: "123456789012",
        arn: "arn:aws:iam::123456789012:user/test",
        profile: "test-profile",
      });

      mockTokenManager.getTokenStatus.mockResolvedValue({
        valid: true,
        expiresAt: new Date("2024-12-31T23:59:59Z"),
      });

      const result = await authService.getStatus(statusInput);

      expect(result).toEqual({
        activeProfile: "test-profile",
        profiles: [
          {
            name: "test-profile",
            type: "sso",
            active: true,
            region: "us-east-1",
            ssoStartUrl: "https://example.awsapps.com/start",
            ssoRoleName: "PowerUserAccess",
            ssoAccountId: "123456789012",
            credentialsValid: true,
            tokenExpiry: new Date("2024-12-31T23:59:59Z"),
          },
        ],
        authenticated: true,
        awsCliInstalled: true,
        awsCliVersion: "2.15.30",
      });
    });

    it("should get status for all profiles", async () => {
      const statusInput: AuthStatus = {
        allProfiles: true,
      };

      mockAuthCliWrapper.checkInstallation.mockResolvedValue({
        installed: true,
        version: "2.15.30",
      });

      mockCredentialService.getActiveProfile.mockReturnValue("profile1");
      mockProfileManager.discoverProfiles.mockResolvedValue([
        { name: "profile1", type: "sso" },
        { name: "profile2", type: "credentials" },
      ]);

      mockProfileManager.getProfileInfo
        .mockResolvedValueOnce({
          name: "profile1",
          type: "sso",
          active: true,
          region: "us-east-1",
        })
        .mockResolvedValueOnce({
          name: "profile2",
          type: "credentials",
          active: false,
          region: "us-west-2",
        });

      mockCredentialService.validateCredentials
        .mockResolvedValueOnce({
          userId: "user1",
          account: "123456789012",
          arn: "arn:aws:iam::123456789012:user/user1",
          profile: "profile1",
        })
        .mockRejectedValueOnce(
          new AuthenticationError("Invalid credentials", "credential-validation", "profile2"),
        );

      const result = await authService.getStatus(statusInput);

      expect(result.profiles).toHaveLength(2);
      expect(result.profiles[0].credentialsValid).toBe(true);
      expect(result.profiles[1].credentialsValid).toBe(false);
      expect(result.authenticated).toBe(true); // At least one profile is valid
    });

    it("should handle profile info retrieval failure gracefully", async () => {
      const statusInput: AuthStatus = {
        profile: "error-profile",
        allProfiles: false,
      };

      mockAuthCliWrapper.checkInstallation.mockResolvedValue({
        installed: true,
        version: "2.15.30",
      });

      mockCredentialService.getActiveProfile.mockReturnValue("error-profile");
      mockProfileManager.getProfileInfo.mockRejectedValue(new Error("Profile not found"));

      const result = await authService.getStatus(statusInput);

      expect(result.profiles[0]).toEqual({
        name: "error-profile",
        type: "credentials",
        active: true,
        credentialsValid: false,
      });
    });
  });

  describe("logout", () => {
    it("should logout from specific profile", async () => {
      const logoutInput: AuthLogout = {
        profile: "test-profile",
        allProfiles: false,
      };

      mockCredentialService.getActiveProfile.mockReturnValue("test-profile");

      await authService.logout(logoutInput);

      expect(mockAuthCliWrapper.ssoLogout).toHaveBeenCalledWith("test-profile");
      expect(mockCredentialService.clearCredentialCache).toHaveBeenCalledWith("test-profile");
    });

    it("should logout from all SSO profiles", async () => {
      const logoutInput: AuthLogout = {
        allProfiles: true,
      };

      mockProfileManager.getSsoProfiles.mockResolvedValue(["profile1", "profile2", "profile3"]);

      await authService.logout(logoutInput);

      expect(mockAuthCliWrapper.ssoLogout).toHaveBeenCalledTimes(3);
      expect(mockAuthCliWrapper.ssoLogout).toHaveBeenCalledWith("profile1");
      expect(mockAuthCliWrapper.ssoLogout).toHaveBeenCalledWith("profile2");
      expect(mockAuthCliWrapper.ssoLogout).toHaveBeenCalledWith("profile3");
      expect(mockCredentialService.clearAllCredentialCaches).toHaveBeenCalled();
    });

    it("should continue logout process even if individual profile logout fails", async () => {
      const logoutInput: AuthLogout = {
        allProfiles: true,
      };

      mockProfileManager.getSsoProfiles.mockResolvedValue(["profile1", "profile2"]);
      mockAuthCliWrapper.ssoLogout
        .mockRejectedValueOnce(new Error("Logout failed for profile1"))
        .mockResolvedValueOnce();

      // Should not throw even though one profile fails
      await authService.logout(logoutInput);

      expect(mockAuthCliWrapper.ssoLogout).toHaveBeenCalledTimes(2);
      expect(mockCredentialService.clearAllCredentialCaches).toHaveBeenCalled();
    });

    it("should fail spinner and throw error when logout operation fails", async () => {
      const authServiceWithSpinners = new AuthService({
        enableProgressIndicators: true,
      });

      const logoutInput: AuthLogout = {
        profile: "test-profile",
        allProfiles: false,
      };

      mockCredentialService.getActiveProfile.mockReturnValue("test-profile");
      mockAuthCliWrapper.ssoLogout.mockRejectedValue(new Error("Logout operation failed"));

      await expect(authServiceWithSpinners.logout(logoutInput)).rejects.toThrow(
        "Logout operation failed",
      );
      expect(mockSpinner.fail).toHaveBeenCalledWith("Logout failed");
    });

    it("should log debug messages when individual profile logout fails and debug enabled", async () => {
      const authServiceWithDebug = new AuthService({
        enableDebugLogging: true,
      });

      const logoutInput: AuthLogout = {
        allProfiles: true,
      };

      mockProfileManager.getSsoProfiles.mockResolvedValue(["profile1", "profile2"]);
      mockAuthCliWrapper.ssoLogout
        .mockRejectedValueOnce(new Error("Profile not found"))
        .mockRejectedValueOnce(new Error("Some other error"));

      const consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      await authServiceWithDebug.logout(logoutInput);

      expect(consoleSpy).toHaveBeenCalledWith(
        "Profile 'profile1' logout skipped - Profile not found",
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "Failed to logout from profile 'profile2':",
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("listProfiles", () => {
    it("should list all discovered profiles", async () => {
      const profilesInput: AuthProfiles = {
        activeOnly: false,
      };

      mockProfileManager.discoverProfiles.mockResolvedValue([
        { name: "profile1", type: "sso" },
        { name: "profile2", type: "credentials" },
      ]);

      mockProfileManager.getProfileInfo
        .mockResolvedValueOnce({
          name: "profile1",
          type: "sso",
          active: true,
          region: "us-east-1",
        })
        .mockResolvedValueOnce({
          name: "profile2",
          type: "credentials",
          active: false,
          region: "us-west-2",
        });

      mockCredentialService.validateCredentials
        .mockResolvedValueOnce({
          userId: "user1",
          account: "123456789012",
          arn: "arn:aws:iam::123456789012:user/user1",
          profile: "profile1",
        })
        .mockRejectedValueOnce(
          new AuthenticationError("Invalid credentials", "credential-validation", "profile2"),
        );

      const result = await authService.listProfiles(profilesInput);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("profile1");
      expect(result[0].credentialsValid).toBe(true);
      expect(result[1].name).toBe("profile2");
      expect(result[1].credentialsValid).toBe(false);
    });

    it("should filter profiles by active status when activeOnly is true", async () => {
      const profilesInput: AuthProfiles = {
        activeOnly: true,
      };

      mockProfileManager.discoverProfiles.mockResolvedValue([
        { name: "profile1", type: "sso" },
        { name: "profile2", type: "credentials" },
      ]);

      mockProfileManager.getProfileInfo
        .mockResolvedValueOnce({
          name: "profile1",
          type: "sso",
          active: true,
          region: "us-east-1",
        })
        .mockResolvedValueOnce({
          name: "profile2",
          type: "credentials",
          active: false,
          region: "us-west-2",
        });

      mockCredentialService.validateCredentials
        .mockResolvedValueOnce({
          userId: "user1",
          account: "123456789012",
          arn: "arn:aws:iam::123456789012:user/user1",
          profile: "profile1",
        })
        .mockRejectedValueOnce(
          new AuthenticationError("Invalid credentials", "credential-validation", "profile2"),
        );

      const result = await authService.listProfiles(profilesInput);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("profile1");
      expect(result[0].active).toBe(true);
    });

    it("should handle profile discovery failure with spinner", async () => {
      const profilesInput: AuthProfiles = {
        activeOnly: false,
      };

      const discoveryError = new Error("Profile discovery failed");
      mockProfileManager.discoverProfiles.mockRejectedValue(discoveryError);

      await expect(authService.listProfiles(profilesInput)).rejects.toThrow(
        "Profile discovery failed",
      );
    });
  });

  describe("switchProfile", () => {
    it("should switch to existing profile successfully", async () => {
      const switchInput: AuthSwitch = {
        profile: "target-profile",
        validate: false,
      };

      mockProfileManager.profileExists.mockResolvedValue(true);

      await authService.switchProfile(switchInput);

      expect(mockProfileManager.profileExists).toHaveBeenCalledWith("target-profile");
      expect(mockProfileManager.switchProfile).toHaveBeenCalledWith("target-profile");
      expect(mockCredentialService.setActiveProfile).toHaveBeenCalledWith("target-profile");
      expect(mockCredentialService.validateCredentials).not.toHaveBeenCalled();
    });

    it("should switch and validate profile when validate flag is true", async () => {
      const switchInput: AuthSwitch = {
        profile: "target-profile",
        validate: true,
      };

      mockProfileManager.profileExists.mockResolvedValue(true);
      mockCredentialService.validateCredentials.mockResolvedValue({
        userId: "test-user",
        account: "123456789012",
        arn: "arn:aws:iam::123456789012:user/test",
        profile: "target-profile",
      });

      await authService.switchProfile(switchInput);

      expect(mockProfileManager.switchProfile).toHaveBeenCalledWith("target-profile");
      expect(mockCredentialService.setActiveProfile).toHaveBeenCalledWith("target-profile");
      expect(mockCredentialService.validateCredentials).toHaveBeenCalledWith("target-profile");
    });

    it("should throw ProfileError when target profile doesn't exist", async () => {
      const switchInput: AuthSwitch = {
        profile: "nonexistent-profile",
        validate: false,
      };

      mockProfileManager.profileExists.mockResolvedValue(false);

      await expect(authService.switchProfile(switchInput)).rejects.toThrow(ProfileError);
      expect(mockProfileManager.switchProfile).not.toHaveBeenCalled();
    });

    it("should throw AuthenticationError when validation fails", async () => {
      const switchInput: AuthSwitch = {
        profile: "target-profile",
        validate: true,
      };

      mockProfileManager.profileExists.mockResolvedValue(true);
      mockCredentialService.validateCredentials.mockRejectedValue(
        new AuthenticationError("Invalid credentials", "credential-validation", "target-profile"),
      );

      await expect(authService.switchProfile(switchInput)).rejects.toThrow(AuthenticationError);
      expect(mockProfileManager.switchProfile).toHaveBeenCalledWith("target-profile");
    });
  });

  describe("error handling", () => {
    it("should wrap and re-throw AuthenticationError with guidance", async () => {
      const loginInput: AuthLogin = {
        profile: "test-profile",
        force: false,
        configure: false,
      };

      const originalError = new AuthenticationError(
        "Invalid credentials",
        "credential-validation",
        "test-profile",
      );

      mockAuthCliWrapper.checkInstallation.mockRejectedValue(originalError);

      try {
        await authService.login(loginInput);
        expect.fail("Should have thrown an error");
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError);
        expect((error as AuthenticationError).message).toContain("Resolution:");
      }
    });

    it("should re-throw non-AuthenticationError unchanged", async () => {
      const loginInput: AuthLogin = {
        profile: "test-profile",
        force: false,
        configure: false,
      };

      const originalError = new Error("Generic error");
      mockAuthCliWrapper.checkInstallation.mockRejectedValue(originalError);

      await expect(authService.login(loginInput)).rejects.toThrow("Generic error");
    });
  });

  describe("network failure scenarios", () => {
    it("should handle network timeout during AWS CLI operations", async () => {
      const loginInput: AuthLogin = {
        profile: "test-profile",
        force: false,
        configure: false,
      };

      const timeoutError = new Error("ETIMEDOUT: connect timeout");
      mockAuthCliWrapper.checkInstallation.mockRejectedValue(timeoutError);

      await expect(authService.login(loginInput)).rejects.toThrow("ETIMEDOUT");
    });

    it("should handle DNS resolution failures", async () => {
      const loginInput: AuthLogin = {
        profile: "test-profile",
        force: false,
        configure: false,
      };

      const dnsError = new Error("ENOTFOUND: getaddrinfo ENOTFOUND");
      mockAuthCliWrapper.checkInstallation.mockRejectedValue(dnsError);

      await expect(authService.login(loginInput)).rejects.toThrow("ENOTFOUND");
    });

    it("should handle connection refused errors", async () => {
      const loginInput: AuthLogin = {
        profile: "test-profile",
        force: false,
        configure: false,
      };

      const connectionError = new Error("ECONNREFUSED: connection refused");
      mockAuthCliWrapper.checkInstallation.mockRejectedValue(connectionError);

      await expect(authService.login(loginInput)).rejects.toThrow("ECONNREFUSED");
    });

    it("should handle SSL/TLS certificate errors", async () => {
      const loginInput: AuthLogin = {
        profile: "test-profile",
        force: false,
        configure: false,
      };

      const sslError = new Error("UNABLE_TO_VERIFY_LEAF_SIGNATURE");
      mockAuthCliWrapper.checkInstallation.mockRejectedValue(sslError);

      await expect(authService.login(loginInput)).rejects.toThrow(
        "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      );
    });
  });

  describe("API throttling and rate limiting scenarios", () => {
    it("should handle AWS API throttling errors", async () => {
      const loginInput: AuthLogin = {
        profile: "test-profile",
        force: false,
        configure: false,
      };

      mockAuthCliWrapper.checkInstallation.mockResolvedValue({
        installed: true,
        version: "2.15.30",
      });

      const throttlingError = new AuthenticationError(
        "Throttling: Rate exceeded",
        "aws-api-throttling",
        "test-profile",
      );
      mockCredentialService.validateCredentials.mockRejectedValue(throttlingError);

      await expect(authService.login(loginInput)).rejects.toThrow(AuthenticationError);
    });

    it("should handle service unavailable errors", async () => {
      const loginInput: AuthLogin = {
        profile: "test-profile",
        force: false,
        configure: false,
      };

      mockAuthCliWrapper.checkInstallation.mockResolvedValue({
        installed: true,
        version: "2.15.30",
      });

      const serviceError = new AuthenticationError(
        "ServiceUnavailable: The service is temporarily unavailable",
        "service-unavailable",
        "test-profile",
      );
      mockCredentialService.validateCredentials.mockRejectedValue(serviceError);

      await expect(authService.login(loginInput)).rejects.toThrow(AuthenticationError);
    });

    it("should handle AWS API limit exceeded errors", async () => {
      const profilesInput: AuthProfiles = {
        filter: "all",
        activeOnly: false,
        format: "table",
      };

      mockProfileManager.discoverProfiles.mockResolvedValue([{ name: "profile1", type: "sso" }]);

      mockProfileManager.getProfileInfo.mockResolvedValue({
        name: "profile1",
        type: "sso",
        active: true,
        region: "us-east-1",
      });

      const limitError = new AuthenticationError(
        "LimitExceeded: Account limit exceeded",
        "account-limit-exceeded",
        "profile1",
      );
      mockCredentialService.validateCredentials.mockRejectedValue(limitError);

      const result = await authService.listProfiles(profilesInput);

      expect(result).toHaveLength(1);
      expect(result[0].credentialsValid).toBe(false);
    });
  });

  describe("credential validation edge cases", () => {
    it("should handle expired token scenarios gracefully", async () => {
      const statusInput: AuthStatus = {
        profile: "test-profile",
        detailed: false,
      };

      mockProfileManager.getActiveProfile.mockResolvedValue("test-profile");
      mockProfileManager.getProfileInfo.mockResolvedValue({
        name: "test-profile",
        type: "sso",
        active: true,
        region: "us-east-1",
      });

      const expiredTokenError = new AuthenticationError(
        "Token has expired",
        "token-expired",
        "test-profile",
      );
      mockCredentialService.validateCredentials.mockRejectedValue(expiredTokenError);

      const result = await authService.getStatus(statusInput);

      expect(result.profiles).toHaveLength(1);
      expect(result.profiles[0].credentialsValid).toBe(false);
    });

    it("should handle insufficient permissions errors", async () => {
      const loginInput: AuthLogin = {
        profile: "test-profile",
        force: false,
        configure: false,
      };

      mockAuthCliWrapper.checkInstallation.mockResolvedValue({
        installed: true,
        version: "2.15.30",
      });

      const permissionError = new AuthenticationError(
        "AccessDenied: User is not authorized to perform action",
        "access-denied",
        "test-profile",
      );
      mockCredentialService.validateCredentials.mockRejectedValue(permissionError);

      await expect(authService.login(loginInput)).rejects.toThrow(AuthenticationError);
    });

    it("should handle region access restrictions", async () => {
      const statusInput: AuthStatus = {
        profile: "restricted-profile",
        detailed: true,
      };

      mockProfileManager.getActiveProfile.mockResolvedValue("restricted-profile");
      mockProfileManager.getProfileInfo.mockResolvedValue({
        name: "restricted-profile",
        type: "sso",
        active: true,
        region: "restricted-region",
      });

      const regionError = new AuthenticationError(
        "UnauthorizedOperation: Region access denied",
        "region-access-denied",
        "restricted-profile",
      );
      mockCredentialService.validateCredentials.mockRejectedValue(regionError);

      const result = await authService.getStatus(statusInput);

      expect(result.profiles[0].credentialsValid).toBe(false);
    });
  });

  describe("checkAwsCliStatus", () => {
    it("should return installation status when AWS CLI is installed", async () => {
      mockAuthCliWrapper.checkInstallation.mockResolvedValue({
        installed: true,
        version: "2.15.0",
      });

      // Access private method via type assertion for testing
      const result = await (authService as any).checkAwsCliStatus();

      expect(result).toEqual({
        installed: true,
        version: "2.15.0",
      });
      expect(mockAuthCliWrapper.checkInstallation).toHaveBeenCalled();
    });

    it("should return installed false when AWS CLI check fails", async () => {
      mockAuthCliWrapper.checkInstallation.mockRejectedValue(new Error("CLI not found"));

      // Access private method via type assertion for testing
      const result = await (authService as any).checkAwsCliStatus();

      expect(result).toEqual({
        installed: false,
      });
      expect(mockAuthCliWrapper.checkInstallation).toHaveBeenCalled();
    });

    it("should return installed false when checkInstallation throws non-Error", async () => {
      mockAuthCliWrapper.checkInstallation.mockRejectedValue("string error");

      // Access private method via type assertion for testing
      const result = await (authService as any).checkAwsCliStatus();

      expect(result).toEqual({
        installed: false,
      });
      expect(mockAuthCliWrapper.checkInstallation).toHaveBeenCalled();
    });
  });

  describe("createSpinner", () => {
    it("should create mock spinner when progress indicators disabled", () => {
      const authServiceWithoutSpinners = new AuthService({
        enableProgressIndicators: false,
      });

      // Access private method via type assertion for testing
      const spinner = (authServiceWithoutSpinners as any).createSpinner("test");

      expect(typeof spinner.succeed).toBe("function");
      expect(typeof spinner.fail).toBe("function");
      expect(typeof spinner.warn).toBe("function");
    });

    it("should create real ora spinner when progress indicators enabled", () => {
      const authServiceWithSpinners = new AuthService({
        enableProgressIndicators: true,
      });

      // Access private method via type assertion for testing
      (authServiceWithSpinners as any).createSpinner("test");

      expect(mockSpinner.start).toHaveBeenCalled();
    });
  });
});
