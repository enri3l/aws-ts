/**
 * @module sqs-service
 * SQS service for queue and message management
 *
 * Orchestrates AWS SQS operations by providing a unified interface for
 * queue management, message operations, batch processing, and dead letter queue operations.
 * Integrates with existing credential management for AWS SDK client creation.
 *
 */

import {
  CancelMessageMoveTaskCommand,
  ChangeMessageVisibilityBatchCommand,
  ChangeMessageVisibilityCommand,
  CreateQueueCommand,
  DeleteMessageBatchCommand,
  DeleteMessageCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  GetQueueUrlCommand,
  ListDeadLetterSourceQueuesCommand,
  ListMessageMoveTasksCommand,
  ListQueuesCommand,
  ReceiveMessageCommand,
  SQSClient,
  SendMessageBatchCommand,
  SendMessageCommand,
  StartMessageMoveTaskCommand,
  type CancelMessageMoveTaskCommandOutput,
  type ChangeMessageVisibilityBatchRequestEntry,
  type ChangeMessageVisibilityBatchResult,
  type CreateQueueCommandOutput,
  type DeleteMessageBatchRequestEntry,
  type DeleteMessageBatchResult,
  type DeleteQueueCommandOutput,
  type GetQueueAttributesCommandOutput,
  type GetQueueUrlCommandOutput,
  type ListDeadLetterSourceQueuesCommandOutput,
  type ListMessageMoveTasksCommandOutput,
  type ListQueuesCommandOutput,
  type MessageAttributeValue,
  type QueueAttributeName,
  type ReceiveMessageCommandOutput,
  type SendMessageBatchRequestEntry,
  type SendMessageBatchResult,
  type SendMessageCommandOutput,
  type StartMessageMoveTaskCommandOutput,
} from "@aws-sdk/client-sqs";
import { BaseAwsService, type BaseServiceOptions } from "../lib/base-aws-service.js";
import { retryWithBackoff } from "../lib/retry.js";
import {
  SQSBatchOperationError,
  SQSDLQError,
  SQSMessageError,
  SQSQueueError,
  SQSReceiptHandleError,
} from "../lib/sqs-errors.js";
import type { AwsClientConfig } from "./credential-service.js";

/**
 * Configuration options for SQS service
 *
 * @public
 */
export type SQSServiceOptions = BaseServiceOptions;

/**
 * Parameters for sending a single message to SQS
 *
 * @public
 */
export interface SQSSendMessageParameters {
  messageBody: string;
  delaySeconds?: number;
  messageAttributes?: Record<string, MessageAttributeValue>;
  messageGroupId?: string;
  messageDeduplicationId?: string;
}

/**
 * Parameters for receiving messages from SQS
 *
 * @public
 */
export interface SQSReceiveMessageParameters {
  maxNumberOfMessages?: number;
  waitTimeSeconds?: number;
  visibilityTimeout?: number;
  messageAttributeNames?: string[];
  attributeNames?: QueueAttributeName[];
}

/**
 * Parameters for creating an SQS queue
 *
 * @public
 */
export interface SQSCreateQueueParameters {
  queueName: string;
  attributes?: Record<string, string>;
  tags?: Record<string, string>;
}

/**
 * SQS service for queue and message management
 *
 * Provides a unified interface for all SQS operations,
 * coordinating with credential management and providing error handling.
 *
 * @public
 */
export class SQSService extends BaseAwsService<SQSClient> {
  /**
   * Create a new SQS service instance
   *
   * @param options - Configuration options for the service
   */
  constructor(options: SQSServiceOptions = {}) {
    super(SQSClient, options);
  }

