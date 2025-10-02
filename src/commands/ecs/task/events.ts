/**
 * @module ecs/task/events
 * ECS task events command
 *
 * Retrieves and displays task-related events and state changes
 * for debugging task lifecycle and deployment issues.
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
 * Task event interface
 */
interface TaskEvent {
  timestamp: Date | string;
  type: string;
  source: string;
  message: string;
  details: string;
}

/**
 * ECS task events command for viewing task lifecycle events
 *
 * Retrieves and displays task events, state changes, and deployment
 * history for debugging and monitoring task behavior.
 *
 * @public
 */
export default class ECSTaskEventsCommand extends BaseCommand {
  static override readonly description = "View ECS task events and state changes";

  static override readonly examples = [
    {
      description: "View events for a task",
      command: "<%= config.bin %> <%= command.id %> task-arn",
    },
    {
      description: "View events for multiple tasks",
      command: "<%= config.bin %> <%= command.id %> task-arn-1,task-arn-2",
    },
    {
      description: "View events for task in specific cluster",
      command: "<%= config.bin %> <%= command.id %> task-id --cluster my-cluster",
    },
    {
      description: "View events with JSON output",
      command: "<%= config.bin %> <%= command.id %> task-arn --format json",
    },
    {
      description: "View detailed events with timestamps",
      command: "<%= config.bin %> <%= command.id %> task-arn --verbose",
    },
    {
      description: "Filter events by type",
      command: "<%= config.bin %> <%= command.id %> task-arn --event-type state-change",
    },
  ];

