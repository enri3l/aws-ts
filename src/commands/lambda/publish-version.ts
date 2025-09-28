/**
 * Lambda publish version command
 *
 * Creates a new version of a Lambda function from the current $LATEST version
 * with optional description and code SHA validation for consistency.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { getLambdaErrorGuidance } from "../../lib/lambda-errors.js";
import type { LambdaPublishVersion } from "../../lib/lambda-schemas.js";
import { LambdaPublishVersionSchema } from "../../lib/lambda-schemas.js";
import { LambdaService } from "../../services/lambda-service.js";

/**
 * Lambda publish version command for version creation
 *
 * Creates a new immutable version of a Lambda function from the current
 * $LATEST version with optional description and validation options.
 *
 * @public
 */
export default class LambdaPublishVersionCommand extends Command {
  static override readonly description = "Publish a new Lambda function version";

  static override readonly examples = [
    {
      description: "Publish a new version with default description",
      command: "<%= config.bin %> <%= command.id %> my-function",
    },
    {
      description: "Publish a version with custom description",
      command: "<%= config.bin %> <%= command.id %> my-function --description 'Release v2.1.0 with bug fixes'",
    },
    {
      description: "Publish version with code SHA validation",
      command: "<%= config.bin %> <%= command.id %> my-function --code-sha256 abc123def456... --description 'Validated release'",
    },
    {
      description: "Publish version with revision ID for optimistic locking",
      command: "<%= config.bin %> <%= command.id %> my-function --revision-id rev123 --description 'Safe publish'",
    },
    {
      description: "Publish version in specific region",
      command: "<%= config.bin %> <%= command.id %> my-function --region us-west-2 --description 'West coast deployment'",
    },
    {
      description: "Publish version with JSON output",
      command: "<%= config.bin %> <%= command.id %> my-function --format json --description 'API deployment'",
    },
  ];

  static override readonly args = {
    functionName: Args.string({
      name: "functionName",
      description: "Name or ARN of the Lambda function to publish",
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
      description: "Output format for version publication result",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    description: Flags.string({
      char: "d",
      description: "Description for the new version",
      helpValue: "DESCRIPTION",
    }),

    "code-sha256": Flags.string({
      description: "Expected SHA256 hash of the function code for validation",
      helpValue: "SHA256_HASH",
    }),

    "revision-id": Flags.string({
      description: "Revision ID for optimistic locking",
      helpValue: "REVISION_ID",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the Lambda publish version command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(LambdaPublishVersionCommand);

    try {
      // Validate input using Zod schema
      const input: LambdaPublishVersion = LambdaPublishVersionSchema.parse({
        functionName: args.functionName,
        description: flags.description,
        codeSha256: flags["code-sha256"],
        revisionId: flags["revision-id"],
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

      // Publish the function version
      const versionConfig = await lambdaService.publishVersion(
        input.functionName,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.description,
        input.revisionId,
      );

      // Format output based on requested format
      this.formatAndDisplayOutput(versionConfig, input.format, input.functionName);
    } catch (error) {
      const formattedError = this.formatLambdaError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the version publication result
   *
   * @param versionConfig - Published version configuration
   * @param format - Output format to use
   * @param functionName - Function name for display
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    versionConfig: any,
    format: string,
    functionName: string,
  ): void {
    switch (format) {
      case "table": {
        this.log(`✅ Version Published: ${functionName}\n`);

        // Version Information
        this.log("📋 Version Details:");
        const versionInfo = [
          ["Function Name", versionConfig?.FunctionName || "N/A"],
          ["Function ARN", versionConfig?.FunctionArn || "N/A"],
          ["Version", versionConfig?.Version || "N/A"],
          ["Description", versionConfig?.Description || "No description"],
          ["State", versionConfig?.State || "N/A"],
          ["Last Modified", versionConfig?.LastModified || "N/A"],
        ];

        versionInfo.forEach(([key, value]) => {
          this.log(`  ${key}: ${value}`);
        });

        // Code Information
        this.log("\n📦 Code Details:");
        const codeInfo = [
          ["Code Size", `${versionConfig?.CodeSize || 0} bytes`],
          ["Code SHA256", versionConfig?.CodeSha256 || "N/A"],
          ["Package Type", versionConfig?.PackageType || "Zip"],
        ];

        codeInfo.forEach(([key, value]) => {
          this.log(`  ${key}: ${value}`);
        });

        // Runtime Configuration
        this.log("\n⚙️  Runtime Configuration:");
        const runtimeInfo = [
          ["Runtime", versionConfig?.Runtime || "N/A"],
          ["Handler", versionConfig?.Handler || "N/A"],
          ["Memory Size", `${versionConfig?.MemorySize || 0} MB`],
          ["Timeout", `${versionConfig?.Timeout || 0} seconds`],
        ];

        runtimeInfo.forEach(([key, value]) => {
          this.log(`  ${key}: ${value}`);
        });

        // IAM Role
        this.log("\n🔐 IAM Configuration:");
        this.log(`  Role: ${versionConfig?.Role || "N/A"}`);

        // Environment Variables
        if (versionConfig?.Environment?.Variables && Object.keys(versionConfig.Environment.Variables).length > 0) {
          this.log("\n🌍 Environment Variables:");
          Object.entries(versionConfig.Environment.Variables).forEach(([key, value]) => {
            this.log(`  ${key}: ${value}`);
          });
        }

        // Layers
        if (versionConfig?.Layers && versionConfig.Layers.length > 0) {
          this.log("\n📦 Layers:");
          versionConfig.Layers.forEach((layer: any, index: number) => {
            this.log(`  ${index + 1}. ${layer.Arn}`);
          });
        }

        this.log("\n💡 Note: This version is now immutable and can be referenced by version number or alias.");
        break;
      }
      case "json": {
        const processor = new DataProcessor({ format: DataFormat.JSON });
        const output = processor.formatOutput([{ data: versionConfig, index: 0 }]);
        this.log(output);
        break;
      }
      case "jsonl": {
        const processor = new DataProcessor({ format: DataFormat.JSONL });
        const output = processor.formatOutput([{ data: versionConfig, index: 0 }]);
        this.log(output);
        break;
      }
      case "csv": {
        // Flatten version configuration for CSV output
        const flattenedData = {
          FunctionName: versionConfig?.FunctionName || "",
          FunctionArn: versionConfig?.FunctionArn || "",
          Version: versionConfig?.Version || "",
          Description: versionConfig?.Description || "",
          State: versionConfig?.State || "",
          LastModified: versionConfig?.LastModified || "",
          CodeSize: versionConfig?.CodeSize || 0,
          CodeSha256: versionConfig?.CodeSha256 || "",
          PackageType: versionConfig?.PackageType || "",
          Runtime: versionConfig?.Runtime || "",
          Handler: versionConfig?.Handler || "",
          MemorySize: versionConfig?.MemorySize || 0,
          Timeout: versionConfig?.Timeout || 0,
          Role: versionConfig?.Role || "",
          LayerCount: versionConfig?.Layers?.length || 0,
          EnvironmentVariableCount: Object.keys(versionConfig?.Environment?.Variables || {}).length,
        };

        const processor = new DataProcessor({ format: DataFormat.CSV });
        const output = processor.formatOutput([{ data: flattenedData, index: 0 }]);
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