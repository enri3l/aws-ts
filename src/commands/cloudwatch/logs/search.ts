/**
 * @module cloudwatch/logs/search
 * CloudWatch Logs search command
 *
 * Fast text search across log events with regex pattern support, field-specific
 * searches, time range filtering, and result highlighting for enhanced visibility.
 *
 */

import { Args, Flags } from "@oclif/core";
import { handleCloudWatchLogsCommandError } from "../../../lib/cloudwatch-logs-errors.js";
import type { CloudWatchLogsSearch } from "../../../lib/cloudwatch-logs-schemas.js";
import { CloudWatchLogsSearchSchema } from "../../../lib/cloudwatch-logs-schemas.js";
import { DataFormat, DataProcessor } from "../../../lib/data-processing.js";
import type { FilterEventsResult, LogEvent } from "../../../services/cloudwatch-logs-service.js";
import { CloudWatchLogsService } from "../../../services/cloudwatch-logs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * Search result with highlighting information
 * @internal
 */
interface SearchResult extends LogEvent {
  matchCount: number;
  highlightedMessage?: string;
  contextBefore?: LogEvent[];
  contextAfter?: LogEvent[];
}

/**
 * CloudWatch Logs search command for fast text search
 *
 * Provides fast text search across CloudWatch log events with regex support,
 * field-specific searches, and result highlighting for enhanced operational visibility.
 *
 * @public
 */
export default class CloudWatchLogsSearchCommand extends BaseCommand {
  static override readonly description =
    "Fast text search across CloudWatch log events with regex and highlighting";

  static override readonly examples = [
    {
      description: "Simple text search in log group",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function ERROR",
    },
    {
      description: "Regex pattern search for request IDs",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' --regex",
    },
    {
      description: "Case-sensitive search with time range",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function 'Exception' --case-sensitive --start-time '1h ago' --end-time 'now'",
    },
    {
      description: "Search with context lines before and after matches",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function 'timeout' --context-before 2 --context-after 2",
    },
    {
      description: "Field-specific search in message field",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function '@message:\"database connection\"'",
    },
    {
      description: "Search with JSON output format",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function 'ERROR' --format json",
    },
    {
      description: "Search without highlighting (for scripting)",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function 'warn' --no-highlight",
    },
    {
      description: "Search with custom limit and specific region",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function 'ERROR' --limit 500 --region us-west-2",
    },
  ];

