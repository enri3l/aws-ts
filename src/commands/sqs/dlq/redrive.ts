/**
 * @module sqs/dlq/redrive
 * SQS start message redrive command
 *
 * Starts a message move task to redrive messages from a DLQ.
 *
 */

import { Args, Flags } from "@oclif/core";
import { formatSQSError } from "../../../lib/sqs-errors.js";
import type { SQSStartMessageMoveTask } from "../../../lib/sqs-schemas.js";
import { SQSStartMessageMoveTaskSchema } from "../../../lib/sqs-schemas.js";
import { SQSService } from "../../../services/sqs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SQS start message redrive command
 *
 * @public
 */
export default class SQSStartMessageMoveTaskCommand extends BaseCommand {
  static override readonly description = "Start message redrive from DLQ to source queue";

  static override readonly args = {
    sourceArn: Args.string({
      description: "Source queue ARN (DLQ)",
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
    "destination-arn": Flags.string({
      description: "Destination ARN (defaults to original source)",
    }),
    "max-velocity": Flags.integer({
      description: "Max messages per second",
      min: 1,
    }),
    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output",
      default: false,
    }),
  };

  /**
   * Execute the SQS start message move task command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SQSStartMessageMoveTaskCommand);

    try {
      const input: SQSStartMessageMoveTask = SQSStartMessageMoveTaskSchema.parse({
        sourceArn: args.sourceArn,
        destinationArn: flags["destination-arn"],
        maxVelocity: flags["max-velocity"],
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

      const response = await sqsService.startMessageMoveTask(
        input.sourceArn,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.destinationArn,
        input.maxVelocity,
      );

      if (input.format === "table") {
        this.log(`\nRedrive task started successfully!`);
        this.log(`Task handle: ${response.TaskHandle}\n`);
      } else {
        this.displaySingleObject({ TaskHandle: response.TaskHandle }, input.format);
      }
    } catch (error) {
      const formattedError = formatSQSError(error, flags.verbose, "sqs:dlq:redrive");
      this.error(formattedError, { exit: 1 });
    }
  }
}
