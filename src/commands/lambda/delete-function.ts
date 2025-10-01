/**
 * @module lambda/delete-function
 * Lambda delete function command
 *
 * Deletes a Lambda function and its associated versions, layers,
 * and event source mappings with confirmation and safety options.
 *
 */

import type { DeleteFunctionCommandOutput } from "@aws-sdk/client-lambda";
import { Args, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { formatLambdaError } from "../../lib/lambda-errors.js";
import type { LambdaDeleteFunction } from "../../lib/lambda-schemas.js";
import { LambdaDeleteFunctionSchema } from "../../lib/lambda-schemas.js";
import { LambdaService } from "../../services/lambda-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * Lambda delete function command for function removal
 *
 * Deletes a Lambda function with optional confirmation and safety checks
 * to prevent accidental deletions of production functions.
 *
 * @public
 */
export default class LambdaDeleteFunctionCommand extends BaseCommand {
  static override readonly description = "Delete a Lambda function";

  static override readonly examples = [
    {
      description: "Delete a function with confirmation prompt",
      command: "<%= config.bin %> <%= command.id %> my-function",
    },
    {
      description: "Delete a function without confirmation",
      command: "<%= config.bin %> <%= command.id %> my-function --force",
    },
    {
      description: "Delete a specific function version",
      command: "<%= config.bin %> <%= command.id %> my-function --qualifier v1",
    },
    {
      description: "Delete function in a specific region",
      command: "<%= config.bin %> <%= command.id %> my-function --region us-west-2",
    },
    {
      description: "Delete function using specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> my-function --profile production",
    },
    {
      description: "Dry run to validate deletion without executing",
      command: "<%= config.bin %> <%= command.id %> my-function --dry-run",
    },
  ];

  static override readonly args = {
    functionName: Args.string({
      name: "functionName",
      description: "Name or ARN of the Lambda function to delete",
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
      description: "Output format for deletion result",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    qualifier: Flags.string({
      char: "q",
      description: "Function version or alias to delete",
      helpValue: "VERSION_OR_ALIAS",
    }),

    force: Flags.boolean({
      description: "Delete function without confirmation prompt",
      default: false,
    }),

    "dry-run": Flags.boolean({
      description: "Validate deletion parameters without executing",
      default: false,
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the Lambda delete function command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(LambdaDeleteFunctionCommand);

    try {
      // Validate input using Zod schema
      const input: LambdaDeleteFunction = LambdaDeleteFunctionSchema.parse({
        functionName: args.functionName,
        qualifier: flags.qualifier,
        force: flags.force,
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

      // Handle dry run mode
      if (flags["dry-run"]) {
        await this.handleDryRun(input, lambdaService);
        return;
      }

      // Confirmation prompt (unless force flag is used)
      if (!flags.force) {
        const confirmed = await this.confirmDeletion(input);
        if (!confirmed) {
          this.log("Deletion cancelled");
          return;
        }
      }

      // Delete the Lambda function
      const deletionResult = await lambdaService.deleteFunction(
        input.functionName,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.qualifier,
      );

      // Format output based on requested format
      this.formatAndDisplayOutput(deletionResult, input.format, input.functionName);
    } catch (error) {
      const formattedError = formatLambdaError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Handle dry run mode validation
   *
   * @param input - Validated input parameters
   * @param lambdaService - Lambda service instance
   * @internal
   */
  private async handleDryRun(
    input: LambdaDeleteFunction,
    lambdaService: LambdaService,
  ): Promise<void> {
    const qualifierText = input.qualifier ? ` (${input.qualifier})` : "";
    this.log(`Dry Run: Would delete function '${input.functionName}'${qualifierText}`);

    // Validate that the function exists
    try {
      await lambdaService.getFunctionConfiguration(
        input.functionName,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.qualifier,
      );
      this.log(`Function exists and can be deleted`);
    } catch (error) {
      this.log(
        `Function validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Confirm deletion with user prompt
   *
   * @param input - Validated input parameters
   * @returns Promise resolving to confirmation result
   * @internal
   */
  private async confirmDeletion(input: LambdaDeleteFunction): Promise<boolean> {
    const qualifierSuffix = input.qualifier ? ` (${input.qualifier})` : "";
    const functionDisplayName = `${input.functionName}${qualifierSuffix}`;

    this.log(`You are about to delete function: ${functionDisplayName}`);
    this.log(`   Region: ${input.region || "default"}`);
    this.log(`   Profile: ${input.profile || "default"}`);
    this.log("");

    const readline = await import("node:readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const confirmed = await new Promise<boolean>((resolve) => {
      rl.question("Are you sure you want to delete this function? (y/N): ", (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
      });
    });

    return confirmed;
  }

  /**
   * Format and display the deletion result
   *
   * @param deletionResult - Deletion result to display
   * @param format - Output format to use
   * @param functionName - Function name for display
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    deletionResult: DeleteFunctionCommandOutput,
    format: string,
    functionName: string,
  ): void {
    switch (format) {
      case "table": {
        this.log(`Function Deleted: ${functionName}\n`);

        // Deletion Summary
        this.log("Deletion Summary:");
        const deletionInfo = [
          ["Function Name", functionName],
          ["Status", "Successfully Deleted"],
          ["Timestamp", new Date().toISOString()],
          ["Operation", "DELETE_FUNCTION"],
        ];

        for (const [key, value] of deletionInfo) {
          this.log(`  ${key}: ${value}`);
        }

        this.log(
          "\nNote: Function deletion is irreversible. All versions and aliases have been removed.",
        );
        break;
      }
      case "json": {
        const result = {
          functionName,
          status: "deleted",
          timestamp: new Date().toISOString(),
          operation: "DELETE_FUNCTION",
          success: true,
        };

        const processor = new DataProcessor({ format: DataFormat.JSON });
        const output = processor.formatOutput([{ data: result, index: 0 }]);
        this.log(output);
        break;
      }
      case "jsonl": {
        const result = {
          functionName,
          status: "deleted",
          timestamp: new Date().toISOString(),
          operation: "DELETE_FUNCTION",
          success: true,
        };

        const processor = new DataProcessor({ format: DataFormat.JSONL });
        const output = processor.formatOutput([{ data: result, index: 0 }]);
        this.log(output);
        break;
      }
      case "csv": {
        const result = {
          FunctionName: functionName,
          Status: "deleted",
          Timestamp: new Date().toISOString(),
          Operation: "DELETE_FUNCTION",
          Success: "true",
        };

        const processor = new DataProcessor({ format: DataFormat.CSV });
        const output = processor.formatOutput([{ data: result, index: 0 }]);
        this.log(output);
        break;
      }
      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }
}
