/**
 * @module ecs/task/kill
 * ECS task kill command
 *
 * Forcefully terminates ECS tasks immediately without
 * graceful shutdown, primarily for emergency situations.
 *
 */

import type { Interfaces } from "@oclif/core";
import { Args, Flags } from "@oclif/core";
import { getECSErrorGuidance } from "../../../lib/ecs-errors.js";
import type { ECSStopTask } from "../../../lib/ecs-schemas.js";
import { ECSStopTaskSchema } from "../../../lib/ecs-schemas.js";
import { ECSService, type TaskDescription } from "../../../services/ecs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * ECS task kill command for immediate task termination
 *
 * Forcefully terminates ECS tasks immediately without waiting
 * for graceful shutdown, similar to SIGKILL behavior.
 *
 * @public
 */
export default class ECSTaskKillCommand extends BaseCommand {
  static override readonly description = "Forcefully terminate ECS tasks immediately";

  static override readonly examples = [
    {
      description: "Kill a task immediately",
      command: "<%= config.bin %> <%= command.id %> task-arn",
    },
    {
      description: "Kill multiple tasks",
      command: "<%= config.bin %> <%= command.id %> task-arn-1,task-arn-2",
    },
    {
      description: "Kill task in specific cluster",
      command: "<%= config.bin %> <%= command.id %> task-id --cluster my-cluster",
    },
    {
      description: "Kill task with reason",
      command: "<%= config.bin %> <%= command.id %> task-arn --reason 'Emergency termination'",
    },
    {
      description: "Force kill without confirmation",
      command: "<%= config.bin %> <%= command.id %> task-arn --force",
    },
  ];

