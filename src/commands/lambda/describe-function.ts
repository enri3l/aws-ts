/**
 * @module lambda/describe-function
 * Lambda describe function command
 *
 * Displays detailed information about a specific Lambda function including
 * configuration, code details, and tags with multiple output formats.
 *
 */

import type { FunctionConfiguration, GetFunctionResponse } from "@aws-sdk/client-lambda";
import { Args, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { getLambdaErrorGuidance } from "../../lib/lambda-errors.js";
import type { LambdaDescribeFunction } from "../../lib/lambda-schemas.js";
import { LambdaDescribeFunctionSchema } from "../../lib/lambda-schemas.js";
import { LambdaService } from "../../services/lambda-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * Extended function details with index signature for data processing
 *
 * @internal
 */
interface ExtendedFunctionDetails {
  /**
   * Function configuration details
   */
  configuration?: FunctionConfiguration;

  /**
   * Function code details
   */
  code?: {
    repositoryType?: string;
    location?: string;
  };

  /**
   * Function tags
   */
  tags?: Record<string, string>;

  /**
   * Index signature for data processing compatibility
   */
  [key: string]: unknown;
}

/**
 * Lambda describe function command for detailed function information
 *
 * Provides information about a Lambda function including
 * configuration, code details, and associated tags.
 *
 * @public
 */
export default class LambdaDescribeFunctionCommand extends BaseCommand {
  static override readonly description = "Show detailed information about a Lambda function";

  static override readonly examples = [
    {
      description: "Describe a function with default table format",
      command: "<%= config.bin %> <%= command.id %> my-function",
    },
    {
      description: "Describe a function with JSON output",
      command: "<%= config.bin %> <%= command.id %> my-function --format json",
    },
    {
      description: "Describe a function in a specific region",
      command: "<%= config.bin %> <%= command.id %> my-function --region us-west-2",
    },
    {
      description: "Describe a specific function version or alias",
      command: "<%= config.bin %> <%= command.id %> my-function --qualifier v1",
    },
    {
      description: "Describe a function using a specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> my-function --profile production",
    },
    {
      description: "Describe a function with CSV output for analysis",
      command: "<%= config.bin %> <%= command.id %> my-function --format csv",
    },
    {
      description: "Verbose function description with debug information",
      command: "<%= config.bin %> <%= command.id %> my-function --verbose",
    },
  ];

  static override readonly args = {
    functionName: Args.string({
      name: "functionName",
      description: "Name or ARN of the Lambda function to describe",
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
      description: "Output format for function information",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    qualifier: Flags.string({
      char: "q",
      description: "Function version or alias to describe",
      helpValue: "VERSION_OR_ALIAS",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the Lambda describe function command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(LambdaDescribeFunctionCommand);

    try {
      // Validate input using Zod schema
      const input: LambdaDescribeFunction = LambdaDescribeFunctionSchema.parse({
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

      // Get function details from Lambda
      const functionDetails = await lambdaService.getFunction(
        input.functionName,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          ...(input.qualifier && { Qualifier: input.qualifier }),
        },
      );

      // Format output based on requested format
      this.formatAndDisplayOutput(functionDetails, input.format, input.functionName);
    } catch (error) {
      const formattedError = this.formatLambdaError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the function details output
   *
   * @param functionDetails - Function details to display
   * @param format - Output format to use
   * @param functionName - Function name for display
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    functionDetails: ExtendedFunctionDetails,
    format: string,
    functionName: string,
  ): void {
    const config = functionDetails.configuration;
    const code = functionDetails.code;
    const tags = functionDetails.tags ?? {};

    switch (format) {
      case "table": {
        this.displayTableFormat(config, code, tags, functionName);
        break;
      }
      case "json": {
        const processor = new DataProcessor({ format: DataFormat.JSON });
        const output = processor.formatOutput([{ data: functionDetails, index: 0 }]);
        this.log(output);
        break;
      }
      case "jsonl": {
        const processor = new DataProcessor({ format: DataFormat.JSONL });
        const output = processor.formatOutput([{ data: functionDetails, index: 0 }]);
        this.log(output);
        break;
      }
      case "csv": {
        // Flatten function details for CSV output
        const flattenedData = {
          FunctionName: config?.FunctionName ?? "",
          FunctionArn: config?.FunctionArn ?? "",
          Runtime: config?.Runtime ?? "",
          Role: config?.Role ?? "",
          Handler: config?.Handler ?? "",
          CodeSize: config?.CodeSize ?? 0,
          Description: config?.Description ?? "",
          Timeout: config?.Timeout ?? 0,
          MemorySize: config?.MemorySize ?? 0,
          LastModified: config?.LastModified ?? "",
          CodeSha256: config?.CodeSha256 ?? "",
          Version: config?.Version ?? "",
          State: config?.State ?? "",
          StateReason: config?.StateReason ?? "",
          LastUpdateStatus: config?.LastUpdateStatus ?? "",
          VpcId: config?.VpcConfig?.VpcId ?? "",
          SubnetIds: config?.VpcConfig?.SubnetIds?.join(";") ?? "",
          SecurityGroupIds: config?.VpcConfig?.SecurityGroupIds?.join(";") ?? "",
          RepositoryType: code?.repositoryType ?? "",
          Location: code?.location ?? "",
          TagCount: Object.keys(tags).length,
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
   * Display function details in table format
   *
   * @param config - Function configuration
   * @param code - Function code details
   * @param tags - Function tags
   * @param functionName - Function name for display
   * @internal
   */
  private displayTableFormat(
    config: FunctionConfiguration | undefined,
    code: { repositoryType?: string; location?: string } | undefined,
    tags: Record<string, string>,
    functionName: string,
  ): void {
    this.log(`Function Details: ${functionName}\n`);
    this.displayBasicConfiguration(config);
    this.displayResourceConfiguration(config);
    this.displayVpcAndEnvironmentConfiguration(config);
    this.displayCodeAndTagsInformation(code, tags);
  }

  /**
   * Display basic function configuration
   *
   * @param config - Function configuration
   * @internal
   */
  private displayBasicConfiguration(config: GetFunctionResponse["Configuration"]): void {
    this.log("Basic Configuration:");
    const basicConfig = [
      ["Function Name", config?.FunctionName ?? "N/A"],
      ["Function ARN", config?.FunctionArn ?? "N/A"],
      ["Runtime", config?.Runtime ?? "N/A"],
      ["Handler", config?.Handler ?? "N/A"],
      ["Description", config?.Description ?? "No description"],
      ["State", config?.State ?? "N/A"],
      ["Last Modified", config?.LastModified ?? "N/A"],
      ["Version", config?.Version ?? "N/A"],
    ];

    for (const [key, value] of basicConfig) {
      this.log(`  ${key}: ${value}`);
    }

    // IAM Role
    this.log("\n IAM Configuration:");
    this.log(`  Role: ${config?.Role ?? "N/A"}`);
  }

  /**
   * Display resource configuration
   *
   * @param config - Function configuration
   * @internal
   */
  private displayResourceConfiguration(config: GetFunctionResponse["Configuration"]): void {
    this.log("\nResource Configuration:");
    const resourceConfig = [
      ["Memory Size", `${config?.MemorySize ?? 0} MB`],
      ["Timeout", `${config?.Timeout ?? 0} seconds`],
      ["Code Size", `${config?.CodeSize ?? 0} bytes`],
      ["Code SHA256", config?.CodeSha256 ?? "N/A"],
    ];

    for (const [key, value] of resourceConfig) {
      this.log(`  ${key}: ${value}`);
    }
  }

  /**
   * Display VPC and environment configuration
   *
   * @param config - Function configuration
   * @internal
   */
  private displayVpcAndEnvironmentConfiguration(
    config: GetFunctionResponse["Configuration"],
  ): void {
    // VPC Configuration
    if (config?.VpcConfig && config.VpcConfig.VpcId) {
      this.log("\n VPC Configuration:");
      this.log(`  VPC ID: ${config.VpcConfig.VpcId}`);
      this.log(`  Subnets: ${config.VpcConfig.SubnetIds?.join(", ") ?? "None"}`);
      this.log(`  Security Groups: ${config.VpcConfig.SecurityGroupIds?.join(", ") ?? "None"}`);
    }

    // Environment Variables
    if (config?.Environment?.Variables && Object.keys(config.Environment.Variables).length > 0) {
      this.log("\n Environment Variables:");
      for (const [key, value] of Object.entries(config.Environment.Variables)) {
        this.log(`  ${key}: ${value}`);
      }
    }
  }

  /**
   * Display code information and tags
   *
   * @param code - Function code details
   * @param tags - Function tags
   * @internal
   */
  private displayCodeAndTagsInformation(
    code: { repositoryType?: string; location?: string } | undefined,
    tags: Record<string, string>,
  ): void {
    // Code Information
    if (code) {
      this.log("\n Code Information:");
      if (code.repositoryType) {
        this.log(`  Repository Type: ${code.repositoryType}`);
      }
      if (code.location) {
        this.log(`  Location: ${code.location}`);
      }
    }

    // Tags
    if (Object.keys(tags).length > 0) {
      this.log("\nTags:");
      for (const [key, value] of Object.entries(tags)) {
        this.log(`  ${key}: ${value}`);
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
