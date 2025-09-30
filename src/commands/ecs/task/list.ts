/**
 * @module list
 * ECS task list command
 *
 * Lists ECS tasks in a cluster with filtering options
 * and multiple output formats for task discovery and monitoring.
 *
 */

import { Flags } from "@oclif/core";
import { formatECSError } from "../../../lib/ecs-errors.js";
import type { ECSListTasks } from "../../../lib/ecs-schemas.js";
import { ECSListTasksSchema } from "../../../lib/ecs-schemas.js";
import { ECSService, type TaskDescription } from "../../../services/ecs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * ECS task list command for discovering tasks
 *
 * Lists ECS tasks within a cluster with optional filtering
 * by service, family, status, and launch type.
 *
 * @public
 */
export default class ECSTaskListCommand extends BaseCommand {
  static override readonly description = "List ECS tasks in a cluster";

  static override readonly examples = [
    {
      description: "List all tasks in default cluster",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "List tasks in a specific cluster",
      command: "<%= config.bin %> <%= command.id %> --cluster my-cluster",
    },
    {
      description: "List tasks for a specific service",
      command: "<%= config.bin %> <%= command.id %> --cluster my-cluster --service my-service",
    },
    {
      description: "List only running tasks",
      command: "<%= config.bin %> <%= command.id %> --cluster my-cluster --desired-status RUNNING",
    },
    {
      description: "List tasks by task definition family",
      command: "<%= config.bin %> <%= command.id %> --cluster my-cluster --family my-task-family",
    },
    {
      description: "List Fargate tasks with JSON output",
      command:
        "<%= config.bin %> <%= command.id %> --cluster my-cluster --launch-type FARGATE --format json",
    },
  ];

