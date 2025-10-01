/**
 * @module cloudwatch/logs/describe-group
 * CloudWatch Logs describe group command
 *
 * Displays detailed information about a specific CloudWatch log group including
 * metadata, retention policy, log streams, and configuration with multiple output formats.
 *
 */

import { Args, Flags } from "@oclif/core";
import { handleCloudWatchLogsCommandError } from "../../../lib/cloudwatch-logs-errors.js";
import type { CloudWatchLogsDescribeGroup } from "../../../lib/cloudwatch-logs-schemas.js";
import { CloudWatchLogsDescribeGroupSchema } from "../../../lib/cloudwatch-logs-schemas.js";
import { DataFormat, DataProcessor } from "../../../lib/data-processing.js";
import type { LogGroupDescription } from "../../../services/cloudwatch-logs-service.js";
import { CloudWatchLogsService } from "../../../services/cloudwatch-logs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * CloudWatch Logs describe group command for detailed log group information
 *
 * Provides information about a CloudWatch log group including
 * metadata, configuration, log streams, and operational details.
 *
 * @public
 */
export default class CloudWatchLogsDescribeGroupCommand extends BaseCommand {
  static override readonly description = "Show detailed information about a CloudWatch log group";

  static override readonly examples = [
    {
      description: "Describe a log group with default table format",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function",
    },
    {
      description: "Describe a log group with JSON output",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --format json",
    },
    {
      description: "Describe a log group in a specific region",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --region us-west-2",
    },
    {
      description: "Describe a log group using a specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --profile production",
    },
    {
      description: "Include log streams information in the description",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --include-log-streams",
    },
    {
      description: "Include metric filters in the description",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --include-metric-filters",
    },
    {
      description: "Include subscription filters in the description",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --include-subscription-filters",
    },
    {
      description: "Include field indexes information",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --include-field-indexes",
    },
    {
      description: "Describe log group with CSV output for analysis",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --format csv",
    },
    {
      description: "Verbose log group description with debug information",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --verbose",
    },
  ];

  static override readonly args = {
    logGroupName: Args.string({
      name: "logGroupName",
      description: "Name of the CloudWatch log group to describe",
      required: true,
    }),
  };

