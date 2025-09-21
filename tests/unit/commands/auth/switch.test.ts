/**
 * Unit tests for auth switch command
 *
 * Tests command parsing, validation, and integration with AuthService
 * using AWS SDK mocking and filesystem simulation.
 */

import { STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import { vol } from "memfs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AuthSwitchCommand from "../../../../src/commands/auth/switch.js";
import { AuthenticationError, ProfileError } from "../../../../src/lib/auth-errors.js";
import { AuthService } from "../../../../src/services/auth-service.js";

// Mock filesystem
vi.mock("node:fs/promises", () => import("memfs").then((m) => m.fs.promises));
vi.mock("node:fs", () => import("memfs").then((m) => m.fs));

// Mock AuthService
vi.mock("../../../../src/services/auth-service.js");

// Setup AWS SDK mocks
const stsMock = mockClient(STSClient);

describe("AuthSwitchCommand", () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    stsMock.reset();

    // Reset filesystem
    vol.reset();

    // Setup basic filesystem structure
    vol.fromJSON({
      "/home/user/.aws/config": `[profile test-profile]
region = us-west-2
output = json

[profile production]
region = us-east-1
output = table`,
      "/home/user/.aws/credentials": `[test-profile]
aws_access_key_id = AKIATEST123
aws_secret_access_key = secret123

[production]
aws_access_key_id = AKIAPROD456
aws_secret_access_key = secret456`,
    });

    // Mock AuthService instance methods
    const mockSwitchProfile = vi.fn().mockResolvedValue(void 0);
    vi.mocked(AuthService).mockImplementation(
      () =>
        ({
          switchProfile: mockSwitchProfile,
        }) as any,
    );
  });

  describe("Argument validation", () => {
    it("should require profile argument", async () => {
      const command = new AuthSwitchCommand([], {} as any);
      vi.spyOn(command, "parse").mockRejectedValue(new Error("Missing required argument"));

      await expect(command.run()).rejects.toThrow();
    });

    it("should accept valid profile argument", async () => {
      const command = new AuthSwitchCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        args: { profile: "test-profile" },
        flags: {
          "no-validate": false,
          "set-default": false,
          verbose: false,
        },
      });

      await expect(command.run()).resolves.toBeUndefined();
    });
  });

  describe("Flag handling", () => {
    it("should handle --no-validate flag", async () => {
      const command = new AuthSwitchCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        args: { profile: "test-profile" },
        flags: {
          "no-validate": true,
          "set-default": false,
          verbose: false,
        },
      });

      await command.run();

      const authServiceInstance = vi.mocked(AuthService).mock.results[0]?.value;
      expect(authServiceInstance.switchProfile).toHaveBeenCalledWith({
        profile: "test-profile",
        validate: false,
        setDefault: false,
      });
    });

    it("should handle --set-default flag", async () => {
      const command = new AuthSwitchCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        args: { profile: "production" },
        flags: {
          "no-validate": false,
          "set-default": true,
          verbose: false,
        },
      });

      await command.run();

      const authServiceInstance = vi.mocked(AuthService).mock.results[0]?.value;
      expect(authServiceInstance.switchProfile).toHaveBeenCalledWith({
        profile: "production",
        validate: true,
        setDefault: true,
      });
    });

    it("should validate by default when no flags provided", async () => {
      const command = new AuthSwitchCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        args: { profile: "test-profile" },
        flags: {
          "no-validate": false,
          "set-default": false,
          verbose: false,
        },
      });

      await command.run();

      const authServiceInstance = vi.mocked(AuthService).mock.results[0]?.value;
      expect(authServiceInstance.switchProfile).toHaveBeenCalledWith({
        profile: "test-profile",
        validate: true,
        setDefault: false,
      });
    });

    it("should enable debug logging with verbose flag", async () => {
      const command = new AuthSwitchCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        args: { profile: "test-profile" },
        flags: {
          "no-validate": false,
          "set-default": false,
          verbose: true,
        },
      });

      await command.run();

      expect(AuthService).toHaveBeenCalledWith({
        enableDebugLogging: true,
        enableProgressIndicators: true,
      });
    });
  });

  describe("AuthService integration", () => {
    it("should call AuthService.switchProfile with correct parameters", async () => {
      const command = new AuthSwitchCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        args: { profile: "target-profile" },
        flags: {
          "no-validate": false,
          "set-default": false,
          verbose: false,
        },
      });

      await command.run();

      expect(AuthService).toHaveBeenCalledWith({
        enableDebugLogging: false,
        enableProgressIndicators: true,
      });

      const authServiceInstance = vi.mocked(AuthService).mock.results[0]?.value;
      expect(authServiceInstance.switchProfile).toHaveBeenCalledWith({
        profile: "target-profile",
        validate: true,
        setDefault: false,
      });
    });

    it("should provide verbose output when verbose flag is set", async () => {
      // Mock console.log to capture output
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const command = new AuthSwitchCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        args: { profile: "test-profile" },
        flags: {
          "no-validate": false,
          "set-default": true,
          verbose: true,
        },
      });
      // Mock the log method on the command
      const logMock = vi.fn();
      command.log = logMock;

      await command.run();

      expect(logMock).toHaveBeenCalledWith("");
      expect(logMock).toHaveBeenCalledWith(
        "Profile switch complete. Environment variables updated:",
      );
      expect(logMock).toHaveBeenCalledWith("  AWS_PROFILE=test-profile");
      expect(logMock).toHaveBeenCalledWith("Profile set as session default");

      logSpy.mockRestore();
    });

    it("should show warning when validation is skipped", async () => {
      const command = new AuthSwitchCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        args: { profile: "test-profile" },
        flags: {
          "no-validate": true,
          "set-default": false,
          verbose: true,
        },
      });
      const logMock = vi.fn();
      const warnMock = vi.fn();
      command.log = logMock;
      command.warn = warnMock;

      await command.run();

      expect(warnMock).toHaveBeenCalledWith(
        "Credential validation skipped. Run 'aws-ts auth status' to check authentication status.",
      );
    });
  });

  describe("Error handling", () => {
    it("should handle ProfileError gracefully", async () => {
      const mockSwitchProfile = vi
        .fn()
        .mockRejectedValue(new ProfileError("Profile not found", "nonexistent", "profile-switch"));
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            switchProfile: mockSwitchProfile,
          }) as any,
      );

      const command = new AuthSwitchCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        args: { profile: "nonexistent" },
        flags: {
          "no-validate": false,
          "set-default": false,
          verbose: false,
        },
      });

      await expect(command.run()).rejects.toThrow();
    });

    it("should handle AuthenticationError gracefully", async () => {
      const mockSwitchProfile = vi
        .fn()
        .mockRejectedValue(
          new AuthenticationError("Invalid credentials", "credential-validation", "test-profile"),
        );
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            switchProfile: mockSwitchProfile,
          }) as any,
      );

      const command = new AuthSwitchCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        args: { profile: "test-profile" },
        flags: {
          "no-validate": false,
          "set-default": false,
          verbose: false,
        },
      });

      await expect(command.run()).rejects.toThrow();
    });

    it("should handle generic errors", async () => {
      const mockSwitchProfile = vi.fn().mockRejectedValue(new Error("Network error"));
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            switchProfile: mockSwitchProfile,
          }) as any,
      );

      const command = new AuthSwitchCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        args: { profile: "test-profile" },
        flags: {
          "no-validate": false,
          "set-default": false,
          verbose: false,
        },
      });

      await expect(command.run()).rejects.toThrow("Profile switch failed:");
    });

    it("should handle non-Error exceptions", async () => {
      const mockSwitchProfile = vi.fn().mockRejectedValue("String error");
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            switchProfile: mockSwitchProfile,
          }) as any,
      );

      const command = new AuthSwitchCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        args: { profile: "test-profile" },
        flags: {
          "no-validate": false,
          "set-default": false,
          verbose: false,
        },
      });

      await expect(command.run()).rejects.toThrow("Profile switch failed: String error");
    });
  });
});
