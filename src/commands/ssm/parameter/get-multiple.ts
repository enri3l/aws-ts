/**
 * @module ssm/parameter/get-multiple
 * SSM get multiple parameters command
 *
 * Retrieves multiple parameters from Parameter Store in a single operation.
 */

import { type Parameter } from "@aws-sdk/client-ssm";
import { Args, Flags } from "@oclif/core";
import {
  GetMultipleParametersInputSchema,
  type GetMultipleParametersInput,
} from "../../../lib/ssm/parameter-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import { ParameterStoreService } from "../../../services/ssm/parameter-store.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM get multiple parameters command
 *
 * @public
 */
export default class SSMParameterGetMultipleCommand extends BaseCommand {
  static override readonly description = "Get multiple parameters from Parameter Store";

  static override readonly examples = [
    {
      description: "Get multiple parameters",
      command:
        "<%= config.bin %> <%= command.id %> /app/database/host /app/database/port /app/database/name",
    },
    {
      description: "Get parameters with decryption",
      command:
        "<%= config.bin %> <%= command.id %> /app/secrets/api-key /app/secrets/db-password --with-decryption",
    },
    {
      description: "Get parameters with JSON output",
      command:
        "<%= config.bin %> <%= command.id %> /app/config/url /app/config/timeout --format json",
    },
  ];

  static override readonly args = {
    names: Args.string({
      description: "Parameter names to retrieve (space-separated)",
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
   * Execute the SSM get multiple parameters command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(SSMParameterGetMultipleCommand);

    try {
      // Parse parameter names from arguments
      // OCLIF provides remaining args as a string, we need to parse them
      const rawArguments = this.argv;
      const parameterNames = rawArguments.filter((argument) => !argument.startsWith("-"));

      const input: GetMultipleParametersInput = GetMultipleParametersInputSchema.parse({
        names: parameterNames,
        withDecryption: flags["with-decryption"],
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      const parameterStore = new ParameterStoreService({
        enableDebugLogging: input.verbose || false,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      const response = await parameterStore.getParameters(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          names: input.names,
          withDecryption: input.withDecryption,
        },
      );

      // Display results
      const parameters = response.Parameters || [];
      const invalidParameters = response.InvalidParameters || [];

      if (parameters.length > 0) {
        this.displayOutput(parameters, input.format, {
          transform: (parameter: Parameter) => ({
            Name: parameter.Name,
            Value: parameter.Value,
            Type: parameter.Type,
            Version: parameter.Version,
            LastModifiedDate: parameter.LastModifiedDate?.toISOString(),
            ARN: parameter.ARN,
          }),
          emptyMessage: "No parameters found",
        });
      }

      if (invalidParameters.length > 0) {
        this.warn(`\nInvalid parameters (not found): ${invalidParameters.join(", ")}`);
      }
    } catch (error) {
      const formattedError = formatSSMError(error, flags.verbose, "ssm:parameter:get-multiple");
      this.error(formattedError, { exit: 1 });
    }
  }
}
