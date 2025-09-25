/**
 * Unit tests for CredentialService
 *
 * Tests AWS SDK credential integration with mocked credential providers
 * and client factory methods for service operations.
 */

import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationError, ServiceError } from "../../../src/lib/auth-errors.js";
import { CredentialService } from "../../../src/services/credential-service.js";

// Mock AWS SDK modules
vi.mock("@aws-sdk/client-sts", () => ({
  STSClient: vi.fn(),
  GetCallerIdentityCommand: vi.fn(),
}));

vi.mock("@aws-sdk/credential-providers", () => ({
  fromNodeProviderChain: vi.fn(),
}));

const mockSTSClient = vi.mocked(STSClient);
// mockGetCallerIdentityCommand is mocked but not directly used in tests
const mockFromNodeProviderChain = vi.mocked(fromNodeProviderChain);

describe("CredentialService", () => {
  let credentialService: CredentialService;
  let mockCredentialProvider: vi.MockedFunction<any>;
  let mockStsClientInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock credential provider
    mockCredentialProvider = vi.fn();
    mockFromNodeProviderChain.mockReturnValue(mockCredentialProvider);

    // Setup mock STS client
    mockStsClientInstance = {
      send: vi.fn(),
    };
    mockSTSClient.mockReturnValue(mockStsClientInstance);

    credentialService = new CredentialService({
      defaultRegion: "us-east-1",
      defaultProfile: "default",
      enableDebugLogging: false,
      credentialProviderOptions: {
        timeout: 30_000,
        maxRetries: 3,
      },
    });
  });

  describe("getCredentials", () => {
    it("should get credentials for default profile", async () => {
      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        sessionToken: "session-token-example",
        expiration: new Date("2024-01-01T12:00:00Z"),
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);

      const result = await credentialService.getCredentials();

      expect(result).toEqual(mockCredentials);
      expect(mockFromNodeProviderChain).toHaveBeenCalledWith({
        profile: "default",
        timeout: 30_000,
        maxRetries: 3,
      });
    });

    it("should get credentials for specific profile", async () => {
      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);

      const result = await credentialService.getCredentials("custom-profile");

      expect(result).toEqual(mockCredentials);
      expect(mockFromNodeProviderChain).toHaveBeenCalledWith({
        profile: "custom-profile",
        timeout: 30_000,
        maxRetries: 3,
      });
    });

    it("should cache credential providers", async () => {
      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);

      // First call
      await credentialService.getCredentials("test-profile");

      // Second call should use cached provider
      await credentialService.getCredentials("test-profile");

      expect(mockFromNodeProviderChain).toHaveBeenCalledTimes(1);
      expect(mockCredentialProvider).toHaveBeenCalledTimes(2);
    });

    it("should clear cache on credential error", async () => {
      mockCredentialProvider.mockRejectedValue(new Error("Credential resolution failed"));

      await expect(credentialService.getCredentials("test-profile")).rejects.toThrow(
        AuthenticationError,
      );

      // Provider should be called again on retry (cache cleared)
      mockCredentialProvider.mockResolvedValue({
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      });

      await credentialService.getCredentials("test-profile");

      expect(mockFromNodeProviderChain).toHaveBeenCalledTimes(2);
    });

    it("should handle credential provider errors", async () => {
      mockCredentialProvider.mockRejectedValue(new Error("No credentials found"));

      await expect(credentialService.getCredentials("invalid-profile")).rejects.toThrow(
        AuthenticationError,
      );
      expect(mockCredentialProvider).toHaveBeenCalled();
    });

    it("should use environment credentials when AWS_ACCESS_KEY_ID is set", async () => {
      const originalEnvironment = process.env.AWS_ACCESS_KEY_ID;
      process.env.AWS_ACCESS_KEY_ID = "AKIATEST123EXAMPLE";

      const mockCredentials = {
        accessKeyId: "AKIATEST123EXAMPLE",
        secretAccessKey: "testSecretAccessKey",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);

      try {
        const result = await credentialService.getCredentials();

        expect(result).toEqual(mockCredentials);
        // Should call without profile parameter when AWS_ACCESS_KEY_ID is set
        expect(mockFromNodeProviderChain).toHaveBeenCalledWith({
          timeout: 30_000,
          maxRetries: 3,
        });
      } finally {
        if (originalEnvironment === undefined) {
          delete process.env.AWS_ACCESS_KEY_ID;
        } else {
          process.env.AWS_ACCESS_KEY_ID = originalEnvironment;
        }
      }
    });
  });

  describe("createStsClient", () => {
    it("should create STS client with default configuration", async () => {
      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);

      const result = await credentialService.createStsClient();

      expect(result).toBe(mockStsClientInstance);
      expect(mockSTSClient).toHaveBeenCalledWith({
        region: "us-east-1",
        credentials: mockCredentials,
      });
    });

    it("should create STS client with custom configuration", async () => {
      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);

      const config = {
        region: "us-west-2",
        profile: "custom-profile",
        endpoint: "https://custom-endpoint.com",
        clientConfig: {
          maxAttempts: 5,
        },
      };

      const result = await credentialService.createStsClient(config);

      expect(result).toBe(mockStsClientInstance);
      expect(mockSTSClient).toHaveBeenCalledWith({
        region: "us-west-2",
        credentials: mockCredentials,
        maxAttempts: 5,
        endpoint: "https://custom-endpoint.com",
      });
    });

    it("should handle client creation errors", async () => {
      mockCredentialProvider.mockRejectedValue(new Error("Credential error"));

      await expect(credentialService.createStsClient()).rejects.toThrow(ServiceError);
    });
  });

  describe("validateCredentials", () => {
    it("should validate credentials successfully", async () => {
      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      const mockCallerIdentity = {
        UserId: "AIDACKCEVSQ6C2EXAMPLE",
        Account: "123456789012",
        Arn: "arn:aws:iam::123456789012:user/test-user",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);
      mockStsClientInstance.send.mockResolvedValue(mockCallerIdentity);

      const result = await credentialService.validateCredentials("test-profile");

      expect(result).toEqual({
        userId: "AIDACKCEVSQ6C2EXAMPLE",
        account: "123456789012",
        arn: "arn:aws:iam::123456789012:user/test-user",
        profile: "test-profile",
      });

      expect(mockStsClientInstance.send).toHaveBeenCalledWith(expect.any(GetCallerIdentityCommand));
    });

    it("should handle incomplete caller identity response", async () => {
      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      const incompleteResponse = {
        UserId: "AIDACKCEVSQ6C2EXAMPLE",
        // Missing Account and Arn
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);
      mockStsClientInstance.send.mockResolvedValue(incompleteResponse);

      await expect(credentialService.validateCredentials("test-profile")).rejects.toThrow(
        AuthenticationError,
      );
    });

    it("should handle STS API errors", async () => {
      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);
      mockStsClientInstance.send.mockRejectedValue(
        new Error("The security token included in the request is invalid"),
      );

      await expect(credentialService.validateCredentials("test-profile")).rejects.toThrow(
        AuthenticationError,
      );
    });

    it("should validate credentials without profile name", async () => {
      const originalEnvironment = process.env.AWS_ACCESS_KEY_ID;
      process.env.AWS_ACCESS_KEY_ID = "AKIATEST123EXAMPLE";

      const mockCredentials = {
        accessKeyId: "AKIATEST123EXAMPLE",
        secretAccessKey: "testSecretAccessKey",
      };

      const mockCallerIdentity = {
        UserId: "AIDACKCEVSQ6C2EXAMPLE",
        Account: "123456789012",
        Arn: "arn:aws:iam::123456789012:user/test-user",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);
      mockStsClientInstance.send.mockResolvedValue(mockCallerIdentity);

      try {
        const result = await credentialService.validateCredentials();

        // Should not include profile property when no profile name provided
        expect(result).toEqual({
          userId: "AIDACKCEVSQ6C2EXAMPLE",
          account: "123456789012",
          arn: "arn:aws:iam::123456789012:user/test-user",
        });
        expect(result).not.toHaveProperty("profile");
      } finally {
        if (originalEnvironment === undefined) {
          delete process.env.AWS_ACCESS_KEY_ID;
        } else {
          process.env.AWS_ACCESS_KEY_ID = originalEnvironment;
        }
      }
    });
  });

  describe("hasValidCredentials", () => {
    it("should return true for valid credentials", async () => {
      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      const mockCallerIdentity = {
        UserId: "AIDACKCEVSQ6C2EXAMPLE",
        Account: "123456789012",
        Arn: "arn:aws:iam::123456789012:user/test-user",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);
      mockStsClientInstance.send.mockResolvedValue(mockCallerIdentity);

      const result = await credentialService.hasValidCredentials("test-profile");

      expect(result).toBe(true);
    });

    it("should return false for invalid credentials", async () => {
      mockCredentialProvider.mockRejectedValue(new Error("No credentials found"));

      const result = await credentialService.hasValidCredentials("test-profile");

      expect(result).toBe(false);
    });
  });

  describe("cache management", () => {
    it("should clear credential cache for specific profile", () => {
      // This method is synchronous, so we just verify it doesn't throw
      expect(() => credentialService.clearCredentialCache("test-profile")).not.toThrow();
    });

    it("should clear credential cache for undefined profile (environment credentials)", () => {
      // This should trigger the profileName ?? "env" branch in cacheKey
      expect(() => credentialService.clearCredentialCache()).not.toThrow();
    });

    it("should clear all credential caches", () => {
      expect(() => credentialService.clearAllCredentialCaches()).not.toThrow();
    });
  });

  describe("profile management", () => {
    it("should get active profile from environment", () => {
      const originalProfile = process.env.AWS_PROFILE;
      process.env.AWS_PROFILE = "test-profile";

      const result = credentialService.getActiveProfile();

      expect(result).toBe("test-profile");

      // Restore original environment
      if (originalProfile) {
        process.env.AWS_PROFILE = originalProfile;
      } else {
        delete process.env.AWS_PROFILE;
      }
    });

    it("should set active profile", () => {
      const originalProfile = process.env.AWS_PROFILE;

      credentialService.setActiveProfile("new-profile");

      expect(process.env.AWS_PROFILE).toBe("new-profile");

      // Restore original environment
      if (originalProfile) {
        process.env.AWS_PROFILE = originalProfile;
      } else {
        delete process.env.AWS_PROFILE;
      }
    });

    it("should use default profile when none set", () => {
      const originalProfile = process.env.AWS_PROFILE;
      delete process.env.AWS_PROFILE;

      const result = credentialService.getActiveProfile();

      expect(result).toBe("default");

      // Restore original environment
      if (originalProfile) {
        process.env.AWS_PROFILE = originalProfile;
      }
    });
  });

  describe("createClient", () => {
    it("should create generic AWS client with credentials", async () => {
      const MockAWSClient = vi.fn();
      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);

      const result = await credentialService.createClient(MockAWSClient, {
        region: "us-west-2",
        profile: "test-profile",
      });

      expect(MockAWSClient).toHaveBeenCalledWith({
        region: "us-west-2",
        credentials: mockCredentials,
      });
      expect(result).toBeInstanceOf(MockAWSClient);
    });

    it("should handle client creation errors", async () => {
      const MockAWSClient = vi.fn().mockImplementation(() => {
        throw new Error("Client initialization failed");
      });

      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);

      await expect(credentialService.createClient(MockAWSClient)).rejects.toThrow(ServiceError);
    });

    it("should create AWS client with endpoint configuration", async () => {
      const MockAWSClient = vi.fn();
      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);

      const result = await credentialService.createClient(MockAWSClient, {
        region: "us-east-1",
        profile: "test-profile",
        endpoint: "https://custom-endpoint.amazonaws.com",
        clientConfig: {
          maxAttempts: 3,
        },
      });

      expect(MockAWSClient).toHaveBeenCalledWith({
        region: "us-east-1",
        credentials: mockCredentials,
        maxAttempts: 3,
        endpoint: "https://custom-endpoint.amazonaws.com",
      });
      expect(result).toBeInstanceOf(MockAWSClient);
    });
  });

  describe("testCredentialChain", () => {
    it("should test credential chain successfully", async () => {
      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      const mockCallerIdentity = {
        UserId: "AIDACKCEVSQ6C2EXAMPLE",
        Account: "123456789012",
        Arn: "arn:aws:iam::123456789012:user/test-user",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);
      mockStsClientInstance.send.mockResolvedValue(mockCallerIdentity);

      const result = await credentialService.testCredentialChain("test-profile");

      expect(result).toEqual({
        profile: "test-profile",
        credentialsAvailable: true,
        providerUsed: "node-provider-chain",
        identity: {
          userId: "AIDACKCEVSQ6C2EXAMPLE",
          account: "123456789012",
          arn: "arn:aws:iam::123456789012:user/test-user",
          profile: "test-profile",
        },
      });
    });

    it("should handle credential chain failure", async () => {
      mockCredentialProvider.mockRejectedValue(new Error("No credentials found"));

      const result = await credentialService.testCredentialChain("test-profile");

      expect(result).toEqual({
        profile: "test-profile",
        credentialsAvailable: false,
        providerUsed: "unknown",
      });
    });

    it("should test credential chain successfully without profile name", async () => {
      const originalEnvironment = process.env.AWS_ACCESS_KEY_ID;
      process.env.AWS_ACCESS_KEY_ID = "AKIATEST123EXAMPLE";

      const mockCredentials = {
        accessKeyId: "AKIATEST123EXAMPLE",
        secretAccessKey: "testSecretAccessKey",
      };

      const mockCallerIdentity = {
        UserId: "AIDACKCEVSQ6C2EXAMPLE",
        Account: "123456789012",
        Arn: "arn:aws:iam::123456789012:user/test-user",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);
      mockStsClientInstance.send.mockResolvedValue(mockCallerIdentity);

      try {
        const result = await credentialService.testCredentialChain();

        expect(result).toEqual({
          credentialsAvailable: true,
          providerUsed: "node-provider-chain",
          identity: {
            userId: "AIDACKCEVSQ6C2EXAMPLE",
            account: "123456789012",
            arn: "arn:aws:iam::123456789012:user/test-user",
          },
        });
        expect(result).not.toHaveProperty("profile");
        expect(result.identity).not.toHaveProperty("profile");
      } finally {
        if (originalEnvironment === undefined) {
          delete process.env.AWS_ACCESS_KEY_ID;
        } else {
          process.env.AWS_ACCESS_KEY_ID = originalEnvironment;
        }
      }
    });

    it("should handle credential chain failure without profile name", async () => {
      const originalEnvironment = process.env.AWS_ACCESS_KEY_ID;
      process.env.AWS_ACCESS_KEY_ID = "AKIATEST123EXAMPLE";

      mockCredentialProvider.mockRejectedValue(new Error("No credentials found"));

      try {
        const result = await credentialService.testCredentialChain();

        expect(result).toEqual({
          credentialsAvailable: false,
          providerUsed: "unknown",
        });
        expect(result).not.toHaveProperty("profile");
      } finally {
        if (originalEnvironment === undefined) {
          delete process.env.AWS_ACCESS_KEY_ID;
        } else {
          process.env.AWS_ACCESS_KEY_ID = originalEnvironment;
        }
      }
    });
  });

  describe("debug logging enabled", () => {
    let debugCredentialService: CredentialService;
    let consoleSpy: any;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      debugCredentialService = new CredentialService({
        defaultRegion: "us-east-1",
        defaultProfile: "default",
        enableDebugLogging: true,
        credentialProviderOptions: {
          timeout: 30_000,
          maxRetries: 3,
        },
      });
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it("should log debug messages when getting credentials", async () => {
      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);

      await debugCredentialService.getCredentials("test-profile");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Created credential provider for profile: test-profile",
      );
      expect(consoleSpy).toHaveBeenCalledWith("Retrieved credentials for profile: test-profile");
    });

    it("should log debug messages when validating credentials", async () => {
      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      const mockIdentity = {
        UserId: "AIDACKCEVSQ6C2EXAMPLE",
        Account: "123456789012",
        Arn: "arn:aws:iam::123456789012:user/test-user",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);
      mockStsClientInstance.send.mockResolvedValue(mockIdentity);

      await debugCredentialService.validateCredentials("test-profile");

      expect(consoleSpy).toHaveBeenCalledWith("Validating credentials for profile: test-profile");
      expect(consoleSpy).toHaveBeenCalledWith("Credentials validated for profile: test-profile", {
        account: "123456789012",
        arn: "arn:aws:iam::123456789012:user/test-user",
      });
    });

    it("should log debug messages when clearing credential cache", () => {
      debugCredentialService.clearCredentialCache("test-profile");

      expect(consoleSpy).toHaveBeenCalledWith("Cleared credential cache for profile: test-profile");
    });

    it("should log debug messages when clearing all credential caches", () => {
      debugCredentialService.clearAllCredentialCaches();

      expect(consoleSpy).toHaveBeenCalledWith("Cleared all credential caches");
    });

    it("should log debug messages when setting active profile", () => {
      debugCredentialService.setActiveProfile("test-profile");

      expect(consoleSpy).toHaveBeenCalledWith("Set active profile to: test-profile");
    });

    it("should test provider options conditionals", async () => {
      const serviceWithOptions = new CredentialService({
        defaultRegion: "us-east-1",
        defaultProfile: "default",
        enableDebugLogging: true,
        credentialProviderOptions: {
          timeout: 45_000,
          maxRetries: 5,
        },
      });

      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);

      await serviceWithOptions.getCredentials("custom-profile");

      expect(mockFromNodeProviderChain).toHaveBeenCalledWith({
        profile: "custom-profile",
        timeout: 45_000,
        maxRetries: 5,
      });
    });

    it("should handle integration test environment branch", async () => {
      const originalEnvironment = process.env.AWS_INTEGRATION_TEST;
      process.env.AWS_INTEGRATION_TEST = "true";

      const mockError = new Error("AWS SDK Error");
      mockCredentialProvider.mockResolvedValue({
        accessKeyId: "test",
        secretAccessKey: "test",
      });
      mockStsClientInstance.send.mockRejectedValue(mockError);

      await expect(debugCredentialService.validateCredentials("test-profile")).rejects.toThrow(
        "AWS SDK Error",
      );

      process.env.AWS_INTEGRATION_TEST = originalEnvironment;
    });
  });

  describe("error handling edge cases", () => {
    it("should handle STS client creation timeout errors", async () => {
      const timeoutError = new Error("Request timeout");
      timeoutError.name = "TimeoutError";
      mockCredentialProvider.mockRejectedValue(timeoutError);

      await expect(credentialService.createStsClient()).rejects.toThrow(ServiceError);
    });

    it("should handle credential provider network errors", async () => {
      const networkError = new Error("Network unreachable");
      networkError.name = "NetworkingError";
      mockCredentialProvider.mockRejectedValue(networkError);

      await expect(credentialService.validateCredentials("test-profile")).rejects.toThrow(
        AuthenticationError,
      );
    });

    it("should handle AWS service unavailable errors during validation", async () => {
      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);

      const serviceError = new Error("Service Unavailable");
      serviceError.name = "ServiceUnavailableException";
      mockStsClientInstance.send.mockRejectedValue(serviceError);

      await expect(credentialService.validateCredentials("service-error-profile")).rejects.toThrow(
        AuthenticationError,
      );
    });

    it("should handle generic AWS client creation failures", async () => {
      const MockFailingClient = vi.fn().mockImplementation(() => {
        throw new Error("Client initialization failed");
      });

      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);

      await expect(
        credentialService.createClient(MockFailingClient, { region: "us-east-1" }),
      ).rejects.toThrow(ServiceError);
    });

    it("should handle credential validation with non-Error objects", async () => {
      mockCredentialProvider.mockRejectedValue("String error instead of Error object");

      await expect(credentialService.validateCredentials("test-profile")).rejects.toThrow(
        AuthenticationError,
      );
    });

    it("should handle credential validation error with undefined profile", async () => {
      mockCredentialProvider.mockRejectedValue(new Error("Validation failed"));

      // This should trigger the profileName ?? "environment" branch in error message
      await expect(credentialService.validateCredentials()).rejects.toThrow(AuthenticationError);
    });

    it("should handle client creation with non-Error failure objects", async () => {
      const MockFailingClient = vi.fn().mockImplementation(() => {
        // Intentionally throw non-Error object to test defensive error handling
        // This tests the String(error) fallback in createClient() method
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw "String error instead of Error object";
      });

      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);

      // This should trigger the String(error) branch in error handling
      await expect(
        credentialService.createClient(MockFailingClient, { region: "us-east-1" }),
      ).rejects.toThrow(ServiceError);
    });

    it("should handle STS client creation with non-Error failures", async () => {
      mockCredentialProvider.mockRejectedValue({ message: "Object error" });

      await expect(credentialService.createStsClient()).rejects.toThrow(ServiceError);
    });
  });

  describe("profile resolution edge cases", () => {
    it("should resolve profile to undefined when AWS_ACCESS_KEY_ID is set", async () => {
      const originalAccessKey = process.env.AWS_ACCESS_KEY_ID;
      const originalSecretKey = process.env.AWS_SECRET_ACCESS_KEY;

      process.env.AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE";
      process.env.AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";

      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };
      mockCredentialProvider.mockResolvedValue(mockCredentials);

      // This should use environment credentials (profile resolved to undefined)
      await credentialService.getCredentials();

      expect(mockFromNodeProviderChain).toHaveBeenCalledWith({
        profile: undefined,
        timeout: 30_000,
        maxRetries: 3,
      });

      // Restore original environment
      if (originalAccessKey) {
        process.env.AWS_ACCESS_KEY_ID = originalAccessKey;
      } else {
        delete process.env.AWS_ACCESS_KEY_ID;
      }
      if (originalSecretKey) {
        process.env.AWS_SECRET_ACCESS_KEY = originalSecretKey;
      } else {
        delete process.env.AWS_SECRET_ACCESS_KEY;
      }
    });

    it("should use default profile when no profile specified and no environment credentials", async () => {
      const originalAccessKey = process.env.AWS_ACCESS_KEY_ID;
      const originalSecretKey = process.env.AWS_SECRET_ACCESS_KEY;

      delete process.env.AWS_ACCESS_KEY_ID;
      delete process.env.AWS_SECRET_ACCESS_KEY;

      const mockCredentials = {
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      };
      mockCredentialProvider.mockResolvedValue(mockCredentials);

      await credentialService.getCredentials();

      expect(mockFromNodeProviderChain).toHaveBeenCalledWith({
        profile: "default", // Should use the default profile from constructor
        timeout: 30_000,
        maxRetries: 3,
      });

      // Restore original environment
      if (originalAccessKey) {
        process.env.AWS_ACCESS_KEY_ID = originalAccessKey;
      }
      if (originalSecretKey) {
        process.env.AWS_SECRET_ACCESS_KEY = originalSecretKey;
      }
    });
  });

  describe("constructor edge cases", () => {
    it("should use default options when no options provided", async () => {
      const defaultService = new CredentialService();

      // Should use fallback values for configuration
      expect(defaultService).toBeDefined();

      // Test that it can create a client successfully with defaults
      const mockCredentials = {
        accessKeyId: "test-access-key",
        secretAccessKey: "test-secret-key",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);

      const credentials = await defaultService.getCredentials();
      expect(credentials).toEqual(mockCredentials);
    });

    it("should use default options with empty object", async () => {
      const emptyOptionsService = new CredentialService({});

      // Should use fallback values for configuration
      expect(emptyOptionsService).toBeDefined();

      // Test that it can create a client successfully with defaults
      const mockCredentials = {
        accessKeyId: "test-access-key-empty",
        secretAccessKey: "test-secret-key-empty",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);

      const credentials = await emptyOptionsService.getCredentials();
      expect(credentials).toEqual(mockCredentials);
    });

    it("should respect environment variables when available", async () => {
      // Save original values
      const originalRegion = process.env.AWS_REGION;
      const originalProfile = process.env.AWS_PROFILE;

      // Set environment variables
      process.env.AWS_REGION = "eu-west-1";
      process.env.AWS_PROFILE = "test-profile";

      const environmentService = new CredentialService();

      // Test that it can work with environment-driven config
      const mockCredentials = {
        accessKeyId: "env-access-key",
        secretAccessKey: "env-secret-key",
      };

      mockCredentialProvider.mockResolvedValue(mockCredentials);

      const credentials = await environmentService.getCredentials();
      expect(credentials).toEqual(mockCredentials);

      // Restore original values
      if (originalRegion) {
        process.env.AWS_REGION = originalRegion;
      } else {
        delete process.env.AWS_REGION;
      }
      if (originalProfile) {
        process.env.AWS_PROFILE = originalProfile;
      } else {
        delete process.env.AWS_PROFILE;
      }
    });
  });
});
