/**
 * @module ecs/task/wait
 * ECS task wait command
 *
 * Waits for ECS tasks to reach a specified state with
 * polling and timeout capabilities for automation workflows.
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
 * Wait operation result interface
 */
interface WaitResult {
  finalTasks: TaskDescription[];
  completedTasks: TaskDescription[];
  elapsed: number;
  timedOut: boolean;
  attempts: number;
}

/**
 * ECS task wait command for state monitoring
 *
 * Waits for ECS tasks to reach a specified state with
 * configurable polling intervals and timeout handling.
 *
 * @public
 */
export default class ECSTaskWaitCommand extends BaseCommand {
  static override readonly description = "Wait for ECS tasks to reach a specified state";

  static override readonly examples = [
    {
      description: "Wait for task to start running",
      command: "<%= config.bin %> <%= command.id %> task-arn --state RUNNING",
    },
    {
      description: "Wait for task to stop with timeout",
      command: "<%= config.bin %> <%= command.id %> task-arn --state STOPPED --timeout 600",
    },
    {
      description: "Wait for multiple tasks to reach state",
      command: "<%= config.bin %> <%= command.id %> task-arn-1,task-arn-2 --state RUNNING",
    },
    {
      description: "Wait with custom polling interval",
      command: "<%= config.bin %> <%= command.id %> task-arn --state RUNNING --interval 30",
    },
    {
      description: "Wait for task in specific cluster",
      command: "<%= config.bin %> <%= command.id %> task-id --cluster my-cluster --state STOPPED",
    },
  ];

  static override readonly args = {
    taskArns: Args.string({
      name: "taskArns",
      description: "Comma-separated list of task ARNs or IDs to wait for",
      required: true,
    }),
  };

