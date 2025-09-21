/**
 * AWS authentication profile switch command
 *
 * Switches the active AWS profile with optional credential validation
 * and environment variable configuration.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { AuthenticationError, ProfileError } from "../../lib/auth-errors.js";
import type { AuthSwitch } from "../../lib/auth-schemas.js";
import { formatError } from "../../lib/errors.js";
import { AuthService } from "../../services/auth-service.js";

/**
 * Auth switch command for AWS profile switching
 *
 * Provides seamless profile switching with credential validation
 * and optional environment variable configuration.
 *
 * @public
 */
export default class AuthSwitchCommand extends Command {
  static override readonly description = "Switch to a different AWS profile";

  static override readonly examples = [
    {
      description: "Switch to a production profile",
      command: "<%= config.bin %> <%= command.id %> production",
    },
    {
      description: "Switch to development profile without credential validation",
      command: "<%= config.bin %> <%= command.id %> development --no-validate",
    },
    {
      description: "Switch to staging profile and set as session default",
      command: "<%= config.bin %> <%= command.id %> staging --set-default",
    },
    {
      description: "Quick switch to testing profile with verbose output",
      command: "<%= config.bin %> <%= command.id %> testing --verbose",
    },
    {
      description: "Switch to admin profile with full validation",
      command: "<%= config.bin %> <%= command.id %> admin-profile --validate",
    },
  ];

  static override readonly args = {
    profile: Args.string({
      description: "AWS profile name to switch to",
      required: true,
    }),
  };

  static override readonly flags = {
    "no-validate": Flags.boolean({
      description: "Skip credential validation after switching",
      default: false,
    }),

    "set-default": Flags.boolean({
      description: "Set as default profile for the session",
      default: false,
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output",
      default: false,
    }),
  };

  /**
   * Execute the auth switch command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(AuthSwitchCommand);

    try {
      // Build auth switch input
      const input: AuthSwitch = {
        profile: args.profile,
        validate: !flags["no-validate"],
        setDefault: flags["set-default"],
      };

      // Create auth service and switch profile
      const authService = new AuthService({
        enableDebugLogging: flags.verbose,
        enableProgressIndicators: true,
      });

      await authService.switchProfile(input);

      // Additional information for the user
      if (flags.verbose) {
        this.log("");
        this.log("Profile switch complete. Environment variables updated:");
        this.log(`  AWS_PROFILE=${args.profile}`);

        if (flags["set-default"]) {
          this.log("Profile set as session default");
        }

        if (flags["no-validate"]) {
          this.log("");
          this.warn(
            "Credential validation skipped. Run 'aws-ts auth status' to check authentication status.",
          );
        }
      }
    } catch (error) {
      if (error instanceof ProfileError) {
        this.error(formatError(error, flags.verbose), { exit: 1 });
      }

      if (error instanceof AuthenticationError) {
        this.error(formatError(error, flags.verbose), { exit: 1 });
      }

      if (error instanceof Error) {
        this.error(`Profile switch failed: ${formatError(error, flags.verbose)}`, { exit: 1 });
      }

      this.error(`Profile switch failed: ${String(error)}`, { exit: 1 });
    }
  }
}
