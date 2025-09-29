/**
 * CloudWatch Logs query command
 *
 * Execute CloudWatch Logs Insights queries with support for all three query languages
 * (Logs Insights QL, OpenSearch PPL, OpenSearch SQL), smart time range parsing,
 * and result streaming for large datasets.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { handleCloudWatchLogsCommandError } from "../../../lib/cloudwatch-logs-errors.js";
import type { CloudWatchLogsQuery } from "../../../lib/cloudwatch-logs-schemas.js";
import { CloudWatchLogsQuerySchema } from "../../../lib/cloudwatch-logs-schemas.js";
import { DataFormat, DataProcessor } from "../../../lib/data-processing.js";
import type { QueryResult } from "../../../services/cloudwatch-logs-service.js";
import { CloudWatchLogsService } from "../../../services/cloudwatch-logs-service.js";

/**
 * CloudWatch Logs query command for executing Logs Insights queries
 *
 * Provides execution of CloudWatch Logs Insights queries with support for
 * multiple query languages, smart time parsing, and result formatting.
 *
 * @public
 */
export default class CloudWatchLogsQueryCommand extends Command {
  static override readonly description = "Execute CloudWatch Logs Insights queries with filtering";

  static override readonly examples = [
    {
      description: "Execute a simple query for recent errors",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function 'fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 20'",
    },
    {
      description: "Query with custom time range (last 2 hours)",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function 'fields @timestamp, @message | limit 100' --start-time '2 hours ago' --end-time 'now'",
    },
    {
      description: "Query multiple log groups with JSON output",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/func1,/aws/lambda/func2 'fields @timestamp, @message | limit 50' --format json",
    },
    {
      description: "OpenSearch PPL query for advanced analytics",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function 'source=table | where status=200 | stats count(*) by status' --query-language OpenSearchPPL",
    },
    {
      description: "Query with specific time range (absolute dates)",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function 'fields @timestamp, @message | limit 100' --start-time '2024-01-15T10:00:00Z' --end-time '2024-01-15T11:00:00Z'",
    },
    {
      description: "Query with CSV output for analysis",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function 'fields @timestamp, @message, @requestId | limit 1000' --format csv",
    },
    {
      description: "Query with custom timeout and caching disabled",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function 'fields @timestamp, @message | limit 100' --timeout 30 --no-cache",
    },
    {
      description: "Verbose query execution with progress details",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function 'fields @timestamp, @message | limit 100' --verbose",
    },
  ];

  static override readonly args = {
    logGroups: Args.string({
      name: "logGroups",
      description: "Comma-separated list of CloudWatch log group names to query",
      required: true,
    }),
    query: Args.string({
      name: "query",
      description: "CloudWatch Logs Insights query string",
      required: true,
    }),
  };

  static override readonly flags = {
    region: Flags.string({
      char: "r",
      description: "AWS region containing the log groups",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for query results",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    "query-language": Flags.string({
      char: "l",
      description: "Query language to use for execution",
      options: ["CloudWatchLogsInsights", "OpenSearchPPL", "OpenSearchSQL"],
      default: "CloudWatchLogsInsights",
    }),

    "start-time": Flags.string({
      char: "s",
      description: "Start time for query (relative: '2h ago', '1d ago' or absolute: ISO 8601)",
      helpValue: "TIME",
      default: "1 hour ago",
    }),

    "end-time": Flags.string({
      char: "e",
      description: "End time for query (relative: 'now', '30m ago' or absolute: ISO 8601)",
      helpValue: "TIME",
      default: "now",
    }),

    limit: Flags.integer({
      description: "Maximum number of results to return",
      min: 1,
      max: 10_000,
      default: 1000,
    }),

    timeout: Flags.integer({
      char: "t",
      description: "Query execution timeout in minutes",
      min: 1,
      max: 60,
      default: 15,
    }),

    "no-cache": Flags.boolean({
      description: "Disable query result caching",
      default: false,
    }),

    "show-statistics": Flags.boolean({
      description: "Include query execution statistics in output",
      default: true,
    }),

    "show-progress": Flags.boolean({
      description: "Show query execution progress updates",
      default: true,
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with query execution details",
      default: false,
    }),
  };

