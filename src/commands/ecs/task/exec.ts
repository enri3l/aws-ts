/**
 * ECS task exec command
 *
 * Executes commands in running ECS task containers using
 * ECS Exec for debugging and troubleshooting purposes.
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
 * ECS task exec command for interactive container access
 *
 * Executes commands in running ECS task containers using
 * ECS Exec capability for debugging and troubleshooting.
 *
 * @public
 */
export default class ECSTaskExecCommand extends BaseCommand {
  static override readonly description = "Execute commands in running ECS task containers";

  static override readonly examples = [
    {
      description: "Start interactive shell in a container",
      command: "<%= config.bin %> <%= command.id %> task-arn --container-name web",
    },
    {
      description: "Execute specific command in container",
      command:
        "<%= config.bin %> <%= command.id %> task-arn --container-name web --command 'ls -la'",
    },
    {
      description: "Connect to task in specific cluster",
      command:
        "<%= config.bin %> <%= command.id %> task-id --cluster my-cluster --container-name app",
    },
    {
      description: "Execute command with specific shell",
      command:
        "<%= config.bin %> <%= command.id %> task-arn --container-name web --command 'ps aux' --shell /bin/bash",
    },
    {
      description: "Check container status before connecting",
      command: "<%= config.bin %> <%= command.id %> task-arn --container-name web --dry-run",
    },
  ];

  static override readonly args = {
    taskArn: Args.string({
      name: "taskArn",
      description: "Task ARN or ID to execute commands in",
      required: true,
    }),
  };

