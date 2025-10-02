/**
 * @module ssm/parameter/delete
 * SSM delete parameter command
 *
 * Deletes a parameter from AWS Systems Manager Parameter Store.
 */

import { Args } from "@oclif/core";
import {
  DeleteParameterInputSchema,
  type DeleteParameterInput,
} from "../../../lib/ssm/parameter-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import { ParameterStoreService } from "../../../services/ssm/parameter-store.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM delete parameter command
 *
 * @public
 */
export default class SSMParameterDeleteCommand extends BaseCommand {
  static override readonly description = "Delete a parameter from Parameter Store";

  static override readonly examples = [
    {
      description: "Delete a parameter",
      command: "<%= config.bin %> <%= command.id %> /app/database/password",
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
  };

  /**
   * Execute the SSM delete parameter command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SSMParameterDeleteCommand);

    try {
      const input: DeleteParameterInput = DeleteParameterInputSchema.parse({
        name: args.name,
        region: flags.region,
        profile: flags.profile,
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

      await parameterStore.deleteParameter(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.name,
      );

      this.log(`Deleted parameter ${input.name}`);
    } catch (error) {
      const formattedError = formatSSMError(error, flags.verbose, "ssm:parameter:delete");
      this.error(formattedError, { exit: 1 });
    }
  }
}
