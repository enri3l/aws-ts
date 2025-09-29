/**
 * ECS task describe command
 *
 * Describes ECS tasks with detailed information including
 * container status, network configuration, and task events.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { formatECSError } from "../../../lib/ecs-errors.js";
import type { ECSDescribeTasks } from "../../../lib/ecs-schemas.js";
import { ECSDescribeTasksSchema } from "../../../lib/ecs-schemas.js";
import { ECSService, type TaskDescription } from "../../../services/ecs-service.js";

/**
 * ECS task describe command for detailed task information
 *
 * Describes ECS tasks with comprehensive information including
 * container details, network configuration, and execution status.
 *
 * @public
 */
export default class ECSTaskDescribeCommand extends Command {
  static override readonly description = "Describe ECS tasks in detail";

  static override readonly examples = [
    {
      description: "Describe a task by ARN",
      command:
        "<%= config.bin %> <%= command.id %> arn:aws:ecs:us-east-1:123456789012:task/my-cluster/abc123",
    },
    {
      description: "Describe multiple tasks",
      command: "<%= config.bin %> <%= command.id %> task-arn-1,task-arn-2",
    },
    {
      description: "Describe tasks in a specific cluster",
      command: "<%= config.bin %> <%= command.id %> task-id --cluster my-cluster",
    },
    {
      description: "Describe tasks with tags included",
      command: "<%= config.bin %> <%= command.id %> task-arn --include TAGS",
    },
    {
      description: "Describe task with JSON output",
      command: "<%= config.bin %> <%= command.id %> task-arn --format json",
    },
  ];

  static override readonly args = {
    taskArns: Args.string({
      name: "taskArns",
      description: "Comma-separated list of task ARNs or IDs to describe",
      required: true,
    }),
  };

