/**
 * @module ssm/session/ssh
 * SSM SSH command
 *
 * Establishes SSH connection through Session Manager without requiring
 * open inbound ports or bastion hosts.
 */

import { Args, Flags } from "@oclif/core";
import { execa } from "execa";
import {
  SshConnectionInputSchema,
  type SshConnectionInput,
} from "../../../lib/ssm/session-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import { getDefaultSshKeyPath, validateSshKey } from "../../../services/ssm/ssh-config-manager.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM SSH command
 *
 * @public
 */
export default class SSMSessionSshCommand extends BaseCommand {
  static override readonly description = "Connect to an instance via SSH through Session Manager";

  static override readonly examples = [
    {
      description: "SSH to instance with default user",
      command: "<%= config.bin %> <%= command.id %> i-1234567890abcdef0",
    },
    {
      description: "SSH with specific user",
      command: "<%= config.bin %> <%= command.id %> i-1234567890abcdef0 --user ec2-user",
    },
    {
      description: "SSH with custom key",
      command:
        "<%= config.bin %> <%= command.id %> i-1234567890abcdef0 --key-path ~/.ssh/my-key.pem",
    },
  ];

  static override readonly args = {
    instanceId: Args.string({
      description: "EC2 instance ID or managed instance ID",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    user: Flags.string({
      char: "u",
      description: "SSH username (default: ec2-user)",
      default: "ec2-user",
      helpValue: "USERNAME",
    }),

    "key-path": Flags.string({
      char: "k",
      description: "Path to SSH private key",
      helpValue: "PATH",
    }),
  };

  /**
   * Execute the SSM SSH command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SSMSessionSshCommand);

    try {
      const input: SshConnectionInput = SshConnectionInputSchema.parse({
        instanceId: args.instanceId,
        username: flags.user,
        keyPath: flags["key-path"],
        region: flags.region,
        profile: flags.profile,
        verbose: flags.verbose,
      });

      // Validate SSH key if provided
      const keyPath = input.keyPath || getDefaultSshKeyPath();
      try {
        await validateSshKey(keyPath);
      } catch (error) {
        this.warn(
          `SSH key validation warning: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.log("Continuing without key validation...");
      }

      // Build SSH command with Session Manager proxy
      const region = input.region || process.env["AWS_REGION"] || "us-east-1";
      const profile = input.profile || process.env["AWS_PROFILE"] || "default";

      // ProxyCommand for Session Manager
      const proxyCommand = `sh -c "aws ssm start-session --target %h --document-name AWS-StartSSHSession --region ${region} --profile ${profile}"`;

      const sshArguments = [
        input.instanceId,
        "-o",
        `ProxyCommand=${proxyCommand}`,
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
      ];

      if (input.username) {
        sshArguments.unshift("-l", input.username);
      }

      if (keyPath) {
        sshArguments.unshift("-i", keyPath);
      }

      if (input.verbose) {
        sshArguments.push("-v");
      }

      this.log(`Connecting to ${input.instanceId} via Session Manager...`);
      this.log(`Command: ssh ${sshArguments.join(" ")}\n`);

      // Execute SSH command with stdio inheritance for interactive session
      await execa("ssh", sshArguments, {
        stdio: "inherit",
      });
    } catch (error) {
      const formattedError = formatSSMError(error, flags.verbose, "ssm:session:ssh");
      this.error(formattedError, { exit: 1 });
    }
  }
}
