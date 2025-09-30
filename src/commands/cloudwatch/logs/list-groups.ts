/**
 * @module list-groups
 * CloudWatch Logs list groups command
 *
 * Lists all CloudWatch log groups in the specified region with support for
 * multiple output formats and error handling.
 *
 */

import { Flags } from "@oclif/core";
import { handleCloudWatchLogsCommandError } from "../../../lib/cloudwatch-logs-errors.js";
import type { CloudWatchLogsListGroups } from "../../../lib/cloudwatch-logs-schemas.js";
import { CloudWatchLogsListGroupsSchema } from "../../../lib/cloudwatch-logs-schemas.js";
import { DataFormat, DataProcessor } from "../../../lib/data-processing.js";
import {
  CloudWatchLogsService,
  type LogGroupDescription,
} from "../../../services/cloudwatch-logs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * CloudWatch Logs list groups command for discovering available log groups
 *
 * Provides a list of all CloudWatch log groups in the specified region
 * with support for multiple output formats and region/profile selection.
 *
 * @public
 */
export default class CloudWatchLogsListGroupsCommand extends BaseCommand {
  static override readonly description = "List all CloudWatch log groups in the region";

  static override readonly examples = [
    {
      description: "List all log groups in the current region",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "List log groups with JSON output format",
      command: "<%= config.bin %> <%= command.id %> --format json",
    },
    {
      description: "List log groups in a specific region",
      command: "<%= config.bin %> <%= command.id %> --region us-west-2",
    },
    {
      description: "List log groups using a specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> --profile production",
    },
    {
      description: "List log groups with CSV output format for spreadsheet import",
      command: "<%= config.bin %> <%= command.id %> --format csv",
    },
    {
      description: "Filter log groups by name prefix",
      command: "<%= config.bin %> <%= command.id %> --prefix /aws/lambda",
    },
    {
      description: "Limit number of log groups returned",
      command: "<%= config.bin %> <%= command.id %> --limit 10",
    },
    {
      description: "Sort log groups by last event time in descending order",
      command: "<%= config.bin %> <%= command.id %> --order-by LastEventTime --descending",
    },
    {
      description: "Verbose log group listing with debug information",
      command: "<%= config.bin %> <%= command.id %> --verbose",
    },
  ];

