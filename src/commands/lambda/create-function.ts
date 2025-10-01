/**
 * @module lambda/create-function
 * Lambda create function command
 *
 * Creates a new Lambda function with specified configuration including
 * code deployment, runtime settings, and optional advanced configurations.
 *
 */

import type { FunctionConfiguration } from "@aws-sdk/client-lambda";
import { Args, Flags, type Interfaces } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { formatLambdaError } from "../../lib/lambda-errors.js";
import type { LambdaCreateFunction } from "../../lib/lambda-schemas.js";
import { LambdaCreateFunctionSchema } from "../../lib/lambda-schemas.js";
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
 * Lambda create function command for function creation
 *
 * Creates a new Lambda function with configuration options
 * including code deployment, runtime settings, and advanced configurations.
 *
 * @public
 */
export default class LambdaCreateFunctionCommand extends BaseCommand {
  static override readonly description = "Create a new Lambda function";

  static override readonly examples = [
    {
      description: "Create function from ZIP file",
      command:
        "<%= config.bin %> <%= command.id %> my-function --runtime nodejs18.x --role arn:aws:iam::123456789012:role/lambda-role --handler index.handler --zip-file fileb://function.zip",
    },
    {
      description: "Create function from S3 bucket",
      command:
        "<%= config.bin %> <%= command.id %> my-function --runtime python3.9 --role arn:aws:iam::123456789012:role/lambda-role --handler lambda_function.lambda_handler --s3-bucket my-bucket --s3-key function.zip",
    },
    {
      description: "Create function with environment variables",
      command:
        '<%= config.bin %> <%= command.id %> my-function --runtime nodejs18.x --role arn:aws:iam::123456789012:role/lambda-role --handler index.handler --zip-file fileb://function.zip --environment \'{"Variables":{"ENV":"production","DEBUG":"false"}}\'',
    },
    {
      description: "Create function with VPC configuration",
      command:
        "<%= config.bin %> <%= command.id %> my-function --runtime nodejs18.x --role arn:aws:iam::123456789012:role/lambda-role --handler index.handler --zip-file fileb://function.zip --vpc-subnet-ids subnet-12345 --vpc-security-group-ids sg-12345",
    },
    {
      description: "Create function with custom memory and timeout",
      command:
        "<%= config.bin %> <%= command.id %> my-function --runtime nodejs18.x --role arn:aws:iam::123456789012:role/lambda-role --handler index.handler --zip-file fileb://function.zip --memory-size 512 --timeout 30",
    },
    {
      description: "Create function with layers",
      command:
        "<%= config.bin %> <%= command.id %> my-function --runtime nodejs18.x --role arn:aws:iam::123456789012:role/lambda-role --handler index.handler --zip-file fileb://function.zip --layers arn:aws:lambda:us-east-1:123456789012:layer:my-layer:1",
    },
  ];

  static override readonly args = {
    functionName: Args.string({
      name: "functionName",
      description: "Name of the Lambda function to create",
      required: true,
    }),
  };

