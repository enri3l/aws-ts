/**
 * @module ssm/instance/list
 * SSM list instances command
 *
 * Lists managed instances with comprehensive filtering.
 */

import type { InstanceInformation } from "@aws-sdk/client-ssm";
import { Flags } from "@oclif/core";
import {
  ListInstancesInputSchema,
  type ListInstancesInput,
} from "../../../lib/ssm/instance-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import { InstanceManagerService } from "../../../services/ssm/instance-manager.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM list instances command
 *
 * @public
 */
export default class SSMInstanceListCommand extends BaseCommand {
  static override readonly description = "List SSM managed instances with filtering";

  static override readonly examples = [
    {
      description: "List all managed instances",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "List only online Linux instances",
      command: "<%= config.bin %> <%= command.id %> --platform-type Linux --ping-status Online",
    },
    {
      description: "List instances with JSON output",
      command: "<%= config.bin %> <%= command.id %> --format json",
    },
    {
      description: "List instances with pagination",
      command: "<%= config.bin %> <%= command.id %> --max-results 10",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "platform-type": Flags.string({
      description: "Filter by platform type",
      options: ["Windows", "Linux", "MacOS"],
      helpValue: "PLATFORM",
    }),

    "ping-status": Flags.string({
      description: "Filter by ping status",
      options: ["Online", "ConnectionLost", "Inactive"],
      helpValue: "STATUS",
    }),

    "max-results": Flags.integer({
      description: "Maximum number of instances to return",
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
   * Execute the SSM list instances command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(SSMInstanceListCommand);

    try {
      const input: ListInstancesInput = ListInstancesInputSchema.parse({
        platformType: flags["platform-type"],
        pingStatus: flags["ping-status"],
        maxResults: flags["max-results"],
        nextToken: flags["next-token"],
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      const instanceManager = new InstanceManagerService({
        enableDebugLogging: input.verbose || false,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      // Build filters based on input
      const filters = [];
      if (input.platformType) {
        filters.push({
          Key: "PlatformType",
          Values: [input.platformType],
        });
      }
      if (input.pingStatus) {
        filters.push({
          Key: "PingStatus",
          Values: [input.pingStatus],
        });
      }

      const instances = await instanceManager.listInstances(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          ...(filters.length > 0 && { filters }),
          ...(input.maxResults && { maxResults: input.maxResults }),
        },
      );

      // Display instances with proper formatting
      this.displayOutput(instances, input.format, {
        transform: (instance: unknown) => {
          const inst = instance as InstanceInformation;
          return {
            InstanceId: inst.InstanceId || "N/A",
            PingStatus: inst.PingStatus || "N/A",
            PlatformType: inst.PlatformType || "N/A",
            PlatformName: inst.PlatformName || "N/A",
            PlatformVersion: inst.PlatformVersion || "N/A",
            AgentVersion: inst.AgentVersion || "N/A",
            IPAddress: inst.IPAddress || "N/A",
            ComputerName: inst.ComputerName || "N/A",
          };
        },
        emptyMessage: "No managed instances found",
      });
    } catch (error) {
      const formattedError = formatSSMError(error, flags.verbose, "ssm:instance:list");
      this.error(formattedError, { exit: 1 });
    }
  }
}
