/**
 * @module sqs/queues/get-url
 * SQS get queue URL command
 *
 * Retrieves the URL for a queue by its name.
 *
 */

import { Args, Flags } from "@oclif/core";
import { formatSQSError } from "../../../lib/sqs-errors.js";
import type { SQSGetQueueUrl } from "../../../lib/sqs-schemas.js";
import { SQSGetQueueUrlSchema } from "../../../lib/sqs-schemas.js";
import { SQSService } from "../../../services/sqs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SQS get queue URL command
 *
 * @public
 */
export default class SQSGetQueueUrlCommand extends BaseCommand {
  static override readonly description = "Get the URL for an SQS queue by name";

  static override readonly examples = [
    {
      description: "Get queue URL by name",
      command: "<%= config.bin %> <%= command.id %> my-queue",
    },
    {
      description: "Get queue URL with JSON output",
      command: "<%= config.bin %> <%= command.id %> my-queue --format json",
    },
  ];

  static override readonly args = {
    queueName: Args.string({
      description: "Name of the queue",
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

    "queue-owner-aws-account-id": Flags.string({
      description: "AWS account ID for cross-account access",
      helpValue: "ACCOUNT_ID",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output",
      default: false,
    }),
  };

  /**
   * Execute the SQS get queue URL command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SQSGetQueueUrlCommand);

    try {
      const input: SQSGetQueueUrl = SQSGetQueueUrlSchema.parse({
        queueName: args.queueName,
        queueOwnerAwsAccountId: flags["queue-owner-aws-account-id"],
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

      const response = await sqsService.getQueueUrl(
        input.queueName,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.queueOwnerAwsAccountId,
      );

      if (input.format === "table") {
        this.log(`\nQueue URL: ${response.QueueUrl}\n`);
      } else {
        this.displaySingleObject({ QueueUrl: response.QueueUrl }, input.format);
      }
    } catch (error) {
      const formattedError = formatSQSError(error, flags.verbose, "sqs:queues:get-url");
      this.error(formattedError, { exit: 1 });
    }
  }
}
