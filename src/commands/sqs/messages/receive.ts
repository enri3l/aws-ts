/**
 * @module sqs/messages/receive
 * SQS receive message command
 *
 * Receives messages from an SQS queue with long polling support.
 *
 */

import { Args, Flags } from "@oclif/core";
import { formatSQSError } from "../../../lib/sqs-errors.js";
import type { SQSReceiveMessage } from "../../../lib/sqs-schemas.js";
import { SQSReceiveMessageSchema } from "../../../lib/sqs-schemas.js";
import { SQSService } from "../../../services/sqs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SQS receive message command
 *
 * @public
 */
export default class SQSReceiveMessageCommand extends BaseCommand {
  static override readonly description = "Receive messages from an SQS queue";

  static override readonly examples = [
    {
      description: "Receive a single message",
      command: "<%= config.bin %> <%= command.id %> <queue-url>",
    },
    {
      description: "Receive up to 10 messages",
      command: "<%= config.bin %> <%= command.id %> <queue-url> --max-messages 10",
    },
    {
      description: "Receive with 20-second long polling",
      command: "<%= config.bin %> <%= command.id %> <queue-url> --wait-time-seconds 20",
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

    "max-messages": Flags.integer({
      description: "Maximum number of messages to receive",
      min: 1,
      max: 10,
      default: 1,
    }),

    "wait-time-seconds": Flags.integer({
      description: "Long polling wait time",
      min: 0,
      max: 20,
      default: 20,
    }),

    "visibility-timeout": Flags.integer({
      description: "Visibility timeout for received messages",
      min: 0,
      max: 43_200,
    }),
  };

  /**
   * Execute the SQS receive message command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SQSReceiveMessageCommand);

    try {
      const input: SQSReceiveMessage = SQSReceiveMessageSchema.parse({
        queueUrl: args.queueUrl,
        maxMessages: flags["max-messages"],
        waitTimeSeconds: flags["wait-time-seconds"],
        visibilityTimeout: flags["visibility-timeout"],
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

      const response = await sqsService.receiveMessage(
        input.queueUrl,
        {
          maxNumberOfMessages: input.maxMessages,
          waitTimeSeconds: input.waitTimeSeconds,
          ...(input.visibilityTimeout !== undefined && {
            visibilityTimeout: input.visibilityTimeout,
          }),
        },
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      const messages = response.Messages || [];

      if (messages.length === 0) {
        this.log("No messages available");
        return;
      }

      if (input.format === "table") {
        this.log(`\nReceived ${messages.length} message${messages.length === 1 ? "" : "s"}:\n`);
      }

      this.displayOutput(messages, input.format, {
        transform: (item: unknown) => item as Record<string, unknown>,
      });
    } catch (error) {
      const formattedError = formatSQSError(error, flags.verbose, "sqs:messages:receive");
      this.error(formattedError, { exit: 1 });
    }
  }
}
