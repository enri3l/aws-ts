/**
 * ECS service scale command
 *
 * Scales an ECS service by updating the desired count
 * with monitoring and status reporting capabilities.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { getECSErrorGuidance } from "../../../lib/ecs-errors.js";
import type { ECSUpdateService } from "../../../lib/ecs-schemas.js";
import { ECSUpdateServiceSchema } from "../../../lib/ecs-schemas.js";
import { ECSService, type ServiceDescription } from "../../../services/ecs-service.js";

/**
 * ECS service scale command for adjusting service capacity
 *
 * Scales an ECS service to the specified desired count
 * with optional deployment monitoring and status reporting.
 *
 * @public
 */
export default class ECSServiceScaleCommand extends Command {
  static override readonly description = "Scale an ECS service to a desired count";

  static override readonly examples = [
    {
      description: "Scale service to 5 instances",
      command: "<%= config.bin %> <%= command.id %> my-service 5",
    },
    {
      description: "Scale service in specific cluster",
      command: "<%= config.bin %> <%= command.id %> my-service 3 --cluster my-cluster",
    },
    {
      description: "Scale down to 0 (stop all tasks)",
      command: "<%= config.bin %> <%= command.id %> my-service 0",
    },
    {
      description: "Scale service in a specific region",
      command: "<%= config.bin %> <%= command.id %> my-service 2 --region us-west-2",
    },
    {
      description: "Scale service with verbose monitoring",
      command: "<%= config.bin %> <%= command.id %> my-service 4 --verbose",
    },
  ];

  static override readonly args = {
    serviceName: Args.string({
      name: "serviceName",
      description: "Name of the service to scale",
      required: true,
    }),
    desiredCount: Args.integer({
      name: "desiredCount",
      description: "New desired number of tasks",
      required: true,
    }),
  };

