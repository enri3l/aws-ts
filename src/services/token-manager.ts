/**
 * SSO token manager for token lifecycle management
 *
 * Provides comprehensive SSO token management including expiry detection,
 * automatic refresh capabilities, and SSO cache integration for AWS CLI
 * compatibility.
 *
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { TokenError } from "../lib/auth-errors.js";

/**
 * Configuration options for token manager
 *
 * @public
 */
export interface TokenManagerOptions {
  /**
   * Path to AWS SSO cache directory
   */
  ssoCacheDir?: string;

  /**
   * Token expiry warning threshold in milliseconds
   */
  expiryWarningThreshold?: number;

  /**
   * Enable debug logging for token operations
   */
  enableDebugLogging?: boolean;

  /**
   * Automatically refresh tokens when they expire
   */
  autoRefresh?: boolean;

  /**
   * Maximum age for cache files in milliseconds
   */
  maxCacheAge?: number;
}

/**
 * SSO token information from cache
 *
 * @public
 */
export interface SsoTokenInfo {
  /**
   * Access token for AWS SSO
   */
  accessToken: string;

  /**
   * Token expiration time
   */
  expiresAt: Date;

  /**
   * AWS region for the SSO session
   */
  region: string;

  /**
   * SSO start URL
   */
  startUrl: string;

  /**
   * Whether the token is currently valid
   */
  isValid: boolean;

  /**
   * Whether the token is close to expiry
   */
  isNearExpiry: boolean;

  /**
   * Time until expiry in milliseconds
   */
  timeUntilExpiry: number;
}

/**
 * Token status summary for a profile
 *
 * @public
 */
export interface TokenStatus {
  /**
   * Profile name
   */
  profileName: string;

  /**
   * Whether a token exists for the profile
   */
  hasToken: boolean;

  /**
   * Whether the token is valid (not expired)
   */
  isValid: boolean;

  /**
   * Whether the token is near expiry
   */
  isNearExpiry: boolean;

  /**
   * Token expiration time if available
   */
  expiresAt?: Date;

  /**
   * Time until expiry in milliseconds
   */
  timeUntilExpiry?: number;

  /**
   * SSO start URL for the token
   */
  startUrl?: string;
}

/**
 * SSO cache file structure
 *
 * @internal
 */
interface SsoCacheFile {
  accessToken: string;
  expiresAt: string;
  region: string;
  startUrl: string;
  clientId?: string;
  clientSecret?: string;
  registrationExpiresAt?: string;
}

/**
 * SSO token manager for token lifecycle management
 *
 * Manages SSO token expiry detection, refresh operations, and cache
 * integration with AWS CLI SSO mechanisms.
 *
 * @public
 */
export class TokenManager {
  private readonly options: Required<TokenManagerOptions>;

  /**
   * Create a new token manager instance
   *
   * @param options - Configuration options for the manager
   */
  constructor(options: TokenManagerOptions = {}) {
    const homeDirectory = os.homedir();
    this.options = {
      ssoCacheDir: options.ssoCacheDir ?? path.join(homeDirectory, ".aws", "sso", "cache"),
      expiryWarningThreshold: options.expiryWarningThreshold ?? 900_000, // 15 minutes
      enableDebugLogging: options.enableDebugLogging ?? false,
      autoRefresh: options.autoRefresh ?? false,
      maxCacheAge: options.maxCacheAge ?? 86_400_000, // 24 hours
    };
  }

  /**
   * Get SSO token information for a start URL
   *
   * @param startUrl - SSO start URL to get token for
   * @returns Promise resolving to token information
   * @throws TokenError When token retrieval fails
   */
  async getTokenInfo(startUrl: string): Promise<SsoTokenInfo | undefined> {
    try {
      const cacheFiles = await this.findSsoCacheFiles();

      for (const cacheFile of cacheFiles) {
        const tokenInfo = await this.readTokenFromCache(cacheFile);

        if (tokenInfo && tokenInfo.startUrl === startUrl) {
          const now = new Date();
          const expiresAt = new Date(tokenInfo.expiresAt);
          const timeUntilExpiry = expiresAt.getTime() - now.getTime();
          const isValid = timeUntilExpiry > 0;
          const isNearExpiry = timeUntilExpiry <= this.options.expiryWarningThreshold;

          const ssoTokenInfo: SsoTokenInfo = {
            accessToken: tokenInfo.accessToken,
            expiresAt,
            region: tokenInfo.region,
            startUrl: tokenInfo.startUrl,
            isValid,
            isNearExpiry,
            timeUntilExpiry,
          };

          if (this.options.enableDebugLogging) {
            console.debug(`Retrieved token info for start URL: ${startUrl}`, {
              isValid,
              isNearExpiry,
              timeUntilExpiry,
            });
          }

          return ssoTokenInfo;
        }
      }

      if (this.options.enableDebugLogging) {
        console.debug(`No token found for start URL: ${startUrl}`);
      }

      return undefined;
    } catch (error) {
      throw new TokenError(
        `Failed to get token info for start URL '${startUrl}'`,
        "sso-token",
        "token-retrieval",
        undefined,
        { error, startUrl },
      );
    }
  }