  static override readonly args = {
    logGroupName: Args.string({
      name: "logGroupName",
      description: "CloudWatch log group name to search",
      required: true,
    }),
    searchPattern: Args.string({
      name: "searchPattern",
      description: 'Text pattern to search for (supports field-specific syntax: @field:"value")',
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    regex: Flags.boolean({
      description: "Treat search pattern as regular expression",
      default: false,
    }),

    "case-sensitive": Flags.boolean({
      char: "c",
      description: "Perform case-sensitive search",
      default: false,
    }),

    "start-time": Flags.string({
      char: "s",
      description: "Start time for search (relative: '2h ago', '1d ago' or absolute: ISO 8601)",
      helpValue: "TIME",
      default: "1 hour ago",
    }),

    "end-time": Flags.string({
      char: "e",
      description: "End time for search (relative: 'now', '30m ago' or absolute: ISO 8601)",
      helpValue: "TIME",
      default: "now",
    }),

    "context-before": Flags.integer({
      description: "Number of context lines to show before each match",
      min: 0,
      max: 10,
      default: 0,
    }),

    "context-after": Flags.integer({
      description: "Number of context lines to show after each match",
      min: 0,
      max: 10,
      default: 0,
    }),

    highlight: Flags.boolean({
      description: "Highlight matching terms in output",
      default: true,
      allowNo: true,
    }),

    limit: Flags.integer({
      char: "l",
      description: "Maximum number of matching events to return",
      min: 1,
      max: 10_000,
      default: 100,
    }),

    "log-stream-names": Flags.string({
      description: "Comma-separated list of log stream names to search within",
      helpValue: "STREAM1,STREAM2",
    }),

    "show-statistics": Flags.boolean({
      description: "Show search statistics (total events scanned, matches found)",
      default: true,
    }),
  };

  /**
   * Execute the CloudWatch Logs search command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(CloudWatchLogsSearchCommand);

    try {
      // Parse time range
      const { startTime, endTime } = this.parseTimeRange(flags["start-time"], flags["end-time"]);

      // Parse log stream names if provided
      const logStreamNames = flags["log-stream-names"]
        ? flags["log-stream-names"].split(",").map((s) => s.trim())
        : undefined;

      // Validate input using Zod schema
      const input: CloudWatchLogsSearch = CloudWatchLogsSearchSchema.parse({
        logGroupName: args.logGroupName,
        searchPattern: args.searchPattern,
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
        regex: flags.regex,
        caseSensitive: flags["case-sensitive"],
        timeRange: { startTime: startTime.toISOString(), endTime: endTime.toISOString() },
        contextBefore: flags["context-before"],
        contextAfter: flags["context-after"],
        highlight: flags.highlight,
        limit: flags.limit,
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
        this.log(`Searching log group '${input.logGroupName}' for pattern: ${input.searchPattern}`);
        this.log(`Time range: ${startTime.toISOString()} to ${endTime.toISOString()}`);
        this.log(
          `Search mode: ${input.regex ? "regex" : "text"} (${input.caseSensitive ? "case-sensitive" : "case-insensitive"})`,
        );
        if (logStreamNames) {
          this.log(`Log streams: ${logStreamNames.join(", ")}`);
        }
        this.log("");
      }

      // Perform search and display results
      await this.performSearchAndProcessResults(
        logsService,
        input,
        logStreamNames,
        startTime,
        endTime,
        flags,
      );
    } catch (error) {
      const formattedError = handleCloudWatchLogsCommandError(
        error,
        flags.verbose,
        "search operation",
      );
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Perform search operation and process results
   *
   * @param logsService - CloudWatch Logs service instance
   * @param input - Validated input parameters
   * @param logStreamNames - Optional log stream names
   * @param startTime - Start time for search
   * @param endTime - End time for search
   * @param flags - Command flags
   * @returns Promise resolving when search and processing is complete
   * @internal
   */
  private async performSearchAndProcessResults(
    logsService: CloudWatchLogsService,
    input: CloudWatchLogsSearch,
    logStreamNames: string[] | undefined,
    startTime: Date,
    endTime: Date,
    flags: Record<string, unknown>,
  ): Promise<void> {
    // Determine search approach (field-specific vs general)
    const { filterPattern, searchRegex } = this.buildSearchStrategy(
      input.searchPattern,
      input.regex,
      input.caseSensitive,
    );

    // Execute search using FilterLogEvents
    const result = await logsService.filterLogEvents(
      {
        logGroupName: input.logGroupName,
        ...(logStreamNames && { logStreamNames }),
        ...(filterPattern && { filterPattern }),
        startTime,
        endTime,
        ...(input.limit && { limit: input.limit }),
        interleaved: true, // Get results in chronological order
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );

    // Process search results
    const searchResults = this.processSearchResults(
      result,
      searchRegex,
      input.contextBefore,
      input.contextAfter,
      input.highlight,
      input.verbose,
    );

    // Display results
    this.formatAndDisplayOutput(
      searchResults,
      input.format,
      flags["show-statistics"] as boolean,
      input.verbose,
      result,
    );
  }

  /**
   * Parse time range from start and end time strings
   *
   * @param startTimeStr - Start time string
   * @param endTimeStr - End time string
   * @returns Parsed time range
   * @throws When time string format is invalid
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
   * @throws When time string format is invalid or unsupported
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
   * Build search strategy based on pattern type
   *
   * @param searchPattern - Search pattern from user
   * @param isRegex - Whether pattern is regex
   * @param caseSensitive - Whether search is case sensitive
   * @returns Filter pattern and search regex
   * @internal
   */
  private buildSearchStrategy(
    searchPattern: string,
    isRegex: boolean,
    caseSensitive: boolean,
  ): { filterPattern?: string; searchRegex: RegExp } {
    // Check if it's a field-specific search (@field:"value")
    const fieldSpecificRegex = /^@(\w+):\s*"([^"]+)"$/;
    const fieldSpecificMatch = fieldSpecificRegex.exec(searchPattern);

    if (fieldSpecificMatch) {
      const [, field, value] = fieldSpecificMatch;
      // Use CloudWatch Logs filter syntax for field-specific searches
      const filterPattern = `{ $.${field} = "${value}" }`;
      const searchRegex = new RegExp(
        isRegex ? value! : this.escapeRegExp(value!),
        caseSensitive ? "g" : "gi",
      );
      return { filterPattern, searchRegex };
    }

    // For general text search, let CloudWatch Logs do initial filtering
    // then use regex for highlighting and further processing
    let filterPattern: string;
    let searchRegex: RegExp;

    if (isRegex) {
      // For regex patterns, use them directly but create a simple filter pattern
      filterPattern = searchPattern.includes('"') ? searchPattern : `"${searchPattern}"`;
      searchRegex = new RegExp(searchPattern, caseSensitive ? "g" : "gi");
    } else {
      // For text search, escape special characters for CloudWatch filter
      filterPattern = `"${searchPattern}"`;
      searchRegex = new RegExp(this.escapeRegExp(searchPattern), caseSensitive ? "g" : "gi");
    }

    return { filterPattern, searchRegex };
  }

  /**
   * Escape special regex characters
   *
   * @param string - String to escape
   * @returns Escaped string
   * @internal
   */
  private escapeRegExp(string: string): string {
    return string.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
  }

  /**
   * Process search results with highlighting and context
   *
   * @param result - Filter events result
   * @param searchRegex - Search regex for highlighting
   * @param contextBefore - Context lines before
   * @param contextAfter - Context lines after
   * @param highlight - Enable highlighting
   * @param verbose - Verbose output
   * @returns Processed search results
   * @internal
   */
  private processSearchResults(
    result: FilterEventsResult,
    searchRegex: RegExp,
    contextBefore: number,
    contextAfter: number,
    highlight: boolean,
    verbose: boolean,
  ): SearchResult[] {
    const events = result.events;
    const searchResults: SearchResult[] = [];

    for (let index = 0; index < events.length; index++) {
      const event = events[index];
      if (!event) continue;

      const processedEvent = this.processSearchEvent(
        event,
        searchRegex,
        highlight,
        events,
        index,
        contextBefore,
        contextAfter,
      );

      if (processedEvent) {
        searchResults.push(processedEvent);
      }
    }

    if (verbose) {
      this.log(
        `Found ${searchResults.length} matching events out of ${events.length} total events.`,
      );
    }

    return searchResults;
  }

  /**
   * Process a single search event with highlighting and context
   *
   * @param event - Log event to process
   * @param searchRegex - Search regex for highlighting
   * @param highlight - Enable highlighting
   * @param events - All events for context
   * @param index - Current event index
   * @param contextBefore - Context lines before
   * @param contextAfter - Context lines after
   * @returns Processed search result or undefined if no matches
   * @internal
   */
  private processSearchEvent(
    event: LogEvent,
    searchRegex: RegExp,
    highlight: boolean,
    events: LogEvent[],
    index: number,
    contextBefore: number,
    contextAfter: number,
  ): SearchResult | undefined {
    const message = event.message || "";

    // Count matches in the message
    const matches = message.match(searchRegex);
    const matchCount = matches ? matches.length : 0;

    if (matchCount === 0) return undefined;

    // Create highlighted message if highlighting enabled
    let highlightedMessage: string | undefined;
    if (highlight) {
      highlightedMessage = message.replace(searchRegex, (match) => `\u001B[93m${match}\u001B[0m`);
    }

    // Get context lines if requested
    const contextBeforeEvents = this.getContextBefore(events, index, contextBefore);
    const contextAfterEvents = this.getContextAfter(events, index, contextAfter);

    return {
      ...event,
      matchCount,
      ...(highlightedMessage && { highlightedMessage }),
      ...(contextBeforeEvents && { contextBefore: contextBeforeEvents }),
      ...(contextAfterEvents && { contextAfter: contextAfterEvents }),
    };
  }

  /**
   * Get context events before the current index
   *
   * @param events - All events
   * @param index - Current event index
   * @param contextBefore - Number of context lines before
   * @returns Context events or undefined
   * @internal
   */
  private getContextBefore(
    events: LogEvent[],
    index: number,
    contextBefore: number,
  ): LogEvent[] | undefined {
    if (contextBefore <= 0) return undefined;
    const startIndex = Math.max(0, index - contextBefore);
    return events.slice(startIndex, index);
  }

  /**
   * Get context events after the current index
   *
   * @param events - All events
   * @param index - Current event index
   * @param contextAfter - Number of context lines after
   * @returns Context events or undefined
   * @internal
   */
  private getContextAfter(
    events: LogEvent[],
    index: number,
    contextAfter: number,
  ): LogEvent[] | undefined {
    if (contextAfter <= 0) return undefined;
    const endIndex = Math.min(events.length, index + contextAfter + 1);
    return events.slice(index + 1, endIndex);
  }

  /**
   * Format and display search results
   *
   * @param results - Search results
   * @param format - Output format
   * @param showStatistics - Show statistics
   * @param verbose - Verbose output
   * @param originalResult - Original filter result for statistics
   * @throws When unsupported output format is provided
   * @internal
   */
  private formatAndDisplayOutput(
    results: SearchResult[],
    format: string,
    showStatistics: boolean,
    verbose: boolean,
    originalResult: FilterEventsResult,
  ): void {
    if (results.length === 0) {
      this.log("No matching events found for the specified search pattern and time range.");
      return;
    }

    switch (format) {
      case "table": {
        this.displayTableFormat(results, showStatistics, verbose);
        break;
      }
      case "json": {
        const output = {
          searchResults: results.map((result) => ({
            timestamp: result.timestamp,
            message: result.message,
            logStreamName: result.logStreamName,
            eventId: result.eventId,
            matchCount: result.matchCount,
            highlightedMessage: result.highlightedMessage,
          })),
          totalMatches: results.length,
          totalEventsScanned: originalResult.events.length,
        };
        this.log(JSON.stringify(output, undefined, 2));
        break;
      }
      case "jsonl": {
        for (const result of results) {
          this.log(
            JSON.stringify({
              timestamp: result.timestamp,
              message: result.message,
              logStreamName: result.logStreamName,
              eventId: result.eventId,
              matchCount: result.matchCount,
            }),
          );
        }
        break;
      }
      case "csv": {
        this.displayCsvFormat(results);
        break;
      }
      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }

    if (showStatistics) {
      this.displayStatistics(results, originalResult, verbose);
    }
  }

  /**
   * Display results in table format
   *
   * @param results - Search results
   * @param showStatistics - Show statistics
   * @param verbose - Verbose output
   * @internal
   */
  private displayTableFormat(
    results: SearchResult[],
    _showStatistics: boolean,
    _verbose: boolean,
  ): void {
    this.log(`\nSearch Results (${results.length} matches):\n`);

    for (let index = 0; index < results.length; index++) {
      const result = results[index];
      if (!result) continue;

      this.displaySearchResult(result, index, results.length);
    }
  }

  /**
   * Display a single search result with context
   *
   * @param result - Search result to display
   * @param index - Current result index
   * @param totalResults - Total number of results
   * @internal
   */
  private displaySearchResult(result: SearchResult, index: number, totalResults: number): void {
    const timestamp = new Date(result.timestamp).toISOString();

    // Show context before if available
    this.displayContextBefore(result.contextBefore);

    // Show the matching event
    this.displayMatchingEvent(result, timestamp);

    // Show context after if available
    this.displayContextAfter(result.contextAfter);

    if (index < totalResults - 1) {
      this.log(""); // Add spacing between results
    }
  }

  /**
   * Display context events before the match
   *
   * @param contextBefore - Context events before
   * @internal
   */
  private displayContextBefore(contextBefore?: LogEvent[]): void {
    if (contextBefore && contextBefore.length > 0) {
      this.log(`\u001B[90m--- Context Before ---\u001B[0m`);
      for (const contextEvent of contextBefore) {
        const contextTime = new Date(contextEvent.timestamp).toISOString();
        this.log(`\u001B[90m[${contextTime}] ${contextEvent.message}\u001B[0m`);
      }
    }
  }

  /**
   * Display the matching event with metadata
   *
   * @param result - Search result
   * @param timestamp - Formatted timestamp
   * @internal
   */
  private displayMatchingEvent(result: SearchResult, timestamp: string): void {
    const streamInfo = result.logStreamName ? ` (${result.logStreamName})` : "";
    const matchInfo = result.matchCount > 1 ? ` [${result.matchCount} matches]` : "";

    this.log(`[${timestamp}]${streamInfo}${matchInfo}`);
    this.log(`${result.highlightedMessage || result.message}`);
  }

  /**
   * Display context events after the match
   *
   * @param contextAfter - Context events after
   * @internal
   */
  private displayContextAfter(contextAfter?: LogEvent[]): void {
    if (contextAfter && contextAfter.length > 0) {
      this.log(`\u001B[90m--- Context After ---\u001B[0m`);
      for (const contextEvent of contextAfter) {
        const contextTime = new Date(contextEvent.timestamp).toISOString();
        this.log(`\u001B[90m[${contextTime}] ${contextEvent.message}\u001B[0m`);
      }
    }
  }

  /**
   * Display results in CSV format
   *
   * @param results - Search results
   * @internal
   */
  private displayCsvFormat(results: SearchResult[]): void {
    const csvData = results.map((result) => ({
      Timestamp: new Date(result.timestamp).toISOString(),
      LogStreamName: result.logStreamName || "",
      Message: result.message || "",
      MatchCount: result.matchCount,
      EventId: result.eventId || "",
    }));

    const processor = new DataProcessor({
      format: DataFormat.CSV,
      includeHeaders: true,
    });

    const output = processor.formatOutput(csvData.map((item, index) => ({ data: item, index })));
    this.log(output);
  }

  /**
   * Display search statistics
   *
   * @param results - Search results
   * @param originalResult - Original filter result
   * @param verbose - Verbose output
   * @internal
   */
  private displayStatistics(
    results: SearchResult[],
    originalResult: FilterEventsResult,
    verbose: boolean,
  ): void {
    const totalMatches = results.reduce((sum, result) => sum + result.matchCount, 0);
    const eventsScanned = originalResult.events.length;
    const streamsSearched = originalResult.searchedLogStreams?.length || 0;

    this.log(`\n Search Statistics:`);
    this.log(`  Events Found: ${results.length}`);
    this.log(`  Total Matches: ${totalMatches}`);
    this.log(`  Events Scanned: ${eventsScanned}`);
    if (streamsSearched > 0) {
      this.log(`  Streams Searched: ${streamsSearched}`);
    }

    if (verbose && originalResult.searchedLogStreams) {
      this.log(`\nSearched Log Streams:`);
      for (const stream of originalResult.searchedLogStreams) {
        const completeness = stream.searchedCompletely ? "Complete" : "Partial";
        this.log(`  - ${stream.logStreamName}: ${completeness}`);
      }
    }
  }
}
