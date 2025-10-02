/**
 * @module sqs-errors
 * SQS-specific error types for AWS SQS operations
 *
 * Extends the base error system with SQS-specific error handling
 * for queue management, message operations, batch operations, and DLQ operations.
 *
 */

import { BaseError } from "./errors.js";

/**
 * Queue error for SQS queue operation failures
 *
 * Used when SQS queue operations fail, including queue creation,
 * deletion, listing, and attribute retrieval failures.
 *
 * @public
 */
export class SQSQueueError extends BaseError {
  /**
   * Create a new SQS queue error
   *
   * @param message - User-friendly queue error message
   * @param queueUrl - The queue URL that encountered the error
   * @param operation - The queue operation that failed
   * @param cause - The underlying error that caused the queue failure
   * @param metadata - Additional queue context
   */
  constructor(
    message: string,
    queueUrl?: string,
    operation?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "SQS_QUEUE_ERROR", {
      queueUrl,
      operation,
      cause,
      ...metadata,
    });
  }
}

/**
 * Message error for SQS message operation failures
 *
 * Used when message operations fail, including send, receive,
 * delete, and visibility timeout changes.
 *
 * @public
 */
export class SQSMessageError extends BaseError {
  /**
   * Create a new SQS message error
   *
   * @param message - User-friendly message error message
   * @param queueUrl - The queue URL containing the message
   * @param messageId - The message ID if available
   * @param receiptHandle - The receipt handle if available
   * @param operation - The message operation that failed
   * @param cause - The underlying error that caused the failure
   * @param metadata - Additional message context
   */
  constructor(
    message: string,
    queueUrl?: string,
    messageId?: string,
    receiptHandle?: string,
    operation?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "SQS_MESSAGE_ERROR", {
      queueUrl,
      messageId,
      receiptHandle,
      operation,
      cause,
      ...metadata,
    });
  }
}

/**
 * Receipt handle error for invalid or expired receipt handles
 *
 * Used when receipt handle validation fails or handles expire,
 * providing specific guidance for receipt handle issues.
 *
 * @public
 */
export class SQSReceiptHandleError extends BaseError {
  /**
   * Create a new SQS receipt handle error
   *
   * @param message - User-friendly receipt handle error message
   * @param queueUrl - The queue URL containing the message
   * @param receiptHandle - The invalid or expired receipt handle
   * @param operation - The operation that failed due to receipt handle issues
   * @param metadata - Additional receipt handle context
   */
  constructor(
    message: string,
    queueUrl?: string,
    receiptHandle?: string,
    operation?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "SQS_RECEIPT_HANDLE_ERROR", {
      queueUrl,
      receiptHandle,
      operation,
      ...metadata,
    });
  }
}

/**
 * Batch operation error for SQS batch processing failures
 *
 * Used when batch operations fail, including partial failures
 * where some messages succeed and others fail.
 *
 * @public
 */
export class SQSBatchOperationError extends BaseError {
  /**
   * Create a new SQS batch operation error
   *
   * @param message - User-friendly batch operation error message
   * @param operation - The batch operation that failed
   * @param processedItems - Number of successfully processed items
   * @param failedItems - Number of failed items
   * @param unprocessedItems - Array of unprocessed items
   * @param cause - The underlying error that caused the failure
   * @param metadata - Additional batch operation context
   */
  constructor(
    message: string,
    operation?: string,
    processedItems?: number,
    failedItems?: number,
    unprocessedItems?: unknown[],
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "SQS_BATCH_OPERATION_ERROR", {
      operation,
      processedItems,
      failedItems,
      unprocessedItems,
      cause,
      ...metadata,
    });
  }
}

/**
 * Dead letter queue error for DLQ operation failures
 *
 * Used when DLQ operations fail, including redrive operations,
 * source queue listing, and task management.
 *
 * @public
 */
export class SQSDLQError extends BaseError {
  /**
   * Create a new SQS DLQ error
   *
   * @param message - User-friendly DLQ error message
   * @param sourceQueueArn - The source queue ARN
   * @param dlqArn - The dead letter queue ARN
   * @param taskId - The message move task ID if applicable
   * @param operation - The DLQ operation that failed
   * @param cause - The underlying error that caused the failure
   * @param metadata - Additional DLQ context
   */
  constructor(
    message: string,
    sourceQueueArn?: string,
    dlqArn?: string,
    taskId?: string,
    operation?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "SQS_DLQ_ERROR", {
      sourceQueueArn,
      dlqArn,
      taskId,
      operation,
      cause,
      ...metadata,
    });
  }
}

