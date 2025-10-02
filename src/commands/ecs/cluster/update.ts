/**
 * @module ecs/cluster/update
 * ECS cluster update command
 *
 * Updates an ECS cluster configuration including settings,
 * execute command configuration, and cluster management features.
 *
 */

import { Args, Flags, type Interfaces } from "@oclif/core";
import { formatECSError } from "../../../lib/ecs-errors.js";
import type { ECSUpdateCluster } from "../../../lib/ecs-schemas.js";
import { ECSUpdateClusterSchema } from "../../../lib/ecs-schemas.js";
import { ECSService } from "../../../services/ecs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * ECS cluster update command for modifying cluster configuration
 *
 * Updates existing ECS cluster configuration including container insights,
 * execute command configuration, and other cluster settings.
 *
 * @public
 */
export default class ECSClusterUpdateCommand extends BaseCommand {
  static override readonly description = "Update an ECS cluster configuration";

  static override readonly examples = [
    {
      description: "Enable container insights for a cluster",
      command: "<%= config.bin %> <%= command.id %> my-cluster --container-insights enabled",
    },
    {
      description: "Disable container insights for a cluster",
      command: "<%= config.bin %> <%= command.id %> my-cluster --container-insights disabled",
    },
    {
      description: "Update cluster with execute command configuration",
      command: "<%= config.bin %> <%= command.id %> my-cluster --execute-command-logging DEFAULT",
    },
    {
      description: "Update cluster in a specific region",
      command:
        "<%= config.bin %> <%= command.id %> my-cluster --region us-west-2 --container-insights enabled",
    },
    {
      description: "Update cluster using a specific AWS profile",
      command:
        "<%= config.bin %> <%= command.id %> my-cluster --profile production --container-insights enabled",
    },
    {
      description: "Update cluster with verbose debug information",
      command:
        "<%= config.bin %> <%= command.id %> my-cluster --container-insights enabled --verbose",
    },
  ];

  static override readonly args = {
    clusterName: Args.string({
      name: "clusterName",
      description: "Name of the cluster to update",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "container-insights": Flags.string({
      description: "Enable or disable container insights",
      options: ["enabled", "disabled"],
      helpValue: "STATUS",
    }),

    "execute-command-logging": Flags.string({
      description: "Execute command logging configuration",
      options: ["NONE", "DEFAULT", "OVERRIDE"],
      helpValue: "LOGGING",
    }),

    "execute-command-kms-key": Flags.string({
      description: "KMS key ID for execute command encryption",
      helpValue: "KMS_KEY_ID",
    }),

    "execute-command-log-group": Flags.string({
      description: "CloudWatch log group for execute command logs",
      helpValue: "LOG_GROUP",
    }),

    "execute-command-s3-bucket": Flags.string({
      description: "S3 bucket for execute command logs",
      helpValue: "S3_BUCKET",
    }),

    "execute-command-s3-key-prefix": Flags.string({
      description: "S3 key prefix for execute command logs",
      helpValue: "S3_PREFIX",
    }),
  };

  /**
   * Execute the ECS cluster update command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSClusterUpdateCommand);

    try {
      const settings = this.buildSettings(flags);
      const configuration = this.buildExecuteCommandConfiguration(flags);
      this.validateUpdateParameters(settings, configuration);

      // Validate input using Zod schema
      const input: ECSUpdateCluster = ECSUpdateClusterSchema.parse({
        clusterName: args.clusterName,
        ...(settings.length > 0 && { settings }),
        ...(configuration && { configuration }),
        region: flags.region,
        profile: flags.profile,
        format: "json", // Default format for update operations
        verbose: flags.verbose,
      });

      // Create ECS service instance
      const ecsService = new ECSService({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      // Update cluster parameters
      const updateParameters = {
        cluster: input.clusterName,
        ...(input.settings && { settings: input.settings }),
        ...(input.configuration && { configuration: input.configuration }),
      };

      // Execute cluster update via ECS service with validated parameters and credential context.
      const cluster = await ecsService.updateCluster(updateParameters, {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      });

      // Display success message with cluster details
      this.log(`Successfully updated ECS cluster '${cluster.clusterName}'`);
      this.log(`  ARN: ${cluster.clusterArn}`);
      this.log(`  Status: ${cluster.status}`);

      if (input.verbose) {
        this.log("\nUpdated Cluster Details:");
        this.log(JSON.stringify(cluster, undefined, 2));
      }
    } catch (error) {
      const formattedError = formatECSError(error, "update ECS cluster", flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Build settings array from flags
   *
   * @param flags - Command flags
   * @returns Settings array
   * @internal
   */
  private buildSettings(flags: Interfaces.InferredFlags<typeof ECSClusterUpdateCommand.flags>) {
    const settings = [];
    if (flags["container-insights"]) {
      settings.push({
        name: "containerInsights" as const,
        value: flags["container-insights"],
      });
    }
    return settings;
  }

  /**
   * Build execute command configuration from flags
   *
   * @param flags - Command flags
   * @returns Configuration object or undefined
   * @internal
   */
  private buildExecuteCommandConfiguration(
    flags: Interfaces.InferredFlags<typeof ECSClusterUpdateCommand.flags>,
  ) {
    if (
      flags["execute-command-logging"] ||
      flags["execute-command-kms-key"] ||
      flags["execute-command-log-group"] ||
      flags["execute-command-s3-bucket"] ||
      flags["execute-command-s3-key-prefix"]
    ) {
      return {
        executeCommandConfiguration: {
          ...(flags["execute-command-kms-key"] && { kmsKeyId: flags["execute-command-kms-key"] }),
          ...(flags["execute-command-logging"] && { logging: flags["execute-command-logging"] }),
          ...((flags["execute-command-log-group"] ||
            flags["execute-command-s3-bucket"] ||
            flags["execute-command-s3-key-prefix"]) && {
            logConfiguration: {
              ...(flags["execute-command-log-group"] && {
                cloudWatchLogGroupName: flags["execute-command-log-group"],
              }),
              ...(flags["execute-command-s3-bucket"] && {
                s3BucketName: flags["execute-command-s3-bucket"],
              }),
              ...(flags["execute-command-s3-key-prefix"] && {
                s3KeyPrefix: flags["execute-command-s3-key-prefix"],
              }),
            },
          }),
        },
      };
    }
  }

  /**
   * Validate that at least one update parameter is provided
   *
   * @param settings - Settings array
   * @param configuration - Configuration object
   * @throws Error if no update parameters provided
   * @internal
   */
  private validateUpdateParameters(
    settings: Array<{ name: string; value: string }>,
    configuration: ReturnType<typeof this.buildExecuteCommandConfiguration>,
  ) {
    if (settings.length === 0 && !configuration) {
      throw new Error(
        "At least one update parameter must be specified (container-insights, execute-command configuration, etc.)",
      );
    }
  }
}
