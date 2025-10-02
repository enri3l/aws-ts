/**
 * @module ecs/service/stop
 * ECS service stop command
 *
 * Stops an ECS service by scaling it to zero tasks
 * while preserving service configuration for future restart.
 *
 */

import { Args, Flags } from "@oclif/core";
import { getECSErrorGuidance } from "../../../lib/ecs-errors.js";
import type { ECSUpdateService } from "../../../lib/ecs-schemas.js";
import { ECSUpdateServiceSchema } from "../../../lib/ecs-schemas.js";
import { ECSService, type ServiceDescription } from "../../../services/ecs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * ECS service stop command for halting service tasks
 *
 * Stops an ECS service by scaling to zero tasks while
 * preserving the service configuration for future restart.
 *
 * @public
 */
export default class ECSServiceStopCommand extends BaseCommand {
  static override readonly description = "Stop an ECS service by scaling to zero tasks";

  static override readonly examples = [
    {
      description: "Stop a service in the default cluster",
      command: "<%= config.bin %> <%= command.id %> my-service",
    },
    {
      description: "Stop a service in specific cluster",
      command: "<%= config.bin %> <%= command.id %> my-service --cluster my-cluster",
    },
    {
      description: "Force stop without confirmation prompt",
      command: "<%= config.bin %> <%= command.id %> my-service --force",
    },
    {
      description: "Stop service in a specific region",
      command: "<%= config.bin %> <%= command.id %> my-service --region us-west-2",
    },
    {
      description: "Stop service with verbose monitoring",
      command: "<%= config.bin %> <%= command.id %> my-service --verbose",
    },
  ];

  static override readonly args = {
    serviceName: Args.string({
      name: "serviceName",
      description: "Name of the service to stop",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    cluster: Flags.string({
      char: "c",
      description: "Name of the cluster containing the service",
      helpValue: "CLUSTER_NAME",
    }),

    force: Flags.boolean({
      char: "f",
      description: "Force stop without confirmation prompt",
      default: false,
    }),
  };

  /**
   * Execute the ECS service stop command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSServiceStopCommand);

    try {
      // Validate input using Zod schema
      const input: ECSUpdateService = ECSUpdateServiceSchema.parse({
        serviceName: args.serviceName,
        clusterName: flags.cluster,
        desiredCount: 0,
        region: flags.region,
        profile: flags.profile,
        format: flags.format as "table" | "json" | "jsonl" | "csv",
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

      // Get current service state
      const currentServices = await ecsService.describeServices(
        [input.serviceName],
        {
          ...(input.clusterName && { cluster: input.clusterName }),
        },
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      if (currentServices.length === 0) {
        this.error(`Service '${input.serviceName}' not found in the specified cluster.`, {
          exit: 1,
        });
        return;
      }

      const currentService = currentServices[0]!;
      const currentDesiredCount = currentService.desiredCount;

      // Check if service is already stopped
      if (currentDesiredCount === 0) {
        this.log(`Service '${input.serviceName}' is already stopped (desired count: 0).`);
        return;
      }

      // Confirmation prompt (unless force is specified)
      if (!flags.force) {
        const { default: inquirer } = await import("inquirer");
        const response = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirmed",
            message: `Are you sure you want to stop service '${input.serviceName}'? This will stop all ${currentDesiredCount} tasks.`,
            default: false,
          },
        ]);

        if (!response.confirmed) {
          this.log("Service stop cancelled.");
          return;
        }
      }

      // Stop service by scaling to 0
      const service = await ecsService.updateService(
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

      // Display output and verbose information
      this.formatAndDisplayEcsOutput(input, service, currentDesiredCount);

      if (input.verbose) {
        this.displayVerboseInfo(input, service);
      }
    } catch (error) {
      const formattedError = this.formatECSError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Display service output in the specified format
   *
   * @param input - Parsed command input
   * @param service - Updated service information
   * @param currentDesiredCount - Previous desired count before stopping
   * @internal
   */
  private formatAndDisplayEcsOutput(
    input: ECSUpdateService,
    service: ServiceDescription,
    currentDesiredCount: number,
  ): void {
    switch (input.format) {
      case "table": {
        this.log(`Successfully stopped ECS service '${service.serviceName}'`);
        this.log(`  Service ARN: ${service.serviceArn}`);
        this.log(`  Cluster: ${service.clusterArn?.split("/").pop() || "Unknown"}`);
        this.log(`  Previous Desired Count: ${currentDesiredCount}`);
        this.log(`  New Desired Count: ${service.desiredCount}`);
        this.log(`  Current Running Count: ${service.runningCount}`);
        this.log(`  Current Pending Count: ${service.pendingCount}`);
        this.log(`  Status: ${service.status}`);

        this.log(
          `\nService stopped - all ${currentDesiredCount} tasks will be gracefully terminated`,
        );
        this.log(`\nTo restart the service later, use:`);
        const clusterArgument = input.clusterName ? ` --cluster ${input.clusterName}` : "";
        this.log(
          `   aws-ts ecs service scale ${service.serviceName} ${currentDesiredCount}${clusterArgument}`,
        );
        break;
      }

      case "json": {
        this.log(
          JSON.stringify(
            {
              serviceName: service.serviceName,
              serviceArn: service.serviceArn,
              clusterArn: service.clusterArn,
              previousDesiredCount: currentDesiredCount,
              newDesiredCount: service.desiredCount,
              runningCount: service.runningCount,
              pendingCount: service.pendingCount,
              status: service.status,
              stopped: true,
            },
            undefined,
            2,
          ),
        );
        break;
      }

      case "jsonl": {
        this.log(
          JSON.stringify({
            serviceName: service.serviceName,
            serviceArn: service.serviceArn,
            previousDesiredCount: currentDesiredCount,
            newDesiredCount: service.desiredCount,
            runningCount: service.runningCount,
            pendingCount: service.pendingCount,
            status: service.status,
            stopped: true,
          }),
        );
        break;
      }

      case "csv": {
        const headers = [
          "serviceName",
          "serviceArn",
          "previousDesiredCount",
          "newDesiredCount",
          "runningCount",
          "pendingCount",
          "status",
          "stopped",
        ];
        this.log(headers.join(","));

        const row = [
          `"${service.serviceName}"`,
          `"${service.serviceArn}"`,
          String(currentDesiredCount),
          String(service.desiredCount),
          String(service.runningCount),
          String(service.pendingCount),
          `"${service.status}"`,
          "true",
        ];
        this.log(row.join(","));
        break;
      }
    }
  }

  /**
   * Display verbose operation information
   *
   * @param input - Parsed command input
   * @param service - Updated service information
   * @internal
   */
  private displayVerboseInfo(input: ECSUpdateService, service: ServiceDescription): void {
    this.log(`\nStop operation initiated. Monitor progress with:`);
    const clusterPart = input.clusterName ? ` --cluster ${input.clusterName}` : "";
    this.log(`  aws-ts ecs service describe ${service.serviceName}${clusterPart}`);
    this.log(`\nTasks will be gracefully stopped. This may take several minutes.`);
    this.log(`The service configuration is preserved and can be restarted later.`);
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

    let formattedMessage = `Failed to stop ECS service: ${errorMessage}`;

    if (guidance) {
      formattedMessage += `\n\nGuidance: ${guidance}`;
    }

    if (verbose && error instanceof Error && error.stack) {
      formattedMessage += `\n\nStack trace:\n${error.stack}`;
    }

    return formattedMessage;
  }
}
