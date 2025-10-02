/**
 * @module sqs/queues/create
 * SQS create queue command
 *
 * Creates a new SQS queue with optional attributes and tags.
 *
 */

import { Args, Flags } from "@oclif/core";
import { formatSQSError } from "../../../lib/sqs-errors.js";
import type { SQSCreateQueue } from "../../../lib/sqs-schemas.js";
import { SQSCreateQueueSchema } from "../../../lib/sqs-schemas.js";
import { SQSService } from "../../../services/sqs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SQS create queue command
 *
 * @public
 */
export default class SQSCreateQueueCommand extends BaseCommand {
  static override readonly description = "Create a new SQS queue";

  static override readonly examples = [
    {
      description: "Create a standard queue",
      command: "<%= config.bin %> <%= command.id %> my-queue",
    },
    {
      description: "Create a FIFO queue",
      command: "<%= config.bin %> <%= command.id %> my-queue.fifo --fifo",
    },
    {
      description: "Create with custom visibility timeout",
      command: "<%= config.bin %> <%= command.id %> my-queue --visibility-timeout 60",
    },
  ];

  static override readonly args = {
    queueName: Args.string({
      description: "Name of the queue to create",
      required: true,
    }),
  };

  static override readonly flags = {
    region: Flags.string({
      char: "r",
      description: "AWS region",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    fifo: Flags.boolean({
      description: "Create FIFO queue",
      default: false,
    }),

    "visibility-timeout": Flags.integer({
      description: "Visibility timeout in seconds",
      min: 0,
      max: 43_200,
    }),

    "message-retention-period": Flags.integer({
      description: "Message retention period in seconds",
      min: 60,
      max: 1_209_600,
    }),

    "receive-wait-time": Flags.integer({
      description: "Receive message wait time for long polling",
      min: 0,
      max: 20,
    }),

    "delay-seconds": Flags.integer({
      description: "Delay for all messages in seconds",
      min: 0,
      max: 900,
    }),

    "kms-key-id": Flags.string({
      description: "KMS key ID for encryption",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output",
      default: false,
    }),
  };

  /**
   * Execute the SQS create queue command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SQSCreateQueueCommand);

    try {
      const input: SQSCreateQueue = SQSCreateQueueSchema.parse({
        queueName: args.queueName,
        fifo: flags.fifo,
        visibilityTimeout: flags["visibility-timeout"],
        messageRetentionPeriod: flags["message-retention-period"],
        receiveWaitTime: flags["receive-wait-time"],
        delaySeconds: flags["delay-seconds"],
        kmsKeyId: flags["kms-key-id"],
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      const attributes: Record<string, string> = {};

      if (input.visibilityTimeout !== undefined) {
        attributes.VisibilityTimeout = input.visibilityTimeout.toString();
      }
      if (input.messageRetentionPeriod !== undefined) {
        attributes.MessageRetentionPeriod = input.messageRetentionPeriod.toString();
      }
      if (input.receiveWaitTime !== undefined) {
        attributes.ReceiveMessageWaitTimeSeconds = input.receiveWaitTime.toString();
      }
      if (input.delaySeconds !== undefined) {
        attributes.DelaySeconds = input.delaySeconds.toString();
      }
      if (input.kmsKeyId) {
        attributes.KmsMasterKeyId = input.kmsKeyId;
      }
      if (input.fifo) {
        attributes.FifoQueue = "true";
      }

      const sqsService = new SQSService({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      const response = await sqsService.createQueue(
        {
          queueName: input.queueName,
          ...(Object.keys(attributes).length > 0 && { attributes }),
        },
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      if (input.format === "table") {
        this.log(`\nQueue created successfully!`);
        this.log(`Queue URL: ${response.QueueUrl}\n`);
      } else {
        this.displaySingleObject({ QueueUrl: response.QueueUrl }, input.format);
      }
    } catch (error) {
      const formattedError = formatSQSError(error, flags.verbose, "sqs:queues:create");
      this.error(formattedError, { exit: 1 });
    }
  }
}
