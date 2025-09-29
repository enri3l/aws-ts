/**
 * Lambda list functions command
 *
 * Lists all Lambda functions in the specified region with support for
 * multiple output formats and error handling.
 *
 */

import type { FunctionConfiguration } from "@aws-sdk/client-lambda";
import { Command, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { getLambdaErrorGuidance } from "../../lib/lambda-errors.js";
import type { LambdaListFunctions } from "../../lib/lambda-schemas.js";
import { LambdaListFunctionsSchema } from "../../lib/lambda-schemas.js";
import { LambdaService } from "../../services/lambda-service.js";

/**
 * Extended function configuration with index signature for data processing
 *
 * @internal
 */
interface ExtendedFunctionConfiguration extends FunctionConfiguration {
  /**
   * Index signature for data processing compatibility
   */
  [key: string]: unknown;
}

/**
 * Lambda list functions command for discovering available functions
 *
 * Provides a list of all Lambda functions in the specified region
 * with support for multiple output formats and region/profile selection.
 *
 * @public
 */
export default class LambdaListFunctionsCommand extends Command {
  static override readonly description = "List all Lambda functions in the region";

  static override readonly examples = [
    {
      description: "List all functions in the current region",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "List functions with JSON output format",
      command: "<%= config.bin %> <%= command.id %> --format json",
    },
    {
      description: "List functions in a specific region",
      command: "<%= config.bin %> <%= command.id %> --region us-west-2",
    },
    {
      description: "List all function versions including $LATEST",
      command: "<%= config.bin %> <%= command.id %> --function-version ALL",
    },
    {
      description: "List functions using a specific AWS profile with CSV output",
      command: "<%= config.bin %> <%= command.id %> --profile production --format csv",
    },
    {
      description: "List first 20 functions with pagination",
      command: "<%= config.bin %> <%= command.id %> --max-items 20",
    },
  ];

  static override readonly flags = {
    region: Flags.string({
      char: "r",
      description: "AWS region to list functions from",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for function list",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    "function-version": Flags.string({
      description: "Function version to list",
      options: ["ALL", "$LATEST"],
      default: "$LATEST",
    }),

    "max-items": Flags.integer({
      description: "Maximum number of functions to return",
      min: 1,
      max: 10_000,
      helpValue: "NUMBER",
    }),

    marker: Flags.string({
      description: "Pagination marker for next page of results",
      helpValue: "MARKER",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the Lambda list functions command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(LambdaListFunctionsCommand);

    try {
      // Validate input using Zod schema
      const input: LambdaListFunctions = LambdaListFunctionsSchema.parse({
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        functionVersion: flags["function-version"],
        maxItems: flags["max-items"],
        marker: flags.marker,
        verbose: flags.verbose,
      });

      // Create Lambda service instance
      const lambdaService = new LambdaService({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      // List functions from Lambda
      const functions = await lambdaService.listFunctions(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          ...(input.functionVersion === "ALL" && { FunctionVersion: input.functionVersion }),
          MaxItems: input.maxItems,
          Marker: input.marker,
        },
      );

      // Format output based on requested format
      this.formatAndDisplayOutput(functions, input.format);
    } catch (error) {
      const formattedError = this.formatLambdaError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the function list output
   *
   * @param functions - Array of function configurations to display
   * @param format - Output format to use
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(functions: FunctionConfiguration[], format: string): void {
    if (functions.length === 0) {
      this.log("No Lambda functions found in the specified region.");
      return;
    }

    switch (format) {
      case "table": {
        this.log(`Found ${functions.length} Lambda functions:\n`);
        const tableData = functions.map((function_, index) => ({
          "#": index + 1,
          "Function Name": function_?.FunctionName ?? "N/A",
          Runtime: function_?.Runtime ?? "N/A",
          "Last Modified": function_?.LastModified ?? "N/A",
          "Memory (MB)": function_?.MemorySize ?? "N/A",
          "Timeout (s)": function_?.Timeout ?? "N/A",
        }));

        // Use DataProcessor for consistent table formatting
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
          functions.map((function_, index) => ({
            data: function_ as ExtendedFunctionConfiguration,
            index,
          })),
        );
        this.log(output);
        break;
      }
      case "jsonl": {
        const processor = new DataProcessor({ format: DataFormat.JSONL });
        const output = processor.formatOutput(
          functions.map((function_, index) => ({
            data: function_ as ExtendedFunctionConfiguration,
            index,
          })),
        );
        this.log(output);
        break;
      }
      case "csv": {
        // Flatten function objects for CSV output
        const flattenedData = functions.map((function_) => ({
          FunctionName: function_?.FunctionName ?? "",
          FunctionArn: function_?.FunctionArn ?? "",
          Runtime: function_?.Runtime ?? "",
          Role: function_?.Role ?? "",
          Handler: function_?.Handler ?? "",
          CodeSize: function_?.CodeSize ?? 0,
          Description: function_?.Description ?? "",
          Timeout: function_?.Timeout ?? 0,
          MemorySize: function_?.MemorySize ?? 0,
          LastModified: function_?.LastModified ?? "",
          CodeSha256: function_?.CodeSha256 ?? "",
          Version: function_?.Version ?? "",
          State: function_?.State ?? "",
          StateReason: function_?.StateReason ?? "",
          LastUpdateStatus: function_?.LastUpdateStatus ?? "",
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

  /**
   * Format Lambda-specific errors with user guidance
   *
   * @param error - The error to format
   * @param verbose - Whether to include verbose error details
   * @returns Formatted error message with guidance
   * @internal
   */
  private formatLambdaError(error: unknown, verbose: boolean): string {
    const guidance = getLambdaErrorGuidance(error);

    if (verbose && error instanceof Error) {
      return `${error.message}\n\n${guidance}`;
    }

    if (error instanceof Error) {
      return `${error.message}\n\n${guidance}`;
    }

    return `An unknown error occurred\n\n${guidance}`;
  }
}
