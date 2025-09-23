/**
 * AWS authentication profiles command
 *
 * Lists all available AWS profiles with their configuration details,
 * authentication status, and token expiry information.
 *
 */

import type { Interfaces } from "@oclif/core";
import { Command, Flags } from "@oclif/core";
import type { AuthProfiles, ProfileInfo } from "../../lib/auth-schemas.js";
import { safeDisplayTable } from "../../lib/ui-utilities.js";
import { AuthService } from "../../services/auth-service.js";
import { TokenManager } from "../../services/token-manager.js";

/**
 * Type for AuthProfilesCommand flags
 * @internal
 */
type ProfileCommandFlags = Interfaces.InferredFlags<typeof AuthProfilesCommand.flags>;

/**
 * Extended profile information for display purposes
 *
 * @internal
 */
interface DisplayProfileInfo extends ProfileInfo {
  /**
   * Token expiry time for SSO profiles
   */
  tokenExpiry?: Date | undefined;
}

/**
 * Auth profiles command for listing AWS profiles
 *
 * Provides comprehensive profile listing with authentication status,
 * configuration details, and token expiry information.
 *
 * @public
 */
export default class AuthProfilesCommand extends Command {
  static override readonly description = "List all available AWS profiles";

  static override readonly examples = [
    {
      description: "List all available AWS profiles",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "Show detailed information for all profiles",
      command: "<%= config.bin %> <%= command.id %> --detailed",
    },
    {
      description: "List only currently active profiles",
      command: "<%= config.bin %> <%= command.id %> --active-only",
    },
    {
      description: "Export profile information as JSON",
      command: "<%= config.bin %> <%= command.id %> --format json --detailed",
    },
    {
      description: "Save profile information to CSV file",
      command: "<%= config.bin %> <%= command.id %> --format csv --output profiles.csv",
    },
    {
      description: "Show verbose profile information with debug details",
      command: "<%= config.bin %> <%= command.id %> --detailed --verbose",
    },
  ];

  static override readonly flags = {
    detailed: Flags.boolean({
      char: "d",
      description: "Show detailed profile information",
      default: false,
    }),

    "active-only": Flags.boolean({
      char: "a",
      description: "Show only profiles with valid credentials",
      default: false,
    }),

    format: Flags.string({
      char: "f",
      description: "Output format",
      options: ["table", "json", "csv"],
      default: "table",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output",
      default: false,
    }),
  };

  /**
   * Execute the auth profiles command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When profile listing fails or configuration errors occur
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(AuthProfilesCommand);

    try {
      const profiles = await this.getProfiles(flags);
      this.displayProfiles(profiles, flags);
    } catch (error) {
      this.handleProfilesError(error, flags);
    }
  }

  /**
   * Get AWS profiles based on command flags
   *
   * @param flags - Command flags
   * @returns Array of profiles
   * @private
   */
  private async getProfiles(flags: ProfileCommandFlags): Promise<DisplayProfileInfo[]> {
    const input: AuthProfiles = {
      detailed: flags.detailed,
      activeOnly: flags["active-only"],
      format: flags.format as "table" | "json" | "csv",
    };

    const authService = new AuthService({
      enableDebugLogging: flags.verbose,
      enableProgressIndicators: true,
    });

    return await authService.listProfiles(input);
  }

  /**
   * Display profiles in the requested format
   *
   * @param profiles - Profiles to display
   * @param flags - Command flags
   * @private
   */
  private displayProfiles(profiles: DisplayProfileInfo[], flags: ProfileCommandFlags): void {
    if (profiles.length === 0) {
      this.displayNoProfilesMessage(flags.format);
      return;
    }

    switch (flags.format) {
      case "json": {
        this.log(JSON.stringify(profiles, undefined, 2));
        break;
      }
      case "csv": {
        this.displayProfilesCsv(profiles, flags.detailed);
        break;
      }
      default: {
        this.displayProfilesTable(profiles, flags.detailed);
        break;
      }
    }
  }

  /**
   * Display message when no profiles are found
   *
   * @param format - Output format
   * @private
   */
  private displayNoProfilesMessage(format: string): void {
    if (format === "json") {
      this.log("[]");
      return;
    }
    this.log("No AWS profiles found");
    this.log("");
    this.log("To configure a new profile, run:");
    this.log("  aws-ts auth login --sso");
  }

  /**
   * Handle profile listing errors with appropriate output format
   *
   * @param error - The error that occurred
   * @param flags - Command flags
   * @throws Re-throws the provided error after logging in JSON format when not in JSON mode
   * @private
   */
  private handleProfilesError(error: unknown, flags: ProfileCommandFlags): never {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (flags.format === "json") {
      const errorObject = {
        error: "Failed to list profiles",
        message: errorMessage,
        profiles: [],
      };
      this.log(JSON.stringify(errorObject, undefined, 2));
      this.exit(1);
    }

    // For table format, use OCLIF error method with wrapped message
    const wrappedMessage = `Failed to list profiles: ${errorMessage}`;
    this.error(wrappedMessage, { exit: 1 });
  }

