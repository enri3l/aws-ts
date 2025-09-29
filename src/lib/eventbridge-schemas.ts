/**
 * EventBridge-specific Zod schemas for input validation
 *
 * Provides validation schemas for EventBridge commands
 * and operations with automatic TypeScript type generation.
 *
 */

import { z } from "zod";
import { AwsProfileSchema, AwsRegionSchema } from "./schemas.js";

/**
 * EventBridge rule name validation with AWS constraints
 *
 * @public
 */
export const EventBridgeRuleNameSchema = z
  .string()
  .min(1, "Rule name is required")
  .max(64, "Rule name must be 64 characters or less")
  .regex(
    /^[.\-_A-Za-z0-9]+$/,
    "Rule name can only contain letters, numbers, dots, hyphens, and underscores",
  );

/**
 * Event bus name validation
 *
 * @public
 */
export const EventBusNameSchema = z
  .string()
  .min(1, "Event bus name is required")
  .max(256, "Event bus name must be 256 characters or less")
  .regex(/^[.\-_/A-Za-z0-9]+$/, "Event bus name contains invalid characters")
  .default("default");

/**
 * Schedule expression validation for EventBridge rules
 *
 * @public
 */
export const ScheduleExpressionSchema = z
  .string()
  .regex(
    /^(rate\(\d+\s+(minute|minutes|hour|hours|day|days)\)|cron\(.+\))$/,
    "Schedule expression must be a valid rate or cron expression",
  );

/**
 * Event pattern validation (must be valid JSON)
 *
 * @public
 */
export const EventPatternSchema = z
  .string()
  .min(1, "Event pattern cannot be empty")
  .refine((pattern) => {
    try {
      const parsed: unknown = JSON.parse(pattern);
      return typeof parsed === "object" && parsed !== null;
    } catch {
      return false;
    }
  }, "Event pattern must be valid JSON object");

/**
 * Rule state validation
 *
 * @public
 */
export const EventBridgeRuleStateSchema = z.enum(["ENABLED", "DISABLED"]);

/**
 * Target ID validation
 *
 * @public
 */
export const EventBridgeTargetIdSchema = z
  .string()
  .min(1, "Target ID is required")
  .max(64, "Target ID must be 64 characters or less")
  .regex(
    /^[.\-_A-Za-z0-9]+$/,
    "Target ID can only contain letters, numbers, dots, hyphens, and underscores",
  );

/**
 * AWS resource ARN validation
 *
 * @public
 */
export const AwsResourceArnSchema = z
  .string()
  .min(1, "Target ARN is required")
  .regex(
    /^arn:aws:[a-zA-Z0-9-]+:[a-z0-9-]*:\d{12}:.+$/,
    "Target ARN must be a valid AWS resource ARN",
  );

/**
 * IAM role ARN validation for EventBridge
 *
 * @public
 */
export const EventBridgeRoleArnSchema = z
  .string()
  .regex(
    /^arn:aws:iam::\d{12}:role\/.+$/,
    "Role ARN must be in the format arn:aws:iam::account-id:role/role-name",
  )
  .optional();

/**
 * Input transformer configuration schema
 *
 * @public
 */
export const InputTransformerSchema = z
  .object({
    inputPathsMap: z.record(z.string(), z.string()).optional(),
    inputTemplate: z.string().min(1, "Input template is required"),
  })
  .optional();

/**
 * Kinesis parameters schema
 *
 * @public
 */
export const KinesisParametersSchema = z
  .object({
    partitionKeyPath: z.string().min(1, "Partition key path is required"),
  })
  .optional();

/**
 * Run command parameters schema
 *
 * @public
 */
export const RunCommandParametersSchema = z
  .object({
    runCommandTargets: z
      .array(
        z.object({
          key: z.string().min(1, "Target key is required"),
          values: z.array(z.string()).min(1, "At least one target value is required"),
        }),
      )
      .min(1, "At least one run command target is required"),
  })
  .optional();

/**
 * ECS parameters schema
 *
 * @public
 */