  /**
   * List SQS queues with optional filtering
   *
   * @param config - Client configuration options
   * @param queueNamePrefix - Optional queue name prefix filter
   * @param maxResults - Maximum number of queues to return
   * @param nextToken - Pagination token from previous request
   * @returns Promise resolving to queue URLs and pagination token
   * @throws When queue listing fails
   */
  async listQueues(
    config: AwsClientConfig = {},
    queueNamePrefix?: string,
    maxResults?: number,
    nextToken?: string,
  ): Promise<ListQueuesCommandOutput> {
    const spinner = this.createSpinner("Listing SQS queues...");

    try {
      const client = await this.getClient(config);
      const command = new ListQueuesCommand({
        QueueNamePrefix: queueNamePrefix,
        MaxResults: maxResults,
        NextToken: nextToken,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying list queues (attempt ${attempt})...`;
        },
      });

      const queueCount = response.QueueUrls?.length || 0;
      const queuePlural = queueCount === 1 ? "" : "s";
      spinner.succeed(`Found ${queueCount} SQS queue${queuePlural}`);

      return response;
    } catch (error) {
      spinner.fail("Failed to list queues");
      throw new SQSQueueError(
        `Failed to list SQS queues: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        "list-queues",
        error,
      );
    }
  }

  /**
   * Get queue URL by queue name
   *
   * @param queueName - Name of the queue
   * @param config - Client configuration options
   * @param queueOwnerAwsAccountId - Optional account ID for cross-account access
   * @returns Promise resolving to queue URL
   * @throws When queue URL retrieval fails
   */
  async getQueueUrl(
    queueName: string,
    config: AwsClientConfig = {},
    queueOwnerAwsAccountId?: string,
  ): Promise<GetQueueUrlCommandOutput> {
    const spinner = this.createSpinner(`Getting URL for queue '${queueName}'...`);

    try {
      const client = await this.getClient(config);
      const command = new GetQueueUrlCommand({
        QueueName: queueName,
        QueueOwnerAWSAccountId: queueOwnerAwsAccountId,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying get queue URL (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Retrieved queue URL for '${queueName}'`);
      return response;
    } catch (error) {
      spinner.fail("Failed to get queue URL");
      throw new SQSQueueError(
        `Failed to get queue URL for '${queueName}': ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        "get-queue-url",
        error,
        { queueName },
      );
    }
  }

  /**
   * Get queue attributes
   *
   * @param queueUrl - URL of the queue
   * @param config - Client configuration options
   * @param attributeNames - Optional specific attributes to retrieve
   * @returns Promise resolving to queue attributes
   * @throws When attribute retrieval fails
   */
  async getQueueAttributes(
    queueUrl: string,
    config: AwsClientConfig = {},
    attributeNames?: QueueAttributeName[],
  ): Promise<GetQueueAttributesCommandOutput> {
    const spinner = this.createSpinner("Getting queue attributes...");

    try {
      const client = await this.getClient(config);
      const command = new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: attributeNames || ["All"],
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying get queue attributes (attempt ${attempt})...`;
        },
      });

      spinner.succeed("Retrieved queue attributes");
      return response;
    } catch (error) {
      spinner.fail("Failed to get queue attributes");
      throw new SQSQueueError(
        `Failed to get queue attributes: ${error instanceof Error ? error.message : String(error)}`,
        queueUrl,
        "get-queue-attributes",
        error,
      );
    }
  }

  /**
   * Create a new SQS queue
   *
   * @param parameters - Queue creation parameters
   * @param config - Client configuration options
   * @returns Promise resolving to queue URL
   * @throws When queue creation fails
   */
  async createQueue(
    parameters: SQSCreateQueueParameters,
    config: AwsClientConfig = {},
  ): Promise<CreateQueueCommandOutput> {
    const spinner = this.createSpinner(`Creating queue '${parameters.queueName}'...`);

    try {
      const client = await this.getClient(config);
      const command = new CreateQueueCommand({
        QueueName: parameters.queueName,
        Attributes: parameters.attributes,
        tags: parameters.tags,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying create queue (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Created queue '${parameters.queueName}'`);
      return response;
    } catch (error) {
      spinner.fail("Failed to create queue");
      throw new SQSQueueError(
        `Failed to create queue '${parameters.queueName}': ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        "create-queue",
        error,
        { queueName: parameters.queueName },
      );
    }
  }

  /**
   * Delete an SQS queue
   *
   * @param queueUrl - URL of the queue to delete
   * @param config - Client configuration options
   * @returns Promise resolving when queue is deleted
   * @throws When queue deletion fails
   */
  async deleteQueue(
    queueUrl: string,
    config: AwsClientConfig = {},
  ): Promise<DeleteQueueCommandOutput> {
    const spinner = this.createSpinner("Deleting queue...");

    try {
      const client = await this.getClient(config);
      const command = new DeleteQueueCommand({
        QueueUrl: queueUrl,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying delete queue (attempt ${attempt})...`;
        },
      });

      spinner.succeed("Queue deleted (60-second propagation delay applies)");
      return response;
    } catch (error) {
      spinner.fail("Failed to delete queue");
      throw new SQSQueueError(
        `Failed to delete queue: ${error instanceof Error ? error.message : String(error)}`,
        queueUrl,
        "delete-queue",
        error,
      );
    }
  }

