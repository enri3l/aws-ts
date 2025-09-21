/**
 * Unit tests for AuthCliWrapper service
 *
 * Tests AWS CLI subprocess integration with mocked child_process calls
 * for cross-platform compatibility and error handling scenarios.
 */

import type { ChildProcess } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
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
  });

  describe("error scenarios", () => {
    it("should handle process spawn errors", async () => {
      mockSpawn.mockImplementation(() => {
        throw new Error("ENOENT: no such file or directory");
      });

      await expect(authCliWrapper.checkInstallation()).rejects.toThrow(AwsCliError);
    });

    it("should handle malformed JSON responses", async () => {
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
    });
  });
});
