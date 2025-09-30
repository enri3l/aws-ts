/**
 * @module base-command
 * Base command class for standardized command patterns
 *
 * Provides common functionality for all CLI commands including error handling,
 * output formatting, and configuration management. All commands should extend
 * this base class to ensure consistent patterns across the codebase.
 *
 * @remarks
 * This base class eliminates code duplication across command implementations by
 * centralizing common patterns like error formatting, output rendering, and
 * service configuration. Commands that extend this class only need to implement
 * their specific business logic.
 *
 * @example Basic command implementation
 * ```typescript
 * export default class MyCommand extends BaseCommand {
 *   static override readonly description = "My command description";
 *
 *   static override readonly flags = {
 *     ...BaseCommand.commonFlags,
 *     myFlag: Flags.string({ description: "Custom flag" }),
 *   };
 *
 *   async run(): Promise<void> {
 *     const { flags } = await this.parse(MyCommand);
 *
 *     try {
 *       const service = new MyService(this.getServiceConfig(flags));
 *       const result = await service.myOperation();
 *       this.displayOutput(result, flags.format);
 *     } catch (error) {
 *       const formattedError = formatMyServiceError(error, "my operation", flags.verbose);
 *       this.error(formattedError, { exit: 1 });
 *     }
 *   }
 * }
 * ```
 *
 * @public
 */

import { Command, Flags } from "@oclif/core";
import { ZodError } from "zod";
import { DataFormat, DataProcessor } from "../lib/data-processing.js";
import {
  ApiError,
  BaseError,
  ConfigurationError,
  formatErrorWithGuidance,
  sanitizeErrorForVerboseOutput,
  TimeoutError,
  UserConfigurationError,
  ValidationError,
} from "../lib/errors.js";

/**
 * Output format options for command results
 *
 * @public
 */
export type OutputFormat = "table" | "json" | "jsonl" | "csv";

/**
 * Base service configuration options
 *
 * @public
 */
export interface BaseServiceConfig {
  /** Enable debug logging */
  enableDebugLogging?: boolean;
  /** Enable progress indicators */
  enableProgressIndicators?: boolean;
  /** Client configuration */
  clientConfig?: {
    /** AWS region */
    region?: string;
    /** AWS profile */
    profile?: string;
  };
}

/**
 * Base command class providing common functionality for all commands
 *
 * @remarks
 * Provides centralized patterns for:
 * - Error handling with formatted guidance
 * - Output formatting across multiple formats (table, json, jsonl, csv)
 * - Service configuration management
 * - Common flag definitions
 *
 * All commands should extend this class to maintain consistency
 * and reduce code duplication across the codebase.
 *
 * @public
 */
