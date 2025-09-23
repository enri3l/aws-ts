/**
 * AWS authentication status command
 *
 * Displays authentication status for AWS profiles including credential
 * validity, token expiry, and profile configuration details.
 *
 */

import { Command, Flags } from "@oclif/core";
import type { AuthStatus, AuthStatusResponse, ProfileInfo } from "../../lib/auth-schemas.js";
import { ApiError, formatErrorWithGuidance, TimeoutError } from "../../lib/errors.js";
import { safeDisplayTable } from "../../lib/ui-utilities.js";
import { AuthService } from "../../services/auth-service.js";
import { TokenManager } from "../../services/token-manager.js";

/**
 * Auth status command for checking authentication state
 *
 * Provides comprehensive authentication status including profile information,
 * credential validity, token expiry, and AWS CLI installation status.
 *
 * @public
 */
export default class AuthStatusCommand extends Command {
  static override readonly description = "Check AWS authentication status";

  static override readonly examples = [
    {
      description: "Check authentication status for the active profile",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "Check status for a specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> --profile production",
    },
    {
      description: "Show status for all configured AWS profiles",
      command: "<%= config.bin %> <%= command.id %> --all-profiles",
    },
    {
      description: "Display detailed authentication information",
      command: "<%= config.bin %> <%= command.id %> --detailed --profile staging",
    },
    {
      description: "Output status information in JSON format",
      command: "<%= config.bin %> <%= command.id %> --all-profiles --format json",
    },
    {
      description: "Verbose status check with debug information",
      command: "<%= config.bin %> <%= command.id %> --verbose --detailed",
    },
  ];

  static override readonly flags = {
    profile: Flags.string({
      char: "p",
      description: "AWS profile name to check status for",
      helpValue: "PROFILE_NAME",
    }),

    "all-profiles": Flags.boolean({
      char: "a",
      description: "Show status for all configured profiles",
      default: false,
    }),

    detailed: Flags.boolean({
      char: "d",
      description: "Show detailed status information",
      default: false,
    }),

    format: Flags.string({
      description: "Output format",
      options: ["table", "json"],
      default: "table",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output",
      default: false,
    }),
  };

  /**
   * Execute the auth status command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(AuthStatusCommand);

    try {
      const input: AuthStatus = {
        profile: flags.profile,
        detailed: flags.detailed,
        allProfiles: flags["all-profiles"],
      };

      const authService = new AuthService({
        enableDebugLogging: flags.verbose,
        enableProgressIndicators: true,
      });

      const status = await authService.getStatus(input);

      if (flags.format === "json") {
        this.log(JSON.stringify(status, undefined, 2));
        return;
      }

      this.displayStatusTable(status, flags.detailed);
    } catch (error) {
      this.handleAuthStatusError(error, flags.verbose);
    }
  }

  /**
   * Handle authentication status errors with appropriate error messages
   *
   * @param error - The error that occurred
   * @param verbose - Whether to include verbose error information
   * @private
   */
  private handleAuthStatusError(error: unknown, verbose: boolean): never {
    // Handle configuration and API errors with specific guidance
    if (error instanceof ApiError) {
      this.error(`Failed to get authentication status: AWS API error - ${error.message}`, {
        exit: 1,
      });
    } else if (error instanceof TimeoutError) {
      this.error(`Failed to get authentication status: Operation timed out - ${error.message}`, {
        exit: 1,
      });
    } else if (error instanceof Error) {
      this.error(
        `Failed to get authentication status: ${formatErrorWithGuidance(error, verbose)}`,
        { exit: 1 },
      );
    } else {
      this.error(`Failed to get authentication status: ${String(error)}`, { exit: 1 });
    }
  }

  /**
   * Display authentication status in table format
   *
   * @param status - Authentication status response
   * @param detailed - Whether to show detailed information
   * @internal
   */
  private displayStatusTable(status: AuthStatusResponse, detailed: boolean): void {
    this.log("=== AWS CLI Status ===");
    this.log(`Installed: ${status.awsCliInstalled ? "✓" : "✗"}`);
    if (status.awsCliVersion) {
      this.log(`Version: ${status.awsCliVersion}`);
    }
    this.log("");

    this.log("=== Authentication Status ===");
    this.log(`Overall Status: ${status.authenticated ? "✓ Authenticated" : "✗ Not Authenticated"}`);
    if (status.activeProfile) {
      this.log(`Active Profile: ${status.activeProfile}`);
    }
    this.log("");

    this.log("=== Profile Status ===");

    if (status.profiles.length === 0) {
      this.log("No profiles found");
      return;
    }

    const tableData = status.profiles.map((profile: ProfileInfo) => {
      const row: Record<string, string> = {
        Profile: profile.name,
        Type: profile.type,
        Active: profile.active ? "✓" : "",
        "Credentials Valid": profile.credentialsValid ? "✓" : "✗",
      };

      if (detailed) {
        row.Region = profile.region || "";
        row.Output = profile.output || "";

        if (profile.type === "sso") {
          row["SSO Start URL"] = profile.ssoStartUrl || "";
          if (profile.tokenExpiry) {
            const timeUntilExpiry = new Date(profile.tokenExpiry).getTime() - Date.now();
            row["Token Expiry"] =
              timeUntilExpiry > 0 ? TokenManager.formatTimeUntilExpiry(timeUntilExpiry) : "Expired";
          }
        }
      }

      return row;
    });

    // Display table
    safeDisplayTable(tableData);

    // Additional warnings for expired or near-expiry tokens
    const ssoProfiles = status.profiles.filter(
      (p: ProfileInfo) => p.type === "sso" && p.tokenExpiry,
    );
    const expiredProfiles = ssoProfiles.filter(
      (p: ProfileInfo) => p.tokenExpiry && new Date(p.tokenExpiry).getTime() <= Date.now(),
    );
    const nearExpiryProfiles = ssoProfiles.filter((p: ProfileInfo) => {
      if (!p.tokenExpiry) return false;
      const timeUntilExpiry = new Date(p.tokenExpiry).getTime() - Date.now();
      return timeUntilExpiry > 0 && timeUntilExpiry <= 900_000; // 15 minutes
    });

    if (expiredProfiles.length > 0) {
      this.log("");
      this.warn(`⚠ Expired tokens: ${expiredProfiles.map((p: ProfileInfo) => p.name).join(", ")}`);
      this.log("Run 'aws-ts auth login --profile <profile>' to refresh expired tokens");
    }

    if (nearExpiryProfiles.length > 0) {
      this.log("");
      this.warn(
        `⚠ Tokens expiring soon: ${nearExpiryProfiles.map((p: ProfileInfo) => p.name).join(", ")},`,
      );
      this.log("Consider refreshing these tokens soon");
    }
  }
}