  static override readonly flags = {
    cluster: Flags.string({
      char: "c",
      description: "Name of the cluster to list tasks from",
      helpValue: "CLUSTER_NAME",
    }),

    service: Flags.string({
      char: "s",
      description: "Filter tasks by service name",
      helpValue: "SERVICE_NAME",
    }),

    family: Flags.string({
      description: "Filter tasks by task definition family",
      helpValue: "TASK_FAMILY",
    }),

    "started-by": Flags.string({
      description: "Filter tasks by who/what started them",
      helpValue: "STARTED_BY",
    }),

    "desired-status": Flags.string({
      description: "Filter tasks by desired status",
      options: ["RUNNING", "PENDING", "STOPPED"],
      helpValue: "STATUS",
    }),

    "launch-type": Flags.string({
      description: "Filter tasks by launch type",
      options: ["EC2", "FARGATE", "EXTERNAL"],
      helpValue: "TYPE",
    }),

    "max-items": Flags.integer({
      description: "Maximum number of tasks to list",
      helpValue: "NUMBER",
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
   * Execute the ECS task list command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(ECSTaskListCommand);

    try {
      const input: ECSListTasks = ECSListTasksSchema.parse({
        clusterName: flags.cluster,
        serviceName: flags.service,
        family: flags.family,
        startedBy: flags["started-by"],
        desiredStatus: flags["desired-status"] as "RUNNING" | "PENDING" | "STOPPED" | undefined,
        launchType: flags["launch-type"] as "EC2" | "FARGATE" | "EXTERNAL" | undefined,
        maxItems: flags["max-items"],
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

      const tasks = await this.fetchTaskDetails(ecsService, input);

      if (tasks.length === 0) {
        this.displayNoTasksMessage(input);
        return;
      }

      this.displayTaskList(tasks, input);

      if (input.verbose) {
        this.displayVerboseTaskInfo(tasks, input);
      }
    } catch (error) {
      const formattedError = formatECSError(error, "list ECS tasks", flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Fetch task details by first listing task ARNs and then describing them
   *
   * @param ecsService - ECS service instance
   * @param input - Validated input parameters
   * @returns Array of task descriptions
   * @internal
   */
  private async fetchTaskDetails(
    ecsService: ECSService,
    input: ECSListTasks,
  ): Promise<TaskDescription[]> {
    const taskArns = await ecsService.listTasks(
      {
        ...(input.clusterName && { cluster: input.clusterName }),
        ...(input.serviceName && { serviceName: input.serviceName }),
        ...(input.family && { family: input.family }),
        ...(input.startedBy && { startedBy: input.startedBy }),
        ...(input.desiredStatus && { desiredStatus: input.desiredStatus }),
        ...(input.launchType && { launchType: input.launchType }),
        ...(input.maxItems && { maxResults: input.maxItems }),
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );

    if (taskArns.length === 0) {
      return [];
    }

    return await ecsService.describeTasks(
      taskArns,
      {
        ...(input.clusterName && { cluster: input.clusterName }),
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );
  }

  /**
   * Display message when no tasks are found
   *
   * @param input - Validated input parameters
   * @internal
   */
  private displayNoTasksMessage(input: ECSListTasks): void {
    const clusterInfo = input.clusterName ? ` in cluster '${input.clusterName}'` : "";
    const serviceInfo = input.serviceName ? ` for service '${input.serviceName}'` : "";
    this.log(`No tasks found${clusterInfo}${serviceInfo}.`);
  }

  /**
   * Display task list in the specified format
   *
   * @param tasks - Tasks to display
   * @param input - Validated input parameters
   * @internal
   */
  private displayTaskList(tasks: TaskDescription[], input: ECSListTasks): void {
    switch (input.format) {
      case "table": {
        this.displayTasksAsTable(tasks);
        break;
      }
      case "json": {
        this.displayTasksAsJson(tasks);
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
   * @param tasks - Tasks to display
   * @internal
   */
  private displayTasksAsTable(tasks: TaskDescription[]): void {
    const taskText = tasks.length === 1 ? "task" : "tasks";
    this.log(`Found ${tasks.length} ${taskText}:\n`);

    const tableData = tasks.map((task) => {
      const taskId = task.taskArn.split("/").pop()?.slice(0, 8) || "unknown";
      const clusterName = task.clusterArn.split("/").pop() || "Unknown";
      const taskFamily = task.taskDefinitionArn.split("/").pop()?.split(":")[0] || "Unknown";

      return {
        "Task ID": taskId,
        Cluster: clusterName,
        "Task Family": taskFamily,
        Status: task.lastStatus,
        Desired: task.desiredStatus,
        "Launch Type": task.launchType || "N/A",
        CPU: task.cpu || "N/A",
        Memory: task.memory || "N/A",
      };
    });

    console.table(tableData);
  }

  /**
   * Display tasks in JSON format
   *
   * @param tasks - Tasks to display
   * @internal
   */
  private displayTasksAsJson(tasks: TaskDescription[]): void {
    this.log(JSON.stringify(tasks, undefined, 2));
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
    const headers = [
      "taskArn",
      "clusterArn",
      "taskDefinitionArn",
      "lastStatus",
      "desiredStatus",
      "launchType",
      "cpu",
      "memory",
    ];
    this.log(headers.join(","));

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
      ];
      this.log(row.join(","));
    }
  }

  /**
   * Display verbose task information with status breakdown
   *
   * @param tasks - Tasks to display info for
   * @param input - Validated input parameters
   * @internal
   */
  private displayVerboseTaskInfo(tasks: TaskDescription[], input: ECSListTasks): void {
    this.log(`\nTotal tasks: ${tasks.length}`);
    const clusterInfo = input.clusterName || "default";
    this.log(`Cluster: ${clusterInfo}`);

    const statusBreakdown: Record<string, number> = {};
    for (const task of tasks) {
      statusBreakdown[task.lastStatus] = (statusBreakdown[task.lastStatus] || 0) + 1;
    }

    this.log(`Status breakdown:`);
    for (const [status, count] of Object.entries(statusBreakdown)) {
      this.log(`  ${status}: ${count}`);
    }
  }
}
