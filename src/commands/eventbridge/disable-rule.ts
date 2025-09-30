/**
 * EventBridge disable rule command
 *
 * Disables an enabled EventBridge rule to temporarily stop event processing
 * and target invocation without deleting the rule configuration.
 *
 */

import { Args, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { getEventBridgeErrorGuidance } from "../../lib/eventbridge-errors.js";
import type { EventBridgeDisableRule } from "../../lib/eventbridge-schemas.js";
import { EventBridgeDisableRuleSchema } from "../../lib/eventbridge-schemas.js";
import { EventBridgeService } from "../../services/eventbridge-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * Rule disable operation result for display formatting
 *
 * @internal
 */
interface RuleDisableResult {
  /**
   * Indicates successful rule disable operation
   */
  readonly success: boolean;

  /**
   * Rule name that was disabled
   */
  readonly ruleName: string;

  /**
   * Event bus containing the rule
   */
  readonly eventBusName: string;
}

/**
 * EventBridge disable rule command for rule deactivation
 *
 * Disables an enabled EventBridge rule to temporarily stop event processing
 * and pause target invocations without deleting the rule configuration.
 *
 * @public
 */
export default class EventBridgeDisableRuleCommand extends BaseCommand {
  static override readonly description = "Disable an EventBridge rule";

  static override readonly examples = [
    {
      description: "Disable a rule on the default event bus",
      command: "<%= config.bin %> <%= command.id %> my-rule",
    },
    {
      description: "Disable a rule on a custom event bus",
      command: "<%= config.bin %> <%= command.id %> my-rule --event-bus-name custom-bus",
    },
    {
      description: "Disable rule with JSON output",
      command: "<%= config.bin %> <%= command.id %> my-rule --format json",
    },
    {
      description: "Disable rule in specific region",
      command: "<%= config.bin %> <%= command.id %> my-rule --region us-west-2",
    },
    {
      description: "Disable rule using specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> my-rule --profile production",
    },
    {
      description: "Disable rule with verbose output",
      command: "<%= config.bin %> <%= command.id %> my-rule --verbose",
    },
  ];

  static override readonly args = {
    ruleName: Args.string({
      name: "ruleName",
      description: "Name of the EventBridge rule to disable",
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
      description: "Output format for disable result",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    "event-bus-name": Flags.string({
      description: "Event bus name containing the rule",
      helpValue: "EVENT_BUS_NAME",
      default: "default",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the EventBridge disable rule command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(EventBridgeDisableRuleCommand);

    try {
      // Validate input using Zod schema
      const input: EventBridgeDisableRule = EventBridgeDisableRuleSchema.parse({
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

      // Disable the rule
      await eventBridgeService.disableRule(
        input.name,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.eventBusName,
      );

      // Create result for display
      const disableResult: RuleDisableResult = {
        success: true,
        ruleName: input.name,
        eventBusName: input.eventBusName,
      };

      // Format output based on requested format
      this.formatAndDisplayOutput(disableResult, input.format, input.name, input.eventBusName);
    } catch (error) {
      const formattedError = this.formatEventBridgeError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the disable result
   *
   * @param disableResult - Disable result to display
   * @param format - Output format to use
   * @param ruleName - Rule name for display
   * @param eventBusName - Event bus name for display
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    disableResult: RuleDisableResult,
    format: string,
    ruleName: string,
    eventBusName: string,
  ): void {
    switch (format) {
      case "table": {
        this.log(`  Rule Disabled: ${ruleName}\n`);

        // Disable Summary
        this.log("  Disable Summary:");
        const disableInfo = [
          ["Rule Name", ruleName],
          ["Event Bus", eventBusName],
          ["Current State", "DISABLED"],
          ["Timestamp", new Date().toISOString()],
          ["Operation", "DISABLE_RULE"],
        ];

        for (const [key, value] of disableInfo) {
          this.log(`  ${key}: ${value}`);
        }

        this.log(
          "\nNote: The rule is now inactive and will not process events. Use 'eventbridge:enable-rule' to reactivate.",
        );
        break;
      }
      case "json": {
        const result = {
          ruleName,
          eventBusName,
          currentState: "DISABLED",
          timestamp: new Date().toISOString(),
          operation: "DISABLE_RULE",
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
          currentState: "DISABLED",
          timestamp: new Date().toISOString(),
          operation: "DISABLE_RULE",
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
          CurrentState: "DISABLED",
          Timestamp: new Date().toISOString(),
          Operation: "DISABLE_RULE",
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