/**
 * Check if an error is an SQS-related error
 *
 * @param error - The error to check
 * @returns True if the error is SQS-related
 *
 * @public
 */
export function isSQSError(
  error: unknown,
): error is
  | SQSQueueError
  | SQSMessageError
  | SQSReceiptHandleError
  | SQSBatchOperationError
  | SQSDLQError {
  return (
    error instanceof SQSQueueError ||
    error instanceof SQSMessageError ||
    error instanceof SQSReceiptHandleError ||
    error instanceof SQSBatchOperationError ||
    error instanceof SQSDLQError
  );
}

/**
 * Error-like interface for structural typing
 *
 * Allows guidance functions to work with any error object that has
 * the required code and metadata properties, avoiding circular imports.
 */
interface ErrorLike {
  code: string;
  metadata: Record<string, unknown>;
}

/**
 * Get guidance for SQSQueueError
 *
 * @param error - The queue error
 * @returns Formatted guidance message
 * @internal
 */
function getQueueErrorGuidance(error: ErrorLike): string {
  const operation = error.metadata.operation as string;
  const queueUrl = error.metadata.queueUrl as string;
  const queueInfo = queueUrl ? ` for queue '${queueUrl}'` : "";

  switch (operation) {
    case "list-queues": {
      return [
        "Failed to list SQS queues. Here's how to resolve it:",
        "1. Check your AWS credentials: aws sts get-caller-identity",
        "2. Verify region setting in your AWS configuration",
        "3. Ensure you have sqs:ListQueues permission",
        "",
        "Try: aws sqs list-queues --region <your-region>",
      ].join("\n");
    }
    case "get-queue-url": {
      return [
        `Failed to get queue URL${queueInfo}:`,
        "1. Verify the queue name is correct and exists",
        "2. Check you're using the correct AWS region",
        "3. Ensure you have sqs:GetQueueUrl permission",
        "4. For cross-account queues, provide the account ID",
        "",
        "Queue names are case-sensitive",
      ].join("\n");
    }
    case "get-queue-attributes": {
      return [
        `Failed to get queue attributes${queueInfo}:`,
        "1. Verify the queue URL is correct and queue exists",
        "2. Check you have sqs:GetQueueAttributes permission",
        "3. Ensure you're using the correct AWS region",
        "",
        "Try: aws sqs get-queue-attributes --queue-url <queue-url> --attribute-names All",
      ].join("\n");
    }
    case "create-queue": {
      return [
        "Failed to create SQS queue:",
        "1. Verify the queue name doesn't already exist",
        "2. Check queue name follows AWS naming rules (alphanumeric, hyphens, underscores)",
        "3. For FIFO queues, ensure name ends with .fifo suffix",
        "4. Verify you have sqs:CreateQueue permission",
        "",
        "Queue names must be unique within your AWS account and region",
      ].join("\n");
    }
    case "delete-queue": {
      return [
        `Failed to delete queue${queueInfo}:`,
        "1. Verify the queue exists and you have sqs:DeleteQueue permission",
        "2. Note: Queue deletion has 60-second eventual consistency period",
        "3. Check if other services are using this queue",
        "",
        "Deleted queues may still appear in listings for up to 60 seconds",
      ].join("\n");
    }
    default: {
      return [
        `SQS queue operation failed${queueInfo}:`,
        "1. Check your AWS credentials and permissions",
        "2. Verify the queue URL and region are correct",
        "3. Review the specific error message for more details",
        "",
        "Run with --verbose flag for detailed error information",
      ].join("\n");
    }
  }
}

/**
 * Get guidance for SQSMessageError
 *
 * @param error - The message error
 * @returns Formatted guidance message
 * @internal
 */
