/**
 * EC2 stop instances command
 *
 * Stops running EC2 instances with optional force and wait options.
 *
 * @module ec2/stop-instances
 */

import type { InstanceStateChange } from "@aws-sdk/client-ec2";
import { Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { formatEC2Error } from "../../lib/ec2-errors.js";
import { EC2StopInstancesInputSchema, type EC2StopInstancesInput } from "../../lib/ec2-schemas.js";
import { EC2Service } from "../../services/ec2-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * EC2 stop instances command for stopping running instances
 *
 * Stops one or more running EC2 instances with optional force stop
 * and waiting for instances to reach stopped state.
 *
 * @public
 */
export default class EC2StopInstancesCommand extends BaseCommand {
  static override readonly description = "Stop running EC2 instances with optional force and wait";

  static override readonly examples = [
    {
      description: "Stop a single instance",
      command: "<%= config.bin %> <%= command.id %> --instance-ids i-1234567890abcdef0",
    },
    {
      description: "Stop multiple instances",
      command:
        "<%= config.bin %> <%= command.id %> --instance-ids i-1234567890abcdef0 i-0987654321fedcba0",
    },
    {
      description: "Force stop an instance",
      command: "<%= config.bin %> <%= command.id %> --instance-ids i-1234567890abcdef0 --force",
    },
    {
      description: "Stop instances and wait for stopped state",
      command: "<%= config.bin %> <%= command.id %> --instance-ids i-1234567890abcdef0 --wait",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "instance-ids": Flags.string({
      char: "i",
      description: "Instance IDs to stop",
      required: true,
      multiple: true,
      helpValue: "INSTANCE_ID",
    }),

    force: Flags.boolean({
      description: "Force stop the instances (equivalent to pulling power plug)",
      default: false,
    }),

    wait: Flags.boolean({
      char: "w",
      description: "Wait for instances to reach stopped state (up to 5 minutes)",
      default: false,
    }),
  };

  /**
   * Execute the EC2 stop instances command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(EC2StopInstancesCommand);

    try {
      const input: EC2StopInstancesInput = EC2StopInstancesInputSchema.parse({
        region: flags.region,
        profile: flags.profile,
        instanceIds: flags["instance-ids"],
        force: flags.force,
        wait: flags.wait,
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

      const results = await ec2Service.stopInstances(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          instanceIds: input.instanceIds,
          force: input.force,
          wait: input.wait,
        },
      );

      this.formatAndDisplayOutput(results, input.format);
    } catch (error) {
      const formattedError = formatEC2Error(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the stop instances output
   *
   * @param results - Array of instance state changes
   * @param format - Output format to use
   * @throws Error if unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(results: InstanceStateChange[], format: string): void {
    if (results.length === 0) {
      this.log("No instances were stopped.");
      return;
    }

    switch (format) {
      case "table": {
        this.log(`Stopped ${results.length} instance(s):\n`);
        const tableData = results.map((result, index) => ({
          "#": index + 1,
          "Instance ID": result.InstanceId ?? "N/A",
          "Previous State": result.PreviousState?.Name ?? "N/A",
          "Current State": result.CurrentState?.Name ?? "N/A",
        }));

        const processor = new DataProcessor({ format: DataFormat.CSV });
        const output = processor.formatOutput(
          tableData.map((item, index) => ({ data: item, index })),
        );
        this.log(output);
        break;
      }

      case "json":
      case "jsonl": {
        const processorFormat = format === "json" ? DataFormat.JSON : DataFormat.JSONL;
        const processor = new DataProcessor({ format: processorFormat });
        const output = processor.formatOutput(
          results.map((result, index) => ({ data: result as Record<string, unknown>, index })),
        );
        this.log(output);
        break;
      }

      case "csv": {
        const flattenedData = results.map((result) => ({
          InstanceId: result.InstanceId ?? "",
          PreviousState: result.PreviousState?.Name ?? "",
          CurrentState: result.CurrentState?.Name ?? "",
        }));

        const processor = new DataProcessor({ format: DataFormat.CSV });
        const output = processor.formatOutput(
          flattenedData.map((item, index) => ({ data: item, index })),
        );
        this.log(output);
        break;
      }

      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }
}
