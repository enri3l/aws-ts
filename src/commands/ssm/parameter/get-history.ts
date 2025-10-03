/**
 * @module ssm/parameter/get-history
 * SSM get parameter history command
 *
 * Shows version history for a specific parameter.
 */

import type { ParameterHistory } from "@aws-sdk/client-ssm";
import { Args, Flags } from "@oclif/core";
import {
  GetParameterHistoryInputSchema,
  type GetParameterHistoryInput,
} from "../../../lib/ssm/parameter-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import { ParameterStoreService } from "../../../services/ssm/parameter-store.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM get parameter history command
 *
 * @public
 */
export default class SSMParameterGetHistoryCommand extends BaseCommand {
  static override readonly description = "Show version history for an SSM parameter";

  static override readonly examples = [
    {
      description: "Get parameter history",
      command: "<%= config.bin %> <%= command.id %> /myapp/database/password",
    },
    {
      description: "Get parameter history with decryption",
      command: "<%= config.bin %> <%= command.id %> /myapp/database/password --with-decryption",
    },
    {
      description: "Get parameter history with JSON output",
      command: "<%= config.bin %> <%= command.id %> /myapp/database/password --format json",
    },
  ];

  static override readonly args = {
    name: Args.string({
      description: "Parameter name",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "with-decryption": Flags.boolean({
      description: "Decrypt SecureString parameter values",
      default: false,
    }),

    "max-results": Flags.integer({
      description: "Maximum number of versions to return",
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
   * Execute the SSM get parameter history command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SSMParameterGetHistoryCommand);

    try {
      const input: GetParameterHistoryInput = GetParameterHistoryInputSchema.parse({
        name: args.name,
        withDecryption: flags["with-decryption"],
        maxResults: flags["max-results"],
        nextToken: flags["next-token"],
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

      const response = await parameterStore.getParameterHistory(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          name: input.name,
          withDecryption: input.withDecryption,
          ...(input.maxResults && { maxResults: input.maxResults }),
          ...(input.nextToken && { nextToken: input.nextToken }),
        },
      );

      const history = response.Parameters || [];

      // Display parameter history with proper formatting
      this.displayOutput(history, input.format, {
        transform: (parameter: unknown) => {
          const parameterData = parameter as ParameterHistory;
          return {
            Name: parameterData.Name || "N/A",
            Type: parameterData.Type || "N/A",
            Value: parameterData.Value || "N/A",
            Version: parameterData.Version || "N/A",
            LastModifiedDate: parameterData.LastModifiedDate?.toISOString() || "N/A",
            LastModifiedUser: parameterData.LastModifiedUser || "N/A",
          };
        },
        emptyMessage: "No parameter history found",
      });

      // Show pagination token if available
      if (response.NextToken && input.format === "table") {
        this.log(
          `\nMore results available. Use --next-token "${response.NextToken}" to fetch next page.`,
        );
      }
    } catch (error) {
      const formattedError = formatSSMError(error, flags.verbose, "ssm:parameter:get-history");
      this.error(formattedError, { exit: 1 });
    }
  }
}