  static override readonly flags = {
    region: Flags.string({
      char: "r",
      description: "AWS region to list log groups from",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for log group list",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    prefix: Flags.string({
      description: "Log group name prefix filter",
      helpValue: "PREFIX",
    }),

    limit: Flags.integer({
      char: "l",
      description: "Maximum number of log groups to return",
      min: 1,
      max: 10_000,
    }),

    "order-by": Flags.string({
      description: "Field to order results by",
      options: ["LogStreamName", "LastEventTime"],
      default: "LogStreamName",
    }),

    descending: Flags.boolean({
      description: "Sort results in descending order",
      default: false,
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the CloudWatch Logs list groups command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(CloudWatchLogsListGroupsCommand);

    try {
      // Validate input using Zod schema
      const input: CloudWatchLogsListGroups = CloudWatchLogsListGroupsSchema.parse({
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
        prefix: flags.prefix,
        limit: flags.limit,
        orderBy: flags["order-by"],
        descending: flags.descending,
      });

      // Create CloudWatch Logs service instance
      const logsService = new CloudWatchLogsService({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      // List log groups from CloudWatch Logs
      const result = await logsService.listLogGroups(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.prefix,
        input.limit,
      );

      // Sort results if needed
      let logGroups = result.items;
      if (input.orderBy) {
        logGroups = this.sortLogGroups(logGroups, input.orderBy, input.descending);
      }

      // Format output based on requested format
      this.formatAndDisplayOutput(logGroups, input.format);
    } catch (error) {
      const formattedError = handleCloudWatchLogsCommandError(
        error,
        flags.verbose,
        "list log groups operation",
      );
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Sort log groups by specified field
   *
   * @param logGroups - Array of log groups to sort
   * @param orderBy - Field to sort by
   * @param descending - Whether to sort in descending order
   * @returns Sorted array of log groups
   * @internal
   */
  private sortLogGroups(
    logGroups: LogGroupDescription[],
    orderBy: string,
    descending: boolean,
  ): LogGroupDescription[] {
    const sorted = [...logGroups].toSorted((a, b) => {
      switch (orderBy) {
        case "LogStreamName": {
          return a.logGroupName.localeCompare(b.logGroupName);
        }
        case "LastEventTime": {
          const aTime = a.creationTime?.getTime() ?? 0;
          const bTime = b.creationTime?.getTime() ?? 0;
          return aTime - bTime;
        }
        default: {
          return 0;
        }
      }
    });

    return descending ? sorted.toReversed() : sorted;
  }

  /**
   * Format and display the log groups output
   *
   * @param logGroups - Array of log groups to display
   * @param format - Output format to use
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(logGroups: LogGroupDescription[], format: string): void {
    if (logGroups.length === 0) {
      this.log("No CloudWatch log groups found in the specified region.");
      return;
    }

    switch (format) {
      case "table": {
        this.log(`Found ${logGroups.length} CloudWatch log groups:\n`);
        const tableData = logGroups.map((group, index) => ({
          "#": index + 1,
          "Log Group Name": group.logGroupName,
          "Retention (days)": group.retentionInDays ?? "Never expires",
          "Stored Bytes": group.storedBytes ? this.formatBytes(group.storedBytes) : "Unknown",
          Created: group.creationTime ? group.creationTime.toISOString().split("T")[0] : "Unknown",
        }));

        // Use DataProcessor for consistent table formatting
        const processor = new DataProcessor({
          format: DataFormat.CSV,
          includeHeaders: true,
        });
        const output = processor.formatOutput(
          tableData.map((item, index) => ({ data: item, index })),
        );
        this.log(output);
        break;
      }

      case "json": {
        const output = {
          logGroups: logGroups.map((group) => ({
            logGroupName: group.logGroupName,
            logGroupArn: group.logGroupArn,
            creationTime: group.creationTime?.toISOString(),
            retentionInDays: group.retentionInDays,
            metricFilterCount: group.metricFilterCount,
            storedBytes: group.storedBytes,
            kmsKeyId: group.kmsKeyId,
            dataProtectionStatus: group.dataProtectionStatus,
          })),
          count: logGroups.length,
        };
        this.log(JSON.stringify(output, undefined, 2));
        break;
      }

      case "jsonl": {
        for (const group of logGroups) {
          this.log(
            JSON.stringify({
              logGroupName: group.logGroupName,
              logGroupArn: group.logGroupArn,
              creationTime: group.creationTime?.toISOString(),
              retentionInDays: group.retentionInDays,
              metricFilterCount: group.metricFilterCount,
              storedBytes: group.storedBytes,
              kmsKeyId: group.kmsKeyId,
              dataProtectionStatus: group.dataProtectionStatus,
            }),
          );
        }
        break;
      }

      case "csv": {
        // Create CSV data with headers
        const csvData = [
          {
            "Log Group Name": "Log Group Name",
            "Log Group ARN": "Log Group ARN",
            "Creation Time": "Creation Time",
            "Retention Days": "Retention Days",
            "Metric Filter Count": "Metric Filter Count",
            "Stored Bytes": "Stored Bytes",
            "KMS Key ID": "KMS Key ID",
            "Data Protection Status": "Data Protection Status",
          }, // Header row
          ...logGroups.map((group) => ({
            "Log Group Name": group.logGroupName,
            "Log Group ARN": group.logGroupArn ?? "",
            "Creation Time": group.creationTime?.toISOString() ?? "",
            "Retention Days": group.retentionInDays?.toString() ?? "",
            "Metric Filter Count": group.metricFilterCount?.toString() ?? "",
            "Stored Bytes": group.storedBytes?.toString() ?? "",
            "KMS Key ID": group.kmsKeyId ?? "",
            "Data Protection Status": group.dataProtectionStatus ?? "",
          })),
        ];

        const processor = new DataProcessor({
          format: DataFormat.CSV,
          includeHeaders: true,
        });
        const output = processor.formatOutput(
          csvData.map((item, index) => ({ data: item, index })),
        );
        this.log(output);
        break;
      }

      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }

  /**
   * Format bytes to human readable format
   *
   * @param bytes - Number of bytes
   * @returns Formatted string
   * @internal
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.floor(Math.log(bytes) / Math.log(k));

    return `${Number.parseFloat((bytes / Math.pow(k, index)).toFixed(2))} ${sizes[index]}`;
  }
}
