/**
 * ECS service update command
 *
 * Updates an existing ECS service configuration including
 * task definition, desired count, and network configuration.
 *
 */

import type { Interfaces } from "@oclif/core";
import { Args, Flags } from "@oclif/core";
import { getECSErrorGuidance } from "../../../lib/ecs-errors.js";
import type { ECSUpdateService } from "../../../lib/ecs-schemas.js";
import { ECSUpdateServiceSchema } from "../../../lib/ecs-schemas.js";
import { ECSService, type ServiceDescription } from "../../../services/ecs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * ECS service update command for modifying service configuration
 *
 * Updates existing ECS service configuration including task definition,
 * desired count, networking, and deployment settings.
 *
 * @public
 */
export default class ECSServiceUpdateCommand extends BaseCommand {
  static override readonly description = "Update an ECS service configuration";

  static override readonly examples = [
    {
      description: "Update service task definition",
      command: "<%= config.bin %> <%= command.id %> my-service --task-definition my-task:2",
    },
    {
      description: "Scale service to 5 instances",
      command: "<%= config.bin %> <%= command.id %> my-service --desired-count 5",
    },
    {
      description: "Update service in specific cluster",
      command:
        "<%= config.bin %> <%= command.id %> my-service --cluster my-cluster --desired-count 3",
    },
    {
      description: "Force new deployment",
      command: "<%= config.bin %> <%= command.id %> my-service --force-new-deployment",
    },
    {
      description: "Update service networking",
      command:
        "<%= config.bin %> <%= command.id %> my-service --subnets subnet-1,subnet-2 --security-groups sg-123",
    },
  ];

  static override readonly args = {
    serviceName: Args.string({
      name: "serviceName",
      description: "Name of the service to update",
      required: true,
    }),
  };

