/**
 * @module cloudwatch/logs/filter-events
 * CloudWatch Logs filter events command
 *
 * Advanced filtering with FilterLogEvents API, complex filter expressions,
 * multiple criteria combination, field indexing optimization, and comprehensive
 * pagination handling for large result sets.
 *
 */

import { Args, Flags } from "@oclif/core";
import { handleCloudWatchLogsCommandError } from "../../../lib/cloudwatch-logs-errors.js";
import type { CloudWatchLogsFilterEvents } from "../../../lib/cloudwatch-logs-schemas.js";
import { CloudWatchLogsFilterEventsSchema } from "../../../lib/cloudwatch-logs-schemas.js";
import { DataFormat, DataProcessor } from "../../../lib/data-processing.js";
import type { FilterEventsResult, LogEvent } from "../../../services/cloudwatch-logs-service.js";
import { CloudWatchLogsService } from "../../../services/cloudwatch-logs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * CloudWatch Logs filter events command for advanced filtering
 *
 * Provides advanced filtering capabilities using CloudWatch Logs FilterLogEvents API
 * with complex expressions, multiple criteria, and optimized pagination.
 *
 * @public
 */
export default class CloudWatchLogsFilterEventsCommand extends BaseCommand {
  static override readonly description =
    "Advanced filtering of CloudWatch log events with complex expressions";

  static override readonly examples = [
    {
      description: "Filter events with simple text pattern",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --filter 'ERROR'",
    },
    {
      description: "Filter events with JSON field extraction",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --filter '{ $.statusCode = 500 }'",
    },
    {
      description: "Filter events with space-delimited pattern",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --filter '[ timestamp, request_id, ERROR ]'",
    },
    {
      description: "Filter events with time range and specific streams",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --filter 'timeout' --start-time '2h ago' --log-streams 'stream1,stream2'",
    },
    {
      description: "Filter with interleaved results and pagination",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --filter 'ERROR' --interleaved --limit 1000",
    },
    {
      description: "Export filtered results to CSV",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --filter 'WARN' --format csv --output-file warnings.csv",
    },
    {
      description: "Complex filter with multiple conditions",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --filter '{ ($.level = \"ERROR\") || ($.duration > 5000) }'",
    },
    {
      description: "Filter events from multiple log streams with pattern",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --filter 'database' --log-streams 'prod-*' --all-pages",
    },
  ];

