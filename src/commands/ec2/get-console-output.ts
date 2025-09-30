/**
 * EC2 get console output command
 *
 * Retrieves instance console output for debugging and troubleshooting.
 *
 * @module ec2/get-console-output
 */

import { Flags } from "@oclif/core";
import { formatEC2Error } from "../../lib/ec2-errors.js";
import {
  EC2GetConsoleOutputInputSchema,
  type EC2GetConsoleOutputInput,
} from "../../lib/ec2-schemas.js";
import { EC2Service } from "../../services/ec2-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * EC2 get console output command for retrieving instance console logs
 *
 * Provides access to instance console output for debugging boot issues,
 * system logs, and application startup problems.
 *
 * @public
 */
export default class EC2GetConsoleOutputCommand extends BaseCommand {
  static override readonly description =
    "Retrieve instance console output for debugging and troubleshooting";

  static override readonly examples = [
    {
      description: "Get console output for an instance",
      command: "<%= config.bin %> <%= command.id %> --instance-id i-1234567890abcdef0",
    },
    {
      description: "Get only the latest console output",
      command: "<%= config.bin %> <%= command.id %> --instance-id i-1234567890abcdef0 --latest",
    },
    {
      description: "Get console output with JSON format",
      command:
        "<%= config.bin %> <%= command.id %> --instance-id i-1234567890abcdef0 --format json",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "instance-id": Flags.string({
      char: "i",
      description: "Instance ID to get console output from",
      required: true,
      helpValue: "INSTANCE_ID",
    }),

    latest: Flags.boolean({
      description: "Get only the latest console output (most recent 64 KB)",
      default: false,
    }),
  };

  /**
   * Execute the EC2 get console output command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(EC2GetConsoleOutputCommand);

    try {
      const input: EC2GetConsoleOutputInput = EC2GetConsoleOutputInputSchema.parse({
        region: flags.region,
        profile: flags.profile,
        instanceId: flags["instance-id"],
        latest: flags.latest,
        format: flags.format,
        verbose: flags.verbose,
      });

      const ec2Service = new EC2Service({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      const output = await ec2Service.getConsoleOutput(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          instanceId: input.instanceId,
          latest: input.latest,
        },
      );

      this.formatAndDisplayOutput(output, input.format);
    } catch (error) {
      const formattedError = formatEC2Error(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the console output
   *
   * @param output - Console output response
   * @param format - Output format to use
   * @internal
   */
  private formatAndDisplayOutput(
    output: {
      InstanceId?: string | undefined;
      Output?: string | undefined;
      Timestamp?: Date | undefined;
    },
    format: string,
  ): void {
    if (format === "json") {
      this.log(JSON.stringify(output, undefined, 2));
      return;
    }

    // For table format, display the console output directly
    if (output.Output) {
      const decoded = Buffer.from(output.Output, "base64").toString("utf8");
      this.log(
        `Console Output for Instance ${output.InstanceId} (${output.Timestamp?.toISOString() ?? "unknown time"}):\n`,
      );
      this.log(decoded);
    } else {
      this.log("No console output available for this instance.");
    }
  }
}
