/**
 * Unit tests for authentication error system
 *
 * Tests the structured error types for AWS authentication operations with
 * user-friendly error messages and contextual guidance.
 */

import { describe, expect, it } from "vitest";
import {
  AuthenticationError,
  AwsCliError,
  ProfileError,
  TokenError,
  isAuthError,
} from "../../../src/lib/auth-errors.js";
import { getAuthErrorGuidance } from "../../../src/lib/auth-guidance.js";

describe("Authentication Error System", () => {
  describe("AuthenticationError", () => {
    it("should create authentication error with minimal parameters", () => {
      const error = new AuthenticationError("Authentication failed");

      expect(error.message).toBe("Authentication failed");
      expect(error.code).toBe("AUTHENTICATION_ERROR");
      expect(error.metadata.operation).toBeUndefined();
      expect(error.metadata.profile).toBeUndefined();
      expect(error.metadata.awsError).toBeUndefined();
    });

    it("should create authentication error with operation and profile", () => {
      const error = new AuthenticationError("SSO login failed", "sso-login", "dev-profile");

      expect(error.message).toBe("SSO login failed");
      expect(error.metadata.operation).toBe("sso-login");
      expect(error.metadata.profile).toBe("dev-profile");
    });

    it("should create authentication error with AWS error details", () => {
      const awsError = {
        name: "UnauthorizedOperation",
        message: "You are not authorized to perform this operation",
        statusCode: 403,
      };

      const error = new AuthenticationError(
        "AWS operation unauthorized",
        "credential-validation",
        "prod-profile",
        awsError,
      );

      expect(error.metadata.cause).toEqual(awsError);
    });

    it("should create authentication error with additional metadata", () => {
      const metadata = { region: "us-west-2", retryCount: 3 };
      const error = new AuthenticationError(
        "Regional auth failed",
        "sso-login",
        "test-profile",
        undefined,
        metadata,
      );

      expect(error.metadata.region).toBe("us-west-2");
      expect(error.metadata.retryCount).toBe(3);
    });
  });

  describe("ProfileError", () => {
    it("should create profile error with minimal parameters", () => {
      const error = new ProfileError("Profile operation failed");

      expect(error.message).toBe("Profile operation failed");
      expect(error.code).toBe("PROFILE_ERROR");
      expect(error.metadata.profileName).toBeUndefined();
    });

    it("should create profile error with profile name and operation", () => {
      const error = new ProfileError("Profile not found", "missing-profile", "profile-discovery");

      expect(error.metadata.profileName).toBe("missing-profile");
      expect(error.metadata.operation).toBe("profile-discovery");
    });

    it("should create profile error with profile configuration", () => {
      const profileConfig = {
        sso_start_url: "https://example.awsapps.com/start",
        sso_region: "us-east-1",
        sso_account_id: "123456789012",
        sso_role_name: "TestRole",
      };

      const error = new ProfileError(
        "Profile configuration invalid",
        "test-profile",
        "profile-validation",
        "/path/to/config",
        profileConfig,
      );

      expect(error.metadata.sso_start_url).toBe("https://example.awsapps.com/start");
    });
  });

  describe("TokenError", () => {
    it("should create token error with minimal parameters", () => {
      const error = new TokenError("Token operation failed");

      expect(error.message).toBe("Token operation failed");
      expect(error.code).toBe("TOKEN_ERROR");
      expect(error.metadata.tokenType).toBeUndefined();
    });

    it("should create token error with token type and operation", () => {
      const error = new TokenError("SSO token expired", "sso", "token-validation");

      expect(error.metadata.tokenType).toBe("sso");
      expect(error.metadata.operation).toBe("token-validation");
    });

    it("should create token error with expiry information", () => {
      const expiry = new Date("2025-01-01T12:00:00Z");
      const error = new TokenError("Token expires soon", "sso", "token-validation", expiry);

      expect(error.metadata.expiryTime).toBe("2025-01-01T12:00:00.000Z");
    });

    it("should create token error with additional metadata", () => {
      const metadata = { refreshAttempts: 2, lastRefresh: "2024-12-01T10:00:00Z" };
      const error = new TokenError(
        "Token refresh failed",
        "sso",
        "test-profile",
        undefined,
        metadata,
      );

      expect(error.metadata.refreshAttempts).toBe(2);
      expect(error.metadata.lastRefresh).toBe("2024-12-01T10:00:00Z");
    });
  });

  describe("AwsCliError", () => {
    it("should create AWS CLI error with minimal parameters", () => {
      const error = new AwsCliError("AWS CLI operation failed");

      expect(error.message).toBe("AWS CLI operation failed");
      expect(error.code).toBe("AWS_CLI_ERROR");
      expect(error.metadata.command).toBeUndefined();
    });

    it("should create AWS CLI error with command and exit code", () => {
      const error = new AwsCliError("Command not found", "aws --version", 127);

      expect(error.metadata.command).toBe("aws --version");
      expect(error.metadata.exitCode).toBe(127);
    });

    it("should create AWS CLI error with stdout and stderr", () => {
      const error = new AwsCliError(
        "Command failed",
        "aws sts get-caller-identity",
        255,
        "output line 1\noutput line 2",
        "error: credentials not found",
      );

      expect(error.metadata.stdout).toBe("output line 1\noutput line 2");
      expect(error.metadata.stderr).toBe("error: credentials not found");
    });

    it("should create AWS CLI error with additional metadata", () => {
      const metadata = { timeout: 30_000, signal: "SIGTERM" };
      const error = new AwsCliError("Command timed out", "aws sso login", 1, "", "", metadata);

      expect(error.metadata.timeout).toBe(30_000);
      expect(error.metadata.signal).toBe("SIGTERM");
    });
  });

  describe("getAuthErrorGuidance", () => {
    it("should provide guidance for AuthenticationError with sso-login operation", () => {
      const error = new AuthenticationError("SSO login failed", "sso-login", "dev-profile");

      const guidance = getAuthErrorGuidance(error);
      expect(guidance).toContain("aws configure sso");
      expect(guidance).toContain("aws sso login --profile");
    });

    it("should provide guidance for AuthenticationError with credential-validation operation", () => {
      const error = new AuthenticationError(
        "Credential validation failed",
        "credential-validation",
        "prod-profile",
      );

      const guidance = getAuthErrorGuidance(error);
      expect(guidance).toContain("Your AWS credentials have expired or are invalid");
      expect(guidance).toContain("aws sso login --profile");
    });

    it("should provide default guidance for AuthenticationError with unknown operation", () => {
      const error = new AuthenticationError(
        "Unknown auth error",
        "unknown-operation",
        "test-profile",
      );

      const guidance = getAuthErrorGuidance(error);
      expect(guidance).toContain("Authentication error occurred");
    });

    it("should provide guidance for ProfileError with profile-discovery operation", () => {
      const error = new ProfileError("Profile not found", "missing-profile", "profile-discovery");

      const guidance = getAuthErrorGuidance(error);
      expect(guidance).toContain("No AWS profiles found");
      expect(guidance).toContain("~/.aws/config");
    });

    it("should provide guidance for ProfileError with profile-switch operation", () => {
      const error = new ProfileError("Profile switch failed", "invalid-profile", "profile-switch");

      const guidance = getAuthErrorGuidance(error);
      expect(guidance).toContain("Profile switch failed");
      expect(guidance).toContain("List available profiles");
    });

    it("should provide guidance for TokenError", () => {
      const error = new TokenError("Token expired", "sso", "dev-profile");

      const guidance = getAuthErrorGuidance(error);
      expect(guidance).toContain("Token error occurred");
      expect(guidance).toContain("aws sso login --profile");
    });

    it("should provide guidance for AwsCliError with exit code 127", () => {
      const error = new AwsCliError("Command not found", "aws --version", 127);

      const guidance = getAuthErrorGuidance(error);
      expect(guidance).toContain("AWS CLI not found");
      expect(guidance).toContain("https://aws.amazon.com/cli/");
    });

    it("should provide guidance for AwsCliError with exit code 255", () => {
      const error = new AwsCliError("Auth failed", "aws sts get-caller-identity", 255);

      const guidance = getAuthErrorGuidance(error);
      expect(guidance).toContain("AWS CLI authentication failed");
      expect(guidance).toContain("Check network connectivity to AWS");
    });

    it("should provide default guidance for AwsCliError with other exit codes", () => {
      const error = new AwsCliError("Generic failure", "aws s3 ls", 1);

      const guidance = getAuthErrorGuidance(error);
      expect(guidance).toContain("AWS CLI operation failed");
      expect(guidance).toContain("Review error details above");
    });

    it("should provide fallback guidance for unknown error types", () => {
      const error = new Error("Unknown error");

      const guidance = getAuthErrorGuidance(error);
      expect(guidance).toContain("Unknown authentication error");
      expect(guidance).toContain("Check AWS configuration");
    });

    it("should provide specific guidance for TokenError with sso-token type", () => {
      const error = new TokenError("SSO token expired", "sso-token", "dev-profile");

      const guidance = getAuthErrorGuidance(error);
      expect(guidance).toContain("Your SSO token has expired");
      expect(guidance).toContain("Login again: aws sso login --profile <profile>");
      expect(guidance).toContain("aws sso logout then aws sso login");
      expect(guidance).toContain("SSO tokens expire automatically for security");
    });

    it("should provide guidance for AwsCliError with SSO commands", () => {
      const error = new AwsCliError("SSO command failed", "aws sso login --profile dev", 1);

      const guidance = getAuthErrorGuidance(error);
      expect(guidance).toContain("SSO command failed");
      expect(guidance).toContain("Check SSO URL is reachable in browser");
      expect(guidance).toContain("aws configure get sso_region");
      expect(guidance).toContain("aws sso login --no-browser");
      expect(guidance).toContain("SSO requires browser authentication by default");
    });

    it("should provide specific guidance for AuthenticationError with sso-configure operation", () => {
      const error = new AuthenticationError("SSO config failed", "sso-configure", "dev-profile");

      const guidance = getAuthErrorGuidance(error);
      expect(guidance).toContain("SSO configuration failed");
      expect(guidance).toContain("correct SSO start URL from your admin");
      expect(guidance).toContain("aws configure sso --profile dev-profile --no-browser");
      expect(guidance).toContain("Contact your AWS administrator if SSO details are unknown");
    });

    it("should provide specific guidance for AuthenticationError with token-refresh operation", () => {
      const error = new AuthenticationError(
        "Token refresh failed",
        "token-refresh",
        "prod-profile",
      );

      const guidance = getAuthErrorGuidance(error);
      expect(guidance).toContain("Token refresh failed");
      expect(guidance).toContain("aws sso logout --profile prod-profile");
      expect(guidance).toContain("aws sso login --profile prod-profile");
      expect(guidance).toContain("aws configure sso --profile prod-profile");
      expect(guidance).toContain("This often happens when SSO configuration has changed");
    });

    it("should provide specific guidance for ProfileError with profile-lookup operation", () => {
      const error = new ProfileError("Profile lookup failed", "missing-profile", "profile-lookup");

      const guidance = getAuthErrorGuidance(error);
      expect(guidance).toContain("Profile not found");
      expect(guidance).toContain("List profiles: aws-ts auth profiles");
      expect(guidance).toContain("Create profile: aws configure sso");
      expect(guidance).toContain("check spelling of 'missing-profile'");
      expect(guidance).toContain("Use 'default' if no specific profile is needed");
    });
  });

  describe("Error inheritance and type checking", () => {
    it("should work with instanceof checks", () => {
      const authError = new AuthenticationError("Test");
      const profileError = new ProfileError("Test");
      const tokenError = new TokenError("Test");
      const cliError = new AwsCliError("Test");

      expect(authError instanceof AuthenticationError).toBe(true);
      expect(profileError instanceof ProfileError).toBe(true);
      expect(tokenError instanceof TokenError).toBe(true);
      expect(cliError instanceof AwsCliError).toBe(true);

      // Cross-type checks should be false
      expect(authError instanceof ProfileError).toBe(false);
      expect(profileError instanceof TokenError).toBe(false);
      expect(tokenError instanceof AwsCliError).toBe(false);
    });

    it("should maintain error properties through inheritance", () => {
      const error = new AuthenticationError("Test auth", "sso-login", "test-profile");

      expect(error.message).toBe("Test auth");
      expect(error.code).toBe("AUTHENTICATION_ERROR");
      expect(error.name).toBe("AuthenticationError");
      expect(error.stack).toBeDefined();
    });
  });

  describe("isAuthError", () => {
    it("should return true for AuthenticationError instances", () => {
      const error = new AuthenticationError("Test auth error");
      expect(isAuthError(error)).toBe(true);
    });

    it("should return true for ProfileError instances", () => {
      const error = new ProfileError("Test profile error");
      expect(isAuthError(error)).toBe(true);
    });

    it("should return true for TokenError instances", () => {
      const error = new TokenError("Test token error");
      expect(isAuthError(error)).toBe(true);
    });

    it("should return true for AwsCliError instances", () => {
      const error = new AwsCliError("Test CLI error");
      expect(isAuthError(error)).toBe(true);
    });

    it("should return false for generic Error instances", () => {
      const error = new Error("Generic error");
      expect(isAuthError(error)).toBe(false);
    });

    it("should return false for non-Error objects", () => {
      expect(isAuthError("string error")).toBe(false);
      expect(isAuthError({ message: "object error" })).toBe(false);
      expect(isAuthError(null)).toBe(false);
      expect(isAuthError()).toBe(false);
      expect(isAuthError(42)).toBe(false);
    });

    it("should return false for custom error classes", () => {
      class CustomError extends Error {
        constructor(message: string) {
          super(message);
          this.name = "CustomError";
        }
      }

      const error = new CustomError("Custom error");
      expect(isAuthError(error)).toBe(false);
    });
  });
});
