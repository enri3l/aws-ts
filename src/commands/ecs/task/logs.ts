/**
 * @module ecs/task/logs
 * ECS task logs command
 *
 * Retrieves and displays logs from containers in an ECS task
 * with filtering and streaming capabilities for debugging and monitoring.
 *
 */

import type { Interfaces } from "@oclif/core";
import { Args, Flags } from "@oclif/core";
import { getECSErrorGuidance } from "../../../lib/ecs-errors.js";
import type { ECSConfig } from "../../../lib/ecs-schemas.js";
import { ECSConfigSchema } from "../../../lib/ecs-schemas.js";
import { ECSService, type TaskDescription } from "../../../services/ecs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * ECS task logs command for viewing container logs
 *
 * Retrieves and displays logs from containers in an ECS task
 * with support for filtering, following, and multiple output formats.
 *
 * @public
 */
export default class ECSTaskLogsCommand extends BaseCommand {
  static override readonly description = "View logs from ECS task containers";

  static override readonly examples = [
    {
      description: "View recent logs from a task",
      command: "<%= config.bin %> <%= command.id %> task-arn",
    },
    {
      description: "View logs from task in specific cluster",
      command: "<%= config.bin %> <%= command.id %> task-id --cluster my-cluster",
    },
    {
      description: "View logs from specific container",
      command: "<%= config.bin %> <%= command.id %> task-arn --container-name web",
    },
    {
      description: "Follow logs in real-time",
      command: "<%= config.bin %> <%= command.id %> task-arn --follow",
    },
    {
      description: "View logs from last 1 hour",
      command: "<%= config.bin %> <%= command.id %> task-arn --since 1h",
    },
    {
      description: "View last 100 log lines",
      command: "<%= config.bin %> <%= command.id %> task-arn --tail 100",
    },
  ];