  static override readonly flags = {
    region: Flags.string({
      char: "r",
      description: "AWS region to create the function in",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for function creation result",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    runtime: Flags.string({
      description: "Function runtime",
      required: true,
      options: [
        "nodejs18.x",
        "nodejs20.x",
        "python3.9",
        "python3.10",
        "python3.11",
        "python3.12",
        "java8.al2",
        "java11",
        "java17",
        "java21",
        "dotnet6",
        "dotnet8",
        "go1.x",
        "ruby3.2",
        "provided.al2",
        "provided.al2023",
      ],
      helpValue: "RUNTIME",
    }),

    role: Flags.string({
      description: "ARN of the IAM role for the function",
      required: true,
      helpValue: "ROLE_ARN",
    }),

    handler: Flags.string({
      description: "Function handler (e.g., index.handler)",
      required: true,
      helpValue: "HANDLER",
    }),

    "zip-file": Flags.string({
      description: "Path to ZIP file containing function code",
      helpValue: "FILE_PATH",
    }),

    "s3-bucket": Flags.string({
      description: "S3 bucket containing function code",
      helpValue: "BUCKET_NAME",
    }),

    "s3-key": Flags.string({
      description: "S3 key for function code ZIP file",
      helpValue: "S3_KEY",
    }),

    "s3-object-version": Flags.string({
      description: "S3 object version",
      helpValue: "VERSION_ID",
    }),

    description: Flags.string({
      description: "Function description",
      helpValue: "DESCRIPTION",
    }),

    "memory-size": Flags.integer({
      description: "Memory size in MB (128-10240)",
      min: 128,
      max: 10_240,
      helpValue: "MB",
    }),

    timeout: Flags.integer({
      description: "Timeout in seconds (1-900)",
      min: 1,
      max: 900,
      helpValue: "SECONDS",
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

    layers: Flags.string({
      description: "Layer ARNs (comma-separated)",
      helpValue: "LAYER_ARNS",
      multiple: true,
    }),

    "dead-letter-target-arn": Flags.string({
      description: "Dead letter queue target ARN",
      helpValue: "DLQ_ARN",
    }),

    "kms-key-arn": Flags.string({
      description: "KMS key ARN for encryption",
      helpValue: "KMS_ARN",
    }),

    publish: Flags.boolean({
      description: "Publish the function version",
      default: false,
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the Lambda create function command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(LambdaCreateFunctionCommand);

    try {
      // Validate input using Zod schema
      const input: LambdaCreateFunction = LambdaCreateFunctionSchema.parse({
        functionName: args.functionName,
        runtime: flags.runtime,
        role: flags.role,
        handler: flags.handler,
        zipFile: flags["zip-file"],
        s3Bucket: flags["s3-bucket"],
        s3Key: flags["s3-key"],
        s3ObjectVersion: flags["s3-object-version"],
        description: flags.description,
        memorySize: flags["memory-size"],
        timeout: flags.timeout,
        environment: flags.environment,
        vpcSubnetIds: flags["vpc-subnet-ids"],
        vpcSecurityGroupIds: flags["vpc-security-group-ids"],
        layers: flags.layers,
        deadLetterTargetArn: flags["dead-letter-target-arn"],
        kmsKeyArn: flags["kms-key-arn"],
        publish: flags.publish,
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

      // Create the Lambda function
      const functionConfig = await this.executeFunctionCreation(lambdaService, input, flags);

      // Format output based on requested format
      this.formatAndDisplayOutput(functionConfig, input.format, input.functionName);
    } catch (error) {
      const formattedError = formatLambdaError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Execute function creation with the Lambda service
   *
   * @param lambdaService - Lambda service instance
   * @param input - Validated input parameters
   * @param flags - Command flags
   * @returns Promise resolving to function configuration
   * @internal
   */
  private async executeFunctionCreation(
    lambdaService: LambdaService,
    input: LambdaCreateFunction,
    flags: Interfaces.InferredFlags<typeof LambdaCreateFunctionCommand.flags>,
  ): Promise<FunctionConfiguration> {
    return lambdaService.createFunction(
      {
        functionName: input.functionName,
        runtime: input.runtime,
        role: input.role,
        handler: input.handler,
        code: {
          ...(flags["zip-file"] && {
            zipFile: new Uint8Array(Buffer.from(flags["zip-file"], "base64")),
          }),
          ...(flags["s3-bucket"] && { s3Bucket: flags["s3-bucket"] }),
          ...(flags["s3-key"] && { s3Key: flags["s3-key"] }),
          ...(flags["s3-object-version"] && { s3ObjectVersion: flags["s3-object-version"] }),
        },
        ...(input.description && { description: input.description }),
        ...(input.memorySize && { memorySize: input.memorySize }),
        ...(input.timeout && { timeout: input.timeout }),
        ...(input.environment &&
          input.environment.variables && {
            environment: {
              variables: input.environment.variables,
            },
          }),
        ...(flags["vpc-subnet-ids"] &&
          flags["vpc-security-group-ids"] && {
            vpcConfig: {
              subnetIds: flags["vpc-subnet-ids"],
              securityGroupIds: flags["vpc-security-group-ids"],
            },
          }),
        ...(flags["dead-letter-target-arn"] && {
          deadLetterConfig: { targetArn: flags["dead-letter-target-arn"] },
        }),
        ...(input.tags && { tags: input.tags }),
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );
  }

  /**
   * Format and display the function creation result
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
      case "json": {
        const processor = new DataProcessor({ format: DataFormat.JSON });
        const output = processor.formatOutput([
          { data: functionConfig as ExtendedFunctionConfiguration, index: 0 },
        ]);
        this.log(output);
        break;
      }
      case "jsonl": {
        const processor = new DataProcessor({ format: DataFormat.JSONL });
        const output = processor.formatOutput([
          { data: functionConfig as ExtendedFunctionConfiguration, index: 0 },
        ]);
        this.log(output);
        break;
      }
      case "csv": {
        // Flatten function configuration for CSV output
        const flattenedData = {
          FunctionName: functionConfig.FunctionName ?? "",
          FunctionArn: functionConfig.FunctionArn ?? "",
          Runtime: functionConfig.Runtime ?? "",
          Role: functionConfig.Role ?? "",
          Handler: functionConfig.Handler ?? "",
          CodeSize: functionConfig.CodeSize ?? 0,
          Description: functionConfig.Description ?? "",
          Timeout: functionConfig.Timeout ?? 0,
          MemorySize: functionConfig.MemorySize ?? 0,
          CodeSha256: functionConfig.CodeSha256 ?? "",
          Version: functionConfig.Version ?? "",
          State: functionConfig.State ?? "",
          PackageType: functionConfig.PackageType ?? "",
          EphemeralStorageSize: functionConfig.EphemeralStorage?.Size ?? 512,
          VpcId: functionConfig.VpcConfig?.VpcId ?? "",
          LayerCount: functionConfig.Layers?.length ?? 0,
          HasDeadLetterConfig: functionConfig.DeadLetterConfig?.TargetArn ? "true" : "false",
          HasKMSKey: functionConfig.KMSKeyArn ? "true" : "false",
          EnvironmentVariableCount: Object.keys(functionConfig.Environment?.Variables ?? {}).length,
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
   * Display function configuration in table format
   *
   * @param functionConfig - Function configuration to display
   * @param functionName - Function name for display
   * @internal
   */
  private displayTableFormat(functionConfig: FunctionConfiguration, functionName: string): void {
    this.log(`Function Created: ${functionName}\n`);

    // Basic Configuration
    this.log("Function Details:");
    const basicConfig = [
      ["Function Name", functionConfig.FunctionName ?? "N/A"],
      ["Function ARN", functionConfig.FunctionArn ?? "N/A"],
      ["Runtime", functionConfig.Runtime ?? "N/A"],
      ["Handler", functionConfig.Handler ?? "N/A"],
      ["Description", functionConfig.Description ?? "No description"],
      ["State", functionConfig.State ?? "N/A"],
      ["Version", functionConfig.Version ?? "N/A"],
      ["Code Size", `${functionConfig.CodeSize ?? 0} bytes`],
      ["Code SHA256", functionConfig.CodeSha256 ?? "N/A"],
    ];

    for (const [key, value] of basicConfig) {
      this.log(`  ${key}: ${value}`);
    }

    // Resource Configuration
    this.log("\nResource Configuration:");
    const resourceConfig = [
      ["Memory Size", `${functionConfig.MemorySize ?? 0} MB`],
      ["Timeout", `${functionConfig.Timeout ?? 0} seconds`],
      ["Ephemeral Storage", `${functionConfig.EphemeralStorage?.Size ?? 512} MB`],
      ["Package Type", functionConfig.PackageType ?? "Zip"],
    ];

    for (const [key, value] of resourceConfig) {
      this.log(`  ${key}: ${value}`);
    }

    // IAM Role
    this.log("\n IAM Configuration:");
    this.log(`  Role: ${functionConfig.Role ?? "N/A"}`);

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

    // Layers
    if (functionConfig?.Layers && functionConfig.Layers.length > 0) {
      this.log("\n Layers:");
      for (const [index, layer] of functionConfig.Layers.entries()) {
        this.log(`  ${index + 1}. ${layer.Arn ?? "N/A"}`);
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

    this.log("\nNote: Your function is now ready to be invoked using the Lambda service.");
  }
}
