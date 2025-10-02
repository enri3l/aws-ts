/**
 * @module sqs-schemas
 * SQS-specific Zod schemas for input validation
 *
 * Provides validation schemas for SQS commands
 * and operations with automatic TypeScript type generation.
 *
 */

import { z } from "zod";
import { AwsProfileSchema, AwsRegionSchema } from "./schemas.js";

/**
 * SQS queue URL validation with AWS format constraints
 *
 * @public
 */
export const SQSQueueUrlSchema = z
  .string()
  .min(1, "Queue URL is required")
  .regex(
    /^https:\/\/sqs\.[a-z0-9-]+\.amazonaws\.com\/\d{12}\/[a-zA-Z0-9_-]+(\\.fifo)?$/,
    "Invalid SQS queue URL format. Expected: https://sqs.{region}.amazonaws.com/{accountId}/{queueName}",
  );

/**
 * SQS queue name validation with AWS constraints
 *
 * @public
 */
export const SQSQueueNameSchema = z
  .string()
  .min(1, "Queue name is required")
  .max(80, "Queue name must be 80 characters or less")
  .regex(
    /^[a-zA-Z0-9_-]+(\\.fifo)?$/,
    "Queue name can only contain alphanumeric characters, hyphens, underscores, and optional .fifo suffix",
  );

/**
 * SQS receipt handle validation
 *
 * @public
 */
export const SQSReceiptHandleSchema = z.string().min(1, "Receipt handle is required");

/**
 * SQS message body validation (256 KB max)
 *
 * @public
 */
export const SQSMessageBodySchema = z
  .string()
  .min(1, "Message body is required")
  .refine((body) => Buffer.byteLength(body, "utf8") <= 262_144, {
    message: "Message body must be 256 KB or less",
  });

/**
 * SQS message attribute data type validation
 *
 * @public
 */
export const SQSMessageAttributeDataTypeSchema = z.enum(["String", "Number", "Binary"]);

/**
 * SQS message attribute value validation
 *
 * @public
 */
export const SQSMessageAttributeValueSchema = z.object({
  DataType: SQSMessageAttributeDataTypeSchema,
  StringValue: z.string().optional(),
  BinaryValue: z.instanceof(Uint8Array).optional(),
});

/**
 * SQS message attributes validation with size constraints
 *
 * @public
 */
export const SQSMessageAttributesSchema = z
  .record(z.string(), SQSMessageAttributeValueSchema)
  .refine(
    (attributes) => {
      let totalSize = 0;
      for (const [key, value] of Object.entries(attributes)) {
        const keySize = Buffer.byteLength(key, "utf8");
        const valueSize = value.StringValue
          ? Buffer.byteLength(value.StringValue, "utf8")
          : value.BinaryValue?.byteLength || 0;
        totalSize += keySize + valueSize;
      }
      return totalSize <= 262_144;
    },
    { message: "Total message attributes size must not exceed 256 KB" },
  )
  .optional();

/**
 * SQS message group ID validation (for FIFO queues)
 *
 * @public
 */
export const SQSMessageGroupIdSchema = z
  .string()
  .min(1, "Message group ID is required for FIFO queues")
  .max(128, "Message group ID must be 128 characters or less");

/**
 * SQS message deduplication ID validation (for FIFO queues)
 *
 * @public
 */
export const SQSMessageDeduplicationIdSchema = z
  .string()
  .min(1, "Message deduplication ID must not be empty")
  .max(128, "Message deduplication ID must be 128 characters or less");

/**
 * SQS delay seconds validation (0 to 15 minutes)
 *
 * @public
 */
export const SQSDelaySecondsSchema = z
  .number()
  .int()
  .min(0, "Delay must be at least 0 seconds")
  .max(900, "Delay cannot exceed 900 seconds (15 minutes)");

/**
 * SQS visibility timeout validation (0 to 12 hours)
 *
 * @public
 */
export const SQSVisibilityTimeoutSchema = z
  .number()
  .int()
  .min(0, "Visibility timeout must be at least 0 seconds")
  .max(43_200, "Visibility timeout cannot exceed 43,200 seconds (12 hours)");

/**
 * SQS wait time seconds validation for long polling
 *
 * @public
 */
export const SQSWaitTimeSecondsSchema = z
  .number()
  .int()
  .min(0, "Wait time must be at least 0 seconds")
  .max(20, "Wait time cannot exceed 20 seconds");

/**
 * SQS max number of messages validation (1 to 10)
 *
 * @public
 */
export const SQSMaxNumberOfMessagesSchema = z
  .number()
  .int()
  .min(1, "Must retrieve at least 1 message")
  .max(10, "Cannot retrieve more than 10 messages per request");

/**
 * SQS batch size validation (1 to 10)
 *
 * @public
 */
