/**
 * @module sqs/queues/describe
 * SQS describe queue command
 *
 * Retrieves detailed attributes for an SQS queue.
 *
 */

import { Args } from "@oclif/core";
import { formatSQSError } from "../../../lib/sqs-errors.js";
import type { SQSDescribeQueue } from "../../../lib/sqs-schemas.js";
import { SQSDescribeQueueSchema } from "../../../lib/sqs-schemas.js";
import { SQSService } from "../../../services/sqs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SQS describe queue command
 *
 * @public
 */
export default class SQSDescribeQueueCommand extends BaseCommand {
  static override readonly description = "Get detailed attributes for an SQS queue";

  static override readonly examples = [
    {
      description: "Describe a queue",
      command:
        "<%= config.bin %> <%= command.id %> https://sqs.us-east-1.amazonaws.com/123456789012/my-queue",
    },
    {
      description: "Describe with JSON output",
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
   * Execute the SQS describe queue command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SQSDescribeQueueCommand);

    try {
      const input: SQSDescribeQueue = SQSDescribeQueueSchema.parse({
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

      const response = await sqsService.getQueueAttributes(input.queueUrl, {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      });

      const attributes = response.Attributes || {};

      if (input.format === "table") {
        this.log(`\nQueue Attributes:\n`);
        const attributeData = Object.entries(attributes).map(([key, value]) => ({
          attribute: key,
          value: value,
        }));
        this.displayOutput(attributeData, "table", {
          transform: (item: unknown) => item as Record<string, unknown>,
        });
      } else {
        this.displaySingleObject(attributes, input.format);
      }
    } catch (error) {
      const formattedError = formatSQSError(error, flags.verbose, "sqs:queues:describe");
      this.error(formattedError, { exit: 1 });
    }
  }
}
