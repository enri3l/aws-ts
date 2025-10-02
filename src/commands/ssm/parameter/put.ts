/**
 * @module ssm/parameter/put
 * SSM put parameter command
 *
 * Creates or updates a parameter in AWS Systems Manager Parameter Store.
 */

import { Args, Flags } from "@oclif/core";
import {
  PutParameterInputSchema,
  type PutParameterInput,
} from "../../../lib/ssm/parameter-schemas.js";
import { formatSSMError } from "../../../lib/ssm/ssm-errors.js";
import { ParameterStoreService } from "../../../services/ssm/parameter-store.js";
import { BaseCommand } from "../../base-command.js";

/**
 * SSM put parameter command
 *
 * @public
 */
export default class SSMParameterPutCommand extends BaseCommand {
  static override readonly description = "Create or update a parameter in Parameter Store";

  static override readonly examples = [
    {
      description: "Create a String parameter",
      command: "<%= config.bin %> <%= command.id %> /app/database/host 'db.example.com'",
    },
    {
      description: "Create a SecureString parameter",
      command:
        "<%= config.bin %> <%= command.id %> /app/api/key 'secret-value' --type SecureString",
    },
    {
      description: "Update an existing parameter",
      command: "<%= config.bin %> <%= command.id %> /app/config/timeout '30' --overwrite",
    },
  ];

  static override readonly args = {
    name: Args.string({
      description: "Parameter name (must start with /)",
      required: true,
    }),
    value: Args.string({
      description: "Parameter value",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    type: Flags.string({
      description: "Parameter type",
      options: ["String", "StringList", "SecureString"],
      default: "String",
    }),

    description: Flags.string({
      description: "Parameter description",
    }),

    "key-id": Flags.string({
      description: "KMS key ID for SecureString encryption",
    }),

    overwrite: Flags.boolean({
      description: "Overwrite existing parameter",
      default: false,
    }),

    tier: Flags.string({
      description: "Parameter tier",
      options: ["Standard", "Advanced", "Intelligent-Tiering"],
      default: "Standard",
    }),
  };

  /**
   * Execute the SSM put parameter command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(SSMParameterPutCommand);

    try {
      const input: PutParameterInput = PutParameterInputSchema.parse({
        name: args.name,
        value: args.value,
        type: flags.type,
        description: flags.description,
        keyId: flags["key-id"],
        overwrite: flags.overwrite,
        tier: flags.tier,
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

      const response = await parameterStore.putParameter(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          name: input.name,
          value: input.value,
          type: input.type,
          ...(input.description && { description: input.description }),
          ...(input.keyId && { keyId: input.keyId }),
          overwrite: input.overwrite,
          tier: input.tier,
        },
      );

      const action = input.overwrite ? "Updated" : "Created";
      this.log(`${action} parameter ${input.name} (version ${response.Version})`);
      this.log(`Tier: ${input.tier || "Standard"}`);
    } catch (error) {
      const formattedError = formatSSMError(error, flags.verbose, "ssm:parameter:put");
      this.error(formattedError, { exit: 1 });
    }
  }
}
