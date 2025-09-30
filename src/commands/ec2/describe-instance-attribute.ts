/**
 * EC2 describe instance attribute command
 *
 * Shows a specific attribute of an EC2 instance.
 */

import { Flags } from "@oclif/core";
import { formatEC2Error } from "../../lib/ec2-errors.js";
import {
  EC2DescribeInstanceAttributeInputSchema,
  type EC2DescribeInstanceAttributeInput,
} from "../../lib/ec2-schemas.js";
import { EC2Service } from "../../services/ec2-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * EC2 describe instance attribute command for querying specific attributes
 *
 * Retrieves the value of a specific attribute for an EC2 instance.
 *
 * @public
 */
export default class EC2DescribeInstanceAttributeCommand extends BaseCommand {
  static override readonly description = "Show a specific attribute of an EC2 instance";

  static override readonly examples = [
    {
      description: "Describe instance type attribute",
      command:
        "<%= config.bin %> <%= command.id %> --instance-id i-1234567890abcdef0 --attribute instanceType",
    },
    {
      description: "Describe user data attribute",
      command:
        "<%= config.bin %> <%= command.id %> --instance-id i-1234567890abcdef0 --attribute userData",
    },
    {
      description: "Describe source/dest check attribute",
      command:
        "<%= config.bin %> <%= command.id %> --instance-id i-1234567890abcdef0 --attribute sourceDestCheck",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "instance-id": Flags.string({
      char: "i",
      description: "Instance ID to describe attribute for",
      required: true,
      helpValue: "INSTANCE_ID",
    }),

    attribute: Flags.string({
      char: "a",
      description: "Attribute name to describe",
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
  };

  /**
   * Execute the EC2 describe instance attribute command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(EC2DescribeInstanceAttributeCommand);

    try {
      const input: EC2DescribeInstanceAttributeInput =
        EC2DescribeInstanceAttributeInputSchema.parse({
          region: flags.region,
          profile: flags.profile,
          instanceId: flags["instance-id"],
          attribute: flags.attribute,
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

      const result = await ec2Service.describeInstanceAttribute(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          instanceId: input.instanceId,
          attribute: input.attribute,
        },
      );

      if (input.format === "json") {
        this.log(JSON.stringify(result, undefined, 2));
      } else {
        this.log(
          `Attribute '${input.attribute}' for instance ${input.instanceId}:\n${JSON.stringify(result, undefined, 2)}`,
        );
      }
    } catch (error) {
      const formattedError = formatEC2Error(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }
}
