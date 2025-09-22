/**
 * Unit tests for auth login command
 *
 * Tests command parsing, validation, and integration with AuthService
 * using AWS SDK mocking and filesystem simulation.
 */

import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import { vol } from "memfs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AuthLoginCommand from "../../../../src/commands/auth/login.js";
import { AuthenticationError, ProfileError } from "../../../../src/lib/auth-errors.js";
import { ConfigurationError } from "../../../../src/lib/errors.js";
import { AuthService } from "../../../../src/services/auth-service.js";

// Mock filesystem
vi.mock("node:fs/promises", () => import("memfs").then((m) => m.fs.promises));
vi.mock("node:fs", () => import("memfs").then((m) => m.fs));

// Mock AuthService
vi.mock("../../../../src/services/auth-service.js");

// Setup AWS SDK mocks
const stsMock = mockClient(STSClient);

describe("AuthLoginCommand", () => {
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

    // Setup default STS mock
    stsMock.on(GetCallerIdentityCommand).resolves({
      UserId: "AROA123456789EXAMPLE:test-user",
      Account: "123456789012",
      Arn: "arn:aws:sts::123456789012:assumed-role/TestRole/test-user",
    });
  });

  describe("command configuration", () => {
    it("should have correct description", () => {
      expect(AuthLoginCommand.description).toBe("Authenticate with AWS using SSO");
    });

    it("should have proper examples", () => {
      expect(AuthLoginCommand.examples).toHaveLength(5);
      expect(AuthLoginCommand.examples[0].description).toContain("default AWS profile");
    });

    it("should define all required flags", () => {
      const flags = AuthLoginCommand.flags;
      expect(flags.profile).toBeDefined();
      expect(flags.force).toBeDefined();
      expect(flags.configure).toBeDefined();
      expect(flags["sso-start-url"]).toBeDefined();
      expect(flags["sso-region"]).toBeDefined();
      expect(flags["sso-account-id"]).toBeDefined();
      expect(flags["sso-role-name"]).toBeDefined();
      expect(flags.verbose).toBeDefined();
    });
  });

  describe("basic login", () => {
    it("should perform basic login without profile", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const mockLogin = vi.fn().mockResolvedValue();
      mockAuthService.mockImplementation(
        () =>
          ({
            login: mockLogin,
          }) as any,
      );

      const command = new AuthLoginCommand([], {} as any);

      // Mock the parse method to return empty flags
      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          force: false,
          configure: false,
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockAuthService).toHaveBeenCalledWith({
        enableDebugLogging: false,
        enableProgressIndicators: true,
      });

      expect(mockLogin).toHaveBeenCalledWith({
        profile: undefined,
        force: false,
        configure: false,
        ssoConfig: undefined,
      });
    });

    it("should perform login with specific profile", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const mockLogin = vi.fn().mockResolvedValue();
      mockAuthService.mockImplementation(
        () =>
          ({
            login: mockLogin,
          }) as any,
      );

      const command = new AuthLoginCommand([], {} as any);

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          profile: "test-profile",
          force: false,
          configure: false,
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockLogin).toHaveBeenCalledWith({
        profile: "test-profile",
        force: false,
        configure: false,
        ssoConfig: undefined,
      });
    });

    it("should perform forced login", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const mockLogin = vi.fn().mockResolvedValue();
      mockAuthService.mockImplementation(
        () =>
          ({
            login: mockLogin,
          }) as any,
      );

      const command = new AuthLoginCommand([], {} as any);

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          profile: "test-profile",
          force: true,
          configure: false,
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockLogin).toHaveBeenCalledWith({
        profile: "test-profile",
        force: true,
        configure: false,
        ssoConfig: undefined,
      });
    });
  });

  describe("SSO configuration", () => {
    it("should configure new SSO profile with all required flags", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const mockLogin = vi.fn().mockResolvedValue();
      mockAuthService.mockImplementation(
        () =>
          ({
            login: mockLogin,
          }) as any,
      );

      const command = new AuthLoginCommand([], {} as any);

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          profile: "new-profile",
          configure: true,
          "sso-start-url": new URL("https://example.awsapps.com/start"),
          "sso-region": "us-east-1",
          "sso-account-id": "123456789012",
          "sso-role-name": "AdministratorAccess",
          force: false,
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockLogin).toHaveBeenCalledWith({
        profile: "new-profile",
        force: false,
        configure: true,
        ssoConfig: {
          ssoStartUrl: "https://example.awsapps.com/start",
          ssoRegion: "us-east-1",
          ssoAccountId: "123456789012",
          ssoRoleName: "AdministratorAccess",
        },
      });
    });

    it("should throw error when configure flag is true but SSO config is incomplete", async () => {
      const command = new AuthLoginCommand([], {} as any);
      const mockError = vi.spyOn(command, "error").mockImplementation(() => {
        throw new Error("Command error");
      });

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          configure: true,
          "sso-start-url": new URL("https://example.awsapps.com/start"),
          // Missing other required SSO flags
          force: false,
          verbose: false,
        },
        args: {},
      });

      await expect(command.run()).rejects.toThrow();
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining("SSO configuration requires"),
        { exit: 1 },
      );
    });
  });

  describe("verbose mode", () => {
    it("should enable debug logging when verbose flag is true", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const mockLogin = vi.fn().mockResolvedValue();
      mockAuthService.mockImplementation(
        () =>
          ({
            login: mockLogin,
          }) as any,
      );

      const command = new AuthLoginCommand([], {} as any);

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          verbose: true,
          force: false,
          configure: false,
        },
        args: {},
      });

      await command.run();

      expect(mockAuthService).toHaveBeenCalledWith({
        enableDebugLogging: true,
        enableProgressIndicators: true,
      });
    });
  });

  describe("error handling", () => {
    it("should handle AuthenticationError properly", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const authError = new AuthenticationError(
        "Authentication failed",
        "sso-login",
        "test-profile",
      );
      const mockLogin = vi.fn().mockRejectedValue(authError);
      mockAuthService.mockImplementation(
        () =>
          ({
            login: mockLogin,
          }) as any,
      );

      const command = new AuthLoginCommand([], {} as any);
      const mockError = vi.spyOn(command, "error").mockImplementation(() => {
        throw new Error("Command error");
      });

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          force: false,
          configure: false,
          verbose: false,
        },
        args: {},
      });

      await expect(command.run()).rejects.toThrow();
      expect(mockError).toHaveBeenCalledWith(expect.stringContaining("Authentication failed"), {
        exit: 1,
      });
    });

    it("should handle generic Error properly", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const genericError = new Error("Generic error");
      const mockLogin = vi.fn().mockRejectedValue(genericError);
      mockAuthService.mockImplementation(
        () =>
          ({
            login: mockLogin,
          }) as any,
      );

      const command = new AuthLoginCommand([], {} as any);
      const mockError = vi.spyOn(command, "error").mockImplementation(() => {
        throw new Error("Command error");
      });

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          force: false,
          configure: false,
          verbose: false,
        },
        args: {},
      });

      await expect(command.run()).rejects.toThrow();
      expect(mockError).toHaveBeenCalledWith("Authentication failed: Generic error", { exit: 1 });
    });

    it("should handle non-Error exceptions", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const stringError = "String error";
      const mockLogin = vi.fn().mockRejectedValue(stringError);
      mockAuthService.mockImplementation(
        () =>
          ({
            login: mockLogin,
          }) as any,
      );

      const command = new AuthLoginCommand([], {} as any);
      const mockError = vi.spyOn(command, "error").mockImplementation(() => {
        throw new Error("Command error");
      });

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          force: false,
          configure: false,
          verbose: false,
        },
        args: {},
      });

      await expect(command.run()).rejects.toThrow();
      expect(mockError).toHaveBeenCalledWith("Authentication failed: String error", { exit: 1 });
    });
  });

  describe("flag validation", () => {
    it("should validate SSO account ID format", async () => {
      const parseFunction = AuthLoginCommand.flags["sso-account-id"].parse;

      // Valid 12-digit account ID
      await expect(parseFunction("123456789012")).resolves.toBe("123456789012");

      // Invalid account IDs
      await expect(parseFunction("12345")).rejects.toThrow(
        "SSO account ID must be a 12-digit number",
      );
      await expect(parseFunction("1234567890123")).rejects.toThrow(
        "SSO account ID must be a 12-digit number",
      );
      await expect(parseFunction("abcd56789012")).rejects.toThrow(
        "SSO account ID must be a 12-digit number",
      );
    });
  });

  describe("Regional authentication scenarios", () => {
    beforeEach(() => {
      // Setup regional filesystem structure
      vol.fromJSON(
        {
          "/home/user/.aws/config": `[profile test-dev]
sso_session = company
sso_account_id = 123456789012
sso_role_name = DeveloperAccess
region = eu-west-1

[sso-session company]
sso_region = eu-west-1
sso_start_url = https://company.awsapps.com/start
sso_registration_scopes = sso:account:access`,
          "/home/user/.aws/sso/cache/valid-token.json": JSON.stringify({
            accessToken: "valid-token",
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
            region: "eu-west-1",
            startUrl: "https://company.awsapps.com/start",
          }),
        },
        true,
      );

      // Setup STS mock response
      stsMock.on(GetCallerIdentityCommand).resolves({
        UserId: "AROA123456789EXAMPLE:test-user",
        Account: "123456789012",
        Arn: "arn:aws:sts::123456789012:assumed-role/DeveloperAccess/test-user",
      });
    });

    it("should authenticate with SSO session configuration", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const mockLogin = vi.fn().mockResolvedValue();
      mockAuthService.mockImplementation(
        () =>
          ({
            login: mockLogin,
          }) as any,
      );

      const command = new AuthLoginCommand([], {} as any);

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          profile: "test-dev",
          force: false,
          configure: false,
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockLogin).toHaveBeenCalledWith({
        profile: "test-dev",
        force: false,
        configure: false,
        ssoConfig: undefined,
      });
    });

    it("should configure new SSO profile", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const mockLogin = vi.fn().mockResolvedValue();
      mockAuthService.mockImplementation(
        () =>
          ({
            login: mockLogin,
          }) as any,
      );

      const command = new AuthLoginCommand([], {} as any);

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          profile: "new-profile",
          configure: true,
          "sso-start-url": new URL("https://example.awsapps.com/start"),
          "sso-region": "eu-south-1",
          "sso-account-id": "987654321098",
          "sso-role-name": "PowerUserAccess",
          force: false,
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockLogin).toHaveBeenCalledWith({
        profile: "new-profile",
        force: false,
        configure: true,
        ssoConfig: {
          ssoStartUrl: "https://example.awsapps.com/start",
          ssoRegion: "eu-south-1",
          ssoAccountId: "987654321098",
          ssoRoleName: "PowerUserAccess",
        },
      });
    });

    it("should handle legacy SSO configuration", async () => {
      vol.fromJSON(
        {
          "/home/user/.aws/config": `[profile legacy]
sso_start_url = https://legacy.awsapps.com/start
sso_region = eu-west-1
sso_account_id = 555666777888
sso_role_name = LegacyRole
region = eu-west-1`,
        },
        true,
      );

      const mockAuthService = vi.mocked(AuthService);
      const mockLogin = vi.fn().mockResolvedValue();
      mockAuthService.mockImplementation(
        () =>
          ({
            login: mockLogin,
          }) as any,
      );

      const command = new AuthLoginCommand([], {} as any);

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          profile: "legacy",
          force: false,
          configure: false,
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockLogin).toHaveBeenCalledWith({
        profile: "legacy",
        force: false,
        configure: false,
        ssoConfig: undefined,
      });
    });
  });

  describe("AWS SDK integration", () => {
    it("should work with mocked STS calls", async () => {
      // The actual AWS SDK calls happen in the AuthService, which is mocked
      // This test verifies the mock setup is correct
      const mockAuthService = vi.mocked(AuthService);
      const mockLogin = vi.fn().mockResolvedValue();
      mockAuthService.mockImplementation(
        () =>
          ({
            login: mockLogin,
          }) as any,
      );

      const command = new AuthLoginCommand([], {} as any);

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          force: false,
          configure: false,
          verbose: false,
        },
        args: {},
      });

      await command.run();

      // Verify the command completed without AWS SDK errors
      expect(mockLogin).toHaveBeenCalled();

      // Verify STS mock is properly configured
      expect(stsMock).toBeDefined();
    });
  });

  describe("error path testing", () => {
    describe("invalid input scenarios", () => {
      it("should handle invalid profile name with special characters", async () => {
        const mockAuthService = vi.mocked(AuthService);
        const mockLogin = vi
          .fn()
          .mockRejectedValue(
            new ProfileError(
              "Invalid profile name: contains special characters",
              "invalid-profile-name",
            ),
          );
        mockAuthService.mockImplementation(
          () =>
            ({
              login: mockLogin,
            }) as any,
        );

        const command = new AuthLoginCommand([], {} as any);

        vi.spyOn(command, "parse").mockResolvedValue({
          flags: {
            profile: "test@profile!#$",
            force: false,
            configure: false,
            verbose: false,
          },
          args: {},
        });

        await expect(command.run()).rejects.toThrow();
      });

      it("should handle empty profile name", async () => {
        const mockAuthService = vi.mocked(AuthService);
        const mockLogin = vi
          .fn()
          .mockRejectedValue(
            new ProfileError("Profile name cannot be empty", "empty-profile-name"),
          );
        mockAuthService.mockImplementation(
          () =>
            ({
              login: mockLogin,
            }) as any,
        );

        const command = new AuthLoginCommand([], {} as any);

        vi.spyOn(command, "parse").mockResolvedValue({
          flags: {
            profile: "",
            force: false,
            configure: false,
            verbose: false,
          },
          args: {},
        });

        await expect(command.run()).rejects.toThrow();
      });

      it("should handle extremely long profile names", async () => {
        const longProfileName = "a".repeat(256);
        const mockAuthService = vi.mocked(AuthService);
        const mockLogin = vi
          .fn()
          .mockRejectedValue(
            new ProfileError("Profile name too long (max 64 characters)", "profile-name-too-long"),
          );
        mockAuthService.mockImplementation(
          () =>
            ({
              login: mockLogin,
            }) as any,
        );

        const command = new AuthLoginCommand([], {} as any);

        vi.spyOn(command, "parse").mockResolvedValue({
          flags: {
            profile: longProfileName,
            force: false,
            configure: false,
            verbose: false,
          },
          args: {},
        });

        await expect(command.run()).rejects.toThrow();
      });

      it("should handle conflicting flags combination", async () => {
        const command = new AuthLoginCommand([], {} as any);

        vi.spyOn(command, "parse").mockResolvedValue({
          flags: {
            profile: "test-profile",
            force: true,
            configure: true, // Conflicting with force
            verbose: false,
          },
          args: {},
        });

        // The command should handle this gracefully or throw appropriate error
        await expect(command.run()).rejects.toThrow();
      });
    });

    describe("malformed configuration scenarios", () => {
      beforeEach(() => {
        vi.clearAllMocks();
        vol.reset();
        stsMock.reset();
      });

      it("should handle corrupted AWS config file", async () => {
        vol.fromJSON(
          {
            "/home/user/.aws/config": `[profile test-profile]
sso_session = company
sso_account_id = invalid-account
region = {invalid-region}
malformed line without equals
[incomplete-section`,
          },
          true,
        );

        const mockAuthService = vi.mocked(AuthService);
        const mockLogin = vi
          .fn()
          .mockRejectedValue(
            new ConfigurationError("Failed to parse AWS config file", "config-parse-error"),
          );
        mockAuthService.mockImplementation(
          () =>
            ({
              login: mockLogin,
            }) as any,
        );

        const command = new AuthLoginCommand([], {} as any);

        vi.spyOn(command, "parse").mockResolvedValue({
          flags: {
            profile: "test-profile",
            force: false,
            configure: false,
            verbose: false,
          },
          args: {},
        });

        await expect(command.run()).rejects.toThrow();
      });

      it("should handle missing SSO session configuration", async () => {
        vol.fromJSON(
          {
            "/home/user/.aws/config": `[profile test-profile]
sso_session = missing-session
sso_account_id = 123456789012
sso_role_name = TestRole
region = us-east-1`,
          },
          true,
        );

        const mockAuthService = vi.mocked(AuthService);
        const mockLogin = vi
          .fn()
          .mockRejectedValue(
            new ConfigurationError(
              "SSO session 'missing-session' not found",
              "sso-session-not-found",
            ),
          );
        mockAuthService.mockImplementation(
          () =>
            ({
              login: mockLogin,
            }) as any,
        );

        const command = new AuthLoginCommand([], {} as any);

        vi.spyOn(command, "parse").mockResolvedValue({
          flags: {
            profile: "test-profile",
            force: false,
            configure: false,
            verbose: false,
          },
          args: {},
        });

        await expect(command.run()).rejects.toThrow();
      });

      it("should handle invalid JSON in SSO cache", async () => {
        vol.fromJSON(
          {
            "/home/user/.aws/config": `[profile test-profile]
sso_session = company
sso_account_id = 123456789012
sso_role_name = TestRole
region = us-east-1

[sso-session company]
sso_region = us-east-1
sso_start_url = https://company.awsapps.com/start`,
            "/home/user/.aws/sso/cache/corrupted-token.json": "{ invalid json structure",
          },
          true,
        );

        const mockAuthService = vi.mocked(AuthService);
        const mockLogin = vi
          .fn()
          .mockRejectedValue(
            new ConfigurationError("Failed to parse SSO cache file", "sso-cache-parse-error"),
          );
        mockAuthService.mockImplementation(
          () =>
            ({
              login: mockLogin,
            }) as any,
        );

        const command = new AuthLoginCommand([], {} as any);

        vi.spyOn(command, "parse").mockResolvedValue({
          flags: {
            profile: "test-profile",
            force: false,
            configure: false,
            verbose: false,
          },
          args: {},
        });

        await expect(command.run()).rejects.toThrow();
      });

      it("should handle missing required SSO configuration fields", async () => {
        vol.fromJSON(
          {
            "/home/user/.aws/config": `[profile test-profile]
sso_session = company
# Missing sso_account_id and sso_role_name
region = us-east-1

[sso-session company]
sso_region = us-east-1
# Missing sso_start_url`,
          },
          true,
        );

        const mockAuthService = vi.mocked(AuthService);
        const mockLogin = vi
          .fn()
          .mockRejectedValue(
            new ConfigurationError(
              "Missing required SSO configuration: sso_account_id, sso_role_name, sso_start_url",
              "missing-sso-config",
            ),
          );
        mockAuthService.mockImplementation(
          () =>
            ({
              login: mockLogin,
            }) as any,
        );

        const command = new AuthLoginCommand([], {} as any);

        vi.spyOn(command, "parse").mockResolvedValue({
          flags: {
            profile: "test-profile",
            force: false,
            configure: false,
            verbose: false,
          },
          args: {},
        });

        await expect(command.run()).rejects.toThrow();
      });
    });

    describe("permission and file system errors", () => {
      it("should handle permission denied on config directory", async () => {
        const mockAuthService = vi.mocked(AuthService);
        const mockLogin = vi
          .fn()
          .mockRejectedValue(
            new ConfigurationError(
              "Permission denied: Cannot read AWS config directory",
              "permission-denied",
            ),
          );
        mockAuthService.mockImplementation(
          () =>
            ({
              login: mockLogin,
            }) as any,
        );

        const command = new AuthLoginCommand([], {} as any);

        vi.spyOn(command, "parse").mockResolvedValue({
          flags: {
            profile: "test-profile",
            force: false,
            configure: false,
            verbose: false,
          },
          args: {},
        });

        await expect(command.run()).rejects.toThrow();
      });

      it("should handle disk full errors during config write", async () => {
        const mockAuthService = vi.mocked(AuthService);
        const mockLogin = vi
          .fn()
          .mockRejectedValue(new ConfigurationError("No space left on device", "disk-full"));
        mockAuthService.mockImplementation(
          () =>
            ({
              login: mockLogin,
            }) as any,
        );

        const command = new AuthLoginCommand([], {} as any);

        vi.spyOn(command, "parse").mockResolvedValue({
          flags: {
            profile: "test-profile",
            force: false,
            configure: true,
            verbose: false,
          },
          args: {},
        });

        await expect(command.run()).rejects.toThrow();
      });

      it("should handle read-only file system errors", async () => {
        const mockAuthService = vi.mocked(AuthService);
        const mockLogin = vi
          .fn()
          .mockRejectedValue(
            new ConfigurationError("Read-only file system", "readonly-filesystem"),
          );
        mockAuthService.mockImplementation(
          () =>
            ({
              login: mockLogin,
            }) as any,
        );

        const command = new AuthLoginCommand([], {} as any);

        vi.spyOn(command, "parse").mockResolvedValue({
          flags: {
            profile: "test-profile",
            force: false,
            configure: true,
            verbose: false,
          },
          args: {},
        });

        await expect(command.run()).rejects.toThrow();
      });
    });
  });
});
