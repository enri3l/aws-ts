/**
 * Unit tests for AuthCliWrapper service
 *
 * Tests AWS CLI subprocess integration with mocked child_process calls
 * for cross-platform compatibility and error handling scenarios.
 */

import type { ChildProcess } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthenticationError, AwsCliError } from "../../../src/lib/auth-errors.js";
import { AuthCliWrapper } from "../../../src/services/auth-cli-wrapper.js";

// Mock interfaces for proper typing
interface MockStream {
  on: ReturnType<typeof vi.fn>;
  pipe: ReturnType<typeof vi.fn>;
}

interface MockWritableStream {
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
}

// Mock child_process module
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Mock ora spinner
vi.mock("ora", () => ({
  default: vi.fn(() => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    text: "",
  })),
}));

const mockSpawn = vi.mocked(await import("node:child_process")).spawn;

describe("AuthCliWrapper", () => {
  let authCliWrapper: AuthCliWrapper;
  let mockChildProcess: Partial<ChildProcess>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock child process
    mockChildProcess = {
      stdout: {
        on: vi.fn(),
        pipe: vi.fn(),
      } as MockStream,
      stderr: {
        on: vi.fn(),
        pipe: vi.fn(),
      } as MockStream,
      stdin: {
        write: vi.fn(),
        end: vi.fn(),
      } as MockWritableStream,
      on: vi.fn(),
      kill: vi.fn(),
    };

    mockSpawn.mockReturnValue(mockChildProcess as ChildProcess);

    authCliWrapper = new AuthCliWrapper({
      awsCliPath: "aws",
      enableDebugLogging: false,
      timeoutMs: 30_000,
    });
  });

  describe("checkInstallation", () => {
    it("should detect AWS CLI installation successfully", async () => {
      // Setup successful version response
      const versionOutput =
        "aws-cli/2.15.30 Python/3.11.5 Linux/6.5.0-35-generic exe/x86_64.ubuntu.22";

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from(versionOutput)), 5);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      const result = await authCliWrapper.checkInstallation();

      expect(result).toEqual({
        version: "2.15.30",
        installed: true,
      });

      expect(mockSpawn).toHaveBeenCalledWith("aws", ["--version"], expect.any(Object));
    });

    it("should handle AWS CLI not found error", async () => {
      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "error") {
          setTimeout(() => callback(new Error("ENOENT")), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      await expect(authCliWrapper.checkInstallation()).rejects.toThrow(AwsCliError);
    });

    it("should handle AWS CLI command failure", async () => {
      const errorOutput = "aws: command not found";

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(1), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn();

      mockChildProcess.stderr!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from(errorOutput)), 5);
        }
        return mockChildProcess.stderr;
      });

      await expect(authCliWrapper.checkInstallation()).rejects.toThrow(AwsCliError);
    });
  });

  describe("configureSso", () => {
    it("should configure SSO interactively", async () => {
      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 50);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          // Simulate interactive prompts
          setTimeout(() => callback(Buffer.from("SSO session name (Recommended): ")), 10);
          setTimeout(() => callback(Buffer.from("SSO start URL [None]: ")), 20);
          setTimeout(() => callback(Buffer.from("SSO region [None]: ")), 30);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      await expect(authCliWrapper.configureSso("test-profile")).resolves.toBeUndefined();

      expect(mockSpawn).toHaveBeenCalledWith(
        "aws",
        ["configure", "sso", "--profile", "test-profile"],
        expect.any(Object),
      );
    });

    it("should configure SSO with provided configuration", async () => {
      const ssoConfig = {
        ssoStartUrl: "https://example.awsapps.com/start",
        ssoRegion: "us-east-1",
        ssoAccountId: "123_456_789_012",
        ssoRoleName: "PowerUserAccess",
        region: "us-west-2",
        output: "json",
      };

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 50);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          // Simulate prompts and auto-responses
          setTimeout(() => callback(Buffer.from("SSO session name (Recommended): ")), 10);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      await expect(authCliWrapper.configureSso("test-profile", ssoConfig)).resolves.toBeUndefined();

      expect(mockChildProcess.stdin!.write).toHaveBeenCalledWith(
        "https://example.awsapps.com/start\n",
      );
      expect(mockChildProcess.stdin!.write).toHaveBeenCalledWith("us-east-1\n");
      expect(mockChildProcess.stdin!.write).toHaveBeenCalledWith("123_456_789_012\n");
      expect(mockChildProcess.stdin!.write).toHaveBeenCalledWith("PowerUserAccess\n");
    });

    it("should handle SSO configuration failure", async () => {
      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(1), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn();

      mockChildProcess.stderr!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("Invalid SSO start URL")), 5);
        }
        return mockChildProcess.stderr;
      });

      await expect(authCliWrapper.configureSso("test-profile")).rejects.toThrow(
        AuthenticationError,
      );
    });
  });

  describe("ssoLogin", () => {
    it("should perform SSO login successfully", async () => {
      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(
            () =>
              callback(
                Buffer.from(
                  "Attempting to automatically open the SSO authorization page in your default browser.",
                ),
              ),
            5,
          );
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      await expect(authCliWrapper.ssoLogin("test-profile")).resolves.toBeUndefined();

      expect(mockSpawn).toHaveBeenCalledWith(
        "aws",
        ["sso", "login", "--profile", "test-profile"],
        expect.any(Object),
      );
    });

    it("should handle SSO login failure", async () => {
      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(1), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn();

      mockChildProcess.stderr!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(
            () => callback(Buffer.from("The SSO session associated with this profile has expired")),
            5,
          );
        }
        return mockChildProcess.stderr;
      });

      await expect(authCliWrapper.ssoLogin("test-profile")).rejects.toThrow(AuthenticationError);
    });
  });

  describe("ssoLogout", () => {
    it("should perform SSO logout successfully", async () => {
      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("Successfully signed out.")), 5);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      await expect(authCliWrapper.ssoLogout("test-profile")).resolves.toBeUndefined();

      expect(mockSpawn).toHaveBeenCalledWith(
        "aws",
        ["sso", "logout", "--profile", "test-profile"],
        expect.any(Object),
      );
    });

    it("should handle non-AuthenticationError exceptions in ssoLogout", async () => {
      // Mock executeCommand to throw a generic Error instead of AuthenticationError
      const executeCommandSpy = vi.spyOn(authCliWrapper as any, "executeCommand");
      executeCommandSpy.mockRejectedValue(new TypeError("Unexpected type error"));

      await expect(authCliWrapper.ssoLogout("test-profile")).rejects.toThrow(AuthenticationError);

      try {
        await authCliWrapper.ssoLogout("test-profile");
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError);
        expect((error as AuthenticationError).message).toBe(
          "Failed to logout from SSO for profile 'test-profile'",
        );
        expect((error as AuthenticationError).metadata.operation).toBe("sso-logout");
        expect((error as AuthenticationError).metadata.profile).toBe("test-profile");
      }

      executeCommandSpy.mockRestore();
    });
  });

  describe("validateCredentials", () => {
    it("should validate credentials successfully", async () => {
      const callerIdentityResponse = JSON.stringify({
        UserId: "AIDACKCEVSQ6C2EXAMPLE",
        Account: "123_456_789_012",
        Arn: "arn:aws:iam::123_456_789_012:user/test-user",
      });

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from(callerIdentityResponse)), 5);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      const result = await authCliWrapper.validateCredentials("test-profile");

      expect(result).toEqual({
        userId: "AIDACKCEVSQ6C2EXAMPLE",
        account: "123_456_789_012",
        arn: "arn:aws:iam::123_456_789_012:user/test-user",
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        "aws",
        ["sts", "get-caller-identity", "--output", "json", "--profile", "test-profile"],
        expect.any(Object),
      );
    });

    it("should handle invalid credentials", async () => {
      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(255), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn();

      mockChildProcess.stderr!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("Unable to locate credentials")), 5);
        }
        return mockChildProcess.stderr;
      });

      await expect(authCliWrapper.validateCredentials("test-profile")).rejects.toThrow(
        AuthenticationError,
      );
    });

    it("should handle non-AuthenticationError exceptions in validateCredentials", async () => {
      // Mock executeCommand to throw a generic ReferenceError instead of AuthenticationError
      const executeCommandSpy = vi.spyOn(authCliWrapper as any, "executeCommand");
      executeCommandSpy.mockRejectedValue(new ReferenceError("Reference is not defined"));

      await expect(authCliWrapper.validateCredentials("test-profile")).rejects.toThrow(
        AuthenticationError,
      );

      try {
        await authCliWrapper.validateCredentials("test-profile");
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError);
        expect((error as AuthenticationError).message).toBe(
          "Failed to validate credentials for profile 'test-profile'",
        );
        expect((error as AuthenticationError).metadata.operation).toBe("credential-validation");
        expect((error as AuthenticationError).metadata.profile).toBe("test-profile");
      }

      executeCommandSpy.mockRestore();
    });
  });

  describe("timeout handling", () => {
    it("should handle command timeout", async () => {
      const shortTimeoutWrapper = new AuthCliWrapper({
        awsCliPath: "aws",
        enableDebugLogging: false,
        timeoutMs: 100, // Very short timeout
      });

      // Mock a process that never completes
      mockChildProcess.on = vi.fn();
      mockChildProcess.stdout!.on = vi.fn();
      mockChildProcess.stderr!.on = vi.fn();

      await expect(shortTimeoutWrapper.checkInstallation()).rejects.toThrow();
    });

    it("should handle interactive command timeout with SIGTERM kill", async () => {
      const shortTimeoutWrapper = new AuthCliWrapper({
        awsCliPath: "aws",
        enableDebugLogging: false,
        timeoutMs: 50, // Very short timeout
      });

      let timeoutCallback: (() => void) | undefined;

      // Mock setTimeout to capture the timeout callback
      const originalSetTimeout = globalThis.setTimeout;
      vi.stubGlobal(
        "setTimeout",
        vi.fn((callback, delay) => {
          if (delay === 50) {
            timeoutCallback = callback;
            return 123 as any; // Mock timer ID
          }
          return originalSetTimeout(callback, delay);
        }),
      );

      // Mock a process that accumulates stdout/stderr before timeout
      mockChildProcess.on = vi.fn();
      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("partial output")), 10);
        }
        return mockChildProcess.stdout;
      });
      mockChildProcess.stderr!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("partial error")), 10);
        }
        return mockChildProcess.stderr;
      });

      // Start the configuration command that will timeout
      const configPromise = shortTimeoutWrapper.configureSso("test-profile");

      // Wait for stdout/stderr to accumulate, then trigger timeout
      await new Promise((resolve) => setTimeout(resolve, 20));

      // Trigger the timeout callback
      if (timeoutCallback) {
        timeoutCallback();
      }

      // Verify timeout error is wrapped in AuthenticationError
      await expect(configPromise).rejects.toThrow(AuthenticationError);

      try {
        await configPromise;
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError);
        expect((error as AuthenticationError).message).toBe(
          "Failed to configure SSO for profile 'test-profile'",
        );

        // Verify the underlying AwsCliError is preserved as the cause
        const cause = (error as AuthenticationError).metadata.cause;
        expect(cause).toBeInstanceOf(AwsCliError);
        expect((cause as AwsCliError).message).toBe(
          "Interactive AWS CLI command timed out after 50ms",
        );
        expect((cause as AwsCliError).metadata.command).toBe(
          "aws configure sso --profile test-profile",
        );
        expect((cause as AwsCliError).metadata.exitCode).toBe(-1);
        expect((cause as AwsCliError).metadata.stdout).toBe("partial output");
        expect((cause as AwsCliError).metadata.stderr).toBe("partial error");
      }

      // Verify child process was killed with SIGTERM
      expect(mockChildProcess.kill).toHaveBeenCalledWith("SIGTERM");

      // Restore setTimeout
      vi.unstubAllGlobals();
    });

    it("should not set timeout when timeoutMs is 0", async () => {
      const noTimeoutWrapper = new AuthCliWrapper({
        awsCliPath: "aws",
        enableDebugLogging: false,
        timeoutMs: 0, // No timeout
      });

      const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn();
      mockChildProcess.stderr!.on = vi.fn();

      await noTimeoutWrapper.configureSso("test-profile");

      // Verify setTimeout was not called for timeout (only for test delays)
      const timeoutCalls = setTimeoutSpy.mock.calls.filter((call) => call[1] === 0);
      expect(timeoutCalls).toHaveLength(0);

      setTimeoutSpy.mockRestore();
    });

    it("should clear timeout on successful command completion", async () => {
      const shortTimeoutWrapper = new AuthCliWrapper({
        awsCliPath: "aws",
        enableDebugLogging: false,
        timeoutMs: 1000, // Long enough to complete
      });

      const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn();
      mockChildProcess.stderr!.on = vi.fn();

      await shortTimeoutWrapper.configureSso("test-profile");

      // Verify clearTimeout was called to cleanup the timeout
      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });
  });

  describe("error scenarios", () => {
    it("should handle process spawn errors", async () => {
      mockSpawn.mockImplementation(() => {
        throw new Error("ENOENT: no such file or directory");
      });

      await expect(authCliWrapper.checkInstallation()).rejects.toThrow(AwsCliError);
    });

    it("should handle malformed JSON responses with detailed error wrapping", async () => {
      const malformedJson = "{ invalid json }";

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from(malformedJson)), 5);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      await expect(authCliWrapper.validateCredentials("test-profile")).rejects.toThrow(
        AuthenticationError,
      );

      try {
        await authCliWrapper.validateCredentials("test-profile");
      } catch (error) {
        expect(error).toBeInstanceOf(AuthenticationError);
        expect((error as AuthenticationError).message).toBe(
          "Failed to parse credential validation response for profile 'test-profile'",
        );
        expect((error as AuthenticationError).metadata.operation).toBe("credential-validation");
        expect((error as AuthenticationError).metadata.profile).toBe("test-profile");

        // Verify the original parse error is preserved as cause
        const cause = (error as AuthenticationError).metadata.cause;
        expect(cause).toBeInstanceOf(SyntaxError);
      }
    });

    it("should handle empty JSON response", async () => {
      const emptyResponse = "";

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from(emptyResponse)), 5);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      await expect(authCliWrapper.validateCredentials("test-profile")).rejects.toThrow(
        AuthenticationError,
      );
    });

    it("should handle non-JSON text response", async () => {
      const textResponse = "Error: Credentials not found";

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from(textResponse)), 5);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      await expect(authCliWrapper.validateCredentials("test-profile")).rejects.toThrow(
        AuthenticationError,
      );
    });

    it("should handle partial JSON response", async () => {
      const partialJson = '{"UserId": "AIDACKCEVSQ6C2EXAMPLE", "Account":';

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from(partialJson)), 5);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      await expect(authCliWrapper.validateCredentials("test-profile")).rejects.toThrow(
        AuthenticationError,
      );
    });

    it("should handle JSON with missing required fields", async () => {
      const incompleteJson = JSON.stringify({
        UserId: "AIDACKCEVSQ6C2EXAMPLE",
        // Missing Account and Arn fields
      });

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from(incompleteJson)), 5);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      const result = await authCliWrapper.validateCredentials("test-profile");

      // Should still parse successfully but with undefined fields
      expect(result.userId).toBe("AIDACKCEVSQ6C2EXAMPLE");
      expect(result.account).toBeUndefined();
      expect(result.arn).toBeUndefined();
    });

    it("should handle child process error events in interactive commands", async () => {
      const processError = new Error("Process execution failed");

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "error") {
          setTimeout(() => callback(processError), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn();
      mockChildProcess.stderr!.on = vi.fn();

      await expect(authCliWrapper.configureSso("test-profile")).rejects.toThrow(
        AuthenticationError,
      );
    });
  });

  describe("platform compatibility", () => {
    it("should use correct AWS CLI executable path for Windows", async () => {
      const originalPlatform = process.platform;

      // Mock platform to be Windows
      Object.defineProperty(process, "platform", {
        value: "win32",
        configurable: true,
      });

      const windowsWrapper = new AuthCliWrapper({
        enableDebugLogging: false,
        timeoutMs: 30_000,
      });

      // Restore original platform
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });

      // Verify Windows-specific path handling by checking spawn call
      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("aws-cli/2.15.30")), 5);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      await windowsWrapper.checkInstallation();

      expect(mockSpawn).toHaveBeenCalledWith("aws.exe", ["--version"], expect.any(Object));
    });

    it("should use correct AWS CLI executable path for Unix-like systems", async () => {
      const originalPlatform = process.platform;

      // Mock platform to be Linux
      Object.defineProperty(process, "platform", {
        value: "linux",
        configurable: true,
      });

      const unixWrapper = new AuthCliWrapper({
        enableDebugLogging: false,
        timeoutMs: 30_000,
      });

      // Restore original platform
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });

      // Verify Unix-specific path handling by checking spawn call
      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("aws-cli/2.15.30")), 5);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      await unixWrapper.checkInstallation();

      expect(mockSpawn).toHaveBeenCalledWith("aws", ["--version"], expect.any(Object));
    });
  });

  describe("debug logging coverage", () => {
    it("should log debug messages when debug logging is enabled", async () => {
      const debugWrapper = new AuthCliWrapper({
        enableDebugLogging: true,
        timeoutMs: 30_000,
      });

      const consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("aws-cli/2.15.30")), 5);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      await debugWrapper.checkInstallation();

      expect(consoleSpy).toHaveBeenCalledWith("Executing AWS CLI command: aws --version");
      expect(consoleSpy).toHaveBeenCalledWith("AWS CLI command completed with exit code: 0");

      consoleSpy.mockRestore();
    });

    it("should log debug messages for interactive commands with debug enabled", async () => {
      const debugWrapper = new AuthCliWrapper({
        enableDebugLogging: true,
        timeoutMs: 30_000,
      });

      const consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("SSO login successful")), 5);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      await debugWrapper.ssoLogin("test-profile");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Executing interactive AWS CLI command: aws sso login --profile test-profile",
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "Interactive AWS CLI command completed with exit code: 0",
      );

      consoleSpy.mockRestore();
    });

    it("should handle process spawn error with debug logging", async () => {
      const debugWrapper = new AuthCliWrapper({
        enableDebugLogging: true,
        timeoutMs: 30_000,
      });

      const consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const processError = new Error("spawn ENOENT");

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "error") {
          setTimeout(() => callback(processError), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn();
      mockChildProcess.stderr!.on = vi.fn();

      await expect(debugWrapper.checkInstallation()).rejects.toThrow(AwsCliError);

      expect(consoleSpy).toHaveBeenCalledWith("Executing AWS CLI command: aws --version");

      consoleSpy.mockRestore();
    });
  });

  describe("constructor edge cases", () => {
    it("should use default options when no options provided", async () => {
      const defaultWrapper = new AuthCliWrapper();

      // Verify it works with defaults by calling checkInstallation
      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("aws-cli/2.15.30")), 5);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      const result = await defaultWrapper.checkInstallation();

      expect(result).toEqual({
        version: "2.15.30",
        installed: true,
      });

      // Should use default "aws" command (not "aws.exe" since not Windows)
      expect(mockSpawn).toHaveBeenCalledWith("aws", ["--version"], expect.any(Object));
    });

    it("should use default options with empty object", async () => {
      const emptyOptionsWrapper = new AuthCliWrapper({});

      // Verify it works with empty options by calling checkInstallation
      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("aws-cli/2.15.30")), 5);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      const result = await emptyOptionsWrapper.checkInstallation();

      expect(result).toEqual({
        version: "2.15.30",
        installed: true,
      });

      expect(mockSpawn).toHaveBeenCalledWith("aws", ["--version"], expect.any(Object));
    });
  });

  describe("platform-specific behavior", () => {
    let originalPlatform: string;

    beforeEach(() => {
      originalPlatform = process.platform;
    });

    afterEach(() => {
      Object.defineProperty(process, "platform", { value: originalPlatform });
    });

    it("should use aws.exe on Windows platform", async () => {
      Object.defineProperty(process, "platform", { value: "win32" });

      const windowsWrapper = new AuthCliWrapper();

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("aws-cli/2.15.30")), 5);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      await windowsWrapper.checkInstallation();

      expect(mockSpawn).toHaveBeenCalledWith(
        "aws.exe",
        ["--version"],
        expect.objectContaining({
          shell: true,
        }),
      );
    });

    it("should use aws on non-Windows platforms", async () => {
      Object.defineProperty(process, "platform", { value: "linux" });

      const linuxWrapper = new AuthCliWrapper();

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("aws-cli/2.15.30")), 5);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      await linuxWrapper.checkInstallation();

      expect(mockSpawn).toHaveBeenCalledWith(
        "aws",
        ["--version"],
        expect.objectContaining({
          shell: false,
        }),
      );
    });
  });

  describe("timeout and signal handling", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should handle SIGTERM timeout in executeCommand", async () => {
      const timeoutWrapper = new AuthCliWrapper({ timeoutMs: 1000 });

      let killCallback: ((signal: string) => void) | undefined;
      const mockKill = vi.fn((signal: string) => {
        if (killCallback) killCallback(signal);
      });

      mockChildProcess.kill = mockKill;
      mockChildProcess.on = vi.fn((event) => {
        // Don't trigger close event to simulate hanging process
        if (event === "close") {
          // Store for potential later use but don't call immediately
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn();
      mockChildProcess.stderr!.on = vi.fn();

      const commandPromise = timeoutWrapper.checkInstallation();

      // Advance timers to trigger timeout
      vi.advanceTimersByTime(1000);

      await expect(commandPromise).rejects.toThrow("AWS CLI command timed out after 1000ms");
      expect(mockKill).toHaveBeenCalledWith("SIGTERM");
    });

    it("should handle SIGTERM timeout in executeInteractiveCommand", async () => {
      const timeoutWrapper = new AuthCliWrapper({ timeoutMs: 1000 });

      let killCallback: ((signal: string) => void) | undefined;
      const mockKill = vi.fn((signal: string) => {
        if (killCallback) killCallback(signal);
      });

      mockChildProcess.kill = mockKill;
      mockChildProcess.on = vi.fn(() => {
        // Don't trigger close event to simulate hanging process
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn();
      mockChildProcess.stderr!.on = vi.fn();

      const ssoPromise = timeoutWrapper.ssoLogin("test-profile");

      // Advance timers to trigger timeout
      vi.advanceTimersByTime(1000);

      await expect(ssoPromise).rejects.toThrow(AuthenticationError);
      await expect(ssoPromise).rejects.toThrow(
        "Failed to login with SSO for profile 'test-profile'",
      );
      expect(mockKill).toHaveBeenCalledWith("SIGTERM");
    });
  });

  describe("interactive command edge cases", () => {
    it("should handle stdin.end() errors gracefully", async () => {
      const wrapper = new AuthCliWrapper();

      const mockWrite = vi.fn().mockReturnValue(true);
      const mockEnd = vi.fn(() => {
        throw new Error("stdin.end() failed");
      });

      const mockStdin: MockWritableStream = {
        write: mockWrite,
        end: mockEnd,
      };

      mockChildProcess.stdin = mockStdin as any;

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("SSO setup successful")), 5);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      const ssoConfig = {
        ssoStartUrl: "https://test.awsapps.com/start",
        ssoRegion: "us-east-1",
        ssoAccountId: "123456789012",
        ssoRoleName: "TestRole",
      };

      // Should throw AuthenticationError due to stdin.end() error
      await expect(wrapper.configureSso("test-profile", ssoConfig)).rejects.toThrow(
        AuthenticationError,
      );

      expect(mockWrite).toHaveBeenCalledTimes(4);
      expect(mockEnd).toHaveBeenCalled();
    });

    it("should handle missing stdin in interactive command", async () => {
      const wrapper = new AuthCliWrapper();

      mockChildProcess.stdin = undefined;

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("SSO setup successful")), 5);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      const ssoConfig = {
        ssoStartUrl: "https://test.awsapps.com/start",
        ssoRegion: "us-east-1",
        ssoAccountId: "123456789012",
        ssoRoleName: "TestRole",
      };

      // Should handle missing stdin gracefully
      await expect(wrapper.configureSso("test-profile", ssoConfig)).resolves.toBeUndefined();
    });
  });

  describe("debug logging coverage", () => {
    it("should log interactive command execution with debug enabled", async () => {
      const debugWrapper = new AuthCliWrapper({
        enableDebugLogging: true,
        timeoutMs: 30_000,
      });

      const consoleSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(0), 10);
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn((event, callback) => {
        if (event === "data") {
          setTimeout(() => callback(Buffer.from("Login successful")), 5);
        }
        return mockChildProcess.stdout;
      });

      mockChildProcess.stderr!.on = vi.fn();

      await debugWrapper.ssoLogin("test-profile");

      expect(consoleSpy).toHaveBeenCalledWith(
        "Executing interactive AWS CLI command: aws sso login --profile test-profile",
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        "Interactive AWS CLI command completed with exit code: 0",
      );

      consoleSpy.mockRestore();
    });

    it("should handle null exit code in interactive command", async () => {
      const wrapper = new AuthCliWrapper();

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(null), 10); // null exit code
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn();
      mockChildProcess.stderr!.on = vi.fn();

      // null exit code becomes -1 which indicates failure
      await expect(wrapper.ssoLogin("test-profile")).rejects.toThrow(AuthenticationError);
    });

    it("should handle null exit code in regular command", async () => {
      const wrapper = new AuthCliWrapper();

      mockChildProcess.on = vi.fn((event, callback) => {
        if (event === "close") {
          setTimeout(() => callback(null), 10); // null exit code
        }
        return mockChildProcess as ChildProcess;
      });

      mockChildProcess.stdout!.on = vi.fn();
      mockChildProcess.stderr!.on = vi.fn();

      // null exit code should still be handled and converted to -1
      await expect(wrapper.checkInstallation()).rejects.toThrow(AwsCliError);
    });
  });
});
