/**
 * @module ssm/session/list
 * SSM list sessions command
 *
 * Lists active and terminated Session Manager sessions.
 */

import type { Session } from "@aws-sdk/client-ssm";
import { Flags } from "@oclif/core";
import {
  DescribeSessionsInputSchema,
  type DescribeSessionsInput,
} from "../../../lib/ssm/session-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import { SSMService } from "../../../services/ssm/ssm-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM list sessions command
 *
 * @public
 */
export default class SSMSessionListCommand extends BaseCommand {
  static override readonly description = "List Session Manager sessions with filtering";

  static override readonly examples = [
    {
      description: "List all active sessions",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "List session history",
      command: "<%= config.bin %> <%= command.id %> --state History",
    },
    {
      description: "List sessions with JSON output",
      command: "<%= config.bin %> <%= command.id %> --format json",
    },
    {
      description: "List sessions with pagination",
      command: "<%= config.bin %> <%= command.id %> --max-results 10",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    state: Flags.string({
      char: "s",
      description: "Session state to filter by",
      options: ["Active", "History"],
      default: "Active",
      helpValue: "STATE",
    }),

    "max-results": Flags.integer({
      description: "Maximum number of sessions to return",
      min: 1,
      max: 50,
      helpValue: "NUMBER",
    }),

    "next-token": Flags.string({
      description: "Pagination token for next page of results",
      helpValue: "TOKEN",
    }),
  };

  /**
   * Execute the SSM list sessions command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(SSMSessionListCommand);

    try {
      const input: DescribeSessionsInput = DescribeSessionsInputSchema.parse({
        state: flags.state,
        maxResults: flags["max-results"],
        nextToken: flags["next-token"],
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      const ssmService = new SSMService({
        enableDebugLogging: input.verbose ?? false,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      const response = await ssmService.describeSessions(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          state: input.state,
          ...(input.maxResults && { maxResults: input.maxResults }),
          ...(input.nextToken && { nextToken: input.nextToken }),
        },
      );

      const sessions = response.Sessions || [];

      // Display sessions with proper formatting
      this.displayOutput(sessions, input.format, {
        transform: (session: unknown) => {
          const s = session as Session;
          return {
            SessionId: s.SessionId || "N/A",
            Target: s.Target || "N/A",
            Status: s.Status || "N/A",
            StartDate: s.StartDate?.toISOString() || "N/A",
            EndDate: s.EndDate?.toISOString() || "N/A",
            Owner: s.Owner || "N/A",
            DocumentName: s.DocumentName || "N/A",
          };
        },
        emptyMessage: `No ${input.state.toLowerCase()} sessions found`,
      });

      // Show pagination token if available
      if (response.NextToken && input.format === "table") {
        this.log(
          `\nMore results available. Use --next-token "${response.NextToken}" to fetch next page.`,
        );
      }
    } catch (error) {
      const formattedError = formatSSMError(error, flags.verbose, "ssm:session:list");
      this.error(formattedError, { exit: 1 });
    }
  }
}