export const EcsParametersSchema = z
  .object({
    taskDefinitionArn: z
      .string()
      .regex(
        /^arn:aws:ecs:[a-z0-9-]+:\d{12}:task-definition\/.+:\d+$/,
        "Task definition ARN must be valid",
      ),
    taskCount: z.number().int().min(1).max(10).optional(),
    launchType: z.enum(["EC2", "FARGATE", "EXTERNAL"]).optional(),
    platformVersion: z.string().optional(),
    group: z.string().optional(),
    capacityProviderStrategy: z
      .array(
        z.object({
          capacityProvider: z.string().min(1, "Capacity provider is required"),
          weight: z.number().int().min(0).max(1000).optional(),
          base: z.number().int().min(0).max(100_000).optional(),
        }),
      )
      .optional(),
    enableEcsManagedTags: z.boolean().optional(),
    enableExecuteCommand: z.boolean().optional(),
    placementConstraints: z
      .array(
        z.object({
          type: z.enum(["distinctInstance", "memberOf"]).optional(),
          expression: z.string().optional(),
        }),
      )
      .optional(),
    placementStrategy: z
      .array(
        z.object({
          type: z.enum(["random", "spread", "binpack"]).optional(),
          field: z.string().optional(),
        }),
      )
      .optional(),
    propagateTags: z.enum(["TASK_DEFINITION", "SERVICE"]).optional(),
    referenceId: z.string().optional(),
    tags: z
      .array(
        z.object({
          key: z.string().min(1, "Tag key is required"),
          value: z.string(),
        }),
      )
      .optional(),
  })
  .optional();

/**
 * Batch parameters schema
 *
 * @public
 */
export const BatchParametersSchema = z
  .object({
    jobDefinition: z.string().min(1, "Job definition is required"),
    jobName: z.string().min(1, "Job name is required"),
    arrayProperties: z
      .object({
        size: z.number().int().min(2).max(10_000),
      })
      .optional(),
    retryStrategy: z
      .object({
        attempts: z.number().int().min(1).max(10),
      })
      .optional(),
  })
  .optional();

/**
 * SQS parameters schema
 *
 * @public
 */
export const SqsParametersSchema = z
  .object({
    messageGroupId: z.string().optional(),
  })
  .optional();

/**
 * HTTP parameters schema
 *
 * @public
 */
export const HttpParametersSchema = z
  .object({
    pathParameterValues: z.record(z.string(), z.string()).optional(),
    headerParameters: z.record(z.string(), z.string()).optional(),
    queryStringParameters: z.record(z.string(), z.string()).optional(),
  })
  .optional();

/**
 * Redshift Data parameters schema
 *
 * @public
 */
export const RedshiftDataParametersSchema = z
  .object({
    database: z.string().min(1, "Database name is required"),
    dbUser: z.string().optional(),
    sql: z.string().min(1, "SQL statement is required"),
    statementName: z.string().optional(),
    withEvent: z.boolean().optional(),
    secretManagerArn: z.string().optional(),
  })
  .optional();

/**
 * SageMaker Pipeline parameters schema
 *
 * @public
 */
export const SageMakerPipelineParametersSchema = z
  .object({
    pipelineParameterList: z
      .array(
        z.object({
          name: z.string().min(1, "Parameter name is required"),
          value: z.string(),
        }),
      )
      .optional(),
  })
  .optional();

/**
 * Dead letter queue configuration schema
 *
 * @public
 */
export const DeadLetterConfigSchema = z
  .object({
    arn: z.string().optional(),
  })
  .optional();

/**
 * Retry policy configuration schema
 *
 * @public
 */
export const RetryPolicySchema = z
  .object({
    maximumRetryAttempts: z.number().int().min(0).max(185).optional(),
    maximumEventAgeInSeconds: z.number().int().min(60).max(86_400).optional(),
  })
  .optional();

/**
 * Tag schema for EventBridge resources
 *
 * @public
 */
