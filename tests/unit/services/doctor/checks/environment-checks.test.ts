/**
 * Unit tests for environment validation checks
 *
 * Tests Node.js version validation, AWS CLI installation verification, and
 * dependency integrity checks with comprehensive error scenarios and mocking.
 */

import { execa } from "execa";
import { existsSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckExecutionError } from "../../../../../src/lib/diagnostic-errors.js";
import {
  AwsCliInstallationCheck,
  NodeModulesCheck,
  NodeVersionCheck,
} from "../../../../../src/services/doctor/checks/environment-checks.js";
import type { DoctorContext } from "../../../../../src/services/doctor/types.js";

// Mock external dependencies
vi.mock("execa", () => ({
  execa: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
}));

const mockExeca = vi.fn();
const mockExistsSync = vi.fn();

describe("Environment Checks", () => {
  let context: DoctorContext;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default context
    context = {
      profile: "test-profile",
      detailed: false,
    };

    // Setup module mocks
    vi.mocked(execa).mockImplementation(mockExeca);
    vi.mocked(existsSync).mockImplementation(mockExistsSync);
  });

  describe("NodeVersionCheck", () => {
    let nodeVersionCheck: NodeVersionCheck;

    beforeEach(() => {
      nodeVersionCheck = new NodeVersionCheck();
    });

    describe("properties", () => {
      it("should have correct metadata", () => {
        expect(nodeVersionCheck.id).toBe("node-version");
        expect(nodeVersionCheck.name).toBe("Node.js Version");
        expect(nodeVersionCheck.description).toBe(
          "Validates Node.js version meets minimum requirements (v20+)",
        );
        expect(nodeVersionCheck.stage).toBe("environment");
      });
    });

    describe("execute", () => {
      it("should pass for Node.js v20", async () => {
        const originalVersion = process.version;
        Object.defineProperty(process, "version", {
          value: "v20.0.0",
          writable: true,
        });

        const result = await nodeVersionCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.message).toBe("Node.js version v20.0.0 meets requirements");
        expect(result.details).toEqual({
          currentVersion: "v20.0.0",
          majorVersion: 20,
          minimumRequired: 20,
        });

        // Restore original version
        Object.defineProperty(process, "version", {
          value: originalVersion,
          writable: true,
        });
      });

      it("should pass for Node.js v24", async () => {
        const originalVersion = process.version;
        Object.defineProperty(process, "version", {
          value: "v24.1.0",
          writable: true,
        });

        const result = await nodeVersionCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.message).toBe("Node.js version v24.1.0 meets requirements");
        expect(result.details).toEqual({
          currentVersion: "v24.1.0",
          majorVersion: 24,
          minimumRequired: 20,
        });

        // Restore original version
        Object.defineProperty(process, "version", {
          value: originalVersion,
          writable: true,
        });
      });

      it("should fail for Node.js v18", async () => {
        const originalVersion = process.version;
        Object.defineProperty(process, "version", {
          value: "v18.19.0",
          writable: true,
        });

        const result = await nodeVersionCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("Node.js version v18.19.0 is below minimum required v20");
        expect(result.details).toEqual({
          currentVersion: "v18.19.0",
          majorVersion: 18,
          minimumRequired: 20,
        });
        expect(result.remediation).toContain("Upgrade Node.js to version 20 or higher");

        // Restore original version
        Object.defineProperty(process, "version", {
          value: originalVersion,
          writable: true,
        });
      });

      it("should fail for Node.js v16", async () => {
        const originalVersion = process.version;
        Object.defineProperty(process, "version", {
          value: "v16.20.2",
          writable: true,
        });

        const result = await nodeVersionCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("Node.js version v16.20.2 is below minimum required v20");
        expect(result.details).toEqual({
          currentVersion: "v16.20.2",
          majorVersion: 16,
          minimumRequired: 20,
        });

        // Restore original version
        Object.defineProperty(process, "version", {
          value: originalVersion,
          writable: true,
        });
      });

      it("should handle pre-release versions correctly", async () => {
        const originalVersion = process.version;
        Object.defineProperty(process, "version", {
          value: "v21.0.0-pre",
          writable: true,
        });

        const result = await nodeVersionCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.details?.majorVersion).toBe(21);

        // Restore original version
        Object.defineProperty(process, "version", {
          value: originalVersion,
          writable: true,
        });
      });

      it("should throw CheckExecutionError for invalid version format", async () => {
        const originalVersion = process.version;
        Object.defineProperty(process, "version", {
          value: "invalid-version",
          writable: true,
        });

        await expect(nodeVersionCheck.execute(context)).rejects.toThrow(CheckExecutionError);

        // Restore original version
        Object.defineProperty(process, "version", {
          value: originalVersion,
          writable: true,
        });
      });
    });

    describe("extractMajorVersion", () => {
      it("should extract major version from standard format", () => {
        // Access private method for testing
        const extractMajorVersion = (nodeVersionCheck as any).extractMajorVersion.bind(
          nodeVersionCheck,
        );

        expect(extractMajorVersion("v20.0.0")).toBe(20);
        expect(extractMajorVersion("v18.19.1")).toBe(18);
        expect(extractMajorVersion("v24.1.0")).toBe(24);
      });

      it("should handle version without 'v' prefix", () => {
        const extractMajorVersion = (nodeVersionCheck as any).extractMajorVersion.bind(
          nodeVersionCheck,
        );

        expect(extractMajorVersion("20.0.0")).toBe(20);
        expect(extractMajorVersion("18.19.1")).toBe(18);
      });

      it("should throw error for invalid format", () => {
        const extractMajorVersion = (nodeVersionCheck as any).extractMajorVersion.bind(
          nodeVersionCheck,
        );

        expect(() => extractMajorVersion("invalid")).toThrow("Invalid Node.js version format");
        expect(() => extractMajorVersion("")).toThrow("Invalid Node.js version format");
      });
    });
  });

  describe("AwsCliInstallationCheck", () => {
    let awsCliCheck: AwsCliInstallationCheck;

    beforeEach(() => {
      awsCliCheck = new AwsCliInstallationCheck();
    });

    describe("properties", () => {
      it("should have correct metadata", () => {
        expect(awsCliCheck.id).toBe("aws-cli-installation");
        expect(awsCliCheck.name).toBe("AWS CLI Installation");
        expect(awsCliCheck.description).toBe("Verifies AWS CLI v2 installation and accessibility");
        expect(awsCliCheck.stage).toBe("environment");
      });
    });

    describe("execute", () => {
      it("should pass for AWS CLI v2", async () => {
        mockExeca.mockResolvedValue({
          exitCode: 0,
          stdout:
            "aws-cli/2.15.30 Python/3.11.6 Linux/6.2.0-1018-aws exe/x86_64.ubuntu.22 prompt/off",
          stderr: "",
        });

        const result = await awsCliCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.message).toBe("AWS CLI 2.15.30 is installed and accessible");
        expect(result.details).toEqual({
          version: "2.15.30",
          majorVersion: 2,
          command: "aws --version",
        });

        expect(mockExeca).toHaveBeenCalledWith("aws", ["--version"], {
          timeout: 10_000,
          reject: false,
        });
      });

      it("should pass for newer AWS CLI v2 versions", async () => {
        mockExeca.mockResolvedValue({
          exitCode: 0,
          stdout:
            "aws-cli/2.20.1 Python/3.12.0 Linux/6.5.0-1010-aws exe/x86_64.ubuntu.23 prompt/off",
          stderr: "",
        });

        const result = await awsCliCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.message).toBe("AWS CLI 2.20.1 is installed and accessible");
        expect(result.details?.majorVersion).toBe(2);
      });

      it("should fail for AWS CLI v1", async () => {
        mockExeca.mockResolvedValue({
          exitCode: 0,
          stdout: "aws-cli/1.32.101 Python/3.9.2 Linux/5.4.0-91-generic botocore/1.29.101",
          stderr: "",
        });

        const result = await awsCliCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("AWS CLI 1.32.101 detected, but version 2.x is required");
        expect(result.details).toEqual({
          version: "1.32.101",
          majorVersion: 1,
          requiredMajorVersion: 2,
        });
        expect(result.remediation).toContain("Install AWS CLI v2");
      });

      it("should fail when AWS CLI is not installed", async () => {
        mockExeca.mockResolvedValue({
          exitCode: 127,
          stdout: "",
          stderr: "aws: command not found",
        });

        const result = await awsCliCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("AWS CLI is not installed or not accessible in PATH");
        expect(result.details).toEqual({
          exitCode: 127,
          stderr: "aws: command not found",
          command: "aws --version",
        });
        expect(result.remediation).toContain("Install AWS CLI v2");
      });

      it("should fail when command returns non-zero exit code", async () => {
        mockExeca.mockResolvedValue({
          exitCode: 1,
          stdout: "",
          stderr: "Error running command",
        });

        const result = await awsCliCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("AWS CLI is not installed or not accessible in PATH");
        expect(result.details?.exitCode).toBe(1);
      });

      it("should handle command timeout", async () => {
        const timeoutError = new Error("Command timed out after 10000 milliseconds");
        mockExeca.mockRejectedValue(timeoutError);

        const result = await awsCliCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("AWS CLI command timed out - installation may be corrupted");
        expect(result.remediation).toContain("Reinstall AWS CLI v2");
      });

      it("should throw CheckExecutionError for unexpected errors", async () => {
        const unexpectedError = new Error("Unexpected file system error");
        mockExeca.mockRejectedValue(unexpectedError);

        await expect(awsCliCheck.execute(context)).rejects.toThrow(CheckExecutionError);
      });
    });

    describe("parseAwsCliVersion", () => {
      it("should parse standard AWS CLI v2 version", () => {
        const parseAwsCliVersion = (awsCliCheck as any).parseAwsCliVersion.bind(awsCliCheck);

        const result = parseAwsCliVersion(
          "aws-cli/2.15.30 Python/3.11.6 Linux/6.2.0-1018-aws exe/x86_64.ubuntu.22 prompt/off",
        );

        expect(result).toEqual({
          full: "2.15.30",
          major: 2,
        });
      });

      it("should parse AWS CLI v1 version", () => {
        const parseAwsCliVersion = (awsCliCheck as any).parseAwsCliVersion.bind(awsCliCheck);

        const result = parseAwsCliVersion(
          "aws-cli/1.32.101 Python/3.9.2 Linux/5.4.0-91-generic botocore/1.29.101",
        );

        expect(result).toEqual({
          full: "1.32.101",
          major: 1,
        });
      });

      it("should handle different version formats", () => {
        const parseAwsCliVersion = (awsCliCheck as any).parseAwsCliVersion.bind(awsCliCheck);

        expect(parseAwsCliVersion("aws-cli/2.0.0 ...")).toEqual({ full: "2.0.0", major: 2 });
        expect(parseAwsCliVersion("aws-cli/2.20.1 ...")).toEqual({ full: "2.20.1", major: 2 });
      });

      it("should throw error for unparseable version", () => {
        const parseAwsCliVersion = (awsCliCheck as any).parseAwsCliVersion.bind(awsCliCheck);

        expect(() => parseAwsCliVersion("invalid version output")).toThrow(
          "Unable to parse AWS CLI version",
        );
        expect(() => parseAwsCliVersion("")).toThrow("Unable to parse AWS CLI version");
      });
    });
  });

  describe("NodeModulesCheck", () => {
    let nodeModulesCheck: NodeModulesCheck;

    beforeEach(() => {
      nodeModulesCheck = new NodeModulesCheck();
    });

    describe("properties", () => {
      it("should have correct metadata", () => {
        expect(nodeModulesCheck.id).toBe("node-modules");
        expect(nodeModulesCheck.name).toBe("Node.js Dependencies");
        expect(nodeModulesCheck.description).toBe(
          "Verifies node_modules directory exists and contains dependencies",
        );
        expect(nodeModulesCheck.stage).toBe("environment");
      });
    });

    describe("execute", () => {
      it("should pass when all dependencies are present", async () => {
        // Mock node_modules and package.json existence
        mockExistsSync.mockImplementation((path: string) => {
          if (path.includes("node_modules") && !path.includes("/node_modules/")) {
            return true; // node_modules directory exists
          }
          if (path.includes("package.json")) {
            return true; // package.json exists
          }
          if (path.includes("node_modules/")) {
            // All core dependencies exist
            return [
              "@oclif/core",
              "@aws-sdk/client-sts",
              "zod",
              "ora",
              "listr2",
              "execa",
              "enquirer",
            ].some((dep) => path.includes(dep));
          }
          return false;
        });

        const result = await nodeModulesCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.message).toBe("Node.js dependencies are properly installed");
        expect(result.details).toEqual({
          nodeModulesPath: expect.stringContaining("node_modules"),
          packageJsonExists: true,
          coreDependenciesChecked: 7,
        });
      });

      it("should fail when node_modules directory is missing", async () => {
        mockExistsSync.mockImplementation(() => {
          // node_modules directory doesn't exist, package.json doesn't exist
          return false;
        });

        const result = await nodeModulesCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("node_modules directory not found");
        expect(result.details).toEqual({
          nodeModulesPath: expect.stringContaining("node_modules"),
          exists: false,
        });
        expect(result.remediation).toContain("Run 'pnpm install' or 'npm install'");
      });

      it("should warn when some dependencies are missing", async () => {
        mockExistsSync.mockImplementation((path: string) => {
          if (path.includes("node_modules") && !path.includes("/node_modules/")) {
            return true; // node_modules directory exists
          }
          if (path.includes("package.json")) {
            return true; // package.json exists
          }
          if (path.includes("node_modules/")) {
            // Only some dependencies exist
            return path.includes("@oclif/core") || path.includes("zod");
          }
          return false;
        });

        const result = await nodeModulesCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("5 core dependencies are missing or incomplete");
        expect(result.details?.missingDependencies).toEqual([
          "@aws-sdk/client-sts",
          "ora",
          "listr2",
          "execa",
          "enquirer",
        ]);
        expect(result.remediation).toContain("Run 'pnpm install' or 'npm install'");
      });

      it("should fail when most dependencies are missing", async () => {
        mockExistsSync.mockImplementation((path: string) => {
          if (path.includes("node_modules") && !path.includes("/node_modules/")) {
            return true; // node_modules directory exists
          }
          if (path.includes("package.json")) {
            return true; // package.json exists
          }
          if (path.includes("node_modules/")) {
            // Only one dependency exists
            return path.includes("@oclif/core");
          }
          return false;
        });

        const result = await nodeModulesCheck.execute(context);

        expect(result.status).toBe("fail");
        expect(result.message).toBe("6 core dependencies are missing or incomplete");
        expect(result.details?.missingDependencies).toHaveLength(6);
      });

      it("should handle missing package.json gracefully", async () => {
        mockExistsSync.mockImplementation((path: string) => {
          if (path.includes("node_modules") && !path.includes("/node_modules/")) {
            return true; // node_modules directory exists
          }
          if (path.includes("package.json")) {
            return false; // package.json doesn't exist
          }
          if (path.includes("node_modules/")) {
            // All core dependencies exist
            return [
              "@oclif/core",
              "@aws-sdk/client-sts",
              "zod",
              "ora",
              "listr2",
              "execa",
              "enquirer",
            ].some((dep) => path.includes(dep));
          }
          return false;
        });

        const result = await nodeModulesCheck.execute(context);

        expect(result.status).toBe("pass");
        expect(result.details?.packageJsonExists).toBe(false);
      });

      it("should throw CheckExecutionError for unexpected errors", async () => {
        mockExistsSync.mockImplementation(() => {
          throw new Error("File system error");
        });

        await expect(nodeModulesCheck.execute(context)).rejects.toThrow(CheckExecutionError);
      });
    });
  });
});