function getMessageErrorGuidance(error: ErrorLike): string {
  const operation = error.metadata.operation as string;
  const queueUrl = error.metadata.queueUrl as string;
  const messageId = error.metadata.messageId as string;

  const queueInfo = queueUrl ? ` for queue '${queueUrl}'` : "";
  const messageInfo = messageId ? ` (message ID: ${messageId})` : "";

  switch (operation) {
    case "send-message": {
      return [
        `Failed to send message${queueInfo}:`,
        "1. Check message body size (max 256 KB)",
        "2. Verify message attributes don't exceed 256 KB total",
        "3. For FIFO queues, ensure MessageGroupId is provided",
        "4. Check you have sqs:SendMessage permission",
        "",
        "Message body must be valid UTF-8 or Base64-encoded binary",
      ].join("\n");
    }
    case "receive-message": {
      return [
        `Failed to receive messages${queueInfo}:`,
        "1. Verify the queue URL is correct and queue exists",
        "2. Check you have sqs:ReceiveMessage permission",
        "3. Ensure wait time is between 0-20 seconds (long polling)",
        "4. Verify max messages is between 1-10",
        "",
        "Use 20-second wait time for cost-efficient long polling",
      ].join("\n");
    }
    case "delete-message": {
      return [
        `Failed to delete message${queueInfo}${messageInfo}:`,
        "1. Verify the receipt handle is valid and not expired",
        "2. Check you have sqs:DeleteMessage permission",
        "3. Ensure the message hasn't been deleted already",
        "",
        "Receipt handles expire after visibility timeout (default 30s, max 12h)",
      ].join("\n");
    }
    case "change-visibility": {
      return [
        `Failed to change message visibility${queueInfo}${messageInfo}:`,
        "1. Verify the receipt handle is valid and not expired",
        "2. Check visibility timeout is between 0-43,200 seconds (12 hours)",
        "3. Ensure you have sqs:ChangeMessageVisibility permission",
        "",
        "Use this to extend processing time for long-running operations",
      ].join("\n");
    }
    case "count-messages": {
      return [
        `Failed to count messages${queueInfo}:`,
        "1. Verify the queue URL is correct and queue exists",
        "2. Check you have sqs:GetQueueAttributes permission",
        "",
        "Message counts are approximate and may lag actual values by ~1 minute",
      ].join("\n");
    }
    default: {
      return [
        `SQS message operation failed${queueInfo}${messageInfo}:`,
        "1. Check your AWS credentials and permissions",
        "2. Verify the queue URL and message identifiers are correct",
        "3. Review the specific error message for more details",
        "",
        "Run with --verbose flag for detailed error information",
      ].join("\n");
    }
  }
}

/**
 * Get guidance for SQSReceiptHandleError
 *
 * @param error - The receipt handle error
 * @returns Formatted guidance message
 * @internal
 */
function getReceiptHandleErrorGuidance(error: ErrorLike): string {
  const operation = error.metadata.operation as string;
  const queueUrl = error.metadata.queueUrl as string;

  const queueInfo = queueUrl ? ` for queue '${queueUrl}'` : "";

  return [
    `Receipt handle expired or invalid${queueInfo}:`,
    "1. Receipt handles expire after the message's visibility timeout",
    "2. Default visibility timeout: 30 seconds, maximum: 12 hours",
    "3. Use ChangeMessageVisibility to extend timeout during processing",
    "4. Receive the message again to get a new receipt handle",
    "",
    "Receipt handles are the ONLY way to delete messages in SQS",
    "Design your application to complete processing within visibility timeout",
    operation ? `Failed operation: ${operation}` : "",
  ].join("\n");
}

/**
 * Get guidance for SQSBatchOperationError
 *
 * @param error - The batch operation error
 * @returns Formatted guidance message
 * @internal
 */
function getBatchOperationErrorGuidance(error: ErrorLike): string {
  const operation = error.metadata.operation as string;
  const processedItems = error.metadata.processedItems as number | undefined;
  const failedItems = error.metadata.failedItems as number | undefined;

  const successInfo = processedItems === undefined ? "" : ` (${processedItems} succeeded)`;
  const failureInfo = failedItems === undefined ? "" : ` (${failedItems} failed)`;

  switch (operation) {
    case "send-batch": {
      return [
        `Batch send operation encountered errors${successInfo}${failureInfo}:`,
        "1. Check individual message sizes (max 256 KB per message)",
        "2. Verify total batch size doesn't exceed 256 KB",
        "3. Ensure batch has 1-10 messages (AWS limit)",
        "4. For FIFO queues, verify all messages have MessageGroupId",
        "",
        "Failed messages will be retried automatically with exponential backoff",
        "Batch operations provide 10x cost reduction vs individual sends",
      ].join("\n");
    }
    case "delete-batch": {
      return [
        `Batch delete operation encountered errors${successInfo}${failureInfo}:`,
        "1. Verify all receipt handles are valid and not expired",
        "2. Ensure batch has 1-10 receipt handles (AWS limit)",
        "3. Check you have sqs:DeleteMessageBatch permission",
        "",
        "Receipt handles expire after visibility timeout (default 30s, max 12h)",
        "Failed deletions will be retried automatically",
      ].join("\n");
    }
    case "change-visibility-batch": {
      return [
        `Batch visibility change encountered errors${successInfo}${failureInfo}:`,
        "1. Verify all receipt handles are valid and not expired",
        "2. Check visibility timeout values are between 0-43,200 seconds",
        "3. Ensure batch has 1-10 entries (AWS limit)",
        "",
        "Use batch operations for better throughput and cost efficiency",
      ].join("\n");
    }
    default: {
      return [
        `Batch operation failed${successInfo}${failureInfo}:`,
        "1. Review individual error messages for specific failures",
        "2. Check batch size limits (1-10 items, 256 KB total)",
        "3. Verify all items meet operation-specific requirements",
        "",
        "Batch operations are critical for scaling to thousands of messages",
        "Run with --verbose flag for detailed error breakdown",
      ].join("\n");
    }
  }
}

