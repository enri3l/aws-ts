/**
 * @module eventbridge/put-targets
 * EventBridge put targets command
 *
 * Adds or updates targets for an EventBridge rule with comprehensive
 * target configuration including input transformation and retry policies.
 *
 */

import type { Target } from "@aws-sdk/client-eventbridge";
import { Args, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { getEventBridgeErrorGuidance } from "../../lib/eventbridge-errors.js";
import type { EventBridgePutTargets } from "../../lib/eventbridge-schemas.js";
import { EventBridgePutTargetsSchema } from "../../lib/eventbridge-schemas.js";
import {
  EventBridgeService,
  type EventBridgeTargetParameters,
} from "../../services/eventbridge-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * Input target configuration for transformation
 *
 * @internal
 */
interface InputTargetConfig {
  /**
   * Target identifier
   */
  readonly id: string;

  /**
   * Target ARN
   */
  readonly arn: string;

  /**
   * IAM role ARN for target execution
   */
  readonly roleArn?: string | undefined;

  /**
   * Static input for the target
   */
  readonly input?: string | undefined;

  /**
   * JSONPath for input transformation
   */
  readonly inputPath?: string | undefined;

  /**
   * Input transformer configuration
   */
  readonly inputTransformer?:
    | {
        /**
         * Input template for transformation
         */
        readonly inputTemplate: string;

        /**
         * Input paths mapping
         */
        readonly inputPathsMap?: Record<string, string> | undefined;
      }
    | undefined;

  /**
   * Retry policy configuration
   */
  readonly retryPolicy?:
    | {
        /**
         * Maximum retry attempts
         */
        readonly maximumRetryAttempts?: number | undefined;

        /**
         * Maximum event age in seconds
         */
        readonly maximumEventAgeInSeconds?: number | undefined;
      }
    | undefined;

  /**
   * Dead letter queue configuration
   */
  readonly deadLetterConfig?:
    | {
        /**
         * Dead letter queue ARN
         */
        readonly arn?: string | undefined;
      }
    | undefined;
}

/**
 * Put targets result from EventBridge service
 *
 * @internal
 */
interface PutTargetsResult {
  /**
   * Indicates if this was an update operation
   */
  readonly isUpdate?: boolean;

  /**
   * Number of targets processed
   */
  readonly targetCount?: number;

  /**
   * Number of successful operations
   */
  readonly successCount?: number;

  /**
   * Number of failed operations
   */
  readonly failureCount?: number;

  /**
   * Array of successfully processed targets
   */
  readonly targets?: Target[];

  /**
   * Array of failed target entries
   */
  failedEntries?: Array<{
    readonly TargetId?: string;
    readonly ErrorCode?: string;
    readonly ErrorMessage?: string;
  }>;

  /**
   * Index signature for data processing compatibility
   */
  [key: string]: unknown;
}

/**
 * EventBridge put targets command for target management
 *
 * Adds or updates targets for an EventBridge rule with support for
 * various AWS services and target configuration options.
 *
 * @public
 */
export default class EventBridgePutTargetsCommand extends BaseCommand {
  static override readonly description = "Add or update targets for an EventBridge rule";

  static override readonly examples = [
    {
      description: "Add Lambda function target",
      command:
        "<%= config.bin %> <%= command.id %> my-rule lambda-target --target-arn arn:aws:lambda:us-east-1:123456789012:function:MyFunction",
    },
    {
      description: "Add SQS queue target with input transformation",
      command: String.raw`<%= config.bin %> <%= command.id %> my-rule sqs-target --target-arn arn:aws:sqs:us-east-1:123456789012:MyQueue --input-transformer '{"inputPathsMap":{"timestamp":"$.time"},"inputTemplate":"{\"timestamp\":\"<timestamp>\"}"}'`,
    },
    {
      description: "Add SNS topic target with static input",
      command:
        '<%= config.bin %> <%= command.id %> my-rule sns-target --target-arn arn:aws:sns:us-east-1:123456789012:MyTopic --input \'{"message":"Alert triggered"}\'',
    },
    {
      description: "Add target with role and retry policy",
      command:
        "<%= config.bin %> <%= command.id %> my-rule kinesis-target --target-arn arn:aws:kinesis:us-east-1:123456789012:stream/MyStream --role-arn arn:aws:iam::123456789012:role/EventBridgeRole --retry-policy max-retry-attempts=3,max-event-age-seconds=3600",
    },
    {
      description: "Add target on custom event bus",
      command:
        "<%= config.bin %> <%= command.id %> my-rule custom-target --target-arn arn:aws:lambda:us-east-1:123456789012:function:Handler --event-bus-name custom-bus",
    },
    {
      description: "Add target with dead letter queue",
      command:
        "<%= config.bin %> <%= command.id %> my-rule dlq-target --target-arn arn:aws:lambda:us-east-1:123456789012:function:Handler --dead-letter-arn arn:aws:sqs:us-east-1:123456789012:DeadLetterQueue",
    },
    {
      description: "Add multiple targets from JSON file",
      command: "<%= config.bin %> <%= command.id %> my-rule --targets-file targets.json",
    },
  ];

  static override readonly args = {
    ruleName: Args.string({
      name: "ruleName",
      description: "Name of the EventBridge rule",
      required: true,
    }),
    targetId: Args.string({
      name: "targetId",
      description: "Unique identifier for the target (required unless using --targets-file)",
      required: false,
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
      description: "Output format for put targets result",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    "event-bus-name": Flags.string({
      description: "Event bus name containing the rule",
      helpValue: "EVENT_BUS_NAME",
      default: "default",
    }),

    "target-arn": Flags.string({
      description: "ARN of the target AWS service",
      helpValue: "TARGET_ARN",
    }),

    "role-arn": Flags.string({
      description: "IAM role ARN for the target",
      helpValue: "ROLE_ARN",
    }),

    input: Flags.string({
      description: "Static input as JSON string",
      helpValue: "JSON_INPUT",
    }),

    "input-path": Flags.string({
      description: "JSONPath expression for input",
      helpValue: "JSON_PATH",
    }),

    "input-transformer": Flags.string({
      description: "Input transformer configuration as JSON",
      helpValue: "JSON_TRANSFORMER",
    }),

    "retry-policy": Flags.string({
      description: "Retry policy (format: max-retry-attempts=N,max-event-age-seconds=N)",
      helpValue: "RETRY_POLICY",
    }),

    "dead-letter-arn": Flags.string({
      description: "Dead letter queue ARN",
      helpValue: "DLQ_ARN",
    }),

    "targets-file": Flags.string({
      description: "JSON file containing multiple targets configuration",
      helpValue: "FILE_PATH",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the EventBridge put targets command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(EventBridgePutTargetsCommand);

    try {
      // Validate that either target configuration or targets file is provided
      if (!flags["targets-file"] && (!args.targetId || !flags["target-arn"])) {
        this.error("Either provide target ID and ARN, or use --targets-file for multiple targets");
      }

      if (flags["targets-file"] && (args.targetId || flags["target-arn"])) {
        this.error("Cannot use both individual target flags and --targets-file");
      }

      // Validate input using Zod schema
      const input: EventBridgePutTargets = EventBridgePutTargetsSchema.parse({
        ruleName: args.ruleName,
        eventBusName: flags["event-bus-name"],
        targetId: args.targetId,
        targetArn: flags["target-arn"],
        roleArn: flags["role-arn"],
        input: flags.input,
        inputPath: flags["input-path"],
        inputTransformer: flags["input-transformer"],
        retryPolicy: flags["retry-policy"],
        deadLetterArn: flags["dead-letter-arn"],
        targetsFile: flags["targets-file"],
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

      // Add targets to the rule
      const putTargetsResponse = await eventBridgeService.putTargets(
        {
          rule: input.rule,
          eventBusName: input.eventBusName,
          targets: input.targets.map((target) => this.transformTargetToAws(target)),
        },
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      // Convert to our custom result format
      const putTargetsResult: PutTargetsResult = {
        isUpdate: false, // This is always a put operation
        targetCount: input.targets.length,
        successCount: input.targets.length - (putTargetsResponse.FailedEntryCount || 0),
        failureCount: putTargetsResponse.FailedEntryCount || 0,
        targets: input.targets.map((target) => this.transformTargetForDisplay(target)),
      };

      // Add failedEntries only if there are actual failures (exactOptionalPropertyTypes compliance)
      if (putTargetsResponse.FailedEntries && putTargetsResponse.FailedEntries.length > 0) {
        putTargetsResult.failedEntries = putTargetsResponse.FailedEntries.map((entry) => {
          const result: {
            readonly TargetId?: string;
            readonly ErrorCode?: string;
            readonly ErrorMessage?: string;
          } = {};
          if (entry.TargetId !== undefined) {
            (result as { TargetId?: string }).TargetId = entry.TargetId;
          }
          if (entry.ErrorCode !== undefined) {
            (result as { ErrorCode?: string }).ErrorCode = entry.ErrorCode;
          }
          if (entry.ErrorMessage !== undefined) {
            (result as { ErrorMessage?: string }).ErrorMessage = entry.ErrorMessage;
          }
          return result;
        });
      }

      // Format output based on requested format
      this.formatAndDisplayOutput(putTargetsResult, input.format, input.rule, input.eventBusName);
    } catch (error) {
      const formattedError = this.formatEventBridgeError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Transform input target to AWS SDK target format
   *
   * @param target - Input target configuration
   * @returns Transformed target for AWS SDK
   * @internal
   */
  private transformTargetToAws(target: InputTargetConfig): EventBridgeTargetParameters {
    const result: EventBridgeTargetParameters = {
      id: target.id,
      arn: target.arn,
    };

    // Add optional properties only if they are defined (exactOptionalPropertyTypes compliance)
    if (target.roleArn !== undefined) {
      result.roleArn = target.roleArn;
    }
    if (target.input !== undefined) {
      result.input = target.input;
    }
    if (target.inputPath !== undefined) {
      result.inputPath = target.inputPath;
    }
    if (target.inputTransformer !== undefined) {
      result.inputTransformer = {
        inputTemplate: target.inputTransformer.inputTemplate,
      };
      if (target.inputTransformer.inputPathsMap !== undefined) {
        result.inputTransformer.inputPathsMap = target.inputTransformer.inputPathsMap;
      }
    }

    return result;
  }

  /**
   * Transform input target config to AWS Target for display
   *
   * @param target - Input target configuration
   * @returns Transformed target for display
   * @internal
   */
  private transformTargetForDisplay(target: InputTargetConfig): Target {
    const result: Target = {
      Id: target.id,
      Arn: target.arn,
    };

    // Add optional properties only if they are defined
    if (target.roleArn !== undefined) {
      result.RoleArn = target.roleArn;
    }
    if (target.input !== undefined) {
      result.Input = target.input;
    }
    if (target.inputPath !== undefined) {
      result.InputPath = target.inputPath;
    }
    if (target.inputTransformer !== undefined) {
      result.InputTransformer = {
        InputTemplate: target.inputTransformer.inputTemplate,
      };
      if (target.inputTransformer.inputPathsMap !== undefined) {
        result.InputTransformer.InputPathsMap = target.inputTransformer.inputPathsMap;
      }
    }

    return result;
  }

  /**
   * Format and display the put targets result
   *
   * @param putTargetsResult - Put targets result to display
   * @param format - Output format to use
   * @param ruleName - Rule name for display
   * @param eventBusName - Event bus name for display
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    putTargetsResult: PutTargetsResult,
    format: string,
    ruleName: string,
    eventBusName: string,
  ): void {
    switch (format) {
      case "table": {
        this.displayTableFormat(putTargetsResult, ruleName, eventBusName);
        break;
      }
      case "json": {
        this.displayJsonFormat(putTargetsResult);
        break;
      }
      case "jsonl": {
        this.displayJsonlFormat(putTargetsResult);
        break;
      }
      case "csv": {
        this.displayCsvFormat(putTargetsResult, ruleName, eventBusName);
        break;
      }
      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }

  /**
   * Display put targets result in table format
   *
   * @param putTargetsResult - Put targets result to display
   * @param ruleName - Rule name for display
   * @param eventBusName - Event bus name for display
   * @internal
   */
  private displayTableFormat(
    putTargetsResult: PutTargetsResult,
    ruleName: string,
    eventBusName: string,
  ): void {
    this.log(`Targets ${putTargetsResult.isUpdate ? "Updated" : "Added"} for rule: ${ruleName}\n`);

    this.displayOperationSummary(putTargetsResult, ruleName, eventBusName);
    this.displayTargetDetails(putTargetsResult);
    this.displayFailureDetails(putTargetsResult);
  }

  /**
   * Display operation summary section
   *
   * @param putTargetsResult - Put targets result to display
   * @param ruleName - Rule name for display
   * @param eventBusName - Event bus name for display
   * @internal
   */
  private displayOperationSummary(
    putTargetsResult: PutTargetsResult,
    ruleName: string,
    eventBusName: string,
  ): void {
    this.log("Operation Summary:");
    const operationInfo = [
      ["Rule Name", ruleName],
      ["Event Bus", eventBusName],
      ["Operation", putTargetsResult.isUpdate ? "UPDATE_TARGETS" : "ADD_TARGETS"],
      ["Targets Processed", putTargetsResult.targetCount ?? 1],
      ["Successful", putTargetsResult.successCount ?? 0],
      ["Failed", putTargetsResult.failureCount ?? 0],
    ];

    for (const [key, value] of operationInfo) {
      this.log(`  ${key}: ${value}`);
    }
  }

  /**
   * Display target details section
   *
   * @param putTargetsResult - Put targets result to display
   * @internal
   */
  private displayTargetDetails(putTargetsResult: PutTargetsResult): void {
    if (putTargetsResult.targets && putTargetsResult.targets.length > 0) {
      this.log("\n Target Details:");
      for (const [index, target] of putTargetsResult.targets.entries()) {
        this.displaySingleTarget(target, index + 1);
      }
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
    this.log(`\n${index}. Target ID: ${target.Id ?? "N/A"}`);
    this.log(`   ARN: ${target.Arn ?? "N/A"}`);

    if (target.RoleArn) {
      this.log(`   Role: ${target.RoleArn}`);
    }

    if (target.Input) {
      this.log(`   Static Input: Configured`);
    }

    if (target.InputPath) {
      this.log(`   Input Path: ${target.InputPath}`);
    }

    if (target.InputTransformer) {
      this.log(`   Input Transformer: Configured`);
    }

    if (target.RetryPolicy) {
      this.log(
        `   Retry Policy: ${target.RetryPolicy.MaximumRetryAttempts ?? 0} attempts, ${target.RetryPolicy.MaximumEventAgeInSeconds ?? 0}s max age`,
      );
    }

    if (target.DeadLetterConfig) {
      this.log(`   Dead Letter Queue: ${target.DeadLetterConfig.Arn ?? "N/A"}`);
    }
  }

  /**
   * Display failure details section
   *
   * @param putTargetsResult - Put targets result to display
   * @internal
   */
  private displayFailureDetails(putTargetsResult: PutTargetsResult): void {
    if (putTargetsResult.failedEntries && putTargetsResult.failedEntries.length > 0) {
      this.log("\nFailed Targets:");
      for (const [index, failure] of putTargetsResult.failedEntries.entries()) {
        this.log(`${index + 1}. Target ID: ${failure.TargetId ?? "N/A"}`);
        this.log(`   Error Code: ${failure.ErrorCode ?? "N/A"}`);
        this.log(`   Error Message: ${failure.ErrorMessage ?? "N/A"}`);
      }
    }
  }

  /**
   * Display put targets result in JSON format
   *
   * @param putTargetsResult - Put targets result to display
   * @internal
   */
  private displayJsonFormat(putTargetsResult: PutTargetsResult): void {
    const processor = new DataProcessor({ format: DataFormat.JSON });
    const output = processor.formatOutput([{ data: putTargetsResult, index: 0 }]);
    this.log(output);
  }

  /**
   * Display put targets result in JSONL format
   *
   * @param putTargetsResult - Put targets result to display
   * @internal
   */
  private displayJsonlFormat(putTargetsResult: PutTargetsResult): void {
    const processor = new DataProcessor({ format: DataFormat.JSONL });
    const output = processor.formatOutput([{ data: putTargetsResult, index: 0 }]);
    this.log(output);
  }

  /**
   * Display put targets result in CSV format
   *
   * @param putTargetsResult - Put targets result to display
   * @param ruleName - Rule name for display
   * @param eventBusName - Event bus name for display
   * @internal
   */
  private displayCsvFormat(
    putTargetsResult: PutTargetsResult,
    ruleName: string,
    eventBusName: string,
  ): void {
    // Flatten put targets result for CSV output
    const flattenedData = {
      RuleName: ruleName,
      EventBusName: eventBusName,
      Operation: putTargetsResult.isUpdate ? "UPDATE_TARGETS" : "ADD_TARGETS",
      TargetsProcessed: putTargetsResult.targetCount ?? 1,
      SuccessCount: putTargetsResult.successCount ?? 0,
      FailureCount: putTargetsResult.failureCount ?? 0,
      HasFailures: (putTargetsResult.failureCount ?? 0) > 0 ? "true" : "false",
      Timestamp: new Date().toISOString(),
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
