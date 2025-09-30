/**
 * ECS service restart command
 *
 * Restarts an ECS service by forcing a new deployment
 * without changing the task definition or configuration.
 *
 */

import { Args, Flags } from "@oclif/core";
import { getECSErrorGuidance } from "../../../lib/ecs-errors.js";
import type { ECSUpdateService } from "../../../lib/ecs-schemas.js";
import { ECSUpdateServiceSchema } from "../../../lib/ecs-schemas.js";
import { ECSService, type ServiceDescription } from "../../../services/ecs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * ECS service restart command for forcing new deployments
 *
 * Restarts an ECS service by triggering a new deployment
 * with the current task definition and configuration.
 *
 * @public
 */
export default class ECSServiceRestartCommand extends BaseCommand {
  static override readonly description = "Restart an ECS service by forcing a new deployment";

  static override readonly examples = [
    {
      description: "Restart a service in the default cluster",
      command: "<%= config.bin %> <%= command.id %> my-service",
    },
    {
      description: "Restart a service in specific cluster",
      command: "<%= config.bin %> <%= command.id %> my-service --cluster my-cluster",
    },
    {
      description: "Restart service without confirmation prompt",
      command: "<%= config.bin %> <%= command.id %> my-service --force",
    },
    {
      description: "Restart service in a specific region",
      command: "<%= config.bin %> <%= command.id %> my-service --region us-west-2",
    },
    {
      description: "Restart service with verbose monitoring",
      command: "<%= config.bin %> <%= command.id %> my-service --verbose",
    },
  ];

  static override readonly args = {
    serviceName: Args.string({
      name: "serviceName",
      description: "Name of the service to restart",
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
      description: "Force restart without confirmation prompt",
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

    format: Flags.string({
      char: "o",
      description: "Output format",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
      helpValue: "FORMAT",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the ECS service restart command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSServiceRestartCommand);

    try {
      // Validate input using Zod schema
      const input: ECSUpdateService = ECSUpdateServiceSchema.parse({
        serviceName: args.serviceName,
        clusterName: flags.cluster,
        forceNewDeployment: true,
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

      // Get current service info
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

      // Confirmation prompt (unless force is specified)
      if (!flags.force) {
        const { default: inquirer } = await import("inquirer");
        const response = await inquirer.prompt([
          {
            type: "confirm",
            name: "confirmed",
            message: `Are you sure you want to restart service '${input.serviceName}'? This will redeploy all tasks.`,
            default: false,
          },
        ]);

        if (!response.confirmed) {
          this.log("Service restart cancelled.");
          return;
        }
      }

      // Restart service by forcing new deployment
      const service = await ecsService.updateService(
        {
          service: input.serviceName,
          ...(input.clusterName && { cluster: input.clusterName }),
          forceNewDeployment: true,
        },
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      // Display output and verbose information
      this.formatAndDisplayEcsOutput(input, service);

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
   * @param input - Validated input parameters
   * @param service - Updated service information
   * @internal
   */
  private formatAndDisplayEcsOutput(input: ECSUpdateService, service: ServiceDescription): void {
    switch (input.format) {
      case "table": {
        this.log(`Successfully restarted ECS service '${service.serviceName}'`);
        this.log(`  Service ARN: ${service.serviceArn}`);
        this.log(`  Cluster: ${service.clusterArn?.split("/").pop() || "Unknown"}`);
        this.log(`  Status: ${service.status}`);
        this.log(`  Desired Count: ${service.desiredCount}`);
        this.log(`  Running Count: ${service.runningCount}`);
        this.log(`  Pending Count: ${service.pendingCount}`);
        this.log(`  Task Definition: ${service.taskDefinition}`);
        this.log(`\n Service restart initiated - new deployment in progress`);
        break;
      }

      case "json": {
        this.log(
          JSON.stringify(
            {
              serviceName: service.serviceName,
              serviceArn: service.serviceArn,
              clusterArn: service.clusterArn,
              status: service.status,
              desiredCount: service.desiredCount,
              runningCount: service.runningCount,
              pendingCount: service.pendingCount,
              taskDefinition: service.taskDefinition,
              restarted: true,
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
            status: service.status,
            desiredCount: service.desiredCount,
            runningCount: service.runningCount,
            pendingCount: service.pendingCount,
            restarted: true,
          }),
        );
        break;
      }

      case "csv": {
        const headers = [
          "serviceName",
          "serviceArn",
          "status",
          "desiredCount",
          "runningCount",
          "pendingCount",
          "restarted",
        ];
        this.log(headers.join(","));

        const row = [
          `"${service.serviceName}"`,
          `"${service.serviceArn}"`,
          `"${service.status}"`,
          String(service.desiredCount),
          String(service.runningCount),
          String(service.pendingCount),
          "true",
        ];
        this.log(row.join(","));
        break;
      }
    }
  }

  /**
   * Display verbose service information
   *
   * @param input - Validated input parameters
   * @param service - Updated service information
   * @internal
   */
  private displayVerboseInfo(input: ECSUpdateService, service: ServiceDescription): void {
    this.log(`\nRestart operation details:`);
    this.log(`Service Name: ${service.serviceName}`);
    this.log(`Service ARN: ${service.serviceArn}`);
    this.log(`Cluster ARN: ${service.clusterArn}`);
    this.log(`Task Definition: ${service.taskDefinition}`);
    this.log(`Platform Version: ${service.platformVersion || "LATEST"}`);

    if (service.loadBalancers && service.loadBalancers.length > 0) {
      this.log(`Load Balancers: ${service.loadBalancers.length} configured`);
    }

    if (service.serviceRegistries && service.serviceRegistries.length > 0) {
      this.log(`Service Registries: ${service.serviceRegistries.length} configured`);
    }

    this.log(`\nMonitor restart progress with:`);
    const clusterPart = input.clusterName ? ` --cluster ${input.clusterName}` : "";
    this.log(`  aws-ts ecs service describe ${service.serviceName}${clusterPart}`);
    this.log(`\nTasks will be replaced gradually. Full restart may take several minutes.`);
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

    let formattedMessage = `Failed to restart ECS service: ${errorMessage}`;

    if (guidance) {
      formattedMessage += `\n\nGuidance: ${guidance}`;
    }

    if (verbose && error instanceof Error && error.stack) {
      formattedMessage += `\n\nStack trace:\n${error.stack}`;
    }

    return formattedMessage;
  }
}
