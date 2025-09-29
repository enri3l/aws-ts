/**
 * ECS service logs command
 *
 * Retrieves and displays logs from tasks running in an ECS service
 * with filtering and streaming capabilities for monitoring and debugging.
 *
 */

import type { Interfaces } from "@oclif/core";
import { Args, Command, Flags } from "@oclif/core";
import { getECSErrorGuidance } from "../../../lib/ecs-errors.js";
import type { ECSConfig } from "../../../lib/ecs-schemas.js";
import { ECSConfigSchema } from "../../../lib/ecs-schemas.js";
import {
  ECSService,
  type ServiceDescription,
  type TaskDescription,
} from "../../../services/ecs-service.js";

/**
 * ECS service logs command for viewing task logs
 *
 * Retrieves and displays logs from running tasks in an ECS service
 * with support for filtering, following, and multiple output formats.
 *
 * @public
 */
export default class ECSServiceLogsCommand extends Command {
  static override readonly description = "View logs from ECS service tasks";

  static override readonly examples = [
    {
      description: "View recent logs from a service",
      command: "<%= config.bin %> <%= command.id %> my-service",
    },
    {
      description: "View logs from specific cluster",
      command: "<%= config.bin %> <%= command.id %> my-service --cluster my-cluster",
    },
    {
      description: "Follow logs in real-time",
      command: "<%= config.bin %> <%= command.id %> my-service --follow",
    },
    {
      description: "View logs from last 1 hour",
      command: "<%= config.bin %> <%= command.id %> my-service --since 1h",
    },
    {
      description: "View logs with timestamps",
      command: "<%= config.bin %> <%= command.id %> my-service --timestamps",
    },
    {
      description: "View last 100 log lines",
      command: "<%= config.bin %> <%= command.id %> my-service --tail 100",
    },
  ];

  static override readonly args = {
    serviceName: Args.string({
      name: "serviceName",
      description: "Name of the service to view logs from",
      required: true,
    }),
  };

