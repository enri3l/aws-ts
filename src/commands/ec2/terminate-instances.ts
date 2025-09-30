/**
 * EC2 terminate instances command
 *
 * Terminates EC2 instances with optional wait for terminated state.
 *
 * @module ec2/terminate-instances
 */

import type { InstanceStateChange } from "@aws-sdk/client-ec2";
import { Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { formatEC2Error } from "../../lib/ec2-errors.js";
import {
  EC2TerminateInstancesInputSchema,
  type EC2TerminateInstancesInput,
} from "../../lib/ec2-schemas.js";
import { EC2Service } from "../../services/ec2-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * EC2 terminate instances command for terminating instances
 *
 * Terminates one or more EC2 instances with optional waiting for
 * instances to reach terminated state. This is an irreversible operation.
 *
 * @public
 */
export default class EC2TerminateInstancesCommand extends BaseCommand {
  static override readonly description =
    "Terminate EC2 instances with optional wait (irreversible operation)";

  static override readonly examples = [
    {
      description: "Terminate a single instance",
      command: "<%= config.bin %> <%= command.id %> --instance-ids i-1234567890abcdef0",
    },
    {
      description: "Terminate multiple instances",
      command:
        "<%= config.bin %> <%= command.id %> --instance-ids i-1234567890abcdef0 i-0987654321fedcba0",
    },
    {
      description: "Terminate instances and wait for terminated state",
      command: "<%= config.bin %> <%= command.id %> --instance-ids i-1234567890abcdef0 --wait",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "instance-ids": Flags.string({
      char: "i",
      description: "Instance IDs to terminate",
      required: true,
      multiple: true,
      helpValue: "INSTANCE_ID",
    }),

    wait: Flags.boolean({
      char: "w",
      description: "Wait for instances to reach terminated state (up to 5 minutes)",
      default: false,
    }),
  };

  /**
   * Execute the EC2 terminate instances command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(EC2TerminateInstancesCommand);

    try {
      const input: EC2TerminateInstancesInput = EC2TerminateInstancesInputSchema.parse({
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

      const results = await ec2Service.terminateInstances(
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
   * Format and display the terminate instances output
   *
   * @param results - Array of instance state changes
   * @param format - Output format to use
   * @throws Error if unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(results: InstanceStateChange[], format: string): void {
    if (results.length === 0) {
      this.log("No instances were terminated.");
      return;
    }

    switch (format) {
      case "table": {
        this.log(`Terminated ${results.length} instance(s):\n`);
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