  static override readonly flags = {
    region: Flags.string({
      char: "r",
      description: "AWS region containing the log group",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for log group information",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    "include-log-streams": Flags.boolean({
      description: "Include log streams information in the description",
      default: false,
    }),

    "include-metric-filters": Flags.boolean({
      description: "Include metric filters information in the description",
      default: false,
    }),

    "include-subscription-filters": Flags.boolean({
      description: "Include subscription filters information in the description",
      default: false,
    }),

    "include-field-indexes": Flags.boolean({
      description: "Include field indexes information in the description",
      default: false,
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the CloudWatch Logs describe group command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(CloudWatchLogsDescribeGroupCommand);

    try {
      // Validate input using Zod schema
      const input: CloudWatchLogsDescribeGroup = CloudWatchLogsDescribeGroupSchema.parse({
        logGroupName: args.logGroupName,
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
        includeMetricFilters: flags["include-metric-filters"],
        includeSubscriptionFilters: flags["include-subscription-filters"],
        includeFieldIndexes: flags["include-field-indexes"],
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

      // Describe log group from CloudWatch Logs
      const logGroupDescription = await logsService.describeLogGroup(
        input.logGroupName,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        flags["include-log-streams"],
      );

      // Format output based on requested format
      this.formatAndDisplayOutput(logGroupDescription, input.format);
    } catch (error) {
      const formattedError = handleCloudWatchLogsCommandError(
        error,
        flags.verbose,
        "describe log group operation",
      );
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the log group description output
   *
   * @param logGroupDescription - Log group description to display
   * @param format - Output format to use
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(logGroupDescription: LogGroupDescription, format: string): void {
    switch (format) {
      case "table": {
        this.displayTableFormat(logGroupDescription);
        break;
      }

      case "json": {
        const output = {
          ...logGroupDescription,
          creationTime: logGroupDescription.creationTime?.toISOString(),
          logStreams: logGroupDescription.logStreams?.map((stream) => ({
            ...stream,
            creationTime: stream.creationTime?.toISOString(),
            firstEventTime: stream.firstEventTime?.toISOString(),
            lastEventTime: stream.lastEventTime?.toISOString(),
            lastIngestionTime: stream.lastIngestionTime?.toISOString(),
          })),
        };
        this.log(JSON.stringify(output, undefined, 2));
        break;
      }

      case "jsonl": {
        const output = {
          ...logGroupDescription,
          creationTime: logGroupDescription.creationTime?.toISOString(),
          logStreams: logGroupDescription.logStreams?.map((stream) => ({
            ...stream,
            creationTime: stream.creationTime?.toISOString(),
            firstEventTime: stream.firstEventTime?.toISOString(),
            lastEventTime: stream.lastEventTime?.toISOString(),
            lastIngestionTime: stream.lastIngestionTime?.toISOString(),
          })),
        };
        this.log(JSON.stringify(output));
        break;
      }

      case "csv": {
        this.displayCsvFormat(logGroupDescription);
        break;
      }

      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }

  /**
   * Display log group description in human-readable table format
   *
   * @param logGroup - Log group description to display
   * @internal
   */
  private displayTableFormat(logGroup: LogGroupDescription): void {
    this.log(`\n=== Log Group: ${logGroup.logGroupName} ===\n`);

    // Basic log group information
    const basicInfo = [
      { Property: "Log Group Name", Value: logGroup.logGroupName },
      { Property: "Log Group ARN", Value: logGroup.logGroupArn || "N/A" },
      { Property: "Creation Time", Value: logGroup.creationTime?.toISOString() || "N/A" },
      {
        Property: "Retention (days)",
        Value: logGroup.retentionInDays?.toString() || "Never expires",
      },
      { Property: "Metric Filter Count", Value: logGroup.metricFilterCount?.toString() || "0" },
      {
        Property: "Stored Bytes",
        Value: logGroup.storedBytes ? this.formatBytes(logGroup.storedBytes) : "N/A",
      },
      { Property: "KMS Key ID", Value: logGroup.kmsKeyId || "None" },
      { Property: "Data Protection Status", Value: logGroup.dataProtectionStatus || "N/A" },
    ];

    const processor = new DataProcessor({ format: DataFormat.CSV });
    this.log("Basic Information:");
    this.log(processor.formatOutput(basicInfo.map((item, index) => ({ data: item, index }))));

    // Log Streams (if included)
    if (logGroup.logStreams && logGroup.logStreams.length > 0) {
      this.log(`\nLog Streams (${logGroup.logStreams.length} streams):`);
      const streamData = logGroup.logStreams.map((stream) => ({
        "Stream Name": stream.logStreamName,
        "Creation Time": stream.creationTime?.toISOString().split("T")[0] || "N/A",
        "First Event": stream.firstEventTime?.toISOString().split("T")[0] || "N/A",
        "Last Event": stream.lastEventTime?.toISOString().split("T")[0] || "N/A",
        "Last Ingestion": stream.lastIngestionTime?.toISOString().split("T")[0] || "N/A",
        "Stored Bytes": stream.storedBytes ? this.formatBytes(stream.storedBytes) : "N/A",
      }));
      this.log(processor.formatOutput(streamData.map((item, index) => ({ data: item, index }))));
    } else if (logGroup.logStreams) {
      this.log("\nLog Streams: No log streams found");
    }
  }

  /**
   * Display log group description in CSV format
   *
   * @param logGroup - Log group description to display
   * @internal
   */
  private displayCsvFormat(logGroup: LogGroupDescription): void {
    // Flatten log group data for CSV export
    const csvData = [
      {
        LogGroupName: logGroup.logGroupName,
        LogGroupArn: logGroup.logGroupArn || "",
        CreationTime: logGroup.creationTime?.toISOString() || "",
        RetentionDays: logGroup.retentionInDays || 0,
        MetricFilterCount: logGroup.metricFilterCount || 0,
        StoredBytes: logGroup.storedBytes || 0,
        KmsKeyId: logGroup.kmsKeyId || "",
        DataProtectionStatus: logGroup.dataProtectionStatus || "",
        LogStreamCount: logGroup.logStreams?.length || 0,
      },
    ];

    const processor = new DataProcessor({ format: DataFormat.CSV });
    const output = processor.formatOutput(csvData.map((item, index) => ({ data: item, index })));
    this.log(output);

    // Include log streams in CSV if available
    if (logGroup.logStreams && logGroup.logStreams.length > 0) {
      this.log("\n# Log Streams");
      const streamCsvData = logGroup.logStreams.map((stream) => ({
        LogStreamName: stream.logStreamName,
        CreationTime: stream.creationTime?.toISOString() || "",
        FirstEventTime: stream.firstEventTime?.toISOString() || "",
        LastEventTime: stream.lastEventTime?.toISOString() || "",
        LastIngestionTime: stream.lastIngestionTime?.toISOString() || "",
        StoredBytes: stream.storedBytes || 0,
        UploadSequenceToken: stream.uploadSequenceToken || "",
        Arn: stream.arn || "",
      }));
      const streamOutput = processor.formatOutput(
        streamCsvData.map((item, index) => ({ data: item, index })),
      );
      this.log(streamOutput);
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