export abstract class BaseCommand extends Command {
  /**
   * Common flags shared across all commands
   *
   * @remarks
   * Provides standard flags for region, profile, format, and verbose output.
   * Commands can spread these flags into their own static flags definition.
   *
   * @example
   * ```typescript
   * static override readonly flags = {
   *   ...BaseCommand.commonFlags,
   *   customFlag: Flags.string({ description: "Custom flag" }),
   * };
   * ```
   */
  static readonly commonFlags = {
    region: Flags.string({
      char: "r",
      description: "AWS region",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
      helpValue: "FORMAT",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Format Zod validation errors
   *
   * @param error - ZodError instance
   * @param contextPrefix - Optional context prefix for the error message
   * @returns Formatted validation error message
   */
  private formatZodError(error: ZodError, contextPrefix: string): string {
    const issues = error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    return `${contextPrefix}Validation failed - ${issues}`;
  }

  /**
   * Format BaseError and its subclasses
   *
   * @param error - BaseError instance
   * @param contextPrefix - Optional context prefix for the error message
   * @param verbose - Whether to include verbose details
   * @returns Formatted error message with optional metadata, cause, and stack trace
   */
  private formatBaseError(error: BaseError, contextPrefix: string, verbose: boolean): string {
    // Use formatErrorWithGuidance for errors with guidance support
    if (
      error instanceof ValidationError ||
      error instanceof UserConfigurationError ||
      error instanceof ConfigurationError
    ) {
      return formatErrorWithGuidance(error, verbose);
    }

    // For other BaseError subclasses, format with context and optional metadata
    let message = `${contextPrefix}${error.message}`;

    if (verbose && error.metadata) {
      const sanitized = sanitizeErrorForVerboseOutput(error.metadata);
      message += `\n\nMetadata:\n${JSON.stringify(sanitized, undefined, 2)}`;
    }

    if (verbose && error.cause) {
      message += `\n\nCause: ${error.cause instanceof Error ? error.cause.message : JSON.stringify(error.cause)}`;
    }

    if (verbose && error.stack) {
      message += `\n\nStack trace:\n${error.stack}`;
    }

    return message;
  }

  /**
   * Format API errors
   *
   * @param error - ApiError instance
   * @param contextPrefix - Optional context prefix for the error message
   * @param verbose - Whether to include verbose details
   * @returns Formatted API error message with optional metadata
   */
  private formatApiError(error: ApiError, contextPrefix: string, verbose: boolean): string {
    let message = `${contextPrefix}AWS API error - ${error.message}`;

    if (verbose && error.metadata) {
      const sanitized = sanitizeErrorForVerboseOutput(error.metadata);
      message += `\n\nMetadata:\n${JSON.stringify(sanitized, undefined, 2)}`;
    }

    return message;
  }

  /**
   * Format generic Error instances
   *
   * @param error - Error instance
   * @param contextPrefix - Optional context prefix for the error message
   * @param verbose - Whether to include verbose details
   * @returns Formatted error message with optional stack trace
   */
  private formatGenericError(error: Error, contextPrefix: string, verbose: boolean): string {
    let message = `${contextPrefix}${error.message}`;

    if (verbose && error.stack) {
      message += `\n\nStack trace:\n${error.stack}`;
    }

    return message;
  }

  /**
   * Format error with context and guidance
   *
   * @param error - Error to format
   * @param verbose - Whether to include verbose details
   * @param context - Operation context for error message
   * @returns Formatted error message
   *
   * @remarks
   * Handles all common error types including:
   * - Zod validation errors (schema parsing failures)
   * - BaseError subclasses (domain-specific errors)
   * - AWS SDK errors (API failures)
   * - Generic errors
   *
   * Automatically includes stack traces and metadata in verbose mode.
   */
  protected formatError(error: unknown, verbose = false, context?: string): string {
    const contextPrefix = context ? `${context}: ` : "";

    if (error instanceof ZodError) {
      return this.formatZodError(error, contextPrefix);
    }

    if (error instanceof BaseError) {
      return this.formatBaseError(error, contextPrefix, verbose);
    }

    if (error instanceof ApiError) {
      return this.formatApiError(error, contextPrefix, verbose);
    }

    if (error instanceof TimeoutError) {
      return `${contextPrefix}Operation timed out - ${error.message}`;
    }

    if (error instanceof Error) {
      return this.formatGenericError(error, contextPrefix, verbose);
    }

    return `${contextPrefix}${String(error)}`;
  }

  /**
   * Get service configuration from flags
   *
   * @param flags - Command flags containing configuration
   * @returns Service configuration object
   *
   * @remarks
   * Creates a standardized service configuration object from command flags.
   * Includes debug logging, progress indicators, and AWS client configuration.
   *
   * @example
   * ```typescript
   * const config = this.getServiceConfig(flags);
   * const service = new MyService(config);
   * ```
   */
  protected getServiceConfig(flags: {
    verbose?: boolean;
    region?: string;
    profile?: string;
  }): BaseServiceConfig {
    return {
      enableDebugLogging: flags.verbose ?? false,
      enableProgressIndicators: true,
      clientConfig: {
        ...(flags.region && { region: flags.region }),
        ...(flags.profile && { profile: flags.profile }),
      },
    };
  }

  /**
   * Display output in specified format
   *
   * @param data - Data to display
   * @param format - Output format (table, json, jsonl, csv)
   * @param options - Optional formatting options
   *
   * @remarks
   * Provides consistent output formatting across all commands.
   * Supports table, JSON, JSON Lines, and CSV formats with proper
   * formatting and escaping.
   *
   * For table and CSV formats, uses DataProcessor for consistent
   * rendering with proper CSV formula injection protection.
   *
   * @example
   * ```typescript
   * this.displayOutput(
   *   results,
   *   flags.format,
   *   { emptyMessage: "No results found" }
   * );
   * ```
   *
   * @throws \{Error\} When the specified format is unsupported
   */
  protected displayOutput(
    data: unknown[],
    format: string = "table",
    options?: {
      /** Message to display when data is empty */
      emptyMessage?: string;
      /** Custom table headers (if different from data keys) */
      headers?: string[];
      /** Transform function to apply to each item before display */
      transform?: (item: unknown) => unknown;
    },
  ): void {
    // Handle empty data
    if (!data || data.length === 0) {
      this.log(options?.emptyMessage ?? "No results found.");
      return;
    }

    // Apply transform if provided
    const transformedData = options?.transform
      ? data.map((item) => options.transform!(item))
      : data;

    switch (format) {
      case "table":
      case "csv": {
        const processor = new DataProcessor({ format: DataFormat.CSV });
        const output = processor.formatOutput(
          transformedData.map((item, index) => ({
            data: item as Record<string, unknown>,
            index,
          })),
        );
        this.log(output);
        break;
      }

      case "json": {
        this.log(JSON.stringify(transformedData, undefined, 2));
        break;
      }

      case "jsonl": {
        for (const item of transformedData) {
          this.log(JSON.stringify(item));
        }
        break;
      }

      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }

  /**
   * Display a single object in specified format
   *
   * @param data - Object to display
   * @param format - Output format (table, json, jsonl, csv)
   *
   * @remarks
   * Convenience method for displaying single objects.
   * Wraps the object in an array and calls displayOutput.
   *
   * @example
   * ```typescript
   * this.displaySingleObject(result, flags.format);
   * ```
   */
  protected displaySingleObject(data: unknown, format: string = "json"): void {
    if (format === "json") {
      this.log(JSON.stringify(data, undefined, 2));
    } else if (format === "jsonl") {
      this.log(JSON.stringify(data));
    } else {
      // For table and CSV, wrap in array
      this.displayOutput([data], format);
    }
  }

  /**
   * Log message only in verbose mode
   *
   * @param message - Message to log
   * @param verbose - Whether verbose mode is enabled
   *
   * @remarks
   * Convenience method for conditional logging based on verbose flag.
   *
   * @example
   * ```typescript
   * this.verboseLog("Processing item...", flags.verbose);
   * ```
   */
  protected verboseLog(message: string, verbose = false): void {
    if (verbose) {
      this.log(message);
    }
  }
}
