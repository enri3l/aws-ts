/**
 * Lambda update function code command
 *
 * Updates the code for a Lambda function from ZIP files, S3 buckets,
 * or container images with validation and deployment options.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { getLambdaErrorGuidance } from "../../lib/lambda-errors.js";
import type { LambdaUpdateFunctionCode } from "../../lib/lambda-schemas.js";
import { LambdaUpdateFunctionCodeSchema } from "../../lib/lambda-schemas.js";
import { LambdaService } from "../../services/lambda-service.js";

/**
 * Lambda update function code command for code deployment
 *
 * Updates the deployment package or container image for a Lambda function
 * with support for various code sources and deployment options.
 *
 * @public
 */
export default class LambdaUpdateFunctionCodeCommand extends Command {
  static override readonly description = "Update Lambda function code";

  static override readonly examples = [
    {
      description: "Update function code from ZIP file",
      command: "<%= config.bin %> <%= command.id %> my-function --zip-file fileb://new-function.zip",
    },
    {
      description: "Update function code from S3 bucket",
      command: "<%= config.bin %> <%= command.id %> my-function --s3-bucket my-bucket --s3-key updated-function.zip",
    },
    {
      description: "Update function code with specific S3 version",
      command: "<%= config.bin %> <%= command.id %> my-function --s3-bucket my-bucket --s3-key function.zip --s3-object-version version123",
    },
    {
      description: "Update container image function",
      command: "<%= config.bin %> <%= command.id %> my-function --image-uri 123456789012.dkr.ecr.us-east-1.amazonaws.com/my-func:latest",
    },
    {
      description: "Update code and publish new version",
      command: "<%= config.bin %> <%= command.id %> my-function --zip-file fileb://function.zip --publish",
    },
    {
      description: "Update code with dry run validation",
      command: "<%= config.bin %> <%= command.id %> my-function --zip-file fileb://function.zip --dry-run",
    },
    {
      description: "Update code with revision ID check",
      command: "<%= config.bin %> <%= command.id %> my-function --zip-file fileb://function.zip --revision-id abc123",
    },
  ];

