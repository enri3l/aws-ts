/**
 * Environment validation checks for system requirements
 *
 * Provides fundamental system validation including Node.js version compatibility,
 * AWS CLI installation verification, and dependency integrity checks. These checks
 * run in parallel with no external dependencies and form the foundation for
 * subsequent validation stages.
 *
 */

import { execa } from "execa";
import { existsSync } from "node:fs";
import path from "node:path";
import { CheckExecutionError } from "../../../lib/diagnostic-errors.js";
import type { CheckResult, DoctorContext, ICheck } from "../types.js";

/**
 * Node.js version compatibility check
 *
 * Validates that the current Node.js version meets the minimum requirements
 * for the application. Uses process.version for reliable version detection
 * across all platforms and Node.js distributions.
 *
 * @public
 */
export class NodeVersionCheck implements ICheck {
  /**
   * Unique identifier for this check
   */
  readonly id = "node-version";

  /**
   * Human-readable name for this check
   */
  readonly name = "Node.js Version";

  /**
   * Description of what this check validates
   */
  readonly description = "Validates Node.js version meets minimum requirements (v20+)";

  /**
   * Validation stage this check belongs to
   */
  readonly stage = "environment" as const;

  /**
   * Minimum required Node.js major version
   */
  private readonly minNodeVersion = 20;

  /**
   * Execute the Node.js version validation check
   *
   * Validates that the current Node.js version meets the minimum requirements
   * for application compatibility. Uses semantic version parsing to handle
   * pre-release and development versions appropriately.
   *
   * @param _context - Shared execution context (unused for environment checks)
   * @returns Promise resolving to check result with version details
   * @throws When version parsing fails unexpectedly
   */
  // Context parameter required by ICheck interface but unused for Node.js version validation
  // Async signature required by interface but version check is synchronous process.version access
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/require-await
  async execute(_context: DoctorContext): Promise<CheckResult> {
    try {
      const nodeVersion = process.version;
      const majorVersion = this.extractMajorVersion(nodeVersion);

      if (majorVersion >= this.minNodeVersion) {
        return {
          status: "pass",
          message: `Node.js version ${nodeVersion} meets requirements`,
          details: {
            currentVersion: nodeVersion,
            majorVersion,
            minimumRequired: this.minNodeVersion,
          },
        };
      }

      // Version is below minimum requirements
      return {
        status: "fail",
        message: `Node.js version ${nodeVersion} is below minimum required v${this.minNodeVersion}`,
        details: {
          currentVersion: nodeVersion,
          majorVersion,
          minimumRequired: this.minNodeVersion,
        },
        remediation: `Upgrade Node.js to version ${this.minNodeVersion} or higher. Visit https://nodejs.org for latest versions.`,
      };
    } catch (error) {
      throw new CheckExecutionError(
        "Failed to validate Node.js version",
        this.id,
        this.stage,
        error,
        { nodeVersion: process.version },
      );
    }
  }

  /**
   * Extract major version number from Node.js version string
   *
   * @param versionString - Node.js version string (e.g., "v24.1.0")
   * @returns Major version number
   * @throws When version string format is invalid
   * @internal
   */
  private extractMajorVersion(versionString: string): number {
    // Remove 'v' prefix and extract major version
    const cleanVersion = versionString.replace(/^v/, "");
    const majorVersionMatch = /^(\d+)/.exec(cleanVersion);

    if (!majorVersionMatch?.[1]) {
      throw new Error(`Invalid Node.js version format: ${versionString}`);
    }

    return Number.parseInt(majorVersionMatch[1], 10);
  }
}

/**
 * AWS CLI installation verification check
 *
 * Validates that AWS CLI version 2 is properly installed and accessible
 * in the system PATH. Uses execa for robust cross-platform command execution
 * with timeout protection and proper error handling.
 *
 * @public
 */
export class AwsCliInstallationCheck implements ICheck {
  /**
   * Unique identifier for this check
   */
  readonly id = "aws-cli-installation";

  /**
   * Human-readable name for this check
   */
  readonly name = "AWS CLI Installation";

  /**
   * Description of what this check validates
   */
  readonly description = "Verifies AWS CLI v2 installation and accessibility";

  /**
   * Validation stage this check belongs to
   */
  readonly stage = "environment" as const;

  /**
   * Command timeout in milliseconds
   */
  private readonly timeoutMs = 10_000;

