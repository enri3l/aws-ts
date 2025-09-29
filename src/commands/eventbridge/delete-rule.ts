/**
 * EventBridge delete rule command
 *
 * Deletes an EventBridge rule with safety confirmations and validation
 * to prevent accidental deletion of critical event processing rules.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { getEventBridgeErrorGuidance } from "../../lib/eventbridge-errors.js";
import type { EventBridgeDeleteRule } from "../../lib/eventbridge-schemas.js";
import { EventBridgeDeleteRuleSchema } from "../../lib/eventbridge-schemas.js";
import { EventBridgeService } from "../../services/eventbridge-service.js";

/**
 * Rule deletion result for display formatting
 *
 * @internal
 */
interface RuleDeletionResult {
  /**
   * Indicates successful rule deletion
   */
  readonly success: boolean;
}

/**
 * EventBridge delete rule command for rule removal
 *
 * Deletes an EventBridge rule with optional confirmation and safety checks
 * to prevent accidental deletions of production rules.
 *
 * @public
 */
export default class EventBridgeDeleteRuleCommand extends Command {
  static override readonly description = "Delete an EventBridge rule";

  static override readonly examples = [
    {
      description: "Delete a rule with confirmation prompt",
      command: "<%= config.bin %> <%= command.id %> my-rule",
    },
    {
      description: "Delete a rule without confirmation",
      command: "<%= config.bin %> <%= command.id %> my-rule --force",
    },
    {
      description: "Delete rule on custom event bus",
      command: "<%= config.bin %> <%= command.id %> my-rule --event-bus-name custom-bus",
    },
    {
      description: "Delete rule in specific region",
      command: "<%= config.bin %> <%= command.id %> my-rule --region us-west-2",
    },
    {
      description: "Delete rule using specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> my-rule --profile production",
    },
    {
      description: "Dry run to validate deletion without executing",
      command: "<%= config.bin %> <%= command.id %> my-rule --dry-run",
    },
  ];

  static override readonly args = {
    ruleName: Args.string({
      name: "ruleName",
      description: "Name of the EventBridge rule to delete",
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
      description: "Output format for deletion result",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    "event-bus-name": Flags.string({
      description: "Event bus name containing the rule",
      helpValue: "EVENT_BUS_NAME",
      default: "default",
    }),

    force: Flags.boolean({
      description: "Delete rule without confirmation prompt",
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
   * Execute the EventBridge delete rule command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(EventBridgeDeleteRuleCommand);

    try {
      // Validate input using Zod schema
      const input: EventBridgeDeleteRule = EventBridgeDeleteRuleSchema.parse({
        name: args.ruleName,
        eventBusName: flags["event-bus-name"],
        force: flags.force,
        dryRun: flags["dry-run"],
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

      // Handle dry run mode
      if (input.dryRun) {
        await this.handleDryRunMode(eventBridgeService, input);
        return;
      }

      // Handle confirmation flow
      if (!input.force) {
        const confirmed = await this.requestUserConfirmation(input);
        if (!confirmed) {
          this.log("❌ Deletion cancelled");
          return;
        }
      }

      // Execute rule deletion
      await this.executeRuleDeletion(eventBridgeService, input);
    } catch (error) {
      const formattedError = this.formatEventBridgeError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Handle dry run mode by validating rule existence
   *
   * @param eventBridgeService - EventBridge service instance
   * @param input - Command input parameters
   * @internal
   */
  private async handleDryRunMode(
    eventBridgeService: EventBridgeService,
    input: EventBridgeDeleteRule,
  ): Promise<void> {
    if (input.verbose) {
      this.log(
        `🔍 Verbose: Preparing to delete rule '${input.name}' on event bus '${input.eventBusName}'`,
      );

      // Validate that the rule exists
      try {
        await eventBridgeService.describeRule(
          input.name,
          {
            ...(input.region && { region: input.region }),
            ...(input.profile && { profile: input.profile }),
          },
          input.eventBusName,
        );
        this.log(`✅ Rule exists and can be deleted`);
      } catch (error) {
        this.log(
          `❌ Rule validation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }
  }

  /**
   * Request user confirmation for rule deletion
   *
   * @param input - Command input parameters
   * @returns Promise resolving to user confirmation result
   * @internal
   */
  private async requestUserConfirmation(input: EventBridgeDeleteRule): Promise<boolean> {
    this.log(`⚠️  You are about to delete rule: ${input.name}`);
    this.log(`   Event Bus: ${input.eventBusName}`);
    this.log(`   Region: ${input.region || "default"}`);
    this.log(`   Profile: ${input.profile || "default"}`);
    this.log("");

    const readline = await import("node:readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise<boolean>((resolve) => {
      rl.question("Are you sure you want to delete this rule? (y/N): ", (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
      });
    });
  }

  /**
   * Execute rule deletion and display results
   *
   * @param eventBridgeService - EventBridge service instance
   * @param input - Command input parameters
   * @internal
   */
  private async executeRuleDeletion(
    eventBridgeService: EventBridgeService,
    input: EventBridgeDeleteRule,
  ): Promise<void> {
    // Delete the EventBridge rule
    await eventBridgeService.deleteRule(
      {
        name: input.name,
        eventBusName: input.eventBusName,
        force: input.force,
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );

    // Format output based on requested format
    const deletionResult: RuleDeletionResult = { success: true };
    this.formatAndDisplayOutput(deletionResult, input.format, input.name, input.eventBusName);
  }

  /**
   * Format and display the deletion result
   *
   * @param deletionResult - Deletion result to display
   * @param format - Output format to use
   * @param ruleName - Rule name for display
   * @param eventBusName - Event bus name for display
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    deletionResult: RuleDeletionResult,
    format: string,
    ruleName: string,
    eventBusName: string,
  ): void {
    switch (format) {
      case "table": {
        this.log(`✅ Rule Deleted: ${ruleName}\n`);

        // Deletion Summary
        this.log("🗑️  Deletion Summary:");
        const deletionInfo = [
          ["Rule Name", ruleName],
          ["Event Bus", eventBusName],
          ["Status", "Successfully Deleted"],
          ["Timestamp", new Date().toISOString()],
          ["Operation", "DELETE_RULE"],
        ];

        for (const [key, value] of deletionInfo) {
          this.log(`  ${key}: ${value}`);
        }

        this.log(
          "\n💡 Note: Rule deletion is irreversible. All associated targets have been removed.",
        );
        break;
      }
      case "json": {
        const result = {
          ruleName,
          eventBusName,
          status: "deleted",
          timestamp: new Date().toISOString(),
          operation: "DELETE_RULE",
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
          status: "deleted",
          timestamp: new Date().toISOString(),
          operation: "DELETE_RULE",
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
          Status: "deleted",
          Timestamp: new Date().toISOString(),
          Operation: "DELETE_RULE",
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
