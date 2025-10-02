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
import { formatLambdaError } from "../../lib/lambda-errors.js";
import type { LambdaListVersions } from "../../lib/lambda-schemas.js";
import { LambdaListVersionsSchema } from "../../lib/lambda-schemas.js";
import { LambdaService } from "../../services/lambda-service.js";
import { BaseCommand } from "../base-command.js";

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
    ...BaseCommand.commonFlags,

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
      const versions = await lambdaService.listVersionsByFunction(
        input.functionName,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.marker,
        input.maxItems,
      );

      // Display output using BaseCommand method
      if (input.format === "table") {
        this.log(`Found ${versions.length} versions for function: ${input.functionName}\n`);
      }

      if (input.format === "json") {
        // Special JSON format with metadata
        const result = {
          versions,
          totalCount: versions.length,
          functionName: input.functionName,
        };
        this.log(JSON.stringify(result, undefined, 2));
      } else {
        // Build display options with conditional transform property
        const displayOptions: {
          emptyMessage: string;
          transform?: (item: unknown) => unknown;
        } = {
          emptyMessage: `No versions found for function '${input.functionName}'.`,
        };

        // Add transform function based on output format
        if (input.format === "table") {
          displayOptions.transform = (item: unknown) => {
            const version = item as FunctionConfiguration;
            return {
              Version: version.Version === "$LATEST" ? "$LATEST" : `v${version.Version ?? ""}`,
              Description: version.Description ?? "No description",
              Runtime: version.Runtime ?? "N/A",
              "Last Modified": version.LastModified ?? "N/A",
              "Code Size": `${version.CodeSize ?? 0} bytes`,
              State: version.State ?? "N/A",
            };
          };
        } else if (input.format === "csv") {
          displayOptions.transform = (item: unknown) => {
            const version = item as FunctionConfiguration;
            return {
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
            };
          };
        }

        this.displayOutput(versions, input.format, displayOptions);
      }
    } catch (error) {
      const formattedError = formatLambdaError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }
}
