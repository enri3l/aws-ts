/**
 * ECS service delete command
 *
 * Deletes an ECS service with safety confirmations and proper
 * scaling down to ensure clean resource removal.
 *
 */

import { Args, Flags } from "@oclif/core";
import { getECSErrorGuidance } from "../../../lib/ecs-errors.js";
import type { ECSDeleteService } from "../../../lib/ecs-schemas.js";
import { ECSDeleteServiceSchema } from "../../../lib/ecs-schemas.js";
import { ECSService, type ServiceDescription } from "../../../services/ecs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * ECS service delete command for removing services
 *
 * Deletes an ECS service with optional force deletion and
 * automatic scaling to zero before removal.
 *
 * @public
 */
export default class ECSServiceDeleteCommand extends BaseCommand {
  static override readonly description = "Delete an ECS service";

  static override readonly examples = [
    {
      description: "Delete a service with confirmation prompt",
      command: "<%= config.bin %> <%= command.id %> my-service",
    },
    {
      description: "Force delete a service without confirmation",
      command: "<%= config.bin %> <%= command.id %> my-service --force",
    },
    {
      description: "Delete service in specific cluster",
      command: "<%= config.bin %> <%= command.id %> my-service --cluster my-cluster",
    },
    {
      description: "Delete service in a specific region",
      command: "<%= config.bin %> <%= command.id %> my-service --region us-west-2",
    },
    {
      description: "Delete service with verbose debug information",
      command: "<%= config.bin %> <%= command.id %> my-service --verbose",
    },
  ];

  static override readonly args = {
    serviceName: Args.string({
      name: "serviceName",
      description: "Name of the service to delete",
      required: true,
    }),
  };