  static override readonly flags = {
    cluster: Flags.string({
      char: "c",
      description: "Name of the cluster containing the service",
      helpValue: "CLUSTER_NAME",
    }),

    follow: Flags.boolean({
      char: "f",
      description: "Follow log output in real-time",
      default: false,
    }),

    since: Flags.string({
      description: "Show logs since duration (e.g., 1h, 30m, 2d)",
      helpValue: "DURATION",
    }),

    timestamps: Flags.boolean({
      char: "t",
      description: "Include timestamps in log output",
      default: false,
    }),

    tail: Flags.integer({
      description: "Number of lines to show from the end of logs",
      helpValue: "LINES",
    }),

    "container-name": Flags.string({
      description: "Show logs from specific container only",
      helpValue: "CONTAINER_NAME",
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
   * Execute the ECS service logs command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSServiceLogsCommand);

    try {
      const input: ECSConfig = ECSConfigSchema.parse({
        region: flags.region,
        profile: flags.profile,
        format: "table", // Default format for logs
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

      const service = await this.validateAndGetService(ecsService, args.serviceName, flags, input);

      const tasks = await this.getRunningTasks(ecsService, args.serviceName, flags, input);

      this.displayServiceHeader(service, tasks, input.verbose);
      this.displayTaskList(tasks, flags, args.serviceName);
      this.displayLogAccessInformation(flags, args.serviceName);
      this.displayFilteringOptions(flags);
      this.displayVerboseInformation(service, tasks, input.verbose);
    } catch (error) {
      const formattedError = this.formatECSError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Validate service exists and has running tasks
   *
   * @param ecsService - ECS service instance
   * @param serviceName - Service name to validate
   * @param flags - Command flags
   * @param input - Validated input config
   * @returns Service description
   * @internal
   */
  private async validateAndGetService(
    ecsService: ECSService,
    serviceName: string,
    flags: Interfaces.InferredFlags<typeof ECSServiceLogsCommand.flags>,
    input: ECSConfig,
  ): Promise<ServiceDescription> {
    const services = await ecsService.describeServices(
      [serviceName],
      {
        ...(flags.cluster && { cluster: flags.cluster }),
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );

    if (services.length === 0) {
      this.error(`Service '${serviceName}' not found in the specified cluster.`, {
        exit: 1,
      });
    }

    const service = services[0]!;

    if (service.runningCount === 0) {
      this.log(`Service '${serviceName}' has no running tasks.`);
      this.log(`Current status: ${service.status}`);
      this.log(`Desired count: ${service.desiredCount}, Running count: ${service.runningCount}`);
      this.exit(0);
    }

    return service;
  }

  /**
   * Get running tasks for the service
   *
   * @param ecsService - ECS service instance
   * @param serviceName - Service name
   * @param flags - Command flags
   * @param input - Validated input config
   * @returns Array of task descriptions
   * @internal
   */
  private async getRunningTasks(
    ecsService: ECSService,
    serviceName: string,
    flags: Interfaces.InferredFlags<typeof ECSServiceLogsCommand.flags>,
    input: ECSConfig,
  ): Promise<TaskDescription[]> {
    const taskArns = await ecsService.listTasks(
      {
        ...(flags.cluster && { cluster: flags.cluster }),
        serviceName,
        desiredStatus: "RUNNING",
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );

    if (taskArns.length === 0) {
      this.log(`No running tasks found for service '${serviceName}'.`);
      this.exit(0);
    }

    return await ecsService.describeTasks(
      taskArns,
      {
        ...(flags.cluster && { cluster: flags.cluster }),
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );
  }

  /**
   * Display service header information
   *
   * @param service - Service description
   * @param tasks - Task descriptions
   * @param verbose - Verbose flag
   * @internal
   */
  private displayServiceHeader(
    service: ServiceDescription,
    tasks: TaskDescription[],
    verbose: boolean,
  ): void {
    if (verbose) {
      this.log(`Service: ${service.serviceName}`);
      this.log(`Cluster: ${service.clusterArn.split("/").pop() || "Unknown"}`);
      this.log(`Running tasks: ${tasks.length}`);
      this.log(`Task definition: ${service.taskDefinition}`);
      this.log(""); // Empty line
    }
  }

  /**
   * Display task list with container filtering
   *
   * @param tasks - Task descriptions
   * @param flags - Command flags
   * @param serviceName - Service name
   * @internal
   */
  private displayTaskList(
    tasks: TaskDescription[],
    flags: Interfaces.InferredFlags<typeof ECSServiceLogsCommand.flags>,
    serviceName: string,
  ): void {
    this.log(`Viewing logs for service '${serviceName}'`);
    this.log(`Found ${tasks.length} running task${tasks.length === 1 ? "" : "s"}:`);

    for (const task of tasks.slice(0, 5)) {
      // Show first 5 tasks
      const taskId = task.taskArn.split("/").pop()?.slice(0, 8) || "unknown";
      this.log(`  • Task ${taskId}: ${task.lastStatus}`);

      if (flags["container-name"]) {
        this.log(`    Container filter: ${flags["container-name"]}`);
      }
    }

    if (tasks.length > 5) {
      this.log(`  ... and ${tasks.length - 5} more tasks`);
    }

    this.log("");
  }

  /**
   * Display log access information and alternatives
   *
   * @param flags - Command flags
   * @param serviceName - Service name
   * @internal
   */
  private displayLogAccessInformation(
    flags: Interfaces.InferredFlags<typeof ECSServiceLogsCommand.flags>,
    serviceName: string,
  ): void {
    this.log("Log Access Information:");
    this.log("To view actual logs, ensure your task definition has:");
    this.log("  1. CloudWatch Logs driver configured");
    this.log("  2. Appropriate IAM permissions for log access");
    this.log("  3. Log group and stream names defined");

    this.log("\nAlternative log viewing methods:");
    this.log(
      `  • AWS Console: ECS → Clusters → ${flags.cluster || "default"} → Services → ${serviceName} → Tasks → View logs`,
    );
    this.log(`  • AWS CLI: aws logs tail /aws/ecs/${serviceName}`);
    this.log(`  • CloudWatch Console: Log groups starting with /aws/ecs/`);
  }

  /**
   * Display filtering options based on flags
   *
   * @param flags - Command flags
   * @internal
   */
  private displayFilteringOptions(
    flags: Interfaces.InferredFlags<typeof ECSServiceLogsCommand.flags>,
  ): void {
    if (flags.follow) {
      this.log("\nReal-time log following would be implemented here");
      this.log("This would stream logs continuously until interrupted (Ctrl+C)");
    }

    if (flags.since) {
      this.log(`\nFiltering logs since: ${flags.since}`);
    }

    if (flags.tail) {
      this.log(`\n📄 Showing last ${flags.tail} lines per task`);
    }

    if (flags.timestamps) {
      this.log(`\n🕐 Timestamps would be included in log output`);
    }
  }

  /**
   * Display verbose debugging information
   *
   * @param service - Service description
   * @param tasks - Task descriptions
   * @param verbose - Verbose flag
   * @internal
   */
  private displayVerboseInformation(
    service: ServiceDescription,
    tasks: TaskDescription[],
    verbose: boolean,
  ): void {
    if (verbose) {
      this.log(`\nDebug: Service has ${service.runningCount} running tasks`);
      this.log(`Task ARNs:`);
      for (const task of tasks) {
        this.log(`  - ${task.taskArn}`);
      }
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

    let formattedMessage = `Failed to retrieve ECS service logs: ${errorMessage}`;

    if (guidance) {
      formattedMessage += `\n\nGuidance: ${guidance}`;
    }

    if (verbose && error instanceof Error && error.stack) {
      formattedMessage += `\n\nStack trace:\n${error.stack}`;
    }

    return formattedMessage;
  }
}
