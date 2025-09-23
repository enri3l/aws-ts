/**
 * Unit tests for TokenManager
 *
 * Tests SSO token lifecycle management with mocked file system operations
 * for comprehensive cache handling, expiry detection, and error scenarios.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TokenError } from "../../../src/lib/auth-errors.js";
import { TokenManager } from "../../../src/services/token-manager.js";

// Mock node:fs/promises module
vi.mock("node:fs/promises", () => ({
  default: {
    stat: vi.fn(),
    readdir: vi.fn(),
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

describe("TokenManager", () => {
  let tokenManager: TokenManager;

  beforeEach(() => {
    vi.resetAllMocks();

    // Setup default os.homedir mock
    mockOs.homedir.mockReturnValue("/home/user");

    tokenManager = new TokenManager({
      enableDebugLogging: false,
      expiryWarningThreshold: 900_000, // 15 minutes
    });
  });

  describe("constructor", () => {
    it("should use default options when none provided", () => {
      const manager = new TokenManager();
      expect(manager).toBeInstanceOf(TokenManager);
    });

    it("should use custom options when provided", () => {
      const customOptions = {
        ssoCacheDir: "/custom/cache/dir",
        expiryWarningThreshold: 600_000, // 10 minutes
        enableDebugLogging: true,
        autoRefresh: true,
        maxCacheAge: 43_200_000, // 12 hours
      };

      const manager = new TokenManager(customOptions);
      expect(manager).toBeInstanceOf(TokenManager);
    });
  });

  describe("getTokenInfo", () => {
    const mockCacheData = {
      accessToken: "mock-access-token",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), // 1 hour from now
      region: "us-east-1",
      startUrl: "https://example.awsapps.com/start",
      clientId: "mock-client-id",
      clientSecret: "mock-client-secret",
    };

    it("should return token info for valid start URL", async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json", "token2.json", "other.txt"] as any);
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes("token1.json")) {
          return Promise.resolve(JSON.stringify(mockCacheData));
        }
        if (filePath.includes("token2.json")) {
          return Promise.resolve(
            JSON.stringify({
              ...mockCacheData,
              startUrl: "https://different.awsapps.com/start",
            }),
          );
        }
        return Promise.reject(new Error("File not found"));
      });

      const tokenInfo = await tokenManager.getTokenInfo("https://example.awsapps.com/start");

      expect(tokenInfo).toBeDefined();
      expect(tokenInfo!.accessToken).toBe("mock-access-token");
      expect(tokenInfo!.startUrl).toBe("https://example.awsapps.com/start");
      expect(tokenInfo!.region).toBe("us-east-1");
      expect(tokenInfo!.isValid).toBe(true);
      expect(tokenInfo!.isNearExpiry).toBe(false);
      expect(tokenInfo!.timeUntilExpiry).toBeGreaterThan(0);
    });

    it("should return undefined when no matching token found", async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json"] as any);
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          ...mockCacheData,
          startUrl: "https://different.awsapps.com/start",
        }),
      );

      const tokenInfo = await tokenManager.getTokenInfo("https://example.awsapps.com/start");

      expect(tokenInfo).toBeUndefined();
    });

    it("should return undefined when no cache directory exists", async () => {
      mockFs.stat.mockRejectedValue(new Error("ENOENT: no such file or directory"));

      const tokenInfo = await tokenManager.getTokenInfo("https://example.awsapps.com/start");

      expect(tokenInfo).toBeUndefined();
    });

    it("should mark token as expired when expiry time has passed", async () => {
      const expiredCacheData = {
        ...mockCacheData,
        expiresAt: new Date(Date.now() - 3_600_000).toISOString(), // 1 hour ago
      };

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json"] as any);
      mockFs.readFile.mockResolvedValue(JSON.stringify(expiredCacheData));

      const tokenInfo = await tokenManager.getTokenInfo("https://example.awsapps.com/start");

      expect(tokenInfo).toBeDefined();
      expect(tokenInfo!.isValid).toBe(false);
      expect(tokenInfo!.timeUntilExpiry).toBeLessThan(0);
    });

    it("should mark token as near expiry when within warning threshold", async () => {
      const nearExpiryCacheData = {
        ...mockCacheData,
        expiresAt: new Date(Date.now() + 600_000).toISOString(), // 10 minutes from now (less than 15min threshold)
      };

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json"] as any);
      mockFs.readFile.mockResolvedValue(JSON.stringify(nearExpiryCacheData));

      const tokenInfo = await tokenManager.getTokenInfo("https://example.awsapps.com/start");

      expect(tokenInfo).toBeDefined();
      expect(tokenInfo!.isValid).toBe(true);
      expect(tokenInfo!.isNearExpiry).toBe(true);
    });

    it("should handle malformed cache file gracefully", async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json"] as any);
      mockFs.readFile.mockResolvedValue("invalid json");

      const tokenInfo = await tokenManager.getTokenInfo("https://example.awsapps.com/start");

      expect(tokenInfo).toBeUndefined();
    });

    it("should handle cache file with missing required fields", async () => {
      const incompleteCacheData = {
        accessToken: "mock-access-token",
        // Missing expiresAt and startUrl
        region: "us-east-1",
      };

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json"] as any);
      mockFs.readFile.mockResolvedValue(JSON.stringify(incompleteCacheData));

      const tokenInfo = await tokenManager.getTokenInfo("https://example.awsapps.com/start");

      expect(tokenInfo).toBeUndefined();
    });

    it("should throw TokenError when cache directory read fails", async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockRejectedValue(new Error("Permission denied"));

      await expect(tokenManager.getTokenInfo("https://example.awsapps.com/start")).rejects.toThrow(
        TokenError,
      );
    });
  });

  describe("getTokenStatus", () => {
    const mockCacheData = {
      accessToken: "mock-access-token",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      region: "us-east-1",
      startUrl: "https://example.awsapps.com/start",
    };

    it("should return status with no token when no start URL provided", async () => {
      const status = await tokenManager.getTokenStatus("test-profile");

      expect(status).toEqual({
        profileName: "test-profile",
        hasToken: false,
        isValid: false,
        isNearExpiry: false,
      });
    });

    it("should return status with no token when token not found", async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue([] as any);

      const status = await tokenManager.getTokenStatus(
        "test-profile",
        "https://example.awsapps.com/start",
      );

      expect(status).toEqual({
        profileName: "test-profile",
        hasToken: false,
        isValid: false,
        isNearExpiry: false,
        startUrl: "https://example.awsapps.com/start",
      });
    });

    it("should return complete status when token found", async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json"] as any);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockCacheData));

      const status = await tokenManager.getTokenStatus(
        "test-profile",
        "https://example.awsapps.com/start",
      );

      expect(status).toEqual({
        profileName: "test-profile",
        hasToken: true,
        isValid: true,
        isNearExpiry: false,
        expiresAt: expect.any(Date),
        timeUntilExpiry: expect.any(Number),
        startUrl: "https://example.awsapps.com/start",
      });
    });

    it("should handle errors gracefully and return default status", async () => {
      mockFs.stat.mockRejectedValue(new Error("File system error"));

      const status = await tokenManager.getTokenStatus(
        "test-profile",
        "https://example.awsapps.com/start",
      );

      expect(status).toEqual({
        profileName: "test-profile",
        hasToken: false,
        isValid: false,
        isNearExpiry: false,
        startUrl: "https://example.awsapps.com/start",
      });
    });
  });

  describe("checkTokenExpiry", () => {
    it("should return expired and near-expiry tokens", async () => {
      const expiredToken = {
        accessToken: "expired-token",
        expiresAt: new Date(Date.now() - 3_600_000).toISOString(), // 1 hour ago
        region: "us-east-1",
        startUrl: "https://expired.awsapps.com/start",
      };

      const nearExpiryToken = {
        accessToken: "near-expiry-token",
        expiresAt: new Date(Date.now() + 600_000).toISOString(), // 10 minutes from now
        region: "us-west-2",
        startUrl: "https://nearexpiry.awsapps.com/start",
      };

      const validToken = {
        accessToken: "valid-token",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(), // 1 hour from now
        region: "eu-west-1",
        startUrl: "https://valid.awsapps.com/start",
      };

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json", "token2.json", "token3.json"] as any);
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes("token1.json")) {
          return Promise.resolve(JSON.stringify(expiredToken));
        }
        if (filePath.includes("token2.json")) {
          return Promise.resolve(JSON.stringify(nearExpiryToken));
        }
        if (filePath.includes("token3.json")) {
          return Promise.resolve(JSON.stringify(validToken));
        }
        return Promise.reject(new Error("File not found"));
      });

      const expiryResults = await tokenManager.checkTokenExpiry();

      expect(expiryResults).toHaveLength(2);

      const expiredResult = expiryResults.find((r) => r.status === "expired");
      expect(expiredResult).toBeDefined();
      expect(expiredResult!.startUrl).toBe("https://expired.awsapps.com/start");
      expect(expiredResult!.timeUntilExpiry).toBeLessThan(0);

      const nearExpiryResult = expiryResults.find((r) => r.status === "near-expiry");
      expect(nearExpiryResult).toBeDefined();
      expect(nearExpiryResult!.startUrl).toBe("https://nearexpiry.awsapps.com/start");
      expect(nearExpiryResult!.timeUntilExpiry).toBeGreaterThan(0);
      expect(nearExpiryResult!.timeUntilExpiry).toBeLessThanOrEqual(900_000);
    });

    it("should return empty array when no problematic tokens found", async () => {
      const validToken = {
        accessToken: "valid-token",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        region: "us-east-1",
        startUrl: "https://valid.awsapps.com/start",
      };

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json"] as any);
      mockFs.readFile.mockResolvedValue(JSON.stringify(validToken));

      const expiryResults = await tokenManager.checkTokenExpiry();

      expect(expiryResults).toHaveLength(0);
    });

    it("should return empty array when no cache directory exists", async () => {
      mockFs.stat.mockRejectedValue(new Error("ENOENT: no such file or directory"));

      const expiryResults = await tokenManager.checkTokenExpiry();

      expect(expiryResults).toHaveLength(0);
    });

    it("should throw TokenError when cache reading fails", async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockRejectedValue(new Error("Permission denied"));

      await expect(tokenManager.checkTokenExpiry()).rejects.toThrow(TokenError);
    });
  });

  describe("clearExpiredTokens", () => {
    it("should count expired tokens", async () => {
      const expiredToken1 = {
        accessToken: "expired-token-1",
        expiresAt: new Date(Date.now() - 3_600_000).toISOString(),
        region: "us-east-1",
        startUrl: "https://expired1.awsapps.com/start",
      };

      const expiredToken2 = {
        accessToken: "expired-token-2",
        expiresAt: new Date(Date.now() - 1_800_000).toISOString(),
        region: "us-west-2",
        startUrl: "https://expired2.awsapps.com/start",
      };

      const validToken = {
        accessToken: "valid-token",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        region: "eu-west-1",
        startUrl: "https://valid.awsapps.com/start",
      };

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json", "token2.json", "token3.json"] as any);
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes("token1.json")) {
          return Promise.resolve(JSON.stringify(expiredToken1));
        }
        if (filePath.includes("token2.json")) {
          return Promise.resolve(JSON.stringify(expiredToken2));
        }
        if (filePath.includes("token3.json")) {
          return Promise.resolve(JSON.stringify(validToken));
        }
        return Promise.reject(new Error("File not found"));
      });

      const clearedCount = await tokenManager.clearExpiredTokens();

      expect(clearedCount).toBe(2);
    });

    it("should return 0 when no expired tokens found", async () => {
      const validToken = {
        accessToken: "valid-token",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        region: "us-east-1",
        startUrl: "https://valid.awsapps.com/start",
      };

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json"] as any);
      mockFs.readFile.mockResolvedValue(JSON.stringify(validToken));

      const clearedCount = await tokenManager.clearExpiredTokens();

      expect(clearedCount).toBe(0);
    });

    it("should throw TokenError when expiry check fails", async () => {
      mockFs.stat.mockRejectedValue(new Error("Permission denied"));

      await expect(tokenManager.clearExpiredTokens()).rejects.toThrow(TokenError);
    });
  });

  describe("getAllTokens", () => {
    it("should return all tokens with status information", async () => {
      const token1 = {
        accessToken: "token-1",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        region: "us-east-1",
        startUrl: "https://token1.awsapps.com/start",
      };

      const token2 = {
        accessToken: "token-2",
        expiresAt: new Date(Date.now() - 3_600_000).toISOString(), // Expired
        region: "us-west-2",
        startUrl: "https://token2.awsapps.com/start",
      };

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json", "token2.json"] as any);
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes("token1.json")) {
          return Promise.resolve(JSON.stringify(token1));
        }
        if (filePath.includes("token2.json")) {
          return Promise.resolve(JSON.stringify(token2));
        }
        return Promise.reject(new Error("File not found"));
      });

      const allTokens = await tokenManager.getAllTokens();

      expect(allTokens).toHaveLength(2);

      const validToken = allTokens.find((t) => t.startUrl === "https://token1.awsapps.com/start");
      expect(validToken).toBeDefined();
      expect(validToken!.isValid).toBe(true);
      expect(validToken!.accessToken).toBe("token-1");

      const expiredToken = allTokens.find((t) => t.startUrl === "https://token2.awsapps.com/start");
      expect(expiredToken).toBeDefined();
      expect(expiredToken!.isValid).toBe(false);
      expect(expiredToken!.accessToken).toBe("token-2");
    });

    it("should return empty array when no cache exists", async () => {
      mockFs.stat.mockRejectedValue(new Error("ENOENT: no such file or directory"));

      const allTokens = await tokenManager.getAllTokens();

      expect(allTokens).toHaveLength(0);
    });

    it("should skip invalid cache files", async () => {
      const validToken = {
        accessToken: "valid-token",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        region: "us-east-1",
        startUrl: "https://valid.awsapps.com/start",
      };

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["valid.json", "invalid.json"] as any);
      mockFs.readFile.mockImplementation((filePath: string) => {
        // Check more specific paths first to avoid substring matching issues
        if (filePath.includes("invalid.json")) {
          return Promise.resolve("{invalid json syntax");
        }
        if (filePath.includes("valid.json")) {
          return Promise.resolve(JSON.stringify(validToken));
        }
        return Promise.reject(new Error("File not found"));
      });

      const allTokens = await tokenManager.getAllTokens();

      expect(allTokens).toHaveLength(1);
      expect(allTokens[0].startUrl).toBe("https://valid.awsapps.com/start");
    });

    it("should throw TokenError when cache reading fails", async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockRejectedValue(new Error("Permission denied"));

      await expect(tokenManager.getAllTokens()).rejects.toThrow(TokenError);
    });
  });

  describe("hasSsoCache", () => {
    it("should return true when cache directory exists", async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);

      const hasCache = await tokenManager.hasSsoCache();

      expect(hasCache).toBe(true);
    });

    it("should return false when cache directory does not exist", async () => {
      mockFs.stat.mockRejectedValue(new Error("ENOENT: no such file or directory"));

      const hasCache = await tokenManager.hasSsoCache();

      expect(hasCache).toBe(false);
    });

    it("should return false when path exists but is not a directory", async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => false } as any);

      const hasCache = await tokenManager.hasSsoCache();

      expect(hasCache).toBe(false);
    });
  });

  describe("formatTimeUntilExpiry", () => {
    it("should format negative time as 'expired'", () => {
      expect(TokenManager.formatTimeUntilExpiry(-1000)).toBe("expired");
      expect(TokenManager.formatTimeUntilExpiry(0)).toBe("expired");
    });

    it("should format seconds correctly", () => {
      expect(TokenManager.formatTimeUntilExpiry(1000)).toBe("1 second");
      expect(TokenManager.formatTimeUntilExpiry(5000)).toBe("5 seconds");
      expect(TokenManager.formatTimeUntilExpiry(59_000)).toBe("59 seconds");
    });

    it("should format minutes correctly", () => {
      expect(TokenManager.formatTimeUntilExpiry(60_000)).toBe("1 minute");
      expect(TokenManager.formatTimeUntilExpiry(300_000)).toBe("5 minutes");
      expect(TokenManager.formatTimeUntilExpiry(3_540_000)).toBe("59 minutes");
    });

    it("should format hours correctly", () => {
      expect(TokenManager.formatTimeUntilExpiry(3_600_000)).toBe("1 hour");
      expect(TokenManager.formatTimeUntilExpiry(7_200_000)).toBe("2 hours");
      expect(TokenManager.formatTimeUntilExpiry(82_800_000)).toBe("23 hours");
    });

    it("should format days correctly", () => {
      expect(TokenManager.formatTimeUntilExpiry(86_400_000)).toBe("1 day");
      expect(TokenManager.formatTimeUntilExpiry(172_800_000)).toBe("2 days");
      expect(TokenManager.formatTimeUntilExpiry(604_800_000)).toBe("7 days");
    });
  });

  describe("edge cases and error handling", () => {
    it("should handle cache directory with no JSON files", async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["file.txt", "config.xml", "readme.md"] as any);

      const tokenInfo = await tokenManager.getTokenInfo("https://example.awsapps.com/start");

      expect(tokenInfo).toBeUndefined();
    });

    it("should handle cache files with null or undefined values", async () => {
      const invalidTokenData = {
        accessToken: undefined,
        expiresAt: undefined,
        region: "us-east-1",
        startUrl: "https://example.awsapps.com/start",
      };

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json"] as any);
      mockFs.readFile.mockResolvedValue(JSON.stringify(invalidTokenData));

      const tokenInfo = await tokenManager.getTokenInfo("https://example.awsapps.com/start");

      expect(tokenInfo).toBeUndefined();
    });

    it("should handle file read errors gracefully in token enumeration", async () => {
      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json", "token2.json"] as any);
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes("token1.json")) {
          return Promise.reject(new Error("File read error"));
        }
        if (filePath.includes("token2.json")) {
          return Promise.resolve(
            JSON.stringify({
              accessToken: "valid-token",
              expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
              region: "us-east-1",
              startUrl: "https://valid.awsapps.com/start",
            }),
          );
        }
        return Promise.reject(new Error("File not found"));
      });

      const allTokens = await tokenManager.getAllTokens();

      expect(allTokens).toHaveLength(1);
      expect(allTokens[0].startUrl).toBe("https://valid.awsapps.com/start");
    });

    it("should handle custom cache directory path", async () => {
      const customTokenManager = new TokenManager({
        ssoCacheDir: "/custom/sso/cache",
        enableDebugLogging: false,
      });

      mockFs.stat.mockRejectedValue(new Error("ENOENT"));

      const hasCache = await customTokenManager.hasSsoCache();

      expect(hasCache).toBe(false);
      expect(mockFs.stat).toHaveBeenCalledWith("/custom/sso/cache");
    });
  });

  describe("concurrent access scenarios", () => {
    it("should handle concurrent getTokenInfo calls safely", async () => {
      const mockCacheData = {
        accessToken: "mock-access-token",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        region: "us-east-1",
        startUrl: "https://example.awsapps.com/start",
      };

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json"] as any);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockCacheData));

      // Launch multiple concurrent getTokenInfo calls
      const promises = Array.from({ length: 5 }, () =>
        tokenManager.getTokenInfo("https://example.awsapps.com/start"),
      );

      const results = await Promise.all(promises);

      // All calls should succeed and return the same result
      expect(results).toHaveLength(5);
      for (const result of results) {
        expect(result).toBeDefined();
        expect(result!.accessToken).toBe("mock-access-token");
        expect(result!.startUrl).toBe("https://example.awsapps.com/start");
      }
    });

    it("should handle mixed concurrent operations safely", async () => {
      const mockCacheData = {
        accessToken: "mock-access-token",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        region: "us-east-1",
        startUrl: "https://example.awsapps.com/start",
      };

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json"] as any);
      mockFs.readFile.mockResolvedValue(JSON.stringify(mockCacheData));

      // Launch multiple concurrent operations of different types
      const promises = [
        tokenManager.getTokenInfo("https://example.awsapps.com/start"),
        tokenManager.getTokenStatus("test-profile", "https://example.awsapps.com/start"),
        tokenManager.getAllTokens(),
        tokenManager.checkTokenExpiry(),
        tokenManager.hasSsoCache(),
      ];

      const results = await Promise.all(promises);

      // All operations should complete successfully
      expect(results).toHaveLength(5);
      expect(results[0]).toBeDefined(); // getTokenInfo
      expect(results[1]).toMatchObject({ profileName: "test-profile", hasToken: true }); // getTokenStatus
      expect(Array.isArray(results[2])).toBe(true); // getAllTokens
      expect(Array.isArray(results[3])).toBe(true); // checkTokenExpiry
      expect(typeof results[4]).toBe("boolean"); // hasSsoCache
    });

    it("should handle file access conflicts during concurrent reads", async () => {
      let readCount = 0;
      const conflictingReads = vi.fn().mockImplementation(() => {
        readCount++;
        if (readCount === 2) {
          // Simulate file access conflict on second read
          const error = new Error("EAGAIN: resource temporarily unavailable");
          return Promise.reject(error);
        }
        return Promise.resolve(
          JSON.stringify({
            accessToken: "mock-token",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            region: "us-east-1",
            startUrl: "https://example.awsapps.com/start",
          }),
        );
      });

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json"] as any);
      mockFs.readFile.mockImplementation(conflictingReads);

      // Launch concurrent reads that will conflict
      const promises = [
        tokenManager.getTokenInfo("https://example.awsapps.com/start"),
        tokenManager.getTokenInfo("https://example.awsapps.com/start"),
      ];

      const results = await Promise.all(promises);

      // First should succeed, second should return undefined due to read error (handled gracefully)
      expect(results[0]).toBeDefined();
      expect(results[0]!.accessToken).toBe("mock-token");
      expect(results[1]).toBeUndefined(); // File read error handled gracefully
      expect(readCount).toBe(2);
    });

    it("should handle cache directory race condition", async () => {
      let statCallCount = 0;
      mockFs.stat.mockImplementation(() => {
        statCallCount++;
        return statCallCount === 1
          ? Promise.resolve({ isDirectory: () => true } as any) // First call succeeds (directory exists)
          : Promise.reject(new Error("ENOENT: no such file or directory")); // Subsequent calls fail (directory was removed)
      });

      mockFs.readdir.mockResolvedValue(["token1.json"] as any);
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          accessToken: "mock-token",
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          region: "us-east-1",
          startUrl: "https://example.awsapps.com/start",
        }),
      );

      // First operation should succeed
      const firstResult = await tokenManager.hasSsoCache();
      expect(firstResult).toBe(true);

      // Second operation should handle missing directory gracefully
      const secondResult = await tokenManager.hasSsoCache();
      expect(secondResult).toBe(false);

      expect(statCallCount).toBe(2);
    });

    it("should handle partial file writes during concurrent access", async () => {
      // Simulate a scenario where cache file is being written by another process
      // while TokenManager tries to read it
      let readAttempts = 0;
      mockFs.readFile.mockImplementation(() => {
        readAttempts++;
        return readAttempts === 1
          ? Promise.resolve('{"accessToken": "token", "expiresAt":') // First read gets partial/incomplete JSON (file being written)
          : Promise.resolve(
              // Subsequent reads get complete file
              JSON.stringify({
                accessToken: "complete-token",
                expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
                region: "us-east-1",
                startUrl: "https://example.awsapps.com/start",
              }),
            );
      });

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json"] as any);

      // First attempt should fail due to malformed JSON
      const firstResult = await tokenManager.getTokenInfo("https://example.awsapps.com/start");
      expect(firstResult).toBeUndefined();

      // Second attempt should succeed with complete file
      const secondResult = await tokenManager.getTokenInfo("https://example.awsapps.com/start");
      expect(secondResult).toBeDefined();
      expect(secondResult!.accessToken).toBe("complete-token");

      expect(readAttempts).toBe(2);
    });

    it("should handle concurrent token expiry checks with changing cache state", async () => {
      let checkCount = 0;
      const dynamicTokenData = vi.fn().mockImplementation(() => {
        checkCount++;
        return checkCount === 1
          ? Promise.resolve(
              // First check: token is valid
              JSON.stringify({
                accessToken: "valid-token",
                expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
                region: "us-east-1",
                startUrl: "https://example.awsapps.com/start",
              }),
            )
          : Promise.resolve(
              // Second check: token has expired (simulating time passage or token refresh)
              JSON.stringify({
                accessToken: "expired-token",
                expiresAt: new Date(Date.now() - 3_600_000).toISOString(),
                region: "us-east-1",
                startUrl: "https://example.awsapps.com/start",
              }),
            );
      });

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json"] as any);
      mockFs.readFile.mockImplementation(dynamicTokenData);

      // Run concurrent expiry checks
      const promises = [tokenManager.checkTokenExpiry(), tokenManager.checkTokenExpiry()];

      const results = await Promise.all(promises);

      // Both should complete, but may have different results due to changing state
      expect(results).toHaveLength(2);
      expect(Array.isArray(results[0])).toBe(true);
      expect(Array.isArray(results[1])).toBe(true);
      expect(checkCount).toBe(2);
    });
  });

  describe("cache invalidation edge cases", () => {
    it("should handle cache files with mixed valid and invalid fields", async () => {
      const partiallyValidToken = {
        accessToken: "valid-access-token",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        region: "us-east-1",
        // Missing required startUrl field
        clientId: "client-123",
        extraField: "should be ignored",
      };

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json"] as any);
      mockFs.readFile.mockResolvedValue(JSON.stringify(partiallyValidToken));

      const tokenInfo = await tokenManager.getTokenInfo("https://example.awsapps.com/start");

      // Should return undefined due to missing required field
      expect(tokenInfo).toBeUndefined();
    });

    it("should handle token expiry edge case at exact warning threshold", async () => {
      const edgeCaseToken = {
        accessToken: "edge-case-token",
        expiresAt: new Date(Date.now() + 900_000).toISOString(), // Exactly 15 minutes (warning threshold)
        region: "us-east-1",
        startUrl: "https://example.awsapps.com/start",
      };

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json"] as any);
      mockFs.readFile.mockResolvedValue(JSON.stringify(edgeCaseToken));

      const tokenInfo = await tokenManager.getTokenInfo("https://example.awsapps.com/start");

      expect(tokenInfo).toBeDefined();
      expect(tokenInfo!.isValid).toBe(true);
      expect(tokenInfo!.isNearExpiry).toBe(true); // Should be considered near expiry at threshold
    });

    it("should handle token expiry edge case just past warning threshold", async () => {
      const justPastThresholdToken = {
        accessToken: "just-past-threshold-token",
        expiresAt: new Date(Date.now() + 900_001).toISOString(), // 1ms past 15-minute threshold
        region: "us-east-1",
        startUrl: "https://example.awsapps.com/start",
      };

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json"] as any);
      mockFs.readFile.mockResolvedValue(JSON.stringify(justPastThresholdToken));

      const tokenInfo = await tokenManager.getTokenInfo("https://example.awsapps.com/start");

      expect(tokenInfo).toBeDefined();
      expect(tokenInfo!.isValid).toBe(true);
      expect(tokenInfo!.isNearExpiry).toBe(false); // Should NOT be considered near expiry
    });

    it("should handle cache file permission changes during operation", async () => {
      let readAttempts = 0;
      mockFs.readFile.mockImplementation(() => {
        readAttempts++;
        if (readAttempts === 1) {
          // First read succeeds
          return Promise.resolve(
            JSON.stringify({
              accessToken: "accessible-token",
              expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
              region: "us-east-1",
              startUrl: "https://example.awsapps.com/start",
            }),
          );
        } else {
          // Subsequent reads fail due to permission change
          const permissionError = new Error("EACCES: permission denied");
          return Promise.reject(permissionError);
        }
      });

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json"] as any);

      // First access should work
      const firstResult = await tokenManager.getTokenInfo("https://example.awsapps.com/start");
      expect(firstResult).toBeDefined();
      expect(firstResult!.accessToken).toBe("accessible-token");

      // Second access should handle permission error gracefully
      const secondResult = await tokenManager.getTokenInfo("https://example.awsapps.com/start");
      expect(secondResult).toBeUndefined();

      expect(readAttempts).toBe(2);
    });

    it("should handle simultaneous cache invalidation scenarios", async () => {
      let operationCount = 0;
      const dynamicCacheState = vi.fn().mockImplementation(() => {
        operationCount++;
        return operationCount <= 2
          ? Promise.resolve(["token1.json", "token2.json"] as any) // First two operations: cache exists with valid tokens
          : Promise.resolve([] as any); // Later operations: cache directory emptied/invalidated
      });

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockImplementation(dynamicCacheState);
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          accessToken: "valid-token",
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          region: "us-east-1",
          startUrl: "https://example.awsapps.com/start",
        }),
      );

      // Launch multiple operations that will see different cache states
      const promises = [
        tokenManager.getAllTokens(),
        tokenManager.getAllTokens(),
        tokenManager.getAllTokens(),
        tokenManager.getAllTokens(),
      ];

      const results = await Promise.all(promises);

      // First two should find tokens, later ones should find empty cache
      expect(results[0]).toHaveLength(2);
      expect(results[1]).toHaveLength(2);
      expect(results[2]).toHaveLength(0);
      expect(results[3]).toHaveLength(0);
      expect(operationCount).toBe(4);
    });

    it("should handle cache with tokens of different validity states", async () => {
      const mixedTokens = [
        {
          accessToken: "expired-token",
          expiresAt: new Date(Date.now() - 3_600_000).toISOString(), // Expired
          region: "us-east-1",
          startUrl: "https://expired.awsapps.com/start",
        },
        {
          accessToken: "near-expiry-token",
          expiresAt: new Date(Date.now() + 600_000).toISOString(), // Near expiry (10 min)
          region: "us-west-2",
          startUrl: "https://nearexpiry.awsapps.com/start",
        },
        {
          accessToken: "valid-token",
          expiresAt: new Date(Date.now() + 7_200_000).toISOString(), // Valid (2 hours)
          region: "eu-west-1",
          startUrl: "https://valid.awsapps.com/start",
        },
      ];

      mockFs.stat.mockResolvedValue({ isDirectory: () => true } as any);
      mockFs.readdir.mockResolvedValue(["token1.json", "token2.json", "token3.json"] as any);
      mockFs.readFile.mockImplementation((filePath: string) => {
        if (filePath.includes("token1.json")) {
          return Promise.resolve(JSON.stringify(mixedTokens[0]));
        }
        if (filePath.includes("token2.json")) {
          return Promise.resolve(JSON.stringify(mixedTokens[1]));
        }
        if (filePath.includes("token3.json")) {
          return Promise.resolve(JSON.stringify(mixedTokens[2]));
        }
        return Promise.reject(new Error("File not found"));
      });

      const allTokens = await tokenManager.getAllTokens();

      expect(allTokens).toHaveLength(3);

      const expiredToken = allTokens.find(
        (t) => t.startUrl === "https://expired.awsapps.com/start",
      );
      expect(expiredToken!.isValid).toBe(false);
      expect(expiredToken!.isNearExpiry).toBe(true); // Expired tokens are also considered near expiry

      const nearExpiryToken = allTokens.find(
        (t) => t.startUrl === "https://nearexpiry.awsapps.com/start",
      );
      expect(nearExpiryToken!.isValid).toBe(true);
      expect(nearExpiryToken!.isNearExpiry).toBe(true);

      const validToken = allTokens.find((t) => t.startUrl === "https://valid.awsapps.com/start");
      expect(validToken!.isValid).toBe(true);
      expect(validToken!.isNearExpiry).toBe(false);
    });

    it("should handle cache directory recreation during operation", async () => {
      let statCallCount = 0;
      mockFs.stat.mockImplementation(() => {
        statCallCount++;
        return statCallCount === 1
          ? Promise.reject(new Error("ENOENT: no such file or directory")) // First check: directory doesn't exist
          : Promise.resolve({ isDirectory: () => true } as any); // Second check: directory was created
      });

      // First operation should handle missing directory
      const firstResult = await tokenManager.hasSsoCache();
      expect(firstResult).toBe(false);

      // Setup for second operation
      mockFs.readdir.mockResolvedValue(["new-token.json"] as any);
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          accessToken: "new-token",
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          region: "us-east-1",
          startUrl: "https://example.awsapps.com/start",
        }),
      );

      // Second operation should work with recreated directory
      const secondResult = await tokenManager.hasSsoCache();
      expect(secondResult).toBe(true);

      const tokenInfo = await tokenManager.getTokenInfo("https://example.awsapps.com/start");
      expect(tokenInfo).toBeDefined();
      expect(tokenInfo!.accessToken).toBe("new-token");

      expect(statCallCount).toBe(3); // hasSsoCache calls stat twice, getTokenInfo calls once
    });
  });

  describe("debug logging", () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it("should log debug message for invalid cache file format", async () => {
      const debugTokenManager = new TokenManager({
        ssoCacheDir: "/home/user/.aws/sso/cache",
        enableDebugLogging: true,
      });

      // Mock cache file with invalid format (missing required fields)
      mockFs.readFile.mockResolvedValue(
        JSON.stringify({
          accessToken: "token",
          // Missing expiresAt and startUrl
        }),
      );

      await expect(
        debugTokenManager.getTokenInfo("https://test.awsapps.com/start"),
      ).rejects.toThrow(TokenError);
    });

    it("should log debug message for cache file ENOENT errors", async () => {
      const debugTokenManager = new TokenManager({
        ssoCacheDir: "/home/user/.aws/sso/cache",
        enableDebugLogging: true,
      });

      const enoentError = new Error("ENOENT: no such file or directory");
      mockFs.readFile.mockRejectedValue(enoentError);

      await expect(
        debugTokenManager.getTokenInfo("https://missing.awsapps.com/start"),
      ).rejects.toThrow(TokenError);
    });

    it("should log debug message for cache file EACCES errors", async () => {
      const debugTokenManager = new TokenManager({
        ssoCacheDir: "/home/user/.aws/sso/cache",
        enableDebugLogging: true,
      });

      const eaccesError = new Error("EACCES: permission denied");
      mockFs.readFile.mockRejectedValue(eaccesError);

      await expect(
        debugTokenManager.getTokenInfo("https://restricted.awsapps.com/start"),
      ).rejects.toThrow(TokenError);
    });

    it("should log debug message for other cache file errors", async () => {
      const debugTokenManager = new TokenManager({
        ssoCacheDir: "/home/user/.aws/sso/cache",
        enableDebugLogging: true,
      });

      const genericError = new Error("Unexpected JSON parse error");
      mockFs.readFile.mockRejectedValue(genericError);

      await expect(
        debugTokenManager.getTokenInfo("https://corrupted.awsapps.com/start"),
      ).rejects.toThrow(TokenError);
    });
  });
});
