/**
 * @module lambda/list-functions
 * Lambda list functions command
 *
 * Lists all Lambda functions in the specified region with support for
 * multiple output formats and error handling.
 *
 */

import type { FunctionConfiguration } from "@aws-sdk/client-lambda";
import { Flags } from "@oclif/core";
import { formatLambdaError } from "../../lib/lambda-errors.js";
import type { LambdaListFunctions } from "../../lib/lambda-schemas.js";
import { LambdaListFunctionsSchema } from "../../lib/lambda-schemas.js";
import { LambdaService } from "../../services/lambda-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * Lambda list functions command for discovering available functions
 *
 * Provides a list of all Lambda functions in the specified region
 * with support for multiple output formats and region/profile selection.
 *
 * @public
 */
export default class LambdaListFunctionsCommand extends BaseCommand {
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

      // Display output using BaseCommand method
      if (input.format === "table") {
        this.log(`Found ${functions.length} Lambda functions:\n`);
      }

      // Build display options with conditional transform property
      const displayOptions: {
        emptyMessage: string;
        transform?: (item: unknown) => unknown;
      } = {
        emptyMessage: "No Lambda functions found in the specified region.",
      };

      // Add transform function based on output format
      if (input.format === "table") {
        displayOptions.transform = (item: unknown) => {
          const function_ = item as FunctionConfiguration;
          return {
            "Function Name": function_?.FunctionName ?? "N/A",
            Runtime: function_?.Runtime ?? "N/A",
            "Last Modified": function_?.LastModified ?? "N/A",
            "Memory (MB)": function_?.MemorySize ?? "N/A",
            "Timeout (s)": function_?.Timeout ?? "N/A",
          };
        };
      } else if (input.format === "csv") {
        displayOptions.transform = (item: unknown) => {
          const function_ = item as FunctionConfiguration;
          return {
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
          };
        };
      }

      this.displayOutput(functions, input.format, displayOptions);
    } catch (error) {
      const formattedError = formatLambdaError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }
}
