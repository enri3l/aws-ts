/**
 * @module ssm/parameter/get
 * SSM get parameter command
 *
 * Retrieves a parameter from AWS Systems Manager Parameter Store.
 */

import { Args, Flags } from "@oclif/core";
import {
  GetParameterInputSchema,
  type GetParameterInput,
} from "../../../lib/ssm/parameter-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import { ParameterStoreService } from "../../../services/ssm/parameter-store.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM get parameter command
 *
 * @public
 */
export default class SSMParameterGetCommand extends BaseCommand {
  static override readonly description = "Get a parameter from Parameter Store";

  static override readonly examples = [
    {
      description: "Get a parameter",
      command: "<%= config.bin %> <%= command.id %> /app/database/password",
    },
    {
      description: "Get a SecureString parameter with decryption",
      command: "<%= config.bin %> <%= command.id %> /app/api/key --with-decryption",
    },
  ];

  static override readonly args = {
    name: Args.string({
      description: "Parameter name (must start with /)",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "with-decryption": Flags.boolean({
      description: "Decrypt SecureString parameters",
      default: false,
    }),
  };

  /**
   * Execute the SSM get parameter command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SSMParameterGetCommand);

    try {
      const input: GetParameterInput = GetParameterInputSchema.parse({
        name: args.name,
        withDecryption: flags["with-decryption"],
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      const parameterStore = new ParameterStoreService({
        enableDebugLogging: input.verbose ?? false,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      const response = await parameterStore.getParameter(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          name: input.name,
          withDecryption: input.withDecryption,
        },
      );

      if (!response.Parameter) {
        this.error("Parameter not found", { exit: 1 });
      }

      const parameter = {
        Name: response.Parameter.Name,
        Type: response.Parameter.Type,
        Value: response.Parameter.Value,
        Version: response.Parameter.Version,
        LastModifiedDate: response.Parameter.LastModifiedDate,
        ARN: response.Parameter.ARN,
        DataType: response.Parameter.DataType,
      };

      this.displayOutput([parameter], input.format);
    } catch (error) {
      const formattedError = formatSSMError(error, flags.verbose, "ssm:parameter:get");
      this.error(formattedError, { exit: 1 });
    }
  }
}