  static override readonly args = {
    taskArns: Args.string({
      name: "taskArns",
      description: "Comma-separated list of task ARNs or IDs to kill",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    cluster: Flags.string({
      char: "c",
      description: "Name of the cluster containing the tasks",
      helpValue: "CLUSTER_NAME",
    }),

    reason: Flags.string({
      description: "Reason for killing the tasks",
      helpValue: "REASON",
    }),

    force: Flags.boolean({
      char: "f",
      description: "Force kill without confirmation prompt",
      default: false,
    }),
  };

  /**
   * Execute the ECS task kill command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSTaskKillCommand);

    try {
      const taskArns = args.taskArns.split(",").map((arn) => arn.trim());
      const ecsService = new ECSService({
        enableDebugLogging: flags.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(flags.region && { region: flags.region }),
          ...(flags.profile && { profile: flags.profile }),
        },
      });

      const { runningTasks, alreadyStoppedTasks } = await this.fetchAndFilterTasks(
        ecsService,
        taskArns,
        flags,
      );

      if (runningTasks.length === 0) {
        this.log("All specified tasks are already stopped.");
        return;
      }

      this.displayTasksToBeKilled(runningTasks, alreadyStoppedTasks);

      const confirmed = await this.confirmKillOperation(runningTasks.length, flags.force);
      if (!confirmed) {
        this.log("Task kill cancelled.");
        return;
      }

      const killedTasks = await this.killTasks(ecsService, runningTasks, flags);

      if (killedTasks.length === 0) {
        this.error("Failed to kill any tasks", { exit: 1 });
        return;
      }

      this.displayKillResults(killedTasks, runningTasks.length, flags);
    } catch (error) {
      const formattedError = this.formatECSError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Fetch and filter tasks into running and stopped categories
   *
   * @param ecsService - ECS service instance
   * @param taskArns - Task ARNs to fetch
   * @param flags - Command flags
   * @returns Object containing running and stopped tasks
   * @internal
   */
  private async fetchAndFilterTasks(
    ecsService: ECSService,
    taskArns: string[],
    flags: Interfaces.InferredFlags<typeof ECSTaskKillCommand.flags>,
  ): Promise<{ runningTasks: TaskDescription[]; alreadyStoppedTasks: TaskDescription[] }> {
    const tasks = await ecsService.describeTasks(
      taskArns,
      {
        ...(flags.cluster && { cluster: flags.cluster }),
      },
      {
        ...(flags.region && { region: flags.region }),
        ...(flags.profile && { profile: flags.profile }),
      },
    );

    if (tasks.length === 0) {
      this.error("No tasks found with the specified ARNs.", { exit: 1 });
    }

    const runningTasks = tasks.filter((task) => task.lastStatus !== "STOPPED");
    const alreadyStoppedTasks = tasks.filter((task) => task.lastStatus === "STOPPED");

    return { runningTasks, alreadyStoppedTasks };
  }

  /**
   * Display tasks to be killed and already stopped tasks
   *
   * @param runningTasks - Tasks that will be killed
   * @param alreadyStoppedTasks - Tasks already stopped
   * @internal
   */
  private displayTasksToBeKilled(
    runningTasks: TaskDescription[],
    alreadyStoppedTasks: TaskDescription[],
  ): void {
    if (alreadyStoppedTasks.length > 0) {
      this.log(
        `${alreadyStoppedTasks.length} task${alreadyStoppedTasks.length === 1 ? " is" : "s are"} already stopped:`,
      );
      for (const task of alreadyStoppedTasks) {
        const taskId = task.taskArn.split("/").pop()?.slice(0, 8) || "unknown";
        this.log(`  • ${taskId}: ${task.lastStatus}`);
        if (task.stoppedReason) {
          this.log(`    Reason: ${task.stoppedReason}`);
        }
      }
    }

    this.log(`💀 Tasks to be killed (${runningTasks.length}):`);
    for (const task of runningTasks) {
      const taskId = task.taskArn.split("/").pop()?.slice(0, 8) || "unknown";
      const taskFamily = task.taskDefinitionArn.split("/").pop()?.split(":")[0] || "Unknown";
      this.log(`  • ${taskId} (${taskFamily}): ${task.lastStatus}`);
    }

    this.log(`\nWARNING: This will forcefully terminate tasks immediately!`);
    this.log(`Unlike 'stop', this doesn't allow containers to shut down gracefully.`);
    this.log(`Use this only for emergency situations or unresponsive tasks.`);
  }

  /**
   * Confirm kill operation with user
   *
   * @param taskCount - Number of tasks to kill
   * @param force - Whether to skip confirmation
   * @returns True if confirmed or forced
   * @internal
   */
  private async confirmKillOperation(taskCount: number, force: boolean): Promise<boolean> {
    if (force) {
      return true;
    }

    const { default: inquirer } = await import("inquirer");
    const response = await inquirer.prompt<{ confirmed: boolean }>([
      {
        type: "confirm",
        name: "confirmed",
        message: `Are you sure you want to KILL ${taskCount} task${taskCount === 1 ? "" : "s"}? This is immediate and irreversible.`,
        default: false,
      },
    ]);

    return response.confirmed;
  }

  /**
   * Kill running tasks
   *
   * @param ecsService - ECS service instance
   * @param runningTasks - Tasks to kill
   * @param flags - Command flags
   * @returns Successfully killed tasks
   * @internal
   */
  private async killTasks(
    ecsService: ECSService,
    runningTasks: TaskDescription[],
    flags: Interfaces.InferredFlags<typeof ECSTaskKillCommand.flags>,
  ): Promise<TaskDescription[]> {
    const killedTasks: TaskDescription[] = [];
    const reason = flags.reason || "Forcefully terminated (kill command)";

    for (const task of runningTasks) {
      try {
        const input: ECSStopTask = ECSStopTaskSchema.parse({
          taskArn: task.taskArn,
          clusterName: flags.cluster,
          reason,
          region: flags.region,
          profile: flags.profile,
          format: flags.format as "table" | "json" | "jsonl" | "csv",
          verbose: flags.verbose,
        });

        const stoppedTask = await ecsService.stopTask(
          task.taskArn,
          {
            ...(input.clusterName && { cluster: input.clusterName }),
            reason,
          },
          {
            ...(input.region && { region: input.region }),
            ...(input.profile && { profile: input.profile }),
          },
        );

        killedTasks.push(stoppedTask);
      } catch (error) {
        const taskId = task.taskArn.split("/").pop()?.slice(0, 8) || "unknown";
        this.log(
          `Failed to kill task ${taskId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return killedTasks;
  }

  /**
   * Display kill operation results
   *
   * @param killedTasks - Successfully killed tasks
   * @param totalRequested - Total number of tasks requested to kill
   * @param flags - Command flags
   * @internal
   */
  private displayKillResults(
    killedTasks: TaskDescription[],
    totalRequested: number,
    flags: Interfaces.InferredFlags<typeof ECSTaskKillCommand.flags>,
  ): void {
    const reason = flags.reason || "Forcefully terminated (kill command)";

    switch (flags.format) {
      case "table": {
        this.displayKillResultsAsTable(killedTasks, reason);
        break;
      }
      case "json": {
        this.displayKillResultsAsJson(killedTasks, totalRequested, reason);
        break;
      }
      case "jsonl": {
        this.displayKillResultsAsJsonLines(killedTasks, reason);
        break;
      }
      case "csv": {
        this.displayKillResultsAsCsv(killedTasks, reason);
        break;
      }
    }

    if (flags.verbose) {
      this.displayVerboseKillInfo(killedTasks, totalRequested, reason);
    }
  }

  /**
   * Display kill results in table format
   *
   * @param killedTasks - Successfully killed tasks
   * @param reason - Kill reason
   * @internal
   */
  private displayKillResultsAsTable(killedTasks: TaskDescription[], reason: string): void {
    this.log(
      `\n💀 Successfully killed ${killedTasks.length} task${killedTasks.length === 1 ? "" : "s"}`,
    );

    const tableData = killedTasks.map((task) => {
      const taskId = task.taskArn.split("/").pop()?.slice(0, 8) || "unknown";
      const taskFamily = task.taskDefinitionArn.split("/").pop()?.split(":")[0] || "Unknown";

      return {
        "Task ID": taskId,
        Family: taskFamily,
        Status: task.lastStatus,
        "Stopped At": task.stoppedAt || "Pending",
        "Stop Reason": task.stoppedReason || reason,
      };
    });

    console.table(tableData);
  }

  /**
   * Display kill results in JSON format
   *
   * @param killedTasks - Successfully killed tasks
   * @param totalRequested - Total tasks requested
   * @param reason - Kill reason
   * @internal
   */
  private displayKillResultsAsJson(
    killedTasks: TaskDescription[],
    totalRequested: number,
    reason: string,
  ): void {
    this.log(
      JSON.stringify(
        {
          killedCount: killedTasks.length,
          totalRequested,
          reason,
          tasks: killedTasks,
        },
        undefined,
        2,
      ),
    );
  }

  /**
   * Display kill results in JSONL format
   *
   * @param killedTasks - Successfully killed tasks
   * @param reason - Kill reason
   * @internal
   */
  private displayKillResultsAsJsonLines(killedTasks: TaskDescription[], reason: string): void {
    for (const task of killedTasks) {
      this.log(
        JSON.stringify({
          ...task,
          killed: true,
          killReason: reason,
        }),
      );
    }
  }

  /**
   * Display kill results in CSV format
   *
   * @param killedTasks - Successfully killed tasks
   * @param reason - Kill reason
   * @internal
   */
  private displayKillResultsAsCsv(killedTasks: TaskDescription[], reason: string): void {
    const headers = [
      "taskArn",
      "clusterArn",
      "taskDefinitionArn",
      "lastStatus",
      "stoppedAt",
      "stoppedReason",
      "killed",
    ];
    this.log(headers.join(","));

    for (const task of killedTasks) {
      const row = [
        `"${task.taskArn}"`,
        `"${task.clusterArn}"`,
        `"${task.taskDefinitionArn}"`,
        `"${task.lastStatus}"`,
        `"${task.stoppedAt?.toISOString() ?? "Pending"}"`,
        `"${task.stoppedReason || reason}"`,
        "true",
      ];
      this.log(row.join(","));
    }
  }

  /**
   * Display verbose kill operation information
   *
   * @param killedTasks - Successfully killed tasks
   * @param totalRequested - Total tasks requested
   * @param reason - Kill reason
   * @internal
   */
  private displayVerboseKillInfo(
    killedTasks: TaskDescription[],
    totalRequested: number,
    reason: string,
  ): void {
    this.log(`\nKill operation details:`);
    this.log(`Successfully killed: ${killedTasks.length}/${totalRequested} tasks`);
    this.log(`Kill reason: ${reason}`);
    this.log(`\nTask ARNs killed:`);
    for (const task of killedTasks) {
      this.log(`  - ${task.taskArn}`);
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

    let formattedMessage = `Failed to kill ECS tasks: ${errorMessage}`;

    if (guidance) {
      formattedMessage += `\n\nGuidance: ${guidance}`;
    }

    if (verbose && error instanceof Error && error.stack) {
      formattedMessage += `\n\nStack trace:\n${error.stack}`;
    }

    return formattedMessage;
  }
}
