/**
 * Unit tests for auth logout command
 *
 * Tests command parsing, validation, and integration with AuthService
 * using AWS SDK mocking and filesystem simulation.
 */

import { STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import { vol } from "memfs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AuthLogoutCommand from "../../../../src/commands/auth/logout.js";
import { AuthService } from "../../../../src/services/auth-service.js";

// Mock filesystem
vi.mock("node:fs/promises", () => import("memfs").then((m) => m.fs.promises));
vi.mock("node:fs", () => import("memfs").then((m) => m.fs));

// Mock AuthService
vi.mock("../../../../src/services/auth-service.js");

// Setup AWS SDK mocks
const stsMock = mockClient(STSClient);

describe("AuthLogoutCommand", () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    stsMock.reset();

    // Reset filesystem
    vol.reset();

    // Setup basic filesystem structure
    vol.fromJSON({
      "/home/user/.aws/config": `[profile test-sso]
sso_start_url = https://example.awsapps.com/start
sso_region = us-east-1
sso_account_id = 123456789012
sso_role_name = TestRole
region = us-west-2`,
      "/home/user/.aws/sso/cache/valid-token.json": JSON.stringify({
        accessToken: "valid-token",
        expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        region: "us-east-1",
        startUrl: "https://example.awsapps.com/start",
      }),
    });

    // Mock AuthService instance methods
    const mockLogout = vi.fn().mockResolvedValue(void 0);
    vi.mocked(AuthService).mockImplementation(
      () =>
        ({
          logout: mockLogout,
        }) as any,
    );
  });

  describe("Flag validation", () => {
    it("should reject both --profile and --all-profiles flags", async () => {
      const command = new AuthLogoutCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          profile: "test",
          "all-profiles": true,
          verbose: false,
        },
        args: {},
      });

      await expect(command.run()).rejects.toThrow(
        "Cannot specify both --profile and --all-profiles",
      );
    });

    it("should accept --profile flag alone", async () => {
      const command = new AuthLogoutCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          profile: "test",
          "all-profiles": false,
          verbose: false,
        },
        args: {},
      });

      await expect(command.run()).resolves.toBeUndefined();
    });

    it("should accept --all-profiles flag alone", async () => {
      const command = new AuthLogoutCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          "all-profiles": true,
          verbose: false,
        },
        args: {},
      });

      await expect(command.run()).resolves.toBeUndefined();
    });

    it("should accept no flags for default behavior", async () => {
      const command = new AuthLogoutCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          "all-profiles": false,
          verbose: false,
        },
        args: {},
      });

      await expect(command.run()).resolves.toBeUndefined();
    });
  });

  describe("AuthService integration", () => {
    it("should call AuthService.logout with correct parameters for profile logout", async () => {
      const command = new AuthLogoutCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          profile: "test-profile",
          "all-profiles": false,
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(AuthService).toHaveBeenCalledWith({
        enableDebugLogging: false,
        enableProgressIndicators: true,
      });

      const authServiceInstance = vi.mocked(AuthService).mock.results[0]?.value;
      expect(authServiceInstance.logout).toHaveBeenCalledWith({
        profile: "test-profile",
        allProfiles: false,
      });
    });

    it("should call AuthService.logout with correct parameters for all profiles logout", async () => {
      const command = new AuthLogoutCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          "all-profiles": true,
          verbose: false,
        },
        args: {},
      });

      await command.run();

      const authServiceInstance = vi.mocked(AuthService).mock.results[0]?.value;
      expect(authServiceInstance.logout).toHaveBeenCalledWith({
        profile: undefined,
        allProfiles: true,
      });
    });

    it("should enable debug logging when verbose flag is set", async () => {
      const command = new AuthLogoutCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          "all-profiles": false,
          verbose: true,
        },
        args: {},
      });

      await command.run();

      expect(AuthService).toHaveBeenCalledWith({
        enableDebugLogging: true,
        enableProgressIndicators: true,
      });
    });
  });

  describe("Error handling", () => {
    it("should handle logout errors gracefully", async () => {
      const mockLogout = vi.fn().mockRejectedValue(new Error("Logout failed"));
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            logout: mockLogout,
          }) as any,
      );

      const command = new AuthLogoutCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          profile: "test",
          "all-profiles": false,
          verbose: false,
        },
        args: {},
      });

      await expect(command.run()).rejects.toThrow("Logout failed:");
    });

    it("should format errors properly with verbose flag", async () => {
      const mockLogout = vi.fn().mockRejectedValue(new Error("Network error"));
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            logout: mockLogout,
          }) as any,
      );

      const command = new AuthLogoutCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          "all-profiles": false,
          verbose: true,
        },
        args: {},
      });

      await expect(command.run()).rejects.toThrow("Logout failed:");
    });

    it("should handle non-Error exceptions", async () => {
      const mockLogout = vi.fn().mockRejectedValue("String error");
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            logout: mockLogout,
          }) as any,
      );

      const command = new AuthLogoutCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          "all-profiles": false,
          verbose: false,
        },
        args: {},
      });

      await expect(command.run()).rejects.toThrow("Logout failed: String error");
    });
  });
});
