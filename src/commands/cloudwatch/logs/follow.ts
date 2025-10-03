/**
 * @module cloudwatch/logs/follow
 * CloudWatch Logs follow command
 *
 * Follow specific log streams with pattern-based stream selection and auto-reconnect
 * capabilities. Provides continuous monitoring of selected log streams with regex
 * pattern matching and buffer management for high-volume logs.
 *
 */

import { Args, Flags } from "@oclif/core";
import { handleCloudWatchLogsCommandError } from "../../../lib/cloudwatch-logs-errors.js";
import type { CloudWatchLogsFollow } from "../../../lib/cloudwatch-logs-schemas.js";
import { CloudWatchLogsFollowSchema } from "../../../lib/cloudwatch-logs-schemas.js";
import { CloudWatchLogsService, type LogEvent } from "../../../services/cloudwatch-logs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * CloudWatch Logs follow command for stream pattern following
 *
 * Provides continuous monitoring of specific log streams with pattern-based selection,
 * auto-reconnect capabilities, and export functionality for streaming data.
 *
 * @public
 */
export default class CloudWatchLogsFollowCommand extends BaseCommand {
  static override readonly description =
    "Follow specific log streams with pattern matching and auto-reconnect";

  static override readonly examples = [
    {
      description: "Follow all streams in a log group",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function",
    },
    {
      description: "Follow streams matching a specific pattern",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function '2024/01/15/*'",
    },
    {
      description: "Follow streams with regex pattern for specific instances",
      command: String.raw`<%= config.bin %> <%= command.id %> /aws/lambda/my-function --regex '^2024.*\[\w+\].*$'`,
    },
    {
      description: "Follow streams from the last hour with error filtering",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --since '1h ago' --filter 'ERROR'",
    },
    {
      description: "Follow and export to file while displaying",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --export-file stream-logs.txt",
    },
    {
      description: "Follow with custom reconnection settings",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --max-reconnects 10 --reconnect-delay 2000",
    },
    {
      description: "Follow with buffer management for high volume",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --buffer-size 1000 --flush-interval 5000",
    },
    {
      description: "Follow in a specific region with verbose debugging",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --region us-west-2 --verbose",
    },
  ];

