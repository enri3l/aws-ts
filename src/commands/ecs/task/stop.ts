/**
 * @module stop
 * ECS task stop command
 *
 * Stops running ECS tasks with optional reason specification
 * and graceful termination handling.
 *
 */

import { Args, Flags } from "@oclif/core";
import { formatECSError } from "../../../lib/ecs-errors.js";
import type { ECSStopTask } from "../../../lib/ecs-schemas.js";
import { ECSStopTaskSchema } from "../../../lib/ecs-schemas.js";
import { ECSService, type TaskDescription } from "../../../services/ecs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * ECS task stop command for terminating running tasks
 *
 * Stops running ECS tasks with optional reason specification
 * and confirmation prompts for safe task termination.
 *
 * @public
 */
export default class ECSTaskStopCommand extends BaseCommand {
  static override readonly description = "Stop running ECS tasks";

  static override readonly examples = [
    {
      description: "Stop a task by ARN",
      command:
        "<%= config.bin %> <%= command.id %> arn:aws:ecs:us-east-1:123456789012:task/my-cluster/abc123",
    },
    {
      description: "Stop a task in specific cluster",
      command: "<%= config.bin %> <%= command.id %> task-id --cluster my-cluster",
    },
    {
      description: "Stop task with reason",
      command:
        "<%= config.bin %> <%= command.id %> task-arn --reason 'Manual termination for maintenance'",
    },
    {
      description: "Force stop without confirmation",
      command: "<%= config.bin %> <%= command.id %> task-arn --force",
    },
    {
      description: "Stop task in a specific region",
      command: "<%= config.bin %> <%= command.id %> task-arn --region us-west-2",
    },
  ];

  static override readonly args = {
    taskArn: Args.string({
      name: "taskArn",
      description: "Task ARN or ID to stop",
      required: true,
    }),
  };

