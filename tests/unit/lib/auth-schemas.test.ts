/**
 * Unit tests for authentication schemas
 *
 * Tests Zod validation schemas for authentication commands and operations
 * with comprehensive validation scenarios and error handling.
 */

import { describe, expect, it } from "vitest";
import {
  AuthLoginSchema,
  AuthLogoutSchema,
  AuthProfilesSchema,
  AuthStatusResponseSchema,
  AuthStatusSchema,
  AuthSwitchSchema,
  ProfileInfoSchema,
  SsoConfigSchema,
  validateProfileInfo,
  validateSsoConfig,
} from "../../../src/lib/auth-schemas.js";

describe("Authentication Schemas", () => {
  describe("SsoConfigSchema", () => {
    it("should validate valid SSO configuration", () => {
      const validConfig = {
        ssoStartUrl: "https://example.awsapps.com/start",
        ssoRegion: "us-east-1",
        ssoAccountId: "123456789012",
        ssoRoleName: "PowerUserAccess",
      };

      const result = SsoConfigSchema.parse(validConfig);
      expect(result).toEqual(validConfig);
    });

    it("should reject invalid SSO start URL - not HTTPS", () => {
      const invalidConfig = {
        // eslint-disable-next-line sonarjs/no-clear-text-protocols
        ssoStartUrl: "http://example.awsapps.com/start",
        ssoRegion: "us-east-1",
        ssoAccountId: "123456789012",
        ssoRoleName: "PowerUserAccess",
      };

      expect(() => SsoConfigSchema.parse(invalidConfig)).toThrow(
        "SSO start URL must be a valid HTTPS URL",
      );
    });

    it("should reject invalid SSO start URL - malformed URL", () => {
      const invalidConfig = {
        ssoStartUrl: "not-a-url",
        ssoRegion: "us-east-1",
        ssoAccountId: "123456789012",
        ssoRoleName: "PowerUserAccess",
      };

      expect(() => SsoConfigSchema.parse(invalidConfig)).toThrow(
        "SSO start URL must be a valid HTTPS URL",
      );
    });

    it("should reject invalid SSO region", () => {
      const invalidConfig = {
        ssoStartUrl: "https://example.awsapps.com/start",
        ssoRegion: "INVALID-REGION",
        ssoAccountId: "123456789012",
        ssoRoleName: "PowerUserAccess",
      };

      expect(() => SsoConfigSchema.parse(invalidConfig)).toThrow(
        "SSO region must contain only lowercase letters, numbers, and hyphens",
      );
    });

    it("should reject empty SSO region", () => {
      const invalidConfig = {
        ssoStartUrl: "https://example.awsapps.com/start",
        ssoRegion: "",
        ssoAccountId: "123456789012",
        ssoRoleName: "PowerUserAccess",
      };

      expect(() => SsoConfigSchema.parse(invalidConfig)).toThrow("SSO region is required");
    });

    it("should reject invalid SSO account ID", () => {
      const invalidConfig = {
        ssoStartUrl: "https://example.awsapps.com/start",
        ssoRegion: "us-east-1",
        ssoAccountId: "12345",
        ssoRoleName: "PowerUserAccess",
      };

      expect(() => SsoConfigSchema.parse(invalidConfig)).toThrow(
        "SSO account ID must be a 12-digit number",
      );
    });

    it("should reject empty SSO role name", () => {
      const invalidConfig = {
        ssoStartUrl: "https://example.awsapps.com/start",
        ssoRegion: "us-east-1",
        ssoAccountId: "123456789012",
        ssoRoleName: "",
      };

      expect(() => SsoConfigSchema.parse(invalidConfig)).toThrow("SSO role name is required");
    });

    it("should reject SSO role name that is too long", () => {
      const invalidConfig = {
        ssoStartUrl: "https://example.awsapps.com/start",
        ssoRegion: "us-east-1",
        ssoAccountId: "123456789012",
        ssoRoleName: "A".repeat(65), // 65 characters
      };

      expect(() => SsoConfigSchema.parse(invalidConfig)).toThrow(
        "SSO role name must be 64 characters or less",
      );
    });
  });

  describe("AuthLoginSchema", () => {
    it("should validate minimal login configuration", () => {
      const result = AuthLoginSchema.parse({});

      expect(result.force).toBe(false);
      expect(result.configure).toBe(false);
      expect(result.profile).toBeUndefined();
      expect(result.ssoConfig).toBeUndefined();
    });

    it("should validate login with profile", () => {
      const loginData = {
        profile: "production",
        force: true,
      };

      const result = AuthLoginSchema.parse(loginData);
      expect(result.profile).toBe("production");
      expect(result.force).toBe(true);
      expect(result.configure).toBe(false);
    });

    it("should validate login with SSO configuration", () => {
      const loginData = {
        configure: true,
        ssoConfig: {
          ssoStartUrl: "https://example.awsapps.com/start",
          ssoRegion: "us-east-1",
          ssoAccountId: "123456789012",
          ssoRoleName: "PowerUserAccess",
        },
      };

      const result = AuthLoginSchema.parse(loginData);
      expect(result.configure).toBe(true);
      expect(result.ssoConfig).toEqual(loginData.ssoConfig);
    });
  });

  describe("AuthStatusSchema", () => {
    it("should validate minimal status configuration", () => {
      const result = AuthStatusSchema.parse({});

      expect(result.detailed).toBe(false);
      expect(result.allProfiles).toBe(false);
      expect(result.profile).toBeUndefined();
    });

    it("should validate status with profile and detailed", () => {
      const statusData = {
        profile: "staging",
        detailed: true,
        allProfiles: false,
      };

      const result = AuthStatusSchema.parse(statusData);
      expect(result).toEqual(statusData);
    });
  });

  describe("AuthLogoutSchema", () => {
    it("should validate minimal logout configuration", () => {
      const result = AuthLogoutSchema.parse({});

      expect(result.allProfiles).toBe(false);
      expect(result.profile).toBeUndefined();
    });

    it("should validate logout with all profiles", () => {
      const logoutData = {
        allProfiles: true,
      };

      const result = AuthLogoutSchema.parse(logoutData);
      expect(result.allProfiles).toBe(true);
    });
  });

  describe("AuthProfilesSchema", () => {
    it("should validate minimal profiles configuration", () => {
      const result = AuthProfilesSchema.parse({});

      expect(result.detailed).toBe(false);
      expect(result.activeOnly).toBe(false);
      expect(result.format).toBe("table");
    });

    it("should validate profiles with custom format", () => {
      const profilesData = {
        detailed: true,
        activeOnly: true,
        format: "json" as const,
      };

      const result = AuthProfilesSchema.parse(profilesData);
      expect(result).toEqual(profilesData);
    });

    it("should reject invalid format", () => {
      const invalidData = {
        format: "invalid",
      };

      expect(() => AuthProfilesSchema.parse(invalidData)).toThrow();
    });
  });

  describe("AuthSwitchSchema", () => {
    it("should validate switch with profile", () => {
      const switchData = {
        profile: "development",
      };

      const result = AuthSwitchSchema.parse(switchData);
      expect(result.profile).toBe("development");
      expect(result.validate).toBe(true);
      expect(result.setDefault).toBe(false);
    });

    it("should validate switch with all options", () => {
      const switchData = {
        profile: "production",
        validate: false,
        setDefault: true,
      };

      const result = AuthSwitchSchema.parse(switchData);
      expect(result).toEqual(switchData);
    });

    it("should require profile parameter", () => {
      expect(() => AuthSwitchSchema.parse({})).toThrow();
    });
  });

  describe("ProfileInfoSchema", () => {
    it("should validate minimal profile information", () => {
      const profileInfo = {
        name: "test-profile",
        type: "sso" as const,
        active: true,
        credentialsValid: false,
      };

      const result = ProfileInfoSchema.parse(profileInfo);
      expect(result).toEqual(profileInfo);
    });

    it("should validate complete profile information", () => {
      const profileInfo = {
        name: "production-profile",
        type: "iam" as const,
        active: false,
        credentialsValid: true,
        tokenExpiry: new Date("2024-12-31T23:59:59Z"),
        region: "eu-west-1",
        output: "json",
        ssoStartUrl: "https://example.awsapps.com/start",
        ssoRegion: "us-east-1",
        ssoAccountId: "123456789012",
        ssoRoleName: "PowerUserAccess",
        ssoSession: "dev-session",
        roleArn: "arn:aws:iam::123456789012:role/ProductionRole",
        sourceProfile: "default",
      };

      const result = ProfileInfoSchema.parse(profileInfo);
      expect(result).toEqual(profileInfo);
    });

    it("should reject invalid profile type", () => {
      const invalidProfileInfo = {
        name: "test-profile",
        type: "invalid",
        active: true,
        credentialsValid: false,
      };

      expect(() => ProfileInfoSchema.parse(invalidProfileInfo)).toThrow();
    });

    it("should reject invalid SSO start URL in ProfileInfo", () => {
      const invalidProfileInfo = {
        name: "test-profile",
        type: "sso" as const,
        active: true,
        credentialsValid: false,
        ssoStartUrl: "not-a-url",
      };

      expect(() => ProfileInfoSchema.parse(invalidProfileInfo)).toThrow(
        "SSO start URL must be a valid URL",
      );
    });

    it("should accept valid SSO start URL in ProfileInfo", () => {
      const validProfileInfo = {
        name: "test-profile",
        type: "sso" as const,
        active: true,
        credentialsValid: false,
        ssoStartUrl: "https://example.awsapps.com/start",
      };

      const result = ProfileInfoSchema.parse(validProfileInfo);
      expect(result.ssoStartUrl).toBe("https://example.awsapps.com/start");
    });
  });

  describe("AuthStatusResponseSchema", () => {
    it("should validate minimal status response", () => {
      const statusResponse = {
        profiles: [],
        authenticated: false,
        awsCliInstalled: true,
      };

      const result = AuthStatusResponseSchema.parse(statusResponse);
      expect(result.activeProfile).toBeUndefined();
      expect(result.awsCliVersion).toBeUndefined();
      expect(result.profiles).toEqual([]);
      expect(result.authenticated).toBe(false);
      expect(result.awsCliInstalled).toBe(true);
    });

    it("should validate complete status response", () => {
      const statusResponse = {
        activeProfile: "production",
        profiles: [
          {
            name: "production",
            type: "sso" as const,
            active: true,
            credentialsValid: true,
          },
        ],
        authenticated: true,
        awsCliInstalled: true,
        awsCliVersion: "2.15.0",
      };

      const result = AuthStatusResponseSchema.parse(statusResponse);
      expect(result).toEqual(statusResponse);
    });
  });

  describe("validateSsoConfig", () => {
    it("should validate valid SSO configuration", () => {
      const validConfig = {
        ssoStartUrl: "https://example.awsapps.com/start",
        ssoRegion: "us-east-1",
        ssoAccountId: "123456789012",
        ssoRoleName: "PowerUserAccess",
      };

      const result = validateSsoConfig(validConfig);
      expect(result).toEqual(validConfig);
    });

    it("should throw error for invalid SSO configuration", () => {
      const invalidConfig = {
        ssoStartUrl: "invalid-url",
        ssoRegion: "us-east-1",
        ssoAccountId: "123456789012",
        ssoRoleName: "PowerUserAccess",
      };

      expect(() => validateSsoConfig(invalidConfig)).toThrow();
    });

    it("should throw error for missing required fields", () => {
      const invalidConfig = {
        ssoStartUrl: "https://example.awsapps.com/start",
        // Missing other required fields
      };

      expect(() => validateSsoConfig(invalidConfig)).toThrow();
    });
  });

  describe("validateProfileInfo", () => {
    it("should validate valid profile information", () => {
      const validProfileInfo = {
        name: "test-profile",
        type: "sso",
        active: true,
        credentialsValid: false,
      };

      const result = validateProfileInfo(validProfileInfo);
      expect(result).toEqual(validProfileInfo);
    });

    it("should throw error for invalid profile information", () => {
      const invalidProfileInfo = {
        name: "test-profile",
        type: "invalid-type",
        active: true,
        credentialsValid: false,
      };

      expect(() => validateProfileInfo(invalidProfileInfo)).toThrow();
    });

    it("should throw error for missing required fields", () => {
      const invalidProfileInfo = {
        name: "test-profile",
        // Missing other required fields
      };

      expect(() => validateProfileInfo(invalidProfileInfo)).toThrow();
    });

    it("should validate profile info with SSO URL validation", () => {
      const validProfileInfo = {
        name: "test-profile",
        type: "sso",
        active: true,
        credentialsValid: false,
        ssoStartUrl: "https://valid-url.com",
      };

      const result = validateProfileInfo(validProfileInfo);
      expect(result.ssoStartUrl).toBe("https://valid-url.com");
    });

    it("should reject profile info with invalid SSO URL", () => {
      const invalidProfileInfo = {
        name: "test-profile",
        type: "sso",
        active: true,
        credentialsValid: false,
        ssoStartUrl: "invalid-url-format",
      };

      expect(() => validateProfileInfo(invalidProfileInfo)).toThrow(
        "SSO start URL must be a valid URL",
      );
    });
  });
});
