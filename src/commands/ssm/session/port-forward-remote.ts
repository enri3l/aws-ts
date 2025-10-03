/**
 * @module ssm/session/port-forward-remote
 * SSM remote port forward command
 *
 * Starts remote port forwarding session through Session Manager to access
 * resources in private subnets via a bastion instance.
 */

import { Args, Flags } from "@oclif/core";
import {
  RemotePortForwardingInputSchema,
  type RemotePortForwardingInput,
} from "../../../lib/ssm/session-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import { findAvailablePort, validatePort } from "../../../services/ssm/port-manager.js";
import { SSMService } from "../../../services/ssm/ssm-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM remote port forward command
 *
 * @public
 */
export default class SSMSessionPortForwardRemoteCommand extends BaseCommand {
  static override readonly description =
    "Start remote port forwarding session to access private resources through an instance";

  static override readonly examples = [
    {
      description: "Forward to RDS database in private subnet",
      command:
        "<%= config.bin %> <%= command.id %> i-1234567890abcdef0 db.internal.example.com 5432 --local-port 5432",
    },
    {
      description: "Forward to ElastiCache with auto-assigned local port",
      command:
        "<%= config.bin %> <%= command.id %> i-1234567890abcdef0 redis.internal.example.com 6379",
    },
    {
      description: "Access internal web service",
      command:
        "<%= config.bin %> <%= command.id %> i-1234567890abcdef0 api.internal.example.com 80 --local-port 8080",
    },
  ];

  static override readonly args = {
    instanceId: Args.string({
      description: "EC2 instance ID or managed instance ID (bastion host)",
      required: true,
    }),
    remoteHost: Args.string({
      description: "Remote host to forward to (DNS name or IP)",
      required: true,
    }),
    remotePort: Args.integer({
      description: "Remote port on the target host",
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
   * Execute the SSM remote port forward command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SSMSessionPortForwardRemoteCommand);

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

      const input: RemotePortForwardingInput = RemotePortForwardingInputSchema.parse({
        instanceId: args.instanceId,
        remoteHost: args.remoteHost,
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

      const response = await ssmService.startRemotePortForwardingSession(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          instanceId: input.instanceId,
          remoteHost: input.remoteHost,
          remotePort: input.remotePort,
          ...(input.localPort && { localPort: input.localPort }),
        },
      );

      // Display remote port forwarding information
      this.log("\nRemote port forwarding session started successfully!");
      this.log(`  Session ID: ${response.SessionId}`);
      this.log(`  Local Port: ${input.localPort}`);
      this.log(`  Remote Host: ${input.remoteHost}`);
      this.log(`  Remote Port: ${input.remotePort}`);
      this.log(`  Bastion Instance: ${input.instanceId}`);
      this.log("\nTo use the forwarded port:");
      this.log(`  Connect to localhost:${input.localPort}`);
      this.log("\nTo terminate this session:");
      this.log(`  aws-ts ssm:session:terminate ${response.SessionId}\n`);
    } catch (error) {
      const formattedError = formatSSMError(
        error,
        flags.verbose,
        "ssm:session:port-forward-remote",
      );
      this.error(formattedError, { exit: 1 });
    }
  }
}