  /**
   * Send a message to an SQS queue
   *
   * @param queueUrl - URL of the queue
   * @param parameters - Message send parameters
   * @param config - Client configuration options
   * @returns Promise resolving to message details
   * @throws When message send fails
   */
  async sendMessage(
    queueUrl: string,
    parameters: SQSSendMessageParameters,
    config: AwsClientConfig = {},
  ): Promise<SendMessageCommandOutput> {
    const spinner = this.createSpinner("Sending message...");

    try {
      const client = await this.getClient(config);
      const command = new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: parameters.messageBody,
        DelaySeconds: parameters.delaySeconds,
        MessageAttributes: parameters.messageAttributes,
        MessageGroupId: parameters.messageGroupId,
        MessageDeduplicationId: parameters.messageDeduplicationId,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying send message (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Message sent (ID: ${response.MessageId})`);
      return response;
    } catch (error) {
      spinner.fail("Failed to send message");
      throw new SQSMessageError(
        `Failed to send message: ${error instanceof Error ? error.message : String(error)}`,
        queueUrl,
        undefined,
        undefined,
        "send-message",
        error,
      );
    }
  }

  /**
   * Receive messages from an SQS queue
   *
   * @param queueUrl - URL of the queue
   * @param parameters - Message receive parameters
   * @param config - Client configuration options
   * @returns Promise resolving to received messages
   * @throws When message receive fails
   */
  async receiveMessage(
    queueUrl: string,
    parameters: SQSReceiveMessageParameters,
    config: AwsClientConfig = {},
  ): Promise<ReceiveMessageCommandOutput> {
    const spinner = this.createSpinner("Receiving messages...");

    try {
      const client = await this.getClient(config);
      const command = new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        ...(parameters.maxNumberOfMessages !== undefined && {
          MaxNumberOfMessages: parameters.maxNumberOfMessages,
        }),
        ...(parameters.waitTimeSeconds !== undefined && {
          WaitTimeSeconds: parameters.waitTimeSeconds,
        }),
        ...(parameters.visibilityTimeout !== undefined && {
          VisibilityTimeout: parameters.visibilityTimeout,
        }),
        ...(parameters.messageAttributeNames && {
          MessageAttributeNames: parameters.messageAttributeNames,
        }),
        ...(parameters.attributeNames && { AttributeNames: parameters.attributeNames }),
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying receive message (attempt ${attempt})...`;
        },
      });

      const messageCount = response.Messages?.length || 0;
      const messagePlural = messageCount === 1 ? "" : "s";
      spinner.succeed(`Received ${messageCount} message${messagePlural}`);

