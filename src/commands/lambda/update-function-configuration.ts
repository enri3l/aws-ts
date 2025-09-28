/**
 * Lambda update function configuration command
 *
 * Updates the configuration of a Lambda function including runtime settings,
 * environment variables, VPC configuration, and other execution parameters.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { getLambdaErrorGuidance } from "../../lib/lambda-errors.js";
import type { LambdaUpdateFunctionConfiguration } from "../../lib/lambda-schemas.js";
import { LambdaUpdateFunctionConfigurationSchema } from "../../lib/lambda-schemas.js";
import { LambdaService } from "../../services/lambda-service.js";

/**
 * Lambda update function configuration command for settings modification
 *
 * Updates function configuration including runtime settings, environment variables,
 * VPC configuration, and other execution parameters without changing code.
 *
 * @public
 */
export default class LambdaUpdateFunctionConfigurationCommand extends Command {
  static override readonly description = "Update Lambda function configuration";

  static override readonly examples = [
    {
      description: "Update function memory and timeout",
      command: "<%= config.bin %> <%= command.id %> my-function --memory-size 512 --timeout 30",
    },
    {
      description: "Update environment variables",
      command: '<%= config.bin %> <%= command.id %> my-function --environment \'{"Variables":{"ENV":"production","DEBUG":"false"}}\'',
    },
    {
      description: "Update function description and handler",
      command: "<%= config.bin %> <%= command.id %> my-function --description 'Updated function' --handler new-handler.main",
    },
    {
      description: "Update VPC configuration",
      command: "<%= config.bin %> <%= command.id %> my-function --vpc-subnet-ids subnet-12345,subnet-67890 --vpc-security-group-ids sg-12345",
    },
    {
      description: "Update function layers",
      command: "<%= config.bin %> <%= command.id %> my-function --layers arn:aws:lambda:us-east-1:123456789012:layer:my-layer:2",
    },
    {
      description: "Update dead letter queue configuration",
      command: "<%= config.bin %> <%= command.id %> my-function --dead-letter-target-arn arn:aws:sqs:us-east-1:123456789012:dlq",
    },
    {
      description: "Remove VPC configuration",
      command: "<%= config.bin %> <%= command.id %> my-function --remove-vpc",
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
      description: "Output format for configuration update result",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    description: Flags.string({
      description: "Updated function description",
      helpValue: "DESCRIPTION",
    }),

    handler: Flags.string({
      description: "Updated function handler",
      helpValue: "HANDLER",
    }),

    "memory-size": Flags.integer({
      description: "Memory size in MB (128-10240)",
      min: 128,
      max: 10240,
      helpValue: "MB",
    }),

    timeout: Flags.integer({
      description: "Timeout in seconds (1-900)",
      min: 1,
      max: 900,
      helpValue: "SECONDS",
    }),

    runtime: Flags.string({
      description: "Function runtime",
      options: [
        "nodejs18.x", "nodejs20.x", "python3.9", "python3.10", "python3.11", "python3.12",
        "java8.al2", "java11", "java17", "java21", "dotnet6", "dotnet8",
        "go1.x", "ruby3.2", "provided.al2", "provided.al2023"
      ],
      helpValue: "RUNTIME",
    }),

    role: Flags.string({
      description: "Updated IAM role ARN",
      helpValue: "ROLE_ARN",
    }),

    environment: Flags.string({
      description: "Environment variables as JSON",
      helpValue: "JSON_STRING",
    }),

    "vpc-subnet-ids": Flags.string({
      description: "VPC subnet IDs (comma-separated)",
      helpValue: "SUBNET_IDS",
      multiple: true,
    }),

    "vpc-security-group-ids": Flags.string({
      description: "VPC security group IDs (comma-separated)",
      helpValue: "SECURITY_GROUP_IDS",
      multiple: true,
    }),

    "remove-vpc": Flags.boolean({
      description: "Remove VPC configuration from function",
      default: false,
    }),

    layers: Flags.string({
      description: "Layer ARNs (comma-separated)",
      helpValue: "LAYER_ARNS",
      multiple: true,
    }),

    "remove-layers": Flags.boolean({
      description: "Remove all layers from function",
      default: false,
    }),

    "dead-letter-target-arn": Flags.string({
      description: "Dead letter queue target ARN",
      helpValue: "DLQ_ARN",
    }),

    "remove-dead-letter-config": Flags.boolean({
      description: "Remove dead letter queue configuration",
      default: false,
    }),

    "kms-key-arn": Flags.string({
      description: "KMS key ARN for encryption",
      helpValue: "KMS_ARN",
    }),

    "remove-kms-key": Flags.boolean({
      description: "Remove KMS key encryption",
      default: false,
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
   * Execute the Lambda update function configuration command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(LambdaUpdateFunctionConfigurationCommand);

    try {
      // Validate input using Zod schema
      const input: LambdaUpdateFunctionConfiguration = LambdaUpdateFunctionConfigurationSchema.parse({
        functionName: args.functionName,
        description: flags.description,
        handler: flags.handler,
        memorySize: flags["memory-size"],
        timeout: flags.timeout,
        runtime: flags.runtime,
        role: flags.role,
        environment: flags.environment,
        vpcSubnetIds: flags["vpc-subnet-ids"],
        vpcSecurityGroupIds: flags["vpc-security-group-ids"],
        removeVpc: flags["remove-vpc"],
        layers: flags.layers,
        removeLayers: flags["remove-layers"],
        deadLetterTargetArn: flags["dead-letter-target-arn"],
        removeDeadLetterConfig: flags["remove-dead-letter-config"],
        kmsKeyArn: flags["kms-key-arn"],
        removeKmsKey: flags["remove-kms-key"],
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

      // Update function configuration
      const functionConfig = await lambdaService.updateFunctionConfiguration(
        {
          functionName: input.functionName,
          description: input.description,
          handler: input.handler,
          memorySize: input.memorySize,
          timeout: input.timeout,
          runtime: input.runtime,
          role: input.role,
          environment: input.environment,
          vpcSubnetIds: input.vpcSubnetIds,
          vpcSecurityGroupIds: input.vpcSecurityGroupIds,
          removeVpc: input.removeVpc,
          layers: input.layers,
          removeLayers: input.removeLayers,
          deadLetterTargetArn: input.deadLetterTargetArn,
          removeDeadLetterConfig: input.removeDeadLetterConfig,
          kmsKeyArn: input.kmsKeyArn,
          removeKmsKey: input.removeKmsKey,
          revisionId: input.revisionId,
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
   * Format and display the configuration update result
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
        this.log(`✅ Configuration Updated: ${functionName}\n`);

        // Basic Configuration
        this.log("📋 Function Configuration:");
        const basicConfig = [
          ["Function Name", functionConfig?.FunctionName || "N/A"],
          ["Function ARN", functionConfig?.FunctionArn || "N/A"],
          ["Runtime", functionConfig?.Runtime || "N/A"],
          ["Handler", functionConfig?.Handler || "N/A"],
          ["Description", functionConfig?.Description || "No description"],
          ["State", functionConfig?.State || "N/A"],
          ["Last Modified", functionConfig?.LastModified || "N/A"],
          ["Version", functionConfig?.Version || "N/A"],
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
        ];

        resourceConfig.forEach(([key, value]) => {
          this.log(`  ${key}: ${value}`);
        });

        // IAM Role
        this.log("\n🔐 IAM Configuration:");
        this.log(`  Role: ${functionConfig?.Role || "N/A"}`);

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

        // Layers
        if (functionConfig?.Layers && functionConfig.Layers.length > 0) {
          this.log("\n📦 Layers:");
          functionConfig.Layers.forEach((layer: any, index: number) => {
            this.log(`  ${index + 1}. ${layer.Arn}`);
          });
        }

        // Dead Letter Configuration
        if (functionConfig?.DeadLetterConfig?.TargetArn) {
          this.log("\n☠️  Dead Letter Configuration:");
          this.log(`  Target ARN: ${functionConfig.DeadLetterConfig.TargetArn}`);
        }

        // KMS Configuration
        if (functionConfig?.KMSKeyArn) {
          this.log("\n🔒 Encryption:");
          this.log(`  KMS Key: ${functionConfig.KMSKeyArn}`);
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
          Description: functionConfig?.Description || "",
          Timeout: functionConfig?.Timeout || 0,
          MemorySize: functionConfig?.MemorySize || 0,
          LastModified: functionConfig?.LastModified || "",
          Version: functionConfig?.Version || "",
          State: functionConfig?.State || "",
          EphemeralStorageSize: functionConfig?.EphemeralStorage?.Size || 512,
          VpcId: functionConfig?.VpcConfig?.VpcId || "",
          LayerCount: functionConfig?.Layers?.length || 0,
          HasDeadLetterConfig: functionConfig?.DeadLetterConfig?.TargetArn ? "true" : "false",
          HasKMSKey: functionConfig?.KMSKeyArn ? "true" : "false",
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