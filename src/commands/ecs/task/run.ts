/**
 * ECS task run command
 *
 * Runs a standalone task using a task definition with support
 * for overrides, networking, and various launch configurations.
 *
 */

import type { Interfaces } from "@oclif/core";
import { Args, Flags } from "@oclif/core";
import { formatECSError } from "../../../lib/ecs-errors.js";
import type { ECSRunTask } from "../../../lib/ecs-schemas.js";
import { ECSRunTaskSchema } from "../../../lib/ecs-schemas.js";
import { ECSService, type RunTaskResult } from "../../../services/ecs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * ECS task run command for executing standalone tasks
 *
 * Runs tasks using a task definition with support for
 * configuration overrides, networking, and launch options.
 *
 * @public
 */
export default class ECSTaskRunCommand extends BaseCommand {
  static override readonly description = "Run a standalone ECS task";

  static override readonly examples = [
    {
      description: "Run a task with default settings",
      command: "<%= config.bin %> <%= command.id %> my-task-definition",
    },
    {
      description: "Run a task in a specific cluster",
      command: "<%= config.bin %> <%= command.id %> my-task:1 --cluster my-cluster",
    },
    {
      description: "Run multiple instances of a task",
      command: "<%= config.bin %> <%= command.id %> my-task --count 3",
    },
    {
      description: "Run a Fargate task with networking",
      command:
        "<%= config.bin %> <%= command.id %> my-task --launch-type FARGATE --subnets subnet-1,subnet-2",
    },
    {
      description: "Run task with command override",
      command:
        "<%= config.bin %> <%= command.id %> my-task --container-name web --command 'echo hello'",
    },
    {
      description: "Run task with environment variables",
      command:
        "<%= config.bin %> <%= command.id %> my-task --container-name web --env KEY1=value1,KEY2=value2",
    },
  ];

  static override readonly args = {
    taskDefinition: Args.string({
      name: "taskDefinition",
      description: "Task definition family and revision (e.g., my-task:1)",
      required: true,
    }),
  };