  /**
   * Execute the CloudWatch Logs query command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(CloudWatchLogsQueryCommand);

    try {
      // Parse log group names from comma-separated string
      const logGroupNames = this.parseLogGroupNames(args.logGroups);

      // Parse time range
      const { startTime, endTime } = this.parseTimeRange(flags["start-time"], flags["end-time"]);

      // Validate input using Zod schema
      const input: CloudWatchLogsQuery = CloudWatchLogsQuerySchema.parse({
        logGroupNames,
        query: args.query,
        queryLanguage: flags["query-language"],
        timeRange: { startTime: startTime.toISOString(), endTime: endTime.toISOString() },
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
        limit: flags.limit,
        maxExecutionTime: flags.timeout,
        enableCaching: !flags["no-cache"],
      });

      // Create CloudWatch Logs service instance
      const logsService = new CloudWatchLogsService({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: flags["show-progress"],
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      if (input.verbose) {
        this.log(
          `Executing ${input.queryLanguage} query on ${input.logGroupNames.length} log group(s):`,
        );
        for (const logGroup of input.logGroupNames) {
          this.log(`  - ${logGroup}`);
        }
        this.log(`Time range: ${startTime.toISOString()} to ${endTime.toISOString()}`);
        this.log(`Query: ${input.query}`);
        this.log("");
      }

      // Execute the query
      const result = await logsService.executeQuery(
        {
          logGroupNames: input.logGroupNames,
          query: input.query,
          queryLanguage: input.queryLanguage,
          startTime,
          endTime,
          ...(input.limit && { limit: input.limit }),
        },
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      // Format and display the results
      this.formatAndDisplayOutput(result, input.format, flags["show-statistics"], input.verbose);
    } catch (error) {
      const formattedError = handleCloudWatchLogsCommandError(
        error,
        flags.verbose,
        "query execution operation",
      );
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Parse log group names from comma-separated string
   *
   * @param logGroupsArg - Comma-separated log group names
   * @returns Array of log group names
   * @throws When no log groups provided or more than 20 log groups specified
   * @internal
   */
  private parseLogGroupNames(logGroupsArgument: string): string[] {
    const logGroups = logGroupsArgument
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);

    if (logGroups.length === 0) {
      throw new Error("At least one log group name is required");
    }

    if (logGroups.length > 20) {
      throw new Error("Maximum of 20 log groups can be queried simultaneously");
    }

