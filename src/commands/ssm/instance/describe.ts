/**
 * @module ssm/instance/describe
 * SSM describe instance command
 *
 * Shows detailed information about a specific managed instance.
 */

import type { InstanceInformation } from "@aws-sdk/client-ssm";
import { Args } from "@oclif/core";
import {
  DescribeInstanceInputSchema,
  type DescribeInstanceInput,
} from "../../../lib/ssm/instance-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import { InstanceManagerService } from "../../../services/ssm/instance-manager.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM describe instance command
 *
 * @public
 */
export default class SSMInstanceDescribeCommand extends BaseCommand {
  static override readonly description = "Show detailed information about a managed instance";

  static override readonly examples = [
    {
      description: "Describe an EC2 instance",
      command: "<%= config.bin %> <%= command.id %> i-1234567890abcdef0",
    },
    {
      description: "Describe instance with JSON output",
      command: "<%= config.bin %> <%= command.id %> i-1234567890abcdef0 --format json",
    },
    {
      description: "Describe managed instance",
      command: "<%= config.bin %> <%= command.id %> mi-0123456789abcdef0",
    },
  ];

  static override readonly args = {
    instanceId: Args.string({
      description: "Instance ID to describe",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,
  };

  /**
   * Execute the SSM describe instance command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SSMInstanceDescribeCommand);

    try {
      const input: DescribeInstanceInput = DescribeInstanceInputSchema.parse({
        instanceId: args.instanceId,
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

      const instance = await instanceManager.describeInstance(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.instanceId,
      );

      if (!instance) {
        this.error(`Instance not found: ${input.instanceId}`, { exit: 1 });
      }

      // Display instance details
      if (input.format === "table") {
        this.displayInstanceTable(instance, input.verbose || false);
      } else {
        this.displaySingleObject(instance, input.format);
      }
    } catch (error) {
      const formattedError = formatSSMError(error, flags.verbose, "ssm:instance:describe");
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Display instance information in table format
   *
   * @param instance - Instance information to display
   * @param verbose - Whether to show verbose output
   * @internal
   */
  private displayInstanceTable(instance: InstanceInformation, verbose: boolean): void {
    this.log("\nInstance Details:");
    this.log(`  Instance ID: ${instance.InstanceId || "N/A"}`);
    this.log(`  Ping Status: ${instance.PingStatus || "N/A"}`);
    this.log(`  Platform Type: ${instance.PlatformType || "N/A"}`);
    this.log(`  Platform Name: ${instance.PlatformName || "N/A"}`);
    this.log(`  Platform Version: ${instance.PlatformVersion || "N/A"}`);
    this.log(`  Agent Version: ${instance.AgentVersion || "N/A"}`);
    this.log(`  IP Address: ${instance.IPAddress || "N/A"}`);
    this.log(`  Computer Name: ${instance.ComputerName || "N/A"}`);
    this.log(`  IAM Role: ${instance.IamRole || "N/A"}`);
    this.log(`  Registration Date: ${instance.RegistrationDate?.toISOString() || "N/A"}`);
    this.log(`  Last Ping: ${instance.LastPingDateTime?.toISOString() || "N/A"}`);

    if (instance.AssociationStatus) {
      this.log(`  Association Status: ${instance.AssociationStatus}`);
    }

    if (instance.LastAssociationExecutionDate) {
      this.log(
        `  Last Association Execution: ${instance.LastAssociationExecutionDate.toISOString()}`,
      );
    }

    if (instance.LastSuccessfulAssociationExecutionDate) {
      this.log(
        `  Last Successful Association: ${instance.LastSuccessfulAssociationExecutionDate.toISOString()}`,
      );
    }

    if (verbose && instance.AssociationOverview) {
      this.log(
        `\n  Association Overview: ${JSON.stringify(instance.AssociationOverview, undefined, 2)}`,
      );
    }

    this.log("");
  }
}
