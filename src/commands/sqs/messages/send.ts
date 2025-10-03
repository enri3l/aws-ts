/**
 * @module sqs/messages/send
 * SQS send message command
 *
 * Sends a single message to an SQS queue.
 *
 */

import { Args, Flags } from "@oclif/core";
import { formatSQSError } from "../../../lib/sqs-errors.js";
import type { SQSSendMessage } from "../../../lib/sqs-schemas.js";
import { SQSSendMessageSchema } from "../../../lib/sqs-schemas.js";
import { SQSService } from "../../../services/sqs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SQS send message command
 *
 * @public
 */
export default class SQSSendMessageCommand extends BaseCommand {
  static override readonly description = "Send a message to an SQS queue";

  static override readonly examples = [
    {
      description: "Send a simple message",
      command: "<%= config.bin %> <%= command.id %> <queue-url> 'Hello, World!'",
    },
    {
      description: "Send with delay",
      command: "<%= config.bin %> <%= command.id %> <queue-url> 'message' --delay-seconds 10",
    },
    {
      description: "Send to FIFO queue",
      command:
        "<%= config.bin %> <%= command.id %> <queue-url> 'message' --message-group-id group1",
    },
  ];

  static override readonly args = {
    queueUrl: Args.string({
      description: "Queue URL",
      required: true,
    }),
    messageBody: Args.string({
      description: "Message body content",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "delay-seconds": Flags.integer({
      description: "Delay before message becomes visible",
      min: 0,
      max: 900,
    }),

    "message-group-id": Flags.string({
      description: "Message group ID (required for FIFO queues)",
    }),

    "message-deduplication-id": Flags.string({
      description: "Message deduplication ID (for FIFO queues)",
    }),
  };

  /**
   * Execute the SQS send message command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SQSSendMessageCommand);

    try {
      const input: SQSSendMessage = SQSSendMessageSchema.parse({
        queueUrl: args.queueUrl,
        messageBody: args.messageBody,
        delaySeconds: flags["delay-seconds"],
        messageGroupId: flags["message-group-id"],
        messageDeduplicationId: flags["message-deduplication-id"],
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

      const response = await sqsService.sendMessage(
        input.queueUrl,
        {
          messageBody: input.messageBody,
          ...(input.delaySeconds !== undefined && { delaySeconds: input.delaySeconds }),
          ...(input.messageGroupId !== undefined && { messageGroupId: input.messageGroupId }),
          ...(input.messageDeduplicationId !== undefined && {
            messageDeduplicationId: input.messageDeduplicationId,
          }),
        },
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      if (input.format === "table") {
        this.log(`\nMessage sent successfully!`);
        this.log(`Message ID: ${response.MessageId}`);
        if (response.MD5OfMessageBody) {
          this.log(`MD5: ${response.MD5OfMessageBody}\n`);
        }
      } else {
        this.displaySingleObject(
          {
            MessageId: response.MessageId,
            MD5OfMessageBody: response.MD5OfMessageBody,
          },
          input.format,
        );
      }
    } catch (error) {
      const formattedError = formatSQSError(error, flags.verbose, "sqs:messages:send");
      this.error(formattedError, { exit: 1 });
    }
  }
}
