/**
 * @module lambda/list-versions
 * Lambda list versions command
 *
 * Lists all versions of a Lambda function including $LATEST with support
 * for pagination and version information display.
 *
 */

import type { FunctionConfiguration } from "@aws-sdk/client-lambda";
import { Args, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { formatLambdaError } from "../../lib/lambda-errors.js";
import type { LambdaListVersions } from "../../lib/lambda-schemas.js";
import { LambdaListVersionsSchema } from "../../lib/lambda-schemas.js";
import { LambdaService } from "../../services/lambda-service.js";
import { BaseCommand } from "../base-command.js";

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
 * Lambda list versions command for version discovery
 *
 * Lists all versions of a Lambda function with version information
 * and support for pagination and multiple output formats.
 *
 * @public
 */
export default class LambdaListVersionsCommand extends BaseCommand {
  static override readonly description = "List all versions of a Lambda function";

  static override readonly examples = [
    {
      description: "List all versions of a function",
      command: "<%= config.bin %> <%= command.id %> my-function",
    },
    {
      description: "List versions with JSON output",
      command: "<%= config.bin %> <%= command.id %> my-function --format json",
    },
    {
      description: "List first 10 versions with pagination",
      command: "<%= config.bin %> <%= command.id %> my-function --max-items 10",
    },
    {
      description: "List versions in specific region",
      command: "<%= config.bin %> <%= command.id %> my-function --region us-west-2",
    },
    {
      description: "List versions using specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> my-function --profile production",
    },
    {
      description: "List versions with CSV output for analysis",
      command: "<%= config.bin %> <%= command.id %> my-function --format csv",
    },
    {
      description: "Continue from previous page using marker",
      command: "<%= config.bin %> <%= command.id %> my-function --marker next-page-token",
    },
  ];

  static override readonly args = {
    functionName: Args.string({
      name: "functionName",
      description: "Name or ARN of the Lambda function",
      required: true,
    }),
  };

  static override readonly flags = {
    region: Flags.string({
      char: "r",
      description: "AWS region containing the function",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for version list",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    "max-items": Flags.integer({
      description: "Maximum number of versions to return",
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
   * Execute the Lambda list versions command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(LambdaListVersionsCommand);

    try {
      // Validate input using Zod schema
      const input: LambdaListVersions = LambdaListVersionsSchema.parse({
        functionName: args.functionName,
        maxItems: flags["max-items"],
        marker: flags.marker,
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
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

      // List function versions
      const versionsResult = await lambdaService.listVersionsByFunction(
        input.functionName,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.marker,
        input.maxItems,
      );

      // Format output based on requested format
      this.formatAndDisplayOutput(versionsResult, input.format, input.functionName);
    } catch (error) {
      const formattedError = formatLambdaError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the versions list output
   *
   * @param versionsResult - Versions list to display
   * @param format - Output format to use
   * @param functionName - Function name for display
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    versionsResult: FunctionConfiguration[],
    format: string,
    functionName: string,
  ): void {
    const versions = versionsResult;

    if (versions.length === 0) {
      this.log(`No versions found for function '${functionName}'.`);
      return;
    }

    switch (format) {
      case "table": {
        this.log(`Found ${versions.length} versions for function: ${functionName}\n`);

        // Summary table
        const tableData = versions.map((version: FunctionConfiguration, index: number) => ({
          "#": index + 1,
          Version: version.Version === "$LATEST" ? "$LATEST" : `v${version.Version ?? ""}`,
          Description: version.Description ?? "No description",
          Runtime: version.Runtime ?? "N/A",
          "Last Modified": version.LastModified ?? "N/A",
          "Code Size": `${version.CodeSize ?? 0} bytes`,
          State: version.State ?? "N/A",
        }));

        // Use DataProcessor for consistent table formatting
        const processor = new DataProcessor({ format: DataFormat.CSV });
        const output = processor.formatOutput(
          tableData.map((item: Record<string, unknown>, index: number) => ({ data: item, index })),
        );
        this.log(output);
        break;
      }
      case "json": {
        const result = {
          versions,
          totalCount: versions.length,
          functionName,
        };

        const processor = new DataProcessor({ format: DataFormat.JSON });
        const output = processor.formatOutput([{ data: result, index: 0 }]);
        this.log(output);
        break;
      }
      case "jsonl": {
        const processor = new DataProcessor({ format: DataFormat.JSONL });
        const output = processor.formatOutput(
          versions.map((version: FunctionConfiguration, index: number) => ({
            data: version as ExtendedFunctionConfiguration,
            index,
          })),
        );
        this.log(output);
        break;
      }
      case "csv": {
        // Flatten versions for CSV output
        const flattenedData = versions.map((version: FunctionConfiguration) => ({
          FunctionName: version.FunctionName ?? "",
          FunctionArn: version.FunctionArn ?? "",
          Version: version.Version ?? "",
          Description: version.Description ?? "",
          Runtime: version.Runtime ?? "",
          Role: version.Role ?? "",
          Handler: version.Handler ?? "",
          CodeSize: version.CodeSize ?? 0,
          Timeout: version.Timeout ?? 0,
          MemorySize: version.MemorySize ?? 0,
          LastModified: version.LastModified ?? "",
          CodeSha256: version.CodeSha256 ?? "",
          State: version.State ?? "",
          StateReason: version.StateReason ?? "",
          LastUpdateStatus: version.LastUpdateStatus ?? "",
          PackageType: version.PackageType ?? "",
          VpcId: version.VpcConfig?.VpcId ?? "",
          LayerCount: version.Layers?.length ?? 0,
          EnvironmentVariableCount: Object.keys(version.Environment?.Variables ?? {}).length,
        }));

        const processor = new DataProcessor({ format: DataFormat.CSV });
        const output = processor.formatOutput(
          flattenedData.map((item: Record<string, unknown>, index: number) => ({
            data: item,
            index,
          })),
        );
        this.log(output);
        break;
      }
      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }
}