export const EventBridgeTagSchema = z.object({
  key: z.string().min(1, "Tag key is required").max(128, "Tag key must be 128 characters or less"),
  value: z.string().max(256, "Tag value must be 256 characters or less"),
});

/**
 * EventBridge target configuration schema
 *
 * @public
 */
export const EventBridgeTargetSchema = z
  .object({
    id: EventBridgeTargetIdSchema,
    arn: AwsResourceArnSchema,
    roleArn: EventBridgeRoleArnSchema,
    input: z.string().optional(),
    inputPath: z.string().optional(),
    inputTransformer: InputTransformerSchema,
    kinesisParameters: KinesisParametersSchema,
    runCommandParameters: RunCommandParametersSchema,
    ecsParameters: EcsParametersSchema,
    batchParameters: BatchParametersSchema,
    sqsParameters: SqsParametersSchema,
    httpParameters: HttpParametersSchema,
    redshiftDataParameters: RedshiftDataParametersSchema,
    sageMakerPipelineParameters: SageMakerPipelineParametersSchema,
    deadLetterConfig: DeadLetterConfigSchema,
    retryPolicy: RetryPolicySchema,
  })
  .refine(
    (target) =>
      [target.input, target.inputPath, target.inputTransformer].filter(Boolean).length <= 1,
    "Only one of input, inputPath, or inputTransformer can be specified",
  );

/**
 * Common EventBridge configuration schema
 *
 * @public
 */
export const EventBridgeConfigSchema = z.object({
  /**
   * AWS region for operations
   */
  region: AwsRegionSchema.optional(),

  /**
   * AWS profile to use
   */
  profile: AwsProfileSchema.optional(),

  /**
   * Output format for command results
   */
  format: z.enum(["json", "jsonl", "csv", "table"]).default("table"),

  /**
   * Enable verbose logging
   */
  verbose: z.boolean().default(false),
});

/**
 * EventBridge list rules schema
 *
 * @public
 */
export const EventBridgeListRulesSchema = EventBridgeConfigSchema.extend({
  /**
   * Event bus name
   */
  eventBusName: EventBusNameSchema,

  /**
   * Filter rules by name prefix
   */
  namePrefix: z.string().max(64, "Name prefix must be 64 characters or less").optional(),

  /**
   * Maximum number of rules to return
   */
  limit: z.number().int().min(1).max(100).default(10),

  /**
   * Pagination token for next page of results
   */
  nextToken: z.string().optional(),
});

/**
 * EventBridge describe rule schema
 *
 * @public
 */
export const EventBridgeDescribeRuleSchema = EventBridgeConfigSchema.extend({
  /**
   * Rule name
   */
  name: EventBridgeRuleNameSchema,

  /**
   * Event bus name
   */
  eventBusName: EventBusNameSchema,
});

/**
 * EventBridge put rule schema
 *
 * @public
 */
export const EventBridgePutRuleSchema = EventBridgeConfigSchema.extend({
  /**
   * Rule name
   */
  name: EventBridgeRuleNameSchema,

  /**
   * Event bus name
   */
  eventBusName: EventBusNameSchema,

  /**
   * Rule description
   */
  description: z.string().max(512, "Description must be 512 characters or less").optional(),

  /**
   * Event pattern in JSON format
   */
  eventPattern: EventPatternSchema.optional(),

  /**
   * Schedule expression (rate or cron)
   */
  scheduleExpression: ScheduleExpressionSchema.optional(),

  /**
   * Rule state
   */
  state: EventBridgeRuleStateSchema.default("ENABLED"),

  /**
   * IAM role ARN for the rule
   */
  roleArn: EventBridgeRoleArnSchema,

  /**
   * Tags for the rule
   */
  tags: z.array(EventBridgeTagSchema).optional(),
}).refine(
  (rule) => !!(rule.eventPattern || rule.scheduleExpression),
  "Either eventPattern or scheduleExpression must be provided",
);

/**
 * EventBridge delete rule schema
 *
 * @public
 */
