/**
 * AWS CLI wrapper service for authentication operations
 *
 * Provides a TypeScript interface for AWS CLI subprocess operations,
 * focusing exclusively on authentication tasks including SSO configuration,
 * login, logout, and credential validation.
 *
 */

import { spawn } from "node:child_process";
import { platform } from "node:os";
import { AuthenticationError, AwsCliError } from "../lib/auth-errors.js";
import type { SsoConfig } from "../lib/auth-schemas.js";

/**
 * Configuration options for AWS CLI wrapper
 *
 * @public
 */
export interface AuthCliWrapperOptions {
  /**
   * Timeout for AWS CLI operations in milliseconds
   */
  timeoutMs?: number;

  /**
   * Enable debug logging for subprocess operations
   */
  enableDebugLogging?: boolean;

  /**
   * Custom AWS CLI executable path
   */
  awsCliPath?: string;
}

/**
 * Result of AWS CLI subprocess execution
 *
 * @public
 */
export interface CliExecutionResult {
  /**
   * Process exit code
   */
  exitCode: number;

  /**
   * Standard output from the process
   */
  stdout: string;

  /**
   * Standard error from the process
   */
  stderr: string;

  /**
   * Whether the command succeeded (exit code 0)
   */
  success: boolean;
}

/**
 * AWS CLI wrapper for authentication operations
 *
 * Handles subprocess execution of AWS CLI commands for authentication
 * purposes only. All other AWS operations should use AWS SDK clients.
 *
 * @public
 */
export class AuthCliWrapper {
  private readonly options: Required<AuthCliWrapperOptions>;

  /**
   * Create a new AWS CLI wrapper instance
   *
   * @param options - Configuration options for the wrapper
   */
  constructor(options: AuthCliWrapperOptions = {}) {
    this.options = {
      timeoutMs: options.timeoutMs ?? 60_000,
      enableDebugLogging: options.enableDebugLogging ?? false,
      awsCliPath: options.awsCliPath ?? this.getDefaultAwsCliPath(),
    };
  }

