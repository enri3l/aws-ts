/**
 * CloudWatch Logs tail command
 *
 * Real-time log streaming using AWS StartLiveTail API with WebSocket connections.
 * Provides live monitoring of CloudWatch log events with filtering, pattern matching,
 * and colored output for enhanced operational visibility.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import type { CloudWatchLogsTail } from "../../../lib/cloudwatch-logs-schemas.js";
import { CloudWatchLogsTailSchema } from "../../../lib/cloudwatch-logs-schemas.js";
import { handleCloudWatchLogsCommandError } from "../../../lib/cloudwatch-logs-errors.js";
import { CloudWatchLogsService } from "../../../services/cloudwatch-logs-service.js";

/**
 * CloudWatch Logs tail command for real-time log streaming
 *
 * Provides live monitoring of CloudWatch log events using AWS StartLiveTail API
 * with WebSocket connections, filtering capabilities, and colored output.
 *
 * @public
 */
export default class CloudWatchLogsTailCommand extends Command {
  static override readonly description = "Stream CloudWatch log events in real-time using live tail";

  static override readonly examples = [
    {
      description: "Tail a log group in real-time",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function",
    },
    {
      description: "Tail with filter pattern for errors only",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --filter 'ERROR'",
    },
    {
      description: "Tail multiple log groups simultaneously",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/func1 /aws/lambda/func2",
    },
    {
      description: "Tail with specific time range (last 30 minutes)",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --since '30 minutes ago'",
    },
    {
      description: "Tail with pattern filtering and colored output",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --filter 'ERROR|WARN' --no-color",
    },
    {
      description: "Tail and save output to file while streaming",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --output-file logs.txt",
    },
    {
      description: "Tail in a specific region with custom profile",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --region us-west-2 --profile production",
    },
    {
      description: "Tail with verbose output for debugging",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --verbose",
    },
  ];