  static override readonly flags = {
    cluster: Flags.string({
      char: "c",
      description: "Name of the cluster containing the task",
      helpValue: "CLUSTER_NAME",
    }),

    "container-name": Flags.string({
      description: "Name of the container to execute commands in",
      required: true,
      helpValue: "CONTAINER_NAME",
    }),

    command: Flags.string({
      description: "Command to execute (defaults to interactive shell)",
      helpValue: "COMMAND",
    }),

    shell: Flags.string({
      description: "Shell to use for interactive sessions",
      default: "/bin/sh",
      helpValue: "SHELL_PATH",
    }),

    "dry-run": Flags.boolean({
      description: "Check prerequisites without executing commands",
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

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the ECS task exec command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSTaskExecCommand);

    try {
      const input: ECSConfig = ECSConfigSchema.parse({
        region: flags.region,
        profile: flags.profile,
        format: "table", // Default format for exec
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

      const { task, targetContainer } = await this.validateAndGetTaskContainer(
        ecsService,
        args.taskArn,
        flags,
        input,
      );

      this.displayConnectionDetails(task, targetContainer, flags);

      if (flags["dry-run"]) {
        this.displayDryRunInfo();
        return;
      }

      this.displayExecutionGuidance(input, args.taskArn, flags, task, targetContainer);

      if (input.verbose) {
        this.displayVerboseInformation(task, targetContainer);
      }
    } catch (error) {
      const formattedError = this.formatECSError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Validate task exists and get target container
   *
   * @param ecsService - ECS service instance
   * @param taskArn - Task ARN to validate
   * @param flags - Command flags
   * @param input - Validated input config
   * @returns Task and target container
   * @internal
   */
  private async validateAndGetTaskContainer(
    ecsService: ECSService,
    taskArn: string,
    flags: Interfaces.InferredFlags<typeof ECSTaskExecCommand.flags>,
    input: ECSConfig,
  ): Promise<{
    task: TaskDescription;
    targetContainer: NonNullable<TaskDescription["containers"]>[number];
  }> {
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
    this.validateTaskStatus(task);
    const targetContainer = this.validateAndGetContainer(task, flags["container-name"]);
    this.validateContainerStatus(targetContainer, flags["container-name"]);

    return { task, targetContainer };
  }

  /**
   * Validate task is in running status
   *
   * @param task - Task to validate
   * @internal
   */
  private validateTaskStatus(task: TaskDescription): void {
    const taskId = task.taskArn.split("/").pop()?.slice(0, 8) || "unknown";

    if (task.lastStatus !== "RUNNING") {
      this.error(
        `Task ${taskId} is not running (status: ${task.lastStatus}). ECS Exec requires running tasks.`,
        {
          exit: 1,
        },
      );
    }
  }

  /**
   * Validate container exists and return it
   *
   * @param task - Task containing containers
   * @param containerName - Name of target container
   * @returns Target container
   * @internal
   */
  private validateAndGetContainer(
    task: TaskDescription,
    containerName: string,
  ): NonNullable<TaskDescription["containers"]>[number] {
    const taskId = task.taskArn.split("/").pop()?.slice(0, 8) || "unknown";

    if (!task.containers || task.containers.length === 0) {
      this.error(`Task ${taskId} has no container information available.`, {
        exit: 1,
      });
    }

    const targetContainer = task.containers.find((container) => container.name === containerName);

    if (!targetContainer) {
      this.log(`Container '${containerName}' not found in task ${taskId}.`);
      this.log("Available containers:");
      for (const container of task.containers) {
        this.log(`  • ${container.name} (status: ${container.lastStatus || "unknown"})`);
      }
      this.error("Container not found", { exit: 1 });
    }

    return targetContainer;
  }

  /**
   * Validate container is in running status
   *
   * @param container - Container to validate
   * @param containerName - Container name for error messages
   * @internal
   */
  private validateContainerStatus(
    container: NonNullable<TaskDescription["containers"]>[number],
    containerName: string,
  ): void {
    if (container.lastStatus !== "RUNNING") {
      this.error(
        `Container '${containerName}' is not running (status: ${container.lastStatus || "unknown"}).`,
        {
          exit: 1,
        },
      );
    }
  }

  /**
   * Display connection details for the task and container
   *
   * @param task - Task information
   * @param targetContainer - Target container
   * @param flags - Command flags
   * @internal
   */
  private displayConnectionDetails(
    task: TaskDescription,
    targetContainer: NonNullable<TaskDescription["containers"]>[number],
    flags: Interfaces.InferredFlags<typeof ECSTaskExecCommand.flags>,
  ): void {
    const taskId = task.taskArn.split("/").pop()?.slice(0, 8) || "unknown";

    this.log(`ECS Exec Connection Details`);
    this.log(`Task: ${taskId}`);
    this.log(`Container: ${flags["container-name"]}`);
    this.log(`Status: ${targetContainer.lastStatus}`);
    this.log(`Cluster: ${task.clusterArn.split("/").pop() || "Unknown"}`);
  }

  /**
   * Display dry run prerequisite information
   *
   * @internal
   */
  private displayDryRunInfo(): void {
    this.log(`\nPrerequisites Check:`);
    this.log(`  • Task is running: `);
    this.log(`  • Container is running: `);
    this.log(`  • Container exists: `);
    this.log(`\nAdditional requirements (not verified):`);
    this.log(`  • Task definition has enableExecuteCommand: true`);
    this.log(`  • ECS service/task was created with execute command enabled`);
    this.log(`  • Task role has ssmmessages:* permissions`);
    this.log(`  • SSM agent is running in container`);
  }

  /**
   * Display execution guidance and AWS CLI command
   *
   * @param input - Validated input config
   * @param taskArn - Task ARN
   * @param flags - Command flags
   * @param targetContainer - Target container
   * @internal
   */
  private displayExecutionGuidance(
    input: ECSConfig,
    taskArn: string,
    flags: Interfaces.InferredFlags<typeof ECSTaskExecCommand.flags>,
    task: TaskDescription,
    targetContainer: NonNullable<TaskDescription["containers"]>[number],
  ): void {
    this.displayRequirements();
    this.displayAwsCommand(input, taskArn, flags);
    this.displayUsageInstructions(flags);
    this.displayAlternativeMethods(task, targetContainer);
  }

  /**
   * Display ECS Exec requirements
   *
   * @internal
   */
  private displayRequirements(): void {
    this.log(`\nECS Exec Requirements:`);
    this.log(`Before using ECS Exec, ensure:`);
    this.log(`  1. Task definition has "enableExecuteCommand": true`);
    this.log(`  2. Service/task was created with execute command enabled`);
    this.log(
      `  3. Task IAM role has ssmmessages:CreateControlChannel, ssmmessages:CreateDataChannel, ssmmessages:OpenControlChannel, ssmmessages:OpenDataChannel permissions`,
    );
    this.log(`  4. SSM Session Manager plugin is installed locally`);
  }

  /**
   * Display AWS CLI command to execute
   *
   * @param input - Validated input config
   * @param taskArn - Task ARN
   * @param flags - Command flags
   * @internal
   */
  private displayAwsCommand(
    input: ECSConfig,
    taskArn: string,
    flags: Interfaces.InferredFlags<typeof ECSTaskExecCommand.flags>,
  ): void {
    this.log(`\nAWS CLI Command to Execute:`);

    const command = flags.command || flags.shell;
    const awsCommand = [
      "aws ecs execute-command",
      `--cluster ${flags.cluster || "default"}`,
      `--task ${taskArn}`,
      `--container ${flags["container-name"]}`,
      flags.command ? `--command "${command}"` : "--interactive",
      ...(input.region ? [`--region ${input.region}`] : []),
      ...(input.profile ? [`--profile ${input.profile}`] : []),
    ].join(" ");

    this.log(awsCommand);
  }

  /**
   * Display usage instructions for the command
   *
   * @param flags - Command flags
   * @internal
   */
  private displayUsageInstructions(
    flags: Interfaces.InferredFlags<typeof ECSTaskExecCommand.flags>,
  ): void {
    const command = flags.command || flags.shell;

    if (flags.command === undefined) {
      this.log(`\nThis will start an interactive shell (${flags.shell}) in the container.`);
      this.log(`Use Ctrl+C or 'exit' to terminate the session.`);
    } else {
      this.log(`\nThis will execute: ${command}`);
    }
  }

  /**
   * Display alternative access methods
   *
   * @param targetContainer - Target container
   * @internal
   */
  private displayAlternativeMethods(
    task: TaskDescription,
    _targetContainer: NonNullable<TaskDescription["containers"]>[number],
  ): void {
    const taskId = task.taskArn.split("/").pop()?.slice(0, 8) || "unknown";

    this.log(`\nAlternative Methods:`);
    this.log(
      `  • AWS Console: ECS → Clusters → Tasks → ${taskId} → Configuration → Execute command`,
    );
    this.log(`  • Session Manager Console: Systems Manager → Session Manager → Start session`);
  }

  /**
   * Display verbose debugging information
   *
   * @param task - Task information
   * @param targetContainer - Target container
   * @internal
   */
  private displayVerboseInformation(
    task: TaskDescription,
    targetContainer: NonNullable<TaskDescription["containers"]>[number],
  ): void {
    this.log(`\nDebug Information:`);
    this.log(`Task ARN: ${task.taskArn}`);
    this.log(`Container ARN: ${targetContainer.containerArn}`);
    this.log(`Task Definition: ${task.taskDefinitionArn}`);
    this.log(`Platform Version: ${task.platformVersion || "N/A"}`);
    this.log(`Launch Type: ${task.launchType || "N/A"}`);

    if (targetContainer.networkInterfaces) {
      this.log(`Network Interfaces:`);
      for (const ni of targetContainer.networkInterfaces) {
        if (ni.privateIpv4Address) {
          this.log(`  Private IP: ${ni.privateIpv4Address}`);
        }
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

    let formattedMessage = `Failed to execute ECS task command: ${errorMessage}`;

    if (guidance) {
      formattedMessage += `\n\nGuidance: ${guidance}`;
    }

    if (verbose && error instanceof Error && error.stack) {
      formattedMessage += `\n\nStack trace:\n${error.stack}`;
    }

    return formattedMessage;
  }
}
