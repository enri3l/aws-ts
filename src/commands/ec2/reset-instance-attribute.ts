/**
 * EC2 reset instance attribute command
 *
 * Resets a specific attribute of an EC2 instance to its default value.
 *
 * @module ec2/reset-instance-attribute
 */

import { Flags } from "@oclif/core";
import { formatEC2Error } from "../../lib/ec2-errors.js";
import {
  EC2ResetInstanceAttributeInputSchema,
  type EC2ResetInstanceAttributeInput,
} from "../../lib/ec2-schemas.js";
import { EC2Service } from "../../services/ec2-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * EC2 reset instance attribute command for resetting attributes to defaults
 *
 * Resets the value of a specific attribute for an EC2 instance to its default value.
 * Only certain attributes can be reset.
 *
 * @public
 */
export default class EC2ResetInstanceAttributeCommand extends BaseCommand {
  static override readonly description =
    "Reset a specific attribute of an EC2 instance to its default value";

  static override readonly examples = [
    {
      description: "Reset kernel attribute to default",
      command:
        "<%= config.bin %> <%= command.id %> --instance-id i-1234567890abcdef0 --attribute kernel",
    },
    {
      description: "Reset ramdisk attribute to default",
      command:
        "<%= config.bin %> <%= command.id %> --instance-id i-1234567890abcdef0 --attribute ramdisk",
    },
    {
      description: "Reset source/dest check to default",
      command:
        "<%= config.bin %> <%= command.id %> --instance-id i-1234567890abcdef0 --attribute sourceDestCheck",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "instance-id": Flags.string({
      char: "i",
      description: "Instance ID to reset attribute for",
      required: true,
      helpValue: "INSTANCE_ID",
    }),

    attribute: Flags.string({
      char: "a",
      description: "Attribute name to reset (only kernel, ramdisk, sourceDestCheck supported)",
      required: true,
      options: ["kernel", "ramdisk", "sourceDestCheck"],
      helpValue: "ATTRIBUTE",
    }),
  };

  /**
   * Execute the EC2 reset instance attribute command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(EC2ResetInstanceAttributeCommand);

    try {
      const input: EC2ResetInstanceAttributeInput = EC2ResetInstanceAttributeInputSchema.parse({
        region: flags.region,
        profile: flags.profile,
        instanceId: flags["instance-id"],
        attribute: flags.attribute as "kernel" | "ramdisk" | "sourceDestCheck",
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

      await ec2Service.resetInstanceAttribute(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          instanceId: input.instanceId,
          attribute: input.attribute,
        },
      );

      this.log(
        `Successfully reset attribute '${input.attribute}' for instance ${input.instanceId} to default value`,
      );
    } catch (error) {
      const formattedError = formatEC2Error(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }
}
