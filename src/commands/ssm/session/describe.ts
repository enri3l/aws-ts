/**
 * @module ssm/session/describe
 * SSM describe session command
 *
 * Shows detailed information about a specific Session Manager session.
 */

import type { Session } from "@aws-sdk/client-ssm";
import { Args } from "@oclif/core";
import {
  DescribeSessionsInputSchema,
  type DescribeSessionsInput,
} from "../../../lib/ssm/session-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import { SSMService } from "../../../services/ssm/ssm-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM describe session command
 *
 * @public
 */
export default class SSMSessionDescribeCommand extends BaseCommand {
  static override readonly description =
    "Show detailed information about a Session Manager session";

  static override readonly examples = [
    {
      description: "Describe a specific session",
      command: "<%= config.bin %> <%= command.id %> user-1234567890abcdef0",
    },
    {
      description: "Describe session with JSON output",
      command: "<%= config.bin %> <%= command.id %> user-1234567890abcdef0 --format json",
    },
  ];

  static override readonly args = {
    sessionId: Args.string({
      description: "Session ID to describe",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,
  };

  /**
   * Execute the SSM describe session command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SSMSessionDescribeCommand);

    try {
      const input: DescribeSessionsInput = DescribeSessionsInputSchema.parse({
        state: "History", // Query both active and history to find the session
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      const ssmService = new SSMService({
        enableDebugLogging: input.verbose || false,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      const session = await this.findSession(
        ssmService,
        args.sessionId,
        input.region,
        input.profile,
      );

      if (!session) {
        this.error(`Session not found: ${args.sessionId}`, { exit: 1 });
      }

      // Display session details
      if (input.format === "table") {
        this.displaySessionTable(session, input.verbose || false);
      } else {
        this.displaySingleObject(session, input.format);
      }
    } catch (error) {
      const formattedError = formatSSMError(error, flags.verbose, "ssm:session:describe");
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Find a session by ID in active or history state
   *
   * @param ssmService - SSM service instance
   * @param sessionId - Session ID to find
   * @param region - AWS region
   * @param profile - AWS profile
   * @returns Session information if found
   * @internal
   */
  private async findSession(
    ssmService: SSMService,
    sessionId: string,
    region?: string,
    profile?: string,
  ): Promise<Session | undefined> {
    // First try to find in active sessions
    const activeResponse = await ssmService.describeSessions(
      {
        ...(region && { region }),
        ...(profile && { profile }),
      },
      {
        state: "Active",
        filters: [
          {
            key: "SessionId",
            value: sessionId,
          },
        ],
      },
    );

    const session = activeResponse.Sessions?.[0];
    if (session) {
      return session;
    }

    // If not found in active, try history
    const historyResponse = await ssmService.describeSessions(
      {
        ...(region && { region }),
        ...(profile && { profile }),
      },
      {
        state: "History",
        filters: [
          {
            key: "SessionId",
            value: sessionId,
          },
        ],
      },
    );

    return historyResponse.Sessions?.[0];
  }

  /**
   * Display session information in table format
   *
   * @param session - Session information to display
   * @param verbose - Whether to show verbose output
   * @internal
   */
  private displaySessionTable(session: Session, verbose: boolean): void {
    this.log("\nSession Details:");
    this.log(`  Session ID: ${session.SessionId || "N/A"}`);
    this.log(`  Target: ${session.Target || "N/A"}`);
    this.log(`  Status: ${session.Status || "N/A"}`);
    this.log(`  Owner: ${session.Owner || "N/A"}`);
    this.log(`  Document Name: ${session.DocumentName || "N/A"}`);
    this.log(`  Start Date: ${session.StartDate?.toISOString() || "N/A"}`);
    this.log(`  End Date: ${session.EndDate?.toISOString() || "N/A"}`);

    if (session.Reason) {
      this.log(`  Reason: ${session.Reason}`);
    }

    if (session.Details) {
      this.log(`  Details: ${session.Details}`);
    }

    if (verbose && session.OutputUrl) {
      this.log(`  Output URL: ${JSON.stringify(session.OutputUrl, undefined, 2)}`);
    }

    this.log("");
  }
}