    return logGroups;
  }

  /**
   * Parse time range from start and end time strings
   *
   * @param startTimeStr - Start time string (relative or absolute)
   * @param endTimeStr - End time string (relative or absolute)
   * @returns Object with parsed start and end Date objects
   * @throws When start time is not before end time or time range exceeds 7 days
   * @internal
   */
  private parseTimeRange(
    startTimeString: string,
    endTimeString: string,
  ): { startTime: Date; endTime: Date } {
    const endTime = this.parseTimeString(endTimeString);
    const startTime = this.parseTimeString(startTimeString, endTime);

    if (startTime >= endTime) {
      throw new Error("Start time must be before end time");
    }

    // Ensure the time range is not longer than 7 days (CloudWatch Logs limitation)
    const maxRangeMs = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    if (endTime.getTime() - startTime.getTime() > maxRangeMs) {
      throw new Error("Time range cannot exceed 7 days for CloudWatch Logs queries");
    }

    return { startTime, endTime };
  }

  /**
   * Parse a time string (relative or absolute) into a Date object
   *
   * @param timeString - Time string to parse
   * @param referenceTime - Reference time for relative parsing (defaults to now)
   * @returns Parsed Date object
   * @throws When invalid time format provided
   * @internal
   */
  private parseTimeString(timeString: string, referenceTime = new Date()): Date {
    // Handle "now" keyword
    if (timeString.toLowerCase() === "now") {
      return referenceTime;
    }

    // Handle relative time formats
    const relativeTimeRegex = /^(\d+)\s*([mhdw])\s*ago$/i;
    const match = relativeTimeRegex.exec(timeString);

    if (match) {
      const value = Number.parseInt(match[1]!, 10);
      const unit = match[2]!.toLowerCase();
      const now = referenceTime;

      switch (unit.charAt(0)) {
        case "m": {
          return new Date(now.getTime() - value * 60 * 1000);
        }
        case "h": {
          return new Date(now.getTime() - value * 60 * 60 * 1000);
        }
        case "d": {
          return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
        }
        case "w": {
          return new Date(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
        }
        default: {
          throw new Error(`Unsupported time unit: ${unit}`);
        }
      }
    }

    // Handle special keywords
    const specialKeywords: Record<string, Date> = {
      yesterday: new Date(referenceTime.getTime() - 24 * 60 * 60 * 1000),
      today: new Date(
        referenceTime.getFullYear(),
        referenceTime.getMonth(),
        referenceTime.getDate(),
      ),
      "this morning": new Date(
        referenceTime.getFullYear(),
        referenceTime.getMonth(),
        referenceTime.getDate(),
        9,
        0,
        0,
      ),
    };

    const lowerTimeString = timeString.toLowerCase();
    if (specialKeywords[lowerTimeString]) {
      return specialKeywords[lowerTimeString];
    }

    // Handle absolute time (ISO 8601)
    const absoluteTime = new Date(timeString);
    if (Number.isNaN(absoluteTime.getTime())) {
      throw new TypeError(
        `Invalid time format: ${timeString}. Use relative (e.g., '2h ago'), keywords (e.g., 'now', 'yesterday'), or ISO 8601 format.`,
      );
    }

    return absoluteTime;
  }

  /**
   * Format and display the query results
   *
   * @param result - Query execution result
   * @param format - Output format to use
   * @param showStatistics - Whether to include execution statistics
   * @param verbose - Whether verbose output is enabled
   * @throws When query status is not "Complete"
   * @internal
   */
  private formatAndDisplayOutput(
    result: QueryResult,
    format: string,
    showStatistics: boolean,
    verbose: boolean,
  ): void {
    if (result.status !== "Complete") {
      this.error(`Query failed with status: ${result.status}`, { exit: 1 });
      return;
    }

    const results = result.results || [];
    const resultCount = results.length;

    if (resultCount === 0) {
      this.log("No results found for the specified query and time range.");
      return;
    }

    switch (format) {
      case "table": {
        this.displayTableFormat(results, result.statistics, showStatistics, verbose);
        break;
      }

      case "json": {
        this.formatJsonOutput(result, results, resultCount, showStatistics);
        break;
      }

      case "jsonl": {
        this.formatJsonlOutput(results);
        break;
      }

      case "csv": {
        this.displayCsvFormat(results, result.statistics, showStatistics);
        break;
      }

      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }

    this.displayStatistics(result.statistics, verbose, showStatistics);
  }

  /**
   * Format and display JSON output
   *
   * @param result - Query result with metadata
   * @param results - Query results array
   * @param resultCount - Number of results
   * @param showStatistics - Whether to include statistics
   * @internal
   */
  private formatJsonOutput(
    result: QueryResult,
    results: Array<Array<{ field?: string; value?: string }>>,
    resultCount: number,
    showStatistics: boolean,
  ): void {
    const output = {
      queryId: result.queryId,
      status: result.status,
      results: this.convertResultsToObjects(results),
      ...(showStatistics && result.statistics && { statistics: result.statistics }),
      resultCount,
    };
    this.log(JSON.stringify(output, undefined, 2));
  }

  /**
   * Format and display JSONL output
   *
   * @param results - Query results array
   * @internal
   */
  private formatJsonlOutput(results: Array<Array<{ field?: string; value?: string }>>): void {
    for (const row of results) {
      const rowObject = this.convertRowToObject(row);
      this.log(JSON.stringify(rowObject));
    }
  }

  /**
   * Convert query results to objects
   *
   * @param results - Query results array
   * @returns Array of result objects
   * @internal
   */
  private convertResultsToObjects(
    results: Array<Array<{ field?: string; value?: string }>>,
  ): Record<string, string>[] {
    return results.map((row) => this.convertRowToObject(row));
  }

  /**
   * Convert a single result row to object
   *
   * @param row - Result row array
   * @returns Result object
   * @internal
   */
  private convertRowToObject(
    row: Array<{ field?: string; value?: string }>,
  ): Record<string, string> {
    const object: Record<string, string> = {};
    for (const field of row) {
      if (field.field && field.value !== undefined) {
        object[field.field] = field.value;
      }
    }
    return object;
  }

  /**
   * Display query execution statistics
   *
   * @param statistics - Query statistics
   * @param verbose - Whether verbose output is enabled
   * @param showStatistics - Whether to show statistics
   * @internal
   */
  private displayStatistics(
    statistics:
      | { recordsMatched?: number; recordsScanned?: number; bytesScanned?: number }
      | undefined,
    verbose: boolean,
    showStatistics: boolean,
  ): void {
    if (verbose && showStatistics && statistics) {
      this.log(`\nQuery Statistics:`);
      this.log(`  Records Matched: ${statistics.recordsMatched || 0}`);
      this.log(`  Records Scanned: ${statistics.recordsScanned || 0}`);
      this.log(`  Bytes Scanned: ${this.formatBytes(statistics.bytesScanned || 0)}`);
    }
  }

  /**
   * Display query results in table format
   *
   * @param results - Query results array
   * @param statistics - Query execution statistics
   * @param showStatistics - Whether to show statistics
   * @param verbose - Whether verbose output is enabled
   * @internal
   */
  private displayTableFormat(
    results: Array<Array<{ field?: string; value?: string }>>,
    statistics:
      | { recordsMatched?: number; recordsScanned?: number; bytesScanned?: number }
      | undefined,
    showStatistics: boolean,
    verbose: boolean,
  ): void {
    if (results.length === 0) return;

    // Extract field names from first result
    const fields =
      results[0]?.map((field) => field.field || "unknown").filter((field) => field !== "unknown") ||
      [];

    if (fields.length === 0) {
      this.log("No fields found in query results.");
      return;
    }

    // Convert results to table data
    const tableData = results.map((row, index) => {
      const rowData: Record<string, string> = { "#": (index + 1).toString() };

      for (const field of row) {
        if (field.field && field.value !== undefined) {
          rowData[field.field] = field.value;
        }
      }

      return rowData;
    });

    // Use DataProcessor for consistent table formatting
    const processor = new DataProcessor({
      format: DataFormat.CSV, // Use CSV format for table-like output
      includeHeaders: true,
    });

    const output = processor.formatOutput(tableData.map((item, index) => ({ data: item, index })));

    this.log(`Query Results (${results.length} records):\n`);
    this.log(output);

    if (showStatistics && statistics && verbose) {
      this.log(`\nExecution Statistics:`);
      this.log(`  Records Matched: ${statistics.recordsMatched || 0}`);
      this.log(`  Records Scanned: ${statistics.recordsScanned || 0}`);
      this.log(`  Bytes Scanned: ${this.formatBytes(statistics.bytesScanned || 0)}`);
    }
  }

  /**
   * Display query results in CSV format
   *
   * @param results - Query results array
   * @param statistics - Query execution statistics
   * @param showStatistics - Whether to show statistics
   * @internal
   */
  private displayCsvFormat(
    results: Array<Array<{ field?: string; value?: string }>>,
    statistics:
      | { recordsMatched?: number; recordsScanned?: number; bytesScanned?: number }
      | undefined,
    showStatistics: boolean,
  ): void {
    if (results.length === 0) return;

    // Convert results to CSV data
    const csvData = results.map((row) => {
      const rowData: Record<string, string> = {};

      for (const field of row) {
        if (field.field && field.value !== undefined) {
          rowData[field.field] = field.value;
        }
      }

      return rowData;
    });

    const processor = new DataProcessor({
      format: DataFormat.CSV,
      includeHeaders: true,
    });

    const output = processor.formatOutput(csvData.map((item, index) => ({ data: item, index })));
    this.log(output);

    if (showStatistics && statistics) {
      this.log(`\n# Query Statistics`);
      this.log(`# Records Matched: ${statistics.recordsMatched || 0}`);
      this.log(`# Records Scanned: ${statistics.recordsScanned || 0}`);
      this.log(`# Bytes Scanned: ${this.formatBytes(statistics.bytesScanned || 0)}`);
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
