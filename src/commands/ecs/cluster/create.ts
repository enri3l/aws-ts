/**
 * @module ecs/cluster/create
 * ECS cluster create command
 *
 * Creates a new ECS cluster with optional capacity provider configuration,
 * tags, and settings for container orchestration.
 *
 */

import { Args, Flags } from "@oclif/core";
import { formatECSError } from "../../../lib/ecs-errors.js";
import type { ECSCreateCluster } from "../../../lib/ecs-schemas.js";
import { ECSCreateClusterSchema } from "../../../lib/ecs-schemas.js";
import { ECSService } from "../../../services/ecs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * ECS cluster create command for creating new clusters
 *
 * Creates a new ECS cluster with specified configuration including
 * capacity providers, default capacity provider strategy, and resource tags.
 *
 * @public
 */
export default class ECSClusterCreateCommand extends BaseCommand {
  static override readonly description = "Create a new ECS cluster";

  static override readonly examples = [
    {
      description: "Create a basic cluster",
      command: "<%= config.bin %> <%= command.id %> my-cluster",
    },
    {
      description: "Create a cluster with capacity providers",
      command: "<%= config.bin %> <%= command.id %> my-cluster --capacity-providers FARGATE EC2",
    },
    {
      description: "Create a cluster with tags",
      command:
        "<%= config.bin %> <%= command.id %> my-cluster --tags Environment=production Team=backend",
    },
    {
      description: "Create a cluster in a specific region",
      command: "<%= config.bin %> <%= command.id %> my-cluster --region us-west-2",
    },
    {
      description: "Create a cluster using a specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> my-cluster --profile production",
    },
    {
      description: "Create a cluster with verbose debug information",
      command: "<%= config.bin %> <%= command.id %> my-cluster --verbose",
    },
  ];

  static override readonly args = {
    clusterName: Args.string({
      name: "clusterName",
      description: "Name of the cluster to create",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "capacity-providers": Flags.string({
      description: "Capacity providers for the cluster (comma-separated)",
      helpValue: "PROVIDERS",
    }),

    tags: Flags.string({
      description: "Tags for the cluster in key=value format (comma-separated)",
      helpValue: "KEY=VALUE",
      multiple: true,
    }),
  };

  /**
   * Execute the ECS cluster create command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSClusterCreateCommand);

    try {
      // Parse capacity providers
      const capacityProviders = flags["capacity-providers"]
        ? flags["capacity-providers"].split(",").map((provider) => provider.trim())
        : undefined;

      // Parse tags from CLI flags into ECS tag format (key-value pairs).
      const tags = flags.tags ? this.parseTags(flags.tags.flat()) : undefined;

      // Validate input using Zod schema
      const input: ECSCreateCluster = ECSCreateClusterSchema.parse({
        clusterName: args.clusterName,
        capacityProviders,
        tags,
        region: flags.region,
        profile: flags.profile,
        format: "json", // Default format for create operations
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

      // Create cluster parameters
      const createParameters = {
        clusterName: input.clusterName,
        ...(input.capacityProviders && { capacityProviders: input.capacityProviders }),
        ...(input.tags && { tags: input.tags }),
      };

      // Execute cluster creation via ECS service with validated parameters and credential context.
      const cluster = await ecsService.createCluster(createParameters, {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      });

      // Display success message with cluster details
      this.log(`Successfully created ECS cluster '${cluster.clusterName}'`);
      this.log(`  ARN: ${cluster.clusterArn}`);
      this.log(`  Status: ${cluster.status}`);

      if (input.verbose) {
        this.log("\nCluster Details:");
        this.log(JSON.stringify(cluster, undefined, 2));
      }
    } catch (error) {
      const formattedError = formatECSError(error, "create ECS cluster", flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Parse tag strings into tag objects
   *
   * @param tagStrings - Array of tag strings in key=value format
   * @returns Array of tag objects
   * @throws Error When tag format is invalid (not key=value)
   * @internal
   */
  private parseTags(tagStrings: string[]): Array<{ key: string; value: string }> {
    const tags: Array<{ key: string; value: string }> = [];

    for (const tagString of tagStrings) {
      const parts = tagString.split("=");
      if (parts.length !== 2) {
        throw new Error(`Invalid tag format: ${tagString}. Expected format: key=value`);
      }

      const [key, value] = parts;
      if (!key?.trim() || !value?.trim()) {
        throw new Error(`Invalid tag format: ${tagString}. Key and value cannot be empty`);
      }

      tags.push({
        key: key.trim(),
        value: value.trim(),
      });
    }

    return tags;
  }
}
