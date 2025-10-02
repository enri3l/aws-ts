/**
 * @module eventbridge/list-rules
 * EventBridge list rules command
 *
 * Lists all EventBridge rules in the specified event bus with support for
 * filtering, pagination, and rule information display.
 *
 */

import type { Rule, Target } from "@aws-sdk/client-eventbridge";
import { Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { getEventBridgeErrorGuidance } from "../../lib/eventbridge-errors.js";
import type { EventBridgeListRules } from "../../lib/eventbridge-schemas.js";
import { EventBridgeListRulesSchema } from "../../lib/eventbridge-schemas.js";
import { EventBridgeService } from "../../services/eventbridge-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * Extended rule interface with additional properties for display
 *
 * @internal
 */
interface ExtendedRule extends Rule {
  /**
   * Created by information (may not be available in all AWS regions/accounts)
   */
  readonly CreatedBy?: string;

  /**
   * Rule targets (loaded separately for display)
   */
  readonly Targets?: Target[];

  /**
   * Index signature for data processing compatibility
   */
  [key: string]: unknown;
}

/**
 * EventBridge rules list result from service layer
 *
 * @internal
 */
interface RulesListResult {
  /**
   * Array of EventBridge rules
   */
  readonly rules: ExtendedRule[];

  /**
   * Pagination token for next page of results
   */
  readonly nextToken?: string;

  /**
   * Total count of rules returned
   */
  readonly totalCount?: number;
}

/**
 * EventBridge list rules command for rule discovery
 *
 * Lists all EventBridge rules with filtering and pagination
 * support across default and custom event buses.
 *
 * @public
 */
export default class EventBridgeListRulesCommand extends BaseCommand {
  static override readonly description = "List all EventBridge rules with filtering and pagination";

  static override readonly examples = [
    {
      description: "List all rules on the default event bus",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "List rules with a specific name prefix",
      command: "<%= config.bin %> <%= command.id %> --name-prefix order-processing",
    },
    {
      description: "List rules on a custom event bus",
      command: "<%= config.bin %> <%= command.id %> --event-bus-name custom-bus",
    },
    {
      description: "List rules in a specific region with JSON output",
      command: "<%= config.bin %> <%= command.id %> --region us-west-2 --format json",
    },
    {
      description: "List first 20 rules with pagination",
      command: "<%= config.bin %> <%= command.id %> --limit 20",
    },
    {
      description: "List rules using specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> --profile production",
    },
    {
      description: "Continue from previous page using next token",
      command: "<%= config.bin %> <%= command.id %> --next-token token123",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "event-bus-name": Flags.string({
      description: "Event bus name to list rules from",
      helpValue: "EVENT_BUS_NAME",
      default: "default",
    }),

    "name-prefix": Flags.string({
      description: "Filter rules by name prefix",
      helpValue: "PREFIX",
    }),

    limit: Flags.integer({
      description: "Maximum number of rules to return",
      min: 1,
      max: 100,
      helpValue: "NUMBER",
    }),

    "next-token": Flags.string({
      description: "Pagination token for next page of results",
      helpValue: "TOKEN",
    }),
  };

  /**
   * Execute the EventBridge list rules command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(EventBridgeListRulesCommand);

    try {
      // Validate input using Zod schema
      const input: EventBridgeListRules = EventBridgeListRulesSchema.parse({
        eventBusName: flags["event-bus-name"],
        namePrefix: flags["name-prefix"],
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

      // List rules from EventBridge
      const paginatedResult = await eventBridgeService.listRules(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          EventBusName: input.eventBusName,
          NamePrefix: input.namePrefix,
          Limit: input.limit,
          NextToken: input.nextToken,
        },
      );

      // Convert to expected result format
      const rulesResult: RulesListResult = {
        rules: paginatedResult.items as ExtendedRule[],
        ...(paginatedResult.nextToken !== undefined && { nextToken: paginatedResult.nextToken }),
        totalCount: paginatedResult.items.length,
      };

      // Format output based on requested format
      this.formatAndDisplayOutput(rulesResult, input.format, input.eventBusName);
    } catch (error) {
      const formattedError = this.formatEventBridgeError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the rules list output
   *
   * @param rulesResult - Rules result to display
   * @param format - Output format to use
   * @param eventBusName - Event bus name for display
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    rulesResult: RulesListResult,
    format: string,
    eventBusName: string,
  ): void {
    const rules = rulesResult.rules ?? [];
    const nextToken = rulesResult.nextToken;

    if (rules.length === 0) {
      this.log(`No EventBridge rules found on event bus '${eventBusName}'.`);
      return;
    }

    switch (format) {
      case "table": {
        this.displayTableFormat(rules, eventBusName, nextToken);
        break;
      }
      case "json": {
        this.displayJsonFormat(rules, eventBusName, nextToken);
        break;
      }
      case "jsonl": {
        this.displayJsonlFormat(rules);
        break;
      }
      case "csv": {
        this.displayCsvFormat(rules);
        break;
      }
      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }

  /**
   * Display rules in table format
   *
   * @param rules - Rules to display
   * @param eventBusName - Event bus name for display
   * @param nextToken - Pagination token if available
   * @internal
   */
  private displayTableFormat(
    rules: ExtendedRule[],
    eventBusName: string,
    nextToken?: string,
  ): void {
    this.log(`Found ${rules.length} EventBridge rules on event bus: ${eventBusName}\n`);

    // Summary table
    const tableData = rules.map((rule, index) => ({
      "#": index + 1,
      "Rule Name": rule.Name ?? "N/A",
      State: rule.State ?? "N/A",
      Schedule: rule.ScheduleExpression ?? "Event-driven",
      Description: rule.Description ?? "No description",
      Targets: this.getTargetCount(rule.Targets),
      "Event Bus": rule.EventBusName ?? "default",
    }));

    // Use DataProcessor for consistent table formatting
    const processor = new DataProcessor({ format: DataFormat.CSV });
    const output = processor.formatOutput(tableData.map((item, index) => ({ data: item, index })));
    this.log(output);

    // Pagination info
    if (nextToken) {
      this.log(`\n📄 More rules available. Use --next-token ${nextToken} to continue.`);
    }
  }

  /**
   * Display rules in JSON format
   *
   * @param rules - Rules to display
   * @param eventBusName - Event bus name for display
   * @param nextToken - Pagination token if available
   * @internal
   */
  private displayJsonFormat(rules: ExtendedRule[], eventBusName: string, nextToken?: string): void {
    const result = {
      rules,
      nextToken,
      totalCount: rules.length,
      eventBusName,
    };

    const processor = new DataProcessor({ format: DataFormat.JSON });
    const output = processor.formatOutput([{ data: result, index: 0 }]);
    this.log(output);
  }

  /**
   * Display rules in JSONL format
   *
   * @param rules - Rules to display
   * @internal
   */
  private displayJsonlFormat(rules: ExtendedRule[]): void {
    const processor = new DataProcessor({ format: DataFormat.JSONL });
    const output = processor.formatOutput(rules.map((rule, index) => ({ data: rule, index })));
    this.log(output);
  }

  /**
   * Display rules in CSV format
   *
   * @param rules - Rules to display
   * @internal
   */
  private displayCsvFormat(rules: ExtendedRule[]): void {
    // Flatten rules for CSV output
    const flattenedData = rules.map((rule) => ({
      Name: rule.Name ?? "",
      Arn: rule.Arn ?? "",
      EventPattern: rule.EventPattern ?? "",
      ScheduleExpression: rule.ScheduleExpression ?? "",
      State: rule.State ?? "",
      Description: rule.Description ?? "",
      EventBusName: rule.EventBusName ?? "",
      ManagedBy: rule.ManagedBy ?? "",
      RoleArn: rule.RoleArn ?? "",
      CreatedBy: this.getCreatedByValue(rule.CreatedBy),
      TargetCount: this.getTargetCount(rule.Targets),
    }));

    const processor = new DataProcessor({ format: DataFormat.CSV });
    const output = processor.formatOutput(
      flattenedData.map((item, index) => ({
        data: item,
        index,
      })),
    );
    this.log(output);
  }

  /**
   * Get target count safely handling Error objects
   *
   * @param targets - Targets array or Error object
   * @returns Target count or 0 if not available
   * @internal
   */
  private getTargetCount(targets: unknown): number {
    if (Array.isArray(targets)) {
      return targets.length;
    }
    return 0;
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