export const SQSBatchSizeSchema = z
  .number()
  .int()
  .min(1, "Batch size must be at least 1")
  .max(10, "Batch size cannot exceed 10 (AWS limit)");

/**
 * SQS message retention period validation (1 minute to 14 days)
 *
 * @public
 */
export const SQSMessageRetentionPeriodSchema = z
  .number()
  .int()
  .min(60, "Message retention must be at least 60 seconds (1 minute)")
  .max(1_209_600, "Message retention cannot exceed 1,209,600 seconds (14 days)");

/**
 * SQS receive wait time validation for queue creation
 *
 * @public
 */
export const SQSReceiveWaitTimeSchema = z
  .number()
  .int()
  .min(0, "Receive wait time must be at least 0 seconds")
  .max(20, "Receive wait time cannot exceed 20 seconds");

/**
 * Common SQS configuration schema
 *
 * @public
 */
export const SQSConfigSchema = z.object({
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
 * SQS list queues command schema
 *
 * @public
 */
export const SQSListQueuesSchema = SQSConfigSchema.extend({
  /**
   * Queue name prefix filter
   */
  queueNamePrefix: z.string().max(80, "Queue name prefix must be 80 characters or less").optional(),

  /**
   * Maximum number of queue URLs to return
   */
  maxResults: z.number().int().min(1).max(1000).optional(),

  /**
   * Pagination token from previous response
   */
  nextToken: z.string().optional(),
});

/**
 * SQS get queue URL command schema
 *
 * @public
 */
export const SQSGetQueueUrlSchema = SQSConfigSchema.extend({
  /**
   * Queue name to get URL for
   */
  queueName: SQSQueueNameSchema,

  /**
   * AWS account ID (optional)
   */
  queueOwnerAwsAccountId: z
    .string()
    .regex(/^\d{12}$/, "Account ID must be 12 digits")
    .optional(),
});

/**
 * SQS describe queue (get attributes) command schema
 *
 * @public
 */
export const SQSDescribeQueueSchema = SQSConfigSchema.extend({
  /**
   * Queue URL to describe
   */
  queueUrl: SQSQueueUrlSchema,

  /**
   * Specific attributes to retrieve (optional, defaults to All)
   */
  attributeNames: z.array(z.string()).optional(),
});

/**
 * SQS create queue command schema
 *
 * @public
 */
export const SQSCreateQueueSchema = SQSConfigSchema.extend({
  /**
   * Queue name
   */
  queueName: SQSQueueNameSchema,

  /**
   * Create FIFO queue
   */
  fifo: z.boolean().default(false),

  /**
   * Visibility timeout in seconds
   */
  visibilityTimeout: SQSVisibilityTimeoutSchema.optional(),

  /**
   * Message retention period in seconds
   */
  messageRetentionPeriod: SQSMessageRetentionPeriodSchema.optional(),

  /**
   * Receive message wait time for long polling
   */
  receiveWaitTime: SQSReceiveWaitTimeSchema.optional(),

  /**
   * Delay seconds for all messages
   */
  delaySeconds: SQSDelaySecondsSchema.optional(),

  /**
   * Dead letter queue ARN
   */
  deadLetterQueueArn: z
    .string()
    .regex(/^arn:aws:sqs:[a-z0-9-]+:\d{12}:[a-zA-Z0-9_-]+$/, "Invalid SQS ARN format")
    .optional(),

  /**
   * Maximum receives before sending to DLQ
   */
  maxReceiveCount: z.number().int().min(1).max(1000).optional(),

  /**
   * KMS key ID for encryption
   */
  kmsKeyId: z.string().optional(),

  /**
   * Content-based deduplication for FIFO queues
   */
  contentBasedDeduplication: z.boolean().optional(),

  /**
   * Additional queue attributes
   */
  attributes: z.record(z.string(), z.string()).optional(),

  /**
   * Queue tags
   */
  tags: z.record(z.string(), z.string()).optional(),
});

/**
 * SQS delete queue command schema
 *
 * @public
 */
export const SQSDeleteQueueSchema = SQSConfigSchema.extend({
  /**
   * Queue URL to delete
   */
  queueUrl: SQSQueueUrlSchema,

  /**
   * Skip confirmation prompt
   */
  force: z.boolean().default(false),
});

/**
 * SQS send message command schema
 *
 * @public
 */
export const SQSSendMessageSchema = SQSConfigSchema.extend({
  /**
   * Queue URL to send message to
   */
  queueUrl: SQSQueueUrlSchema,

  /**
   * Message body content
   */
  messageBody: SQSMessageBodySchema,

  /**
   * Delay before message becomes visible
   */
  delaySeconds: SQSDelaySecondsSchema.optional(),

  /**
   * Message attributes
   */
  messageAttributes: SQSMessageAttributesSchema,

  /**
   * Message group ID (required for FIFO queues)
   */
  messageGroupId: SQSMessageGroupIdSchema.optional(),

  /**
   * Message deduplication ID (for FIFO queues)
   */
  messageDeduplicationId: SQSMessageDeduplicationIdSchema.optional(),
});

/**
 * SQS receive message command schema
 *
 * @public
 */
export const SQSReceiveMessageSchema = SQSConfigSchema.extend({
  /**
   * Queue URL to receive messages from
   */
  queueUrl: SQSQueueUrlSchema,

  /**
   * Maximum number of messages to retrieve
   */
  maxMessages: SQSMaxNumberOfMessagesSchema.default(1),

  /**
   * Long polling wait time
   */
  waitTimeSeconds: SQSWaitTimeSecondsSchema.default(20),

  /**
   * Visibility timeout for received messages
   */
  visibilityTimeout: SQSVisibilityTimeoutSchema.optional(),

  /**
   * Message attribute names to retrieve
   */
  messageAttributeNames: z.array(z.string()).optional(),

  /**
   * Retrieve all message attributes
   */
  allAttributes: z.boolean().default(false),

  /**
   * Retrieve all message system attributes
   */
  allMessageAttributes: z.boolean().default(false),
});

/**
 * SQS delete message command schema
 *
 * @public
 */
export const SQSDeleteMessageSchema = SQSConfigSchema.extend({
  /**
   * Queue URL containing the message
   */
  queueUrl: SQSQueueUrlSchema,

  /**
   * Receipt handle from ReceiveMessage
   */
  receiptHandle: SQSReceiptHandleSchema,
});

/**
 * SQS change message visibility command schema
 *
 * @public
 */
export const SQSChangeMessageVisibilitySchema = SQSConfigSchema.extend({
  /**
   * Queue URL containing the message
   */
  queueUrl: SQSQueueUrlSchema,

  /**
   * Receipt handle from ReceiveMessage
   */
  receiptHandle: SQSReceiptHandleSchema,

  /**
   * New visibility timeout in seconds
   */
  visibilityTimeout: SQSVisibilityTimeoutSchema,
});

/**
 * SQS count messages command schema
 *
 * @public
 */
export const SQSCountMessagesSchema = SQSConfigSchema.extend({
  /**
   * Queue URL to count messages in
   */
  queueUrl: SQSQueueUrlSchema,
});

/**
 * SQS send message batch command schema
 *
 * @public
 */
export const SQSSendMessageBatchSchema = SQSConfigSchema.extend({
  /**
   * Queue URL to send messages to
   */
  queueUrl: SQSQueueUrlSchema,

  /**
   * Input file path (JSON, JSONL, or CSV)
   */
  inputFile: z.string().min(1, "Input file path is required"),

  /**
   * Batch size for processing
   */
  batchSize: SQSBatchSizeSchema.default(10),

  /**
   * Maximum concurrent batch operations
   */
  maxConcurrency: z.number().int().min(1).max(20).default(10),

  /**
   * Maximum retry attempts for failed batches
   */
  maxRetries: z.number().int().min(0).max(10).default(3),
});

/**
 * SQS receive message batch command schema
 *
 * @public
 */
export const SQSReceiveMessageBatchSchema = SQSConfigSchema.extend({
  /**
   * Queue URL to receive messages from
   */
  queueUrl: SQSQueueUrlSchema,

  /**
   * Maximum number of batches to receive
   */
  maxBatches: z.number().int().min(1).optional(),

  /**
   * Batch size (messages per receive call)
   */
  batchSize: SQSMaxNumberOfMessagesSchema.default(10),

  /**
   * Long polling wait time
   */
  waitTimeSeconds: SQSWaitTimeSecondsSchema.default(20),

  /**
   * Visibility timeout for received messages
   */
  visibilityTimeout: SQSVisibilityTimeoutSchema.optional(),

  /**
   * Output file path (optional, defaults to stdout)
   */
  outputFile: z.string().optional(),
});

/**
 * SQS delete message batch command schema
 *
 * @public
 */
export const SQSDeleteMessageBatchSchema = SQSConfigSchema.extend({
  /**
   * Queue URL containing the messages
   */
  queueUrl: SQSQueueUrlSchema,

  /**
   * Input file with receipt handles (JSON, JSONL, or CSV)
   */
  inputFile: z.string().min(1, "Input file path is required"),

  /**
   * Batch size for processing
   */
  batchSize: SQSBatchSizeSchema.default(10),

  /**
   * Maximum concurrent batch operations
   */
  maxConcurrency: z.number().int().min(1).max(20).default(10),

  /**
   * Maximum retry attempts for failed batches
   */
  maxRetries: z.number().int().min(0).max(10).default(3),
});

/**
 * SQS change message visibility batch command schema
 *
 * @public
 */
export const SQSChangeMessageVisibilityBatchSchema = SQSConfigSchema.extend({
  /**
   * Queue URL containing the messages
   */
  queueUrl: SQSQueueUrlSchema,

  /**
   * Input file with receipt handles and timeout values
   */
  inputFile: z.string().min(1, "Input file path is required"),

  /**
   * Batch size for processing
   */
  batchSize: SQSBatchSizeSchema.default(10),

  /**
   * Maximum concurrent batch operations
   */
  maxConcurrency: z.number().int().min(1).max(20).default(10),

  /**
   * Maximum retry attempts for failed batches
   */
  maxRetries: z.number().int().min(0).max(10).default(3),
});

/**
 * SQS list dead letter source queues command schema
 *
 * @public
 */
export const SQSListDeadLetterSourceQueuesSchema = SQSConfigSchema.extend({
  /**
   * Dead letter queue URL
   */
  queueUrl: SQSQueueUrlSchema,

  /**
   * Maximum number of queue URLs to return
   */
  maxResults: z.number().int().min(1).max(1000).optional(),

  /**
   * Pagination token from previous response
   */
  nextToken: z.string().optional(),
});

/**
 * SQS start message move task (redrive) command schema
 *
 * @public
 */
export const SQSStartMessageMoveTaskSchema = SQSConfigSchema.extend({
  /**
   * Source queue ARN (DLQ)
   */
  sourceArn: z
    .string()
    .regex(/^arn:aws:sqs:[a-z0-9-]+:\d{12}:[a-zA-Z0-9_-]+$/, "Invalid SQS ARN format"),

  /**
   * Destination queue ARN (optional, defaults to original source)
   */
  destinationArn: z
    .string()
    .regex(/^arn:aws:sqs:[a-z0-9-]+:\d{12}:[a-zA-Z0-9_-]+$/, "Invalid SQS ARN format")
    .optional(),

  /**
   * Maximum number of messages per second to move
   */
  maxVelocity: z.number().int().min(1).optional(),
});

/**
 * SQS list message move tasks (redrive status) command schema
 *
 * @public
 */
export const SQSListMessageMoveTasksSchema = SQSConfigSchema.extend({
  /**
   * Source queue ARN to filter tasks
   */
  sourceArn: z
    .string()
    .regex(/^arn:aws:sqs:[a-z0-9-]+:\d{12}:[a-zA-Z0-9_-]+$/, "Invalid SQS ARN format"),

  /**
   * Maximum number of tasks to return
   */
  maxResults: z.number().int().min(1).max(10).optional(),
});

/**
 * SQS cancel message move task command schema
 *
 * @public
 */
export const SQSCancelMessageMoveTaskSchema = SQSConfigSchema.extend({
  /**
   * Task handle from StartMessageMoveTask
   */
  taskHandle: z.string().min(1, "Task handle is required"),
});

// Type exports for TypeScript inference
export type SQSListQueues = z.infer<typeof SQSListQueuesSchema>;
export type SQSGetQueueUrl = z.infer<typeof SQSGetQueueUrlSchema>;
export type SQSDescribeQueue = z.infer<typeof SQSDescribeQueueSchema>;
export type SQSCreateQueue = z.infer<typeof SQSCreateQueueSchema>;
export type SQSDeleteQueue = z.infer<typeof SQSDeleteQueueSchema>;
export type SQSSendMessage = z.infer<typeof SQSSendMessageSchema>;
export type SQSReceiveMessage = z.infer<typeof SQSReceiveMessageSchema>;
export type SQSDeleteMessage = z.infer<typeof SQSDeleteMessageSchema>;
export type SQSChangeMessageVisibility = z.infer<typeof SQSChangeMessageVisibilitySchema>;
export type SQSCountMessages = z.infer<typeof SQSCountMessagesSchema>;
export type SQSSendMessageBatch = z.infer<typeof SQSSendMessageBatchSchema>;
export type SQSReceiveMessageBatch = z.infer<typeof SQSReceiveMessageBatchSchema>;
export type SQSDeleteMessageBatch = z.infer<typeof SQSDeleteMessageBatchSchema>;
export type SQSChangeMessageVisibilityBatch = z.infer<typeof SQSChangeMessageVisibilityBatchSchema>;
export type SQSListDeadLetterSourceQueues = z.infer<typeof SQSListDeadLetterSourceQueuesSchema>;
export type SQSStartMessageMoveTask = z.infer<typeof SQSStartMessageMoveTaskSchema>;
export type SQSListMessageMoveTasks = z.infer<typeof SQSListMessageMoveTasksSchema>;
export type SQSCancelMessageMoveTask = z.infer<typeof SQSCancelMessageMoveTaskSchema>;
