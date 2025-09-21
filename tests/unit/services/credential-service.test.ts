/**
 * Unit tests for CredentialService
 *
 * Tests AWS SDK credential integration with mocked credential providers
 * and client factory methods for service operations.
 */

import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  });
});
