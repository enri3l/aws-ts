/**
 * EC2 describe instances command
 *
 * Lists and filters EC2 instances with comprehensive metadata and support for
 * multiple output formats and error handling.
 *
 * @module ec2/describe-instances
 */

import type { Instance } from "@aws-sdk/client-ec2";
import { Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { formatEC2Error } from "../../lib/ec2-errors.js";
import {
  EC2DescribeInstancesInputSchema,
  parseFilterString,
  type EC2DescribeInstancesInput,
} from "../../lib/ec2-schemas.js";
import { EC2Service } from "../../services/ec2-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * Extended instance type with index signature for data processing
 *
 * @internal
 */
interface ExtendedInstance extends Instance {
  /**
   * Index signature for data processing compatibility
   */
  [key: string]: unknown;
}

/**
 * EC2 describe instances command for listing and filtering instances
 *
 * Provides a list of EC2 instances in the specified region with support for
 * filtering, pagination, and multiple output formats.
 *
 * @public
 */
export default class EC2DescribeInstancesCommand extends BaseCommand {
  static override readonly description =
    "List and filter EC2 instances with comprehensive metadata";

  static override readonly examples = [
    {
      description: "List all instances in current region",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "Describe specific instances",
      command:
        "<%= config.bin %> <%= command.id %> --instance-ids i-1234567890abcdef0 i-0987654321fedcba0",
    },
    {
      description: "Filter by instance state with JSON output",
      command:
        "<%= config.bin %> <%= command.id %> --filters 'Name=instance-state-name,Values=running'",
    },
    {
      description: "List instances with specific tags",
      command:
        "<%= config.bin %> <%= command.id %> --filters 'Name=tag:Environment,Values=production'",
    },
    {
      description: "List instances using a specific AWS profile with CSV output",
      command: "<%= config.bin %> <%= command.id %> --profile production --format csv",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "instance-ids": Flags.string({
      char: "i",
      description: "Specific instance IDs to describe",
      multiple: true,
      helpValue: "INSTANCE_ID",
    }),

    filters: Flags.string({
      description: "Filter instances using AWS filter syntax (Name=name,Values=val1,val2)",
      multiple: true,
      helpValue: "FILTER",
    }),

    "max-results": Flags.integer({
      description: "Maximum instances to return per page",
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
   * Execute the EC2 describe instances command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(EC2DescribeInstancesCommand);

    try {
      // Parse filters if provided
      const parsedFilters = flags.filters?.map((filter) => parseFilterString(filter));

      // Validate input using Zod schema
      const input: EC2DescribeInstancesInput = EC2DescribeInstancesInputSchema.parse({
        region: flags.region,
        profile: flags.profile,
        instanceIds: flags["instance-ids"],
        filters: parsedFilters,
        maxResults: flags["max-results"],
        nextToken: flags["next-token"],
        format: flags.format,
        verbose: flags.verbose,
      });

      // Create EC2 service instance
      const ec2Service = new EC2Service({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      // Describe instances from EC2
      const instances = await ec2Service.describeInstances(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          instanceIds: input.instanceIds,
          filters: input.filters,
          maxResults: input.maxResults,
          nextToken: input.nextToken,
        },
      );

      // Format output based on requested format
      this.formatAndDisplayOutput(instances, input.format);
    } catch (error) {
      const formattedError = formatEC2Error(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the instance list output
   *
   * @param instances - Array of instances to display
   * @param format - Output format to use
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(instances: Instance[], format: string): void {
    if (instances.length === 0) {
      this.log("No EC2 instances found in the specified region.");
      return;
    }

    switch (format) {
      case "table": {
        this.log(`Found ${instances.length} EC2 instances:\n`);
        const tableData = instances.map((instance, index) => ({
          "#": index + 1,
          "Instance ID": instance.InstanceId ?? "N/A",
          "Instance Type": instance.InstanceType ?? "N/A",
          State: instance.State?.Name ?? "N/A",
          "Public IP": instance.PublicIpAddress ?? "N/A",
          "Private IP": instance.PrivateIpAddress ?? "N/A",
          "Availability Zone": instance.Placement?.AvailabilityZone ?? "N/A",
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
          instances.map((instance, index) => ({
            data: instance as ExtendedInstance,
            index,
          })),
        );
        this.log(output);
        break;
      }

      case "jsonl": {
        const processor = new DataProcessor({ format: DataFormat.JSONL });
        const output = processor.formatOutput(
          instances.map((instance, index) => ({
            data: instance as ExtendedInstance,
            index,
          })),
        );
        this.log(output);
        break;
      }

      case "csv": {
        const flattenedData = instances.map((instance) => ({
          InstanceId: instance.InstanceId ?? "",
          InstanceType: instance.InstanceType ?? "",
          State: instance.State?.Name ?? "",
          PublicIpAddress: instance.PublicIpAddress ?? "",
          PrivateIpAddress: instance.PrivateIpAddress ?? "",
          AvailabilityZone: instance.Placement?.AvailabilityZone ?? "",
          LaunchTime: instance.LaunchTime?.toISOString() ?? "",
          ImageId: instance.ImageId ?? "",
          KeyName: instance.KeyName ?? "",
          VpcId: instance.VpcId ?? "",
          SubnetId: instance.SubnetId ?? "",
          Architecture: instance.Architecture ?? "",
          Platform: instance.Platform ?? "",
          PublicDnsName: instance.PublicDnsName ?? "",
          PrivateDnsName: instance.PrivateDnsName ?? "",
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
