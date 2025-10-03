/**
 * @module sqs/messages/delete-batch
 * SQS delete message batch command
 *
 * Deletes multiple messages from an SQS queue using receipt handles from a file.
 *
 */

import { Args, Flags } from "@oclif/core";
import path from "node:path";
import { BatchProcessor } from "../../../lib/batch-processor.js";
import { DataFormat, DataProcessor } from "../../../lib/data-processing.js";
import { formatSQSError } from "../../../lib/sqs-errors.js";
import type { SQSDeleteMessageBatch } from "../../../lib/sqs-schemas.js";
import { SQSDeleteMessageBatchSchema } from "../../../lib/sqs-schemas.js";
import { SQSService } from "../../../services/sqs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SQS delete message batch command
 *
 * @public
 */
export default class SQSDeleteMessageBatchCommand extends BaseCommand {
  static override readonly description = "Delete multiple messages from an SQS queue";

  static override readonly examples = [
    {
      description: "Delete messages from JSONL file",
      command: "<%= config.bin %> <%= command.id %> <queue-url> receipts.jsonl",
    },
  ];

  static override readonly args = {
    queueUrl: Args.string({
      description: "Queue URL",
      required: true,
    }),
    inputFile: Args.string({
      description: "Input file with receipt handles",
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
  };

  /**
   * Execute the SQS delete message batch command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SQSDeleteMessageBatchCommand);

    try {
      const input: SQSDeleteMessageBatch = SQSDeleteMessageBatchSchema.parse({
        queueUrl: args.queueUrl,
        inputFile: args.inputFile,
        batchSize: flags["batch-size"],
        maxConcurrency: flags["max-concurrency"],
        maxRetries: 3,
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      const handles = await this.loadInputFile(input.inputFile);

      const sqsService = new SQSService({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      const processor = new BatchProcessor<Record<string, unknown>, unknown>(
        {
          maxRetries: 3,
          batchSize: input.batchSize,
          maxConcurrency: input.maxConcurrency,
          verbose: input.verbose,
        },
        (message) => this.log(message),
      );

      const result = await processor.process(handles, async (batch) => {
        const entries = batch.map((item, index) => ({
          Id: `msg-${index}`,
          ReceiptHandle: (item.ReceiptHandle as string) || JSON.stringify(item),
        }));

        const response = await sqsService.deleteMessageBatch(input.queueUrl, entries, {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        });

        const successCount = response.Successful?.length || 0;
        const failedIds = new Set((response.Failed || []).map((f) => f.Id));
        const unprocessed = batch.filter((_, index) => failedIds.has(`msg-${index}`));

        return { processed: batch.slice(0, successCount), unprocessed };
      });

      this.log(
        `\nBatch delete complete: ${result.processed.length} deleted, ${result.failed.length} failed\n`,
      );
    } catch (error) {
      const formattedError = formatSQSError(error, flags.verbose, "sqs:messages:delete-batch");
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
