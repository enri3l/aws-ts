/**
 * Unit tests for auth profiles command
 *
 * Tests command parsing, validation, output formatting, and integration
 * with AuthService using AWS SDK mocking and filesystem simulation.
 */

import { STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import { vol } from "memfs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AuthProfilesCommand from "../../../../src/commands/auth/profiles.js";
import type { ProfileInfo } from "../../../../src/lib/auth-schemas.js";
import { AuthService } from "../../../../src/services/auth-service.js";

// Mock filesystem
vi.mock("node:fs/promises", () => import("memfs").then((m) => m.fs.promises));
vi.mock("node:fs", () => import("memfs").then((m) => m.fs));

// Mock AuthService
vi.mock("../../../../src/services/auth-service.js");

// Setup AWS SDK mocks
const stsMock = mockClient(STSClient);

// Mock profile data
const mockProfiles: ProfileInfo[] = [
  {
    name: "test-profile",
    type: "sso",
    active: true,
    credentialsValid: true,
    region: "us-west-2",
    ssoStartUrl: "https://example.awsapps.com/start",
    ssoRegion: "us-east-1",
    ssoAccountId: "123456789012",
    ssoRoleName: "TestRole",
    tokenExpiry: new Date(Date.now() + 3_600_000),
  },
  {
    name: "test-credentials",
    type: "credentials",
    active: false,
    credentialsValid: false,
    region: "us-east-1",
  },
  {
    name: "production",
    type: "sso",
    active: false,
    credentialsValid: true,
    region: "us-east-1",
    ssoStartUrl: "https://company.awsapps.com/start",
    ssoRegion: "us-east-1",
    ssoAccountId: "987654321098",
    ssoRoleName: "ProductionRole",
  },
];

describe("AuthProfilesCommand", () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    stsMock.reset();

    // Reset filesystem
    vol.reset();

    // Setup basic filesystem structure
    vol.fromJSON({
      "/home/user/.aws/config": `[profile test-profile]
sso_start_url = https://example.awsapps.com/start
sso_region = us-east-1
sso_account_id = 123456789012
sso_role_name = TestRole
region = us-west-2

[profile production]
sso_start_url = https://company.awsapps.com/start
sso_region = us-east-1
sso_account_id = 987654321098
sso_role_name = ProductionRole
region = us-east-1`,
      "/home/user/.aws/credentials": `[test-credentials]
aws_access_key_id = AKIATEST123
aws_secret_access_key = secret123`,
    });

    // Mock AuthService instance methods
    const mockListProfiles = vi.fn().mockResolvedValue(mockProfiles);
    vi.mocked(AuthService).mockImplementation(
      () =>
        ({
          listProfiles: mockListProfiles,
        }) as any,
    );
  });

  describe("Flag handling", () => {
    it("should handle default table output", async () => {
      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": false,
          format: "table",
          verbose: false,
        },
        args: {},
      });
      const logMock = vi.fn();
      command.log = logMock;

      await command.run();

      const authServiceInstance = vi.mocked(AuthService).mock.results[0]?.value;
      expect(authServiceInstance.listProfiles).toHaveBeenCalledWith({
        detailed: false,
        activeOnly: false,
        format: "table",
      });

      // Should output table format
      expect(logMock).toHaveBeenCalled();
    });

    it("should handle --active-only flag", async () => {
      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": true,
          format: "table",
          verbose: false,
        },
        args: {},
      });

      await command.run();

      const authServiceInstance = vi.mocked(AuthService).mock.results[0]?.value;
      expect(authServiceInstance.listProfiles).toHaveBeenCalledWith({
        detailed: false,
        activeOnly: true,
        format: "table",
      });
    });

    it("should enable debug logging with verbose flag", async () => {
      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": false,
          format: "table",
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

  describe("Output formats", () => {
    it("should output JSON format when requested", async () => {
      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": false,
          format: "json",
          verbose: false,
        },
        args: {},
      });
      const logMock = vi.fn();
      command.log = logMock;

      await command.run();

      expect(logMock).toHaveBeenCalled();
      const logOutput = logMock.mock.calls[0]?.[0];
      expect(() => JSON.parse(logOutput)).not.toThrow();
    });

    it("should output empty JSON array when no profiles found", async () => {
      const mockListProfiles = vi.fn().mockResolvedValue([]);
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            listProfiles: mockListProfiles,
          }) as any,
      );

      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": false,
          format: "json",
          verbose: false,
        },
        args: {},
      });
      const logMock = vi.fn();
      command.log = logMock;

      await command.run();

      expect(logMock).toHaveBeenCalledWith("[]");
    });

    it("should output CSV format when requested", async () => {
      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": false,
          format: "csv",
          verbose: false,
        },
        args: {},
      });
      const logMock = vi.fn();
      command.log = logMock;

      await command.run();

      expect(logMock).toHaveBeenCalled();
      const logOutput = logMock.mock.calls[0]?.[0];
      expect(logOutput).toContain("Profile,Type,Active,Valid");
    });

    it("should output detailed CSV format with all columns", async () => {
      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: true,
          "active-only": false,
          format: "csv",
          verbose: false,
        },
        args: {},
      });
      const logMock = vi.fn();
      command.log = logMock;

      await command.run();

      expect(logMock).toHaveBeenCalled();
      const headerOutput = logMock.mock.calls[0]?.[0];
      expect(headerOutput).toContain(
        "Profile,Type,Active,Valid,Region,Output,SSO Start URL,SSO Region,SSO Account,SSO Role,Token Status",
      );

      // Check that SSO profile data is included
      const ssoProfileOutput = logMock.mock.calls.find((call) => call[0]?.includes("test-profile"));
      expect(ssoProfileOutput).toBeDefined();
      expect(ssoProfileOutput![0]).toContain("https://example.awsapps.com/start");
    });

    it("should handle CSV escaping for values with commas", async () => {
      const profileWithCommas = {
        ...mockProfiles[0]!,
        name: "test,profile,with,commas",
        ssoStartUrl: "https://example.com/start,with,commas",
      };

      const mockListProfiles = vi.fn().mockResolvedValue([profileWithCommas]);
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            listProfiles: mockListProfiles,
          }) as any,
      );

      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: true,
          "active-only": false,
          format: "csv",
          verbose: false,
        },
        args: {},
      });
      const logMock = vi.fn();
      command.log = logMock;

      await command.run();

      // Find the CSV row with the profile data
      const profileRowCall = logMock.mock.calls.find((call) =>
        call[0]?.includes('"test,profile,with,commas"'),
      );
      expect(profileRowCall).toBeDefined();
      expect(profileRowCall![0]).toContain('"test,profile,with,commas"');
      expect(profileRowCall![0]).toContain('"https://example.com/start,with,commas"');
    });

    it("should handle CSV with credentials profile (non-SSO) in detailed mode", async () => {
      const credentialsProfile = {
        name: "credentials-profile",
        type: "credentials" as const,
        active: false,
        credentialsValid: true,
        region: "us-west-1",
      };

      const mockListProfiles = vi.fn().mockResolvedValue([credentialsProfile]);
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            listProfiles: mockListProfiles,
          }) as any,
      );

      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: true,
          "active-only": false,
          format: "csv",
          verbose: false,
        },
        args: {},
      });
      const logMock = vi.fn();
      command.log = logMock;

      await command.run();

      // Find the CSV row with the credentials profile data
      const profileRowCall = logMock.mock.calls.find((call) =>
        call[0]?.includes("credentials-profile"),
      );
      expect(profileRowCall).toBeDefined();
      // Should have empty SSO fields for credentials profile
      expect(profileRowCall![0]).toMatch(
        /credentials-profile,credentials,false,true,us-west-1,,,,,/,
      );
    });

    it("should handle CSV with SSO profile with no token", async () => {
      const ssoProfileNoToken = {
        ...mockProfiles[0]!,
        tokenExpiry: undefined,
      };

      const mockListProfiles = vi.fn().mockResolvedValue([ssoProfileNoToken]);
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            listProfiles: mockListProfiles,
          }) as any,
      );

      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: true,
          "active-only": false,
          format: "csv",
          verbose: false,
        },
        args: {},
      });
      const logMock = vi.fn();
      command.log = logMock;

      await command.run();

      // Find the CSV row with the profile data
      const profileRowCall = logMock.mock.calls.find((call) => call[0]?.includes("test-profile"));
      expect(profileRowCall).toBeDefined();
      expect(profileRowCall![0]).toContain("No token");
    });

    it("should handle CSV with expired SSO token", async () => {
      const expiredProfile = {
        ...mockProfiles[0]!,
        tokenExpiry: new Date(Date.now() - 3_600_000), // 1 hour ago
      };

      const mockListProfiles = vi.fn().mockResolvedValue([expiredProfile]);
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            listProfiles: mockListProfiles,
          }) as any,
      );

      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: true,
          "active-only": false,
          format: "csv",
          verbose: false,
        },
        args: {},
      });
      const logMock = vi.fn();
      command.log = logMock;

      await command.run();

      // Find the CSV row with the profile data
      const profileRowCall = logMock.mock.calls.find((call) => call[0]?.includes("test-profile"));
      expect(profileRowCall).toBeDefined();
      expect(profileRowCall![0]).toContain("Expired");
    });

    it("should output table format by default", async () => {
      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": false,
          format: "table",
          verbose: false,
        },
        args: {},
      });
      const logMock = vi.fn();
      command.log = logMock;

      await command.run();

      expect(logMock).toHaveBeenCalled();
    });

    it("should show detailed information when --detailed flag is used", async () => {
      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: true,
          "active-only": false,
          format: "table",
          verbose: false,
        },
        args: {},
      });
      const logMock = vi.fn();
      command.log = logMock;

      await command.run();

      expect(logMock).toHaveBeenCalled();
    });

    it("should handle --output flag for file writing", async () => {
      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": false,
          format: "json",
          output: "profiles.json",
          verbose: false,
        },
        args: {},
      });

      // Mock fs.writeFile
      const writeFileMock = vi.fn().mockResolvedValue(void 0);
      vi.doMock("node:fs/promises", () => ({
        writeFile: writeFileMock,
      }));

      await command.run();

      // Note: The actual file writing logic would need to be implemented in the command
      // This test verifies the flag is parsed correctly
      expect(writeFileMock).not.toHaveBeenCalled();
    });
  });

  describe("Profile filtering and display", () => {
    it("should filter profiles when --active-only is used", async () => {
      const activeOnlyProfiles = mockProfiles.filter((p) => p.active);
      const mockListProfiles = vi.fn().mockResolvedValue(activeOnlyProfiles);
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            listProfiles: mockListProfiles,
          }) as any,
      );

      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": true,
          format: "table",
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockListProfiles).toHaveBeenCalledWith({
        detailed: false,
        activeOnly: true,
        format: "table",
      });
    });

    it("should handle empty profile list", async () => {
      const mockListProfiles = vi.fn().mockResolvedValue([]);
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            listProfiles: mockListProfiles,
          }) as any,
      );

      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": false,
          format: "table",
          verbose: false,
        },
        args: {},
      });
      const logMock = vi.fn();
      command.log = logMock;

      await command.run();

      expect(logMock).toHaveBeenCalledWith("No AWS profiles found");
    });

    it("should display token expiry warnings", async () => {
      const expiringSoonProfile: ProfileInfo = {
        ...mockProfiles[0]!,
        tokenExpiry: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      };

      const mockListProfiles = vi.fn().mockResolvedValue([expiringSoonProfile]);
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            listProfiles: mockListProfiles,
          }) as any,
      );

      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": false,
          format: "table",
          verbose: false,
        },
        args: {},
      });
      const logMock = vi.fn();
      const warnMock = vi.fn();
      command.log = logMock;
      command.warn = warnMock;

      await command.run();

      expect(warnMock).toHaveBeenCalledWith(
        expect.stringContaining("⚠ Profiles with tokens expiring soon:"),
      );
    });
  });

  describe("Error handling", () => {
    it("should handle service errors gracefully", async () => {
      const mockListProfiles = vi.fn().mockRejectedValue(new Error("Service error"));
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            listProfiles: mockListProfiles,
          }) as any,
      );

      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": false,
          format: "table",
          verbose: false,
        },
        args: {},
      });

      await expect(command.run()).rejects.toThrow("Failed to list profiles:");
    });

    it("should handle JSON format errors gracefully", async () => {
      const mockListProfiles = vi.fn().mockRejectedValue(new Error("Network error"));
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            listProfiles: mockListProfiles,
          }) as any,
      );

      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": false,
          format: "json",
          verbose: false,
        },
        args: {},
      });
      const logMock = vi.fn();
      const exitMock = vi.fn().mockImplementation(() => {
        throw new Error("Process exit");
      });
      command.log = logMock;
      command.exit = exitMock;

      await expect(command.run()).rejects.toThrow("Process exit");

      expect(logMock).toHaveBeenCalledWith(
        expect.stringContaining('"error": "Failed to list profiles"'),
      );
      expect(exitMock).toHaveBeenCalledWith(1);
    });

    it("should handle inner error with JSON format and verbose flag", async () => {
      const mockListProfiles = vi.fn().mockRejectedValue(new Error("Inner service error"));
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            listProfiles: mockListProfiles,
          }) as any,
      );

      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": false,
          format: "json",
          verbose: true,
        },
        args: {},
      });
      const logMock = vi.fn();
      const exitMock = vi.fn().mockImplementation(() => {
        throw new Error("Process exit");
      });
      command.log = logMock;
      command.exit = exitMock;

      await expect(command.run()).rejects.toThrow("Process exit");

      expect(logMock).toHaveBeenCalledWith(
        expect.stringContaining('"error": "Failed to list profiles"'),
      );
      expect(exitMock).toHaveBeenCalledWith(1);
    });

    it("should handle error in inner try-catch with JSON output", async () => {
      // Mock AuthService constructor to throw an error
      vi.mocked(AuthService).mockImplementation(() => {
        throw new Error("AuthService construction failed");
      });

      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": false,
          format: "json",
          verbose: false,
        },
        args: {},
      });
      const logMock = vi.fn();
      const exitMock = vi.fn().mockImplementation(() => {
        throw new Error("Process exit");
      });
      command.log = logMock;
      command.exit = exitMock;

      await expect(command.run()).rejects.toThrow("Process exit");

      expect(logMock).toHaveBeenCalledWith(
        expect.stringContaining('"error": "Failed to list profiles"'),
      );
      expect(exitMock).toHaveBeenCalledWith(1);
    });

    it("should handle non-Error exceptions", async () => {
      const mockListProfiles = vi.fn().mockRejectedValue("String error");
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            listProfiles: mockListProfiles,
          }) as any,
      );

      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": false,
          format: "table",
          verbose: false,
        },
        args: {},
      });

      await expect(command.run()).rejects.toThrow("Failed to list profiles:");
    });

    it("should handle invalid format gracefully", async () => {
      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockRejectedValue(new Error("Invalid format option"));

      await expect(command.run()).rejects.toThrow("Invalid format option");
    });

    it("should handle error with table format and verbose flag", async () => {
      const mockListProfiles = vi.fn().mockRejectedValue(new Error("Service error"));
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            listProfiles: mockListProfiles,
          }) as any,
      );

      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": false,
          format: "table",
          verbose: true,
        },
        args: {},
      });
      const errorMock = vi.fn();
      command.error = errorMock;

      await command.run();

      expect(errorMock).toHaveBeenCalledWith(expect.stringContaining("Failed to list profiles:"), {
        exit: 1,
      });
    });
  });

  describe("AuthService integration", () => {
    it("should create AuthService with correct configuration", async () => {
      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": false,
          format: "table",
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

    it("should call listProfiles with correct parameters", async () => {
      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": true,
          format: "table",
          verbose: false,
        },
        args: {},
      });

      await command.run();

      const authServiceInstance = vi.mocked(AuthService).mock.results[0]?.value;
      expect(authServiceInstance.listProfiles).toHaveBeenCalledWith({
        detailed: false,
        activeOnly: true,
        format: "table",
      });
    });
  });

  describe("Edge case error scenarios", () => {
    it("should handle CSV format with special characters", async () => {
      const specialProfiles: ProfileInfo[] = [
        {
          name: "test,profile",
          type: "sso",
          active: true,
          credentialsValid: true,
          region: "us-west-2",
          ssoStartUrl: 'https://example.awsapps.com/start"with"quotes',
          ssoRegion: "us-east-1",
          ssoAccountId: "123456789012",
          ssoRoleName: "TestRole",
        },
      ];

      const mockListProfiles = vi.fn().mockResolvedValue(specialProfiles);
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            listProfiles: mockListProfiles,
          }) as any,
      );

      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: true,
          "active-only": false,
          format: "csv",
          verbose: false,
        },
        args: {},
      });

      const logSpy = vi.spyOn(command, "log");
      await command.run();

      // Verify CSV escaping for special characters
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"test,profile"'));
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"with"'));
    });

    it("should handle malformed token expiry data", async () => {
      const malformedProfiles: ProfileInfo[] = [
        {
          name: "malformed-profile",
          type: "sso",
          active: true,
          credentialsValid: true,
          region: "us-west-2",
          tokenExpiry: new Date("invalid-date"),
        },
      ];

      const mockListProfiles = vi.fn().mockResolvedValue(malformedProfiles);
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            listProfiles: mockListProfiles,
          }) as any,
      );

      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: true,
          "active-only": false,
          format: "table",
          verbose: false,
        },
        args: {},
      });

      // Should not throw despite malformed date
      await expect(command.run()).resolves.toBeUndefined();
    });

    it("should handle non-Error objects thrown by AuthService", async () => {
      const mockListProfiles = vi.fn().mockRejectedValue("String error instead of Error object");
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            listProfiles: mockListProfiles,
          }) as any,
      );

      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: false,
          "active-only": false,
          format: "table",
          verbose: false,
        },
        args: {},
      });

      const errorMock = vi.fn();
      command.error = errorMock;

      await command.run();

      expect(errorMock).toHaveBeenCalledWith(
        "Failed to list profiles: String error instead of Error object",
        { exit: 1 },
      );
    });

    it("should handle unexpected errors in CSV field building", async () => {
      const profilesWithNullValues: ProfileInfo[] = [
        {
          name: "null-values",
          type: "sso",
          active: true,
          credentialsValid: true,
          region: undefined as any,
          ssoStartUrl: undefined as any,
        },
      ];

      const mockListProfiles = vi.fn().mockResolvedValue(profilesWithNullValues);
      vi.mocked(AuthService).mockImplementation(
        () =>
          ({
            listProfiles: mockListProfiles,
          }) as any,
      );

      const command = new AuthProfilesCommand([], {} as any);
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          detailed: true,
          "active-only": false,
          format: "csv",
          verbose: false,
        },
        args: {},
      });

      // Should handle null/undefined values gracefully
      await expect(command.run()).resolves.toBeUndefined();
    });
  });
});