  static override readonly flags = {
    cluster: Flags.string({
      char: "c",
      description: "Name of the cluster containing the task",
      helpValue: "CLUSTER_NAME",
    }),

    reason: Flags.string({
      description: "Reason for stopping the task",
      helpValue: "REASON",
    }),

    force: Flags.boolean({
      char: "f",
      description: "Force stop without confirmation prompt",
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
   * Execute the ECS task stop command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSTaskStopCommand);

    try {
      const input: ECSStopTask = ECSStopTaskSchema.parse({
        taskArn: args.taskArn,
        clusterName: flags.cluster,
        reason: flags.reason,
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

      const task = await this.validateAndGetTask(ecsService, input);

      if (this.checkTaskAlreadyStopped(task)) {
        return;
      }

      const confirmed = await this.confirmStopOperation(task, flags.force);
      if (!confirmed) {
        return;
      }

      const stoppedTask = await this.stopTask(ecsService, input);

      this.displayStopResult(task, stoppedTask, input);

      if (input.verbose) {
        this.displayVerboseInformation(stoppedTask, input);
      }
    } catch (error) {
      const formattedError = formatECSError(error, "stop ECS task", flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Validate and get task information
   *
   * @param ecsService - ECS service instance
   * @param input - Validated input parameters
   * @returns Task description
   * @internal
   */
  private async validateAndGetTask(
    ecsService: ECSService,
    input: ECSStopTask,
  ): Promise<TaskDescription> {
    const tasks = await ecsService.describeTasks(
      [input.taskArn],
      {
        ...(input.clusterName && { cluster: input.clusterName }),
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );

    if (tasks.length === 0) {
      this.error(`Task '${input.taskArn}' not found in the specified cluster.`, {
        exit: 1,
      });
    }

    return tasks[0]!;
  }

  /**
   * Check if task is already stopped and display status
   *
   * @param task - Task to check
   * @returns True if task is already stopped
   * @internal
   */
  private checkTaskAlreadyStopped(task: TaskDescription): boolean {
    if (task.lastStatus === "STOPPED") {
      const taskId = task.taskArn.split("/").pop()?.slice(0, 8) || "unknown";
      this.log(`Task ${taskId} is already stopped.`);
      if (task.stoppedReason) {
        this.log(`Stop reason: ${task.stoppedReason}`);
      }
      return true;
    }
    return false;
  }

  /**
   * Confirm stop operation with user
   *
   * @param task - Task to stop
   * @param force - Whether to skip confirmation
   * @returns True if operation is confirmed
   * @internal
   */
  private async confirmStopOperation(task: TaskDescription, force: boolean): Promise<boolean> {
    if (force) {
      return true;
    }

    const taskId = task.taskArn.split("/").pop()?.slice(0, 8) || "unknown";
    const { default: inquirer } = await import("inquirer");
    const response = await inquirer.prompt<{ confirmed: boolean }>([
      {
        type: "confirm",
        name: "confirmed",
        message: `Are you sure you want to stop task ${taskId}? This will terminate the running containers.`,
        default: false,
      },
    ]);

    if (!response.confirmed) {
      this.log("Task stop cancelled.");
      return false;
    }

    return true;
  }

  /**
   * Stop the ECS task
   *
   * @param ecsService - ECS service instance
   * @param input - Validated input parameters
   * @returns Stopped task description
   * @internal
   */
  private async stopTask(ecsService: ECSService, input: ECSStopTask): Promise<TaskDescription> {
    return await ecsService.stopTask(
      input.taskArn,
      {
        ...(input.clusterName && { cluster: input.clusterName }),
        ...(input.reason && { reason: input.reason }),
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );
  }

  /**
   * Display stop result in specified format
   *
   * @param originalTask - Original task before stopping
   * @param stoppedTask - Stopped task description
   * @param input - Validated input parameters
   * @internal
   */
  private displayStopResult(
    originalTask: TaskDescription,
    stoppedTask: TaskDescription,
    input: ECSStopTask,
  ): void {
    switch (input.format) {
      case "table": {
        this.displayTableResult(originalTask, stoppedTask, input);
        break;
      }
      case "json": {
        this.displayJsonResult(originalTask, stoppedTask, input);
        break;
      }
      case "jsonl": {
        this.displayJsonLinesResult(originalTask, stoppedTask);
        break;
      }
      case "csv": {
        this.displayCsvResult(originalTask, stoppedTask);
        break;
      }
    }
  }

  /**
   * Display result in table format
   *
   * @param originalTask - Original task before stopping
   * @param stoppedTask - Stopped task description
   * @param input - Validated input parameters
   * @internal
   */
  private displayTableResult(
    originalTask: TaskDescription,
    stoppedTask: TaskDescription,
    input: ECSStopTask,
  ): void {
    const taskId = stoppedTask.taskArn.split("/").pop()?.slice(0, 8) || "unknown";

    this.log(`Successfully initiated stop for ECS task ${taskId}`);
    this.log(`  Task ARN: ${stoppedTask.taskArn}`);
    this.log(`  Cluster: ${stoppedTask.clusterArn.split("/").pop() || "Unknown"}`);
    this.log(`  Task Definition: ${stoppedTask.taskDefinitionArn}`);
    this.log(`  Previous Status: ${originalTask.lastStatus}`);
    this.log(`  Current Status: ${stoppedTask.lastStatus}`);

    if (stoppedTask.stoppedReason) {
      this.log(`  Stop Reason: ${stoppedTask.stoppedReason}`);
    }

    if (input.reason) {
      this.log(`  Custom Reason: ${input.reason}`);
    }

    if (stoppedTask.stoppedAt) {
      this.log(`  Stopped At: ${stoppedTask.stoppedAt?.toISOString() ?? "N/A"}`);
    }

    this.log(`\nTask termination initiated - containers will be gracefully stopped`);
  }

  /**
   * Display result in JSON format
   *
   * @param originalTask - Original task before stopping
   * @param stoppedTask - Stopped task description
   * @param input - Validated input parameters
   * @internal
   */
  private displayJsonResult(
    originalTask: TaskDescription,
    stoppedTask: TaskDescription,
    input: ECSStopTask,
  ): void {
    this.log(
      JSON.stringify(
        {
          taskArn: stoppedTask.taskArn,
          clusterArn: stoppedTask.clusterArn,
          taskDefinitionArn: stoppedTask.taskDefinitionArn,
          previousStatus: originalTask.lastStatus,
          currentStatus: stoppedTask.lastStatus,
          stoppedReason: stoppedTask.stoppedReason,
          stoppedAt: stoppedTask.stoppedAt,
          customReason: input.reason,
          stopped: true,
        },
        undefined,
        2,
      ),
    );
  }

  /**
   * Display result in JSONL format
   *
   * @param originalTask - Original task before stopping
   * @param stoppedTask - Stopped task description
   * @internal
   */
  private displayJsonLinesResult(
    originalTask: TaskDescription,
    stoppedTask: TaskDescription,
  ): void {
    this.log(
      JSON.stringify({
        taskArn: stoppedTask.taskArn,
        clusterArn: stoppedTask.clusterArn,
        previousStatus: originalTask.lastStatus,
        currentStatus: stoppedTask.lastStatus,
        stoppedReason: stoppedTask.stoppedReason,
        stoppedAt: stoppedTask.stoppedAt,
        stopped: true,
      }),
    );
  }

  /**
   * Display result in CSV format
   *
   * @param originalTask - Original task before stopping
   * @param stoppedTask - Stopped task description
   * @internal
   */
  private displayCsvResult(originalTask: TaskDescription, stoppedTask: TaskDescription): void {
    const headers = [
      "taskArn",
      "clusterArn",
      "taskDefinitionArn",
      "previousStatus",
      "currentStatus",
      "stoppedReason",
      "stoppedAt",
      "stopped",
    ];
    this.log(headers.join(","));

    const row = [
      `"${stoppedTask.taskArn}"`,
      `"${stoppedTask.clusterArn}"`,
      `"${stoppedTask.taskDefinitionArn}"`,
      `"${originalTask.lastStatus}"`,
      `"${stoppedTask.lastStatus}"`,
      `"${stoppedTask.stoppedReason || "N/A"}"`,
      `"${stoppedTask.stoppedAt?.toISOString() || "N/A"}"`,
      "true",
    ];
    this.log(row.join(","));
  }

  /**
   * Display verbose information about the stop operation
   *
   * @param stoppedTask - Stopped task description
   * @param input - Validated input parameters
   * @internal
   */
  private displayVerboseInformation(stoppedTask: TaskDescription, input: ECSStopTask): void {
    this.log(`\nStop operation initiated. Monitor task status with:`);
    const clusterPart = input.clusterName ? ` --cluster ${input.clusterName}` : "";
    this.log(`  aws-ts ecs task describe ${stoppedTask.taskArn}${clusterPart}`);
    this.log(`\nTask containers will be sent SIGTERM and have 30 seconds to gracefully shutdown.`);
    this.log(`After 30 seconds, containers will be forcefully terminated with SIGKILL.`);
  }
}