  /**
   * Execute the AWS CLI installation verification check
   *
   * Attempts to execute 'aws --version' to verify CLI installation and
   * validate that version 2.x is available. Handles command execution
   * errors gracefully and provides specific guidance for resolution.
   *
   * @param _context - Shared execution context (unused for environment checks)
   * @returns Promise resolving to check result with installation details
   * @throws When command execution fails unexpectedly
   */
  // Context parameter required by ICheck interface but unused for AWS CLI installation validation
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async execute(_context: DoctorContext): Promise<CheckResult> {
    try {
      const result = await execa("aws", ["--version"], {
        timeout: this.timeoutMs,
        reject: false, // Don't throw on non-zero exit codes
      });

      if (result.exitCode === 0 && result.stdout) {
        const versionInfo = this.parseAwsCliVersion(result.stdout);

        if (versionInfo.major >= 2) {
          return {
            status: "pass",
            message: `AWS CLI ${versionInfo.full} is installed and accessible`,
            details: {
              version: versionInfo.full,
              majorVersion: versionInfo.major,
              command: "aws --version",
            },
          };
        }

        // Version 1.x detected
        return {
          status: "fail",
          message: `AWS CLI ${versionInfo.full} detected, but version 2.x is required`,
          details: {
            version: versionInfo.full,
            majorVersion: versionInfo.major,
            requiredMajorVersion: 2,
          },
          remediation:
            "Install AWS CLI v2 from https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html",
        };
      }

      // Command failed or no output
      return {
        status: "fail",
        message: "AWS CLI is not installed or not accessible in PATH",
        details: {
          exitCode: result.exitCode,
          stderr: result.stderr,
          command: "aws --version",
        },
        remediation:
          "Install AWS CLI v2 from https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html",
      };
    } catch (error) {
      // Handle timeout and other execution errors
      if (error instanceof Error && error.message.includes("timed out")) {
        return {
          status: "fail",
          message: "AWS CLI command timed out - installation may be corrupted",
          remediation: "Reinstall AWS CLI v2 or check system performance",
        };
      }

      throw new CheckExecutionError(
        "Failed to check AWS CLI installation",
        this.id,
        this.stage,
        error,
        { command: "aws --version" },
      );
    }
  }

  /**
   * Parse AWS CLI version information from command output
   *
   * @param versionOutput - Raw output from 'aws --version' command
   * @returns Parsed version information
   * @throws When AWS CLI version format cannot be parsed
   * @internal
   */
  private parseAwsCliVersion(versionOutput: string): { full: string; major: number } {
    // AWS CLI version output format: "aws-cli/2.x.x Python/x.x.x ..."
    const versionMatch = /aws-cli\/(\d+)\.(\d+)\.(\d+)/.exec(versionOutput);

    if (!versionMatch?.[1] || !versionMatch?.[2] || !versionMatch?.[3]) {
      throw new Error(`Unable to parse AWS CLI version from: ${versionOutput}`);
    }

    const major = Number.parseInt(versionMatch[1], 10);
    const minor = Number.parseInt(versionMatch[2], 10);
    const patch = Number.parseInt(versionMatch[3], 10);

    return {
      full: `${major}.${minor}.${patch}`,
      major,
    };
  }
}

/**
 * Node.js dependencies integrity check
 *
 * Validates that node_modules directory exists and contains essential
 * dependencies. Provides simplified validation compared to full package
 * integrity checking while ensuring basic dependency availability.
 *
 * @public
 */
export class NodeModulesCheck implements ICheck {
  /**
   * Unique identifier for this check
   */
  readonly id = "node-modules";

  /**
   * Human-readable name for this check
   */
  readonly name = "Node.js Dependencies";

  /**
   * Description of what this check validates
   */
  readonly description = "Verifies node_modules directory exists and contains dependencies";

  /**
   * Validation stage this check belongs to
   */
  readonly stage = "environment" as const;

  /**
   * Execute the Node.js dependencies integrity check
   *
   * Checks for the existence of node_modules directory and validates that
   * core application dependencies are available. Provides guidance for
   * dependency resolution when issues are detected.
   *
   * @param _context - Shared execution context (unused for environment checks)
   * @returns Promise resolving to check result with dependency details
   * @throws When dependency validation fails unexpectedly
   */
  // Context parameter required by ICheck interface but unused for dependency integrity validation
  // Async signature required by interface but dependency check uses synchronous filesystem operations
  // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/require-await
  async execute(_context: DoctorContext): Promise<CheckResult> {
    try {
      const nodeModulesPath = path.join(process.cwd(), "node_modules");
      const packageJsonPath = path.join(process.cwd(), "package.json");

      // Check if node_modules directory exists
      if (!existsSync(nodeModulesPath)) {
        return {
          status: "fail",
          message: "node_modules directory not found",
          details: {
            nodeModulesPath,
            exists: false,
          },
          remediation: "Run 'pnpm install' or 'npm install' to install dependencies",
        };
      }

      // Check if package.json exists for context
      const packageJsonExists = existsSync(packageJsonPath);

      // Validate core dependencies exist
      const coreDependencies = [
        "@oclif/core",
        "@aws-sdk/client-sts",
        "zod",
        "ora",
        "listr2",
        "execa",
        "enquirer",
      ];

      const missingDependencies = coreDependencies.filter(
        (dep) => !existsSync(path.join(nodeModulesPath, dep)),
      );

      if (missingDependencies.length === 0) {
        return {
          status: "pass",
          message: "Node.js dependencies are properly installed",
          details: {
            nodeModulesPath,
            packageJsonExists,
            coreDependenciesChecked: coreDependencies.length,
          },
        };
      }

      // Some core dependencies are missing
      const severity = missingDependencies.length > coreDependencies.length / 2 ? "fail" : "warn";

      return {
        status: severity,
        message: `${missingDependencies.length} core dependencies are missing or incomplete`,
        details: {
          nodeModulesPath,
          packageJsonExists,
          missingDependencies,
          totalCoreDependencies: coreDependencies.length,
        },
        remediation:
          "Run 'pnpm install' or 'npm install' to ensure all dependencies are properly installed",
      };
    } catch (error) {
      throw new CheckExecutionError(
        "Failed to validate Node.js dependencies",
        this.id,
        this.stage,
        error,
        { cwd: process.cwd() },
      );
    }
  }
}
