/**
 * Unit tests for authentication validation checks
 *
 * Tests credential validation, SSO token expiry checking, and profile switching
 * capabilities with comprehensive mocking of authentication services.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckExecutionError } from "../../../../../src/lib/diagnostic-errors.js";
import { AuthService } from "../../../../../src/services/auth-service.js";
import {
  CredentialValidationCheck,
  ProfileSwitchCheck,
  SsoTokenExpiryCheck,
} from "../../../../../src/services/doctor/checks/authentication-checks.js";
import type { DoctorContext } from "../../../../../src/services/doctor/types.js";
import { TokenManager } from "../../../../../src/services/token-manager.js";

// Mock external dependencies
vi.mock("../../../../../src/services/auth-service.js", () => ({
  AuthService: vi.fn(),
}));

vi.mock("../../../../../src/services/token-manager.js", () => ({
  TokenManager: vi.fn(),
}));

const mockAuthService = {
  getStatus: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  getProfiles: vi.fn(),
  switchProfile: vi.fn(),
};

const mockTokenManager = {
  getTokenStatus: vi.fn(),
  checkTokenExpiry: vi.fn(),
  clearExpiredTokens: vi.fn(),
};

describe("Authentication Checks", () => {
  let context: DoctorContext;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default context
    context = {
      profile: "test-profile",
      detailed: false,
    };

    // Setup mock constructors
    vi.mocked(AuthService).mockReturnValue(mockAuthService as any);
    vi.mocked(TokenManager).mockReturnValue(mockTokenManager as any);
  });

  describe("CredentialValidationCheck", () => {
    let credentialCheck: CredentialValidationCheck;

    beforeEach(() => {
      credentialCheck = new CredentialValidationCheck();
    });

    describe("properties", () => {
      it("should have correct metadata", () => {
        expect(credentialCheck.id).toBe("credential-validation");
        expect(credentialCheck.name).toBe("Credential Validation");
        expect(credentialCheck.description).toBe(
          "Validates AWS credential configuration and authentication status",
        );
        expect(credentialCheck.stage).toBe("authentication");
      });
    });

    describe("execute", () => {
      it("should pass for authenticated user with valid credentials", async () => {
        const mockAuthStatus = {
          authenticated: true,
          activeProfile: "test-profile",
          profiles: [
            {
              name: "test-profile",
              type: "access-key",
              credentialsValid: true,
              region: "us-east-1",
              tokenExpiry: undefined,
            },
          ],
        };

        mockAuthService.getStatus.mockResolvedValue(mockAuthStatus);

        const result = await credentialCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.message).toBe("Credentials are valid for profile 'test-profile'");
        expect(result.details).toEqual({
          activeProfile: "test-profile",
          profileType: "access-key",
          credentialsValid: true,
          region: "us-east-1",
          tokenExpiry: undefined,
          totalProfiles: 1,
        });

        expect(mockAuthService.getStatus).toHaveBeenCalledWith({
          profile: "test-profile",
          detailed: false,
          allProfiles: false,
        });
      });

      it("should pass for SSO profile with valid credentials", async () => {
        const mockAuthStatus = {
          authenticated: true,
          activeProfile: "sso-profile",
          profiles: [
            {
              name: "sso-profile",
              type: "sso",
              credentialsValid: true,
              region: "us-west-2",
              tokenExpiry: "2025-12-31T23:59:59Z",
            },
          ],
        };

        mockAuthService.getStatus.mockResolvedValue(mockAuthStatus);

        const ssoContext = { ...context, profile: "sso-profile" };
        const result = await credentialCheck.execute(ssoContext);

        expect(result.status).toBe("pass");
        expect(result.message).toBe("Credentials are valid for profile 'sso-profile'");
        expect(result.details?.profileType).toBe("sso");
        expect(result.details?.tokenExpiry).toBe("2025-12-31T23:59:59Z");
      });

      it("should fail when target profile not found", async () => {
        const mockAuthStatus = {
          authenticated: false,
          activeProfile: "default",
          profiles: [
            { name: "default", type: "access-key", credentialsValid: true },
            { name: "production", type: "sso", credentialsValid: true },
          ],
        };

        mockAuthService.getStatus.mockResolvedValue(mockAuthStatus);

        const missingProfileContext = { ...context, profile: "non-existent" };
        const result = await credentialCheck.execute(missingProfileContext);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("Profile 'non-existent' not found");
        expect(result.details).toEqual({
          targetProfile: "non-existent",
          availableProfiles: ["default", "production"],
          authenticated: false,
        });
        expect(result.remediation).toContain("Configure profile 'non-existent'");
      });

      it("should fail for SSO profile with invalid credentials", async () => {
        const mockAuthStatus = {
          authenticated: false,
          activeProfile: "sso-profile",
          profiles: [
            {
              name: "sso-profile",
              type: "sso",
              credentialsValid: false,
              tokenExpiry: "2025-01-01T00:00:00Z",
            },
          ],
        };

        mockAuthService.getStatus.mockResolvedValue(mockAuthStatus);

        const ssoContext = { ...context, profile: "sso-profile" };
        const result = await credentialCheck.execute(ssoContext);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("Credentials are invalid for profile 'sso-profile'");
        expect(result.details).toEqual({
          targetProfile: "sso-profile",
          profileType: "sso",
          credentialsValid: false,
          tokenExpiry: "2025-01-01T00:00:00Z",
          authenticated: false,
        });
        expect(result.remediation).toContain("aws sso login --profile sso-profile");
      });

      it("should fail for access-key profile with invalid credentials", async () => {
        const mockAuthStatus = {
          authenticated: false,
          activeProfile: "access-key-profile",
          profiles: [
            {
              name: "access-key-profile",
              type: "access-key",
              credentialsValid: false,
            },
          ],
        };

        mockAuthService.getStatus.mockResolvedValue(mockAuthStatus);

        const accessKeyContext = { ...context, profile: "access-key-profile" };
        const result = await credentialCheck.execute(accessKeyContext);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("Credentials are invalid for profile 'access-key-profile'");
        expect(result.remediation).toContain("aws configure");
      });

      it("should fail for authentication errors with valid credentials", async () => {
        const mockAuthStatus = {
          authenticated: false,
          activeProfile: "test-profile",
          awsCliInstalled: true,
          profiles: [
            {
              name: "test-profile",
              type: "access-key",
              credentialsValid: true,
            },
          ],
        };

        mockAuthService.getStatus.mockResolvedValue(mockAuthStatus);

        const result = await credentialCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("Authentication failed for profile 'test-profile'");
        expect(result.details).toEqual({
          targetProfile: "test-profile",
          profileType: "access-key",
          credentialsValid: true,
          authenticated: false,
          awsCliInstalled: true,
        });
        expect(result.remediation).toContain("Check AWS service connectivity");
      });

      it("should handle context without profile specification", async () => {
        const mockAuthStatus = {
          authenticated: true,
          activeProfile: "default",
          profiles: [
            {
              name: "default",
              type: "access-key",
              credentialsValid: true,
              region: "us-east-1",
            },
          ],
        };

        mockAuthService.getStatus.mockResolvedValue(mockAuthStatus);

        const contextWithoutProfile = { ...context, profile: undefined };
        const result = await credentialCheck.execute(contextWithoutProfile);

        expect(result.status).toBe("pass");
        expect(result.details?.activeProfile).toBe("default");
      });

      it("should throw CheckExecutionError for AuthService failures", async () => {
        mockAuthService.getStatus.mockRejectedValue(new Error("AuthService failed"));

        await expect(credentialCheck.execute(context)).rejects.toThrow(CheckExecutionError);
      });
    });
  });

  describe("SsoTokenExpiryCheck", () => {
    let tokenExpiryCheck: SsoTokenExpiryCheck;

    beforeEach(() => {
      tokenExpiryCheck = new SsoTokenExpiryCheck();
    });

    describe("properties", () => {
      it("should have correct metadata", () => {
        expect(tokenExpiryCheck.id).toBe("sso-token-expiry");
        expect(tokenExpiryCheck.name).toBe("SSO Token Expiry");
        expect(tokenExpiryCheck.description).toBe(
          "Checks SSO token expiry status and warns of approaching expiration",
        );
        expect(tokenExpiryCheck.stage).toBe("authentication");
      });
    });

    describe("execute", () => {
      it("should pass for valid SSO token", async () => {
        const mockTokenStatus = {
          profileName: "test-profile",
          hasToken: true,
          isValid: true,
          isNearExpiry: false,
          expiresAt: "2025-12-31T23:59:59Z",
          timeUntilExpiry: 1000 * 60 * 60 * 24 * 30, // 30 days
          startUrl: "https://test.awsapps.com/start",
        };

        mockTokenManager.checkTokenExpiry.mockResolvedValue([]);
        mockTokenManager.getTokenStatus.mockResolvedValue(mockTokenStatus);

        const result = await tokenExpiryCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.message).toBe("SSO token for profile 'test-profile' is valid");
        expect(result.details).toEqual({
          profileName: "test-profile",
          hasToken: true,
          isValid: true,
          isNearExpiry: false,
          expiresAt: "2025-12-31T23:59:59Z",
          timeUntilExpiry: 1000 * 60 * 60 * 24 * 30,
        });
      });

      it("should warn for missing SSO token", async () => {
        const mockTokenStatus = {
          profileName: "test-profile",
          hasToken: false,
          isValid: false,
        };

        mockTokenManager.checkTokenExpiry.mockResolvedValue([]);
        mockTokenManager.getTokenStatus.mockResolvedValue(mockTokenStatus);

        const result = await tokenExpiryCheck.execute(context);

        expect(result.status).toBe("warn");
        expect(result.message).toBe("No SSO token found for profile 'test-profile'");
        expect(result.details).toEqual({
          profileName: "test-profile",
          hasToken: false,
          isValid: false,
        });
        expect(result.remediation).toContain("aws sso login --profile test-profile");
      });

      it("should fail for expired SSO token", async () => {
        const mockTokenStatus = {
          profileName: "test-profile",
          hasToken: true,
          isValid: false,
          expiresAt: "2025-01-01T00:00:00Z",
          startUrl: "https://test.awsapps.com/start",
        };

        mockTokenManager.checkTokenExpiry.mockResolvedValue([]);
        mockTokenManager.getTokenStatus.mockResolvedValue(mockTokenStatus);

        const result = await tokenExpiryCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("SSO token has expired for profile 'test-profile'");
        expect(result.details).toEqual({
          profileName: "test-profile",
          hasToken: true,
          isValid: false,
          expiresAt: "2025-01-01T00:00:00Z",
          startUrl: "https://test.awsapps.com/start",
        });
        expect(result.remediation).toContain("aws sso login --profile test-profile");
      });

      it("should warn for token near expiry", async () => {
        const mockTokenStatus = {
          profileName: "test-profile",
          hasToken: true,
          isValid: true,
          isNearExpiry: true,
          expiresAt: "2025-02-01T12:00:00Z",
          timeUntilExpiry: 1000 * 60 * 60 * 6, // 6 hours
        };

        mockTokenManager.checkTokenExpiry.mockResolvedValue([]);
        mockTokenManager.getTokenStatus.mockResolvedValue(mockTokenStatus);

        const result = await tokenExpiryCheck.execute(context);

        expect(result.status).toBe("warn");
        expect(result.message).toBe("SSO token for profile 'test-profile' expires in 6 hours");
        expect(result.details).toEqual({
          profileName: "test-profile",
          hasToken: true,
          isValid: true,
          isNearExpiry: true,
          expiresAt: "2025-02-01T12:00:00Z",
          timeUntilExpiry: 1000 * 60 * 60 * 6,
        });
        expect(result.remediation).toContain("Consider refreshing the token");
      });

      it("should pass when no profile specified and no expired tokens", async () => {
        mockTokenManager.checkTokenExpiry.mockResolvedValue([]);

        const contextWithoutProfile = { ...context, profile: undefined };
        const result = await tokenExpiryCheck.execute(contextWithoutProfile);

        expect(result.status).toBe("pass");
        expect(result.message).toBe("No expired SSO tokens found");
        expect(result.details).toEqual({
          expiredTokensCount: 0,
          checkedProfiles: 0,
        });
      });

      it("should fail when multiple tokens are expired", async () => {
        const expiredTokens = [
          { profileName: "profile1", status: "expired" },
          { profileName: "profile2", status: "expired" },
          { profileName: "profile3", status: "near-expiry" },
        ];

        mockTokenManager.checkTokenExpiry.mockResolvedValue(expiredTokens);

        const contextWithoutProfile = { ...context, profile: undefined };
        const result = await tokenExpiryCheck.execute(contextWithoutProfile);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("2 SSO tokens have expired");
        expect(result.details).toEqual({
          expiredTokensCount: 2,
          nearExpiryCount: 1,
          expiredProfiles: ["profile1", "profile2"],
          nearExpiryProfiles: ["profile3"],
        });
        expect(result.remediation).toContain("Run 'aws sso login' for each expired profile");
      });

      it("should warn when only tokens near expiry", async () => {
        const nearExpiryTokens = [
          { profileName: "profile1", status: "near-expiry" },
          { profileName: "profile2", status: "near-expiry" },
        ];

        mockTokenManager.checkTokenExpiry.mockResolvedValue(nearExpiryTokens);

        const contextWithoutProfile = { ...context, profile: undefined };
        const result = await tokenExpiryCheck.execute(contextWithoutProfile);

        expect(result.status).toBe("warn");
        expect(result.message).toBe("2 SSO tokens are approaching expiration");
        expect(result.details).toEqual({
          expiredTokensCount: 0,
          nearExpiryCount: 2,
          nearExpiryProfiles: ["profile1", "profile2"],
        });
        expect(result.remediation).toContain("Consider refreshing tokens");
      });

      it("should throw CheckExecutionError for TokenManager failures", async () => {
        mockTokenManager.checkTokenExpiry.mockRejectedValue(new Error("TokenManager failed"));

        await expect(tokenExpiryCheck.execute(context)).rejects.toThrow(CheckExecutionError);
      });
    });
  });

  describe("ProfileSwitchCheck", () => {
    let profileSwitchCheck: ProfileSwitchCheck;

    beforeEach(() => {
      profileSwitchCheck = new ProfileSwitchCheck();
    });

    describe("properties", () => {
      it("should have correct metadata", () => {
        expect(profileSwitchCheck.id).toBe("profile-switch");
        expect(profileSwitchCheck.name).toBe("Profile Switching");
        expect(profileSwitchCheck.description).toBe(
          "Validates profile switching capability and configuration consistency",
        );
        expect(profileSwitchCheck.stage).toBe("authentication");
      });
    });

    describe("execute", () => {
      it("should pass for multiple valid profiles", async () => {
        const mockAuthStatus = {
          profiles: [
            { name: "default", type: "access-key", credentialsValid: true },
            { name: "production", type: "sso", credentialsValid: true },
            { name: "development", type: "sso", credentialsValid: true },
          ],
          activeProfile: "default",
        };

        mockAuthService.getStatus.mockResolvedValue(mockAuthStatus);

        const contextWithoutProfile = { ...context, profile: undefined };
        const result = await profileSwitchCheck.execute(contextWithoutProfile);

        expect(result.status).toBe("pass");
        expect(result.message).toBe("All 3 profiles are configured and accessible for switching");
        expect(result.details).toEqual({
          availableProfiles: 3,
          validProfiles: 3,
          invalidProfiles: 0,
          currentActiveProfile: "default",
          profileNames: ["default", "production", "development"],
        });

        expect(mockAuthService.getStatus).toHaveBeenCalledWith({
          allProfiles: true,
          detailed: false,
        });
      });

      it("should pass for single valid profile", async () => {
        const mockAuthStatus = {
          profiles: [{ name: "default", type: "access-key", credentialsValid: true }],
          activeProfile: "default",
        };

        mockAuthService.getStatus.mockResolvedValue(mockAuthStatus);

        const contextWithoutProfile = { ...context, profile: undefined };
        const result = await profileSwitchCheck.execute(contextWithoutProfile);

        expect(result.status).toBe("pass");
        expect(result.message).toBe("Single profile 'default' is configured and accessible");
        expect(result.details).toEqual({
          availableProfiles: 1,
          currentActiveProfile: "default",
          profileName: "default",
          profileType: "access-key",
          credentialsValid: true,
        });
      });

      it("should pass for valid target profile", async () => {
        const mockAuthStatus = {
          profiles: [
            { name: "default", type: "access-key", credentialsValid: true },
            { name: "test-profile", type: "sso", credentialsValid: true },
            { name: "production", type: "sso", credentialsValid: false },
          ],
          activeProfile: "default",
        };

        mockAuthService.getStatus.mockResolvedValue(mockAuthStatus);

        const result = await profileSwitchCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.message).toBe("Profile switching to 'test-profile' is available");
        expect(result.details).toEqual({
          targetProfile: "test-profile",
          profileType: "sso",
          credentialsValid: true,
          currentActiveProfile: "default",
          availableProfiles: 2,
          validProfiles: 2,
        });
      });

      it("should fail when no profiles available", async () => {
        const mockAuthStatus = {
          profiles: [],
          activeProfile: undefined,
        };

        mockAuthService.getStatus.mockResolvedValue(mockAuthStatus);

        const result = await profileSwitchCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("No profiles available for switching");
        expect(result.details).toEqual({
          availableProfiles: 0,
          currentActiveProfile: undefined,
        });
        expect(result.remediation).toContain("Configure at least one AWS profile");
      });

      it("should fail when target profile not found", async () => {
        const mockAuthStatus = {
          profiles: [
            { name: "default", type: "access-key", credentialsValid: true },
            { name: "production", type: "sso", credentialsValid: true },
          ],
          activeProfile: "default",
        };

        mockAuthService.getStatus.mockResolvedValue(mockAuthStatus);

        const missingProfileContext = { ...context, profile: "non-existent" };
        const result = await profileSwitchCheck.execute(missingProfileContext);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("Target profile 'non-existent' not found");
        expect(result.details).toEqual({
          targetProfile: "non-existent",
          availableProfiles: 2,
          profileNames: ["default", "production"],
        });
        expect(result.remediation).toContain(
          "Use one of the available profiles: default, production",
        );
      });

      it("should fail for target profile with invalid credentials", async () => {
        const mockAuthStatus = {
          profiles: [
            { name: "default", type: "access-key", credentialsValid: true },
            { name: "test-profile", type: "sso", credentialsValid: false },
          ],
          activeProfile: "default",
        };

        mockAuthService.getStatus.mockResolvedValue(mockAuthStatus);

        const result = await profileSwitchCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("Target profile 'test-profile' has invalid credentials");
        expect(result.details).toEqual({
          targetProfile: "test-profile",
          profileType: "sso",
          credentialsValid: false,
          currentActiveProfile: "default",
        });
        expect(result.remediation).toContain("aws sso login --profile test-profile");
      });

      it("should fail when no profiles have valid credentials", async () => {
        const mockAuthStatus = {
          profiles: [
            { name: "profile1", type: "access-key", credentialsValid: false },
            { name: "profile2", type: "sso", credentialsValid: false },
          ],
          activeProfile: "profile1",
        };

        mockAuthService.getStatus.mockResolvedValue(mockAuthStatus);

        const contextWithoutProfile = { ...context, profile: undefined };
        const result = await profileSwitchCheck.execute(contextWithoutProfile);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("No profiles have valid credentials for switching");
        expect(result.details).toEqual({
          availableProfiles: 2,
          validProfiles: 0,
          invalidProfiles: 2,
          invalidProfileNames: ["profile1", "profile2"],
        });
        expect(result.remediation).toContain("Authenticate profiles using 'aws sso login'");
      });

      it("should warn when some profiles have credential issues", async () => {
        const mockAuthStatus = {
          profiles: [
            { name: "valid-profile", type: "access-key", credentialsValid: true },
            { name: "invalid-profile1", type: "sso", credentialsValid: false },
            { name: "invalid-profile2", type: "access-key", credentialsValid: false },
          ],
          activeProfile: "valid-profile",
        };

        mockAuthService.getStatus.mockResolvedValue(mockAuthStatus);

        const contextWithoutProfile = { ...context, profile: undefined };
        const result = await profileSwitchCheck.execute(contextWithoutProfile);

        expect(result.status).toBe("warn");
        expect(result.message).toBe("2 of 3 profiles have credential issues");
        expect(result.details).toEqual({
          availableProfiles: 3,
          validProfiles: 1,
          invalidProfiles: 2,
          validProfileNames: ["valid-profile"],
          invalidProfileNames: ["invalid-profile1", "invalid-profile2"],
          currentActiveProfile: "valid-profile",
        });
        expect(result.remediation).toContain("Fix credential issues for invalid profiles");
      });

      it("should handle remediation for different profile types", async () => {
        const mockAuthStatus = {
          profiles: [{ name: "test-profile", type: "access-key", credentialsValid: false }],
          activeProfile: undefined,
        };

        mockAuthService.getStatus.mockResolvedValue(mockAuthStatus);

        const accessKeyContext = { ...context, profile: "test-profile" };
        const result = await profileSwitchCheck.execute(accessKeyContext);

        expect(result.status).toBe("fail");
        expect(result.remediation).toContain("aws configure");
      });

      it("should throw CheckExecutionError for AuthService failures", async () => {
        mockAuthService.getStatus.mockRejectedValue(new Error("AuthService failed"));

        await expect(profileSwitchCheck.execute(context)).rejects.toThrow(CheckExecutionError);
      });
    });
  });
});
