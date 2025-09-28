/**
 * EventBridge remove targets command
 *
 * Removes specific targets from an EventBridge rule with validation
 * and safety checks to prevent accidental removal of critical targets.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { getEventBridgeErrorGuidance } from "../../lib/eventbridge-errors.js";
import type { EventBridgeRemoveTargets } from "../../lib/eventbridge-schemas.js";
import { EventBridgeRemoveTargetsSchema } from "../../lib/eventbridge-schemas.js";
import { EventBridgeService } from "../../services/eventbridge-service.js";

/**
 * EventBridge remove targets command for target removal
 *
 * Removes specific targets from an EventBridge rule with optional
 * confirmation and safety checks to prevent accidental removals.
 *
 * @public
 */
export default class EventBridgeRemoveTargetsCommand extends Command {
  static override readonly description = "Remove targets from an EventBridge rule";

  static override readonly examples = [
    {
      description: "Remove a single target by ID",
      command: "<%= config.bin %> <%= command.id %> my-rule lambda-target",
    },
    {
      description: "Remove multiple targets by ID",
      command: "<%= config.bin %> <%= command.id %> my-rule lambda-target,sqs-target,sns-target",
    },
    {
      description: "Remove targets on custom event bus",
      command: "<%= config.bin %> <%= command.id %> my-rule target-id --event-bus-name custom-bus",
    },
    {
      description: "Remove targets without confirmation",
      command: "<%= config.bin %> <%= command.id %> my-rule target-id --force",
    },
    {
      description: "Remove targets in specific region",
      command: "<%= config.bin %> <%= command.id %> my-rule target-id --region us-west-2",
    },
    {
      description: "Dry run to validate removal without executing",
      command: "<%= config.bin %> <%= command.id %> my-rule target-id --dry-run",
    },
    {
      description: "Remove targets with JSON output",
      command: "<%= config.bin %> <%= command.id %> my-rule target-id --format json",
    },
  ];

