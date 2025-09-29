/**
 * EventBridge describe rule command
 *
 * Shows detailed information about a specific EventBridge rule including
 * event patterns, schedule expressions, targets, and configuration details.
 *
 */

import type { Rule, Target } from "@aws-sdk/client-eventbridge";
import { Args, Command, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { getEventBridgeErrorGuidance } from "../../lib/eventbridge-errors.js";
import type { EventBridgeDescribeRule } from "../../lib/eventbridge-schemas.js";
import { EventBridgeDescribeRuleSchema } from "../../lib/eventbridge-schemas.js";
import { EventBridgeService } from "../../services/eventbridge-service.js";

/**
 * Extended rule details including targets for display
 *
 * @internal
 */
interface RuleDetailsWithTargets extends Rule {
  /**
   * Rule targets for comprehensive display
   */
  readonly targets?: Target[];

  /**
   * Created by information (may not be available in all AWS regions/accounts)
   */
  readonly CreatedBy?: string;

  /**
   * Index signature for data processing compatibility
   */
  [key: string]: unknown;
}

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
      const ruleResponse = await eventBridgeService.describeRule(
        input.name,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.eventBusName,
      );

      // Convert to extended interface with index signature
      const ruleDetails: RuleDetailsWithTargets = {
        ...ruleResponse,
      };

      // Format output based on requested format
      this.formatAndDisplayOutput(ruleDetails, input.format, input.name);
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
    ruleDetails: RuleDetailsWithTargets,
    format: string,
    ruleName: string,
  ): void {
    switch (format) {
      case "table": {
        this.displayTableFormat(ruleDetails, ruleName);
        break;
      }
      case "json": {
        this.displayJsonFormat(ruleDetails);
        break;
      }
      case "jsonl": {
        this.displayJsonlFormat(ruleDetails);
        break;
      }
      case "csv": {
        this.displayCsvFormat(ruleDetails);
        break;
      }
      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }

  /**
   * Display rule details in table format
   *
   * @param ruleDetails - Rule details to display
   * @param ruleName - Rule name for display
   * @internal
   */
  private displayTableFormat(ruleDetails: RuleDetailsWithTargets, ruleName: string): void {
    this.log(`Rule Details: ${ruleName}\n`);

    this.displayBasicInformation(ruleDetails);
    this.displayEventPattern(ruleDetails);
    this.displayScheduleExpression(ruleDetails);
    this.displayRoleConfiguration(ruleDetails);
    this.displayTargetsInformation(ruleDetails);
  }

  /**
   * Display basic rule information
   *
   * @param ruleDetails - Rule details to display
   * @internal
   */
  private displayBasicInformation(ruleDetails: RuleDetailsWithTargets): void {
    this.log("Basic Information:");
    const basicInfo = [
      ["Rule Name", ruleDetails.Name ?? "N/A"],
      ["Rule ARN", ruleDetails.Arn ?? "N/A"],
      ["State", ruleDetails.State ?? "N/A"],
      ["Description", ruleDetails.Description ?? "No description"],
      ["Event Bus", ruleDetails.EventBusName ?? "default"],
      ["Managed By", ruleDetails.ManagedBy ?? "User"],
      ["Created By", ruleDetails.CreatedBy ?? "N/A"],
    ];

    for (const [key, value] of basicInfo) {
      this.log(`  ${key}: ${value}`);
    }
  }

  /**
   * Display event pattern information
   *
   * @param ruleDetails - Rule details to display
   * @internal
   */
  private displayEventPattern(ruleDetails: RuleDetailsWithTargets): void {
    if (ruleDetails.EventPattern) {
      this.log("\n Event Pattern:");
      try {
        const eventPattern: unknown = JSON.parse(ruleDetails.EventPattern);
        this.log(`  ${JSON.stringify(eventPattern, undefined, 2)}`);
      } catch {
        this.log(`  ${ruleDetails.EventPattern}`);
      }
    }
  }

  /**
   * Display schedule expression information
   *
   * @param ruleDetails - Rule details to display
   * @internal
   */
  private displayScheduleExpression(ruleDetails: RuleDetailsWithTargets): void {
    if (ruleDetails.ScheduleExpression) {
      this.log("\n Schedule Expression:");
      this.log(`  ${ruleDetails.ScheduleExpression}`);

      // Parse and explain common schedule expressions
      const schedule = ruleDetails.ScheduleExpression;
      if (schedule.startsWith("rate(")) {
        this.log("  Type: Rate expression (fixed interval)");
      } else if (schedule.startsWith("cron(")) {
        this.log("  Type: Cron expression (specific times)");
      }
    }
  }

  /**
   * Display role configuration information
   *
   * @param ruleDetails - Rule details to display
   * @internal
   */
  private displayRoleConfiguration(ruleDetails: RuleDetailsWithTargets): void {
    if (ruleDetails.RoleArn) {
      this.log("\n IAM Configuration:");
      this.log(`  Role ARN: ${ruleDetails.RoleArn}`);
    }
  }

  /**
   * Display targets information
   *
   * @param ruleDetails - Rule details to display
   * @internal
   */
  private displayTargetsInformation(ruleDetails: RuleDetailsWithTargets): void {
    if (ruleDetails.targets && ruleDetails.targets.length > 0) {
      this.log("\n Targets:");
      for (const [index, target] of ruleDetails.targets.entries()) {
        this.displaySingleTarget(target, index + 1);
      }
    } else {
      this.log("\n Targets: No targets configured");
    }
  }

  /**
   * Display details for a single target
   *
   * @param target - Target to display
   * @param index - Target index for display
   * @internal
   */
  private displaySingleTarget(target: Target, index: number): void {
    this.log(`  ${index}. ${target.Arn ?? "N/A"}`);
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
  }

  /**
   * Display rule details in JSON format
   *
   * @param ruleDetails - Rule details to display
   * @internal
   */
  private displayJsonFormat(ruleDetails: RuleDetailsWithTargets): void {
    const processor = new DataProcessor({ format: DataFormat.JSON });
    const output = processor.formatOutput([{ data: ruleDetails, index: 0 }]);
    this.log(output);
  }

  /**
   * Display rule details in JSONL format
   *
   * @param ruleDetails - Rule details to display
   * @internal
   */
  private displayJsonlFormat(ruleDetails: RuleDetailsWithTargets): void {
    const processor = new DataProcessor({ format: DataFormat.JSONL });
    const output = processor.formatOutput([{ data: ruleDetails, index: 0 }]);
    this.log(output);
  }

  /**
   * Display rule details in CSV format
   *
   * @param ruleDetails - Rule details to display
   * @internal
   */
  private displayCsvFormat(ruleDetails: RuleDetailsWithTargets): void {
    // Flatten rule details for CSV output
    const flattenedData = {
      Name: ruleDetails.Name ?? "",
      Arn: ruleDetails.Arn ?? "",
      State: ruleDetails.State ?? "",
      Description: ruleDetails.Description ?? "",
      EventBusName: ruleDetails.EventBusName ?? "",
      EventPattern: ruleDetails.EventPattern ?? "",
      ScheduleExpression: ruleDetails.ScheduleExpression ?? "",
      RoleArn: ruleDetails.RoleArn ?? "",
      ManagedBy: ruleDetails.ManagedBy ?? "",
      CreatedBy: this.getCreatedByValue(ruleDetails.CreatedBy),
      TargetCount: ruleDetails.targets ? ruleDetails.targets.length : 0,
      HasEventPattern: ruleDetails.EventPattern ? "true" : "false",
      HasScheduleExpression: ruleDetails.ScheduleExpression ? "true" : "false",
      IsEnabled: ruleDetails.State === "ENABLED" ? "true" : "false",
    };

    const processor = new DataProcessor({ format: DataFormat.CSV });
    const output = processor.formatOutput([{ data: flattenedData, index: 0 }]);
    this.log(output);
  }

  /**
   * Get CreatedBy value safely handling Error objects
   *
   * @param createdBy - CreatedBy value or Error object
   * @returns Safe string representation
   * @internal
   */
  private getCreatedByValue(createdBy: unknown): string {
    if (createdBy instanceof Error) {
      return "Error";
    }
    return (createdBy as string) ?? "";
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
