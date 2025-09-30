/**
 * EC2 modify instance attribute command
 *
 * Modifies a specific attribute of an EC2 instance.
 *
 * @module ec2/modify-instance-attribute
 */

import { Flags } from "@oclif/core";
import { formatEC2Error } from "../../lib/ec2-errors.js";
import {
  EC2ModifyInstanceAttributeInputSchema,
  type EC2ModifyInstanceAttributeInput,
} from "../../lib/ec2-schemas.js";
import { EC2Service } from "../../services/ec2-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * EC2 modify instance attribute command for updating specific attributes
 *
 * Modifies the value of a specific attribute for an EC2 instance.
 * Some attributes can only be modified when the instance is stopped.
 *
 * @public
 */
export default class EC2ModifyInstanceAttributeCommand extends BaseCommand {
  static override readonly description =
    "Modify a specific attribute of an EC2 instance (some require stopped state)";

  static override readonly examples = [
    {
      description: "Modify instance type (requires stopped instance)",
      command:
        "<%= config.bin %> <%= command.id %> --instance-id i-1234567890abcdef0 --attribute instanceType --value t2.micro",
    },
    {
      description: "Enable source/dest check",
      command:
        "<%= config.bin %> <%= command.id %> --instance-id i-1234567890abcdef0 --attribute sourceDestCheck --value true",
    },
    {
      description: "Disable API termination protection",
      command:
        "<%= config.bin %> <%= command.id %> --instance-id i-1234567890abcdef0 --attribute disableApiTermination --value false",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "instance-id": Flags.string({
      char: "i",
      description: "Instance ID to modify attribute for",
      required: true,
      helpValue: "INSTANCE_ID",
    }),

    attribute: Flags.string({
      char: "a",
      description: "Attribute name to modify",
      required: true,
      options: [
        "instanceType",
        "kernel",
        "ramdisk",
        "userData",
        "disableApiTermination",
        "instanceInitiatedShutdownBehavior",
        "rootDeviceName",
        "blockDeviceMapping",
        "productCodes",
        "sourceDestCheck",
        "groupSet",
        "ebsOptimized",
        "sriovNetSupport",
        "enaSupport",
      ],
      helpValue: "ATTRIBUTE",
    }),

    value: Flags.string({
      description: "New value for the attribute",
      helpValue: "VALUE",
    }),
  };

  /**
   * Execute the EC2 modify instance attribute command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(EC2ModifyInstanceAttributeCommand);

    try {
      const input: EC2ModifyInstanceAttributeInput = EC2ModifyInstanceAttributeInputSchema.parse({
        region: flags.region,
        profile: flags.profile,
        instanceId: flags["instance-id"],
        attribute: flags.attribute,
        value: flags.value,
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

      await ec2Service.modifyInstanceAttribute(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          instanceId: input.instanceId,
          attribute: input.attribute,
          value: input.value,
        },
      );

      this.log(
        `Successfully modified attribute '${input.attribute}' for instance ${input.instanceId}`,
      );
    } catch (error) {
      const formattedError = formatEC2Error(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }
}
