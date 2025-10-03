/**
 * EC2 reboot instances command
 *
 * Reboots running EC2 instances safely.
 *
 * @module ec2/reboot-instances
 */

import { Flags } from "@oclif/core";
import { formatEC2Error } from "../../lib/ec2-errors.js";
import {
  EC2RebootInstancesInputSchema,
  type EC2RebootInstancesInput,
} from "../../lib/ec2-schemas.js";
import { EC2Service } from "../../services/ec2-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * EC2 reboot instances command for rebooting running instances
 *
 * Reboots one or more running EC2 instances, initiating a clean
 * operating system reboot sequence.
 *
 * @public
 */
export default class EC2RebootInstancesCommand extends BaseCommand {
  static override readonly description = "Reboot running EC2 instances safely";

  static override readonly examples = [
    {
      description: "Reboot a single instance",
      command: "<%= config.bin %> <%= command.id %> --instance-ids i-1234567890abcdef0",
    },
    {
      description: "Reboot multiple instances",
      command:
        "<%= config.bin %> <%= command.id %> --instance-ids i-1234567890abcdef0 i-0987654321fedcba0",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "instance-ids": Flags.string({
      char: "i",
      description: "Instance IDs to reboot",
      required: true,
      multiple: true,
      helpValue: "INSTANCE_ID",
    }),
  };

  /**
   * Execute the EC2 reboot instances command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(EC2RebootInstancesCommand);

    try {
      const input: EC2RebootInstancesInput = EC2RebootInstancesInputSchema.parse({
        region: flags.region,
        profile: flags.profile,
        instanceIds: flags["instance-ids"],
        format: flags.format,
        verbose: flags.verbose,
      });

      const ec2Service = new EC2Service({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      await ec2Service.rebootInstances(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          instanceIds: input.instanceIds,
        },
      );

      this.log(`Successfully initiated reboot for ${input.instanceIds.length} instance(s)`);
    } catch (error) {
      const formattedError = formatEC2Error(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }
}
