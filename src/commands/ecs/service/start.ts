/**
 * ECS service start command
 *
 * Starts a stopped ECS service by restoring it to its
 * previous desired count or a specified target count.
 *
 */

import type { Interfaces } from "@oclif/core";
import { Args, Command, Flags } from "@oclif/core";
import { getECSErrorGuidance } from "../../../lib/ecs-errors.js";
import type { ECSUpdateService } from "../../../lib/ecs-schemas.js";
import { ECSUpdateServiceSchema } from "../../../lib/ecs-schemas.js";
import { ECSService, type ServiceDescription } from "../../../services/ecs-service.js";

/**
 * ECS service start command for resuming service tasks
 *
 * Starts a stopped ECS service by scaling to a specified
 * desired count, typically used after a service stop operation.
 *
 * @public
 */
export default class ECSServiceStartCommand extends Command {
  static override readonly description = "Start a stopped ECS service";

  static override readonly examples = [
    {
      description: "Start service with 1 task",
      command: "<%= config.bin %> <%= command.id %> my-service",
    },
    {
      description: "Start service with specific task count",
      command: "<%= config.bin %> <%= command.id %> my-service --desired-count 3",
    },
    {
      description: "Start service in specific cluster",
      command:
        "<%= config.bin %> <%= command.id %> my-service --cluster my-cluster --desired-count 2",
    },
    {
      description: "Start service in a specific region",
      command: "<%= config.bin %> <%= command.id %> my-service --region us-west-2",
    },
    {
      description: "Start service with verbose monitoring",
      command: "<%= config.bin %> <%= command.id %> my-service --desired-count 5 --verbose",
    },
  ];

  static override readonly args = {
    serviceName: Args.string({
      name: "serviceName",
      description: "Name of the service to start",
      required: true,
    }),
  };