  static override readonly flags = {
    cluster: Flags.string({
      char: "c",
      description: "Name of the cluster containing the service",
      helpValue: "CLUSTER_NAME",
    }),

    force: Flags.boolean({
      char: "f",
      description: "Force deletion without confirmation prompts",
      default: false,
    }),

    region: Flags.string({
      char: "r",
      description: "AWS region",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the ECS service delete command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSServiceDeleteCommand);

    try {
      const input: ECSDeleteService = ECSDeleteServiceSchema.parse({
        serviceName: args.serviceName,
        clusterName: flags.cluster,
        force: flags.force,
        region: flags.region,
        profile: flags.profile,
        format: "json", // Default format for delete operations
        verbose: flags.verbose,
      });

      const ecsService = new ECSService({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      const serviceInfo = await this.validateAndGetService(ecsService, input);
      const hasRunningTasks = this.checkRunningTasks(serviceInfo);

      if (hasRunningTasks && !input.force) {
        this.displayActiveTasksWarning(serviceInfo, input.serviceName);
      }

      const confirmed = await this.confirmDeletion(input);
      if (!confirmed) {
        return;
      }

      if (hasRunningTasks && input.force) {
        await this.scaleDownService(ecsService, input);
      }

      await this.deleteService(ecsService, input);

      this.displayDeletionResult(serviceInfo, input, hasRunningTasks);
    } catch (error) {
      const formattedError = this.formatECSError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Validate service exists and get service information
   *
   * @param ecsService - ECS service instance
   * @param input - Validated input parameters
   * @returns Service description
   * @internal
   */
  private async validateAndGetService(
    ecsService: ECSService,
    input: ECSDeleteService,
  ): Promise<ServiceDescription> {
    const services = await ecsService.describeServices(
      [input.serviceName],
      {
        ...(input.clusterName && { cluster: input.clusterName }),
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );

    if (services.length === 0) {
      this.error(`Service '${input.serviceName}' not found in the specified cluster.`, {
        exit: 1,
      });
    }

    return services[0]!;
  }

  /**
   * Check if service has running tasks
   *
   * @param serviceInfo - Service description
   * @returns True if service has running or pending tasks
   * @internal
   */
  private checkRunningTasks(serviceInfo: ServiceDescription): boolean {
    return serviceInfo.runningCount > 0 || serviceInfo.pendingCount > 0;
  }

  /**
   * Display warning about active tasks
   *
   * @param serviceInfo - Service description
   * @param serviceName - Service name
   * @internal
   */
  private displayActiveTasksWarning(serviceInfo: ServiceDescription, serviceName: string): void {
    this.log(`\nService '${serviceName}' has active tasks:`);
    this.log(`  Running Tasks: ${serviceInfo.runningCount}`);
    this.log(`  Pending Tasks: ${serviceInfo.pendingCount}`);
    this.log(`  Desired Count: ${serviceInfo.desiredCount}`);
    this.log("\nService must be scaled to 0 before deletion.");
    this.log("Use --force to automatically scale down and delete, or scale manually first.\n");
  }

  /**
   * Confirm deletion with user
   *
   * @param input - Validated input parameters
   * @returns True if deletion is confirmed or forced
   * @internal
   */
  private async confirmDeletion(input: ECSDeleteService): Promise<boolean> {
    if (input.force) {
      return true;
    }

    const { default: inquirer } = await import("inquirer");
    const response = await inquirer.prompt<{ confirmed: boolean }>([
      {
        type: "confirm",
        name: "confirmed",
        message: `Are you sure you want to delete service '${input.serviceName}'?`,
        default: false,
      },
    ]);

    if (!response.confirmed) {
      this.log("Service deletion cancelled.");
      return false;
    }

    return true;
  }

  /**
   * Scale down service to zero before deletion
   *
   * @param ecsService - ECS service instance
   * @param input - Validated input parameters
   * @internal
   */
  private async scaleDownService(ecsService: ECSService, input: ECSDeleteService): Promise<void> {
    this.log(`Scaling service '${input.serviceName}' to 0 tasks before deletion...`);

    await ecsService.updateService(
      {
        service: input.serviceName,
        ...(input.clusterName && { cluster: input.clusterName }),
        desiredCount: 0,
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );

    // Wait a moment for scaling to begin
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  /**
   * Delete the ECS service
   *
   * @param ecsService - ECS service instance
   * @param input - Validated input parameters
   * @internal
   */
  private async deleteService(ecsService: ECSService, input: ECSDeleteService): Promise<void> {
    await ecsService.deleteService(
      input.serviceName,
      {
        ...(input.clusterName && { cluster: input.clusterName }),
        force: input.force,
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );
  }

  /**
   * Display deletion result and verbose information
   *
   * @param serviceInfo - Service description
   * @param input - Validated input parameters
   * @param hasRunningTasks - Whether service had running tasks
   * @internal
   */
  private displayDeletionResult(
    serviceInfo: ServiceDescription,
    input: ECSDeleteService,
    hasRunningTasks: boolean,
  ): void {
    this.log(`Successfully deleted ECS service '${input.serviceName}'`);

    if (input.verbose) {
      this.displayVerboseDeletionInfo(serviceInfo, input, hasRunningTasks);
    }
  }

  /**
   * Display verbose deletion information
   *
   * @param serviceInfo - Service description
   * @param input - Validated input parameters
   * @param hasRunningTasks - Whether service had running tasks
   * @internal
   */
  private displayVerboseDeletionInfo(
    serviceInfo: ServiceDescription,
    input: ECSDeleteService,
    hasRunningTasks: boolean,
  ): void {
    this.log("\nDeletion Details:");
    this.log(`  Service ARN: ${serviceInfo.serviceArn}`);
    this.log(`  Previous Status: ${serviceInfo.status}`);
    this.log(`  Previous Desired Count: ${serviceInfo.desiredCount}`);
    this.log(`  Cluster: ${serviceInfo.clusterArn.split("/").pop() || "Unknown"}`);

    if (hasRunningTasks && input.force) {
      this.log(`  Scaled down from ${serviceInfo.desiredCount} tasks before deletion`);
    }
  }

  /**
   * Format ECS errors with user-friendly guidance
   *
   * @param error - The error to format
   * @param verbose - Whether to include verbose error details
   * @returns Formatted error message
   * @internal
   */
  private formatECSError(error: unknown, verbose: boolean): string {
    const guidance = getECSErrorGuidance(error);
    const errorMessage = error instanceof Error ? error.message : String(error);

    let formattedMessage = `Failed to delete ECS service: ${errorMessage}`;

    if (guidance) {
      formattedMessage += `\n\nGuidance: ${guidance}`;
    }

    if (verbose && error instanceof Error && error.stack) {
      formattedMessage += `\n\nStack trace:\n${error.stack}`;
    }

    return formattedMessage;
  }
}
