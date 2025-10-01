/**
 * @module lambda/get-function-configuration
 * Lambda get function configuration command
 *
 * Retrieves function configuration details including runtime settings,
 * environment variables, and execution parameters without code information.
 *
 */

import type { FunctionConfiguration } from "@aws-sdk/client-lambda";
import { Args, Flags } from "@oclif/core";
import { formatLambdaError } from "../../lib/lambda-errors.js";
import type { LambdaGetFunctionConfiguration } from "../../lib/lambda-schemas.js";
import { LambdaGetFunctionConfigurationSchema } from "../../lib/lambda-schemas.js";
import { LambdaService } from "../../services/lambda-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * Lambda get function configuration command for retrieving function settings
 *
 * Provides configuration information about a Lambda function including
 * runtime settings, environment variables, and execution parameters.
 *
 * @public
 */
export default class LambdaGetFunctionConfigurationCommand extends BaseCommand {
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
      const formattedError = formatLambdaError(error, flags.verbose);
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
    functionConfig: FunctionConfiguration,
    format: string,
    functionName: string,
  ): void {
    switch (format) {
      case "table": {
        this.displayTableFormat(functionConfig, functionName);

        break;
      }
      case "json":
      case "jsonl": {
        this.displaySingleObject(functionConfig, format);

        break;
      }
      case "csv": {
        // Flatten function configuration for CSV output
        const flattenedData = {
          FunctionName: functionConfig?.FunctionName ?? "",
          FunctionArn: functionConfig?.FunctionArn ?? "",
          Runtime: functionConfig?.Runtime ?? "",
          Role: functionConfig?.Role ?? "",
          Handler: functionConfig?.Handler ?? "",
          CodeSize: functionConfig?.CodeSize ?? 0,
          Description: functionConfig?.Description ?? "",
          Timeout: functionConfig?.Timeout ?? 0,
          MemorySize: functionConfig?.MemorySize ?? 0,
          LastModified: functionConfig?.LastModified ?? "",
          CodeSha256: functionConfig?.CodeSha256 ?? "",
          Version: functionConfig?.Version ?? "",
          State: functionConfig?.State ?? "",
          StateReason: functionConfig?.StateReason ?? "",
          LastUpdateStatus: functionConfig?.LastUpdateStatus ?? "",
          PackageType: functionConfig?.PackageType ?? "",
          EphemeralStorageSize: functionConfig?.EphemeralStorage?.Size ?? 512,
          VpcId: functionConfig?.VpcConfig?.VpcId ?? "",
          SubnetIds: functionConfig?.VpcConfig?.SubnetIds?.join(";") ?? "",
          SecurityGroupIds: functionConfig?.VpcConfig?.SecurityGroupIds?.join(";") ?? "",
          DeadLetterTargetArn: functionConfig?.DeadLetterConfig?.TargetArn ?? "",
          KMSKeyArn: functionConfig?.KMSKeyArn ?? "",
          LayerCount: functionConfig?.Layers?.length ?? 0,
          FileSystemCount: functionConfig?.FileSystemConfigs?.length ?? 0,
          EnvironmentVariableCount: Object.keys(functionConfig?.Environment?.Variables ?? {})
            .length,
        };
        this.displayOutput([flattenedData], format);

        break;
      }
      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }

  /**
   * Display function configuration in table format
   *
   * @param functionConfig - Function configuration to display
   * @param functionName - Function name for display
   * @internal
   */
  private displayTableFormat(functionConfig: FunctionConfiguration, functionName: string): void {
    this.log(`Function Configuration: ${functionName}\n`);
    this.displayBasicConfiguration(functionConfig);
    this.displayResourceConfiguration(functionConfig);
    this.displayVpcAndEnvironmentConfiguration(functionConfig);
    this.displayAdvancedConfiguration(functionConfig);
  }

  /**
   * Display basic function configuration
   *
   * @param functionConfig - Function configuration
   * @internal
   */
  private displayBasicConfiguration(functionConfig: FunctionConfiguration): void {
    this.log("Function Details:");
    const basicConfig = [
      ["Function Name", functionConfig?.FunctionName ?? "N/A"],
      ["Function ARN", functionConfig?.FunctionArn ?? "N/A"],
      ["Runtime", functionConfig?.Runtime ?? "N/A"],
      ["Handler", functionConfig?.Handler ?? "N/A"],
      ["Description", functionConfig?.Description ?? "No description"],
      ["State", functionConfig?.State ?? "N/A"],
      ["Last Modified", functionConfig?.LastModified ?? "N/A"],
      ["Version", functionConfig?.Version ?? "N/A"],
    ];

    for (const [key, value] of basicConfig) {
      this.log(`  ${key}: ${value}`);
    }

    // IAM Role
    this.log("\n IAM Configuration:");
    this.log(`  Role: ${functionConfig?.Role ?? "N/A"}`);
  }

  /**
   * Display resource configuration
   *
   * @param functionConfig - Function configuration
   * @internal
   */
  private displayResourceConfiguration(functionConfig: FunctionConfiguration): void {
    this.log("\nResource Configuration:");
    const resourceConfig = [
      ["Memory Size", `${functionConfig?.MemorySize ?? 0} MB`],
      ["Timeout", `${functionConfig?.Timeout ?? 0} seconds`],
      ["Code Size", `${functionConfig?.CodeSize ?? 0} bytes`],
      ["Code SHA256", functionConfig?.CodeSha256 ?? "N/A"],
      ["Package Type", functionConfig?.PackageType ?? "Zip"],
      ["Ephemeral Storage", `${functionConfig?.EphemeralStorage?.Size ?? 512} MB`],
    ];

    for (const [key, value] of resourceConfig) {
      this.log(`  ${key}: ${value}`);
    }
  }

  /**
   * Display VPC and environment configuration
   *
   * @param functionConfig - Function configuration
   * @internal
   */
  private displayVpcAndEnvironmentConfiguration(functionConfig: FunctionConfiguration): void {
    // VPC Configuration
    if (functionConfig?.VpcConfig && functionConfig.VpcConfig.VpcId) {
      this.log("\n VPC Configuration:");
      this.log(`  VPC ID: ${functionConfig.VpcConfig.VpcId}`);
      this.log(`  Subnets: ${functionConfig.VpcConfig.SubnetIds?.join(", ") ?? "None"}`);
      this.log(
        `  Security Groups: ${functionConfig.VpcConfig.SecurityGroupIds?.join(", ") ?? "None"}`,
      );
    }

    // Environment Variables
    if (
      functionConfig?.Environment?.Variables &&
      Object.keys(functionConfig.Environment.Variables).length > 0
    ) {
      this.log("\n Environment Variables:");
      for (const [key, value] of Object.entries(functionConfig.Environment.Variables)) {
        this.log(`  ${key}: ${value}`);
      }
    }
  }

  /**
   * Display advanced configuration including layers, file systems, and encryption
   *
   * @param functionConfig - Function configuration
   * @internal
   */
  private displayAdvancedConfiguration(functionConfig: FunctionConfiguration): void {
    // Layers
    if (functionConfig?.Layers && functionConfig.Layers.length > 0) {
      this.log("\n Layers:");
      for (const [index, layer] of functionConfig.Layers.entries()) {
        this.log(`  ${index + 1}. ${layer.Arn ?? "N/A"} (${layer.CodeSize ?? 0} bytes)`);
      }
    }

    // File System Configurations
    if (functionConfig?.FileSystemConfigs && functionConfig.FileSystemConfigs.length > 0) {
      this.log("\n File System Configurations:");
      for (const [index, config] of functionConfig.FileSystemConfigs.entries()) {
        this.log(`  ${index + 1}. ${config.Arn ?? "N/A"} → ${config.LocalMountPath ?? "N/A"}`);
      }
    }

    // Dead Letter Configuration
    if (functionConfig?.DeadLetterConfig?.TargetArn) {
      this.log("\nDead Letter Configuration:");
      this.log(`  Target ARN: ${functionConfig.DeadLetterConfig.TargetArn}`);
    }

    // KMS Configuration
    if (functionConfig?.KMSKeyArn) {
      this.log("\n🔒 Encryption:");
      this.log(`  KMS Key: ${functionConfig.KMSKeyArn}`);
    }
  }
}