  /**
   * Check if AWS CLI is installed and accessible
   *
   * @returns Promise resolving to AWS CLI version information
   * @throws When AWS CLI is not found or inaccessible
   */
  async checkInstallation(): Promise<{ version: string; installed: boolean }> {
    try {
      const result = await this.executeCommand(["--version"]);

      if (!result.success) {
        throw new AwsCliError(
          "AWS CLI is not installed or not accessible",
          "aws --version",
          result.exitCode,
          result.stdout,
          result.stderr,
        );
      }

      // Extract version from output like "aws-cli/2.13.25 Python/3.11.5 ..."
      const versionRegex = /aws-cli\/(\S+)/;
      const versionMatch = versionRegex.exec(result.stdout);
      const version = versionMatch?.[1] ?? "unknown";

      return { version, installed: true };
    } catch (error) {
      if (error instanceof AwsCliError) {
        throw error;
      }

      throw new AwsCliError(
        "Failed to check AWS CLI installation",
        "aws --version",
        127,
        "",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  /**
   * Configure SSO for a profile interactively
   *
   * @param profileName - AWS profile name to configure
   * @param ssoConfig - Optional SSO configuration for non-interactive setup
   * @returns Promise resolving when configuration is complete
   * @throws When SSO configuration fails
   */
  async configureSso(profileName: string = "default", ssoConfig?: SsoConfig): Promise<void> {
    const arguments_ = ["configure", "sso"];

    if (profileName !== "default") {
      arguments_.push("--profile", profileName);
    }

    try {
      const result = await this.executeInteractiveCommand(arguments_, ssoConfig);

      if (!result.success) {
        throw new AuthenticationError(
          `SSO configuration failed for profile '${profileName}'`,
          "sso-configure",
          profileName,
          new AwsCliError(
            "AWS CLI SSO configuration failed",
            `aws ${arguments_.join(" ")}`,
            result.exitCode,
            result.stdout,
            result.stderr,
          ),
        );
      }

      if (this.options.enableDebugLogging) {
        console.debug(`SSO configuration completed for profile: ${profileName}`);
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError(
        `Failed to configure SSO for profile '${profileName}'`,
        "sso-configure",
        profileName,
        error,
      );
    }
  }

  /**
   * Perform SSO login for a profile
   *
   * @param profileName - AWS profile name to login with
   * @returns Promise resolving when login is complete
   * @throws When SSO login fails
   */
  async ssoLogin(profileName: string = "default"): Promise<void> {
    const arguments_ = ["sso", "login"];

    if (profileName !== "default") {
      arguments_.push("--profile", profileName);
    }

    try {
      const result = await this.executeInteractiveCommand(arguments_);

      if (!result.success) {
        throw new AuthenticationError(
          `SSO login failed for profile '${profileName}'`,
          "sso-login",
          profileName,
          new AwsCliError(
            "AWS CLI SSO login failed",
            `aws ${arguments_.join(" ")}`,
            result.exitCode,
            result.stdout,
            result.stderr,
          ),
        );
      }

      if (this.options.enableDebugLogging) {
        console.debug(`SSO login completed for profile: ${profileName}`);
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError(
        `Failed to login with SSO for profile '${profileName}'`,
        "sso-login",
        profileName,
        error,
      );
    }
  }

  /**
   * Perform SSO logout for a profile
   *
   * @param profileName - AWS profile name to logout from
   * @returns Promise resolving when logout is complete
   * @throws When SSO logout fails
   */
  async ssoLogout(profileName: string = "default"): Promise<void> {
    const arguments_ = ["sso", "logout"];

    if (profileName !== "default") {
      arguments_.push("--profile", profileName);
    }

    try {
      const result = await this.executeCommand(arguments_);

      if (!result.success) {
        throw new AuthenticationError(
          `SSO logout failed for profile '${profileName}'`,
          "sso-logout",
          profileName,
          new AwsCliError(
            "AWS CLI SSO logout failed",
            `aws ${arguments_.join(" ")}`,
            result.exitCode,
            result.stdout,
            result.stderr,
          ),
        );
      }

      if (this.options.enableDebugLogging) {
        console.debug(`SSO logout completed for profile: ${profileName}`);
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError(
        `Failed to logout from SSO for profile '${profileName}'`,
        "sso-logout",
        profileName,
        error,
      );
    }
  }

  /**
   * Validate credentials for a profile using STS GetCallerIdentity
   *
   * @param profileName - AWS profile name to validate
   * @returns Promise resolving to caller identity information
   * @throws When credential validation fails
   */
  async validateCredentials(profileName: string = "default"): Promise<{
    userId: string;
    account: string;
    arn: string;
  }> {
    const arguments_ = ["sts", "get-caller-identity", "--output", "json"];

    if (profileName !== "default") {
      arguments_.push("--profile", profileName);
    }

    try {
      const result = await this.executeCommand(arguments_);

      if (!result.success) {
        throw new AuthenticationError(
          `Credential validation failed for profile '${profileName}'`,
          "credential-validation",
          profileName,
          new AwsCliError(
            "AWS CLI credential validation failed",
            `aws ${arguments_.join(" ")}`,
            result.exitCode,
            result.stdout,
            result.stderr,
          ),
        );
      }

      try {
        const identity = JSON.parse(result.stdout) as {
          UserId: string;
          Account: string;
          Arn: string;
        };

        return {
          userId: identity.UserId,
          account: identity.Account,
          arn: identity.Arn,
        };
      } catch (parseError) {
        throw new AuthenticationError(
          `Failed to parse credential validation response for profile '${profileName}'`,
          "credential-validation",
          profileName,
          parseError,
        );
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError(
        `Failed to validate credentials for profile '${profileName}'`,
        "credential-validation",
        profileName,
        error,
      );
    }
  }

  /**
   * Execute AWS CLI command with standard I/O
   *
   * @param arguments_ - AWS CLI command arguments
   * @returns Promise resolving to command execution result
   * @internal
   */
  private async executeCommand(arguments_: string[]): Promise<CliExecutionResult> {
    return new Promise((resolve, reject) => {
      if (this.options.enableDebugLogging) {
        console.debug(
          `Executing AWS CLI command: ${this.options.awsCliPath} ${arguments_.join(" ")}`,
        );
      }

      const child = spawn(this.options.awsCliPath, arguments_, {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env },
        shell: platform() === "win32",
      });

      let stdout = "";
      let stderr = "";
      let timeoutId: NodeJS.Timeout | undefined;

      // Set up timeout
      if (this.options.timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          child.kill("SIGTERM");
          reject(
            new AwsCliError(
              `AWS CLI command timed out after ${this.options.timeoutMs}ms`,
              `aws ${arguments_.join(" ")}`,
              -1,
              stdout,
              stderr,
            ),
          );
        }, this.options.timeoutMs);
      }

      // Collect output
      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      // Handle process completion
      child.on("close", (code) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        const exitCode = code ?? -1;
        const result: CliExecutionResult = {
          exitCode,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          success: exitCode === 0,
        };

        if (this.options.enableDebugLogging) {
          console.debug(`AWS CLI command completed with exit code: ${exitCode}`);
        }

        resolve(result);
      });

      // Handle process errors
      child.on("error", (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        reject(
          new AwsCliError(
            `Failed to execute AWS CLI command: ${error.message}`,
            `aws ${arguments_.join(" ")}`,
            -1,
            stdout,
            stderr,
            { originalError: error },
          ),
        );
      });
    });
  }

  /**
   * Execute AWS CLI command with interactive I/O for user input
   *
   * @param arguments_ - AWS CLI command arguments
   * @param ssoConfig - Optional SSO configuration for automated input
   * @returns Promise resolving to command execution result
   * @internal
   */
  private async executeInteractiveCommand(
    arguments_: string[],
    ssoConfig?: SsoConfig,
  ): Promise<CliExecutionResult> {
    return new Promise((resolve, reject) => {
      if (this.options.enableDebugLogging) {
        console.debug(
          `Executing interactive AWS CLI command: ${this.options.awsCliPath} ${arguments_.join(" ")}`,
        );
      }

      const child = spawn(this.options.awsCliPath, arguments_, {
        stdio: ssoConfig ? ["pipe", "pipe", "pipe"] : ["inherit", "pipe", "pipe"],
        env: { ...process.env },
        shell: platform() === "win32",
      });

      let stdout = "";
      let stderr = "";
      let timeoutId: NodeJS.Timeout | undefined;

      // Set up timeout
      if (this.options.timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          child.kill("SIGTERM");
          reject(
            new AwsCliError(
              `Interactive AWS CLI command timed out after ${this.options.timeoutMs}ms`,
              `aws ${arguments_.join(" ")}`,
              -1,
              stdout,
              stderr,
            ),
          );
        }, this.options.timeoutMs);
      }

      // Handle automated SSO configuration input
      if (ssoConfig && child.stdin) {
        child.stdin.write(`${ssoConfig.ssoStartUrl}\n`);
        child.stdin.write(`${ssoConfig.ssoRegion}\n`);
        child.stdin.write(`${ssoConfig.ssoAccountId}\n`);
        child.stdin.write(`${ssoConfig.ssoRoleName}\n`);
        child.stdin.end();
      }

      // Collect output
      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      // Handle process completion
      child.on("close", (code) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        const exitCode = code ?? -1;
        const result: CliExecutionResult = {
          exitCode,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          success: exitCode === 0,
        };

        if (this.options.enableDebugLogging) {
          console.debug(`Interactive AWS CLI command completed with exit code: ${exitCode}`);
        }

        resolve(result);
      });

      // Handle process errors
      child.on("error", (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        reject(
          new AwsCliError(
            `Failed to execute interactive AWS CLI command: ${error.message}`,
            `aws ${arguments_.join(" ")}`,
            -1,
            stdout,
            stderr,
            { originalError: error },
          ),
        );
      });
    });
  }

  /**
   * Get the default AWS CLI executable path for the current platform
   *
   * @returns Default AWS CLI executable path
   * @internal
   */
  private getDefaultAwsCliPath(): string {
    return platform() === "win32" ? "aws.exe" : "aws";
  }
}
