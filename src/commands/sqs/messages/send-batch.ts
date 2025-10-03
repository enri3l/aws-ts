/**
 * @module sqs/messages/send-batch
 * SQS send message batch command
 *
 * Sends multiple messages to an SQS queue from a file with automatic batching.
 *
 */

import { Args, Flags } from "@oclif/core";
import path from "node:path";
import { BatchProcessor } from "../../../lib/batch-processor.js";
import { DataFormat, DataProcessor } from "../../../lib/data-processing.js";
import { formatSQSError } from "../../../lib/sqs-errors.js";
import type { SQSSendMessageBatch } from "../../../lib/sqs-schemas.js";
import { SQSSendMessageBatchSchema } from "../../../lib/sqs-schemas.js";
import { SQSService } from "../../../services/sqs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SQS send message batch command
 *
 * @public
 */
export default class SQSSendMessageBatchCommand extends BaseCommand {
  static override readonly description = "Send multiple messages to an SQS queue from a file";

  static override readonly examples = [
    {
      description: "Send messages from JSON file",
      command: "<%= config.bin %> <%= command.id %> <queue-url> messages.json",
    },
    {
      description: "Send from JSONL with custom batch size",
      command: "<%= config.bin %> <%= command.id %> <queue-url> messages.jsonl --batch-size 10",
    },
  ];

  static override readonly args = {
    queueUrl: Args.string({
      description: "Queue URL",
      required: true,
    }),
    inputFile: Args.string({
      description: "Input file (JSON, JSONL, or CSV)",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "batch-size": Flags.integer({
      description: "Batch size (1-10)",
      min: 1,
      max: 10,
      default: 10,
    }),
    "max-concurrency": Flags.integer({
      description: "Maximum concurrent batches",
      min: 1,
      max: 20,
      default: 10,
    }),
    "max-retries": Flags.integer({
      description: "Maximum retry attempts",
      min: 0,
      max: 10,
      default: 3,
    }),
  };

  /**
   * Execute the SQS send message batch command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SQSSendMessageBatchCommand);

    try {
      const input: SQSSendMessageBatch = SQSSendMessageBatchSchema.parse({
        queueUrl: args.queueUrl,
        inputFile: args.inputFile,
        batchSize: flags["batch-size"],
        maxConcurrency: flags["max-concurrency"],
        maxRetries: flags["max-retries"],
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      // Load messages from file
      const messages = await this.loadInputFile(input.inputFile);

      const sqsService = new SQSService({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      // Create batch processor
      const processor = new BatchProcessor<Record<string, unknown>, unknown>(
        {
          maxRetries: input.maxRetries,
          batchSize: input.batchSize,
          maxConcurrency: input.maxConcurrency,
          verbose: input.verbose,
        },
        (message) => this.log(message),
      );

      // Process messages in batches
      const result = await processor.process(messages, async (batch) => {
        const entries = batch.map((message, index) => ({
          Id: `msg-${index}`,
          MessageBody:
            typeof message.MessageBody === "string" ? message.MessageBody : JSON.stringify(message),
          MessageGroupId: message.MessageGroupId as string | undefined,
          MessageDeduplicationId: message.MessageDeduplicationId as string | undefined,
        }));

        const response = await sqsService.sendMessageBatch(input.queueUrl, entries, {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        });

        const successCount = response.Successful?.length || 0;
        const failedIds = new Set((response.Failed || []).map((f) => f.Id));
        const unprocessed = batch.filter((_, index) => failedIds.has(`msg-${index}`));

        return {
          processed: batch.slice(0, successCount),
          unprocessed,
        };
      });

      this.log(
        `\nBatch send complete: ${result.processed.length} sent, ${result.failed.length} failed\n`,
      );
    } catch (error) {
      const formattedError = formatSQSError(error, flags.verbose, "sqs:messages:send-batch");
      this.error(formattedError, { exit: 1 });
    }
  }

  private async loadInputFile(filePath: string): Promise<Record<string, unknown>[]> {
    const fs = await import("node:fs/promises");
    const fileContent = await fs.readFile(filePath, "utf8");

    const extension = path.extname(filePath);
    let format: DataFormat;
    if (extension === ".csv") {
      format = DataFormat.CSV;
    } else if (extension === ".jsonl") {
      format = DataFormat.JSONL;
    } else {
      format = DataFormat.JSON;
    }

    const processor = new DataProcessor({ format });
    const result = processor.parseInput(fileContent, format);
    return result.records.map((record) => record.data);
  }
}
