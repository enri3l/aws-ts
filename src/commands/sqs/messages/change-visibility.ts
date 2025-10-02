/**
 * @module sqs/messages/change-visibility
 * SQS change message visibility command
 *
 * Changes the visibility timeout for a message in an SQS queue.
 *
 */

import { Args } from "@oclif/core";
import { formatSQSError } from "../../../lib/sqs-errors.js";
import type { SQSChangeMessageVisibility } from "../../../lib/sqs-schemas.js";
import { SQSChangeMessageVisibilitySchema } from "../../../lib/sqs-schemas.js";
import { SQSService } from "../../../services/sqs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SQS change message visibility command
 *
 * @public
 */
export default class SQSChangeMessageVisibilityCommand extends BaseCommand {
  static override readonly description = "Change visibility timeout for a message";

  static override readonly examples = [
    {
      description: "Extend visibility timeout to 60 seconds",
      command: "<%= config.bin %> <%= command.id %> <queue-url> <receipt-handle> 60",
    },
    {
      description: "Set visibility timeout to 5 minutes",
      command: "<%= config.bin %> <%= command.id %> <queue-url> <receipt-handle> 300",
    },
  ];

  static override readonly args = {
    queueUrl: Args.string({
      description: "Queue URL",
      required: true,
    }),
    receiptHandle: Args.string({
      description: "Receipt handle from ReceiveMessage",
      required: true,
    }),
    visibilityTimeout: Args.integer({
      description: "New visibility timeout in seconds",
      required: true,
      min: 0,
      max: 43_200,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,
  };

  /**
   * Execute the SQS change message visibility command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SQSChangeMessageVisibilityCommand);

    try {
      const input: SQSChangeMessageVisibility = SQSChangeMessageVisibilitySchema.parse({
        queueUrl: args.queueUrl,
        receiptHandle: args.receiptHandle,
        visibilityTimeout: args.visibilityTimeout,
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

      await sqsService.changeMessageVisibility(
        input.queueUrl,
        input.receiptHandle,
        input.visibilityTimeout,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      if (input.format === "table") {
        this.log(`\nVisibility timeout set to ${input.visibilityTimeout} seconds\n`);
      } else {
        this.displaySingleObject(
          { status: "updated", visibilityTimeout: input.visibilityTimeout },
          input.format,
        );
      }
    } catch (error) {
      const formattedError = formatSQSError(error, flags.verbose, "sqs:messages:change-visibility");
      this.error(formattedError, { exit: 1 });
    }
  }
}
