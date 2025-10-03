/**
 * @module ec2/describe-instance-status
 * EC2 describe instance status command
 *
 * Shows detailed instance and system status information including health checks,
 * system status, and scheduled events.
 */

import type { InstanceStatus } from "@aws-sdk/client-ec2";
import { Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { formatEC2Error } from "../../lib/ec2-errors.js";
import {
  EC2DescribeInstanceStatusInputSchema,
  parseFilterString,
  type EC2DescribeInstanceStatusInput,
} from "../../lib/ec2-schemas.js";
import { EC2Service } from "../../services/ec2-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * Extended instance status type with index signature for data processing
 *
 * @internal
 */
interface ExtendedInstanceStatus extends InstanceStatus {
  /**
   * Index signature for data processing compatibility
   */
  [key: string]: unknown;
}

/**
 * EC2 describe instance status command for monitoring instance health
 *
 * Provides detailed status information for EC2 instances including instance
 * health checks, system status checks, and scheduled maintenance events.
 *
 * @public
 */
export default class EC2DescribeInstanceStatusCommand extends BaseCommand {
  static override readonly description =
    "Show detailed instance and system status information with health checks";

  static override readonly examples = [
    {
      description: "Show status for all running instances",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "Show status for specific instances",
      command:
        "<%= config.bin %> <%= command.id %> --instance-ids i-1234567890abcdef0 i-0987654321fedcba0",
    },
    {
      description: "Show status for all instances including stopped ones",
      command: "<%= config.bin %> <%= command.id %> --include-all-instances",
    },
    {
      description: "Filter by instance status with JSON output",
      command:
        "<%= config.bin %> <%= command.id %> --filters 'Name=instance-status.status,Values=impaired' --format json",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "instance-ids": Flags.string({
      char: "i",
      description: "Specific instance IDs to check status",
      multiple: true,
      helpValue: "INSTANCE_ID",
    }),

    "include-all-instances": Flags.boolean({
      description: "Include all instances regardless of state",
      default: false,
    }),

    filters: Flags.string({
      description: "Filter status using AWS filter syntax (Name=name,Values=val1,val2)",
      multiple: true,
      helpValue: "FILTER",
    }),

    "max-results": Flags.integer({
      description: "Maximum status entries to return per page",
      min: 5,
      max: 1000,
      helpValue: "NUMBER",
    }),

    "next-token": Flags.string({
      description: "Pagination token for next page of results",
      helpValue: "TOKEN",
    }),
  };

  /**
   * Execute the EC2 describe instance status command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(EC2DescribeInstanceStatusCommand);

    try {
      const parsedFilters = flags.filters?.map((filter) => parseFilterString(filter));

      const input: EC2DescribeInstanceStatusInput = EC2DescribeInstanceStatusInputSchema.parse({
        region: flags.region,
        profile: flags.profile,
        instanceIds: flags["instance-ids"],
        includeAllInstances: flags["include-all-instances"],
        filters: parsedFilters,
        maxResults: flags["max-results"],
        nextToken: flags["next-token"],
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

      const statuses = await ec2Service.describeInstanceStatus(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          instanceIds: input.instanceIds,
          includeAllInstances: input.includeAllInstances,
          filters: input.filters,
          maxResults: input.maxResults,
          nextToken: input.nextToken,
        },
      );

      this.formatAndDisplayOutput(statuses, input.format);
    } catch (error) {
      const formattedError = formatEC2Error(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the instance status output
   *
   * @param statuses - Array of instance statuses to display
   * @param format - Output format to use
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(statuses: InstanceStatus[], format: string): void {
    if (statuses.length === 0) {
      this.log("No instance status information found.");
      return;
    }

    switch (format) {
      case "table": {
        this.log(`Found status for ${statuses.length} instances:\n`);
        const tableData = statuses.map((status, index) => ({
          "#": index + 1,
          "Instance ID": status.InstanceId ?? "N/A",
          "Instance State": status.InstanceState?.Name ?? "N/A",
          "Instance Status": status.InstanceStatus?.Status ?? "N/A",
          "System Status": status.SystemStatus?.Status ?? "N/A",
          "Availability Zone": status.AvailabilityZone ?? "N/A",
        }));

        const processor = new DataProcessor({ format: DataFormat.CSV });
        const output = processor.formatOutput(
          tableData.map((item, index) => ({ data: item, index })),
        );
        this.log(output);
        break;
      }

      case "json": {
        const processor = new DataProcessor({ format: DataFormat.JSON });
        const output = processor.formatOutput(
          statuses.map((status, index) => ({
            data: status as ExtendedInstanceStatus,
            index,
          })),
        );
        this.log(output);
        break;
      }

      case "jsonl": {
        const processor = new DataProcessor({ format: DataFormat.JSONL });
        const output = processor.formatOutput(
          statuses.map((status, index) => ({
            data: status as ExtendedInstanceStatus,
            index,
          })),
        );
        this.log(output);
        break;
      }

      case "csv": {
        const flattenedData = statuses.map((status) => ({
          InstanceId: status.InstanceId ?? "",
          InstanceState: status.InstanceState?.Name ?? "",
          InstanceStatus: status.InstanceStatus?.Status ?? "",
          SystemStatus: status.SystemStatus?.Status ?? "",
          AvailabilityZone: status.AvailabilityZone ?? "",
          Events: status.Events?.map((event) => event.Code).join(";") ?? "",
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
