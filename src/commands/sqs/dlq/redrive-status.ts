/**
 * @module sqs/dlq/redrive-status
 * SQS list message move tasks command
 *
 * Lists active and recent message move tasks for a source queue.
 *
 */

import { Args, Flags } from "@oclif/core";
import { formatSQSError } from "../../../lib/sqs-errors.js";
import type { SQSListMessageMoveTasks } from "../../../lib/sqs-schemas.js";
import { SQSListMessageMoveTasksSchema } from "../../../lib/sqs-schemas.js";
import { SQSService } from "../../../services/sqs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SQS list message move tasks command
 *
 * @public
 */
export default class SQSListMessageMoveTasksCommand extends BaseCommand {
  static override readonly description = "List redrive task status for a queue";

  static override readonly args = {
    sourceArn: Args.string({
      description: "Source queue ARN",
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
      max: 10,
    }),
    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output",
      default: false,
    }),
  };

  /**
   * Execute the SQS list message move tasks command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SQSListMessageMoveTasksCommand);

    try {
      const input: SQSListMessageMoveTasks = SQSListMessageMoveTasksSchema.parse({
        sourceArn: args.sourceArn,
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

      const response = await sqsService.listMessageMoveTasks(
        input.sourceArn,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.maxResults,
      );

      const tasks = response.Results || [];

      if (input.format === "table") {
        this.log(`\nFound ${tasks.length} redrive tasks:\n`);
      }

      this.displayOutput(tasks, input.format, {
        transform: (item: unknown) => item as Record<string, unknown>,
      });
    } catch (error) {
      const formattedError = formatSQSError(error, flags.verbose, "sqs:dlq:redrive-status");
      this.error(formattedError, { exit: 1 });
    }
  }
}
