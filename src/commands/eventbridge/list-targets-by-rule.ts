/**
 * EventBridge list targets by rule command
 *
 * Lists all targets configured for a specific EventBridge rule including
 * target ARNs, configurations, and input transformation settings.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { getEventBridgeErrorGuidance } from "../../lib/eventbridge-errors.js";
import type { EventBridgeListTargetsByRule } from "../../lib/eventbridge-schemas.js";
import { EventBridgeListTargetsByRuleSchema } from "../../lib/eventbridge-schemas.js";
import { EventBridgeService } from "../../services/eventbridge-service.js";

/**
 * EventBridge list targets by rule command for target discovery
 *
 * Lists all targets configured for a specific EventBridge rule with
 * comprehensive target information and configuration details.
 *
 * @public
 */
export default class EventBridgeListTargetsByRuleCommand extends Command {
  static override readonly description = "List all targets for an EventBridge rule";

  static override readonly examples = [
    {
      description: "List targets for a rule on the default event bus",
      command: "<%= config.bin %> <%= command.id %> my-rule",
    },
    {
      description: "List targets for a rule on a custom event bus",
      command: "<%= config.bin %> <%= command.id %> my-rule --event-bus-name custom-bus",
    },
    {
      description: "List targets with JSON output",
      command: "<%= config.bin %> <%= command.id %> my-rule --format json",
    },
    {
      description: "List targets in specific region",
      command: "<%= config.bin %> <%= command.id %> my-rule --region us-west-2",
    },
    {
      description: "List targets using specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> my-rule --profile production",
    },
    {
      description: "List targets with pagination",
      command: "<%= config.bin %> <%= command.id %> my-rule --limit 10 --next-token token123",
    },
  ];

  static override readonly args = {
    ruleName: Args.string({
      name: "ruleName",
      description: "Name of the EventBridge rule",
      required: true,
    }),
  };

