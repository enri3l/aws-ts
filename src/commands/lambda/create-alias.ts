/**
 * @module lambda/create-alias
 * Lambda create alias command
 *
 * Creates an alias for a Lambda function that points to a specific version
 * with support for traffic shifting and weighted routing configurations.
 *
 */

import type { AliasConfiguration } from "@aws-sdk/client-lambda";
import { Args, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { getLambdaErrorGuidance } from "../../lib/lambda-errors.js";
import type { LambdaCreateAlias } from "../../lib/lambda-schemas.js";
import { LambdaCreateAliasSchema } from "../../lib/lambda-schemas.js";
import { LambdaService } from "../../services/lambda-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * Extended alias configuration with index signature for data processing
 *
 * @internal
 */
interface ExtendedAliasConfiguration extends AliasConfiguration {
  /**
   * Index signature for data processing compatibility
   */
  [key: string]: unknown;
}

/**
 * Lambda create alias command for alias management
 *
 * Creates an alias for a Lambda function that provides a stable endpoint
 * for function invocation with support for version routing and traffic shifting.
 *
 * @public
 */
export default class LambdaCreateAliasCommand extends BaseCommand {
  static override readonly description = "Create an alias for a Lambda function";

  static override readonly examples = [
    {
      description: "Create alias pointing to a specific version",
      command: "<%= config.bin %> <%= command.id %> my-function PROD --function-version 5",
    },
    {
      description: "Create alias with description",
      command:
        "<%= config.bin %> <%= command.id %> my-function STAGING --function-version 3 --description 'Staging environment alias'",
    },
    {
      description: "Create alias with traffic shifting (weighted routing)",
      command:
        "<%= config.bin %> <%= command.id %> my-function CANARY --function-version 4 --additional-version-weights '3=0.1'",
    },
    {
      description: "Create development alias pointing to $LATEST",
      command:
        "<%= config.bin %> <%= command.id %> my-function DEV --function-version '$LATEST' --description 'Development environment'",
    },
    {
      description: "Create alias in specific region with JSON output",
      command:
        "<%= config.bin %> <%= command.id %> my-function PROD --function-version 2 --region us-west-2 --format json",
    },
    {
      description: "Create alias with complex traffic distribution",
      command:
        "<%= config.bin %> <%= command.id %> my-function BLUE-GREEN --function-version 5 --additional-version-weights '4=0.2,3=0.1' --description 'Blue-green deployment'",
    },
  ];

  static override readonly args = {
    functionName: Args.string({
      name: "functionName",
      description: "Name or ARN of the Lambda function",
      required: true,
    }),
    aliasName: Args.string({
      name: "aliasName",
      description: "Name of the alias to create",
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
      description: "Output format for alias creation result",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    "function-version": Flags.string({
      description: "Function version the alias should point to",
      required: true,
      helpValue: "VERSION",
    }),

    description: Flags.string({
      char: "d",
      description: "Description for the alias",
      helpValue: "DESCRIPTION",
    }),

    "additional-version-weights": Flags.string({
      description:
        "Additional version weights for traffic shifting (format: version=weight,version=weight)",
      helpValue: "VERSION_WEIGHTS",
    }),

    "routing-config": Flags.string({
      description: "Routing configuration as JSON",
      helpValue: "JSON_STRING",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the Lambda create alias command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(LambdaCreateAliasCommand);

    try {
      // Validate input using Zod schema
      const input: LambdaCreateAlias = LambdaCreateAliasSchema.parse({
        functionName: args.functionName,
        name: args.aliasName,
        functionVersion: flags["function-version"],
        description: flags.description,
        additionalVersionWeights: flags["additional-version-weights"],
        routingConfig: flags["routing-config"],
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

      // Create the alias
      const aliasConfig = await lambdaService.createAlias(
        {
          functionName: input.functionName,
          name: input.name,
          functionVersion: input.functionVersion,
          ...(input.description && { description: input.description }),
          ...(input.routingConfig && { routingConfig: input.routingConfig }),
        },
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      // Format output based on requested format
      this.formatAndDisplayOutput(aliasConfig, input.format, input.functionName, input.name);
    } catch (error) {
      const formattedError = this.formatLambdaError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the alias creation result
   *
   * @param aliasConfig - Created alias configuration
   * @param format - Output format to use
   * @param functionName - Function name for display
   * @param aliasName - Alias name for display
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    aliasConfig: AliasConfiguration,
    format: string,
    functionName: string,
    aliasName: string,
  ): void {
    switch (format) {
      case "table": {
        this.log(`Alias Created: ${aliasName} for ${functionName}\n`);

        // Alias Information
        this.log("Alias Details:");
        const aliasInfo = [
          ["Alias Name", aliasConfig.Name ?? "N/A"],
          ["Alias ARN", aliasConfig.AliasArn ?? "N/A"],
          ["Function Version", aliasConfig.FunctionVersion ?? "N/A"],
          ["Description", aliasConfig.Description ?? "No description"],
          ["Revision ID", aliasConfig.RevisionId ?? "N/A"],
        ];

        for (const [key, value] of aliasInfo) {
          this.log(`  ${key}: ${value}`);
        }

        // Routing Configuration
        if (aliasConfig?.RoutingConfig?.AdditionalVersionWeights) {
          this.log("\n🔀 Traffic Routing:");
          const weights = aliasConfig.RoutingConfig.AdditionalVersionWeights;
          const primaryVersion = aliasConfig.FunctionVersion;

          // Calculate primary version weight
          const additionalWeights = Object.values(weights).reduce(
            (sum: number, weight: number) => sum + Number(weight),
            0,
          );
          const primaryWeight = (1 - additionalWeights) * 100;

          this.log(`  Primary Version (${primaryVersion}): ${primaryWeight.toFixed(1)}%`);

          for (const [version, weight] of Object.entries(weights)) {
            const weightPercent = (Number(weight) * 100).toFixed(1);
            this.log(`  Version ${version}: ${weightPercent}%`);
          }
        } else {
          this.log("\n🔀 Traffic Routing:");
          this.log(`  All traffic routed to version: ${aliasConfig?.FunctionVersion || "N/A"}`);
        }

        this.log(
          "\nNote: You can now invoke the function using this alias name instead of the version number.",
        );
        break;
      }
      case "json": {
        const processor = new DataProcessor({ format: DataFormat.JSON });
        const output = processor.formatOutput([
          { data: aliasConfig as ExtendedAliasConfiguration, index: 0 },
        ]);
        this.log(output);
        break;
      }
      case "jsonl": {
        const processor = new DataProcessor({ format: DataFormat.JSONL });
        const output = processor.formatOutput([
          { data: aliasConfig as ExtendedAliasConfiguration, index: 0 },
        ]);
        this.log(output);
        break;
      }
      case "csv": {
        // Flatten alias configuration for CSV output
        const flattenedData = {
          Name: aliasConfig?.Name || "",
          AliasArn: aliasConfig?.AliasArn || "",
          FunctionVersion: aliasConfig?.FunctionVersion || "",
          Description: aliasConfig?.Description || "",
          RevisionId: aliasConfig?.RevisionId || "",
          HasRoutingConfig: aliasConfig?.RoutingConfig ? "true" : "false",
          AdditionalVersionCount: Object.keys(
            aliasConfig?.RoutingConfig?.AdditionalVersionWeights || {},
          ).length,
          CreatedTimestamp: new Date().toISOString(),
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
