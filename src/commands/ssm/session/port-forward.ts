/**
 * @module ssm/session/port-forward
 * SSM port forward command
 *
 * Starts local port forwarding session through Session Manager.
 */

import { Args, Flags } from "@oclif/core";
import {
  PortForwardingInputSchema,
  type PortForwardingInput,
} from "../../../lib/ssm/session-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import { findAvailablePort, validatePort } from "../../../services/ssm/port-manager.js";
import { SSMService } from "../../../services/ssm/ssm-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM port forward command
 *
 * @public
 */
export default class SSMSessionPortForwardCommand extends BaseCommand {
  static override readonly description =
    "Start local port forwarding session through Session Manager";

  static override readonly examples = [
    {
      description: "Forward local port 8080 to remote port 80",
      command: "<%= config.bin %> <%= command.id %> i-1234567890abcdef0 80 --local-port 8080",
    },
    {
      description: "Forward with automatic local port assignment",
      command: "<%= config.bin %> <%= command.id %> i-1234567890abcdef0 3306",
    },
    {
      description: "Forward RDP port",
      command: "<%= config.bin %> <%= command.id %> i-1234567890abcdef0 3389 --local-port 3389",
    },
  ];

  static override readonly args = {
    instanceId: Args.string({
      description: "EC2 instance ID or managed instance ID",
      required: true,
    }),
    remotePort: Args.integer({
      description: "Remote port on the instance to forward",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "local-port": Flags.integer({
      char: "l",
      description: "Local port to bind (auto-assigned if not specified)",
      helpValue: "PORT",
    }),
  };

  /**
   * Execute the SSM port forward command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SSMSessionPortForwardCommand);

    try {
      // Validate remote port
      validatePort(args.remotePort);

      // Determine local port
      let localPort = flags["local-port"];
      if (localPort) {
        validatePort(localPort);
      } else {
        // Auto-assign local port
        localPort = await findAvailablePort(args.remotePort);
        this.log(`Auto-assigned local port: ${localPort}`);
      }

      const input: PortForwardingInput = PortForwardingInputSchema.parse({
        instanceId: args.instanceId,
        remotePort: args.remotePort,
        localPort: localPort,
        region: flags.region,
        profile: flags.profile,
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

      const response = await ssmService.startPortForwardingSession(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          instanceId: input.instanceId,
          localPort: input.localPort!,
          remotePort: input.remotePort,
        },
      );

      // Display port forwarding information
      this.log("\nPort forwarding session started successfully!");
      this.log(`  Session ID: ${response.SessionId}`);
      this.log(`  Local Port: ${input.localPort}`);
      this.log(`  Remote Port: ${input.remotePort}`);
      this.log(`  Instance: ${input.instanceId}`);
      this.log("\nTo use the forwarded port:");
      this.log(`  Connect to localhost:${input.localPort}`);
      this.log("\nTo terminate this session:");
      this.log(`  aws-ts ssm:session:terminate ${response.SessionId}\n`);
    } catch (error) {
      const formattedError = formatSSMError(error, flags.verbose, "ssm:session:port-forward");
      this.error(formattedError, { exit: 1 });
    }
  }
}