  /**
   * Get token status for a profile
   *
   * @param profileName - Profile name to get token status for
   * @param startUrl - SSO start URL for the profile
   * @returns Promise resolving to token status
   */
  async getTokenStatus(profileName: string, startUrl?: string): Promise<TokenStatus> {
    try {
      if (!startUrl) {
        return {
          profileName,
          hasToken: false,
          isValid: false,
          isNearExpiry: false,
        };
      }

      const tokenInfo = await this.getTokenInfo(startUrl);

      if (!tokenInfo) {
        const status: TokenStatus = {
          profileName,
          hasToken: false,
          isValid: false,
          isNearExpiry: false,
        };

        if (startUrl) {
          status.startUrl = startUrl;
        }

        return status;
      }

      const status: TokenStatus = {
        profileName,
        hasToken: true,
        isValid: tokenInfo.isValid,
        isNearExpiry: tokenInfo.isNearExpiry,
        expiresAt: tokenInfo.expiresAt,
        timeUntilExpiry: tokenInfo.timeUntilExpiry,
        startUrl: tokenInfo.startUrl,
      };

      return status;
    } catch (error) {
      if (this.options.enableDebugLogging) {
        if (
          error instanceof Error &&
          (error.message.includes("ENOENT") || error.message.includes("No token found"))
        ) {
          console.debug(`Token not available for profile: ${profileName} - ${error.message}`);
        } else {
          console.debug(`Failed to get token status for profile: ${profileName}`, error);
        }
      }

      const status: TokenStatus = {
        profileName,
        hasToken: false,
        isValid: false,
        isNearExpiry: false,
      };

      if (startUrl) {
        status.startUrl = startUrl;
      }

      return status;
    }
  }

  /**
   * Check if any SSO tokens are expired or near expiry
   *
   * @returns Promise resolving to array of profiles with token issues
   */
  async checkTokenExpiry(): Promise<
    Array<{
      profileName: string;
      startUrl: string;
      status: "expired" | "near-expiry" | "valid";
      expiresAt: Date;
      timeUntilExpiry: number;
    }>
  > {
    try {
      const cacheFiles = await this.findSsoCacheFiles();
      const results = [];

      for (const cacheFile of cacheFiles) {
        const tokenInfo = await this.readTokenFromCache(cacheFile);

        if (tokenInfo) {
          const now = new Date();
          const expiresAt = new Date(tokenInfo.expiresAt);
          const timeUntilExpiry = expiresAt.getTime() - now.getTime();

          let status: "expired" | "near-expiry" | "valid";
          if (timeUntilExpiry <= 0) {
            status = "expired";
          } else if (timeUntilExpiry <= this.options.expiryWarningThreshold) {
            status = "near-expiry";
          } else {
            status = "valid";
          }

          if (status !== "valid") {
            results.push({
              profileName: tokenInfo.startUrl, // Use start URL as identifier
              startUrl: tokenInfo.startUrl,
              status,
              expiresAt,
              timeUntilExpiry,
            });
          }
        }
      }

      if (this.options.enableDebugLogging) {
        console.debug(`Token expiry check found ${results.length} issues`);
      }

      return results;
    } catch (error) {
      throw new TokenError("Failed to check token expiry", "sso-token", "expiry-check", undefined, {
        error,
      });
    }
  }

  /**
   * Clear expired tokens from the cache
   *
   * @returns Promise resolving to number of tokens cleared
   */
  async clearExpiredTokens(): Promise<number> {
    try {
      const expiredTokens = await this.checkTokenExpiry();
      const expiredCount = expiredTokens.filter((token) => token.status === "expired").length;

      // Note: We don't actually delete the cache files as they may be managed by AWS CLI
      // This method serves as a check for expired tokens

      if (this.options.enableDebugLogging) {
        console.debug(`Found ${expiredCount} expired tokens`);
      }

      return expiredCount;
    } catch (error) {
      throw new TokenError(
        "Failed to clear expired tokens",
        "sso-token",
        "token-cleanup",
        undefined,
        { error },
      );
    }
  }