  static override readonly flags = {
    cluster: Flags.string({
      char: "c",
      description: "Name of the cluster containing the tasks",
      helpValue: "CLUSTER_NAME",
    }),

    state: Flags.string({
      description: "State to wait for",
      options: ["RUNNING", "STOPPED"],
      default: "RUNNING",
      helpValue: "STATE",
    }),

    timeout: Flags.integer({
      description: "Maximum time to wait in seconds",
      default: 600, // 10 minutes
      helpValue: "SECONDS",
    }),

    interval: Flags.integer({
      description: "Polling interval in seconds",
      default: 15,
      helpValue: "SECONDS",
    }),

    "exit-on-first": Flags.boolean({
      description: "Exit when first task reaches desired state (instead of waiting for all)",
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
   * Execute the ECS task wait command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSTaskWaitCommand);

    try {
      // Parse task ARNs from comma-separated string
      const taskArns = args.taskArns.split(",").map((arn) => arn.trim());

      // Validate input using Zod schema
      const input: ECSConfig = ECSConfigSchema.parse({
        region: flags.region,
        profile: flags.profile,
        format: flags.format as "table" | "json" | "jsonl" | "csv",
        verbose: flags.verbose,
      });

      // Validate timeout and interval
      if (flags.timeout <= 0) {
        throw new Error("Timeout must be greater than 0 seconds");
      }

      if (flags.interval <= 0) {
        throw new Error("Polling interval must be greater than 0 seconds");
      }

      if (flags.interval > flags.timeout) {
        throw new Error("Polling interval cannot be greater than timeout");
      }

      // Create ECS service instance
      const ecsService = new ECSService({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      // Initial task validation
      const initialTasks = await ecsService.describeTasks(
        taskArns,
        {
          ...(flags.cluster && { cluster: flags.cluster }),
        },
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      if (initialTasks.length === 0) {
        this.error("No tasks found with the specified ARNs.", { exit: 1 });
        return;
      }

      if (initialTasks.length !== taskArns.length) {
        this.log(`Warning: Found ${initialTasks.length} tasks out of ${taskArns.length} requested`);
      }

      // Display initial status
      this.log(
        `Waiting for ${initialTasks.length} task${initialTasks.length === 1 ? "" : "s"} to reach state: ${flags.state}`,
      );
      this.log(`Timeout: ${flags.timeout}s, Polling interval: ${flags.interval}s`);

      if (input.verbose) {
        this.log("\nInitial task status:");
        for (const task of initialTasks) {
          const taskId = task.taskArn?.split("/").pop()?.slice(0, 8) || "unknown";
          this.log(`  • ${taskId}: ${task.lastStatus} (desired: ${task.desiredStatus})`);
        }
      }

      // Execute polling and wait for completion
      const waitResult = await this.pollForTaskCompletion(
        input,
        flags,
        ecsService,
        taskArns,
        initialTasks,
      );

      // Display output and handle results
      this.displayWaitOutput(input, flags, waitResult);

      // Analyze results and exit appropriately
      this.handleWaitResults(flags, waitResult);
    } catch (error: unknown) {
      const formattedError = this.formatECSError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Poll for task completion with progress reporting
   *
   * @param input - Validated input parameters
   * @param flags - Command flags
   * @param ecsService - ECS service instance
   * @param taskArns - Task ARNs to monitor
   * @param initialTasks - Initial task state
   * @returns Wait operation result
   * @internal
   */
  private async pollForTaskCompletion(
    input: ECSConfig,
    flags: Interfaces.InferredFlags<typeof ECSTaskWaitCommand.flags>,
    ecsService: ECSService,
    taskArns: string[],
    initialTasks: TaskDescription[],
  ): Promise<WaitResult> {
    const startTime = Date.now();
    const timeoutMs = flags.timeout * 1000;
    let attempts = 0;
    let completedTasks: TaskDescription[] = [];
    let currentTasks = initialTasks;

    while (Date.now() - startTime < timeoutMs) {
      attempts++;

      // Get current task status
      currentTasks = await ecsService.describeTasks(
        taskArns,
        {
          ...(flags.cluster && { cluster: flags.cluster }),
        },
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      // Check which tasks have reached the desired state
      completedTasks = currentTasks.filter((task) => task.lastStatus === flags.state);

      // Progress reporting
      this.reportProgress(input, flags, startTime, attempts, currentTasks);

      // Check completion conditions
      if (this.shouldExitEarly(flags, completedTasks, currentTasks)) {
        break;
      }

      // Wait for next poll
      await new Promise((resolve) => setTimeout(resolve, flags.interval * 1000));
    }

    // Get final task status
    const finalTasks = await ecsService.describeTasks(
      taskArns,
      {
        ...(flags.cluster && { cluster: flags.cluster }),
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const timedOut = Date.now() - startTime >= timeoutMs;

    // Log completion status
    if (timedOut) {
      this.log(`\n Timeout reached after ${elapsed}s`);
    } else {
      this.log(`\nWait completed after ${elapsed}s (${attempts} attempts)`);
    }

    return {
      finalTasks,
      completedTasks,
      elapsed,
      timedOut,
      attempts,
    };
  }

  /**
   * Report polling progress
   *
   * @param input - Input configuration
   * @param flags - Command flags
   * @param startTime - Start time for elapsed calculation
   * @param attempts - Current attempt number
   * @param currentTasks - Current task status
   * @internal
   */
  private reportProgress(
    input: ECSConfig,
    flags: Interfaces.InferredFlags<typeof ECSTaskWaitCommand.flags>,
    startTime: number,
    attempts: number,
    currentTasks: TaskDescription[],
  ): void {
    if (input.verbose || attempts % 4 === 1) {
      // Show progress every ~1 minute at 15s intervals
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      this.log(`\n Progress (${elapsed}s elapsed, attempt ${attempts}):`);

      const statusBreakdown: Record<string, number> = {};
      for (const task of currentTasks) {
        if (task.lastStatus) {
          statusBreakdown[task.lastStatus] = (statusBreakdown[task.lastStatus] || 0) + 1;
        }
      }

      for (const [status, count] of Object.entries(statusBreakdown)) {
        this.log(`  ${status}: ${count}`);
      }
    }
  }

  /**
   * Check if polling should exit early
   *
   * @param flags - Command flags
   * @param completedTasks - Tasks that reached desired state
   * @param currentTasks - All current tasks
   * @returns True if should exit early
   * @internal
   */
  private shouldExitEarly(
    flags: Interfaces.InferredFlags<typeof ECSTaskWaitCommand.flags>,
    completedTasks: TaskDescription[],
    currentTasks: TaskDescription[],
  ): boolean {
    // Exit if waiting for first task and one completed
    if (flags["exit-on-first"] && completedTasks.length > 0) {
      return true;
    }

    // Exit if all tasks completed
    return completedTasks.length === currentTasks.length;
  }

  /**
   * Display wait operation output
   *
   * @param input - Input configuration
   * @param flags - Command flags
   * @param result - Wait operation result
   * @internal
   */
  private displayWaitOutput(
    input: ECSConfig,
    flags: Interfaces.InferredFlags<typeof ECSTaskWaitCommand.flags>,
    result: WaitResult,
  ): void {
    switch (input.format) {
      case "table": {
        this.displayTableOutput(flags, result);
        break;
      }
      case "json": {
        this.displayJsonOutput(flags, result);
        break;
      }
      case "jsonl": {
        this.displayJsonLinesOutput(flags, result);
        break;
      }
      case "csv": {
        this.displayCsvOutput(flags, result);
        break;
      }
    }
  }

  /**
   * Display output in table format
   *
   * @param flags - Command flags
   * @param result - Wait result
   * @internal
   */
  private displayTableOutput(
    flags: Interfaces.InferredFlags<typeof ECSTaskWaitCommand.flags>,
    result: WaitResult,
  ): void {
    this.log(`\nFinal Status:`);

    const tableData = result.finalTasks.map((task) => {
      const taskId = task.taskArn.split("/").pop()?.slice(0, 8) || "unknown";
      const reachedState = task.lastStatus === flags.state;

      return {
        "Task ID": taskId,
        Status: task.lastStatus,
        Desired: task.desiredStatus,
        "Target Reached": reachedState ? "" : "❌",
        "Launch Type": task.launchType || "N/A",
      };
    });

    console.table(tableData);
  }

  /**
   * Display output in JSON format
   *
   * @param flags - Command flags
   * @param result - Wait result
   * @internal
   */
  private displayJsonOutput(
    flags: Interfaces.InferredFlags<typeof ECSTaskWaitCommand.flags>,
    result: WaitResult,
  ): void {
    this.log(
      JSON.stringify(
        {
          waitState: flags.state,
          timeout: flags.timeout,
          elapsed: result.elapsed,
          timedOut: result.timedOut,
          totalTasks: result.finalTasks.length,
          tasksReachedState: result.completedTasks.length,
          tasks: result.finalTasks,
        },
        undefined,
        2,
      ),
    );
  }

  /**
   * Display output in JSONL format
   *
   * @param flags - Command flags
   * @param result - Wait result
   * @internal
   */
  private displayJsonLinesOutput(
    flags: Interfaces.InferredFlags<typeof ECSTaskWaitCommand.flags>,
    result: WaitResult,
  ): void {
    for (const task of result.finalTasks) {
      this.log(
        JSON.stringify({
          ...task,
          waitState: flags.state,
          reachedState: task.lastStatus === flags.state,
          elapsed: result.elapsed,
        }),
      );
    }
  }

  /**
   * Display output in CSV format
   *
   * @param flags - Command flags
   * @param result - Wait result
   * @internal
   */
  private displayCsvOutput(
    flags: Interfaces.InferredFlags<typeof ECSTaskWaitCommand.flags>,
    result: WaitResult,
  ): void {
    // CSV header
    const headers = [
      "taskArn",
      "lastStatus",
      "desiredStatus",
      "waitState",
      "reachedState",
      "elapsed",
      "timedOut",
    ];
    this.log(headers.join(","));

    // CSV rows
    for (const task of result.finalTasks) {
      const row = [
        `"${task.taskArn}"`,
        `"${task.lastStatus}"`,
        `"${task.desiredStatus}"`,
        `"${flags.state}"`,
        task.lastStatus === flags.state ? "true" : "false",
        String(result.elapsed),
        String(result.timedOut),
      ];
      this.log(row.join(","));
    }
  }

  /**
   * Handle wait operation results and exit appropriately
   *
   * @param flags - Command flags
   * @param result - Wait operation result
   * @internal
   */
  private handleWaitResults(
    flags: Interfaces.InferredFlags<typeof ECSTaskWaitCommand.flags>,
    result: WaitResult,
  ): void {
    const successCount = result.finalTasks.filter((task) => task.lastStatus === flags.state).length;

    if (successCount === result.finalTasks.length) {
      this.log(
        `\nAll ${successCount} task${successCount === 1 ? "" : "s"} reached state: ${flags.state}`,
      );
    } else if (flags["exit-on-first"] && successCount > 0) {
      this.log(
        `\n First task reached state: ${flags.state} (${successCount}/${result.finalTasks.length} total)`,
      );
    } else {
      this.log(
        `\nOnly ${successCount}/${result.finalTasks.length} task${result.finalTasks.length === 1 ? "" : "s"} reached state: ${flags.state}`,
      );
      if (result.timedOut) {
        this.error("Wait operation timed out", { exit: 1 });
      } else {
        this.error("Not all tasks reached desired state", { exit: 1 });
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

    let formattedMessage = `Failed to wait for ECS tasks: ${errorMessage}`;

    if (guidance) {
      formattedMessage += `\n\nGuidance: ${guidance}`;
    }

    if (verbose && error instanceof Error && error.stack) {
      formattedMessage += `\n\nStack trace:\n${error.stack}`;
    }

    return formattedMessage;
  }
}
