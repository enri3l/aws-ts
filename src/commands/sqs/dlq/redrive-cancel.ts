/**
 * @module sqs/dlq/redrive-cancel
 * SQS cancel message move task command
 *
 * Cancels an active message redrive task.
 *
 */

import { Args } from "@oclif/core";
import { formatSQSError } from "../../../lib/sqs-errors.js";
import type { SQSCancelMessageMoveTask } from "../../../lib/sqs-schemas.js";
import { SQSCancelMessageMoveTaskSchema } from "../../../lib/sqs-schemas.js";
import { SQSService } from "../../../services/sqs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SQS cancel message move task command
 *
 * @public
 */
export default class SQSCancelMessageMoveTaskCommand extends BaseCommand {
  static override readonly description = "Cancel an active message redrive task";

  static override readonly args = {
    taskHandle: Args.string({
      description: "Task handle from redrive command",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,
  };

  /**
   * Execute the SQS cancel message move task command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SQSCancelMessageMoveTaskCommand);

    try {
      const input: SQSCancelMessageMoveTask = SQSCancelMessageMoveTaskSchema.parse({
        taskHandle: args.taskHandle,
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

      await sqsService.cancelMessageMoveTask(input.taskHandle, {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      });

      if (input.format === "table") {
        this.log(`\nRedrive task cancelled successfully\n`);
      } else {
        this.displaySingleObject(
          { status: "cancelled", taskHandle: input.taskHandle },
          input.format,
        );
      }
    } catch (error) {
      const formattedError = formatSQSError(error, flags.verbose, "sqs:dlq:redrive-cancel");
      this.error(formattedError, { exit: 1 });
    }
  }
}