  static override readonly args = {
    logGroupName: Args.string({
      name: "logGroupName",
      description: "CloudWatch log group name to follow",
      required: true,
    }),
    streamPattern: Args.string({
      name: "streamPattern",
      description: "Log stream name pattern (glob or regex with --regex flag)",
      required: false,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    regex: Flags.boolean({
      description: "Treat stream pattern as regular expression instead of glob",
      default: false,
    }),

    filter: Flags.string({
      char: "f",
      description: "Filter pattern to apply to log events",
      helpValue: "PATTERN",
    }),

    since: Flags.string({
      char: "s",
      description: "Start time for following (relative: '5m ago', '1h ago' or absolute: ISO 8601)",
      helpValue: "TIME",
    }),

    "export-file": Flags.string({
      char: "e",
      description: "File to export streaming data while displaying",
      helpValue: "FILE_PATH",
    }),

    "max-reconnects": Flags.integer({
      description: "Maximum number of reconnection attempts",
      default: 5,
      min: 0,
      max: 20,
    }),

    "reconnect-delay": Flags.integer({
      description: "Initial reconnection delay in milliseconds",
      default: 1000,
      min: 500,
      max: 10_000,
    }),

    "buffer-size": Flags.integer({
      description: "Maximum number of events to buffer",
      default: 500,
      min: 100,
      max: 5000,
    }),

    "flush-interval": Flags.integer({
      description: "Buffer flush interval in milliseconds",
      default: 2000,
      min: 1000,
      max: 30_000,
    }),

    "no-color": Flags.boolean({
      description: "Disable colored output for log levels",
      default: false,
    }),

    "show-timestamp": Flags.boolean({
      description: "Include timestamps in output",
      default: true,
    }),

    "show-stream-name": Flags.boolean({
      description: "Include log stream name in output",
      default: true,
    }),

    "follow-new-streams": Flags.boolean({
      description: "Automatically follow new streams that match the pattern",
      default: true,
    }),
  };

  /**
   * Execute the CloudWatch Logs follow command
   *
   * @returns Promise resolving when command execution is complete or interrupted
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(CloudWatchLogsFollowCommand);

    try {
      // Validate input using Zod schema
      const input: CloudWatchLogsFollow = CloudWatchLogsFollowSchema.parse({
        logGroupName: args.logGroupName,
        streamPattern: args.streamPattern,
        region: flags.region,
        profile: flags.profile,
        regex: flags.regex,
        filter: flags.filter,
        since: flags.since,
        exportFile: flags["export-file"],
        maxReconnects: flags["max-reconnects"],
        reconnectDelay: flags["reconnect-delay"],
        bufferSize: flags["buffer-size"],
        flushInterval: flags["flush-interval"],
        noColor: flags["no-color"],
        showTimestamp: flags["show-timestamp"],
        showStreamName: flags["show-stream-name"],
        followNewStreams: flags["follow-new-streams"],
        verbose: flags.verbose,
      });

      // Create CloudWatch Logs service instance
      const logsService = new CloudWatchLogsService({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: false, // Disable for streaming operations
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      // Set up graceful shutdown handling
      this.setupGracefulShutdown();

      if (input.verbose) {
        this.log(`Starting to follow log group: ${input.logGroupName}`);
        if (input.streamPattern) {
          this.log(`Stream pattern: ${input.streamPattern} (${input.regex ? "regex" : "glob"})`);
        }
        this.log("");
      }

      // Start following log streams
      await logsService.followLogStreams(
        input.logGroupName,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          ...(input.streamPattern && { streamPattern: input.streamPattern }),
          useRegex: input.regex,
          ...(input.filter && { filterPattern: input.filter }),
          ...(input.since && { startTime: this.parseStartTime(input.since) }),
          followNewStreams: input.followNewStreams,
        },
        {
          ...(input.exportFile && { exportFile: input.exportFile }),
          maxReconnects: input.maxReconnects,
          reconnectDelay: input.reconnectDelay,
          bufferSize: input.bufferSize,
          flushInterval: input.flushInterval,
          noColor: input.noColor,
          showTimestamp: input.showTimestamp,
          showStreamName: input.showStreamName,
          verbose: input.verbose,
          onEvent: (event, streamName) => this.handleLogEvent(event as LogEvent, streamName, input),
          onStreamConnect: (streamName) => this.handleStreamConnect(streamName, input.verbose),
          onStreamDisconnect: (streamName, reason) =>
            this.handleStreamDisconnect(streamName, reason, input.verbose),
          onReconnect: (streamName, attempt) =>
            this.handleReconnect(streamName, attempt, input.verbose),
          onError: (error, streamName) => this.handleStreamError(error, streamName, input.verbose),
        },
      );
    } catch (error) {
      const formattedError = handleCloudWatchLogsCommandError(
        error,
        flags.verbose,
        "follow streams operation",
      );
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Parse start time from relative or absolute time string
   *
   * @param timeString - Time string to parse
   * @returns Date object representing the start time
   * @throws When time format is invalid
   * @internal
   */
  private parseStartTime(timeString: string): Date {
    // Handle relative time formats
    const relativeTimeRegex = /^(\d+)\s*(m|min|minutes?|h|hour|hours?|d|day|days?)\s*ago$/i;
    const match = relativeTimeRegex.exec(timeString);

    if (match) {
      const value = Number.parseInt(match[1]!, 10);
      const unit = match[2]!.toLowerCase();
      const now = new Date();

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

    // Handle absolute time (ISO 8601)
    const absoluteTime = new Date(timeString);
    if (Number.isNaN(absoluteTime.getTime())) {
      throw new TypeError(
        `Invalid time format: ${timeString}. Use relative (e.g., '5m ago') or ISO 8601 format.`,
      );
    }

    return absoluteTime;
  }

  /**
   * Handle incoming log events from a specific stream
   *
   * @param event - Log event from CloudWatch Logs
   * @param streamName - Name of the log stream
   * @param config - Command configuration
   * @internal
   */
  private handleLogEvent(event: LogEvent, streamName: string, config: CloudWatchLogsFollow): void {
    let output = "";

    // Add timestamp if requested
    if (config.showTimestamp && event.timestamp) {
      const timestamp = new Date(event.timestamp).toISOString();
      output += config.noColor ? `[${timestamp}] ` : `\u001B[90m[${timestamp}]\u001B[0m `;
    }

    // Add log stream name if requested
    if (config.showStreamName) {
      output += config.noColor ? `(${streamName}) ` : `\u001B[36m(${streamName})\u001B[0m `;
    }

    // Add the log message with potential coloring
    const message = event.message || "";
    if (config.noColor) {
      output += message;
    } else {
      // Apply colors based on log level detection
      if (message.includes("ERROR") || message.includes("FATAL")) {
        output += `\u001B[91m${message}\u001B[0m`; // Bright red
      } else if (message.includes("WARN")) {
        output += `\u001B[93m${message}\u001B[0m`; // Bright yellow
      } else if (message.includes("INFO")) {
        output += `\u001B[94m${message}\u001B[0m`; // Bright blue
      } else if (message.includes("DEBUG")) {
        output += `\u001B[90m${message}\u001B[0m`; // Dark gray
      } else {
        output += message; // Default color
      }
    }

    // Output to console
    this.log(output);
  }

  /**
   * Handle stream connection events
   *
   * @param streamName - Name of the connected stream
   * @param verbose - Whether verbose output is enabled
   * @internal
   */
  private handleStreamConnect(streamName: string, verbose: boolean): void {
    if (verbose) {
      this.log(`\u001B[92m✓ Connected to stream: ${streamName}\u001B[0m`);
    }
  }

  /**
   * Handle stream disconnection events
   *
   * @param streamName - Name of the disconnected stream
   * @param reason - Reason for disconnection
   * @param verbose - Whether verbose output is enabled
   * @internal
   */
  private handleStreamDisconnect(streamName: string, reason: string, verbose: boolean): void {
    if (verbose) {
      this.log(`\u001B[93mDisconnected from stream: ${streamName} (${reason})\u001B[0m`);
    }
  }

  /**
   * Handle reconnection attempts
   *
   * @param streamName - Name of the stream being reconnected
   * @param attempt - Reconnection attempt number
   * @param verbose - Whether verbose output is enabled
   * @internal
   */
  private handleReconnect(streamName: string, attempt: number, verbose: boolean): void {
    if (verbose) {
      this.log(`\u001B[94m Reconnecting to stream: ${streamName} (attempt ${attempt})\u001B[0m`);
    }
  }

  /**
   * Handle stream errors
   *
   * @param error - Error that occurred during streaming
   * @param streamName - Name of the stream where error occurred
   * @param verbose - Whether verbose output is enabled
   * @internal
   */
  private handleStreamError(error: Error, streamName: string | undefined, verbose: boolean): void {
    const streamInfo = streamName ? ` (stream: ${streamName})` : "";
    if (verbose) {
      this.error(`Stream error${streamInfo}: ${error.message}`, { exit: 0 });
    } else {
      this.error(`Connection error${streamInfo}: ${error.message}`, { exit: 0 });
    }
  }

  /**
   * Handle graceful shutdown
   *
   * @throws When stream is interrupted by user
   * @internal
   */
  private gracefulShutdown(): void {
    this.log("\n\nReceived interrupt signal. Closing stream connections...");
    throw new Error("Stream interrupted by user");
  }

  /**
   * Set up graceful shutdown handling for CTRL+C
   *
   * @internal
   */
  private setupGracefulShutdown(): void {
    process.on("SIGINT", () => this.gracefulShutdown());
    process.on("SIGTERM", () => this.gracefulShutdown());
  }
}