  static override readonly args = {
    logGroupNames: Args.string({
      name: "logGroupNames",
      description: "CloudWatch log group names to tail (up to 10 groups)",
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

    filter: Flags.string({
      char: "f",
      description: "Filter pattern to apply to log events (CloudWatch Logs filter syntax)",
      helpValue: "PATTERN",
    }),

    since: Flags.string({
      char: "s",
      description: "Start time for tailing (relative: '5m ago', '1h ago' or absolute: ISO 8601)",
      helpValue: "TIME",
    }),

    "log-stream-names": Flags.string({
      description: "Comma-separated list of log stream names to include",
      helpValue: "STREAM1,STREAM2",
    }),

    "log-stream-name-prefix": Flags.string({
      description: "Filter log streams by name prefix",
      helpValue: "PREFIX",
    }),

    "output-file": Flags.string({
      char: "o",
      description: "File to save streaming output while displaying",
      helpValue: "FILE_PATH",
    }),

    "no-color": Flags.boolean({
      description: "Disable colored output for log levels",
      default: false,
    }),

    "show-timestamp": Flags.boolean({
      description: "Include timestamps in output",
      default: true,
    }),

    "show-log-stream": Flags.boolean({
      description: "Include log stream name in output",
      default: false,
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with connection debugging",
      default: false,
    }),
  };

  /**
   * Execute the CloudWatch Logs tail command
   *
   * @returns Promise resolving when command execution is complete or interrupted
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(CloudWatchLogsTailCommand);

    try {
      // Parse multiple log group names from the single argument
      const logGroupNames = this.parseLogGroupNames(args.logGroupNames);

      // Validate input using Zod schema
      const input: CloudWatchLogsTail = CloudWatchLogsTailSchema.parse({
        logGroupNames,
        region: flags.region,
        profile: flags.profile,
        filter: flags.filter,
        since: flags.since,
        logStreamNames: flags["log-stream-names"]?.split(",").map(s => s.trim()),
        logStreamNamePrefix: flags["log-stream-name-prefix"],
        outputFile: flags["output-file"],
        noColor: flags["no-color"],
        showTimestamp: flags["show-timestamp"],
        showLogStream: flags["show-log-stream"],
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
        this.log(`Starting live tail for ${input.logGroupNames.length} log group(s):`);
        for (const logGroup of input.logGroupNames) {
          this.log(`  - ${logGroup}`);
        }
        this.log("");
      }

      // Start live tail streaming
      await logsService.startLiveTail(
        input.logGroupNames,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          filterPattern: input.filter,
          startTime: input.since ? this.parseStartTime(input.since) : undefined,
          logStreamNames: input.logStreamNames,
          logStreamNamePrefix: input.logStreamNamePrefix,
        },
        {
          outputFile: input.outputFile,
          noColor: input.noColor,
          showTimestamp: input.showTimestamp,
          showLogStream: input.showLogStream,
          verbose: input.verbose,
          onEvent: (event) => this.handleLogEvent(event, input),
          onError: (error) => this.handleStreamError(error, input.verbose),
          onClose: () => this.handleStreamClose(input.verbose),
        },
      );
    } catch (error) {
      const formattedError = handleCloudWatchLogsCommandError(
        error,
        flags.verbose,
        "live tail operation",
      );
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Parse log group names from command argument
   *
   * @param logGroupNamesArg - Command argument containing log group names
   * @returns Array of log group names
   * @internal
   */
  private parseLogGroupNames(logGroupNamesArg: string): string[] {
    // Split by space and filter out empty strings
    const logGroups = logGroupNamesArg.split(/\s+/).filter(name => name.length > 0);

    if (logGroups.length === 0) {
      throw new Error("At least one log group name is required");
    }

    if (logGroups.length > 10) {
      throw new Error("Maximum of 10 log groups can be tailed simultaneously");
    }

    return logGroups;
  }

  /**
   * Parse start time from relative or absolute time string
   *
   * @param timeString - Time string to parse
   * @returns Date object representing the start time
   * @internal
   */
  private parseStartTime(timeString: string): Date {
    // Handle relative time formats
    const relativeTimeRegex = /^(\d+)\s*(m|min|minutes?|h|hour|hours?|d|day|days?)\s*ago$/i;
    const match = timeString.match(relativeTimeRegex);

    if (match) {
      const value = parseInt(match[1], 10);
      const unit = match[2].toLowerCase();
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
    if (isNaN(absoluteTime.getTime())) {
      throw new Error(`Invalid time format: ${timeString}. Use relative (e.g., '5m ago') or ISO 8601 format.`);
    }

    return absoluteTime;
  }

  /**
   * Handle incoming log events from the stream
   *
   * @param event - Log event from CloudWatch Logs
   * @param config - Command configuration
   * @internal
   */
  private handleLogEvent(event: any, config: CloudWatchLogsTail): void {
    let output = "";

    // Add timestamp if requested
    if (config.showTimestamp && event.timestamp) {
      const timestamp = new Date(event.timestamp).toISOString();
      output += config.noColor ? `[${timestamp}] ` : `\x1b[90m[${timestamp}]\x1b[0m `;
    }

    // Add log stream name if requested
    if (config.showLogStream && event.logStreamName) {
      output += config.noColor
        ? `(${event.logStreamName}) `
        : `\x1b[36m(${event.logStreamName})\x1b[0m `;
    }

    // Add the log message with potential coloring
    const message = event.message || "";
    if (config.noColor) {
      output += message;
    } else {
      // Apply colors based on log level detection
      if (message.includes("ERROR") || message.includes("FATAL")) {
        output += `\x1b[91m${message}\x1b[0m`; // Bright red
      } else if (message.includes("WARN")) {
        output += `\x1b[93m${message}\x1b[0m`; // Bright yellow
      } else if (message.includes("INFO")) {
        output += `\x1b[94m${message}\x1b[0m`; // Bright blue
      } else if (message.includes("DEBUG")) {
        output += `\x1b[90m${message}\x1b[0m`; // Dark gray
      } else {
        output += message; // Default color
      }
    }

    // Output to console
    this.log(output);
  }

  /**
   * Handle stream errors
   *
   * @param error - Error that occurred during streaming
   * @param verbose - Whether verbose output is enabled
   * @internal
   */
  private handleStreamError(error: Error, verbose: boolean): void {
    if (verbose) {
      this.error(`Stream error: ${error.message}`, { exit: 0 });
    } else {
      this.error(`Connection error: ${error.message}`, { exit: 0 });
    }
  }

  /**
   * Handle stream closure
   *
   * @param verbose - Whether verbose output is enabled
   * @internal
   */
  private handleStreamClose(verbose: boolean): void {
    if (verbose) {
      this.log("\nLive tail stream closed.");
    }
  }

  /**
   * Set up graceful shutdown handling for CTRL+C
   *
   * @internal
   */
  private setupGracefulShutdown(): void {
    const gracefulShutdown = () => {
      this.log("\n\nReceived interrupt signal. Closing live tail stream...");
      process.exit(0);
    };

    process.on("SIGINT", gracefulShutdown);
    process.on("SIGTERM", gracefulShutdown);
  }
}