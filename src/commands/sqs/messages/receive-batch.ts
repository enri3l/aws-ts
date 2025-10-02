/**
 * @module sqs/messages/receive-batch
 * SQS receive message batch command
 *
 * Continuously receives messages from an SQS queue with streaming output.
 *
 */

import { Args, Flags } from "@oclif/core";
import { formatSQSError } from "../../../lib/sqs-errors.js";
import type { SQSReceiveMessageBatch } from "../../../lib/sqs-schemas.js";
import { SQSReceiveMessageBatchSchema } from "../../../lib/sqs-schemas.js";
import { SQSService } from "../../../services/sqs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SQS receive message batch command
 *
 * @public
 */
export default class SQSReceiveMessageBatchCommand extends BaseCommand {
  static override readonly description = "Continuously receive messages from an SQS queue";

  static override readonly examples = [
    {
      description: "Receive up to 10 batches",
      command: "<%= config.bin %> <%= command.id %> <queue-url> --max-batches 10",
    },
  ];

  static override readonly args = {
    queueUrl: Args.string({
      description: "Queue URL",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "max-batches": Flags.integer({
      description: "Maximum number of batches to receive",
      min: 1,
    }),
    "batch-size": Flags.integer({
      description: "Messages per batch (1-10)",
      min: 1,
      max: 10,
      default: 10,
    }),
    "wait-time-seconds": Flags.integer({
      description: "Long polling wait time",
      min: 0,
      max: 20,
      default: 20,
    }),
  };

  /**
   * Execute the SQS receive message batch command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SQSReceiveMessageBatchCommand);

    try {
      const input: SQSReceiveMessageBatch = SQSReceiveMessageBatchSchema.parse({
        queueUrl: args.queueUrl,
        maxBatches: flags["max-batches"],
        batchSize: flags["batch-size"],
        waitTimeSeconds: flags["wait-time-seconds"],
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      const sqsService = new SQSService({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      let batchCount = 0;
      const maxBatches = input.maxBatches || Number.POSITIVE_INFINITY;
      let totalMessages = 0;

      while (batchCount < maxBatches) {
        const response = await sqsService.receiveMessage(
          input.queueUrl,
          {
            maxNumberOfMessages: input.batchSize,
            waitTimeSeconds: input.waitTimeSeconds,
          },
          {
            ...(input.region && { region: input.region }),
            ...(input.profile && { profile: input.profile }),
          },
        );

        const messages = response.Messages || [];
        if (messages.length === 0) break;

        totalMessages += messages.length;

        // Stream output
        for (const message of messages) {
          if (input.format === "jsonl") {
            this.log(JSON.stringify(message));
          } else {
            this.displayOutput([message], input.format, {
              transform: (item: unknown) => item as Record<string, unknown>,
            });
          }
        }

        batchCount++;
      }

      if (input.format === "table") {
        this.log(`\nReceived ${totalMessages} messages in ${batchCount} batches\n`);
      }
    } catch (error) {
      const formattedError = formatSQSError(error, flags.verbose, "sqs:messages:receive-batch");
      this.error(formattedError, { exit: 1 });
    }
  }
}
