/**
 * @module ssm/parameter/list
 * SSM list parameters command
 *
 * Lists parameters with hierarchical path support and filtering.
 */

import type { ParameterMetadata } from "@aws-sdk/client-ssm";
import { Flags } from "@oclif/core";
import {
  ListParametersInputSchema,
  type ListParametersInput,
} from "../../../lib/ssm/parameter-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import { ParameterStoreService } from "../../../services/ssm/parameter-store.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM list parameters command
 *
 * @public
 */
export default class SSMParameterListCommand extends BaseCommand {
  static override readonly description = "List SSM parameters with hierarchical path support";

  static override readonly examples = [
    {
      description: "List all parameters",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "List parameters by path",
      command: "<%= config.bin %> <%= command.id %> --path /myapp/database",
    },
    {
      description: "List parameters recursively",
      command: "<%= config.bin %> <%= command.id %> --path /myapp --recursive",
    },
    {
      description: "List parameters with JSON output",
      command: "<%= config.bin %> <%= command.id %> --format json",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    path: Flags.string({
      description: "Hierarchical path to filter parameters",
      helpValue: "PATH",
    }),

    recursive: Flags.boolean({
      description: "Recursively list parameters under path",
      default: false,
    }),

    "max-results": Flags.integer({
      description: "Maximum number of parameters to return",
      min: 1,
      max: 50,
      helpValue: "NUMBER",
    }),
  };

  /**
   * Execute the SSM list parameters command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(SSMParameterListCommand);

    try {
      const input: ListParametersInput = ListParametersInputSchema.parse({
        path: flags.path,
        recursive: flags.recursive,
        maxResults: flags["max-results"],
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

      const parameters = await parameterStore.listParameters(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          ...(input.path && { path: input.path }),
          recursive: input.recursive,
          ...(input.maxResults && { maxResults: input.maxResults }),
        },
      );

      // Display parameters with proper formatting
      this.displayOutput(parameters, input.format, {
        transform: (parameter: unknown) => {
          const parameterData = parameter as ParameterMetadata;
          return {
            Name: parameterData.Name || "N/A",
            Type: parameterData.Type || "N/A",
            KeyId: parameterData.KeyId || "N/A",
            LastModifiedDate: parameterData.LastModifiedDate?.toISOString() || "N/A",
            Version: parameterData.Version || "N/A",
            Tier: parameterData.Tier || "N/A",
          };
        },
        emptyMessage: "No parameters found",
      });
    } catch (error) {
      const formattedError = formatSSMError(error, flags.verbose, "ssm:parameter:list");
      this.error(formattedError, { exit: 1 });
    }
  }
}