/**
 * Get guidance for SQSDLQError
 *
 * @param error - The DLQ error
 * @returns Formatted guidance message
 * @internal
 */
function getDLQErrorGuidance(error: ErrorLike): string {
  const operation = error.metadata.operation as string;
  const sourceQueueArn = error.metadata.sourceQueueArn as string;
  const dlqArn = error.metadata.dlqArn as string;

  const sourceInfo = sourceQueueArn ? ` for source '${sourceQueueArn}'` : "";
  const dlqInfo = dlqArn ? ` DLQ '${dlqArn}'` : "";

  switch (operation) {
    case "list-sources": {
      return [
        `Failed to list source queues${dlqInfo}:`,
        "1. Verify the DLQ URL is correct and queue exists",
        "2. Check you have sqs:ListDeadLetterSourceQueues permission",
        "3. Ensure the queue is configured as a DLQ for other queues",
        "",
        "Only queues configured as DLQs will have source queues",
      ].join("\n");
    }
    case "start-redrive": {
      return [
        `Failed to start message redrive${sourceInfo}${dlqInfo}:`,
        "1. Verify both source and destination ARNs are correct",
        "2. Check you have sqs:StartMessageMoveTask permission",
        "3. Ensure no other redrive task is running for this queue",
        "4. Verify destination queue can receive messages",
        "",
        "Redrive moves messages from DLQ back to source or custom destination",
        "Use --max-velocity to control redrive speed (messages/second)",
      ].join("\n");
    }
    case "list-tasks": {
      return [
        `Failed to list redrive tasks${sourceInfo}:`,
        "1. Verify the source ARN is correct",
        "2. Check you have sqs:ListMessageMoveTasks permission",
        "",
        "Only active and recent tasks are shown",
      ].join("\n");
    }
    case "cancel-task": {
      return [
        `Failed to cancel redrive task${sourceInfo}:`,
        "1. Verify the task handle is valid and task is active",
        "2. Check you have sqs:CancelMessageMoveTask permission",
        "3. Note: Cancellation may take a few seconds to take effect",
        "",
        "Cancelled tasks may have partially moved messages",
      ].join("\n");
    }
    default: {
      return [
        `DLQ operation failed${sourceInfo}${dlqInfo}:`,
        "1. Check your AWS credentials and permissions",
        "2. Verify ARNs and task handles are correct",
        "3. Review the specific error message for more details",
        "",
        "Run with --verbose flag for detailed error information",
      ].join("\n");
    }
  }
}

/**
 * Get generic guidance for unknown SQS errors
 *
 * @returns Generic guidance message
 * @internal
 */
function getGenericSQSErrorGuidance(): string {
  return [
    "SQS operation encountered an error:",
    "1. Verify your AWS credentials and permissions",
    "2. Check queue URLs and region settings are correct",
    "3. Review AWS SQS service limits and quotas",
    "4. Ensure receipt handles are valid and not expired",
    "",
    "Common SQS limits:",
    "- 120,000 in-flight messages per queue",
    "- 256 KB max message size",
    "- 10 messages per batch operation",
    "- 12 hours max visibility timeout",
    "",
    "Use --verbose flag for detailed debugging information",
  ].join("\n");
}

