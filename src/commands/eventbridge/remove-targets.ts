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
 * Remove targets result from EventBridge service
 *
 * @internal
 */
interface RemoveTargetsResult {
  /**
   * Number of successful target removals
   */
  readonly successCount?: number;

  /**
   * Number of failed target removals
   */
  readonly failureCount?: number;

  /**
   * Array of failed target removal entries
   */
  failedEntries?: Array<{
    readonly TargetId?: string;
    readonly ErrorCode?: string;
    readonly ErrorMessage?: string;
  }>;
}

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
      const targetIdList = this.parseAndValidateTargetIds(args.targetIds);
      const input = this.validateAndParseInput(args, flags, targetIdList);
      const eventBridgeService = this.createEventBridgeService(input);

      // Handle dry run mode first
      if (input.dryRun) {
        await this.handleDryRunMode(input, eventBridgeService);
        return;
      }

      // Handle confirmation prompt (unless force flag is used)
      if (!input.force) {
        const confirmed = await this.handleConfirmationPrompt(input);
        if (!confirmed) {
          this.log("❌ Removal cancelled");
          return;
        }
      }

      // Execute target removal and display results
      const removeTargetsResult = await this.executeTargetRemoval(input, eventBridgeService);
      this.formatAndDisplayOutput(
        removeTargetsResult,
        input.format,
        input.rule,
        input.eventBusName,
        input.ids,
      );
    } catch (error) {
      const formattedError = this.formatEventBridgeError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Parse and validate target IDs from command arguments
   *
   * @param targetIdsArgument - Target IDs argument from command line
   * @returns Array of validated target IDs
   * @internal
   */
  private parseAndValidateTargetIds(targetIdsArgument: string): string[] {
    const targetIdList = targetIdsArgument
      .split(",")
      .map((id: string) => id.trim())
      .filter((id: string) => id.length > 0);

    if (targetIdList.length === 0) {
      this.error("At least one target ID must be provided");
    }

    return targetIdList;
  }

  /**
   * Validate and parse command input using Zod schema
   *
   * @param arguments_ - Command arguments
   * @param flags - Command flags
   * @param targetIdList - Parsed target IDs
   * @returns Validated input configuration
   * @internal
   */
  private validateAndParseInput(
    arguments_: { ruleName: string },
    flags: {
      "event-bus-name": string;
      force: boolean;
      "dry-run": boolean;
      region: string | undefined;
      profile: string | undefined;
      format: string;
      verbose: boolean;
    } & Record<string, unknown> & { json: boolean | undefined },
    targetIdList: string[],
  ): EventBridgeRemoveTargets {
    return EventBridgeRemoveTargetsSchema.parse({
      rule: arguments_.ruleName,
      ids: targetIdList,
      eventBusName: flags["event-bus-name"],
      force: flags.force,
      dryRun: flags["dry-run"],
      region: flags.region,
      profile: flags.profile,
      format: flags.format,
      verbose: flags.verbose,
    });
  }

  /**
   * Create EventBridge service instance with configuration
   *
   * @param input - Validated input configuration
   * @returns Configured EventBridge service instance
   * @internal
   */
  private createEventBridgeService(input: EventBridgeRemoveTargets): EventBridgeService {
    return new EventBridgeService({
      enableDebugLogging: input.verbose,
      enableProgressIndicators: true,
      clientConfig: {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    });
  }

  /**
   * Handle dry run mode with target validation
   *
   * @param input - Validated input configuration
   * @param eventBridgeService - EventBridge service instance
   * @internal
   */
  private async handleDryRunMode(
    input: EventBridgeRemoveTargets,
    eventBridgeService: EventBridgeService,
  ): Promise<void> {
    this.log(`🔍 Dry Run: Would remove ${input.ids.length} target(s) from rule '${input.rule}'`);
    this.log(`   Target IDs: ${input.ids.join(", ")}`);
    this.log(`   Event Bus: ${input.eventBusName}`);

    await this.validateTargetsExist(input, eventBridgeService);
  }

  /**
   * Validate that targets exist on the rule
   *
   * @param input - Validated input configuration
   * @param eventBridgeService - EventBridge service instance
   * @internal
   */
  private async validateTargetsExist(
    input: EventBridgeRemoveTargets,
    eventBridgeService: EventBridgeService,
  ): Promise<void> {
    try {
      const targetsResult = await eventBridgeService.listTargetsByRule(
        input.rule,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.eventBusName,
      );

      const existingTargetIds =
        targetsResult.items?.map((target) => target.Id).filter(Boolean) ?? [];
      const missingTargets = input.ids.filter((id) => !existingTargetIds.includes(id));

      if (missingTargets.length > 0) {
        this.log(`❌ Missing targets: ${missingTargets.join(", ")}`);
      } else {
        this.log(`✅ All targets exist and can be removed`);
      }
    } catch (error) {
      this.log(`❌ Validation failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }

  /**
   * Handle user confirmation prompt for target removal
   *
   * @param input - Validated input configuration
   * @returns Promise resolving to confirmation result
   * @internal
   */
  private async handleConfirmationPrompt(input: EventBridgeRemoveTargets): Promise<boolean> {
    this.displayRemovalWarning(input);

    const readline = await import("node:readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise<boolean>((resolve) => {
      rl.question("Are you sure you want to remove these targets? (y/N): ", (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
      });
    });
  }

  /**
   * Display warning information before target removal
   *
   * @param input - Validated input configuration
   * @internal
   */
  private displayRemovalWarning(input: EventBridgeRemoveTargets): void {
    this.log(`⚠️  You are about to remove ${input.ids.length} target(s) from rule: ${input.rule}`);
    this.log(`   Target IDs: ${input.ids.join(", ")}`);
    this.log(`   Event Bus: ${input.eventBusName}`);
    this.log(`   Region: ${input.region ?? "default"}`);
    this.log(`   Profile: ${input.profile ?? "default"}`);
    this.log("");
  }

  /**
   * Execute target removal operation
   *
   * @param input - Validated input configuration
   * @param eventBridgeService - EventBridge service instance
   * @returns Promise resolving to removal result
   * @internal
   */
  private async executeTargetRemoval(
    input: EventBridgeRemoveTargets,
    eventBridgeService: EventBridgeService,
  ): Promise<RemoveTargetsResult> {
    const response = await eventBridgeService.removeTargets(
      {
        rule: input.rule,
        ids: input.ids,
        eventBusName: input.eventBusName,
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );

    // Convert AWS SDK response to our result format
    const result: RemoveTargetsResult = {
      successCount: input.ids.length - (response.FailedEntryCount || 0),
      failureCount: response.FailedEntryCount || 0,
    };

    // Add failedEntries only if there are actual failures (exactOptionalPropertyTypes compliance)
    if (response.FailedEntries && response.FailedEntries.length > 0) {
      result.failedEntries = response.FailedEntries.map((entry) => {
        const failureEntry: {
          readonly TargetId?: string;
          readonly ErrorCode?: string;
          readonly ErrorMessage?: string;
        } = {};
        if (entry.TargetId !== undefined) {
          (failureEntry as { TargetId?: string }).TargetId = entry.TargetId;
        }
        if (entry.ErrorCode !== undefined) {
          (failureEntry as { ErrorCode?: string }).ErrorCode = entry.ErrorCode;
        }
        if (entry.ErrorMessage !== undefined) {
          (failureEntry as { ErrorMessage?: string }).ErrorMessage = entry.ErrorMessage;
        }
        return failureEntry;
      });
    }

    return result;
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
    removeTargetsResult: RemoveTargetsResult,
    format: string,
    ruleName: string,
    eventBusName: string,
    targetIds: string[],
  ): void {
    switch (format) {
      case "table": {
        this.displayTableFormat(removeTargetsResult, ruleName, eventBusName, targetIds);
        break;
      }
      case "json": {
        this.displayJsonFormat(removeTargetsResult, ruleName, eventBusName, targetIds);
        break;
      }
      case "jsonl": {
        this.displayJsonlFormat(removeTargetsResult, ruleName, eventBusName, targetIds);
        break;
      }
      case "csv": {
        this.displayCsvFormat(removeTargetsResult, ruleName, eventBusName, targetIds);
        break;
      }
      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }

  /**
   * Display remove targets result in table format
   *
   * @param removeTargetsResult - Remove targets result to display
   * @param ruleName - Rule name for display
   * @param eventBusName - Event bus name for display
   * @param targetIds - Target IDs that were requested for removal
   * @internal
   */
  private displayTableFormat(
    removeTargetsResult: RemoveTargetsResult,
    ruleName: string,
    eventBusName: string,
    targetIds: string[],
  ): void {
    this.log(`✅ Targets Removed from rule: ${ruleName}\n`);

    this.displayRemovalSummary(removeTargetsResult, ruleName, eventBusName, targetIds);
    this.displaySuccessDetails(removeTargetsResult, targetIds);
    this.displayFailureDetails(removeTargetsResult);
  }

  /**
   * Display removal summary section
   *
   * @param removeTargetsResult - Remove targets result to display
   * @param ruleName - Rule name for display
   * @param eventBusName - Event bus name for display
   * @param targetIds - Target IDs that were requested for removal
   * @internal
   */
  private displayRemovalSummary(
    removeTargetsResult: RemoveTargetsResult,
    ruleName: string,
    eventBusName: string,
    targetIds: string[],
  ): void {
    this.log("🗑️  Removal Summary:");
    const removalInfo = [
      ["Rule Name", ruleName],
      ["Event Bus", eventBusName],
      ["Targets Requested", targetIds.length],
      ["Successfully Removed", removeTargetsResult.successCount ?? 0],
      ["Failed to Remove", removeTargetsResult.failureCount ?? 0],
      ["Timestamp", new Date().toISOString()],
      ["Operation", "REMOVE_TARGETS"],
    ];

    for (const [key, value] of removalInfo) {
      this.log(`  ${key}: ${value}`);
    }
  }

  /**
   * Display success details section
   *
   * @param removeTargetsResult - Remove targets result to display
   * @param targetIds - Target IDs that were requested for removal
   * @internal
   */
  private displaySuccessDetails(
    removeTargetsResult: RemoveTargetsResult,
    targetIds: string[],
  ): void {
    if ((removeTargetsResult.successCount ?? 0) > 0) {
      this.log("\n✅ Successfully Removed:");
      const successfulTargets = targetIds.filter(
        (id) => !removeTargetsResult.failedEntries?.some((entry) => entry.TargetId === id),
      );
      for (const [index, targetId] of successfulTargets.entries()) {
        this.log(`  ${index + 1}. ${targetId}`);
      }
    }
  }

  /**
   * Display failure details section
   *
   * @param removeTargetsResult - Remove targets result to display
   * @internal
   */
  private displayFailureDetails(removeTargetsResult: RemoveTargetsResult): void {
    if (removeTargetsResult.failedEntries && removeTargetsResult.failedEntries.length > 0) {
      this.log("\n❌ Failed to Remove:");
      for (const [index, failure] of removeTargetsResult.failedEntries.entries()) {
        this.log(`  ${index + 1}. Target ID: ${failure.TargetId ?? "N/A"}`);
        this.log(`     Error Code: ${failure.ErrorCode ?? "N/A"}`);
        this.log(`     Error Message: ${failure.ErrorMessage ?? "N/A"}`);
      }
    }
  }

  /**
   * Display remove targets result in JSON format
   *
   * @param removeTargetsResult - Remove targets result to display
   * @param ruleName - Rule name for display
   * @param eventBusName - Event bus name for display
   * @param targetIds - Target IDs that were requested for removal
   * @internal
   */
  private displayJsonFormat(
    removeTargetsResult: RemoveTargetsResult,
    ruleName: string,
    eventBusName: string,
    targetIds: string[],
  ): void {
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
  }

  /**
   * Display remove targets result in JSONL format
   *
   * @param removeTargetsResult - Remove targets result to display
   * @param ruleName - Rule name for display
   * @param eventBusName - Event bus name for display
   * @param targetIds - Target IDs that were requested for removal
   * @internal
   */
  private displayJsonlFormat(
    removeTargetsResult: RemoveTargetsResult,
    ruleName: string,
    eventBusName: string,
    targetIds: string[],
  ): void {
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
  }

  /**
   * Display remove targets result in CSV format
   *
   * @param removeTargetsResult - Remove targets result to display
   * @param ruleName - Rule name for display
   * @param eventBusName - Event bus name for display
   * @param targetIds - Target IDs that were requested for removal
   * @internal
   */
  private displayCsvFormat(
    removeTargetsResult: RemoveTargetsResult,
    ruleName: string,
    eventBusName: string,
    targetIds: string[],
  ): void {
    const result = {
      RuleName: ruleName,
      EventBusName: eventBusName,
      TargetsRequested: targetIds.length,
      SuccessCount: removeTargetsResult.successCount ?? 0,
      FailureCount: removeTargetsResult.failureCount ?? 0,
      HasFailures: (removeTargetsResult.failureCount ?? 0) > 0 ? "true" : "false",
      RequestedTargetIds: targetIds.join(";"),
      Timestamp: new Date().toISOString(),
      Operation: "REMOVE_TARGETS",
    };

    const processor = new DataProcessor({ format: DataFormat.CSV });
    const output = processor.formatOutput([{ data: result, index: 0 }]);
    this.log(output);
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