  static override readonly flags = {
    cluster: Flags.string({
      char: "c",
      description: "Name of the cluster containing the service",
      helpValue: "CLUSTER_NAME",
    }),

    "task-definition": Flags.string({
      description: "New task definition family and revision",
      helpValue: "TASK_DEFINITION",
    }),

    "desired-count": Flags.integer({
      description: "New desired number of tasks",
      helpValue: "COUNT",
    }),

    "force-new-deployment": Flags.boolean({
      description: "Force a new deployment of the service",
      default: false,
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
   * Execute the ECS service update command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSServiceUpdateCommand);

    try {
      this.validateUpdateParameters(flags);
      const networkConfiguration = this.buildNetworkConfiguration(flags);

      const input: ECSUpdateService = ECSUpdateServiceSchema.parse({
        serviceName: args.serviceName,
        clusterName: flags.cluster,
        taskDefinition: flags["task-definition"],
        desiredCount: flags["desired-count"],
        networkConfiguration,
        forceNewDeployment: flags["force-new-deployment"],
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

      const service = await this.updateECSService(ecsService, input);

      this.displayUpdateResult(service, input);

      if (input.verbose) {
        this.displayVerboseInformation(service, input);
      }
    } catch (error) {
      const formattedError = this.formatECSError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Validate that at least one update parameter is provided
   *
   * @param flags - Command flags
   * @throws Error when no update parameters are specified
   * @internal
   */
  private validateUpdateParameters(
    flags: Interfaces.InferredFlags<typeof ECSServiceUpdateCommand.flags>,
  ): void {
    const hasUpdates = !!(
      flags["task-definition"] ||
      flags["desired-count"] !== undefined ||
      flags["force-new-deployment"] ||
      flags.subnets
    );

    if (!hasUpdates) {
      throw new Error(
        "At least one update parameter must be specified (task-definition, desired-count, force-new-deployment, or networking)",
      );
    }
  }

  /**
   * Build network configuration from subnet and security group flags
   *
   * @param flags - Command flags
   * @returns Network configuration object or undefined
   * @internal
   */
  private buildNetworkConfiguration(
    flags: Interfaces.InferredFlags<typeof ECSServiceUpdateCommand.flags>,
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
   * Update the ECS service with provided configuration
   *
   * @param ecsService - ECS service instance
   * @param input - Validated input parameters
   * @returns Updated service description
   * @internal
   */
  private async updateECSService(
    ecsService: ECSService,
    input: ECSUpdateService,
  ): Promise<ServiceDescription> {
    return await ecsService.updateService(
      {
        service: input.serviceName,
        ...(input.clusterName && { cluster: input.clusterName }),
        ...(input.taskDefinition && { taskDefinition: input.taskDefinition }),
        ...(input.desiredCount !== undefined && { desiredCount: input.desiredCount }),
        ...(input.networkConfiguration && { networkConfiguration: input.networkConfiguration }),
        forceNewDeployment: input.forceNewDeployment,
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );
  }

  /**
   * Display service update result in specified format
   *
   * @param service - Updated service description
   * @param input - Validated input parameters
   * @internal
   */
  private displayUpdateResult(service: ServiceDescription, input: ECSUpdateService): void {
    switch (input.format) {
      case "table": {
        this.displayTableResult(service);
        break;
      }
      case "json": {
        this.displayJsonResult(service);
        break;
      }
      case "jsonl": {
        this.displayJsonLinesResult(service);
        break;
      }
      case "csv": {
        this.displayCsvResult(service);
        break;
      }
    }
  }

  /**
   * Display result in table format
   *
   * @param service - Updated service description
   * @internal
   */
  private displayTableResult(service: ServiceDescription): void {
    this.log(`Successfully updated ECS service '${service.serviceName}'`);
    this.log(`  ARN: ${service.serviceArn}`);
    this.log(`  Cluster: ${service.clusterArn.split("/").pop() || "Unknown"}`);
    this.log(`  Status: ${service.status}`);
    this.log(`  Task Definition: ${service.taskDefinition}`);
    this.log(`  Desired Count: ${service.desiredCount}`);
    this.log(`  Running Count: ${service.runningCount}`);
    this.log(`  Pending Count: ${service.pendingCount}`);

    this.displayActiveDeployments(service);
  }

  /**
   * Display active deployments for the service
   *
   * @param service - Updated service description
   * @internal
   */
  private displayActiveDeployments(service: ServiceDescription): void {
    if (service.deployments && service.deployments.length > 0) {
      this.log("\nActive Deployments:");
      for (const deployment of service.deployments) {
        this.log(`  - Status: ${deployment.status}`);
        this.log(`    Task Definition: ${deployment.taskDefinition}`);
        this.log(`    Desired: ${deployment.desiredCount}, Running: ${deployment.runningCount}`);
      }
    }
  }

  /**
   * Display result in JSON format
   *
   * @param service - Updated service description
   * @internal
   */
  private displayJsonResult(service: ServiceDescription): void {
    this.log(JSON.stringify(service, undefined, 2));
  }

  /**
   * Display result in JSONL format
   *
   * @param service - Updated service description
   * @internal
   */
  private displayJsonLinesResult(service: ServiceDescription): void {
    this.log(JSON.stringify(service));
  }

  /**
   * Display result in CSV format
   *
   * @param service - Updated service description
   * @internal
   */
  private displayCsvResult(service: ServiceDescription): void {
    const headers = [
      "serviceName",
      "serviceArn",
      "clusterArn",
      "status",
      "taskDefinition",
      "desiredCount",
      "runningCount",
      "pendingCount",
    ];
    this.log(headers.join(","));

    const row = [
      `"${service.serviceName}"`,
      `"${service.serviceArn}"`,
      `"${service.clusterArn}"`,
      `"${service.status}"`,
      `"${service.taskDefinition}"`,
      String(service.desiredCount),
      String(service.runningCount),
      String(service.pendingCount),
    ];
    this.log(row.join(","));
  }

  /**
   * Display verbose information about service update
   *
   * @param service - Updated service description
   * @param input - Validated input parameters
   * @internal
   */
  private displayVerboseInformation(service: ServiceDescription, input: ECSUpdateService): void {
    this.log(`\nService update initiated. Monitor deployment progress with:`);
    const clusterPart = input.clusterName ? ` --cluster ${input.clusterName}` : "";
    this.log(`  aws-ts ecs service describe ${service.serviceName}${clusterPart}`);
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

    let formattedMessage = `Failed to update ECS service: ${errorMessage}`;

    if (guidance) {
      formattedMessage += `\n\nGuidance: ${guidance}`;
    }

    if (verbose && error instanceof Error && error.stack) {
      formattedMessage += `\n\nStack trace:\n${error.stack}`;
    }

    return formattedMessage;
  }
}