export const EventBridgeDeleteRuleSchema = EventBridgeConfigSchema.extend({
  /**
   * Rule name
   */
  name: EventBridgeRuleNameSchema,

  /**
   * Event bus name
   */
  eventBusName: EventBusNameSchema,

  /**
   * Force delete rule even if it has targets
   */
  force: z.boolean().default(false),

  /**
   * Dry run mode - show what would be deleted without actually deleting
   */
  dryRun: z.boolean().default(false),
});

/**
 * EventBridge enable rule schema
 *
 * @public
 */
export const EventBridgeEnableRuleSchema = EventBridgeConfigSchema.extend({
  /**
   * Rule name
   */
  name: EventBridgeRuleNameSchema,

  /**
   * Event bus name
   */
  eventBusName: EventBusNameSchema,
});

/**
 * EventBridge disable rule schema
 *
 * @public
 */
export const EventBridgeDisableRuleSchema = EventBridgeConfigSchema.extend({
  /**
   * Rule name
   */
  name: EventBridgeRuleNameSchema,

  /**
   * Event bus name
   */
  eventBusName: EventBusNameSchema,
});

/**
 * EventBridge list targets by rule schema
 *
 * @public
 */
export const EventBridgeListTargetsByRuleSchema = EventBridgeConfigSchema.extend({
  /**
   * Rule name
   */
  rule: EventBridgeRuleNameSchema,

  /**
   * Event bus name
   */
  eventBusName: EventBusNameSchema,

  /**
   * Pagination token for next page of results
   */
  nextToken: z.string().optional(),

  /**
   * Maximum number of targets to return
   */
  limit: z.number().int().min(1).max(100).default(10),
});

/**
 * EventBridge put targets schema
 *
 * @public
 */
export const EventBridgePutTargetsSchema = EventBridgeConfigSchema.extend({
  /**
   * Rule name
   */
  rule: EventBridgeRuleNameSchema,

  /**
   * Event bus name
   */
  eventBusName: EventBusNameSchema,

  /**
   * Target configurations
   */
  targets: z
    .array(EventBridgeTargetSchema)
    .min(1, "At least one target is required")
    .max(5, "Maximum 5 targets allowed per rule"),
});

/**
 * EventBridge remove targets schema
 *
 * @public
 */
export const EventBridgeRemoveTargetsSchema = EventBridgeConfigSchema.extend({
  /**
   * Rule name
   */
  rule: EventBridgeRuleNameSchema,

  /**
   * Event bus name
   */
  eventBusName: EventBusNameSchema,

  /**
   * Target IDs to remove
   */
  ids: z
    .array(EventBridgeTargetIdSchema)
    .min(1, "At least one target ID is required")
    .max(100, "Maximum 100 target IDs allowed"),

  /**
   * Force remove targets
   */
  force: z.boolean().default(false),

  /**
   * Dry run mode - show what would be removed without actually removing
   */
  dryRun: z.boolean().default(false),
});

// Type exports for TypeScript inference
export type EventBridgeListRules = z.infer<typeof EventBridgeListRulesSchema>;
export type EventBridgeDescribeRule = z.infer<typeof EventBridgeDescribeRuleSchema>;
export type EventBridgePutRule = z.infer<typeof EventBridgePutRuleSchema>;
export type EventBridgeDeleteRule = z.infer<typeof EventBridgeDeleteRuleSchema>;
export type EventBridgeEnableRule = z.infer<typeof EventBridgeEnableRuleSchema>;
export type EventBridgeDisableRule = z.infer<typeof EventBridgeDisableRuleSchema>;
export type EventBridgeListTargetsByRule = z.infer<typeof EventBridgeListTargetsByRuleSchema>;
export type EventBridgePutTargets = z.infer<typeof EventBridgePutTargetsSchema>;
export type EventBridgeRemoveTargets = z.infer<typeof EventBridgeRemoveTargetsSchema>;
export type EventBridgeTarget = z.infer<typeof EventBridgeTargetSchema>;
export type EventBridgeTag = z.infer<typeof EventBridgeTagSchema>;