  static override readonly args = {
    logGroupName: Args.string({
      name: "logGroupName",
      description: "CloudWatch log group name to filter events from",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    filter: Flags.string({
      description: "Filter pattern (text, JSON extraction, or space-delimited pattern)",
      helpValue: "PATTERN",
      required: true,
    }),

    "start-time": Flags.string({
      char: "s",
      description: "Start time for filtering (relative: '2h ago', '1d ago' or absolute: ISO 8601)",
      helpValue: "TIME",
      default: "1 hour ago",
    }),

    "end-time": Flags.string({
      char: "e",
      description: "End time for filtering (relative: 'now', '30m ago' or absolute: ISO 8601)",
      helpValue: "TIME",
      default: "now",
    }),

    "log-streams": Flags.string({
      description: "Comma-separated list of log stream names to include (supports wildcards)",
      helpValue: "STREAM1,STREAM2,PREFIX-*",
    }),

    interleaved: Flags.boolean({
      char: "i",
      description: "Return interleaved results across all log streams in chronological order",
      default: false,
    }),

    limit: Flags.integer({
      char: "l",
      description: "Maximum number of events to return per page",
      min: 1,
      max: 10_000,
      default: 100,
    }),

    "all-pages": Flags.boolean({
      description:
        "Retrieve all pages of results (ignores limit, may take time for large datasets)",
      default: false,
    }),

    "next-token": Flags.string({
      description: "Pagination token to continue from previous results",
      helpValue: "TOKEN",
    }),

    "output-file": Flags.string({
      char: "o",
      description: "File to save filtered results (in addition to console output)",
      helpValue: "FILE_PATH",
    }),

    "show-statistics": Flags.boolean({
      description: "Show filtering statistics (events found, streams searched)",
      default: true,
    }),

    "field-optimization": Flags.boolean({
      description: "Enable field index optimization hints for better performance",
      default: true,
    }),
  };

  /**
   * Execute the CloudWatch Logs filter events command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(CloudWatchLogsFilterEventsCommand);

    try {
      // Parse time range
      const { startTime, endTime } = this.parseTimeRange(flags["start-time"], flags["end-time"]);

      // Parse log stream names if provided
      const logStreamNames = flags["log-streams"]
        ? flags["log-streams"].split(",").map((s) => s.trim())
        : undefined;

      // Validate input using Zod schema
      const input: CloudWatchLogsFilterEvents = CloudWatchLogsFilterEventsSchema.parse({
        logGroupName: args.logGroupName,
        logStreamNames,
        filterPattern: flags.filter,
        timeRange: { startTime: startTime.toISOString(), endTime: endTime.toISOString() },
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
        interleaved: flags.interleaved,
        limit: flags.limit,
        nextToken: flags["next-token"],
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

      if (input.verbose) {
        this.log(`Filtering events from log group '${input.logGroupName}'`);
        this.log(`Filter pattern: ${input.filterPattern}`);
        this.log(`Time range: ${startTime.toISOString()} to ${endTime.toISOString()}`);
        if (logStreamNames) {
          this.log(`Log streams: ${logStreamNames.join(", ")}`);
        }
        this.log(`Interleaved: ${input.interleaved ? "Yes" : "No"}`);
        if (flags["field-optimization"]) {
          this.analyzeFilterPattern(input.filterPattern || "");
        }
        this.log("");
      }

      // Execute filtering (with pagination if needed)
      await (flags["all-pages"]
        ? this.handleAllPagesExecution(
            logsService,
            input,
            logStreamNames,
            startTime,
            endTime,
            flags,
          )
        : this.handleSinglePageExecution(
            logsService,
            input,
            logStreamNames,
            startTime,
            endTime,
            flags,
          ));
    } catch (error) {
      const formattedError = handleCloudWatchLogsCommandError(
        error,
        flags.verbose,
        "filter events operation",
      );
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Handle all-pages execution with pagination
   *
   * @param logsService - CloudWatch Logs service instance
   * @param input - Validated input parameters
   * @param logStreamNames - Optional log stream names
   * @param startTime - Start time for filtering
   * @param endTime - End time for filtering
   * @param flags - Command flags
   * @returns Promise resolving when execution is complete
   * @internal
   */
  private async handleAllPagesExecution(
    logsService: CloudWatchLogsService,
    input: CloudWatchLogsFilterEvents,
    logStreamNames: string[] | undefined,
    startTime: Date,
    endTime: Date,
    flags: Record<string, unknown>,
  ): Promise<void> {
    const result = await this.fetchAllPages(logsService, input, logStreamNames, startTime, endTime);

    await this.formatAndDisplayOutput(
      result.aggregatedResult,
      input.format,
      flags["show-statistics"] as boolean,
      input.verbose,
      flags["output-file"] as string | undefined,
    );

    if (input.verbose) {
      this.log(
        `\nCompleted pagination: ${result.pageCount} pages, ${result.totalEventsFound} total events.`,
      );
    }
  }

  /**
   * Handle single-page execution
   *
   * @param logsService - CloudWatch Logs service instance
   * @param input - Validated input parameters
   * @param logStreamNames - Optional log stream names
   * @param startTime - Start time for filtering
   * @param endTime - End time for filtering
   * @param flags - Command flags
   * @returns Promise resolving when execution is complete
   * @internal
   */
  private async handleSinglePageExecution(
    logsService: CloudWatchLogsService,
    input: CloudWatchLogsFilterEvents,
    logStreamNames: string[] | undefined,
    startTime: Date,
    endTime: Date,
    flags: Record<string, unknown>,
  ): Promise<void> {
    const result = await logsService.filterLogEvents(
      {
        logGroupName: input.logGroupName,
        ...(logStreamNames && { logStreamNames }),
        ...(input.filterPattern && { filterPattern: input.filterPattern }),
        startTime,
        endTime,
        ...(input.nextToken && { nextToken: input.nextToken }),
        ...(input.limit && { limit: input.limit }),
        interleaved: input.interleaved,
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );

    await this.formatAndDisplayOutput(
      result,
      input.format,
      flags["show-statistics"] as boolean,
      input.verbose,
      flags["output-file"] as string | undefined,
    );

    if (result.nextToken && input.verbose) {
      this.log(`\nNext page available. Use --next-token="${result.nextToken}" to continue.`);
    }
  }

  /**
   * Fetch all pages of log events using pagination
   *
   * @param logsService - CloudWatch Logs service instance
   * @param input - Validated input parameters
   * @param logStreamNames - Optional log stream names
   * @param startTime - Start time for filtering
   * @param endTime - End time for filtering
   * @param flags - Command flags
   * @returns Promise resolving to aggregated results and metadata
   * @internal
   */
  private async fetchAllPages(
    logsService: CloudWatchLogsService,
    input: CloudWatchLogsFilterEvents,
    logStreamNames: string[] | undefined,
    startTime: Date,
    endTime: Date,
  ): Promise<{
    aggregatedResult: FilterEventsResult;
    pageCount: number;
    totalEventsFound: number;
  }> {
    const allResults: LogEvent[] = [];
    let totalEventsFound = 0;
    let currentToken = input.nextToken;
    let pageCount = 0;

    do {
      pageCount++;

      if (input.verbose && pageCount > 1) {
        this.log(`Fetching page ${pageCount}...`);
      }

      const result = await logsService.filterLogEvents(
        {
          logGroupName: input.logGroupName,
          ...(logStreamNames && { logStreamNames }),
          ...(input.filterPattern && { filterPattern: input.filterPattern }),
          startTime,
          endTime,
          ...(currentToken && { nextToken: currentToken }),
          limit: 10_000, // Use large limit for all-pages mode
          interleaved: input.interleaved,
        },
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      allResults.push(...result.events);
      totalEventsFound += result.events.length;
      currentToken = result.nextToken;

      // Show intermediate progress for large datasets
      if (input.verbose && result.events.length > 0) {
        this.log(
          `Found ${result.events.length} events in page ${pageCount} (total: ${totalEventsFound})`,
        );
      }
    } while (currentToken);

    const aggregatedResult: FilterEventsResult = {
      events: allResults,
      ...(currentToken && { nextToken: currentToken }),
    };

    return { aggregatedResult, pageCount, totalEventsFound };
  }

  /**
   * Parse time range from start and end time strings
   *
   * @param startTimeStr - Start time string
   * @param endTimeStr - End time string
   * @returns Parsed time range
   * @throws When start time is not before end time
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

    return { startTime, endTime };
  }

  /**
   * Parse time string (relative or absolute)
   *
   * @param timeString - Time string
   * @param referenceTime - Reference time
   * @returns Parsed Date
   * @throws When time format is invalid
   * @internal
   */
  private parseTimeString(timeString: string, referenceTime = new Date()): Date {
    if (timeString.toLowerCase() === "now") {
      return referenceTime;
    }

    const relativeTimeRegex = /^(\d+)\s*(m|min|minutes?|h|hour|hours?|d|day|days?)\s*ago$/i;
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
        default: {
          throw new Error(`Unsupported time unit: ${unit}`);
        }
      }
    }

    const absoluteTime = new Date(timeString);
    if (Number.isNaN(absoluteTime.getTime())) {
      throw new TypeError(`Invalid time format: ${timeString}`);
    }

    return absoluteTime;
  }

  /**
   * Analyze filter pattern for optimization hints
   *
   * @param filterPattern - Filter pattern to analyze
   * @internal
   */
  private analyzeFilterPattern(filterPattern: string): void {
    this.log("Filter Pattern Analysis:");

    // Detect pattern type
    if (filterPattern.startsWith("{") && filterPattern.endsWith("}")) {
      this.log("  Type: JSON field extraction");
      this.log("  Optimization: Ensure log events are in JSON format for best performance");

      // Extract field references
      const fieldMatches = filterPattern.match(/\$\.(\w+)/g);
      if (fieldMatches) {
        this.log(`  Referenced fields: ${fieldMatches.join(", ")}`);
        this.log("  Tip: Consider using field indexes if available for these fields");
      }
    } else if (filterPattern.startsWith("[") && filterPattern.endsWith("]")) {
      this.log("  Type: Space-delimited log pattern");
      this.log("  Optimization: Works best with structured log formats");
    } else {
      this.log("  Type: Simple text filter");
      this.log(
        "  Optimization: Consider using JSON extraction for better performance on structured logs",
      );
    }

    // Check for logical operators
    if (filterPattern.includes("&&") || filterPattern.includes("||")) {
      this.log("  Complex condition detected: Multiple criteria will be evaluated");
    }

    this.log("");
  }

  /**
   * Format and display filtered results
   *
   * @param result - Filter events result
   * @param format - Output format
   * @param showStatistics - Show statistics
   * @param verbose - Verbose output
   * @param outputFile - Optional output file
   * @throws When file write operations fail
   * @internal
   */
  private async formatAndDisplayOutput(
    result: FilterEventsResult,
    format: string,
    showStatistics: boolean,
    verbose: boolean,
    outputFile?: string,
  ): Promise<void> {
    const events = result.events;

    if (events.length === 0) {
      this.log("No events found matching the specified filter criteria and time range.");
      return;
    }

    let output = "";

    switch (format) {
      case "table": {
        output = this.formatTableOutput(events, showStatistics, verbose, result);
        break;
      }
      case "json": {
        const jsonOutput = {
          events: events.map((event) => ({
            timestamp: new Date(event.timestamp).toISOString(),
            message: event.message,
            logStreamName: event.logStreamName,
            eventId: event.eventId,
          })),
          pagination: {
            nextToken: result.nextToken,
            hasMore: !!result.nextToken,
          },
          statistics: {
            eventsFound: events.length,
            streamsSearched: result.searchedLogStreams?.length || 0,
          },
        };
        output = JSON.stringify(jsonOutput, undefined, 2);
        break;
      }
      case "jsonl": {
        output = events
          .map((event) =>
            JSON.stringify({
              timestamp: new Date(event.timestamp).toISOString(),
              message: event.message,
              logStreamName: event.logStreamName,
              eventId: event.eventId,
            }),
          )
          .join("\n");
        break;
      }
      case "csv": {
        output = this.formatCsvOutput(events);
        break;
      }
      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }

    // Output to console
    this.log(output);

    // Save to file if requested
    if (outputFile) {
      await this.saveToFile(output, outputFile, verbose);
    }

    // Show statistics
    if (showStatistics && format === "table") {
      this.displayStatistics(result, verbose);
    }
  }

  /**
   * Format events in table format
   *
   * @param events - Log events
   * @param showStatistics - Show statistics
   * @param verbose - Verbose output
   * @param result - Original filter result
   * @returns Formatted table output
   * @internal
   */
  private formatTableOutput(
    events: LogEvent[],
    _showStatistics: boolean,
    _verbose: boolean,
    _result: FilterEventsResult,
  ): string {
    const lines: string[] = [];
    lines.push(`\nFiltered Events (${events.length} found):\n`);

    for (let index = 0; index < events.length; index++) {
      const event = events[index];
      if (!event) continue;

      const timestamp = new Date(event.timestamp).toISOString();
      const streamInfo = event.logStreamName ? ` (${event.logStreamName})` : "";

      lines.push(`[${timestamp}]${streamInfo}`, `${event.message || ""}`);

      if (index < events.length - 1) {
        lines.push(""); // Add spacing between events
      }
    }

    return lines.join("\n");
  }

  /**
   * Format events in CSV format
   *
   * @param events - Log events
   * @returns Formatted CSV output
   * @internal
   */
  private formatCsvOutput(events: LogEvent[]): string {
    const csvData = events.map((event) => ({
      Timestamp: new Date(event.timestamp).toISOString(),
      LogStreamName: event.logStreamName || "",
      Message: event.message || "",
      EventId: event.eventId || "",
    }));

    const processor = new DataProcessor({
      format: DataFormat.CSV,
      includeHeaders: true,
    });

    return processor.formatOutput(csvData.map((item, index) => ({ data: item, index })));
  }

  /**
   * Display filtering statistics
   *
   * @param result - Filter events result
   * @param verbose - Verbose output
   * @internal
   */
  private displayStatistics(result: FilterEventsResult, verbose: boolean): void {
    const eventsFound = result.events.length;
    const streamsSearched = result.searchedLogStreams?.length || 0;

    this.log(`\n Filtering Statistics:`);
    this.log(`  Events Found: ${eventsFound}`);
    if (streamsSearched > 0) {
      this.log(`  Streams Searched: ${streamsSearched}`);
    }
    if (result.nextToken) {
      this.log(`  More Results: Available (use --next-token for pagination)`);
    }

    if (verbose && result.searchedLogStreams && result.searchedLogStreams.length > 0) {
      this.log(`\nSearched Log Streams:`);
      for (const stream of result.searchedLogStreams) {
        const completeness = stream.searchedCompletely ? "Complete" : "Partial";
        this.log(`  - ${stream.logStreamName}: ${completeness}`);
      }
    }
  }

  /**
   * Save output to file
   *
   * @param content - Content to save
   * @param filePath - File path
   * @param verbose - Verbose output
   * @internal
   */
  private async saveToFile(content: string, filePath: string, verbose: boolean): Promise<void> {
    try {
      const { promises: fs } = await import("node:fs");
      await fs.writeFile(filePath, content, "utf8");

      if (verbose) {
        this.log(`\n Results saved to: ${filePath}`);
      }
    } catch (error) {
      this.log(
        `\nFailed to save to file: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
