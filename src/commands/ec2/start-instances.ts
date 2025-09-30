/**
 * EC2 start instances command
 *
 * Starts stopped EC2 instances with optional wait for running state.
 *
 * @module ec2/start-instances
 */

import type { InstanceStateChange } from "@aws-sdk/client-ec2";
import { Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { formatEC2Error } from "../../lib/ec2-errors.js";
import {
  EC2StartInstancesInputSchema,
  type EC2StartInstancesInput,
} from "../../lib/ec2-schemas.js";
import { EC2Service } from "../../services/ec2-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * EC2 start instances command for starting stopped instances
 *
 * Starts one or more stopped EC2 instances with optional waiting for
 * instances to reach running state.
 *
 * @public
 */
export default class EC2StartInstancesCommand extends BaseCommand {
  static override readonly description = "Start stopped EC2 instances with optional wait";

  static override readonly examples = [
    {
      description: "Start a single instance",
      command: "<%= config.bin %> <%= command.id %> --instance-ids i-1234567890abcdef0",
    },
    {
      description: "Start multiple instances",
      command:
        "<%= config.bin %> <%= command.id %> --instance-ids i-1234567890abcdef0 i-0987654321fedcba0",
    },
    {
      description: "Start instances and wait for running state",
      command: "<%= config.bin %> <%= command.id %> --instance-ids i-1234567890abcdef0 --wait",
    },
    {
      description: "Start instances with JSON output",
      command:
        "<%= config.bin %> <%= command.id %> --instance-ids i-1234567890abcdef0 --format json",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "instance-ids": Flags.string({
      char: "i",
      description: "Instance IDs to start",
      required: true,
      multiple: true,
      helpValue: "INSTANCE_ID",
    }),

    wait: Flags.boolean({
      char: "w",
      description: "Wait for instances to reach running state (up to 5 minutes)",
      default: false,
    }),
  };

  /**
   * Execute the EC2 start instances command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(EC2StartInstancesCommand);

    try {
      const input: EC2StartInstancesInput = EC2StartInstancesInputSchema.parse({
        region: flags.region,
        profile: flags.profile,
        instanceIds: flags["instance-ids"],
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

      const results = await ec2Service.startInstances(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          instanceIds: input.instanceIds,
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
   * Format and display the start instances output
   *
   * @param results - Array of instance state changes
   * @param format - Output format to use
   * @internal
   */
  private formatAndDisplayOutput(results: InstanceStateChange[], format: string): void {
    if (results.length === 0) {
      this.log("No instances were started.");
      return;
    }

    switch (format) {
      case "table": {
        this.log(`Started ${results.length} instance(s):\n`);
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