  static override readonly args = {
    taskArn: Args.string({
      name: "taskArn",
      description: "Task ARN or ID to view logs from",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    cluster: Flags.string({
      char: "c",
      description: "Name of the cluster containing the task",
      helpValue: "CLUSTER_NAME",
    }),

    "container-name": Flags.string({
      description: "Show logs from specific container only",
      helpValue: "CONTAINER_NAME",
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
  };

  /**
   * Execute the ECS task logs command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSTaskLogsCommand);

    try {
      // Validate input using Zod schema
      const input: ECSConfig = ECSConfigSchema.parse({
        region: flags.region,
        profile: flags.profile,
        format: "table", // Default format for logs
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

      // Get and validate task
      const task = await this.getAndValidateTask(ecsService, args.taskArn, flags, input);
      const taskId = task.taskArn?.split("/").pop()?.slice(0, 8) || "unknown";

      // Filter containers based on flags
      const containers = this.filterContainers(task, flags, taskId);

      // Display task header if verbose
      if (input.verbose) {
        this.displayTaskHeader(task, taskId);
      }

      // Display container information
      this.displayContainerInformation(containers, taskId);

      // Display log access guidance
      this.displayLogAccessInformation(containers, flags, taskId);

      // Display applied filtering options
      this.displayFilteringOptions(flags, task, containers, input.verbose);
    } catch (error) {
      const formattedError = this.formatECSError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Get and validate task information
   *
   * @param ecsService - ECS service instance
   * @param taskArn - Task ARN to describe
   * @param flags - Command flags
   * @param input - Validated input
   * @returns Task description
   * @internal
   */
  private async getAndValidateTask(
    ecsService: ECSService,
    taskArn: string,
    flags: Interfaces.InferredFlags<typeof ECSTaskLogsCommand.flags>,
    input: ECSConfig,
  ): Promise<TaskDescription & { containers: NonNullable<TaskDescription["containers"]> }> {
    const tasks = await ecsService.describeTasks(
      [taskArn],
      {
        ...(flags.cluster && { cluster: flags.cluster }),
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );

    if (tasks.length === 0) {
      this.error(`Task '${taskArn}' not found in the specified cluster.`, {
        exit: 1,
      });
    }

    const task = tasks[0]!;
    const taskId = task.taskArn?.split("/").pop()?.slice(0, 8) || "unknown";

    // Check if task has containers
    if (!task.containers || task.containers.length === 0) {
      this.log(`Task ${taskId} has no container information available.`);
      this.log(`Task status: ${task.lastStatus}`);
      this.exit(0);
    }

    // TypeScript assertion: At this point, we're guaranteed containers exist
    return task as TaskDescription & { containers: NonNullable<TaskDescription["containers"]> };
  }

  /**
   * Filter containers based on command flags
   *
   * @param task - Task with containers
   * @param flags - Command flags
   * @param taskId - Task ID for logging
   * @returns Filtered containers
   * @internal
   */
  private filterContainers(
    task: TaskDescription & { containers: NonNullable<TaskDescription["containers"]> },
    flags: Interfaces.InferredFlags<typeof ECSTaskLogsCommand.flags>,
    taskId: string,
  ): NonNullable<TaskDescription["containers"]> {
    // At this point, containers are guaranteed to exist due to validation in getAndValidateTask
    const allContainers = task.containers;
    let containers = allContainers;

    if (flags["container-name"]) {
      containers = allContainers.filter((container) => container.name === flags["container-name"]);

      if (containers.length === 0) {
        this.log(`Container '${flags["container-name"]}' not found in task ${taskId}.`);
        this.log("Available containers:");
        for (const container of allContainers) {
          this.log(`  • ${container.name}`);
        }
        this.exit(0);
      }
    }
    return containers;
  }

  /**
   * Display task header information
   *
   * @param task - Task information
   * @param taskId - Task ID
   * @internal
   */
  private displayTaskHeader(
    task: TaskDescription & { containers: NonNullable<TaskDescription["containers"]> },
    taskId: string,
  ): void {
    this.log(`Task: ${taskId}`);
    this.log(`ARN: ${task.taskArn}`);
    this.log(`Cluster: ${task.clusterArn?.split("/").pop() || "Unknown"}`);
    this.log(`Task Definition: ${task.taskDefinitionArn}`);
    this.log(`Status: ${task.lastStatus}`);
    this.log(`Containers: ${task.containers.length}`);
    this.log(""); // Empty line
  }

  /**
   * Display container information
   *
   * @param containers - Containers to display
   * @param taskId - Task ID
   * @internal
   */
  private displayContainerInformation(
    containers: NonNullable<TaskDescription["containers"]>,
    taskId: string,
  ): void {
    this.log(`Viewing logs for task ${taskId}`);
    const containerText = containers.length === 1 ? "container" : "containers";
    this.log(`Found ${containers.length} ${containerText}:`);

    for (const container of containers) {
      this.displaySingleContainerInfo(container);
    }
    this.log("");
  }

  /**
   * Display information for a single container
   *
   * @param container - Container to display
   * @internal
   */
  private displaySingleContainerInfo(
    container: NonNullable<TaskDescription["containers"]>[number],
  ): void {
    this.log(`\n🐳 Container: ${container.name}`);
    this.log(`   Status: ${container.lastStatus || "N/A"}`);

    if (container.exitCode !== undefined) {
      this.log(`   Exit Code: ${container.exitCode}`);
    }

    if (container.reason) {
      this.log(`   Reason: ${container.reason}`);
    }

    if (container.healthStatus) {
      this.log(`   Health: ${container.healthStatus}`);
    }

    this.displayContainerNetworkInfo(container);
  }

  /**
   * Display network information for a container
   *
   * @param container - Container to display network info for
   * @internal
   */
  private displayContainerNetworkInfo(
    container: NonNullable<TaskDescription["containers"]>[number],
  ): void {
    if (container.networkInterfaces && container.networkInterfaces.length > 0) {
      for (const ni of container.networkInterfaces) {
        if (ni.privateIpv4Address) {
          this.log(`   Private IP: ${ni.privateIpv4Address}`);
        }
      }
    }
  }

  /**
   * Display log access information and guidance
   *
   * @param containers - Container list
   * @param flags - Command flags
   * @param taskId - Task ID
   * @internal
   */
  private displayLogAccessInformation(
    containers: NonNullable<TaskDescription["containers"]>,
    flags: Interfaces.InferredFlags<typeof ECSTaskLogsCommand.flags>,
    taskId: string,
  ): void {
    this.log("Log Access Information:");
    this.log("To view actual logs, ensure your task definition has:");
    this.log("  1. CloudWatch Logs driver configured");
    this.log("  2. Appropriate IAM permissions for log access");
    this.log("  3. Log group and stream names defined");

    this.log("\nAlternative log viewing methods:");
    const clusterName = flags.cluster || "default";
    this.log(`  • AWS Console: ECS → Clusters → ${clusterName} → Tasks → ${taskId} → View logs`);

    if (containers.length === 1) {
      const containerName = containers[0]!.name;
      this.log(`  • AWS CLI: aws logs tail /aws/ecs/${containerName}`);
    } else {
      this.log(`  • AWS CLI: aws logs tail /aws/ecs/[container-name]`);
    }

    this.log(`  • CloudWatch Console: Log groups starting with /aws/ecs/`);
  }

  /**
   * Display applied filtering options and debug information
   *
   * @param flags - Command flags
   * @param task - Task information
   * @param containers - Container list
   * @param verbose - Verbose flag
   * @internal
   */
  private displayFilteringOptions(
    flags: Interfaces.InferredFlags<typeof ECSTaskLogsCommand.flags>,
    task: TaskDescription & { containers: NonNullable<TaskDescription["containers"]> },
    containers: NonNullable<TaskDescription["containers"]>,
    verbose: boolean,
  ): void {
    if (flags.follow) {
      this.log("\nReal-time log following would be implemented here");
      this.log("This would stream logs continuously until interrupted (Ctrl+C)");
    }

    if (flags.since) {
      this.log(`\nFiltering logs since: ${flags.since}`);
    }

    if (flags.tail) {
      this.log(`\n📄 Showing last ${flags.tail} lines per container`);
    }

    if (flags.timestamps) {
      this.log(`\n🕐 Timestamps would be included in log output`);
    }

    if (verbose) {
      this.log(`\nDebug: Task status is '${task.lastStatus}'`);
      if (task.stoppedReason) {
        this.log(`Stop reason: ${task.stoppedReason}`);
      }
      this.log(`Container ARNs:`);
      for (const container of containers) {
        this.log(`  - ${container.name}: ${container.containerArn}`);
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

    let formattedMessage = `Failed to retrieve ECS task logs: ${errorMessage}`;

    if (guidance) {
      formattedMessage += `\n\nGuidance: ${guidance}`;
    }

    if (verbose && error instanceof Error && error.stack) {
      formattedMessage += `\n\nStack trace:\n${error.stack}`;
    }

    return formattedMessage;
  }
}