  static override readonly args = {
    functionName: Args.string({
      name: "functionName",
      description: "Name or ARN of the Lambda function to update",
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
      description: "Output format for update result",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    "zip-file": Flags.string({
      description: "Path to ZIP file containing updated function code",
      helpValue: "FILE_PATH",
    }),

    "s3-bucket": Flags.string({
      description: "S3 bucket containing updated function code",
      helpValue: "BUCKET_NAME",
    }),

    "s3-key": Flags.string({
      description: "S3 key for updated function code ZIP file",
      helpValue: "S3_KEY",
    }),

    "s3-object-version": Flags.string({
      description: "S3 object version for the code",
      helpValue: "VERSION_ID",
    }),

    "image-uri": Flags.string({
      description: "Container image URI for the function",
      helpValue: "IMAGE_URI",
    }),

    "image-command": Flags.string({
      description: "Container image command override",
      helpValue: "COMMAND",
      multiple: true,
    }),

    "image-entrypoint": Flags.string({
      description: "Container image entrypoint override",
      helpValue: "ENTRYPOINT",
      multiple: true,
    }),

    "image-working-directory": Flags.string({
      description: "Container image working directory",
      helpValue: "DIRECTORY",
    }),

    "revision-id": Flags.string({
      description: "Revision ID for optimistic locking",
      helpValue: "REVISION_ID",
    }),

    publish: Flags.boolean({
      description: "Publish the function version after updating code",
      default: false,
    }),

    "dry-run": Flags.boolean({
      description: "Validate the code update without applying changes",
      default: false,
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the Lambda update function code command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(LambdaUpdateFunctionCodeCommand);

    try {
      // Validate input using Zod schema
      const input: LambdaUpdateFunctionCode = LambdaUpdateFunctionCodeSchema.parse({
        functionName: args.functionName,
        zipFile: flags["zip-file"],
        s3Bucket: flags["s3-bucket"],
        s3Key: flags["s3-key"],
        s3ObjectVersion: flags["s3-object-version"],
        imageUri: flags["image-uri"],
        imageCommand: flags["image-command"],
        imageEntryPoint: flags["image-entrypoint"],
        imageWorkingDirectory: flags["image-working-directory"],
        revisionId: flags["revision-id"],
        publish: flags.publish,
        dryRun: flags["dry-run"],
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

      // Update function code
      const functionConfig = await lambdaService.updateFunctionCode(
        {
          functionName: input.functionName,
          zipFile: input.zipFile,
          s3Bucket: input.s3Bucket,
          s3Key: input.s3Key,
          s3ObjectVersion: input.s3ObjectVersion,
          imageUri: input.imageUri,
          imageCommand: input.imageCommand,
          imageEntryPoint: input.imageEntryPoint,
          imageWorkingDirectory: input.imageWorkingDirectory,
          revisionId: input.revisionId,
          publish: input.publish,
          dryRun: input.dryRun,
        },
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      // Format output based on requested format
      this.formatAndDisplayOutput(functionConfig, input.format, input.functionName);
    } catch (error) {
      const formattedError = this.formatLambdaError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the code update result
   *
   * @param functionConfig - Updated function configuration
   * @param format - Output format to use
   * @param functionName - Function name for display
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    functionConfig: any,
    format: string,
    functionName: string,
  ): void {
    switch (format) {
      case "table": {
        this.log(`✅ Code Updated: ${functionName}\n`);

        // Basic Information
        this.log("📋 Update Details:");
        const updateInfo = [
          ["Function Name", functionConfig?.FunctionName || "N/A"],
          ["Function ARN", functionConfig?.FunctionArn || "N/A"],
          ["Version", functionConfig?.Version || "N/A"],
          ["Last Modified", functionConfig?.LastModified || "N/A"],
          ["State", functionConfig?.State || "N/A"],
          ["Last Update Status", functionConfig?.LastUpdateStatus || "N/A"],
        ];

        updateInfo.forEach(([key, value]) => {
          this.log(`  ${key}: ${value}`);
        });

        // Code Information
        this.log("\n📦 Code Details:");
        const codeInfo = [
          ["Code Size", `${functionConfig?.CodeSize || 0} bytes`],
          ["Code SHA256", functionConfig?.CodeSha256 || "N/A"],
          ["Package Type", functionConfig?.PackageType || "Zip"],
        ];

        codeInfo.forEach(([key, value]) => {
          this.log(`  ${key}: ${value}`);
        });

        // Runtime Configuration
        this.log("\n⚙️  Runtime Configuration:");
        const runtimeInfo = [
          ["Runtime", functionConfig?.Runtime || "N/A"],
          ["Handler", functionConfig?.Handler || "N/A"],
          ["Memory Size", `${functionConfig?.MemorySize || 0} MB`],
          ["Timeout", `${functionConfig?.Timeout || 0} seconds`],
        ];

        runtimeInfo.forEach(([key, value]) => {
          this.log(`  ${key}: ${value}`);
        });

        break;
      }
      case "json": {
        const processor = new DataProcessor({ format: DataFormat.JSON });
        const output = processor.formatOutput([{ data: functionConfig, index: 0 }]);
        this.log(output);
        break;
      }
      case "jsonl": {
        const processor = new DataProcessor({ format: DataFormat.JSONL });
        const output = processor.formatOutput([{ data: functionConfig, index: 0 }]);
        this.log(output);
        break;
      }
      case "csv": {
        // Flatten function configuration for CSV output
        const flattenedData = {
          FunctionName: functionConfig?.FunctionName || "",
          FunctionArn: functionConfig?.FunctionArn || "",
          Version: functionConfig?.Version || "",
          LastModified: functionConfig?.LastModified || "",
          State: functionConfig?.State || "",
          LastUpdateStatus: functionConfig?.LastUpdateStatus || "",
          CodeSize: functionConfig?.CodeSize || 0,
          CodeSha256: functionConfig?.CodeSha256 || "",
          PackageType: functionConfig?.PackageType || "",
          Runtime: functionConfig?.Runtime || "",
          Handler: functionConfig?.Handler || "",
          MemorySize: functionConfig?.MemorySize || 0,
          Timeout: functionConfig?.Timeout || 0,
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