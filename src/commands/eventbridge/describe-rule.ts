/**
 * EventBridge describe rule command
 *
 * Shows detailed information about a specific EventBridge rule including
 * event patterns, schedule expressions, targets, and configuration details.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { getEventBridgeErrorGuidance } from "../../lib/eventbridge-errors.js";
import type { EventBridgeDescribeRule } from "../../lib/eventbridge-schemas.js";
import { EventBridgeDescribeRuleSchema } from "../../lib/eventbridge-schemas.js";
import { EventBridgeService } from "../../services/eventbridge-service.js";

/**
 * EventBridge describe rule command for detailed rule inspection
 *
 * Provides comprehensive information about an EventBridge rule including
 * event patterns, schedule expressions, targets, and configuration details.
 *
 * @public
 */
export default class EventBridgeDescribeRuleCommand extends Command {
  static override readonly description = "Show detailed information about an EventBridge rule";

  static override readonly examples = [
    {
      description: "Describe a rule on the default event bus",
      command: "<%= config.bin %> <%= command.id %> my-rule",
    },
    {
      description: "Describe a rule on a custom event bus",
      command: "<%= config.bin %> <%= command.id %> my-rule --event-bus-name custom-bus",
    },
    {
      description: "Describe rule with JSON output",
      command: "<%= config.bin %> <%= command.id %> my-rule --format json",
    },
    {
      description: "Describe rule in specific region",
      command: "<%= config.bin %> <%= command.id %> my-rule --region us-west-2",
    },
    {
      description: "Describe rule using specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> my-rule --profile production",
    },
    {
      description: "Verbose rule description with debug information",
      command: "<%= config.bin %> <%= command.id %> my-rule --verbose",
    },
  ];

  static override readonly args = {
    ruleName: Args.string({
      name: "ruleName",
      description: "Name of the EventBridge rule to describe",
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
      description: "Output format for rule details",
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
   * Execute the EventBridge describe rule command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(EventBridgeDescribeRuleCommand);

    try {
      // Validate input using Zod schema
      const input: EventBridgeDescribeRule = EventBridgeDescribeRuleSchema.parse({
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

      // Describe the rule
      const ruleDetails = await eventBridgeService.describeRule(
        input.ruleName,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.eventBusName,
      );

      // Format output based on requested format
      this.formatAndDisplayOutput(ruleDetails, input.format, input.ruleName);
    } catch (error) {
      const formattedError = this.formatEventBridgeError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the rule details output
   *
   * @param ruleDetails - Rule details to display
   * @param format - Output format to use
   * @param ruleName - Rule name for display
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    ruleDetails: any,
    format: string,
    ruleName: string,
  ): void {
    switch (format) {
      case "table": {
        this.log(`Rule Details: ${ruleName}\n`);

        // Basic Information
        this.log("📋 Basic Information:");
        const basicInfo = [
          ["Rule Name", ruleDetails?.Name || "N/A"],
          ["Rule ARN", ruleDetails?.Arn || "N/A"],
          ["State", ruleDetails?.State || "N/A"],
          ["Description", ruleDetails?.Description || "No description"],
          ["Event Bus", ruleDetails?.EventBusName || "default"],
          ["Managed By", ruleDetails?.ManagedBy || "User"],
          ["Created By", ruleDetails?.CreatedBy || "N/A"],
        ];

        basicInfo.forEach(([key, value]) => {
          this.log(`  ${key}: ${value}`);
        });

        // Event Pattern
        if (ruleDetails?.EventPattern) {
          this.log("\n🎯 Event Pattern:");
          try {
            const eventPattern = JSON.parse(ruleDetails.EventPattern);
            this.log(`  ${JSON.stringify(eventPattern, null, 2)}`);
          } catch (error) {
            this.log(`  ${ruleDetails.EventPattern}`);
          }
        }

        // Schedule Expression
        if (ruleDetails?.ScheduleExpression) {
          this.log("\n⏰ Schedule Expression:");
          this.log(`  ${ruleDetails.ScheduleExpression}`);

          // Parse and explain common schedule expressions
          const schedule = ruleDetails.ScheduleExpression;
          if (schedule.startsWith("rate(")) {
            this.log("  Type: Rate expression (fixed interval)");
          } else if (schedule.startsWith("cron(")) {
            this.log("  Type: Cron expression (specific times)");
          }
        }

        // Role Configuration
        if (ruleDetails?.RoleArn) {
          this.log("\n🔐 IAM Configuration:");
          this.log(`  Role ARN: ${ruleDetails.RoleArn}`);
        }

        // Targets Information
        if (ruleDetails?.targets && ruleDetails.targets.length > 0) {
          this.log("\n🎯 Targets:");
          ruleDetails.targets.forEach((target: any, index: number) => {
            this.log(`  ${index + 1}. ${target.Arn || "N/A"}`);
            if (target.Id) {
              this.log(`     ID: ${target.Id}`);
            }
            if (target.RoleArn) {
              this.log(`     Role: ${target.RoleArn}`);
            }
            if (target.Input) {
              this.log(`     Static Input: Yes`);
            }
            if (target.InputPath) {
              this.log(`     Input Path: ${target.InputPath}`);
            }
          });
        } else {
          this.log("\n🎯 Targets: No targets configured");
        }

        break;
      }
      case "json": {
        const processor = new DataProcessor({ format: DataFormat.JSON });
        const output = processor.formatOutput([{ data: ruleDetails, index: 0 }]);
        this.log(output);
        break;
      }
      case "jsonl": {
        const processor = new DataProcessor({ format: DataFormat.JSONL });
        const output = processor.formatOutput([{ data: ruleDetails, index: 0 }]);
        this.log(output);
        break;
      }
      case "csv": {
        // Flatten rule details for CSV output
        const flattenedData = {
          Name: ruleDetails?.Name || "",
          Arn: ruleDetails?.Arn || "",
          State: ruleDetails?.State || "",
          Description: ruleDetails?.Description || "",
          EventBusName: ruleDetails?.EventBusName || "",
          EventPattern: ruleDetails?.EventPattern || "",
          ScheduleExpression: ruleDetails?.ScheduleExpression || "",
          RoleArn: ruleDetails?.RoleArn || "",
          ManagedBy: ruleDetails?.ManagedBy || "",
          CreatedBy: ruleDetails?.CreatedBy || "",
          TargetCount: ruleDetails?.targets ? ruleDetails.targets.length : 0,
          HasEventPattern: ruleDetails?.EventPattern ? "true" : "false",
          HasScheduleExpression: ruleDetails?.ScheduleExpression ? "true" : "false",
          IsEnabled: ruleDetails?.State === "ENABLED" ? "true" : "false",
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