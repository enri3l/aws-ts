/**
 * AWS authentication login command
 *
 * Provides interactive SSO authentication for AWS profiles with optional
 * profile configuration and credential validation.
 *
 */

import { Command, Flags } from "@oclif/core";
import { AuthenticationError } from "../../lib/auth-errors.js";
import { validateSsoConfig, type AuthLogin, type SsoConfig } from "../../lib/auth-schemas.js";
import { formatError } from "../../lib/errors.js";
import { AuthService } from "../../services/auth-service.js";

/**
 * Auth login command for AWS SSO authentication
 *
 * Performs AWS SSO login with optional profile configuration and
 * credential validation. Supports both interactive and automated setup.
 *
 * @public
 */
export default class AuthLoginCommand extends Command {
  static override readonly description = "Authenticate with AWS using SSO";

  static override readonly examples = [
    {
      description: "Login with the default AWS profile",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "Login with a specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> --profile production",
    },
    {
      description: "Configure a new SSO profile and login",
      command:
        "<%= config.bin %> <%= command.id %> --configure --sso-start-url https://company.awsapps.com/start --sso-region us-east-1 --sso-account-id 123456789012 --sso-role-name AdministratorAccess",
    },
    {
      description: "Force re-authentication for an existing profile",
      command: "<%= config.bin %> <%= command.id %> --force --profile development",
    },
    {
      description: "Setup a new development profile with SSO",
      command:
        "<%= config.bin %> <%= command.id %> --profile dev --configure --sso-start-url https://dev-portal.awsapps.com/start --sso-region us-west-2 --sso-account-id 987654321098 --sso-role-name PowerUserAccess",
    },
  ];

  static override readonly flags = {
    profile: Flags.string({
      char: "p",
      description: "AWS profile name to authenticate with",
      helpValue: "PROFILE_NAME",
    }),

    force: Flags.boolean({
      char: "f",
      description: "Force re-authentication even if already logged in",
      default: false,
    }),

    configure: Flags.boolean({
      char: "c",
      description: "Configure a new SSO profile interactively",
      default: false,
    }),

    "sso-start-url": Flags.url({
      description: "SSO start URL for profile configuration",
      helpValue: "https://my-org.awsapps.com/start",
      dependsOn: ["configure"],
    }),

    "sso-region": Flags.string({
      description: "SSO region for profile configuration",
      helpValue: "us-east-1",
      dependsOn: ["configure"],
    }),

    "sso-account-id": Flags.string({
      description: "SSO account ID for profile configuration",
      helpValue: "123456789012",
      dependsOn: ["configure"],
      // eslint-disable-next-line @typescript-eslint/require-await
      parse: async (input: string): Promise<string> => {
        if (!/^\d{12}$/.test(input)) {
          throw new Error("SSO account ID must be a 12-digit number");
        }
        return input;
      },
    }),

    "sso-role-name": Flags.string({
      description: "SSO role name for profile configuration",
      helpValue: "AdministratorAccess",
      dependsOn: ["configure"],
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output",
      default: false,
    }),
  };

  /**
   * Execute the auth login command
   *
   * @returns Promise resolving when command execution is complete
   * @throws {@link AuthenticationError} When authentication fails
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(AuthLoginCommand);

    try {
      // Build SSO configuration if provided
      let ssoConfig: SsoConfig | undefined;
      if (flags.configure) {
        if (
          !flags["sso-start-url"] ||
          !flags["sso-region"] ||
          !flags["sso-account-id"] ||
          !flags["sso-role-name"]
        ) {
          throw new AuthenticationError(
            "SSO configuration requires --sso-start-url, --sso-region, --sso-account-id, and --sso-role-name flags",
            "sso-configure",
            flags.profile,
          );
        }

        ssoConfig = validateSsoConfig({
          ssoStartUrl: flags["sso-start-url"].toString(),
          ssoRegion: flags["sso-region"],
          ssoAccountId: flags["sso-account-id"],
          ssoRoleName: flags["sso-role-name"],
        });
      }

      // Build auth login input
      const input: AuthLogin = {
        profile: flags.profile,
        force: flags.force,
        configure: flags.configure,
        ssoConfig,
      };

      // Create auth service and perform login
      const authService = new AuthService({
        enableDebugLogging: flags.verbose,
        enableProgressIndicators: true,
      });

      await authService.login(input);

      // Success message is handled by the spinner in AuthService
    } catch (error) {
      if (error instanceof AuthenticationError) {
        this.error(formatError(error, flags.verbose), { exit: 1 });
      }

      if (error instanceof Error) {
        this.error(`Authentication failed: ${error.message}`, { exit: 1 });
      }

      this.error(`Authentication failed: ${String(error)}`, { exit: 1 });
    }
  }
}
