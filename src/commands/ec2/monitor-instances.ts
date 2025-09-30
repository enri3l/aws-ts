/**
 * EC2 monitor instances command
 *
 * Enables detailed CloudWatch monitoring for EC2 instances.
 *
 * @module ec2/monitor-instances
 */

import type { InstanceMonitoring } from "@aws-sdk/client-ec2";
import { Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { formatEC2Error } from "../../lib/ec2-errors.js";
import {
  EC2MonitorInstancesInputSchema,
  type EC2MonitorInstancesInput,
} from "../../lib/ec2-schemas.js";
import { EC2Service } from "../../services/ec2-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * EC2 monitor instances command for enabling detailed CloudWatch monitoring
 *
 * Enables detailed CloudWatch monitoring for one or more EC2 instances.
 * Note: Detailed monitoring incurs additional costs.
 *
 * @public
 */
export default class EC2MonitorInstancesCommand extends BaseCommand {
  static override readonly description =
    "Enable detailed CloudWatch monitoring for EC2 instances (additional costs apply)";

  static override readonly examples = [
    {
      description: "Enable monitoring for a single instance",
      command: "<%= config.bin %> <%= command.id %> --instance-ids i-1234567890abcdef0",
    },
    {
      description: "Enable monitoring for multiple instances",
      command:
        "<%= config.bin %> <%= command.id %> --instance-ids i-1234567890abcdef0 i-0987654321fedcba0",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "instance-ids": Flags.string({
      char: "i",
      description: "Instance IDs to enable monitoring for",
      required: true,
      multiple: true,
      helpValue: "INSTANCE_ID",
    }),
  };

  /**
   * Execute the EC2 monitor instances command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(EC2MonitorInstancesCommand);

    try {
      const input: EC2MonitorInstancesInput = EC2MonitorInstancesInputSchema.parse({
        region: flags.region,
        profile: flags.profile,
        instanceIds: flags["instance-ids"],
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

      const results = await ec2Service.monitorInstances(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          instanceIds: input.instanceIds,
        },
      );

      this.formatAndDisplayOutput(results, input.format);
    } catch (error) {
      const formattedError = formatEC2Error(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the monitor instances output
   *
   * @param results - Array of instance monitoring changes
   * @param format - Output format to use
   * @internal
   */
  private formatAndDisplayOutput(results: InstanceMonitoring[], format: string): void {
    if (results.length === 0) {
      this.log("No instances were modified.");
      return;
    }

    switch (format) {
      case "table": {
        this.log(`Enabled monitoring for ${results.length} instance(s):\n`);
        const tableData = results.map((result, index) => ({
          "#": index + 1,
          "Instance ID": result.InstanceId ?? "N/A",
          "Monitoring State": result.Monitoring?.State ?? "N/A",
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
          MonitoringState: result.Monitoring?.State ?? "",
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
