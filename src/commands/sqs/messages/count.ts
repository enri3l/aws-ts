/**
 * @module sqs/messages/count
 * SQS count messages command
 *
 * Gets approximate message counts for an SQS queue.
 *
 */

import { Args } from "@oclif/core";
import { formatSQSError } from "../../../lib/sqs-errors.js";
import type { SQSCountMessages } from "../../../lib/sqs-schemas.js";
import { SQSCountMessagesSchema } from "../../../lib/sqs-schemas.js";
import { SQSService } from "../../../services/sqs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SQS count messages command
 *
 * @public
 */
export default class SQSCountMessagesCommand extends BaseCommand {
  static override readonly description = "Get approximate message counts for a queue";

  static override readonly examples = [
    {
      description: "Get message counts",
      command: "<%= config.bin %> <%= command.id %> <queue-url>",
    },
    {
      description: "Get counts with JSON output",
      command: "<%= config.bin %> <%= command.id %> <queue-url> --format json",
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
  };

  /**
   * Execute the SQS count messages command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SQSCountMessagesCommand);

    try {
      const input: SQSCountMessages = SQSCountMessagesSchema.parse({
        queueUrl: args.queueUrl,
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

      const response = await sqsService.getQueueAttributes(
        input.queueUrl,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        [
          "ApproximateNumberOfMessages",
          "ApproximateNumberOfMessagesNotVisible",
          "ApproximateNumberOfMessagesDelayed",
        ],
      );

      const attributes = response.Attributes || {};
      const available = attributes.ApproximateNumberOfMessages || "0";
      const inFlight = attributes.ApproximateNumberOfMessagesNotVisible || "0";
      const delayed = attributes.ApproximateNumberOfMessagesDelayed || "0";

      const counts = {
        available: Number.parseInt(available, 10),
        inFlight: Number.parseInt(inFlight, 10),
        delayed: Number.parseInt(delayed, 10),
      };

      if (input.format === "table") {
        this.log(`\nApproximate Message Counts:\n`);
        this.log(`Available:  ${counts.available}`);
        this.log(`In-flight:  ${counts.inFlight}`);
        this.log(`Delayed:    ${counts.delayed}`);
        this.log(`Total:      ${counts.available + counts.inFlight + counts.delayed}\n`);
        this.log("Note: Counts are approximate and may lag actual values by ~1 minute\n");
      } else {
        this.displaySingleObject(counts, input.format);
      }
    } catch (error) {
      const formattedError = formatSQSError(error, flags.verbose, "sqs:messages:count");
      this.error(formattedError, { exit: 1 });
    }
  }
}
