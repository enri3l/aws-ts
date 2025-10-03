/**
 * @module ssm/session/start
 * SSM start session command
 *
 * Starts an interactive Session Manager session on a target instance.
 */

import { Args, Flags } from "@oclif/core";
import {
  StartSessionInputSchema,
  type StartSessionInput,
} from "../../../lib/ssm/session-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import { SSMService } from "../../../services/ssm/ssm-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM start session command
 *
 * @public
 */
export default class SSMSessionStartCommand extends BaseCommand {
  static override readonly description =
    "Start an interactive Session Manager session on an instance";

  static override readonly examples = [
    {
      description: "Start session on EC2 instance",
      command: "<%= config.bin %> <%= command.id %> i-1234567890abcdef0",
    },
    {
      description: "Start session with custom document",
      command:
        "<%= config.bin %> <%= command.id %> i-1234567890abcdef0 --document AWS-StartPortForwardingSession",
    },
    {
      description: "Start session with audit reason",
      command:
        "<%= config.bin %> <%= command.id %> i-1234567890abcdef0 --reason 'Troubleshooting application issue'",
    },
  ];

  static override readonly args = {
    instanceId: Args.string({
      description: "EC2 instance ID or managed instance ID to connect to",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    document: Flags.string({
      char: "d",
      description: "SSM document to use for session",
      default: "SSM-SessionManagerRunShell",
      helpValue: "DOCUMENT_NAME",
    }),

    reason: Flags.string({
      description: "Reason for starting session (audit trail)",
      helpValue: "REASON",
    }),
  };

  /**
   * Execute the SSM start session command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SSMSessionStartCommand);

    try {
      const input: StartSessionInput = StartSessionInputSchema.parse({
        instanceId: args.instanceId,
        document: flags.document,
        reason: flags.reason,
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

      const response = await ssmService.startSession(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          instanceId: input.instanceId,
          documentName: input.document,
          ...(input.reason && { reason: input.reason }),
        },
      );

      // Display session information
      this.log("\nSession started successfully!");
      this.log(`  Session ID: ${response.SessionId}`);
      this.log(`  Stream URL: ${response.StreamUrl}`);

      if (flags.verbose && response.TokenValue) {
        this.log(`  Token: ${response.TokenValue}`);
      }

      this.log("\nTo connect to this session, use:");
      this.log(
        `  session-manager-plugin "${response.SessionId}" "${input.region || process.env["AWS_REGION"] || "us-east-1"}" "StartSession" "${input.profile || "default"}"`,
      );
      this.log("\nTo terminate this session, use:");
      this.log(`  aws-ts ssm:session:terminate ${response.SessionId}\n`);
    } catch (error) {
      const formattedError = formatSSMError(error, flags.verbose, "ssm:session:start");
      this.error(formattedError, { exit: 1 });
    }
  }
}
