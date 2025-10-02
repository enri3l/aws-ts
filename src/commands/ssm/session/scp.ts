/**
 * @module ssm/session/scp
 * SSM SCP command
 *
 * Securely copy files to/from instances through Session Manager
 * without requiring open inbound ports.
 */

import { Args, Flags } from "@oclif/core";
import { execa } from "execa";
import { ScpInputSchema, type ScpInput } from "../../../lib/ssm/session-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM SCP command
 *
 * @public
 */
export default class SSMSessionScpCommand extends BaseCommand {
  static override readonly description =
    "Securely copy files to/from instances through Session Manager";

  static override readonly examples = [
    {
      description: "Copy file to instance",
      command: "<%= config.bin %> <%= command.id %> ./local-file.txt i-1234567890abcdef0:/tmp/",
    },
    {
      description: "Copy file from instance",
      command: "<%= config.bin %> <%= command.id %> i-1234567890abcdef0:/tmp/file.txt ./local/",
    },
    {
      description: "Copy directory recursively",
      command:
        "<%= config.bin %> <%= command.id %> ./local-dir i-1234567890abcdef0:/tmp/ --recursive",
    },
  ];

  static override readonly args = {
    source: Args.string({
      description: "Source path (local or remote in format instance-id:path)",
      required: true,
    }),
    destination: Args.string({
      description: "Destination path (local or remote in format instance-id:path)",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    recursive: Flags.boolean({
      char: "r",
      description: "Recursively copy directories",
      default: false,
    }),
  };

  /**
   * Execute the SSM SCP command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SSMSessionScpCommand);

    try {
      const input: ScpInput = ScpInputSchema.parse({
        source: args.source,
        destination: args.destination,
        recursive: flags.recursive,
        region: flags.region,
        profile: flags.profile,
        verbose: flags.verbose,
      });

      // Build SSH proxy command for Session Manager
      const region = input.region || process.env["AWS_REGION"] || "us-east-1";
      const profile = input.profile || process.env["AWS_PROFILE"] || "default";

      const proxyCommand = `sh -c "aws ssm start-session --target %h --document-name AWS-StartSSHSession --region ${region} --profile ${profile}"`;

      const scpArguments = [
        "-o",
        `ProxyCommand=${proxyCommand}`,
        "-o",
        "StrictHostKeyChecking=no",
        "-o",
        "UserKnownHostsFile=/dev/null",
      ];

      if (input.recursive) {
        scpArguments.push("-r");
      }

      if (input.verbose) {
        scpArguments.push("-v");
      }

      scpArguments.push(input.source, input.destination);

      this.log(`Copying ${input.source} to ${input.destination} via Session Manager...`);
      this.log(`Command: scp ${scpArguments.join(" ")}\n`);

      // Execute SCP command
      const result = await execa("scp", scpArguments, {
        stdio: "inherit",
      });

      if (result.exitCode === 0) {
        this.log("\nFile transfer completed successfully!");
      }
    } catch (error) {
      const formattedError = formatSSMError(error, flags.verbose, "ssm:session:scp");
      this.error(formattedError, { exit: 1 });
    }
  }
}
