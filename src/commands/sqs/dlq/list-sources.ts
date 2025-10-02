/**
 * @module sqs/dlq/list-sources
 * SQS list dead letter source queues command
 *
 * Lists source queues that use a specific DLQ.
 *
 */

import { Args, Flags } from "@oclif/core";
import { formatSQSError } from "../../../lib/sqs-errors.js";
import type { SQSListDeadLetterSourceQueues } from "../../../lib/sqs-schemas.js";
import { SQSListDeadLetterSourceQueuesSchema } from "../../../lib/sqs-schemas.js";
import { SQSService } from "../../../services/sqs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SQS list dead letter source queues command
 *
 * @public
 */
export default class SQSListDeadLetterSourceQueuesCommand extends BaseCommand {
  static override readonly description = "List source queues for a dead letter queue";

  static override readonly args = {
    queueUrl: Args.string({
      description: "Dead letter queue URL",
      required: true,
    }),
  };

  static override readonly flags = {
    region: Flags.string({
      char: "r",
      description: "AWS region",
    }),
    profile: Flags.string({
      char: "p",
      description: "AWS profile",
    }),
    format: Flags.string({
      char: "f",
      description: "Output format",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),
    "max-results": Flags.integer({
      description: "Maximum results",
      min: 1,
      max: 1000,
    }),
    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output",
      default: false,
    }),
  };

  /**
   * Execute the SQS list dead letter source queues command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SQSListDeadLetterSourceQueuesCommand);

    try {
      const input: SQSListDeadLetterSourceQueues = SQSListDeadLetterSourceQueuesSchema.parse({
        queueUrl: args.queueUrl,
        maxResults: flags["max-results"],
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

      const response = await sqsService.listDeadLetterSourceQueues(
        input.queueUrl,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.maxResults,
      );

      const sources = response.queueUrls || [];

      if (input.format === "table") {
        this.log(`\nFound ${sources.length} source queues:\n`);
      }

      this.displayOutput(sources, input.format, {
        transform: (url: unknown) => ({ queueUrl: url as string }),
      });
    } catch (error) {
      const formattedError = formatSQSError(error, flags.verbose, "sqs:dlq:list-sources");
      this.error(formattedError, { exit: 1 });
    }
  }
}