  static override readonly flags = {
    cluster: Flags.string({
      char: "c",
      description: "Name of the cluster containing the service",
      helpValue: "CLUSTER_NAME",
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
      char: "f",
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
   * Execute the ECS service scale command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSServiceScaleCommand);

    try {
      this.validateDesiredCount(args.desiredCount);

      const input: ECSUpdateService = ECSUpdateServiceSchema.parse({
        serviceName: args.serviceName,
        clusterName: flags.cluster,
        desiredCount: args.desiredCount,
        region: flags.region,
        profile: flags.profile,
        format: flags.format as "table" | "json" | "jsonl" | "csv",
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

      const currentService = await this.getCurrentService(ecsService, input);
      const previousCount = currentService.desiredCount;

      if (this.checkScalingNeeded(input.serviceName, previousCount, args.desiredCount)) {
        return;
      }

      const scaledService = await this.scaleService(ecsService, input);

      this.displayScaleResult(scaledService, previousCount, args.desiredCount, input);

      if (input.verbose) {
        this.displayVerboseInformation(scaledService, input, previousCount, args.desiredCount);
      }
    } catch (error) {
      const formattedError = this.formatECSError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Validate desired count is within allowed range
   *
   * @param desiredCount - Desired count to validate
   * @throws Error when desired count is invalid
   * @internal
   */
  private validateDesiredCount(desiredCount: number): void {
    if (desiredCount < 0) {
      throw new Error("Desired count cannot be negative");
    }

    if (desiredCount > 10_000) {
      throw new Error("Desired count cannot exceed 10,000 tasks");
    }
  }

  /**
   * Get current service state
   *
   * @param ecsService - ECS service instance
   * @param input - Validated input parameters
   * @returns Current service description
   * @internal
   */
  private async getCurrentService(
    ecsService: ECSService,
    input: ECSUpdateService,
  ): Promise<ServiceDescription> {
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
    }

    return currentServices[0]!;
  }

  /**
   * Check if scaling is needed
   *
   * @param serviceName - Name of the service
   * @param previousCount - Current desired count
   * @param newDesiredCount - New desired count
   * @returns True if scaling is not needed (early exit)
   * @internal
   */
  private checkScalingNeeded(
    serviceName: string,
    previousCount: number,
    newDesiredCount: number,
  ): boolean {
    if (previousCount === newDesiredCount) {
      this.log(`Service '${serviceName}' is already scaled to ${newDesiredCount} tasks.`);
      return true;
    }
    return false;
  }

  /**
   * Scale the ECS service
   *
   * @param ecsService - ECS service instance
   * @param input - Validated input parameters
   * @returns Scaled service description
   * @internal
   */
  private async scaleService(
    ecsService: ECSService,
    input: ECSUpdateService,
  ): Promise<ServiceDescription> {
    return await ecsService.updateService(
      {
        service: input.serviceName,
        ...(input.clusterName && { cluster: input.clusterName }),
        desiredCount: input.desiredCount,
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );
  }

  /**
   * Display scaling result in specified format
   *
   * @param service - Scaled service description
   * @param previousCount - Previous desired count
   * @param newDesiredCount - New desired count
   * @param input - Validated input parameters
   * @internal
   */
  private displayScaleResult(
    service: ServiceDescription,
    previousCount: number,
    newDesiredCount: number,
    input: ECSUpdateService,
  ): void {
    switch (input.format) {
      case "table": {
        this.displayTableResult(service, previousCount, newDesiredCount);
        break;
      }
      case "json": {
        this.displayJsonResult(service, previousCount);
        break;
      }
      case "jsonl": {
        this.displayJsonLinesResult(service, previousCount);
        break;
      }
      case "csv": {
        this.displayCsvResult(service, previousCount);
        break;
      }
    }
  }

  /**
   * Display result in table format
   *
   * @param service - Scaled service description
   * @param previousCount - Previous desired count
   * @param newDesiredCount - New desired count
   * @internal
   */
  private displayTableResult(
    service: ServiceDescription,
    previousCount: number,
    newDesiredCount: number,
  ): void {
    const action = newDesiredCount > previousCount ? "scaled up" : "scaled down";
    this.log(`Successfully ${action} ECS service '${service.serviceName}'`);
    this.log(`  Previous Desired Count: ${previousCount}`);
    this.log(`  New Desired Count: ${service.desiredCount}`);
    this.log(`  Current Running Count: ${service.runningCount}`);
    this.log(`  Current Pending Count: ${service.pendingCount}`);
    this.log(`  Status: ${service.status}`);
    this.log(`  Cluster: ${service.clusterArn.split("/").pop() || "Unknown"}`);

    if (newDesiredCount === 0) {
      this.log("\nService scaled to 0 - all tasks will be stopped");
    } else if (newDesiredCount > previousCount) {
      this.log(
        `\n Scaling up: ${newDesiredCount - previousCount} additional tasks will be started`,
      );
    } else {
      this.log(`\n Scaling down: ${previousCount - newDesiredCount} tasks will be stopped`);
    }
  }

  /**
   * Display result in JSON format
   *
   * @param service - Scaled service description
   * @param previousCount - Previous desired count
   * @internal
   */
  private displayJsonResult(service: ServiceDescription, previousCount: number): void {
    this.log(
      JSON.stringify(
        {
          serviceName: service.serviceName,
          previousDesiredCount: previousCount,
          newDesiredCount: service.desiredCount,
          runningCount: service.runningCount,
          pendingCount: service.pendingCount,
          status: service.status,
          serviceArn: service.serviceArn,
        },
        undefined,
        2,
      ),
    );
  }

  /**
   * Display result in JSONL format
   *
   * @param service - Scaled service description
   * @param previousCount - Previous desired count
   * @internal
   */
  private displayJsonLinesResult(service: ServiceDescription, previousCount: number): void {
    this.log(
      JSON.stringify({
        serviceName: service.serviceName,
        previousDesiredCount: previousCount,
        newDesiredCount: service.desiredCount,
        runningCount: service.runningCount,
        pendingCount: service.pendingCount,
        status: service.status,
        serviceArn: service.serviceArn,
      }),
    );
  }

  /**
   * Display result in CSV format
   *
   * @param service - Scaled service description
   * @param previousCount - Previous desired count
   * @internal
   */
  private displayCsvResult(service: ServiceDescription, previousCount: number): void {
    const headers = [
      "serviceName",
      "previousDesiredCount",
      "newDesiredCount",
      "runningCount",
      "pendingCount",
      "status",
    ];
    this.log(headers.join(","));

    const row = [
      `"${service.serviceName}"`,
      String(previousCount),
      String(service.desiredCount),
      String(service.runningCount),
      String(service.pendingCount),
      `"${service.status}"`,
    ];
    this.log(row.join(","));
  }

  /**
   * Display verbose information about the scaling operation
   *
   * @param service - Scaled service description
   * @param input - Validated input parameters
   * @param previousCount - Previous desired count
   * @param newDesiredCount - New desired count
   * @internal
   */
  private displayVerboseInformation(
    service: ServiceDescription,
    input: ECSUpdateService,
    previousCount: number,
    newDesiredCount: number,
  ): void {
    this.log(`\nScaling operation initiated. Monitor progress with:`);
    const clusterPart = input.clusterName ? ` --cluster ${input.clusterName}` : "";
    this.log(`  aws-ts ecs service describe ${service.serviceName}${clusterPart}`);

    if (newDesiredCount > previousCount) {
      this.log(`\nTasks will be started gradually. Full scaling may take several minutes.`);
    } else if (newDesiredCount < previousCount) {
      this.log(`\nTasks will be gracefully stopped. Scaling down may take several minutes.`);
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

    let formattedMessage = `Failed to scale ECS service: ${errorMessage}`;

    if (guidance) {
      formattedMessage += `\n\nGuidance: ${guidance}`;
    }

    if (verbose && error instanceof Error && error.stack) {
      formattedMessage += `\n\nStack trace:\n${error.stack}`;
    }

    return formattedMessage;
  }
}