  static override readonly args = {
    taskArns: Args.string({
      name: "taskArns",
      description: "Comma-separated list of task ARNs or IDs to view events for",
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

    "event-type": Flags.string({
      description: "Filter events by type",
      options: ["state-change", "container-change", "all"],
      default: "all",
      helpValue: "TYPE",
    }),

    since: Flags.string({
      description: "Show events since duration (e.g., 1h, 30m, 2d)",
      helpValue: "DURATION",
    }),

    limit: Flags.integer({
      description: "Maximum number of events to display per task",
      default: 20,
      helpValue: "NUMBER",
    }),
  };

  /**
   * Execute the ECS task events command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSTaskEventsCommand);

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

      // Create ECS service instance
      const ecsService = new ECSService({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      // Get task information
      const tasks = await ecsService.describeTasks(
        taskArns,
        {
          ...(flags.cluster && { cluster: flags.cluster }),
        },
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      if (tasks.length === 0) {
        this.error("No tasks found with the specified ARNs.", { exit: 1 });
        return;
      }

      // Display header information
      this.log(` Task Events for ${tasks.length} task${tasks.length === 1 ? "" : "s"}`);

      if (input.verbose) {
        this.log(`Event type filter: ${flags["event-type"]}`);
        this.log(`Event limit per task: ${flags.limit}`);
        if (flags.since) {
          this.log(`Since: ${flags.since}`);
        }
        this.log(""); // Empty line
      }

      // Process and display task events
      this.displayTaskEvents(input, flags, tasks);

      if (input.verbose) {
        this.displayVerboseInfo();
      }
    } catch (error) {
      const formattedError = this.formatECSError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Display events for all tasks
   *
   * @param input - Validated input configuration
   * @param flags - Command flags
   * @param tasks - Tasks to process
   * @internal
   */
  private displayTaskEvents(
    input: ECSConfig,
    flags: Interfaces.InferredFlags<typeof ECSTaskEventsCommand.flags>,
    tasks: TaskDescription[],
  ): void {
    for (const [taskIndex, task] of tasks.entries()) {
      if (taskIndex > 0) {
        this.log("\n" + "=".repeat(80) + "\n");
      }

      const taskId = task.taskArn?.split("/").pop()?.slice(0, 8) || "unknown";
      const clusterName = task.clusterArn?.split("/").pop() || "Unknown";
      const taskFamily = task.taskDefinitionArn?.split("/").pop()?.split(":")[0] || "Unknown";

      // Collect and filter events
      const events = this.collectTaskEvents(task, taskId);
      const filteredEvents = this.filterAndSortEvents(events, flags);

      // Display events in requested format
      this.displayEvents(input, task, taskId, clusterName, taskFamily, filteredEvents, taskIndex);
    }
  }

  /**
   * Collect task lifecycle and container events
   *
   * @param task - Task to collect events for
   * @param taskId - Task ID for event details
   * @returns Array of task events
   * @internal
   */
  private collectTaskEvents(task: TaskDescription, taskId: string): TaskEvent[] {
    const events = [];

    // Task lifecycle events
    if (task.createdAt) {
      events.push({
        timestamp: task.createdAt,
        type: "state-change",
        source: "task",
        message: "Task created",
        details: `Task ${taskId} was created`,
      });
    }

    if (task.startedAt) {
      events.push({
        timestamp: task.startedAt,
        type: "state-change",
        source: "task",
        message: "Task started",
        details: `Task ${taskId} transitioned to RUNNING state`,
      });
    }

    if (task.stoppedAt) {
      events.push({
        timestamp: task.stoppedAt,
        type: "state-change",
        source: "task",
        message: "Task stopped",
        details: `Task ${taskId} stopped. Reason: ${task.stoppedReason || "Unknown"}`,
      });
    }

    // Container events
    this.addContainerEvents(events, task);

    // Add current status as the latest event
    events.push({
      timestamp: new Date().toISOString(),
      type: "state-change",
      source: "task",
      message: `Current status: ${task.lastStatus}`,
      details: `Task ${taskId} is currently ${task.lastStatus}`,
    });

    return events;
  }

  /**
   * Add container-specific events
   *
   * @param events - Events array to add to
   * @param task - Task with containers
   * @internal
   */
  private addContainerEvents(events: TaskEvent[], task: TaskDescription): void {
    if (task.containers) {
      for (const container of task.containers) {
        if (container.lastStatus === "STOPPED" && container.exitCode !== undefined) {
          events.push({
            timestamp: task.stoppedAt?.toISOString() ?? new Date().toISOString(),
            type: "container-change",
            source: "container",
            message: `Container ${container.name} exited`,
            details:
              `Exit code: ${container.exitCode}` +
              (container.reason ? `, Reason: ${container.reason}` : ""),
          });
        }

        if (container.healthStatus === "UNHEALTHY") {
          events.push({
            timestamp: new Date().toISOString(),
            type: "container-change",
            source: "container",
            message: `Container ${container.name} unhealthy`,
            details: "Health check failed",
          });
        }
      }
    }
  }

  /**
   * Filter and sort events based on flags
   *
   * @param events - Events to filter
   * @param flags - Command flags
   * @returns Filtered and sorted events
   * @internal
   */
  private filterAndSortEvents(
    events: TaskEvent[],
    flags: Interfaces.InferredFlags<typeof ECSTaskEventsCommand.flags>,
  ): TaskEvent[] {
    // Filter events by type
    let filteredEvents = events;
    if (flags["event-type"] !== "all") {
      filteredEvents = events.filter((event) => event.type === flags["event-type"]);
    }

    // Sort by timestamp (newest first) and limit
    filteredEvents.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return filteredEvents.slice(0, flags.limit);
  }

  /**
   * Display events in the requested format
   *
   * @param input - Input configuration
   * @param task - Task information
   * @param taskId - Task ID
   * @param clusterName - Cluster name
   * @param taskFamily - Task family
   * @param events - Events to display
   * @param taskIndex - Task index for CSV headers
   * @internal
   */
  private displayEvents(
    input: ECSConfig,
    task: TaskDescription,
    taskId: string,
    clusterName: string,
    taskFamily: string,
    events: TaskEvent[],
    taskIndex: number,
  ): void {
    switch (input.format) {
      case "table": {
        this.displayEventsAsTable(task, taskId, clusterName, taskFamily, events, input.verbose);
        break;
      }
      case "json": {
        this.displayEventsAsJson(task, taskId, clusterName, taskFamily, events);
        break;
      }
      case "jsonl": {
        this.displayEventsAsJsonLines(task, taskId, events);
        break;
      }
      case "csv": {
        this.displayEventsAsCsv(task, taskId, events, taskIndex);
        break;
      }
    }
  }

  /**
   * Display events in table format
   *
   * @param task - Task information
   * @param taskId - Task ID
   * @param clusterName - Cluster name
   * @param taskFamily - Task family
   * @param events - Events to display
   * @param verbose - Verbose flag
   * @internal
   */
  private displayEventsAsTable(
    task: TaskDescription,
    taskId: string,
    clusterName: string,
    taskFamily: string,
    events: TaskEvent[],
    verbose: boolean,
  ): void {
    this.log(`Task: ${taskId} (${taskFamily})`);
    this.log(`Cluster: ${clusterName}`);
    this.log(`Status: ${task.lastStatus} (desired: ${task.desiredStatus})`);
    this.log(`ARN: ${task.taskArn}`);

    if (events.length === 0) {
      this.log("\nNo events found matching criteria.");
    } else {
      this.log(`\nEvents (${events.length} shown):`);

      for (const event of events) {
        const timestamp = new Date(event.timestamp).toLocaleString();

        this.log(`\n  ${timestamp}`);
        this.log(`     ${event.message}`);
        if (event.details && verbose) {
          this.log(`     Details: ${event.details}`);
        }
      }
    }
  }

  /**
   * Display events in JSON format
   *
   * @param task - Task information
   * @param taskId - Task ID
   * @param clusterName - Cluster name
   * @param taskFamily - Task family
   * @param events - Events to display
   * @internal
   */
  private displayEventsAsJson(
    task: TaskDescription,
    taskId: string,
    clusterName: string,
    taskFamily: string,
    events: TaskEvent[],
  ): void {
    this.log(
      JSON.stringify(
        {
          taskArn: task.taskArn,
          taskId,
          clusterName,
          taskFamily,
          currentStatus: task.lastStatus,
          desiredStatus: task.desiredStatus,
          events,
        },
        undefined,
        2,
      ),
    );
  }

  /**
   * Display events in JSONL format
   *
   * @param task - Task information
   * @param taskId - Task ID
   * @param events - Events to display
   * @internal
   */
  private displayEventsAsJsonLines(
    task: TaskDescription,
    taskId: string,
    events: TaskEvent[],
  ): void {
    for (const event of events) {
      this.log(
        JSON.stringify({
          taskArn: task.taskArn,
          taskId,
          ...event,
        }),
      );
    }
  }

  /**
   * Display events in CSV format
   *
   * @param task - Task information
   * @param taskId - Task ID
   * @param events - Events to display
   * @param taskIndex - Task index for header
   * @internal
   */
  private displayEventsAsCsv(
    task: TaskDescription,
    taskId: string,
    events: TaskEvent[],
    taskIndex: number,
  ): void {
    if (taskIndex === 0) {
      // CSV header (only on first task)
      const headers = ["taskArn", "taskId", "timestamp", "type", "source", "message", "details"];
      this.log(headers.join(","));
    }

    // CSV rows
    for (const event of events) {
      const row = [
        `"${task.taskArn}"`,
        `"${taskId}"`,
        `"${typeof event.timestamp === "string" ? event.timestamp : event.timestamp.toISOString()}"`,
        `"${event.type}"`,
        `"${event.source}"`,
        `"${event.message}"`,
        `"${event.details}"`,
      ];
      this.log(row.join(","));
    }
  }

  /**
   * Display verbose information
   *
   * @internal
   */
  private displayVerboseInfo(): void {
    this.log(`\nEvent Information:`);
    this.log(`This command shows task lifecycle events and container state changes.`);
    this.log(`For detailed CloudWatch Events, use AWS CloudWatch Logs or EventBridge.`);
    this.log(`\nAdditional Debugging:`);
    this.log(`  • View task logs: aws-ts ecs task logs <task-arn>`);
    this.log(`  • Describe task details: aws-ts ecs task describe <task-arn>`);
    this.log(`  • Monitor real-time: aws-ts ecs task wait <task-arn> --state RUNNING`);
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

    let formattedMessage = `Failed to retrieve ECS task events: ${errorMessage}`;

    if (guidance) {
      formattedMessage += `\n\nGuidance: ${guidance}`;
    }

    if (verbose && error instanceof Error && error.stack) {
      formattedMessage += `\n\nStack trace:\n${error.stack}`;
    }

    return formattedMessage;
  }
}
