/**
 * EventBridge put rule command
 *
 * Creates or updates an EventBridge rule with event patterns, schedule expressions,
 * and configuration options for event routing and processing.
 *
 */

import { Args, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { getEventBridgeErrorGuidance } from "../../lib/eventbridge-errors.js";
import type { EventBridgePutRule } from "../../lib/eventbridge-schemas.js";
import { EventBridgePutRuleSchema } from "../../lib/eventbridge-schemas.js";
import { EventBridgeService } from "../../services/eventbridge-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * Rule creation result from EventBridge service
 *
 * @internal
 */
interface RuleCreationResult {
  /**
   * Indicates if this was an update operation
   */
  readonly isUpdate?: boolean;

  /**
   * Name of the rule
   */
  readonly ruleName?: string;

  /**
   * ARN of the rule
   */
  readonly ruleArn?: string;

  /**
   * Current state of the rule
   */
  readonly state?: string;

  /**
   * Event bus name containing the rule
   */
  readonly eventBusName?: string;

  /**
   * Event pattern as JSON string
   */
  readonly eventPattern?: string;

  /**
   * Schedule expression if rule is time-based
   */
  readonly scheduleExpression?: string;

  /**
   * Rule description
   */
  readonly description?: string;

  /**
   * IAM role ARN for the rule
   */
  readonly roleArn?: string;

  /**
   * Tags associated with the rule
   */
  readonly tags?: Record<string, string>;

  /**
   * Index signature for data processing compatibility
   */
  [key: string]: unknown;
}

/**
 * EventBridge put rule command for rule creation and updates
 *
 * Creates or updates EventBridge rules with support for event patterns,
 * schedule expressions, and configuration options.
 *
 * @public
 */
export default class EventBridgePutRuleCommand extends BaseCommand {
  static override readonly description = "Create or update an EventBridge rule";

  static override readonly examples = [
    {
      description: "Create rule with event pattern",
      command:
        '<%= config.bin %> <%= command.id %> my-rule --event-pattern \'{"source":["aws.ec2"],"detail-type":["EC2 Instance State-change Notification"]}\'',
    },
    {
      description: "Create scheduled rule that runs every 5 minutes",
      command:
        "<%= config.bin %> <%= command.id %> my-scheduled-rule --schedule-expression 'rate(5 minutes)'",
    },
    {
      description: "Create cron-based rule for weekdays at 9 AM",
      command:
        "<%= config.bin %> <%= command.id %> weekday-rule --schedule-expression 'cron(0 9 ? * MON-FRI *)'",
    },
    {
      description: "Create rule on custom event bus",
      command:
        '<%= config.bin %> <%= command.id %> custom-rule --event-pattern \'{"source":["myapp"]}\' --event-bus-name custom-bus',
    },
    {
      description: "Create rule with description and specific state",
      command:
        '<%= config.bin %> <%= command.id %> my-rule --event-pattern \'{"source":["aws.s3"]}\' --description "S3 bucket events" --state DISABLED',
    },
    {
      description: "Create rule with IAM role for cross-account access",
      command:
        '<%= config.bin %> <%= command.id %> cross-account-rule --event-pattern \'{"account":["123456789012"]}\' --role-arn arn:aws:iam::123456789012:role/EventBridgeRole',
    },
    {
      description: "Update existing rule with new pattern",
      command:
        '<%= config.bin %> <%= command.id %> existing-rule --event-pattern \'{"source":["aws.ec2","aws.s3"]}\' --description "Updated rule"',
    },
  ];

  static override readonly args = {
    ruleName: Args.string({
      name: "ruleName",
      description: "Name of the EventBridge rule to create or update",
      required: true,
    }),
  };

  static override readonly flags = {
    region: Flags.string({
      char: "r",
      description: "AWS region to create the rule in",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for rule creation result",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    "event-pattern": Flags.string({
      description: "Event pattern as JSON string",
      helpValue: "JSON_PATTERN",
    }),

    "schedule-expression": Flags.string({
      description: "Schedule expression (rate or cron)",
      helpValue: "EXPRESSION",
    }),

    description: Flags.string({
      char: "d",
      description: "Description for the rule",
      helpValue: "DESCRIPTION",
    }),

    state: Flags.string({
      description: "Initial state of the rule",
      options: ["ENABLED", "DISABLED"],
      default: "ENABLED",
    }),

    "event-bus-name": Flags.string({
      description: "Event bus name for the rule",
      helpValue: "EVENT_BUS_NAME",
      default: "default",
    }),

    "role-arn": Flags.string({
      description: "IAM role ARN for the rule",
      helpValue: "ROLE_ARN",
    }),

    tags: Flags.string({
      description: "Tags as JSON key-value pairs",
      helpValue: "JSON_TAGS",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the EventBridge put rule command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(EventBridgePutRuleCommand);

    try {
      // Validate that either event pattern or schedule expression is provided
      if (!flags["event-pattern"] && !flags["schedule-expression"]) {
        this.error("Either --event-pattern or --schedule-expression must be provided");
      }

      if (flags["event-pattern"] && flags["schedule-expression"]) {
        this.error("Cannot specify both --event-pattern and --schedule-expression");
      }

      // Validate input using Zod schema
      const input: EventBridgePutRule = EventBridgePutRuleSchema.parse({
        ruleName: args.ruleName,
        eventPattern: flags["event-pattern"],
        scheduleExpression: flags["schedule-expression"],
        description: flags.description,
        state: flags.state,
        eventBusName: flags["event-bus-name"],
        roleArn: flags["role-arn"],
        tags: flags.tags,
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

      // Create or update the rule
      const ruleResult = await eventBridgeService.putRule(
        {
          name: input.name,
          ...(input.eventPattern && { eventPattern: input.eventPattern }),
          ...(input.scheduleExpression && { scheduleExpression: input.scheduleExpression }),
          ...(input.description && { description: input.description }),
          state: input.state,
          eventBusName: input.eventBusName,
          ...(input.roleArn && { roleArn: input.roleArn }),
          ...(input.tags && { tags: input.tags }),
        },
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      // Format output based on requested format
      this.formatAndDisplayOutput(ruleResult, input.format, input.name);
    } catch (error) {
      const formattedError = this.formatEventBridgeError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the rule creation result
   *
   * @param ruleResult - Rule creation result to display
   * @param format - Output format to use
   * @param ruleName - Rule name for display
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    ruleResult: RuleCreationResult,
    format: string,
    ruleName: string,
  ): void {
    switch (format) {
      case "table": {
        this.displayTableFormat(ruleResult, ruleName);
        break;
      }
      case "json": {
        this.displayJsonFormat(ruleResult);
        break;
      }
      case "jsonl": {
        this.displayJsonlFormat(ruleResult);
        break;
      }
      case "csv": {
        this.displayCsvFormat(ruleResult, ruleName);
        break;
      }
      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }

  /**
   * Display rule result in table format
   *
   * @param ruleResult - Rule creation result to display
   * @param ruleName - Rule name for display
   * @internal
   */
  private displayTableFormat(ruleResult: RuleCreationResult, ruleName: string): void {
    this.log(`Rule ${ruleResult.isUpdate ? "Updated" : "Created"}: ${ruleName}\n`);

    this.displayRuleBasicInfo(ruleResult, ruleName);
    this.displayEventPattern(ruleResult);
    this.displayScheduleExpression(ruleResult);
    this.displayRuleDescription(ruleResult);
    this.displayRoleInformation(ruleResult);
    this.displayTagsInformation(ruleResult);

    this.log("\nNext steps: Add targets to this rule using 'eventbridge:put-targets' command.");
  }

  /**
   * Display basic rule information
   *
   * @param ruleResult - Rule creation result to display
   * @param ruleName - Rule name for display
   * @internal
   */
  private displayRuleBasicInfo(ruleResult: RuleCreationResult, ruleName: string): void {
    this.log("Rule Details:");
    const ruleInfo = [
      ["Rule Name", ruleResult?.ruleName || ruleName],
      ["Rule ARN", ruleResult?.ruleArn || "N/A"],
      ["State", ruleResult?.state || "ENABLED"],
      ["Event Bus", ruleResult?.eventBusName || "default"],
      ["Operation", ruleResult.isUpdate ? "UPDATE" : "CREATE"],
    ];

    for (const [key, value] of ruleInfo) {
      this.log(`  ${key}: ${value}`);
    }
  }

  /**
   * Display event pattern information
   *
   * @param ruleResult - Rule creation result to display
   * @internal
   */
  private displayEventPattern(ruleResult: RuleCreationResult): void {
    if (ruleResult?.eventPattern) {
      this.log("\n Event Pattern:");
      try {
        const pattern: unknown = JSON.parse(ruleResult.eventPattern);
        this.log(`  ${JSON.stringify(pattern, undefined, 2)}`);
      } catch {
        this.log(`  ${ruleResult.eventPattern}`);
      }
    }
  }

  /**
   * Display schedule expression information
   *
   * @param ruleResult - Rule creation result to display
   * @internal
   */
  private displayScheduleExpression(ruleResult: RuleCreationResult): void {
    if (ruleResult?.scheduleExpression) {
      this.log("\n Schedule Expression:");
      this.log(`  ${ruleResult.scheduleExpression}`);

      // Explain schedule type
      const schedule = ruleResult.scheduleExpression;
      if (schedule.startsWith("rate(")) {
        this.log("  Type: Rate expression (fixed interval)");
      } else if (schedule.startsWith("cron(")) {
        this.log("  Type: Cron expression (specific times)");
      }
    }
  }

  /**
   * Display rule description
   *
   * @param ruleResult - Rule creation result to display
   * @internal
   */
  private displayRuleDescription(ruleResult: RuleCreationResult): void {
    if (ruleResult?.description) {
      this.log("\nDescription:");
      this.log(`  ${ruleResult.description}`);
    }
  }

  /**
   * Display IAM role information
   *
   * @param ruleResult - Rule creation result to display
   * @internal
   */
  private displayRoleInformation(ruleResult: RuleCreationResult): void {
    if (ruleResult?.roleArn) {
      this.log("\n IAM Role:");
      this.log(`  ${ruleResult.roleArn}`);
    }
  }

  /**
   * Display tags information
   *
   * @param ruleResult - Rule creation result to display
   * @internal
   */
  private displayTagsInformation(ruleResult: RuleCreationResult): void {
    if (ruleResult?.tags && Object.keys(ruleResult.tags).length > 0) {
      this.log("\nTags:");
      for (const [key, value] of Object.entries(ruleResult.tags)) {
        this.log(`  ${key}: ${value}`);
      }
    }
  }

  /**
   * Display rule result in JSON format
   *
   * @param ruleResult - Rule creation result to display
   * @internal
   */
  private displayJsonFormat(ruleResult: RuleCreationResult): void {
    const processor = new DataProcessor({ format: DataFormat.JSON });
    const output = processor.formatOutput([{ data: ruleResult, index: 0 }]);
    this.log(output);
  }

  /**
   * Display rule result in JSONL format
   *
   * @param ruleResult - Rule creation result to display
   * @internal
   */
  private displayJsonlFormat(ruleResult: RuleCreationResult): void {
    const processor = new DataProcessor({ format: DataFormat.JSONL });
    const output = processor.formatOutput([{ data: ruleResult, index: 0 }]);
    this.log(output);
  }

  /**
   * Display rule result in CSV format
   *
   * @param ruleResult - Rule creation result to display
   * @param ruleName - Rule name for display
   * @internal
   */
  private displayCsvFormat(ruleResult: RuleCreationResult, ruleName: string): void {
    // Flatten rule result for CSV output
    const flattenedData = {
      RuleName: ruleResult?.ruleName || ruleName,
      RuleArn: ruleResult?.ruleArn || "",
      State: ruleResult?.state || "ENABLED",
      EventBusName: ruleResult?.eventBusName || "default",
      Operation: ruleResult.isUpdate ? "UPDATE" : "CREATE",
      HasEventPattern: ruleResult?.eventPattern ? "true" : "false",
      HasScheduleExpression: ruleResult?.scheduleExpression ? "true" : "false",
      Description: ruleResult?.description || "",
      RoleArn: ruleResult?.roleArn || "",
      TagCount: ruleResult?.tags ? Object.keys(ruleResult.tags).length : 0,
      CreatedTimestamp: new Date().toISOString(),
    };

    const processor = new DataProcessor({ format: DataFormat.CSV });
    const output = processor.formatOutput([{ data: flattenedData, index: 0 }]);
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
