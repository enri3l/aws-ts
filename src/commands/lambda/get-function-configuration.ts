/**
 * Lambda get function configuration command
 *
 * Retrieves function configuration details including runtime settings,
 * environment variables, and execution parameters without code information.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { getLambdaErrorGuidance } from "../../lib/lambda-errors.js";
import type { LambdaGetFunctionConfiguration } from "../../lib/lambda-schemas.js";
import { LambdaGetFunctionConfigurationSchema } from "../../lib/lambda-schemas.js";
import { LambdaService } from "../../services/lambda-service.js";

/**
 * Lambda get function configuration command for retrieving function settings
 *
 * Provides configuration information about a Lambda function including
 * runtime settings, environment variables, and execution parameters.
 *
 * @public
 */
export default class LambdaGetFunctionConfigurationCommand extends Command {
  static override readonly description = "Get Lambda function configuration details";

  static override readonly examples = [
    {
      description: "Get function configuration with table format",
      command: "<%= config.bin %> <%= command.id %> my-function",
    },
    {
      description: "Get function configuration with JSON output",
      command: "<%= config.bin %> <%= command.id %> my-function --format json",
    },
    {
      description: "Get configuration for a specific function version",
      command: "<%= config.bin %> <%= command.id %> my-function --qualifier v1",
    },
    {
      description: "Get function configuration in a specific region",
      command: "<%= config.bin %> <%= command.id %> my-function --region us-west-2",
    },
    {
      description: "Get configuration using a specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> my-function --profile production",
    },
    {
      description: "Get function configuration with CSV output for analysis",
      command: "<%= config.bin %> <%= command.id %> my-function --format csv",
    },
    {
      description: "Verbose configuration retrieval with debug information",
      command: "<%= config.bin %> <%= command.id %> my-function --verbose",
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
      description: "Output format for configuration data",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    qualifier: Flags.string({
      char: "q",
      description: "Function version or alias",
      helpValue: "VERSION_OR_ALIAS",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the Lambda get function configuration command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(LambdaGetFunctionConfigurationCommand);

    try {
      // Validate input using Zod schema
      const input: LambdaGetFunctionConfiguration = LambdaGetFunctionConfigurationSchema.parse({
        functionName: args.functionName,
        qualifier: flags.qualifier,
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

      // Get function configuration from Lambda
      const functionConfig = await lambdaService.getFunctionConfiguration(
        input.functionName,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.qualifier,
      );

      // Format output based on requested format
      this.formatAndDisplayOutput(functionConfig, input.format, input.functionName);
    } catch (error) {
      const formattedError = this.formatLambdaError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the function configuration output
   *
   * @param functionConfig - Function configuration to display
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
        this.log(`Function Configuration: ${functionName}\n`);

        // Basic Configuration
        this.log("📋 Basic Configuration:");
        const basicConfig = [
          ["Function Name", functionConfig?.FunctionName || "N/A"],
          ["Function ARN", functionConfig?.FunctionArn || "N/A"],
          ["Runtime", functionConfig?.Runtime || "N/A"],
          ["Handler", functionConfig?.Handler || "N/A"],
          ["Description", functionConfig?.Description || "No description"],
          ["State", functionConfig?.State || "N/A"],
          ["State Reason", functionConfig?.StateReason || "N/A"],
          ["Last Modified", functionConfig?.LastModified || "N/A"],
          ["Version", functionConfig?.Version || "N/A"],
          ["Last Update Status", functionConfig?.LastUpdateStatus || "N/A"],
        ];

        basicConfig.forEach(([key, value]) => {
          this.log(`  ${key}: ${value}`);
        });

        // Resource Configuration
        this.log("\n⚙️  Resource Configuration:");
        const resourceConfig = [
          ["Memory Size", `${functionConfig?.MemorySize || 0} MB`],
          ["Timeout", `${functionConfig?.Timeout || 0} seconds`],
          ["Ephemeral Storage", `${functionConfig?.EphemeralStorage?.Size || 512} MB`],
          ["Code Size", `${functionConfig?.CodeSize || 0} bytes`],
          ["Code SHA256", functionConfig?.CodeSha256 || "N/A"],
          ["Package Type", functionConfig?.PackageType || "Zip"],
        ];

        resourceConfig.forEach(([key, value]) => {
          this.log(`  ${key}: ${value}`);
        });

        // IAM Role and Execution
        this.log("\n🔐 IAM and Execution:");
        this.log(`  Role: ${functionConfig?.Role || "N/A"}`);
        if (functionConfig?.DeadLetterConfig?.TargetArn) {
          this.log(`  Dead Letter Queue: ${functionConfig.DeadLetterConfig.TargetArn}`);
        }

        // Concurrency Configuration
        if (functionConfig?.ReservedConcurrencyLimit !== undefined) {
          this.log("\n🚀 Concurrency Configuration:");
          this.log(`  Reserved Concurrency: ${functionConfig.ReservedConcurrencyLimit}`);
        }

        // VPC Configuration
        if (functionConfig?.VpcConfig && functionConfig.VpcConfig.VpcId) {
          this.log("\n🌐 VPC Configuration:");
          this.log(`  VPC ID: ${functionConfig.VpcConfig.VpcId}`);
          this.log(`  Subnets: ${functionConfig.VpcConfig.SubnetIds?.join(", ") || "None"}`);
          this.log(`  Security Groups: ${functionConfig.VpcConfig.SecurityGroupIds?.join(", ") || "None"}`);
        }

        // Environment Variables
        if (functionConfig?.Environment?.Variables && Object.keys(functionConfig.Environment.Variables).length > 0) {
          this.log("\n🌍 Environment Variables:");
          Object.entries(functionConfig.Environment.Variables).forEach(([key, value]) => {
            this.log(`  ${key}: ${value}`);
          });
        }

        // KMS Configuration
        if (functionConfig?.KMSKeyArn) {
          this.log("\n🔒 Encryption:");
          this.log(`  KMS Key: ${functionConfig.KMSKeyArn}`);
        }

        // Layers
        if (functionConfig?.Layers && functionConfig.Layers.length > 0) {
          this.log("\n📦 Layers:");
          functionConfig.Layers.forEach((layer: any, index: number) => {
            this.log(`  ${index + 1}. ${layer.Arn} (${layer.CodeSize || 0} bytes)`);
          });
        }

        // File System Configuration
        if (functionConfig?.FileSystemConfigs && functionConfig.FileSystemConfigs.length > 0) {
          this.log("\n💾 File System Configurations:");
          functionConfig.FileSystemConfigs.forEach((fsConfig: any, index: number) => {
            this.log(`  ${index + 1}. ${fsConfig.Arn} -> ${fsConfig.LocalMountPath}`);
          });
        }

        // Image Configuration
        if (functionConfig?.ImageConfigResponse) {
          this.log("\n🐳 Image Configuration:");
          if (functionConfig.ImageConfigResponse.ImageConfig?.EntryPoint) {
            this.log(`  Entry Point: ${functionConfig.ImageConfigResponse.ImageConfig.EntryPoint.join(" ")}`);
          }
          if (functionConfig.ImageConfigResponse.ImageConfig?.Command) {
            this.log(`  Command: ${functionConfig.ImageConfigResponse.ImageConfig.Command.join(" ")}`);
          }
          if (functionConfig.ImageConfigResponse.ImageConfig?.WorkingDirectory) {
            this.log(`  Working Directory: ${functionConfig.ImageConfigResponse.ImageConfig.WorkingDirectory}`);
          }
        }

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
          Runtime: functionConfig?.Runtime || "",
          Role: functionConfig?.Role || "",
          Handler: functionConfig?.Handler || "",
          CodeSize: functionConfig?.CodeSize || 0,
          Description: functionConfig?.Description || "",
          Timeout: functionConfig?.Timeout || 0,
          MemorySize: functionConfig?.MemorySize || 0,
          LastModified: functionConfig?.LastModified || "",
          CodeSha256: functionConfig?.CodeSha256 || "",
          Version: functionConfig?.Version || "",
          State: functionConfig?.State || "",
          StateReason: functionConfig?.StateReason || "",
          LastUpdateStatus: functionConfig?.LastUpdateStatus || "",
          PackageType: functionConfig?.PackageType || "",
          EphemeralStorageSize: functionConfig?.EphemeralStorage?.Size || 512,
          ReservedConcurrencyLimit: functionConfig?.ReservedConcurrencyLimit || "",
          VpcId: functionConfig?.VpcConfig?.VpcId || "",
          SubnetIds: functionConfig?.VpcConfig?.SubnetIds?.join(";") || "",
          SecurityGroupIds: functionConfig?.VpcConfig?.SecurityGroupIds?.join(";") || "",
          DeadLetterTargetArn: functionConfig?.DeadLetterConfig?.TargetArn || "",
          KMSKeyArn: functionConfig?.KMSKeyArn || "",
          LayerCount: functionConfig?.Layers?.length || 0,
          FileSystemCount: functionConfig?.FileSystemConfigs?.length || 0,
          EnvironmentVariableCount: Object.keys(functionConfig?.Environment?.Variables || {}).length,
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