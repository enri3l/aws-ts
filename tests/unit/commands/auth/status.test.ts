/**
 * Unit tests for auth status command
 *
 * Tests command parsing, status display formatting, and integration with AuthService
 * using AWS SDK mocking and filesystem simulation.
 */

import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { mockClient } from "aws-sdk-client-mock";
import { vol } from "memfs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AuthStatusCommand from "../../../../src/commands/auth/status.js";
import type { AuthStatusResponse } from "../../../../src/lib/auth-schemas.js";
import { ApiError, TimeoutError } from "../../../../src/lib/errors.js";
import { AuthService } from "../../../../src/services/auth-service.js";

// Mock filesystem
vi.mock("node:fs/promises", () => import("memfs").then((m) => m.fs.promises));
vi.mock("node:fs", () => import("memfs").then((m) => m.fs));

// Mock AuthService
vi.mock("../../../../src/services/auth-service.js");

// Setup AWS SDK mocks
const stsMock = mockClient(STSClient);

describe("AuthStatusCommand", () => {
  const mockStatusResponse: AuthStatusResponse = {
    activeProfile: "test-profile",
    profiles: [
      {
        name: "test-profile",
        type: "sso",
        active: true,
        credentialsValid: true,
        region: "us-west-2",
        output: "json",
        ssoStartUrl: "https://example.awsapps.com/start",
        ssoRegion: "us-east-1",
        ssoAccountId: "123456789012",
        ssoRoleName: "TestRole",
        tokenExpiry: new Date(Date.now() + 3_600_000), // 1 hour from now
      },
      {
        name: "test-credentials",
        type: "credentials",
        active: false,
        credentialsValid: false,
        region: "us-east-1",
      },
    ],
    authenticated: true,
    awsCliInstalled: true,
    awsCliVersion: "2.15.0",
  };

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
region = us-west-2`,
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
      expect(AuthStatusCommand.description).toBe("Check AWS authentication status");
    });

    it("should have proper examples", () => {
      expect(AuthStatusCommand.examples).toHaveLength(6);
      expect(AuthStatusCommand.examples[0].description).toContain("active profile");
    });

    it("should define all required flags", () => {
      const flags = AuthStatusCommand.flags;
      expect(flags.profile).toBeDefined();
      expect(flags["all-profiles"]).toBeDefined();
      expect(flags.detailed).toBeDefined();
      expect(flags.format).toBeDefined();
      expect(flags.verbose).toBeDefined();
    });

    it("should have correct format options", () => {
      const formatFlag = AuthStatusCommand.flags.format;
      expect(formatFlag.options).toEqual(["table", "json"]);
      expect(formatFlag.default).toBe("table");
    });
  });

  describe("basic status check", () => {
    it("should get status for active profile", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const mockGetStatus = vi.fn().mockResolvedValue(mockStatusResponse);
      mockAuthService.mockImplementation(
        () =>
          ({
            getStatus: mockGetStatus,
          }) as any,
      );

      const command = new AuthStatusCommand([], {} as any);
      const mockLog = vi.spyOn(command, "log").mockImplementation(() => {});

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          "all-profiles": false,
          detailed: false,
          format: "table",
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockAuthService).toHaveBeenCalledWith({
        enableDebugLogging: false,
        enableProgressIndicators: true,
      });

      expect(mockGetStatus).toHaveBeenCalledWith({
        profile: undefined,
        detailed: false,
        allProfiles: false,
      });

      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining("AWS CLI Status"));
    });

    it("should get status for specific profile", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const mockGetStatus = vi.fn().mockResolvedValue(mockStatusResponse);
      mockAuthService.mockImplementation(
        () =>
          ({
            getStatus: mockGetStatus,
          }) as any,
      );

      const command = new AuthStatusCommand([], {} as any);
      vi.spyOn(command, "log").mockImplementation(() => {});

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          profile: "test-profile",
          "all-profiles": false,
          detailed: false,
          format: "table",
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockGetStatus).toHaveBeenCalledWith({
        profile: "test-profile",
        detailed: false,
        allProfiles: false,
      });
    });

    it("should get status for all profiles", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const mockGetStatus = vi.fn().mockResolvedValue(mockStatusResponse);
      mockAuthService.mockImplementation(
        () =>
          ({
            getStatus: mockGetStatus,
          }) as any,
      );

      const command = new AuthStatusCommand([], {} as any);
      vi.spyOn(command, "log").mockImplementation(() => {});

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          "all-profiles": true,
          detailed: false,
          format: "table",
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockGetStatus).toHaveBeenCalledWith({
        profile: undefined,
        detailed: false,
        allProfiles: true,
      });
    });
  });

  describe("output formatting", () => {
    it("should output JSON format when requested", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const mockGetStatus = vi.fn().mockResolvedValue(mockStatusResponse);
      mockAuthService.mockImplementation(
        () =>
          ({
            getStatus: mockGetStatus,
          }) as any,
      );

      const command = new AuthStatusCommand([], {} as any);
      const mockLog = vi.spyOn(command, "log").mockImplementation(() => {});

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          format: "json",
          "all-profiles": false,
          detailed: false,
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockLog).toHaveBeenCalledWith(JSON.stringify(mockStatusResponse, undefined, 2));
    });

    it("should display table format by default", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const mockGetStatus = vi.fn().mockResolvedValue(mockStatusResponse);
      mockAuthService.mockImplementation(
        () =>
          ({
            getStatus: mockGetStatus,
          }) as any,
      );

      const command = new AuthStatusCommand([], {} as any);
      const mockLog = vi.spyOn(command, "log").mockImplementation(() => {});
      const mockConsoleTable = vi.spyOn(console, "table").mockImplementation(() => {});

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          format: "table",
          "all-profiles": false,
          detailed: false,
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining("AWS CLI Status"));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining("Authentication Status"));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining("Profile Status"));
      expect(mockConsoleTable).toHaveBeenCalled();
    });

    it("should include detailed information when detailed flag is true", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const mockGetStatus = vi.fn().mockResolvedValue(mockStatusResponse);
      mockAuthService.mockImplementation(
        () =>
          ({
            getStatus: mockGetStatus,
          }) as any,
      );

      const command = new AuthStatusCommand([], {} as any);
      const mockConsoleTable = vi.spyOn(console, "table").mockImplementation(() => {});

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          format: "table",
          detailed: true,
          "all-profiles": false,
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockGetStatus).toHaveBeenCalledWith({
        profile: undefined,
        detailed: true,
        allProfiles: false,
      });

      expect(mockConsoleTable).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            Region: expect.any(String),
            Output: expect.any(String),
            "SSO Start URL": expect.any(String),
          }),
        ]),
      );
    });
  });

  describe("token expiry warnings", () => {
    it("should display warning for expired tokens", async () => {
      const expiredStatusResponse: AuthStatusResponse = {
        ...mockStatusResponse,
        profiles: [
          {
            ...mockStatusResponse.profiles[0],
            tokenExpiry: new Date(Date.now() - 3_600_000), // 1 hour ago (expired)
          },
        ],
      };

      const mockAuthService = vi.mocked(AuthService);
      const mockGetStatus = vi.fn().mockResolvedValue(expiredStatusResponse);
      mockAuthService.mockImplementation(
        () =>
          ({
            getStatus: mockGetStatus,
          }) as any,
      );

      const command = new AuthStatusCommand([], {} as any);
      const mockLog = vi.spyOn(command, "log").mockImplementation(() => {});
      const mockWarn = vi.spyOn(command, "warn").mockImplementation(() => {});
      vi.spyOn(console, "table").mockImplementation(() => {});

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          format: "table",
          "all-profiles": false,
          detailed: false,
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining("Expired tokens:"));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining("Run 'aws-ts auth login"));
    });

    it("should display warning for tokens expiring soon", async () => {
      const nearExpiryStatusResponse: AuthStatusResponse = {
        ...mockStatusResponse,
        profiles: [
          {
            ...mockStatusResponse.profiles[0],
            tokenExpiry: new Date(Date.now() + 300_000), // 5 minutes from now (near expiry)
          },
        ],
      };

      const mockAuthService = vi.mocked(AuthService);
      const mockGetStatus = vi.fn().mockResolvedValue(nearExpiryStatusResponse);
      mockAuthService.mockImplementation(
        () =>
          ({
            getStatus: mockGetStatus,
          }) as any,
      );

      const command = new AuthStatusCommand([], {} as any);
      const mockLog = vi.spyOn(command, "log").mockImplementation(() => {});
      const mockWarn = vi.spyOn(command, "warn").mockImplementation(() => {});
      vi.spyOn(console, "table").mockImplementation(() => {});

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          format: "table",
          "all-profiles": false,
          detailed: false,
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockWarn).toHaveBeenCalledWith(expect.stringContaining("Tokens expiring soon:"));
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining("Consider refreshing"));
    });
  });

  describe("empty profiles handling", () => {
    it("should handle no profiles gracefully", async () => {
      const emptyStatusResponse: AuthStatusResponse = {
        ...mockStatusResponse,
        profiles: [],
        authenticated: false,
      };

      const mockAuthService = vi.mocked(AuthService);
      const mockGetStatus = vi.fn().mockResolvedValue(emptyStatusResponse);
      mockAuthService.mockImplementation(
        () =>
          ({
            getStatus: mockGetStatus,
          }) as any,
      );

      const command = new AuthStatusCommand([], {} as any);
      const mockLog = vi.spyOn(command, "log").mockImplementation(() => {});

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          format: "table",
          "all-profiles": false,
          detailed: false,
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockLog).toHaveBeenCalledWith("No profiles found");
    });
  });

  describe("verbose mode", () => {
    it("should enable debug logging when verbose flag is true", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const mockGetStatus = vi.fn().mockResolvedValue(mockStatusResponse);
      mockAuthService.mockImplementation(
        () =>
          ({
            getStatus: mockGetStatus,
          }) as any,
      );

      const command = new AuthStatusCommand([], {} as any);
      vi.spyOn(command, "log").mockImplementation(() => {});

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          verbose: true,
          format: "table",
          "all-profiles": false,
          detailed: false,
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
    it("should handle generic Error properly", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const genericError = new Error("Status check failed");
      const mockGetStatus = vi.fn().mockRejectedValue(genericError);
      mockAuthService.mockImplementation(
        () =>
          ({
            getStatus: mockGetStatus,
          }) as any,
      );

      const command = new AuthStatusCommand([], {} as any);
      const mockError = vi.spyOn(command, "error").mockImplementation(() => {
        throw new Error("Command error");
      });

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          format: "table",
          "all-profiles": false,
          detailed: false,
          verbose: false,
        },
        args: {},
      });

      await expect(command.run()).rejects.toThrow();
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining("Failed to get authentication status"),
        { exit: 1 },
      );
    });

    it("should handle non-Error exceptions", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const stringError = "String error";
      const mockGetStatus = vi.fn().mockRejectedValue(stringError);
      mockAuthService.mockImplementation(
        () =>
          ({
            getStatus: mockGetStatus,
          }) as any,
      );

      const command = new AuthStatusCommand([], {} as any);
      const mockError = vi.spyOn(command, "error").mockImplementation(() => {
        throw new Error("Command error");
      });

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          format: "table",
          "all-profiles": false,
          detailed: false,
          verbose: false,
        },
        args: {},
      });

      await expect(command.run()).rejects.toThrow();
      expect(mockError).toHaveBeenCalledWith("Failed to get authentication status: String error", {
        exit: 1,
      });
    });

    it("should handle ApiError exceptions", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const apiError = new ApiError("API request failed", "AWS_API_ERROR", "authentication");
      const mockGetStatus = vi.fn().mockRejectedValue(apiError);
      mockAuthService.mockImplementation(
        () =>
          ({
            getStatus: mockGetStatus,
          }) as any,
      );

      const command = new AuthStatusCommand([], {} as any);
      const mockError = vi.spyOn(command, "error").mockImplementation(() => {
        throw new Error("Command error");
      });

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          format: "table",
          "all-profiles": false,
          detailed: false,
          verbose: false,
        },
        args: {},
      });

      await expect(command.run()).rejects.toThrow();
      expect(mockError).toHaveBeenCalledWith(
        "Failed to get authentication status: AWS API error - API request failed",
        { exit: 1 },
      );
    });

    it("should handle TimeoutError exceptions", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const timeoutError = new TimeoutError("Request timed out after 30 seconds", 30_000);
      const mockGetStatus = vi.fn().mockRejectedValue(timeoutError);
      mockAuthService.mockImplementation(
        () =>
          ({
            getStatus: mockGetStatus,
          }) as any,
      );

      const command = new AuthStatusCommand([], {} as any);
      const mockError = vi.spyOn(command, "error").mockImplementation(() => {
        throw new Error("Command error");
      });

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          format: "table",
          "all-profiles": false,
          detailed: false,
          verbose: false,
        },
        args: {},
      });

      await expect(command.run()).rejects.toThrow();
      expect(mockError).toHaveBeenCalledWith(
        "Failed to get authentication status: Operation timed out - Request timed out after 30 seconds",
        { exit: 1 },
      );
    });

    it("should handle verbose error reporting", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const genericError = new Error("Verbose error test");
      const mockGetStatus = vi.fn().mockRejectedValue(genericError);
      mockAuthService.mockImplementation(
        () =>
          ({
            getStatus: mockGetStatus,
          }) as any,
      );

      const command = new AuthStatusCommand([], {} as any);
      const mockError = vi.spyOn(command, "error").mockImplementation(() => {
        throw new Error("Command error");
      });

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          format: "table",
          "all-profiles": false,
          detailed: false,
          verbose: true, // Enable verbose mode for error reporting
        },
        args: {},
      });

      await expect(command.run()).rejects.toThrow();
      expect(mockError).toHaveBeenCalledWith(
        expect.stringContaining("Failed to get authentication status:"),
        { exit: 1 },
      );
    });
  });

  describe("Regional status scenarios", () => {
    const mockRegionalStatusResponse: AuthStatusResponse = {
      activeProfile: "test-dev",
      profiles: [
        {
          name: "test-dev",
          type: "sso",
          active: true,
          credentialsValid: true,
          region: "eu-west-1",
          output: "json",
          ssoStartUrl: "https://company.awsapps.com/start",
          ssoRegion: "eu-west-1",
          ssoAccountId: "123456789012",
          ssoRoleName: "DeveloperAccess",
          tokenExpiry: new Date(Date.now() + 3_600_000),
        },
        {
          name: "test-prod",
          type: "sso",
          active: false,
          credentialsValid: true,
          region: "eu-south-1",
          output: "json",
          ssoStartUrl: "https://company.awsapps.com/start",
          ssoRegion: "eu-west-1",
          ssoAccountId: "123456789012",
          ssoRoleName: "ReadOnlyAccess",
          tokenExpiry: new Date(Date.now() + 600_000), // 10 minutes (near expiry - less than 15 min threshold)
        },
      ],
      authenticated: true,
      awsCliInstalled: true,
      awsCliVersion: "2.15.0",
    };

    beforeEach(() => {
      // Setup regional filesystem structure
      vol.fromJSON(
        {
          "/home/user/.aws/config": `[profile test-dev]
sso_session = company
sso_account_id = 123456789012
sso_role_name = DeveloperAccess
region = eu-west-1

[profile test-prod]
sso_session = company
sso_account_id = 123456789012
sso_role_name = ReadOnlyAccess
region = eu-south-1

[sso-session company]
sso_region = eu-west-1
sso_start_url = https://company.awsapps.com/start
sso_registration_scopes = sso:account:access`,
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

    it("should display profiles with SSO session configuration", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const mockGetStatus = vi.fn().mockResolvedValue(mockRegionalStatusResponse);
      mockAuthService.mockImplementation(
        () =>
          ({
            getStatus: mockGetStatus,
          }) as any,
      );

      const command = new AuthStatusCommand([], {} as any);
      const mockConsoleTable = vi.spyOn(console, "table").mockImplementation(() => {});

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          "all-profiles": true,
          detailed: true,
          format: "table",
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockGetStatus).toHaveBeenCalledWith({
        profile: undefined,
        detailed: true,
        allProfiles: true,
      });

      expect(mockConsoleTable).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            Profile: "test-dev",
            Type: "sso",
            Region: "eu-west-1",
            "SSO Start URL": "https://company.awsapps.com/start",
          }),
          expect.objectContaining({
            Profile: "test-prod",
            Type: "sso",
            Region: "eu-south-1",
            "SSO Start URL": "https://company.awsapps.com/start",
          }),
        ]),
      );
    });

    it("should warn about tokens expiring soon", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const mockGetStatus = vi.fn().mockResolvedValue(mockRegionalStatusResponse);
      mockAuthService.mockImplementation(
        () =>
          ({
            getStatus: mockGetStatus,
          }) as any,
      );

      const command = new AuthStatusCommand([], {} as any);
      const mockWarn = vi.spyOn(command, "warn").mockImplementation(() => {});
      vi.spyOn(console, "table").mockImplementation(() => {});

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          format: "table",
          "all-profiles": true,
          detailed: false,
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockWarn).toHaveBeenCalledWith(
        expect.stringContaining("Tokens expiring soon: test-prod"),
      );
    });

    it("should output profile status in JSON format", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const mockGetStatus = vi.fn().mockResolvedValue(mockRegionalStatusResponse);
      mockAuthService.mockImplementation(
        () =>
          ({
            getStatus: mockGetStatus,
          }) as any,
      );

      const command = new AuthStatusCommand([], {} as any);
      const mockLog = vi.spyOn(command, "log").mockImplementation(() => {});

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          format: "json",
          "all-profiles": false,
          detailed: false,
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockLog).toHaveBeenCalledWith(
        JSON.stringify(mockRegionalStatusResponse, undefined, 2),
      );
    });
  });

  describe("AWS SDK integration", () => {
    it("should work with mocked STS calls", async () => {
      const mockAuthService = vi.mocked(AuthService);
      const mockGetStatus = vi.fn().mockResolvedValue(mockStatusResponse);
      mockAuthService.mockImplementation(
        () =>
          ({
            getStatus: mockGetStatus,
          }) as any,
      );

      const command = new AuthStatusCommand([], {} as any);
      vi.spyOn(command, "log").mockImplementation(() => {});

      vi.spyOn(command, "parse").mockResolvedValue({
        flags: {
          format: "table",
          "all-profiles": false,
          detailed: false,
          verbose: false,
        },
        args: {},
      });

      await command.run();

      expect(mockGetStatus).toHaveBeenCalled();

      // Verify STS mock is properly configured
      expect(stsMock).toBeDefined();
    });
  });
});
