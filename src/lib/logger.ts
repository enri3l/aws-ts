/**
 * Structured logging system with configurable levels
 *
 * Provides consistent, structured logging across the CLI application with
 * configurable log levels, output formatting, and context enrichment.
 * Designed for both development and production use cases.
 *
 */

/**
 * Available log levels in order of severity
 *
 * @public
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

/**
 * Log entry structure for consistent formatting
 *
 * @public
 */
export interface LogEntry {
  /**
   * Timestamp when the log entry was created
   */
  timestamp: string;

  /**
   * Log level for this entry
   */
  level: LogLevel;

  /**
   * Human-readable log level name
   */
  levelName: string;

  /**
   * Primary log message
   */
  message: string;

  /**
   * Additional context data
   */
  context?: Record<string, unknown>;

  /**
   * Error object if logging an error
   */
  error?: Error;

  /**
   * Component or module that generated this log
   */
  component?: string;
}

/**
 * Logger configuration options
 *
 * @public
 */
export interface LoggerOptions {
  /**
   * Minimum log level to output
   */
  level?: LogLevel;

  /**
   * Component name for log entries
   */
  component?: string;

  /**
   * Enable pretty formatting for development
   */
  prettyPrint?: boolean;

  /**
   * Custom output function (defaults to console methods)
   */
  output?: (entry: LogEntry) => void;
}

/**
 * Structured logger with configurable levels and formatting
 *
 * Provides consistent logging interface with structured output,
 * context enrichment, and configurable formatting for different environments.
 *
 * @public
 */
export class Logger {
  private readonly level: LogLevel;
  private readonly component?: string;
  private readonly prettyPrint: boolean;
  private readonly output: (entry: LogEntry) => void;

  /**
   * Create a new logger instance
   *
   * @param options - Logger configuration options
   */
  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? this.getDefaultLogLevel();
    if ("component" in options) {
      this.component = options.component;
    }
    this.prettyPrint = options.prettyPrint ?? process.env.NODE_ENV !== "production";
    this.output = options.output ?? this.defaultOutput.bind(this);
  }

  /**
   * Log a debug message
   *
   * @param message - Debug message
   * @param context - Additional context data
   * @param error - Optional error object
   */
  debug(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.log(LogLevel.DEBUG, message, context, error);
  }

  /**
   * Log an info message
   *
   * @param message - Info message
   * @param context - Additional context data
   * @param error - Optional error object
   */
  info(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.log(LogLevel.INFO, message, context, error);
  }

  /**
   * Log a warning message
   *
   * @param message - Warning message
   * @param context - Additional context data
   * @param error - Optional error object
   */
  warn(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.log(LogLevel.WARN, message, context, error);
  }

  /**
   * Log an error message
   *
   * @param message - Error message
   * @param context - Additional context data
   * @param error - Optional error object
   */
  error(message: string, context?: Record<string, unknown>, error?: Error): void {
    this.log(LogLevel.ERROR, message, context, error);
  }

  /**
   * Create a child logger with additional context
   *
   * @param childContext - Context to add to all child log entries
   * @param childComponent - Optional component name override
   * @returns New logger instance with enriched context
   *
   * @example
   * ```typescript
   * const baseLogger = new Logger({ component: "cli" });
   * const commandLogger = baseLogger.child({ command: "list-tables" }, "dynamo");
   * commandLogger.info("Starting table listing"); // Will include command context
   * ```
   */
  child(childContext: Record<string, unknown>, childComponent?: string): Logger {
    const loggerOptions: LoggerOptions = {
      level: this.level,
      prettyPrint: this.prettyPrint,
      output: (entry: LogEntry) => {
        this.output({
          ...entry,
          context: { ...childContext, ...entry.context },
        });
      },
    };

    const resolvedComponent = childComponent ?? this.component;
    if (resolvedComponent) {
      loggerOptions.component = resolvedComponent;
    }

    return new Logger(loggerOptions);
  }

  /**
   * Internal logging method
   *
   * @param level - Log level for this entry
   * @param message - Log message
   * @param context - Additional context data
   * @param error - Optional error object
   * @internal
   */
  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>,
    error?: Error,
  ): void {
    if (level < this.level) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      levelName: LogLevel[level],
      message,
      ...(context && { context }),
      ...(error && { error }),
      ...(this.component && { component: this.component }),
    };

    this.output(entry);
  }

  /**
   * Default log output implementation
   *
   * @param entry - Log entry to output
   * @internal
   */
  private defaultOutput(entry: LogEntry): void {
    if (this.prettyPrint) {
      this.prettyOutput(entry);
    } else {
      this.jsonOutput(entry);
    }
  }

  /**
   * Pretty-printed output for development
   *
   * @param entry - Log entry to format
   * @internal
   */
  private prettyOutput(entry: LogEntry): void {
    const timestamp = entry.timestamp.replace(/T/, " ").replace(/\..+/, "");
    const component = entry.component ? `[${entry.component}]` : "";
    const level = entry.levelName.padEnd(5);

    let output = `${timestamp} ${level} ${component} ${entry.message}`;

    if (entry.context && Object.keys(entry.context).length > 0) {
      output += `\n  Context: ${JSON.stringify(entry.context, undefined, 2)}`;
    }

    if (entry.error) {
      output += `\n  Error: ${entry.error.stack ?? entry.error.message}`;
    }

    const consoleMethod = this.getConsoleMethod(entry.level);
    consoleMethod(output);
  }

  /**
   * JSON output for production
   *
   * @param entry - Log entry to format
   * @internal
   */
  private jsonOutput(entry: LogEntry): void {
    const output = JSON.stringify({
      ...entry,
      error: entry.error
        ? {
            name: entry.error.name,
            message: entry.error.message,
            stack: entry.error.stack,
          }
        : undefined,
    });

    const consoleMethod = this.getConsoleMethod(entry.level);
    consoleMethod(output);
  }

  /**
   * Get appropriate console method for log level
   *
   * @param level - Log level
   * @returns Console method function
   * @internal
   */
  private getConsoleMethod(level: LogLevel): typeof console.log {
    switch (level) {
      case LogLevel.DEBUG: {
        return console.debug;
      }
      case LogLevel.INFO: {
        return console.info;
      }
      case LogLevel.WARN: {
        return console.warn;
      }
      case LogLevel.ERROR: {
        return console.error;
      }
      default: {
        return console.log;
      }
    }
  }

  /**
   * Get default log level from environment
   *
   * @returns Default log level based on environment
   * @internal
   */
  private getDefaultLogLevel(): LogLevel {
    const environmentLevel = process.env.LOG_LEVEL?.toUpperCase();

    switch (environmentLevel) {
      case "DEBUG": {
        return LogLevel.DEBUG;
      }
      case "INFO": {
        return LogLevel.INFO;
      }
      case "WARN": {
        return LogLevel.WARN;
      }
      case "ERROR": {
        return LogLevel.ERROR;
      }
      case "SILENT": {
        return LogLevel.SILENT;
      }
      default: {
        return process.env.NODE_ENV === "production" ? LogLevel.INFO : LogLevel.DEBUG;
      }
    }
  }
}

/**
 * Default logger instance for convenient access
 *
 * @public
 */
export const logger = new Logger();