  /**
   * Display profiles in table format
   *
   * @param profiles - Array of profile information
   * @param detailed - Whether to show detailed information
   * @internal
   */
  private displayProfilesTable(profiles: DisplayProfileInfo[], detailed: boolean): void {
    this.log(`=== AWS Profiles (${profiles.length} found) ===`);
    this.log("");

    const tableData = profiles.map((profile: DisplayProfileInfo) => {
      const row: Record<string, string> = {
        Profile: profile.name,
        Type: profile.type,
        Active: profile.active ? "✓" : "",
        Valid: profile.credentialsValid ? "✓" : "✗",
      };

      if (detailed) {
        row.Region = profile.region || "";
        row.Output = profile.output || "";

        if (profile.type === "sso") {
          row["SSO Start URL"] = profile.ssoStartUrl || "";
          row["SSO Region"] = profile.ssoRegion || "";
          row["SSO Account"] = profile.ssoAccountId || "";
          row["SSO Role"] = profile.ssoRoleName || "";

          if (profile.tokenExpiry) {
            const timeUntilExpiry = new Date(profile.tokenExpiry).getTime() - Date.now();
            row["Token Status"] =
              timeUntilExpiry > 0
                ? `Expires in ${TokenManager.formatTimeUntilExpiry(timeUntilExpiry)}`
                : "Expired";
          } else {
            row["Token Status"] = "No token";
          }
        }
      }

      return row;
    });

    safeDisplayTable(tableData);

    const activeProfiles = profiles.filter((p) => p.active);
    const validProfiles = profiles.filter((p) => p.credentialsValid);
    const ssoProfiles = profiles.filter((p) => p.type === "sso");

    this.log("");
    this.log("=== Summary ===");
    this.log(`Total profiles: ${profiles.length}`);
    this.log(`Active profiles: ${activeProfiles.length}`);
    this.log(`Profiles with valid credentials: ${validProfiles.length}`);
    this.log(`SSO profiles: ${ssoProfiles.length}`);

    const expiredProfiles = profiles.filter(
      (p: DisplayProfileInfo) => p.tokenExpiry && new Date(p.tokenExpiry).getTime() <= Date.now(),
    );
    const nearExpiryProfiles = profiles.filter((p: DisplayProfileInfo) => {
      if (!p.tokenExpiry) return false;
      const timeUntilExpiry = new Date(p.tokenExpiry).getTime() - Date.now();
      return timeUntilExpiry > 0 && timeUntilExpiry <= 900_000; // 15 minutes
    });

    if (expiredProfiles.length > 0) {
      this.log("");
      this.warn(
        `⚠ Profiles with expired tokens: ${expiredProfiles.map((p: DisplayProfileInfo) => p.name).join(", ")}`,
      );
    }

    if (nearExpiryProfiles.length > 0) {
      this.log("");
      this.warn(
        `⚠ Profiles with tokens expiring soon: ${nearExpiryProfiles.map((p: DisplayProfileInfo) => p.name).join(", ")},`,
      );
    }
  }

  /**
   * Display profiles in CSV format
   *
   * @param profiles - Array of profile information
   * @param detailed - Whether to show detailed information
   * @internal
   */
  private displayProfilesCsv(profiles: DisplayProfileInfo[], detailed: boolean): void {
    const headers = ["Profile", "Type", "Active", "Valid"];

    if (detailed) {
      headers.push(
        "Region",
        "Output",
        "SSO Start URL",
        "SSO Region",
        "SSO Account",
        "SSO Role",
        "Token Status",
      );
    }

    this.log(headers.join(","));

    for (const profile of profiles) {
      const row = this.buildCsvRow(profile, detailed);
      const escapedRow = this.escapeCsvValues(row);
      this.log(escapedRow.join(","));
    }
  }

  /**
   * Build CSV row for a profile
   *
   * @param profile - Profile information
   * @param detailed - Whether to include detailed information
   * @returns CSV row array
   * @internal
   */
  private buildCsvRow(profile: DisplayProfileInfo, detailed: boolean): string[] {
    const row = [
      profile.name,
      profile.type,
      profile.active ? "true" : "false",
      profile.credentialsValid ? "true" : "false",
    ];

    if (detailed) {
      row.push(profile.region || "", profile.output || "");
      this.addDetailedCsvFields(row, profile);
    }

    return row;
  }

  /**
   * Add detailed fields to CSV row
   *
   * @param row - CSV row to extend
   * @param profile - Profile information
   * @internal
   */
  private addDetailedCsvFields(row: string[], profile: DisplayProfileInfo): void {
    if (profile.type === "sso") {
      row.push(
        profile.ssoStartUrl || "",
        profile.ssoRegion || "",
        profile.ssoAccountId || "",
        profile.ssoRoleName || "",
      );

      if (profile.tokenExpiry) {
        const timeUntilExpiry = new Date(profile.tokenExpiry).getTime() - Date.now();
        row.push(
          timeUntilExpiry > 0
            ? `Expires in ${TokenManager.formatTimeUntilExpiry(timeUntilExpiry)}`
            : "Expired",
        );
      } else {
        row.push("No token");
      }
    } else {
      row.push("", "", "", "", "");
    }
  }

  /**
   * Escape CSV values that contain commas
   *
   * @param row - CSV row values
   * @returns Escaped CSV values
   * @internal
   */
  private escapeCsvValues(row: string[]): string[] {
    return row.map((value) => (value.includes(",") ? `"${value.replaceAll('"', '""')}"` : value));
  }
}