  /**
   * Get all available SSO tokens
   *
   * @returns Promise resolving to array of all token information
   */
  async getAllTokens(): Promise<SsoTokenInfo[]> {
    try {
      const cacheFiles = await this.findSsoCacheFiles();
      const tokens: SsoTokenInfo[] = [];

      for (const cacheFile of cacheFiles) {
        const tokenInfo = await this.readTokenFromCache(cacheFile);

        if (tokenInfo) {
          const now = new Date();
          const expiresAt = new Date(tokenInfo.expiresAt);
          const timeUntilExpiry = expiresAt.getTime() - now.getTime();
          const isValid = timeUntilExpiry > 0;
          const isNearExpiry = timeUntilExpiry <= this.options.expiryWarningThreshold;

          tokens.push({
            accessToken: tokenInfo.accessToken,
            expiresAt,
            region: tokenInfo.region,
            startUrl: tokenInfo.startUrl,
            isValid,
            isNearExpiry,
            timeUntilExpiry,
          });
        }
      }

      if (this.options.enableDebugLogging) {
        console.debug(`Retrieved ${tokens.length} SSO tokens`);
      }

      return tokens;
    } catch (error) {
      throw new TokenError(
        "Failed to get all tokens",
        "sso-token",
        "token-enumeration",
        undefined,
        { error },
      );
    }
  }

  /**
   * Check if SSO cache directory exists
   *
   * @returns Promise resolving to true if cache directory exists
   */
  async hasSsoCache(): Promise<boolean> {
    try {
      const stats = await fs.stat(this.options.ssoCacheDir);
      return stats.isDirectory();
    } catch (error) {
      // Handle different error types appropriately
      if (error instanceof Error) {
        // ENOENT errors (missing directory) should be handled gracefully
        if (error.message.includes("ENOENT") || error.message.includes("no such file")) {
          return false;
        }
        // All other errors (permission, file system errors, etc.) should be thrown
        throw error;
      }

      // Default to graceful handling for unknown error types
      return false;
    }
  }

  /**
   * Find all SSO cache files
   *
   * @returns Promise resolving to array of cache file paths
   * @internal
   */
  private async findSsoCacheFiles(): Promise<string[]> {
    try {
      const hasCache = await this.hasSsoCache();
      if (!hasCache) {
        return [];
      }

      const files = await fs.readdir(this.options.ssoCacheDir);
      const cacheFiles = files
        .filter((file) => file.endsWith(".json"))
        .map((file) => path.join(this.options.ssoCacheDir, file));

      return cacheFiles;
    } catch (error) {
      if (this.options.enableDebugLogging) {
        console.debug(
          `Failed to find SSO cache files: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Handle different error types appropriately
      if (error instanceof Error) {
        // ENOENT errors (missing directory/files) should be handled gracefully
        if (error.message.includes("ENOENT") || error.message.includes("no such file")) {
          return [];
        }
        // All other errors (permission, file system errors, etc.) should be thrown
        throw error;
      }

      // Default to graceful handling for unknown error types
      return [];
    }
  }

  /**
   * Read token information from a cache file
   *
   * @param filePath - Path to the cache file
   * @returns Promise resolving to token information or undefined
   * @internal
   */
  private async readTokenFromCache(filePath: string): Promise<SsoCacheFile | undefined> {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const cacheData = JSON.parse(content) as SsoCacheFile;

      // Validate required fields
      if (!cacheData.accessToken || !cacheData.expiresAt || !cacheData.startUrl) {
        if (this.options.enableDebugLogging) {
          console.debug(`Invalid cache file format: ${filePath}`);
        }
        return undefined;
      }

      return cacheData;
    } catch (error) {
      if (this.options.enableDebugLogging) {
        if (
          error instanceof Error &&
          (error.message.includes("ENOENT") || error.message.includes("EACCES"))
        ) {
          console.debug(`Cache file access issue: ${filePath} - ${error.message}`);
        } else {
          console.debug(`Failed to read cache file: ${filePath}`, error);
        }
      }
      return undefined;
    }
  }

  /**
   * Format time until expiry in human-readable format
   *
   * @param milliseconds - Time in milliseconds
   * @returns Human-readable time string
   *
   * @public
   */
  static formatTimeUntilExpiry(milliseconds: number): string {
    if (milliseconds <= 0) {
      return "expired";
    }

    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days} day${days === 1 ? "" : "s"}`;
    }
    if (hours > 0) {
      return `${hours} hour${hours === 1 ? "" : "s"}`;
    }
    if (minutes > 0) {
      return `${minutes} minute${minutes === 1 ? "" : "s"}`;
    }
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }
}