  static override readonly flags = {
    cluster: Flags.string({
      char: "c",
      description: "Name of the cluster containing the tasks",
      helpValue: "CLUSTER_NAME",
    }),

    include: Flags.string({
      description: "Additional information to include",
      options: ["TAGS"],
      helpValue: "INFO_TYPE",
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
      default: "json",
      helpValue: "FORMAT",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the ECS task describe command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSTaskDescribeCommand);

    try {
      // Parse task ARNs from comma-separated string
      const taskArns = args.taskArns.split(",").map((arn) => arn.trim());

      // Validate input using Zod schema
      const input: ECSDescribeTasks = ECSDescribeTasksSchema.parse({
        taskArns,
        clusterName: flags.cluster,
        include: flags.include ? [flags.include as "TAGS"] : undefined,
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

      // Describe tasks
      const tasks = await ecsService.describeTasks(
        input.taskArns,
        {
          ...(input.clusterName && { cluster: input.clusterName }),
          ...(input.include && { include: input.include }),
        },
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      if (tasks.length === 0) {
        this.log("No tasks found with the specified ARNs.");
        return;
      }

      // Display output and verbose information
      this.displayOutput(input, tasks);

      if (input.verbose) {
        this.displayVerboseInfo(input, tasks);
      }
    } catch (error) {
      const formattedError = formatECSError(error, "describe ECS tasks", flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Display task output in the specified format
   *
   * @param input - Validated input parameters
   * @param tasks - Task information to display
   * @internal
   */
  private displayOutput(input: ECSDescribeTasks, tasks: TaskDescription[]): void {
    switch (input.format) {
      case "table": {
        this.displayTasksAsTable(tasks);
        break;
      }

      case "json": {
        this.log(JSON.stringify(tasks, undefined, 2));
        break;
      }

      case "jsonl": {
        this.displayTasksAsJsonLines(tasks);
        break;
      }

      case "csv": {
        this.displayTasksAsCsv(tasks);
        break;
      }
    }
  }

  /**
   * Display tasks in table format
   *
   * @param tasks - Task information to display
   * @internal
   */
  private displayTasksAsTable(tasks: TaskDescription[]): void {
    for (const [index, task] of tasks.entries()) {
      if (index > 0) this.log("\n" + "=".repeat(80) + "\n");

      const taskId = task.taskArn?.split("/").pop()?.slice(0, 8) || "unknown";
      const clusterName = task.clusterArn?.split("/").pop() || "Unknown";
      const taskFamily = task.taskDefinitionArn?.split("/").pop()?.split(":")[0] || "Unknown";

      // Basic task information
      this.displayBasicTaskInfo(task, taskId, clusterName, taskFamily);

      // Optional task information
      this.displayOptionalTaskInfo(task);

      // Container information
      this.displayContainerInfo(task);
    }
  }

  /**
   * Display basic task information
   *
   * @param task - Task to display
   * @param taskId - Extracted task ID
   * @param clusterName - Extracted cluster name
   * @param taskFamily - Extracted task family
   * @internal
   */
  private displayBasicTaskInfo(
    task: TaskDescription,
    taskId: string,
    clusterName: string,
    taskFamily: string,
  ): void {
    this.log(`Task: ${taskId}`);
    this.log(`ARN: ${task.taskArn}`);
    this.log(`Cluster: ${clusterName}`);
    this.log(`Task Definition: ${task.taskDefinitionArn}`);
    this.log(`Task Family: ${taskFamily}`);
    this.log(`Status: ${task.lastStatus} (desired: ${task.desiredStatus})`);
    this.log(`Launch Type: ${task.launchType || "N/A"}`);
    this.log(`Platform Version: ${task.platformVersion || "N/A"}`);
    this.log(`CPU: ${task.cpu || "N/A"}`);
    this.log(`Memory: ${task.memory || "N/A"}`);
  }

  /**
   * Display optional task information
   *
   * @param task - Task to display
   * @internal
   */
  private displayOptionalTaskInfo(task: TaskDescription): void {
    if (task.createdAt) {
      this.log(`Created: ${task.createdAt?.toISOString() ?? "N/A"}`);
    }
    if (task.startedAt) {
      this.log(`Started: ${task.startedAt?.toISOString() ?? "N/A"}`);
    }
    if (task.stoppedAt) {
      this.log(`Stopped: ${task.stoppedAt?.toISOString() ?? "N/A"}`);
    }
    if (task.stoppedReason) {
      this.log(`Stop Reason: ${task.stoppedReason}`);
    }
    if (task.healthStatus) {
      this.log(`Health Status: ${task.healthStatus}`);
    }
    if (task.availabilityZone) {
      this.log(`Availability Zone: ${task.availabilityZone}`);
    }
    if (task.connectivity) {
      this.log(`Connectivity: ${task.connectivity}`);
      if (task.connectivityAt) {
        this.log(`Connectivity At: ${task.connectivityAt?.toISOString() ?? "N/A"}`);
      }
    }
    if (task.group) {
      this.log(`Group: ${task.group}`);
    }
    if (task.startedBy) {
      this.log(`Started By: ${task.startedBy}`);
    }
    if (task.capacityProviderName) {
      this.log(`Capacity Provider: ${task.capacityProviderName}`);
    }
  }

  /**
   * Display container information
   *
   * @param task - Task to display containers for
   * @internal
   */
  private displayContainerInfo(task: TaskDescription): void {
    if (task.containers && task.containers.length > 0) {
      this.log("\nContainers:");
      for (const container of task.containers) {
        this.displaySingleContainerInfo(container);
      }
    }
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
    this.log(`  - ${container.name}`);
    this.log(`    ARN: ${container.containerArn}`);
    this.log(`    Last Status: ${container.lastStatus || "N/A"}`);

    this.displayContainerOptionalInfo(container);
    this.displayContainerNetworkInfo(container);
  }

  /**
   * Display optional container information
   *
   * @param container - Container to display optional info for
   * @internal
   */
  private displayContainerOptionalInfo(
    container: NonNullable<TaskDescription["containers"]>[number],
  ): void {
    if (container.exitCode !== undefined) {
      this.log(`    Exit Code: ${container.exitCode}`);
    }
    if (container.reason) {
      this.log(`    Reason: ${container.reason}`);
    }
    if (container.healthStatus) {
      this.log(`    Health: ${container.healthStatus}`);
    }
  }

  /**
   * Display container network interface information
   *
   * @param container - Container to display network info for
   * @internal
   */
  private displayContainerNetworkInfo(
    container: NonNullable<TaskDescription["containers"]>[number],
  ): void {
    if (container.networkInterfaces && container.networkInterfaces.length > 0) {
      this.log(`    Network Interfaces:`);
      for (const ni of container.networkInterfaces) {
        if (ni.privateIpv4Address) {
          this.log(`      Private IP: ${ni.privateIpv4Address}`);
        }
      }
    }
  }

  /**
   * Display tasks in JSONL format
   *
   * @param tasks - Tasks to display
   * @internal
   */
  private displayTasksAsJsonLines(tasks: TaskDescription[]): void {
    for (const task of tasks) {
      this.log(JSON.stringify(task));
    }
  }

  /**
   * Display tasks in CSV format
   *
   * @param tasks - Tasks to display
   * @internal
   */
  private displayTasksAsCsv(tasks: TaskDescription[]): void {
    // CSV header
    const headers = [
      "taskArn",
      "clusterArn",
      "taskDefinitionArn",
      "lastStatus",
      "desiredStatus",
      "launchType",
      "cpu",
      "memory",
      "createdAt",
      "startedAt",
    ];
    this.log(headers.join(","));

    // CSV rows
    for (const task of tasks) {
      const row = [
        `"${task.taskArn}"`,
        `"${task.clusterArn}"`,
        `"${task.taskDefinitionArn}"`,
        `"${task.lastStatus}"`,
        `"${task.desiredStatus}"`,
        `"${task.launchType || "N/A"}"`,
        `"${task.cpu || "N/A"}"`,
        `"${task.memory || "N/A"}"`,
        `"${task.createdAt?.toISOString() ?? "N/A"}"`,
        `"${task.startedAt?.toISOString() ?? "N/A"}"`,
      ];
      this.log(row.join(","));
    }
  }

  /**
   * Display verbose task information
   *
   * @param input - Validated input parameters
   * @param tasks - Task information for verbose display
   * @internal
   */
  private displayVerboseInfo(input: ECSDescribeTasks, tasks: TaskDescription[]): void {
    const taskCount = tasks.length;
    const taskWord = taskCount === 1 ? "" : "s";
    this.log(`\n🔍 Described ${taskCount} task${taskWord}`);
  }
}
