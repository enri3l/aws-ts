/**
 * @module sqs/queues/list
 * SQS list queues command
 *
 * Lists all SQS queues in the specified region with optional filtering
 * and support for multiple output formats.
 *
 */

import { Flags } from "@oclif/core";
import { formatSQSError } from "../../../lib/sqs-errors.js";
import type { SQSListQueues } from "../../../lib/sqs-schemas.js";
import { SQSListQueuesSchema } from "../../../lib/sqs-schemas.js";
import { SQSService } from "../../../services/sqs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SQS list queues command for discovering available queues
 *
 * @public
 */
export default class SQSListQueuesCommand extends BaseCommand {
  static override readonly description = "List all SQS queues in the region";

  static override readonly examples = [
    {
      description: "List all queues in the current region",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "List queues with JSON output",
      command: "<%= config.bin %> <%= command.id %> --format json",
    },
    {
      description: "List queues starting with 'prod-'",
      command: "<%= config.bin %> <%= command.id %> --queue-name-prefix prod-",
    },
    {
      description: "List first 10 queues",
      command: "<%= config.bin %> <%= command.id %> --max-results 10",
    },
  ];

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

    "queue-name-prefix": Flags.string({
      description: "Filter queues by name prefix",
      helpValue: "PREFIX",
    }),

    "max-results": Flags.integer({
      description: "Maximum number of queues to return",
      min: 1,
      max: 1000,
      helpValue: "NUMBER",
    }),

    "next-token": Flags.string({
      description: "Pagination token from previous response",
      helpValue: "TOKEN",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output",
      default: false,
    }),
  };

  /**
   * Execute the SQS list queues command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(SQSListQueuesCommand);

    try {
      const input: SQSListQueues = SQSListQueuesSchema.parse({
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        queueNamePrefix: flags["queue-name-prefix"],
        maxResults: flags["max-results"],
        nextToken: flags["next-token"],
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

      const response = await sqsService.listQueues(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.queueNamePrefix,
        input.maxResults,
        input.nextToken,
      );

      const queues = response.QueueUrls || [];

      if (input.format === "table") {
        this.log(`Found ${queues.length} SQS queues:\n`);
      }

      this.displayOutput(queues, input.format, {
        transform: (url: unknown) => ({ queueUrl: url as string }),
      });

      if (response.NextToken && input.format === "table") {
        this.log(`\nMore results available. Use --next-token ${response.NextToken}`);
      }
    } catch (error) {
      const formattedError = formatSQSError(error, flags.verbose, "sqs:queues:list");
      this.error(formattedError, { exit: 1 });
    }
  }
}