  static override readonly flags = {
    cluster: Flags.string({
      char: "c",
      description: "Name of the cluster to run the task in",
      helpValue: "CLUSTER_NAME",
    }),

    count: Flags.integer({
      description: "Number of task instances to run",
      default: 1,
      helpValue: "COUNT",
    }),

    "launch-type": Flags.string({
      description: "Launch type for the task",
      options: ["EC2", "FARGATE", "EXTERNAL"],
      helpValue: "TYPE",
    }),

    subnets: Flags.string({
      description: "Comma-separated list of subnet IDs for VPC configuration",
      helpValue: "SUBNET_IDS",
    }),

    "security-groups": Flags.string({
      description: "Comma-separated list of security group IDs",
      helpValue: "SECURITY_GROUP_IDS",
    }),

    "assign-public-ip": Flags.string({
      description: "Assign public IP to tasks",
      options: ["ENABLED", "DISABLED"],
      helpValue: "STATUS",
    }),

    "container-name": Flags.string({
      description: "Container name for overrides",
      helpValue: "NAME",
    }),

    command: Flags.string({
      description: "Command to override in the container",
      helpValue: "COMMAND",
    }),

    env: Flags.string({
      description: "Environment variables as KEY=VALUE,KEY=VALUE",
      helpValue: "ENV_VARS",
    }),

    cpu: Flags.string({
      description: "CPU override for the task",
      helpValue: "CPU_UNITS",
    }),

    memory: Flags.string({
      description: "Memory override for the task",
      helpValue: "MEMORY_MB",
    }),

    "started-by": Flags.string({
      description: "Tag to identify who/what started the task",
      helpValue: "IDENTIFIER",
    }),

    group: Flags.string({
      description: "Task group name",
      helpValue: "GROUP_NAME",
    }),

    tags: Flags.string({
      description: "Comma-separated key=value pairs for resource tags",
      helpValue: "KEY=VALUE,KEY=VALUE",
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
   * Execute the ECS task run command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSTaskRunCommand);

    try {
      // Parse and build input parameters
      const { parsedTags, networkConfiguration, overrides } = this.parseInputParameters(flags);

      // Validate input using Zod schema
      const input: ECSRunTask = ECSRunTaskSchema.parse({
        taskDefinition: args.taskDefinition,
        clusterName: flags.cluster,
        count: flags.count,
        launchType: flags["launch-type"] as "EC2" | "FARGATE" | "EXTERNAL" | undefined,
        networkConfiguration,
        overrides,
        startedBy: flags["started-by"],
        group: flags.group,
        tags: parsedTags,
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

      // Run task
      const result = await ecsService.runTask(
        {
          taskDefinition: input.taskDefinition,
          ...(input.clusterName && { cluster: input.clusterName }),
          count: input.count,
          ...(input.launchType && { launchType: input.launchType }),
          ...(input.networkConfiguration && { networkConfiguration: input.networkConfiguration }),
          ...(input.overrides && { overrides: input.overrides }),
          ...(input.startedBy && { startedBy: input.startedBy }),
          ...(input.group && { group: input.group }),
          ...(input.tags && { tags: input.tags }),
        },
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      // Display output and verbose information
      this.formatAndDisplayEcsOutput(input, result);

      if (input.verbose) {
        this.displayVerboseInfo(input, result);
      }
    } catch (error) {
      const formattedError = formatECSError(error, "run ECS task", flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Parse and build input parameters from flags
   *
   * @param flags - Command flags
   * @returns Parsed input parameters
   * @internal
   */
  private parseInputParameters(flags: Interfaces.InferredFlags<typeof ECSTaskRunCommand.flags>): {
    parsedTags?: Array<{ key: string; value: string }>;
    networkConfiguration?: {
      awsvpcConfiguration?: {
        subnets: string[];
        securityGroups?: string[];
        assignPublicIp?: "ENABLED" | "DISABLED";
      };
    };
    overrides?: {
      cpu?: string;
      memory?: string;
      containerOverrides?: Array<{
        name: string;
        command?: string[];
        environment?: Array<{ name: string; value: string }>;
      }>;
    };
  } {
    const parsedTags = this.parseTags(flags);
    const environment = this.parseEnvironmentVariables(flags);
    const command = this.parseCommand(flags);
    const networkConfiguration = this.buildNetworkConfiguration(flags);
    const overrides = this.buildOverrides(flags, command, environment);

    return {
      ...(parsedTags && { parsedTags }),
      ...(networkConfiguration && { networkConfiguration }),
      ...(overrides && { overrides }),
    };
  }

  /**
   * Parse tags from comma-separated key=value pairs
   *
   * @param flags - Command flags
   * @returns Parsed tags array or undefined
   * @internal
   */
  private parseTags(
    flags: Interfaces.InferredFlags<typeof ECSTaskRunCommand.flags>,
  ): Array<{ key: string; value: string }> | undefined {
    if (!flags.tags) {
      return;
    }

    return flags.tags.split(",").map((tag) => {
      const [key, value] = tag.split("=");
      if (!key || !value) {
        throw new Error(`Invalid tag format: ${tag}. Use KEY=VALUE format.`);
      }
      return { key: key.trim(), value: value.trim() };
    });
  }

  /**
   * Parse environment variables from comma-separated key=value pairs
   *
   * @param flags - Command flags
   * @returns Parsed environment variables array or undefined
   * @internal
   */
  private parseEnvironmentVariables(
    flags: Interfaces.InferredFlags<typeof ECSTaskRunCommand.flags>,
  ): Array<{ name: string; value: string }> | undefined {
    if (!flags.env) {
      return;
    }

    return flags.env.split(",").map((environment_) => {
      const [name, value] = environment_.split("=");
      if (!name || !value) {
        throw new Error(
          `Invalid environment variable format: ${environment_}. Use KEY=VALUE format.`,
        );
      }
      return { name: name.trim(), value: value.trim() };
    });
  }

  /**
   * Parse command from space-separated string
   *
   * @param flags - Command flags
   * @returns Parsed command array or undefined
   * @internal
   */
  private parseCommand(
    flags: Interfaces.InferredFlags<typeof ECSTaskRunCommand.flags>,
  ): string[] | undefined {
    if (!flags.command) {
      return;
    }

    return flags.command.split(" ").filter((part) => part.length > 0);
  }

  /**
   * Build network configuration from subnet and security group flags
   *
   * @param flags - Command flags
   * @returns Network configuration object or undefined
   * @internal
   */
  private buildNetworkConfiguration(
    flags: Interfaces.InferredFlags<typeof ECSTaskRunCommand.flags>,
  ) {
    if (!flags.subnets) {
      return;
    }

    const subnets = flags.subnets.split(",").map((s) => s.trim());
    return {
      awsvpcConfiguration: {
        subnets,
        ...(flags["security-groups"] && {
          securityGroups: flags["security-groups"].split(",").map((s) => s.trim()),
        }),
        ...(flags["assign-public-ip"] && {
          assignPublicIp: flags["assign-public-ip"] as "ENABLED" | "DISABLED",
        }),
      },
    };
  }

  /**
   * Build container overrides from flags and parsed parameters
   *
   * @param flags - Command flags
   * @param command - Parsed command array
   * @param environment - Parsed environment variables
   * @returns Container overrides object or undefined
   * @internal
   */
  private buildOverrides(
    flags: Interfaces.InferredFlags<typeof ECSTaskRunCommand.flags>,
    command: string[] | undefined,
    environment: Array<{ name: string; value: string }> | undefined,
  ) {
    const hasOverrides =
      flags["container-name"] || command || environment || flags.cpu || flags.memory;
    if (!hasOverrides) {
      return;
    }

    return {
      ...(flags.cpu && { cpu: flags.cpu }),
      ...(flags.memory && { memory: flags.memory }),
      ...(flags["container-name"] && {
        containerOverrides: [
          {
            name: flags["container-name"],
            ...(command && { command }),
            ...(environment && { environment }),
          },
        ],
      }),
    };
  }

  /**
   * Display task run output in specified format
   *
   * @param input - Validated input parameters
   * @param result - Task run result
   * @internal
   */
  private formatAndDisplayEcsOutput(input: ECSRunTask, result: RunTaskResult): void {
    switch (input.format) {
      case "table": {
        this.displayTableOutput(result);
        break;
      }
      case "json": {
        this.log(JSON.stringify(result, undefined, 2));
        break;
      }
      case "jsonl": {
        this.displayJsonLinesOutput(result);
        break;
      }
      case "csv": {
        this.displayCsvOutput(result);
        break;
      }
    }
  }

  /**
   * Display output in table format
   *
   * @param result - Task run result
   * @internal
   */
  private displayTableOutput(result: RunTaskResult): void {
    this.log(
      `Successfully started ${result.tasks?.length || 0} task${(result.tasks?.length || 0) === 1 ? "" : "s"}`,
    );

    if (result.tasks && result.tasks.length > 0) {
      this.log("\nTasks:");
      for (const task of result.tasks) {
        const taskId = task.taskArn?.split("/").pop()?.slice(0, 8) || "unknown";
        this.log(`  • Task ${taskId}: ${task.lastStatus}`);
        this.log(`    ARN: ${task.taskArn}`);
        this.log(`    Task Definition: ${task.taskDefinitionArn}`);
        this.log(`    Launch Type: ${task.launchType || "N/A"}`);
        if (task.createdAt) {
          this.log(`    Created: ${task.createdAt?.toISOString() ?? "N/A"}`);
        }
      }
    }

    if (result.failures && result.failures.length > 0) {
      this.log("\nFailures:");
      for (const failure of result.failures) {
        this.log(`  • ${failure.reason || "Unknown error"}`);
        if (failure.detail) {
          this.log(`    Detail: ${failure.detail}`);
        }
      }
    }
  }

  /**
   * Display output in JSONL format
   *
   * @param result - Task run result
   * @internal
   */
  private displayJsonLinesOutput(result: RunTaskResult): void {
    if (result.tasks) {
      for (const task of result.tasks) {
        this.log(JSON.stringify(task));
      }
    }
  }

  /**
   * Display output in CSV format
   *
   * @param result - Task run result
   * @internal
   */
  private displayCsvOutput(result: RunTaskResult): void {
    if (result.tasks && result.tasks.length > 0) {
      // CSV header
      const headers = [
        "taskArn",
        "clusterArn",
        "taskDefinitionArn",
        "lastStatus",
        "desiredStatus",
        "launchType",
        "createdAt",
      ];
      this.log(headers.join(","));

      // CSV rows
      for (const task of result.tasks) {
        const row = [
          `"${task.taskArn}"`,
          `"${task.clusterArn}"`,
          `"${task.taskDefinitionArn}"`,
          `"${task.lastStatus}"`,
          `"${task.desiredStatus}"`,
          `"${task.launchType || "N/A"}"`,
          `"${task.createdAt?.toISOString() || "N/A"}"`,
        ];
        this.log(row.join(","));
      }
    }
  }

  /**
   * Display verbose monitoring information
   *
   * @param input - Validated input parameters
   * @param result - Task run result
   * @internal
   */
  private displayVerboseInfo(input: ECSRunTask, result: RunTaskResult): void {
    if (result.tasks && result.tasks.length > 0) {
      this.log(`\nTask execution initiated. Monitor progress with:`);
      for (const task of result.tasks) {
        const taskId = task.taskArn?.split("/").pop() || task.taskArn || "unknown";
        const clusterPart = input.clusterName ? ` --cluster ${input.clusterName}` : "";
        this.log(`  aws-ts ecs task describe ${taskId}${clusterPart}`);
      }
    }
  }
}
