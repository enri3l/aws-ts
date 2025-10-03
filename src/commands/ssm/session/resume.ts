/**
 * @module ssm/session/resume
 * SSM resume session command
 *
 * Resumes a disconnected Session Manager session after network interruption.
 * Only works for sessions in "Disconnected" state, not "Terminated" sessions.
 */

import { Args } from "@oclif/core";
import {
  ResumeSessionInputSchema,
  type ResumeSessionInput,
} from "../../../lib/ssm/session-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import { SSMService } from "../../../services/ssm/ssm-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM resume session command
 *
 * @public
 */
export default class SSMSessionResumeCommand extends BaseCommand {
  static override readonly description =
    "Resume a disconnected Session Manager session after network interruption";

  static override readonly examples = [
    {
      description: "Resume a disconnected session",
      command: "<%= config.bin %> <%= command.id %> user-1234567890abcdef0",
    },
    {
      description: "Resume session with verbose output",
      command: "<%= config.bin %> <%= command.id %> user-1234567890abcdef0 --verbose",
    },
  ];

  static override readonly args = {
    sessionId: Args.string({
      description: "Session ID to resume",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,
  };

  /**
   * Execute the SSM resume session command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SSMSessionResumeCommand);

    try {
      const input: ResumeSessionInput = ResumeSessionInputSchema.parse({
        sessionId: args.sessionId,
        region: flags.region,
        profile: flags.profile,
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

      const response = await ssmService.resumeSession(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.sessionId,
      );

      this.log("\nSession resumed successfully!");
      this.log(`  Session ID: ${response.SessionId}`);
      this.log(`  Stream URL: ${response.StreamUrl}`);
      this.log("\nNote: Resume only works for disconnected sessions due to network issues.");
      this.log("Terminated sessions cannot be resumed.\n");
    } catch (error) {
      const formattedError = formatSSMError(error, flags.verbose, "ssm:session:resume");
      this.error(formattedError, { exit: 1 });
    }
  }
}