  static override readonly args = {
    ruleName: Args.string({
      name: "ruleName",
      description: "Name of the EventBridge rule",
      required: true,
    }),
    targetIds: Args.string({
      name: "targetIds",
      description: "Target IDs to remove (comma-separated for multiple)",
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
      description: "Output format for remove targets result",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    "event-bus-name": Flags.string({
      description: "Event bus name containing the rule",
      helpValue: "EVENT_BUS_NAME",
      default: "default",
    }),

    force: Flags.boolean({
      description: "Remove targets without confirmation prompt",
      default: false,
    }),

    "dry-run": Flags.boolean({
      description: "Validate removal parameters without executing",
      default: false,
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the EventBridge remove targets command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(EventBridgeRemoveTargetsCommand);

    try {
      // Parse target IDs
      const targetIdList = args.targetIds.split(",").map((id: string) => id.trim()).filter((id: string) => id.length > 0);

      if (targetIdList.length === 0) {
        this.error("At least one target ID must be provided");
      }

      // Validate input using Zod schema
      const input: EventBridgeRemoveTargets = EventBridgeRemoveTargetsSchema.parse({
        ruleName: args.ruleName,
        targetIds: targetIdList,
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
        this.log(`🔍 Dry Run: Would remove ${input.targetIds.length} target(s) from rule '${input.ruleName}'`);
        this.log(`   Target IDs: ${input.targetIds.join(", ")}`);
        this.log(`   Event Bus: ${input.eventBusName}`);

        // Validate that the rule and targets exist
        try {
          const targetsResult = await eventBridgeService.listTargetsByRule(
            input.ruleName,
            {
              ...(input.region && { region: input.region }),
              ...(input.profile && { profile: input.profile }),
            },
            { EventBusName: input.eventBusName },
          );

          const existingTargetIds = targetsResult.targets?.map((t: any) => t.Id) || [];
          const missingTargets = input.targetIds.filter(id => !existingTargetIds.includes(id));

          if (missingTargets.length > 0) {
            this.log(`❌ Missing targets: ${missingTargets.join(", ")}`);
          } else {
            this.log(`✅ All targets exist and can be removed`);
          }
        } catch (error) {
          this.log(`❌ Validation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
        return;
      }

      // Confirmation prompt (unless force flag is used)
      if (!input.force) {
        this.log(`⚠️  You are about to remove ${input.targetIds.length} target(s) from rule: ${input.ruleName}`);
        this.log(`   Target IDs: ${input.targetIds.join(", ")}`);
        this.log(`   Event Bus: ${input.eventBusName}`);
        this.log(`   Region: ${input.region || "default"}`);
        this.log(`   Profile: ${input.profile || "default"}`);
        this.log("");

        const readline = await import("node:readline");
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const confirmed = await new Promise<boolean>((resolve) => {
          rl.question("Are you sure you want to remove these targets? (y/N): ", (answer) => {
            rl.close();
            resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
          });
        });

        if (!confirmed) {
          this.log("❌ Removal cancelled");
          return;
        }
      }

      // Remove targets from the rule
      const removeTargetsResult = await eventBridgeService.removeTargets(
        {
          ruleName: input.ruleName,
          targetIds: input.targetIds,
          eventBusName: input.eventBusName,
        },
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      // Format output based on requested format
      this.formatAndDisplayOutput(removeTargetsResult, input.format, input.ruleName, input.eventBusName, input.targetIds);
    } catch (error) {
      const formattedError = this.formatEventBridgeError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the remove targets result
   *
   * @param removeTargetsResult - Remove targets result to display
   * @param format - Output format to use
   * @param ruleName - Rule name for display
   * @param eventBusName - Event bus name for display
   * @param targetIds - Target IDs that were requested for removal
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    removeTargetsResult: any,
    format: string,
    ruleName: string,
    eventBusName: string,
    targetIds: string[],
  ): void {
    switch (format) {
      case "table": {
        this.log(`✅ Targets Removed from rule: ${ruleName}\n`);

        // Removal Summary
        this.log("🗑️  Removal Summary:");
        const removalInfo = [
          ["Rule Name", ruleName],
          ["Event Bus", eventBusName],
          ["Targets Requested", targetIds.length],
          ["Successfully Removed", removeTargetsResult.successCount || 0],
          ["Failed to Remove", removeTargetsResult.failureCount || 0],
          ["Timestamp", new Date().toISOString()],
          ["Operation", "REMOVE_TARGETS"],
        ];

        removalInfo.forEach(([key, value]) => {
          this.log(`  ${key}: ${value}`);
        });

        // Success Details
        if (removeTargetsResult.successCount > 0) {
          this.log("\n✅ Successfully Removed:");
          const successfulTargets = targetIds.filter(id =>
            !removeTargetsResult.failedEntries?.some((entry: any) => entry.TargetId === id)
          );
          successfulTargets.forEach((targetId: string, index: number) => {
            this.log(`  ${index + 1}. ${targetId}`);
          });
        }

        // Failure Details
        if (removeTargetsResult.failedEntries && removeTargetsResult.failedEntries.length > 0) {
          this.log("\n❌ Failed to Remove:");
          removeTargetsResult.failedEntries.forEach((failure: any, index: number) => {
            this.log(`  ${index + 1}. Target ID: ${failure.TargetId}`);
            this.log(`     Error Code: ${failure.ErrorCode}`);
            this.log(`     Error Message: ${failure.ErrorMessage}`);
          });
        }

        break;
      }
      case "json": {
        const result = {
          ...removeTargetsResult,
          ruleName,
          eventBusName,
          requestedTargets: targetIds,
          timestamp: new Date().toISOString(),
          operation: "REMOVE_TARGETS",
        };

        const processor = new DataProcessor({ format: DataFormat.JSON });
        const output = processor.formatOutput([{ data: result, index: 0 }]);
        this.log(output);
        break;
      }
      case "jsonl": {
        const result = {
          ...removeTargetsResult,
          ruleName,
          eventBusName,
          requestedTargets: targetIds,
          timestamp: new Date().toISOString(),
          operation: "REMOVE_TARGETS",
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
          TargetsRequested: targetIds.length,
          SuccessCount: removeTargetsResult.successCount || 0,
          FailureCount: removeTargetsResult.failureCount || 0,
          HasFailures: removeTargetsResult.failureCount > 0 ? "true" : "false",
          RequestedTargetIds: targetIds.join(";"),
          Timestamp: new Date().toISOString(),
          Operation: "REMOVE_TARGETS",
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