  static override readonly flags = {
    region: Flags.string({
      char: "r",
      description: "AWS region containing the rule",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for targets list",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    "event-bus-name": Flags.string({
      description: "Event bus name containing the rule",
      helpValue: "EVENT_BUS_NAME",
      default: "default",
    }),

    limit: Flags.integer({
      description: "Maximum number of targets to return",
      min: 1,
      max: 100,
      helpValue: "NUMBER",
    }),

    "next-token": Flags.string({
      description: "Pagination token for next page of results",
      helpValue: "TOKEN",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the EventBridge list targets by rule command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(EventBridgeListTargetsByRuleCommand);

    try {
      // Validate input using Zod schema
      const input: EventBridgeListTargetsByRule = EventBridgeListTargetsByRuleSchema.parse({
        ruleName: args.ruleName,
        eventBusName: flags["event-bus-name"],
        limit: flags.limit,
        nextToken: flags["next-token"],
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      // Create EventBridge service instance
      const eventBridgeService = new EventBridgeService({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      // List targets for the rule
      const targetsResult = await eventBridgeService.listTargetsByRule(
        input.ruleName,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          EventBusName: input.eventBusName,
          Limit: input.limit,
          NextToken: input.nextToken,
        },
      );

      // Format output based on requested format
      this.formatAndDisplayOutput(targetsResult, input.format, input.ruleName, input.eventBusName);
    } catch (error) {
      const formattedError = this.formatEventBridgeError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the targets list output
   *
   * @param targetsResult - Targets result to display
   * @param format - Output format to use
   * @param ruleName - Rule name for display
   * @param eventBusName - Event bus name for display
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    targetsResult: any,
    format: string,
    ruleName: string,
    eventBusName: string,
  ): void {
    const targets = targetsResult.targets || [];
    const nextToken = targetsResult.nextToken;

    if (targets.length === 0) {
      this.log(`No targets found for rule '${ruleName}' on event bus '${eventBusName}'.`);
      return;
    }

    switch (format) {
      case "table": {
        this.log(`Found ${targets.length} targets for rule: ${ruleName} (${eventBusName})\n`);

        // Summary table
        const tableData = targets.map((target: any, index: number) => ({
          "#": index + 1,
          "Target ID": target.Id || "N/A",
          "Target ARN": target.Arn || "N/A",
          "Role ARN": target.RoleArn || "None",
          "Input Type": this.getInputType(target),
          "Retry Policy": target.RetryPolicy ? "Configured" : "Default",
          "Dead Letter": target.DeadLetterConfig ? "Configured" : "None",
        }));

        // Use DataProcessor for consistent table formatting
        const processor = new DataProcessor({ format: DataFormat.CSV });
        const output = processor.formatOutput(
          tableData.map((item, index) => ({ data: item, index })),
        );
        this.log(output);

        // Detailed target information
        this.log("\n📋 Target Details:");
        targets.forEach((target: any, index: number) => {
          this.log(`\n${index + 1}. Target: ${target.Id || "N/A"}`);
          this.log(`   ARN: ${target.Arn || "N/A"}`);

          if (target.RoleArn) {
            this.log(`   Role: ${target.RoleArn}`);
          }

          if (target.Input) {
            this.log(`   Static Input: Configured (${target.Input.length} characters)`);
          }

          if (target.InputPath) {
            this.log(`   Input Path: ${target.InputPath}`);
          }

          if (target.InputTransformer) {
            this.log(`   Input Transformer: Configured`);
            if (target.InputTransformer.InputPathsMap) {
              this.log(`   Input Paths: ${Object.keys(target.InputTransformer.InputPathsMap).length} paths`);
            }
          }

          if (target.RetryPolicy) {
            this.log(`   Retry Policy: Max ${target.RetryPolicy.MaximumRetryAttempts || 0} attempts, ${target.RetryPolicy.MaximumEventAgeInSeconds || 0}s max age`);
          }

          if (target.DeadLetterConfig) {
            this.log(`   Dead Letter Queue: ${target.DeadLetterConfig.Arn}`);
          }
        });

        // Pagination info
        if (nextToken) {
          this.log(`\n📄 More targets available. Use --next-token ${nextToken} to continue.`);
        }

        break;
      }
      case "json": {
        const result = {
          targets,
          nextToken,
          totalCount: targets.length,
          ruleName,
          eventBusName,
        };

        const processor = new DataProcessor({ format: DataFormat.JSON });
        const output = processor.formatOutput([{ data: result, index: 0 }]);
        this.log(output);
        break;
      }
      case "jsonl": {
        const processor = new DataProcessor({ format: DataFormat.JSONL });
        const output = processor.formatOutput(
          targets.map((target: any, index: number) => ({ data: target, index })),
        );
        this.log(output);
        break;
      }
      case "csv": {
        // Flatten targets for CSV output
        const flattenedData = targets.map((target: any) => ({
          Id: target.Id || "",
          Arn: target.Arn || "",
          RoleArn: target.RoleArn || "",
          Input: target.Input || "",
          InputPath: target.InputPath || "",
          HasInputTransformer: target.InputTransformer ? "true" : "false",
          InputPathsCount: target.InputTransformer?.InputPathsMap ? Object.keys(target.InputTransformer.InputPathsMap).length : 0,
          HasRetryPolicy: target.RetryPolicy ? "true" : "false",
          MaxRetryAttempts: target.RetryPolicy?.MaximumRetryAttempts || 0,
          MaxEventAgeSeconds: target.RetryPolicy?.MaximumEventAgeInSeconds || 0,
          HasDeadLetterConfig: target.DeadLetterConfig ? "true" : "false",
          DeadLetterArn: target.DeadLetterConfig?.Arn || "",
          RuleName: ruleName,
          EventBusName: eventBusName,
        }));

        const processor = new DataProcessor({ format: DataFormat.CSV });
        const output = processor.formatOutput(
          flattenedData.map((item, index) => ({ data: item, index })),
        );
        this.log(output);
        break;
      }
      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }

  /**
   * Determine the input type for a target
   *
   * @param target - Target object to analyze
   * @returns Input type description
   * @internal
   */
  private getInputType(target: any): string {
    if (target.Input) {
      return "Static";
    }
    if (target.InputPath) {
      return "JSONPath";
    }
    if (target.InputTransformer) {
      return "Transformer";
    }
    return "Default";
  }

  /**
   * Format EventBridge-specific errors with user guidance
   *
   * @param error - The error to format
   * @param verbose - Whether to include verbose error details
   * @returns Formatted error message with guidance
   * @internal
   */
  private formatEventBridgeError(error: unknown, verbose: boolean): string {
    const guidance = getEventBridgeErrorGuidance(error);

    if (verbose && error instanceof Error) {
      return `${error.message}\n\n${guidance}`;
    }

    if (error instanceof Error) {
      return `${error.message}\n\n${guidance}`;
    }

    return `An unknown error occurred\n\n${guidance}`;
  }
}