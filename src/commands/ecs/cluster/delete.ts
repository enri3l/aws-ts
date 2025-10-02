/**
 * @module ecs/cluster/delete
 * ECS cluster delete command
 *
 * Deletes an ECS cluster with safety confirmations and dependency checking
 * to ensure proper resource cleanup and prevent accidental deletions.
 *
 */

import { Args, Flags } from "@oclif/core";
import { formatECSError } from "../../../lib/ecs-errors.js";
import type { ECSDeleteCluster } from "../../../lib/ecs-schemas.js";
import { ECSDeleteClusterSchema } from "../../../lib/ecs-schemas.js";
import { ECSService } from "../../../services/ecs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * ECS cluster delete command for removing clusters
 *
 * Deletes an ECS cluster with optional force deletion for clusters
 * containing active services or tasks. Includes safety prompts and dependency checking.
 *
 * @public
 */
export default class ECSClusterDeleteCommand extends BaseCommand {
  static override readonly description = "Delete an ECS cluster";

  static override readonly examples = [
    {
      description: "Delete a cluster with confirmation prompt",
      command: "<%= config.bin %> <%= command.id %> my-cluster",
    },
    {
      description: "Force delete a cluster without confirmation",
      command: "<%= config.bin %> <%= command.id %> my-cluster --force",
    },
    {
      description: "Delete a cluster in a specific region",
      command: "<%= config.bin %> <%= command.id %> my-cluster --region us-west-2",
    },
    {
      description: "Delete a cluster using a specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> my-cluster --profile production",
    },
    {
      description: "Delete a cluster with verbose debug information",
      command: "<%= config.bin %> <%= command.id %> my-cluster --verbose",
    },
  ];

  static override readonly args = {
    clusterName: Args.string({
      name: "clusterName",
      description: "Name of the cluster to delete",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    force: Flags.boolean({
      char: "f",
      description: "Force deletion without confirmation prompts",
      default: false,
    }),
  };

  /**
   * Execute the ECS cluster delete command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSClusterDeleteCommand);

    try {
      // Validate input using Zod schema
      const input: ECSDeleteCluster = ECSDeleteClusterSchema.parse({
        clusterName: args.clusterName,
        force: flags.force,
        region: flags.region,
        profile: flags.profile,
        format: "json", // Default format for delete operations
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

      // Check cluster status and dependencies before deletion
      const clusters = await ecsService.describeClusters([input.clusterName], {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      });

      if (clusters.length === 0) {
        this.error(`Cluster '${input.clusterName}' not found in the specified region.`, {
          exit: 1,
        });
        return;
      }

      const clusterInfo = clusters[0]!; // Non-null assertion since we checked length above

      // Check for active resources
      const hasActiveResources =
        clusterInfo.activeServicesCount > 0 ||
        clusterInfo.runningTasksCount > 0 ||
        clusterInfo.pendingTasksCount > 0;

      if (hasActiveResources && !input.force) {
        this.log(`\nCluster '${input.clusterName}' contains active resources:`);
        this.log(`  Active Services: ${clusterInfo.activeServicesCount}`);
        this.log(`  Running Tasks: ${clusterInfo.runningTasksCount}`);
        this.log(`  Pending Tasks: ${clusterInfo.pendingTasksCount}`);
        this.log("\nDeletion may fail if services or tasks are still active.");
        this.log("Consider scaling services to 0 or use --force to attempt deletion anyway.\n");
      }

      // Confirmation prompt (unless force is specified)
      if (!input.force) {
        const { default: inquirer } = await import("inquirer");
        const response = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirmed",
            message: `Are you sure you want to delete cluster '${input.clusterName}'?`,
            default: false,
          },
        ]);

        if (!response.confirmed) {
          this.log("Cluster deletion cancelled.");
          return;
        }
      }

      // Execute cluster deletion via ECS service after confirmation and validation checks.
      await ecsService.deleteCluster(input.clusterName, {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      });

      this.log(`Successfully deleted ECS cluster '${input.clusterName}'`);

      if (input.verbose) {
        this.log("\nDeletion Details:");
        this.log(`  Cluster ARN: ${clusterInfo.clusterArn}`);
        this.log(`  Previous Status: ${clusterInfo.status}`);
        this.log(`  Active Services Removed: ${clusterInfo.activeServicesCount}`);
        this.log(`  Container Instances Removed: ${clusterInfo.registeredContainerInstancesCount}`);
      }
    } catch (error) {
      const formattedError = formatECSError(error, "delete ECS cluster", flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }
}
