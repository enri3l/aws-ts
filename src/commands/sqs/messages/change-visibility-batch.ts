/**
 * @module sqs/messages/change-visibility-batch
 * SQS change message visibility batch command
 *
 * Changes visibility timeout for multiple messages from a file.
 *
 */

import { Args, Flags } from "@oclif/core";
import path from "node:path";
import { BatchProcessor } from "../../../lib/batch-processor.js";
import { DataFormat, DataProcessor } from "../../../lib/data-processing.js";
import { formatSQSError } from "../../../lib/sqs-errors.js";
import type { SQSChangeMessageVisibilityBatch } from "../../../lib/sqs-schemas.js";
import { SQSChangeMessageVisibilityBatchSchema } from "../../../lib/sqs-schemas.js";
import { SQSService } from "../../../services/sqs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SQS change message visibility batch command
 *
 * @public
 */
export default class SQSChangeMessageVisibilityBatchCommand extends BaseCommand {
  static override readonly description = "Change visibility timeout for multiple messages";

  static override readonly args = {
    queueUrl: Args.string({
      description: "Queue URL",
      required: true,
    }),
    inputFile: Args.string({
      description: "Input file with receipt handles and timeouts",
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
  };

  /**
   * Execute the SQS change message visibility batch command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SQSChangeMessageVisibilityBatchCommand);

    try {
      const input: SQSChangeMessageVisibilityBatch = SQSChangeMessageVisibilityBatchSchema.parse({
        queueUrl: args.queueUrl,
        inputFile: args.inputFile,
        batchSize: flags["batch-size"],
        maxConcurrency: 10,
        maxRetries: 3,
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      const items = await this.loadInputFile(input.inputFile);

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
          maxConcurrency: 10,
          verbose: input.verbose,
        },
        (message) => this.log(message),
      );

      const result = await processor.process(items, async (batch) => {
        const entries = batch.map((item, index) => ({
          Id: `msg-${index}`,
          ReceiptHandle: item.ReceiptHandle as string,
          VisibilityTimeout: item.VisibilityTimeout as number,
        }));

        const response = await sqsService.changeMessageVisibilityBatch(input.queueUrl, entries, {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        });

        const successCount = response.Successful?.length || 0;
        const failedIds = new Set((response.Failed || []).map((f) => f.Id));
        const unprocessed = batch.filter((_, index) => failedIds.has(`msg-${index}`));

        return { processed: batch.slice(0, successCount), unprocessed };
      });

      this.log(
        `\nBatch visibility change complete: ${result.processed.length} updated, ${result.failed.length} failed\n`,
      );
    } catch (error) {
      const formattedError = formatSQSError(
        error,
        flags.verbose,
        "sqs:messages:change-visibility-batch",
      );
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
