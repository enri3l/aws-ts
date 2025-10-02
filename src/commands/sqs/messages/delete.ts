/**
 * @module sqs/messages/delete
 * SQS delete message command
 *
 * Deletes a message from an SQS queue using its receipt handle.
 *
 */

import { Args, Flags } from "@oclif/core";
import { formatSQSError } from "../../../lib/sqs-errors.js";
import type { SQSDeleteMessage } from "../../../lib/sqs-schemas.js";
import { SQSDeleteMessageSchema } from "../../../lib/sqs-schemas.js";
import { SQSService } from "../../../services/sqs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SQS delete message command
 *
 * @public
 */
export default class SQSDeleteMessageCommand extends BaseCommand {
  static override readonly description = "Delete a message from an SQS queue";

  static override readonly examples = [
    {
      description: "Delete a message",
      command: "<%= config.bin %> <%= command.id %> <queue-url> <receipt-handle>",
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

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output",
      default: false,
    }),
  };

  /**
   * Execute the SQS delete message command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SQSDeleteMessageCommand);

    try {
      const input: SQSDeleteMessage = SQSDeleteMessageSchema.parse({
        queueUrl: args.queueUrl,
        receiptHandle: args.receiptHandle,
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

      await sqsService.deleteMessage(input.queueUrl, input.receiptHandle, {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      });

      if (input.format === "table") {
        this.log("\nMessage deleted successfully\n");
      } else {
        this.displaySingleObject({ status: "deleted" }, input.format);
      }
    } catch (error) {
      const formattedError = formatSQSError(error, flags.verbose, "sqs:messages:delete");
      this.error(formattedError, { exit: 1 });
    }
  }
}