/**
 * Get user-friendly resolution guidance for SQS errors
 *
 * @param error - The SQS error to get guidance for
 * @returns Resolution guidance message
 *
 * @public
 */
export function getSQSErrorGuidance(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const typedError = error as ErrorLike;
    switch (typedError.code) {
      case "SQS_QUEUE_ERROR": {
        return getQueueErrorGuidance(typedError);
      }
      case "SQS_MESSAGE_ERROR": {
        return getMessageErrorGuidance(typedError);
      }
      case "SQS_RECEIPT_HANDLE_ERROR": {
        return getReceiptHandleErrorGuidance(typedError);
      }
      case "SQS_BATCH_OPERATION_ERROR": {
        return getBatchOperationErrorGuidance(typedError);
      }
      case "SQS_DLQ_ERROR": {
        return getDLQErrorGuidance(typedError);
      }
    }
  }

  // Check for AWS SDK SQS-specific errors
  if (error && typeof error === "object" && "name" in error) {
    const awsError = error as { name: string; message?: string };
    switch (awsError.name) {
      case "QueueDoesNotExist": {
        return [
          "Queue does not exist:",
          "1. Verify the queue URL or name is correct",
          "2. Check you're using the correct AWS region",
          "3. List queues to see available queues: aws sqs list-queues",
          "",
          "Queue URLs are region-specific",
        ].join("\n");
      }
      case "OverLimit": {
        return [
          "Queue limit exceeded (120,000 in-flight messages):",
          "1. Wait for messages to be deleted or visibility timeouts to expire",
          "2. Increase processing speed to delete messages faster",
          "3. Consider using multiple queues for better throughput",
          "",
          "In-flight messages = messages received but not yet deleted",
        ].join("\n");
      }
      case "ReceiptHandleIsInvalid":
      case "InvalidReceiptHandle": {
        return [
          "Invalid receipt handle:",
          "1. Receipt handles expire after visibility timeout (default 30s, max 12h)",
          "2. Receive the message again to get a new receipt handle",
          "3. Use ChangeMessageVisibility to extend timeout during processing",
          "",
          "Receipt handles are the ONLY way to delete messages",
        ].join("\n");
      }
      case "BatchRequestTooLong": {
        return [
          "Batch request exceeds 256 KB limit:",
          "1. Reduce number of messages in batch",
          "2. Reduce message body sizes",
          "3. Remove or reduce message attributes",
          "",
          "Total batch size = sum of all message bodies + attributes",
        ].join("\n");
      }
      case "TooManyEntriesInBatchRequest": {
        return [
          "Batch contains more than 10 messages:",
          "1. AWS SQS batch limit is 10 messages per request",
          "2. Split large batches into multiple requests",
          "3. Use automatic batching for large-scale operations",
          "",
          "The CLI automatically handles batching for bulk operations",
        ].join("\n");
      }
    }
  }

  return getGenericSQSErrorGuidance();
}

/**
 * Format SQS command errors with standardized messages and guidance
 *
 * @param error - The error that occurred
 * @param verbose - Whether to include verbose error details
 * @param context - Optional context for the operation that failed
 * @returns Formatted error message with guidance
 *
 * @public
 *
 * @remarks
 * This function provides centralized error formatting for all SQS commands,
 * ensuring consistent error messages and user guidance across the CLI.
 * It handles both SQS-specific errors and generic errors, enriching them
 * with actionable resolution steps based on the error type and context.
 */
export function formatSQSError(error: unknown, verbose = false, context?: string): string {
  const guidance = getSQSErrorGuidance(error);
  const contextPrefix = context ? `[${context}] ` : "";

  if (isSQSError(error)) {
    let formatted = `${contextPrefix}${error.code}: ${error.message}`;

    if (verbose && Object.keys(error.metadata).length > 0) {
      formatted += `\n\nError Details:\n${JSON.stringify(error.metadata, undefined, 2)}`;
    }

    if (verbose && error.stack) {
      formatted += `\n\nStack Trace:\n${error.stack}`;
    }

    formatted += `\n\nResolution:\n${guidance}`;
    return formatted;
  }

  if (error instanceof Error) {
    let formatted = `${contextPrefix}${error.message}`;

    if (verbose && error.stack) {
      formatted += `\n\nStack Trace:\n${error.stack}`;
    }

    formatted += `\n\nResolution:\n${guidance}`;
    return formatted;
  }

  return `${contextPrefix}${String(error)}\n\nResolution:\n${guidance}`;
}
