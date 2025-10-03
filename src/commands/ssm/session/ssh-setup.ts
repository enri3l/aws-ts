/**
 * @module ssm/session/ssh-setup
 * SSM SSH setup command
 *
 * Configures SSH client to use Session Manager as a proxy for EC2 instances.
 * Generates and updates ~/.ssh/config with ProxyCommand configuration.
 */

import { Flags } from "@oclif/core";
import { SshSetupInputSchema, type SshSetupInput } from "../../../lib/ssm/session-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import {
  backupSshConfig,
  generateProxyCommand,
  generateSshConfigBlock,
  hasSessionManagerConfig,
  readSshConfig,
  updateSshConfig,
} from "../../../services/ssm/ssh-config-manager.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM SSH setup command
 *
 * @public
 */
export default class SSMSessionSshSetupCommand extends BaseCommand {
  static override readonly description =
    "Configure SSH client to use Session Manager for EC2 instances";

  static override readonly examples = [
    {
      description: "Setup SSH config for Session Manager",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "Setup with specific user",
      command: "<%= config.bin %> <%= command.id %> --user ec2-user",
    },
    {
      description: "Setup with custom SSH key",
      command: "<%= config.bin %> <%= command.id %> --identity-file ~/.ssh/my-key.pem",
    },
    {
      description: "Setup for specific host pattern",
      command: "<%= config.bin %> <%= command.id %> --host-pattern 'i-*'",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "host-pattern": Flags.string({
      description: "Host pattern to match (default: i-* mi-*)",
      default: "i-* mi-*",
      helpValue: "PATTERN",
    }),

    user: Flags.string({
      char: "u",
      description: "Default SSH user for instances",
      helpValue: "USERNAME",
    }),

    "identity-file": Flags.string({
      char: "i",
      description: "Path to SSH private key",
      helpValue: "PATH",
    }),

    "config-path": Flags.string({
      char: "c",
      description: "Custom SSH config file path",
      helpValue: "PATH",
    }),

    force: Flags.boolean({
      char: "f",
      description: "Force update even if configuration exists",
      default: false,
    }),
  };

  /**
   * Execute the SSM SSH setup command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(SSMSessionSshSetupCommand);

    try {
      const input: SshSetupInput = SshSetupInputSchema.parse({
        hostPattern: flags["host-pattern"],
        user: flags.user,
        identityFile: flags["identity-file"],
        configPath: flags["config-path"],
        region: flags.region,
        profile: flags.profile,
        verbose: flags.verbose,
      });

      // Check if configuration already exists
      const existingConfig = await readSshConfig(input.configPath);
      const configExists = hasSessionManagerConfig(existingConfig, input.hostPattern);

      if (configExists && !flags.force) {
        this.log(`SSH configuration for host pattern "${input.hostPattern}" already exists.`);
        this.log("Use --force to overwrite existing configuration.");
        return;
      }

      // Generate ProxyCommand
      const proxyCommand = generateProxyCommand(input.profile, input.region);

      // Generate SSH config entry
      const configEntry = {
        hostPattern: input.hostPattern,
        proxyCommand,
        ...(input.user && { user: input.user }),
        ...(input.identityFile && { identityFile: input.identityFile }),
        ...(input.profile && { profile: input.profile }),
        ...(input.region && { region: input.region }),
      };

      const configBlock = generateSshConfigBlock(configEntry);

      // Backup existing config if needed
      if (existingConfig) {
        const backupPath = await backupSshConfig(input.configPath);
        this.log(`Created backup at: ${backupPath}`);
      }

      // Update SSH config
      if (configExists && flags.force) {
        this.warn("Force mode enabled - manual update required");
        this.log("\nAdd this configuration block to your SSH config:");
        this.log(`\n${configBlock}`);
        this.log(`\nSSH config location: ${input.configPath || "~/.ssh/config"}`);
      } else {
        const updateConfigEntry = {
          hostPattern: input.hostPattern,
          proxyCommand,
          ...(input.user && { user: input.user }),
          ...(input.identityFile && { identityFile: input.identityFile }),
          ...(input.profile && { profile: input.profile }),
          ...(input.region && { region: input.region }),
        };
        await updateSshConfig(updateConfigEntry, input.configPath);
        this.log("\nSSH configuration updated successfully!");
        this.log("\nGenerated configuration:");
        this.log(`\n${configBlock}`);
        this.log("\nYou can now SSH to instances using:");
        this.log(`  ssh <instance-id>`);
        this.log("\nExample:");
        this.log(`  ssh i-1234567890abcdef0`);
      }
    } catch (error) {
      const formattedError = formatSSMError(error, flags.verbose, "ssm:session:ssh-setup");
      this.error(formattedError, { exit: 1 });
    }
  }
}
