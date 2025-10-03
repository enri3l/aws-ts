/**
 * @module ssm/session/terminate
 * SSM terminate session command
 *
 * Terminates an active Session Manager session.
 */

import { Args } from "@oclif/core";
import {
  TerminateSessionInputSchema,
  type TerminateSessionInput,
} from "../../../lib/ssm/session-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import { SSMService } from "../../../services/ssm/ssm-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM terminate session command
 *
 * @public
 */
export default class SSMSessionTerminateCommand extends BaseCommand {
  static override readonly description = "Terminate an active Session Manager session";

  static override readonly examples = [
    {
      description: "Terminate a session by ID",
      command: "<%= config.bin %> <%= command.id %> user-1234567890abcdef0",
    },
    {
      description: "Terminate session with verbose output",
      command: "<%= config.bin %> <%= command.id %> user-1234567890abcdef0 --verbose",
    },
  ];

  static override readonly args = {
    sessionId: Args.string({
      description: "Session ID to terminate",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,
  };

  /**
   * Execute the SSM terminate session command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SSMSessionTerminateCommand);

    try {
      const input: TerminateSessionInput = TerminateSessionInputSchema.parse({
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

      const response = await ssmService.terminateSession(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.sessionId,
      );

      this.log("\nSession terminated successfully!");
      this.log(`  Session ID: ${response.SessionId}\n`);
    } catch (error) {
      const formattedError = formatSSMError(error, flags.verbose, "ssm:session:terminate");
      this.error(formattedError, { exit: 1 });
    }
  }
}
