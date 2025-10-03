/**
 * @module sqs/queues/delete
 * SQS delete queue command
 *
 * Deletes an SQS queue with confirmation prompt for safety.
 *
 */

import { Args, Flags } from "@oclif/core";
import { formatSQSError } from "../../../lib/sqs-errors.js";
import type { SQSDeleteQueue } from "../../../lib/sqs-schemas.js";
import { SQSDeleteQueueSchema } from "../../../lib/sqs-schemas.js";
import { SQSService } from "../../../services/sqs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SQS delete queue command
 *
 * @public
 */
export default class SQSDeleteQueueCommand extends BaseCommand {
  static override readonly description = "Delete an SQS queue";

  static override readonly examples = [
    {
      description: "Delete a queue with confirmation",
      command:
        "<%= config.bin %> <%= command.id %> https://sqs.us-east-1.amazonaws.com/123456789012/my-queue",
    },
    {
      description: "Delete without confirmation",
      command: "<%= config.bin %> <%= command.id %> <queue-url> --force",
    },
  ];

  static override readonly args = {
    queueUrl: Args.string({
      description: "Queue URL to delete",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    force: Flags.boolean({
      description: "Skip confirmation prompt",
      default: false,
    }),
  };

  /**
   * Execute the SQS delete queue command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SQSDeleteQueueCommand);

    try {
      const input: SQSDeleteQueue = SQSDeleteQueueSchema.parse({
        queueUrl: args.queueUrl,
        force: flags.force,
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      // Confirmation prompt unless --force is used
      if (!flags.force) {
        const confirmed = await this.confirmDeletion(input.queueUrl);

        if (!confirmed) {
          this.log("Queue deletion cancelled");
          return;
        }
      }

      const sqsService = new SQSService({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      await sqsService.deleteQueue(input.queueUrl, {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      });

      if (input.format === "table") {
        this.log(`\nQueue deleted successfully`);
        this.log(`Note: Queue deletion has a 60-second propagation delay\n`);
      } else {
        this.displaySingleObject({ status: "deleted", queueUrl: input.queueUrl }, input.format);
      }
    } catch (error) {
      const formattedError = formatSQSError(error, flags.verbose, "sqs:queues:delete");
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Prompt user to confirm queue deletion
   *
   * @param queueUrl - URL of the queue to delete
   * @returns Promise resolving to true if confirmed, false otherwise
   */
  private async confirmDeletion(queueUrl: string): Promise<boolean> {
    this.log(`You are about to delete queue: ${queueUrl}`);
    this.log("This action cannot be undone.");
    this.log("");

    const readline = await import("node:readline");
    const readlineInterface = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const confirmed = await new Promise<boolean>((resolve) => {
      readlineInterface.question("Type 'yes' to confirm: ", (answer) => {
        readlineInterface.close();
        resolve(answer.toLowerCase() === "yes");
      });
    });

    return confirmed;
  }
}
