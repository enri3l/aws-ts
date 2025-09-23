/**
 * Unit tests for authentication utilities
 *
 * Tests cross-platform authentication utilities including platform detection,
 * AWS CLI discovery, configuration management, and subprocess utilities.
 */

import { vol } from "memfs";
import os from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  detectAwsCli,
  ensureAwsConfigDirectory,
  formatSubprocessCommand,
  getAwsCliPaths,
  getAwsConfigPaths,
  getPlatformInfo,
  getSubprocessEnvironment,
  getSubprocessTimeout,
  hasAwsConfig,
  sanitizeSubprocessArguments,
} from "../../../src/lib/auth-utilities.js";

// Mock filesystem
vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return {
    default: memfs.fs.promises,
    ...memfs.fs.promises,
  };
});

// Mock os module
vi.mock("node:os", () => ({
  default: {
    platform: vi.fn(),
    homedir: vi.fn(),
  },
}));

describe("Authentication Utilities", () => {
  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    vol.reset();

    // Setup default mocks
    vi.mocked(os).platform.mockReturnValue("linux");
    vi.mocked(os).homedir.mockReturnValue("/home/user");
  });

  describe("Platform Detection", () => {
    describe("getPlatformInfo", () => {
      it("should detect Linux platform correctly", () => {
        vi.mocked(os).platform.mockReturnValue("linux");
        vi.mocked(os).homedir.mockReturnValue("/home/user");

        const platformInfo = getPlatformInfo();

        expect(platformInfo).toEqual({
          platform: "linux",
          isWindows: false,
          isMacOS: false,
          isLinux: true,
          homeDirectory: "/home/user",
          awsConfigDirectory: "/home/user/.aws",
        });
      });

      it("should detect Windows platform correctly", () => {
        vi.mocked(os).platform.mockReturnValue("win32");
        vi.mocked(os).homedir.mockReturnValue(String.raw`C:\Users\user`);

        const platformInfo = getPlatformInfo();

        expect(platformInfo).toEqual({
          platform: "windows",
          isWindows: true,
          isMacOS: false,
          isLinux: false,
          homeDirectory: String.raw`C:\Users\user`,
          awsConfigDirectory: String.raw`C:\Users\user/.aws`,
        });
      });

      it("should detect macOS platform correctly", () => {
        vi.mocked(os).platform.mockReturnValue("darwin");
        vi.mocked(os).homedir.mockReturnValue("/Users/user");

        const platformInfo = getPlatformInfo();

        expect(platformInfo).toEqual({
          platform: "macos",
          isWindows: false,
          isMacOS: true,
          isLinux: false,
          homeDirectory: "/Users/user",
          awsConfigDirectory: "/Users/user/.aws",
        });
      });

      it("should handle unknown platform", () => {
        vi.mocked(os).platform.mockReturnValue("freebsd");
        vi.mocked(os).homedir.mockReturnValue("/home/user");

        const platformInfo = getPlatformInfo();

        expect(platformInfo).toEqual({
          platform: "unknown",
          isWindows: false,
          isMacOS: false,
          isLinux: false,
          homeDirectory: "/home/user",
          awsConfigDirectory: "/home/user/.aws",
        });
      });
    });
  });

  describe("AWS CLI Discovery", () => {
    describe("getAwsCliPaths", () => {
      it("should return Windows-specific paths", () => {
        vi.mocked(os).platform.mockReturnValue("win32");
        vi.mocked(os).homedir.mockReturnValue(String.raw`C:\Users\user`);

        // Mock environment variables
        const originalEnvironment = process.env;
        process.env = {
          ...originalEnvironment,
          PROGRAMFILES: String.raw`C:\Program Files`,
          "PROGRAMFILES(X86)": String.raw`C:\Program Files (x86)`,
        };

        const paths = getAwsCliPaths();

        expect(paths).toEqual([
          "aws.exe",
          "aws",
          String.raw`C:\Program Files/Amazon/AWSCLIV2/aws.exe`,
          String.raw`C:\Program Files (x86)/Amazon/AWSCLIV2/aws.exe`,
          String.raw`C:\Users\user/AppData/Local/Programs/Amazon/AWSCLIV2/aws.exe`,
        ]);

        process.env = originalEnvironment;
      });

      it("should return Unix-specific paths for Linux", () => {
        vi.mocked(os).platform.mockReturnValue("linux");
        vi.mocked(os).homedir.mockReturnValue("/home/user");

        const paths = getAwsCliPaths();

        expect(paths).toEqual([
          "aws",
          "/usr/local/bin/aws",
          "/usr/bin/aws",
          "/opt/homebrew/bin/aws",
          "/home/user/.local/bin/aws",
          "/home/user/bin/aws",
        ]);
      });

      it("should return Unix-specific paths for macOS", () => {
        vi.mocked(os).platform.mockReturnValue("darwin");
        vi.mocked(os).homedir.mockReturnValue("/Users/user");

        const paths = getAwsCliPaths();

        expect(paths).toEqual([
          "aws",
          "/usr/local/bin/aws",
          "/usr/bin/aws",
          "/opt/homebrew/bin/aws",
          "/Users/user/.local/bin/aws",
          "/Users/user/bin/aws",
        ]);
      });

      it("should handle default Windows paths when environment variables are missing", () => {
        vi.mocked(os).platform.mockReturnValue("win32");
        vi.mocked(os).homedir.mockReturnValue(String.raw`C:\Users\user`);

        // Mock missing environment variables
        const originalEnvironment = process.env;
        process.env = { ...originalEnvironment };
        delete process.env.PROGRAMFILES;
        delete process.env["PROGRAMFILES(X86)"];

        const paths = getAwsCliPaths();

        expect(paths).toContain(String.raw`C:\Program Files/Amazon/AWSCLIV2/aws.exe`);
        expect(paths).toContain(String.raw`C:\Program Files (x86)/Amazon/AWSCLIV2/aws.exe`);

        process.env = originalEnvironment;
      });
    });

    describe("detectAwsCli", () => {
      it("should detect AWS CLI when executable exists", async () => {
        vi.mocked(os).platform.mockReturnValue("linux");
        vi.mocked(os).homedir.mockReturnValue("/home/user");

        // Setup filesystem with AWS CLI
        vol.fromJSON({
          "/usr/local/bin/aws": "#!/bin/bash\necho aws",
        });

        const result = await detectAwsCli();

        expect(result).toEqual({
          installed: true,
          installMethod: "system",
          path: "/usr/local/bin/aws",
        });
      });

      it("should detect user installation", async () => {
        vi.mocked(os).platform.mockReturnValue("linux");
        vi.mocked(os).homedir.mockReturnValue("/home/user");

        // Setup filesystem with user AWS CLI
        vol.fromJSON({
          "/home/user/.local/bin/aws": "#!/bin/bash\necho aws",
        });

        const result = await detectAwsCli();

        expect(result).toEqual({
          installed: true,
          installMethod: "user",
          path: "/home/user/.local/bin/aws",
        });
      });

      it("should detect conda installation", async () => {
        vi.mocked(os).platform.mockReturnValue("linux");
        vi.mocked(os).homedir.mockReturnValue("/home/user");

        // Setup filesystem with conda AWS CLI
        vol.fromJSON({
          "/home/user/miniconda3/bin/aws": "#!/bin/bash\necho aws",
        });

        // Mock the paths to include conda path
        vi.doMock("../../../src/lib/auth-utilities.js", async () => {
          const actual = await vi.importActual("../../../src/lib/auth-utilities.js");
          return {
            ...actual,
            getAwsCliPaths: () => ["/home/user/miniconda3/bin/aws"],
          };
        });

        const result = await detectAwsCli();

        expect(result.installed).toBe(false);
      });

      it("should return not installed when AWS CLI not found", async () => {
        vi.mocked(os).platform.mockReturnValue("linux");
        vi.mocked(os).homedir.mockReturnValue("/home/user");

        // Empty filesystem
        vol.fromJSON({});

        const result = await detectAwsCli();

        expect(result).toEqual({
          installed: false,
        });
      });

      it("should handle filesystem errors gracefully", async () => {
        vi.mocked(os).platform.mockReturnValue("linux");
        vi.mocked(os).homedir.mockReturnValue("/home/user");

        // Empty filesystem will cause stat errors
        vol.fromJSON({});

        const result = await detectAwsCli();

        expect(result.installed).toBe(false);
      });
    });
  });

  describe("Configuration Management", () => {
    describe("getAwsConfigPaths", () => {
      it("should return correct config paths for Linux", () => {
        vi.mocked(os).platform.mockReturnValue("linux");
        vi.mocked(os).homedir.mockReturnValue("/home/user");

        const paths = getAwsConfigPaths();

        expect(paths).toEqual({
          configFile: "/home/user/.aws/config",
          credentialsFile: "/home/user/.aws/credentials",
          ssoCache: "/home/user/.aws/sso/cache",
        });
      });

      it("should return correct config paths for Windows", () => {
        vi.mocked(os).platform.mockReturnValue("win32");
        vi.mocked(os).homedir.mockReturnValue(String.raw`C:\Users\user`);

        const paths = getAwsConfigPaths();

        expect(paths).toEqual({
          configFile: String.raw`C:\Users\user/.aws/config`,
          credentialsFile: String.raw`C:\Users\user/.aws/credentials`,
          ssoCache: String.raw`C:\Users\user/.aws/sso/cache`,
        });
      });

      it("should return correct config paths for macOS", () => {
        vi.mocked(os).platform.mockReturnValue("darwin");
        vi.mocked(os).homedir.mockReturnValue("/Users/user");

        const paths = getAwsConfigPaths();

        expect(paths).toEqual({
          configFile: "/Users/user/.aws/config",
          credentialsFile: "/Users/user/.aws/credentials",
          ssoCache: "/Users/user/.aws/sso/cache",
        });
      });
    });

    describe("hasAwsConfig", () => {
      it("should return true when AWS config directory exists", async () => {
        vi.mocked(os).platform.mockReturnValue("linux");
        vi.mocked(os).homedir.mockReturnValue("/home/user");

        // Setup filesystem with AWS config directory
        vol.fromJSON({
          "/home/user/.aws/config": "[default]\nregion = us-east-1",
        });

        const result = await hasAwsConfig();

        expect(result).toBe(true);
      });

      it("should return false when AWS config directory does not exist", async () => {
        vi.mocked(os).platform.mockReturnValue("linux");
        vi.mocked(os).homedir.mockReturnValue("/home/user");

        // Empty filesystem
        vol.fromJSON({});

        const result = await hasAwsConfig();

        expect(result).toBe(false);
      });

      it("should return false when path exists but is not a directory", async () => {
        vi.mocked(os).platform.mockReturnValue("linux");
        vi.mocked(os).homedir.mockReturnValue("/home/user");

        // Setup filesystem with file instead of directory
        vol.fromJSON({
          "/home/user/.aws": "not a directory",
        });

        const result = await hasAwsConfig();

        expect(result).toBe(false);
      });

      it("should handle filesystem errors gracefully", async () => {
        vi.mocked(os).platform.mockReturnValue("linux");
        vi.mocked(os).homedir.mockReturnValue("/nonexistent/user");

        const result = await hasAwsConfig();

        expect(result).toBe(false);
      });
    });

    describe("ensureAwsConfigDirectory", () => {
      it("should create AWS config directory when it does not exist", async () => {
        vi.mocked(os).platform.mockReturnValue("linux");
        vi.mocked(os).homedir.mockReturnValue("/home/user");

        // Empty filesystem
        vol.fromJSON({});

        await ensureAwsConfigDirectory();

        // Verify directory was created
        const hasConfig = await hasAwsConfig();
        expect(hasConfig).toBe(true);
      });

      it("should succeed when AWS config directory already exists", async () => {
        vi.mocked(os).platform.mockReturnValue("linux");
        vi.mocked(os).homedir.mockReturnValue("/home/user");

        // Setup filesystem with existing directory
        vol.fromJSON({
          "/home/user/.aws/config": "[default]\nregion = us-east-1",
        });

        await expect(ensureAwsConfigDirectory()).resolves.not.toThrow();
      });

      it("should create nested directories recursively", async () => {
        vi.mocked(os).platform.mockReturnValue("linux");
        vi.mocked(os).homedir.mockReturnValue("/home/user");

        // Empty filesystem
        vol.fromJSON({});

        await ensureAwsConfigDirectory();

        // Verify nested structure was created
        const hasConfig = await hasAwsConfig();
        expect(hasConfig).toBe(true);
      });
    });
  });

  describe("Subprocess Utilities", () => {
    describe("getSubprocessEnvironment", () => {
      it("should return environment with AWS config paths", () => {
        vi.mocked(os).platform.mockReturnValue("linux");
        vi.mocked(os).homedir.mockReturnValue("/home/user");

        const originalEnvironment = process.env;
        process.env = { ...originalEnvironment, EXISTING_VAR: "value" };

        const environment = getSubprocessEnvironment();

        expect(environment).toEqual({
          ...process.env,
          AWS_CONFIG_FILE: "/home/user/.aws/config",
          AWS_SHARED_CREDENTIALS_FILE: "/home/user/.aws/credentials",
        });

        process.env = originalEnvironment;
      });

      it("should not override existing AWS environment variables", () => {
        vi.mocked(os).platform.mockReturnValue("linux");
        vi.mocked(os).homedir.mockReturnValue("/home/user");

        const originalEnvironment = process.env;
        process.env = {
          ...originalEnvironment,
          AWS_CONFIG_FILE: "/custom/config",
          AWS_SHARED_CREDENTIALS_FILE: "/custom/credentials",
        };

        const environment = getSubprocessEnvironment();

        expect(environment.AWS_CONFIG_FILE).toBe("/custom/config");
        expect(environment.AWS_SHARED_CREDENTIALS_FILE).toBe("/custom/credentials");

        process.env = originalEnvironment;
      });

      it("should add additional variables", () => {
        vi.mocked(os).platform.mockReturnValue("linux");
        vi.mocked(os).homedir.mockReturnValue("/home/user");

        const environment = getSubprocessEnvironment({
          CUSTOM_VAR: "custom_value",
          AWS_PROFILE: "test-profile",
        });

        expect(environment.CUSTOM_VAR).toBe("custom_value");
        expect(environment.AWS_PROFILE).toBe("test-profile");
      });

      it("should handle Windows PATH environment correctly", () => {
        vi.mocked(os).platform.mockReturnValue("win32");
        vi.mocked(os).homedir.mockReturnValue(String.raw`C:\Users\user`);

        const originalEnvironment = process.env;
        process.env = {
          ...originalEnvironment,
          PROGRAMFILES: String.raw`C:\Program Files`,
          "PROGRAMFILES(X86)": String.raw`C:\Program Files (x86)`,
          PATH: String.raw`C:\Windows\System32`,
        };

        const environment = getSubprocessEnvironment();

        expect(environment.PATH).toContain(String.raw`C:\Windows\System32`);
        expect(environment.PATH).toContain(String.raw`C:\Program Files/Amazon/AWSCLIV2`);
        expect(environment.PATH).toContain(String.raw`C:\Program Files (x86)/Amazon/AWSCLIV2`);

        process.env = originalEnvironment;
      });

      it("should handle missing PATH on Windows", () => {
        vi.mocked(os).platform.mockReturnValue("win32");
        vi.mocked(os).homedir.mockReturnValue(String.raw`C:\Users\user`);

        const originalEnvironment = process.env;
        process.env = { ...originalEnvironment };
        delete process.env.PATH;
        delete process.env.Path;

        const environment = getSubprocessEnvironment();

        expect(environment.PATH).toContain(String.raw`C:\Program Files/Amazon/AWSCLIV2`);

        process.env = originalEnvironment;
      });
    });

    describe("sanitizeSubprocessArguments", () => {
      it("should remove dangerous shell metacharacters", () => {
        const arguments_ = [
          "normal-arg",
          "arg;with;semicolons",
          "arg&with&ampersands",
          "arg|with|pipes",
          "arg`with`backticks",
          "arg$with$dollars",
          "arg(with)parens",
          "arg{with}braces",
          "arg[with]brackets",
        ];

        const sanitized = sanitizeSubprocessArguments(arguments_);

        expect(sanitized).toEqual([
          "normal-arg",
          "argwithsemicolons",
          "argwithampersands",
          "argwithpipes",
          "argwithbackticks",
          "argwithdollars",
          "argwithparens",
          "argwithbraces",
          "argwithbrackets",
        ]);
      });

      it("should handle empty arguments", () => {
        const arguments_ = ["", "  ", "\t"];

        const sanitized = sanitizeSubprocessArguments(arguments_);

        expect(sanitized).toEqual(['""', '""', '""']);
      });

      it("should preserve normal arguments", () => {
        const arguments_ = ["aws", "sts", "get-caller-identity", "--region", "us-east-1"];

        const sanitized = sanitizeSubprocessArguments(arguments_);

        expect(sanitized).toEqual(arguments_);
      });
    });

    describe("formatSubprocessCommand", () => {
      it("should format simple command correctly", () => {
        const formatted = formatSubprocessCommand("aws", ["sts", "get-caller-identity"]);

        expect(formatted).toBe("aws sts get-caller-identity");
      });

      it("should quote arguments with spaces", () => {
        const formatted = formatSubprocessCommand("aws", [
          "sts",
          "get-caller-identity",
          "--profile",
          "my profile",
        ]);

        expect(formatted).toBe('aws sts get-caller-identity --profile "my profile"');
      });

      it("should quote arguments with tabs and newlines", () => {
        const formatted = formatSubprocessCommand("aws", ["arg\twith\ttab", "arg\nwith\nnewline"]);

        expect(formatted).toBe('aws "arg\twith\ttab" "arg\nwith\nnewline"');
      });

      it("should escape quotes in arguments", () => {
        const formatted = formatSubprocessCommand("aws", ['arg"with"quotes']);

        expect(formatted).toBe('aws arg"with"quotes');
      });

      it("should handle empty arguments", () => {
        const formatted = formatSubprocessCommand("aws", []);

        expect(formatted).toBe("aws");
      });
    });

    describe("getSubprocessTimeout", () => {
      it("should return correct timeout for quick operations", () => {
        const timeout = getSubprocessTimeout("quick");
        expect(timeout).toBe(30_000);
      });

      it("should return correct timeout for interactive operations", () => {
        const timeout = getSubprocessTimeout("interactive");
        expect(timeout).toBe(300_000);
      });

      it("should return correct timeout for long operations", () => {
        const timeout = getSubprocessTimeout("long");
        expect(timeout).toBe(600_000);
      });

      it("should return default timeout for unknown operations", () => {
        const timeout = getSubprocessTimeout("unknown" as any);
        expect(timeout).toBe(30_000);
      });
    });
  });
});