      return response;
    } catch (error) {
      spinner.fail("Failed to receive messages");
      throw new SQSMessageError(
        `Failed to receive messages: ${error instanceof Error ? error.message : String(error)}`,
        queueUrl,
        undefined,
        undefined,
        "receive-message",
        error,
      );
    }
  }

  /**
   * Delete a message from an SQS queue
   *
   * @param queueUrl - URL of the queue
   * @param receiptHandle - Receipt handle from received message
   * @param config - Client configuration options
   * @returns Promise resolving when message is deleted
   * @throws When message deletion fails
   */
  async deleteMessage(
    queueUrl: string,
    receiptHandle: string,
    config: AwsClientConfig = {},
  ): Promise<void> {
    const spinner = this.createSpinner("Deleting message...");

    try {
      const client = await this.getClient(config);
      const command = new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      });

      await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying delete message (attempt ${attempt})...`;
        },
      });

      spinner.succeed("Message deleted");
    } catch (error) {
      spinner.fail("Failed to delete message");

      // Check for invalid receipt handle
      if (error && typeof error === "object" && "name" in error) {
        const awsError = error as { name: string };
        if (
          awsError.name === "ReceiptHandleIsInvalid" ||
          awsError.name === "InvalidReceiptHandle"
        ) {
          throw new SQSReceiptHandleError(
            `Invalid or expired receipt handle: ${error instanceof Error ? error.message : "Unknown error"}`,
            queueUrl,
            receiptHandle,
            "delete-message",
          );
        }
      }

      throw new SQSMessageError(
        `Failed to delete message: ${error instanceof Error ? error.message : String(error)}`,
        queueUrl,
        undefined,
        receiptHandle,
        "delete-message",
        error,
      );
    }
  }

  /**
   * Change message visibility timeout
   *
   * @param queueUrl - URL of the queue
   * @param receiptHandle - Receipt handle from received message
   * @param visibilityTimeout - New visibility timeout in seconds
   * @param config - Client configuration options
   * @returns Promise resolving when visibility is changed
   * @throws When visibility change fails
   */
  async changeMessageVisibility(
    queueUrl: string,
    receiptHandle: string,
    visibilityTimeout: number,
    config: AwsClientConfig = {},
  ): Promise<void> {
    const spinner = this.createSpinner("Changing message visibility...");

    try {
      const client = await this.getClient(config);
      const command = new ChangeMessageVisibilityCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: visibilityTimeout,
      });

      await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying change visibility (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Visibility timeout set to ${visibilityTimeout} seconds`);
    } catch (error) {
      spinner.fail("Failed to change visibility");

      // Check for invalid receipt handle
      if (error && typeof error === "object" && "name" in error) {
        const awsError = error as { name: string };
        if (
          awsError.name === "ReceiptHandleIsInvalid" ||
          awsError.name === "InvalidReceiptHandle"
        ) {
          throw new SQSReceiptHandleError(
            `Invalid or expired receipt handle: ${error instanceof Error ? error.message : "Unknown error"}`,
            queueUrl,
            receiptHandle,
            "change-visibility",
          );
        }
      }

      throw new SQSMessageError(
        `Failed to change message visibility: ${error instanceof Error ? error.message : String(error)}`,
        queueUrl,
        undefined,
        receiptHandle,
        "change-visibility",
        error,
      );
    }
  }

  /**
   * Send multiple messages in a batch
   *
   * @param queueUrl - URL of the queue
   * @param entries - Batch send entries (max 10)
   * @param config - Client configuration options
   * @returns Promise resolving to batch send results
   * @throws When batch send fails
   */
  async sendMessageBatch(
    queueUrl: string,
    entries: SendMessageBatchRequestEntry[],
    config: AwsClientConfig = {},
  ): Promise<SendMessageBatchResult> {
    const spinner = this.createSpinner(`Sending ${entries.length} messages...`);

    try {
      const client = await this.getClient(config);
      const command = new SendMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: entries,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying send batch (attempt ${attempt})...`;
        },
      });

      const successCount = response.Successful?.length || 0;
      const failCount = response.Failed?.length || 0;

      if (failCount > 0) {
        spinner.warn(`Sent ${successCount} messages, ${failCount} failed`);
      } else {
        spinner.succeed(`Sent ${successCount} messages`);
      }

      return response;
    } catch (error) {
      spinner.fail("Failed to send batch");
      throw new SQSBatchOperationError(
        `Failed to send message batch: ${error instanceof Error ? error.message : String(error)}`,
        "send-batch",
        undefined,
        undefined,
        entries,
        error,
        { queueUrl },
      );
    }
  }

  /**
   * Delete multiple messages in a batch
   *
   * @param queueUrl - URL of the queue
   * @param entries - Batch delete entries (max 10)
   * @param config - Client configuration options
   * @returns Promise resolving to batch delete results
   * @throws When batch delete fails
   */
  async deleteMessageBatch(
    queueUrl: string,
    entries: DeleteMessageBatchRequestEntry[],
    config: AwsClientConfig = {},
  ): Promise<DeleteMessageBatchResult> {
    const spinner = this.createSpinner(`Deleting ${entries.length} messages...`);

    try {
      const client = await this.getClient(config);
      const command = new DeleteMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: entries,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying delete batch (attempt ${attempt})...`;
        },
      });

      const successCount = response.Successful?.length || 0;
      const failCount = response.Failed?.length || 0;

      if (failCount > 0) {
        spinner.warn(`Deleted ${successCount} messages, ${failCount} failed`);
      } else {
        spinner.succeed(`Deleted ${successCount} messages`);
      }

      return response;
    } catch (error) {
      spinner.fail("Failed to delete batch");
      throw new SQSBatchOperationError(
        `Failed to delete message batch: ${error instanceof Error ? error.message : String(error)}`,
        "delete-batch",
        undefined,
        undefined,
        entries,
        error,
        { queueUrl },
      );
    }
  }

  /**
   * Change visibility timeout for multiple messages in a batch
   *
   * @param queueUrl - URL of the queue
   * @param entries - Batch visibility change entries (max 10)
   * @param config - Client configuration options
   * @returns Promise resolving to batch visibility change results
   * @throws When batch visibility change fails
   */
  async changeMessageVisibilityBatch(
    queueUrl: string,
    entries: ChangeMessageVisibilityBatchRequestEntry[],
    config: AwsClientConfig = {},
  ): Promise<ChangeMessageVisibilityBatchResult> {
    const spinner = this.createSpinner(`Changing visibility for ${entries.length} messages...`);

    try {
      const client = await this.getClient(config);
      const command = new ChangeMessageVisibilityBatchCommand({
        QueueUrl: queueUrl,
        Entries: entries,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying change visibility batch (attempt ${attempt})...`;
        },
      });

      const successCount = response.Successful?.length || 0;
      const failCount = response.Failed?.length || 0;

      if (failCount > 0) {
        spinner.warn(`Changed ${successCount} messages, ${failCount} failed`);
      } else {
        spinner.succeed(`Changed visibility for ${successCount} messages`);
      }

      return response;
    } catch (error) {
      spinner.fail("Failed to change visibility batch");
      throw new SQSBatchOperationError(
        `Failed to change visibility batch: ${error instanceof Error ? error.message : String(error)}`,
        "change-visibility-batch",
        undefined,
        undefined,
        entries,
        error,
        { queueUrl },
      );
    }
  }

  /**
   * List source queues for a dead letter queue
   *
   * @param queueUrl - URL of the dead letter queue
   * @param config - Client configuration options
   * @param maxResults - Maximum number of results
   * @param nextToken - Pagination token
   * @returns Promise resolving to source queue URLs
   * @throws When listing fails
   */
  async listDeadLetterSourceQueues(
    queueUrl: string,
    config: AwsClientConfig = {},
    maxResults?: number,
    nextToken?: string,
  ): Promise<ListDeadLetterSourceQueuesCommandOutput> {
    const spinner = this.createSpinner("Listing source queues...");

    try {
      const client = await this.getClient(config);
      const command = new ListDeadLetterSourceQueuesCommand({
        QueueUrl: queueUrl,
        MaxResults: maxResults,
        NextToken: nextToken,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying list source queues (attempt ${attempt})...`;
        },
      });

      const sourceCount = response.queueUrls?.length || 0;
      const sourcePlural = sourceCount === 1 ? "" : "s";
      spinner.succeed(`Found ${sourceCount} source queue${sourcePlural}`);

      return response;
    } catch (error) {
      spinner.fail("Failed to list source queues");
      throw new SQSDLQError(
        `Failed to list source queues: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        queueUrl,
        undefined,
        "list-sources",
        error,
      );
    }
  }

  /**
   * Start a message move task to redrive messages from DLQ
   *
   * @param sourceArn - ARN of the source queue (DLQ)
   * @param config - Client configuration options
   * @param destinationArn - Optional destination ARN (defaults to original source)
   * @param maxVelocity - Optional max messages per second
   * @returns Promise resolving to task handle
   * @throws When task start fails
   */
  async startMessageMoveTask(
    sourceArn: string,
    config: AwsClientConfig = {},
    destinationArn?: string,
    maxVelocity?: number,
  ): Promise<StartMessageMoveTaskCommandOutput> {
    const spinner = this.createSpinner("Starting message redrive...");

    try {
      const client = await this.getClient(config);
      const command = new StartMessageMoveTaskCommand({
        SourceArn: sourceArn,
        DestinationArn: destinationArn,
        MaxNumberOfMessagesPerSecond: maxVelocity,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying start redrive (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Redrive task started (handle: ${response.TaskHandle})`);
      return response;
    } catch (error) {
      spinner.fail("Failed to start redrive");
      throw new SQSDLQError(
        `Failed to start message move task: ${error instanceof Error ? error.message : String(error)}`,
        sourceArn,
        destinationArn,
        undefined,
        "start-redrive",
        error,
      );
    }
  }

  /**
   * List message move tasks for a source queue
   *
   * @param sourceArn - ARN of the source queue
   * @param config - Client configuration options
   * @param maxResults - Maximum number of results
   * @returns Promise resolving to task list
   * @throws When listing fails
   */
  async listMessageMoveTasks(
    sourceArn: string,
    config: AwsClientConfig = {},
    maxResults?: number,
  ): Promise<ListMessageMoveTasksCommandOutput> {
    const spinner = this.createSpinner("Listing redrive tasks...");

    try {
      const client = await this.getClient(config);
      const command = new ListMessageMoveTasksCommand({
        SourceArn: sourceArn,
        MaxResults: maxResults,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying list tasks (attempt ${attempt})...`;
        },
      });

      const taskCount = response.Results?.length || 0;
      const taskPlural = taskCount === 1 ? "" : "s";
      spinner.succeed(`Found ${taskCount} redrive task${taskPlural}`);

      return response;
    } catch (error) {
      spinner.fail("Failed to list tasks");
      throw new SQSDLQError(
        `Failed to list message move tasks: ${error instanceof Error ? error.message : String(error)}`,
        sourceArn,
        undefined,
        undefined,
        "list-tasks",
        error,
      );
    }
  }

  /**
   * Cancel an active message move task
   *
   * @param taskHandle - Handle of the task to cancel
   * @param config - Client configuration options
   * @returns Promise resolving when task is cancelled
   * @throws When cancellation fails
   */
  async cancelMessageMoveTask(
    taskHandle: string,
    config: AwsClientConfig = {},
  ): Promise<CancelMessageMoveTaskCommandOutput> {
    const spinner = this.createSpinner("Cancelling redrive task...");

    try {
      const client = await this.getClient(config);
      const command = new CancelMessageMoveTaskCommand({
        TaskHandle: taskHandle,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying cancel task (attempt ${attempt})...`;
        },
      });

      spinner.succeed("Redrive task cancelled");
      return response;
    } catch (error) {
      spinner.fail("Failed to cancel task");
      throw new SQSDLQError(
        `Failed to cancel message move task: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        undefined,
        taskHandle,
        "cancel-task",
        error,
      );
    }
  }
}
