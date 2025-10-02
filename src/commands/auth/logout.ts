/**
 * @module auth/logout
 * AWS authentication logout command
 *
 * Terminates AWS SSO sessions and clears cached credentials for
 * specified profiles or all profiles.
 *
 */

import { Flags } from "@oclif/core";
import { formatAuthError } from "../../lib/auth-errors.js";
import type { AuthLogout } from "../../lib/auth-schemas.js";
import { AuthService } from "../../services/auth-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * Auth logout command for AWS SSO session termination
 *
 * Performs AWS SSO logout and credential cache cleanup for
 * specified profiles or all configured SSO profiles.
 *
 * @public
 */
export default class AuthLogoutCommand extends BaseCommand {
  static override readonly description = "Logout from AWS SSO sessions";

  static override readonly examples = [
    {
      description: "Logout from the active AWS profile",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "Logout from a specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> --profile production",
    },
    {
      description: "Logout from all configured SSO profiles",
      command: "<%= config.bin %> <%= command.id %> --all-profiles",
    },
    {
      description: "Logout with verbose output for debugging",
      command: "<%= config.bin %> <%= command.id %> --profile development --verbose",
    },
    {
      description: "Force logout from all profiles with detailed output",
      command: "<%= config.bin %> <%= command.id %> --all-profiles --verbose",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "all-profiles": Flags.boolean({
      char: "a",
      description: "Logout from all configured SSO profiles",
      default: false,
    }),
  };

  /**
   * Execute the auth logout command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(AuthLogoutCommand);

    try {
      if (flags.profile && flags["all-profiles"]) {
        this.error("Cannot specify both --profile and --all-profiles", { exit: 1 });
      }

      const input: AuthLogout = {
        profile: flags.profile,
        allProfiles: flags["all-profiles"],
      };

      const authService = new AuthService({
        enableDebugLogging: flags.verbose,
        enableProgressIndicators: true,
      });

      await authService.logout(input);
    } catch (error) {
      this.error(formatAuthError(error, flags.verbose, "Logout failed"), { exit: 1 });
    }
  }
}