  static override readonly flags = {
    cluster: Flags.string({
      char: "c",
      description: "Name of the cluster containing the service",
      helpValue: "CLUSTER_NAME",
    }),

    "desired-count": Flags.integer({
      description: "Number of tasks to run (defaults to 1 if service is stopped)",
      helpValue: "COUNT",
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
   * Execute the ECS service start command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSServiceStartCommand);

    try {
      const ecsService = new ECSService({
        enableDebugLogging: flags.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(flags.region && { region: flags.region }),
          ...(flags.profile && { profile: flags.profile }),
        },
      });

      const currentService = await this.validateAndGetCurrentService(
        ecsService,
        args.serviceName,
        flags,
      );

      const targetCount = this.determineTargetCount(
        currentService.desiredCount,
        flags["desired-count"],
        args.serviceName,
      );

      if (targetCount === undefined) {
        return; // Early exit - service already running or no change needed
      }

      const input: ECSUpdateService = ECSUpdateServiceSchema.parse({
        serviceName: args.serviceName,
        clusterName: flags.cluster,
        desiredCount: targetCount,
        region: flags.region,
        profile: flags.profile,
        format: flags.format as "table" | "json" | "jsonl" | "csv",
        verbose: flags.verbose,
      });

      const updatedService = await this.updateServiceDesiredCount(ecsService, input, targetCount);

      this.displayStartResult(updatedService, currentService.desiredCount, targetCount, input);
    } catch (error) {
      const formattedError = this.formatECSError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Validate service exists and get current state
   *
   * @param ecsService - ECS service instance
   * @param serviceName - Service name to validate
   * @param flags - Command flags
   * @returns Current service description
   * @internal
   */
  private async validateAndGetCurrentService(
    ecsService: ECSService,
    serviceName: string,
    flags: Interfaces.InferredFlags<typeof ECSServiceStartCommand.flags>,
  ): Promise<ServiceDescription> {
    const currentServices = await ecsService.describeServices(
      [serviceName],
      {
        ...(flags.cluster && { cluster: flags.cluster }),
      },
      {
        ...(flags.region && { region: flags.region }),
        ...(flags.profile && { profile: flags.profile }),
      },
    );

    if (currentServices.length === 0) {
      this.error(`Service '${serviceName}' not found in the specified cluster.`, {
        exit: 1,
      });
    }

    return currentServices[0]!;
  }

  /**
   * Determine target desired count for service start
   *
   * @param currentDesiredCount - Current service desired count
   * @param flagDesiredCount - Desired count from flags
   * @param serviceName - Service name for messages
   * @returns Target count or undefined if no action needed
   * @throws Error When target count validation fails
   * @internal
   */
  private determineTargetCount(
    currentDesiredCount: number,
    flagDesiredCount: number | undefined,
    serviceName: string,
  ): number | undefined {
    let targetCount: number;

    if (flagDesiredCount !== undefined) {
      targetCount = flagDesiredCount;
    } else if (currentDesiredCount === 0) {
      targetCount = 1; // Default to 1 if service is stopped and no count specified
    } else {
      // Service is already running
      this.log(
        `Service '${serviceName}' is already running with ${currentDesiredCount} desired tasks.`,
      );
      this.log(`Use --desired-count to change the number of running tasks.`);
      return undefined;
    }

    this.validateTargetCount(targetCount);

    // Check if scaling is needed
    if (currentDesiredCount === targetCount) {
      this.log(`Service '${serviceName}' is already running with ${targetCount} desired tasks.`);
      return undefined;
    }

    return targetCount;
  }

  /**
   * Validate target count is within allowed range
   *
   * @param targetCount - Target count to validate
   * @throws Error When target count is negative or exceeds 10,000
   * @internal
   */
  private validateTargetCount(targetCount: number): void {
    if (targetCount < 0) {
      throw new Error("Desired count cannot be negative");
    }

    if (targetCount > 10_000) {
      throw new Error("Desired count cannot exceed 10,000 tasks");
    }
  }

  /**
   * Update service desired count
   *
   * @param ecsService - ECS service instance
   * @param input - Validated input parameters
   * @param targetCount - Target desired count
   * @returns Updated service description
   * @internal
   */
  private async updateServiceDesiredCount(
    ecsService: ECSService,
    input: ECSUpdateService,
    targetCount: number,
  ): Promise<ServiceDescription> {
    return await ecsService.updateService(
      {
        service: input.serviceName,
        ...(input.clusterName && { cluster: input.clusterName }),
        desiredCount: targetCount,
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );
  }

  /**
   * Display service start result in requested format
   *
   * @param service - Updated service description
   * @param previousCount - Previous desired count
   * @param targetCount - New target count
   * @param input - Validated input parameters
   * @internal
   */
  private displayStartResult(
    service: ServiceDescription,
    previousCount: number,
    targetCount: number,
    input: ECSUpdateService,
  ): void {
    switch (input.format) {
      case "table": {
        this.displayTableResult(service, previousCount, targetCount);
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

    if (input.verbose) {
      this.displayVerboseOutput(service, input.clusterName);
    }
  }

  /**
   * Display result in table format
   *
   * @param service - Service description
   * @param previousCount - Previous desired count
   * @param targetCount - New target count
   * @internal
   */
  private displayTableResult(
    service: ServiceDescription,
    previousCount: number,
    targetCount: number,
  ): void {
    this.log(`Successfully started ECS service '${service.serviceName}'`);
    this.log(`  Service ARN: ${service.serviceArn}`);
    this.log(`  Cluster: ${service.clusterArn.split("/").pop() || "Unknown"}`);
    this.log(`  Previous Desired Count: ${previousCount}`);
    this.log(`  New Desired Count: ${service.desiredCount}`);
    this.log(`  Current Running Count: ${service.runningCount}`);
    this.log(`  Current Pending Count: ${service.pendingCount}`);
    this.log(`  Status: ${service.status}`);
    this.log(`  Task Definition: ${service.taskDefinition}`);

    if (previousCount === 0) {
      this.log(
        `\nService started - ${targetCount} task${targetCount === 1 ? "" : "s"} will be launched`,
      );
    } else {
      this.log(
        `\n Service scaled up - ${targetCount - previousCount} additional task${targetCount - previousCount === 1 ? "" : "s"} will be launched`,
      );
    }
  }

  /**
   * Display result in JSON format
   *
   * @param service - Service description
   * @param previousCount - Previous desired count
   * @internal
   */
  private displayJsonResult(service: ServiceDescription, previousCount: number): void {
    this.log(
      JSON.stringify(
        {
          serviceName: service.serviceName,
          serviceArn: service.serviceArn,
          clusterArn: service.clusterArn,
          previousDesiredCount: previousCount,
          newDesiredCount: service.desiredCount,
          runningCount: service.runningCount,
          pendingCount: service.pendingCount,
          status: service.status,
          taskDefinition: service.taskDefinition,
          started: true,
        },
        undefined,
        2,
      ),
    );
  }

  /**
   * Display result in JSONL format
   *
   * @param service - Service description
   * @param previousCount - Previous desired count
   * @internal
   */
  private displayJsonLinesResult(service: ServiceDescription, previousCount: number): void {
    this.log(
      JSON.stringify({
        serviceName: service.serviceName,
        serviceArn: service.serviceArn,
        previousDesiredCount: previousCount,
        newDesiredCount: service.desiredCount,
        runningCount: service.runningCount,
        pendingCount: service.pendingCount,
        status: service.status,
        started: true,
      }),
    );
  }

  /**
   * Display result in CSV format
   *
   * @param service - Service description
   * @param previousCount - Previous desired count
   * @internal
   */
  private displayCsvResult(service: ServiceDescription, previousCount: number): void {
    const headers = [
      "serviceName",
      "serviceArn",
      "previousDesiredCount",
      "newDesiredCount",
      "runningCount",
      "pendingCount",
      "status",
      "started",
    ];
    this.log(headers.join(","));

    const row = [
      `"${service.serviceName}"`,
      `"${service.serviceArn}"`,
      String(previousCount),
      String(service.desiredCount),
      String(service.runningCount),
      String(service.pendingCount),
      `"${service.status}"`,
      "true",
    ];
    this.log(row.join(","));
  }

  /**
   * Display verbose output with monitoring guidance
   *
   * @param service - Service description
   * @param clusterName - Cluster name if provided
   * @internal
   */
  private displayVerboseOutput(service: ServiceDescription, clusterName?: string): void {
    this.log(`\nStart operation initiated. Monitor progress with:`);
    const clusterPart = clusterName ? ` --cluster ${clusterName}` : "";
    this.log(`  aws-ts ecs service describe ${service.serviceName}${clusterPart}`);
    this.log(`\nTasks will be started gradually. Full startup may take several minutes.`);
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

    let formattedMessage = `Failed to start ECS service: ${errorMessage}`;

    if (guidance) {
      formattedMessage += `\n\nGuidance: ${guidance}`;
    }

    if (verbose && error instanceof Error && error.stack) {
      formattedMessage += `\n\nStack trace:\n${error.stack}`;
    }

    return formattedMessage;
  }
}
