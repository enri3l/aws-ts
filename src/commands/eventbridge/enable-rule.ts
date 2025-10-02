/**
 * @module eventbridge/enable-rule
 * EventBridge enable rule command
 *
 * Enables a disabled EventBridge rule to activate event processing
 * and target invocation for the specified rule.
 *
 */

import { Args, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { getEventBridgeErrorGuidance } from "../../lib/eventbridge-errors.js";
import type { EventBridgeEnableRule } from "../../lib/eventbridge-schemas.js";
import { EventBridgeEnableRuleSchema } from "../../lib/eventbridge-schemas.js";
import { EventBridgeService } from "../../services/eventbridge-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * Rule enable operation result for display formatting
 *
 * @internal
 */
interface RuleEnableResult {
  /**
   * Indicates successful rule enable operation
   */
  readonly success: boolean;

  /**
   * Rule name that was enabled
   */
  readonly ruleName: string;

  /**
   * Event bus containing the rule
   */
  readonly eventBusName: string;
}

/**
 * EventBridge enable rule command for rule activation
 *
 * Enables a disabled EventBridge rule to activate event processing
 * and resume target invocations for the specified rule.
 *
 * @public
 */
export default class EventBridgeEnableRuleCommand extends BaseCommand {
  static override readonly description = "Enable an EventBridge rule";

  static override readonly examples = [
    {
      description: "Enable a rule on the default event bus",
      command: "<%= config.bin %> <%= command.id %> my-rule",
    },
    {
      description: "Enable a rule on a custom event bus",
      command: "<%= config.bin %> <%= command.id %> my-rule --event-bus-name custom-bus",
    },
    {
      description: "Enable rule with JSON output",
      command: "<%= config.bin %> <%= command.id %> my-rule --format json",
    },
    {
      description: "Enable rule in specific region",
      command: "<%= config.bin %> <%= command.id %> my-rule --region us-west-2",
    },
    {
      description: "Enable rule using specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> my-rule --profile production",
    },
    {
      description: "Enable rule with verbose output",
      command: "<%= config.bin %> <%= command.id %> my-rule --verbose",
    },
  ];

  static override readonly args = {
    ruleName: Args.string({
      name: "ruleName",
      description: "Name of the EventBridge rule to enable",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "event-bus-name": Flags.string({
      description: "Event bus name containing the rule",
      helpValue: "EVENT_BUS_NAME",
      default: "default",
    }),
  };

  /**
   * Execute the EventBridge enable rule command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(EventBridgeEnableRuleCommand);

    try {
      // Validate input using Zod schema
      const input: EventBridgeEnableRule = EventBridgeEnableRuleSchema.parse({
        ruleName: args.ruleName,
        eventBusName: flags["event-bus-name"],
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

      // Enable the rule
      await eventBridgeService.enableRule(
        input.name,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.eventBusName,
      );

      // Create result for display
      const enableResult: RuleEnableResult = {
        success: true,
        ruleName: input.name,
        eventBusName: input.eventBusName,
      };

      // Format output based on requested format
      this.formatAndDisplayOutput(enableResult, input.format, input.name, input.eventBusName);
    } catch (error) {
      const formattedError = this.formatEventBridgeError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the enable result
   *
   * @param enableResult - Enable result to display
   * @param format - Output format to use
   * @param ruleName - Rule name for display
   * @param eventBusName - Event bus name for display
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    enableResult: RuleEnableResult,
    format: string,
    ruleName: string,
    eventBusName: string,
  ): void {
    switch (format) {
      case "table": {
        this.log(`Rule Enabled: ${ruleName}\n`);

        // Enable Summary
        this.log("Enable Summary:");
        const enableInfo = [
          ["Rule Name", ruleName],
          ["Event Bus", eventBusName],
          ["Current State", "ENABLED"],
          ["Timestamp", new Date().toISOString()],
          ["Operation", "ENABLE_RULE"],
        ];

        for (const [key, value] of enableInfo) {
          this.log(`  ${key}: ${value}`);
        }

        this.log("\nNote: The rule is now active and will process matching events.");
        break;
      }
      case "json": {
        const result = {
          ruleName,
          eventBusName,
          currentState: "ENABLED",
          timestamp: new Date().toISOString(),
          operation: "ENABLE_RULE",
          success: true,
        };

        const processor = new DataProcessor({ format: DataFormat.JSON });
        const output = processor.formatOutput([{ data: result, index: 0 }]);
        this.log(output);
        break;
      }
      case "jsonl": {
        const result = {
          ruleName,
          eventBusName,
          currentState: "ENABLED",
          timestamp: new Date().toISOString(),
          operation: "ENABLE_RULE",
          success: true,
        };

        const processor = new DataProcessor({ format: DataFormat.JSONL });
        const output = processor.formatOutput([{ data: result, index: 0 }]);
        this.log(output);
        break;
      }
      case "csv": {
        const result = {
          RuleName: ruleName,
          EventBusName: eventBusName,
          CurrentState: "ENABLED",
          Timestamp: new Date().toISOString(),
          Operation: "ENABLE_RULE",
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
