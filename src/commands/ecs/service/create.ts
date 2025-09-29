/**
 * ECS service create command
 *
 * Creates a new ECS service with configuration options
 * including networking, load balancing, and service discovery.
 *
 */

import type { Interfaces } from "@oclif/core";
import { Args, Command, Flags } from "@oclif/core";
import { getECSErrorGuidance } from "../../../lib/ecs-errors.js";
import type { ECSCreateService } from "../../../lib/ecs-schemas.js";
import { ECSCreateServiceSchema } from "../../../lib/ecs-schemas.js";
import { ECSService, type ServiceDescription } from "../../../services/ecs-service.js";

/**
 * ECS service create command for deploying new services
 *
 * Creates a new ECS service with support for networking configuration,
 * load balancers, service discovery, and capacity provider strategies.
 *
 * @public
 */
export default class ECSServiceCreateCommand extends Command {
  static override readonly description = "Create a new ECS service";

  static override readonly examples = [
    {
      description: "Create a simple service",
      command: "<%= config.bin %> <%= command.id %> my-service my-cluster my-task-definition",
    },
    {
      description: "Create a Fargate service with specific count",
      command:
        "<%= config.bin %> <%= command.id %> my-service my-cluster my-task:1 --desired-count 3 --launch-type FARGATE",
    },
    {
      description: "Create service with VPC networking",
      command:
        "<%= config.bin %> <%= command.id %> my-service my-cluster my-task --subnets subnet-1,subnet-2 --security-groups sg-123",
    },
    {
      description: "Create service with load balancer",
      command:
        "<%= config.bin %> <%= command.id %> my-service my-cluster my-task --target-group-arn arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/my-targets/1234567890123456 --container-name web --container-port 80",
    },
    {
      description: "Create service with tags",
      command:
        "<%= config.bin %> <%= command.id %> my-service my-cluster my-task --tags Environment=prod,Team=backend",
    },
  ];

  static override readonly args = {
    serviceName: Args.string({
      name: "serviceName",
      description: "Name of the service to create",
      required: true,
    }),
    clusterName: Args.string({
      name: "clusterName",
      description: "Name of the cluster to create service in",
      required: true,
    }),
    taskDefinition: Args.string({
      name: "taskDefinition",
      description: "Task definition family and revision (e.g., my-task:1)",
      required: true,
    }),
  };

  static override readonly flags = {
    "desired-count": Flags.integer({
      description: "Number of tasks to run",
      default: 1,
      helpValue: "COUNT",
    }),

    "launch-type": Flags.string({
      description: "Launch type for the service",
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

    "target-group-arn": Flags.string({
      description: "Target group ARN for load balancer",
      helpValue: "ARN",
    }),

    "container-name": Flags.string({
      description: "Container name for load balancer",
      helpValue: "NAME",
    }),

    "container-port": Flags.integer({
      description: "Container port for load balancer",
      helpValue: "PORT",
    }),

    "service-registry-arn": Flags.string({
      description: "Service registry ARN for service discovery",
      helpValue: "ARN",
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
   * Execute the ECS service create command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSServiceCreateCommand);

    try {
      const parsedTags = this.parseTags(flags.tags);
      const networkConfiguration = this.buildNetworkConfiguration(flags);
      const loadBalancers = this.buildLoadBalancers(flags);
      const serviceRegistries = this.buildServiceRegistries(flags);

      const input: ECSCreateService = ECSCreateServiceSchema.parse({
        serviceName: args.serviceName,
        clusterName: args.clusterName,
        taskDefinition: args.taskDefinition,
        desiredCount: flags["desired-count"],
        launchType: flags["launch-type"] as "EC2" | "FARGATE" | "EXTERNAL" | undefined,
        networkConfiguration,
        loadBalancers,
        serviceRegistries,
        tags: parsedTags,
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

      const service = await this.createECSService(ecsService, input);

      this.displayCreateResult(service, input, args.clusterName);
    } catch (error) {
      const formattedError = this.formatECSError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Parse tags from comma-separated key=value pairs
   *
   * @param tags - Raw tags string
   * @returns Parsed tags array or undefined
   * @internal
   */
  private parseTags(tags?: string): Array<{ key: string; value: string }> | undefined {
    if (!tags) {
      return undefined;
    }

    return tags.split(",").map((tag) => {
      const [key, value] = tag.split("=");
      if (!key || !value) {
        throw new Error(`Invalid tag format: ${tag}. Use KEY=VALUE format.`);
      }
      return { key: key.trim(), value: value.trim() };
    });
  }

  /**
   * Build network configuration from flags
   *
   * @param flags - Command flags
   * @returns Network configuration or undefined
   * @internal
   */
  private buildNetworkConfiguration(
    flags: Interfaces.InferredFlags<typeof ECSServiceCreateCommand.flags>,
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
   * Build load balancers configuration from flags
   *
   * @param flags - Command flags
   * @returns Load balancers configuration or undefined
   * @internal
   */
  private buildLoadBalancers(
    flags: Interfaces.InferredFlags<typeof ECSServiceCreateCommand.flags>,
  ) {
    if (!flags["target-group-arn"] || !flags["container-name"] || !flags["container-port"]) {
      return;
    }

    return [
      {
        targetGroupArn: flags["target-group-arn"],
        containerName: flags["container-name"],
        containerPort: flags["container-port"],
      },
    ];
  }

  /**
   * Build service registries configuration from flags
   *
   * @param flags - Command flags
   * @returns Service registries configuration or undefined
   * @internal
   */
  private buildServiceRegistries(
    flags: Interfaces.InferredFlags<typeof ECSServiceCreateCommand.flags>,
  ) {
    if (!flags["service-registry-arn"]) {
      return;
    }

    return [
      {
        registryArn: flags["service-registry-arn"],
      },
    ];
  }

  /**
   * Create ECS service with validated input
   *
   * @param ecsService - ECS service instance
   * @param input - Validated input parameters
   * @returns Created service description
   * @internal
   */
  private async createECSService(
    ecsService: ECSService,
    input: ECSCreateService,
  ): Promise<ServiceDescription> {
    return await ecsService.createService(
      {
        serviceName: input.serviceName,
        cluster: input.clusterName,
        taskDefinition: input.taskDefinition,
        desiredCount: input.desiredCount,
        ...(input.launchType && { launchType: input.launchType }),
        ...(input.networkConfiguration && { networkConfiguration: input.networkConfiguration }),
        ...(input.loadBalancers && { loadBalancers: input.loadBalancers }),
        ...(input.serviceRegistries && { serviceRegistries: input.serviceRegistries }),
        ...(input.tags && { tags: input.tags }),
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );
  }

  /**
   * Display service creation result in specified format
   *
   * @param service - Created service description
   * @param input - Validated input parameters
   * @param clusterName - Cluster name for verbose output
   * @internal
   */
  private displayCreateResult(
    service: ServiceDescription,
    input: ECSCreateService,
    clusterName: string,
  ): void {
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

    if (input.verbose) {
      this.displayVerboseInformation(service, clusterName);
    }
  }

  /**
   * Display result in table format
   *
   * @param service - Created service description
   * @internal
   */
  private displayTableResult(service: ServiceDescription): void {
    this.log(`Successfully created ECS service '${service.serviceName}'`);
    this.log(`  ARN: ${service.serviceArn}`);
    this.log(`  Cluster: ${service.clusterArn.split("/").pop() || "Unknown"}`);
    this.log(`  Status: ${service.status}`);
    this.log(`  Task Definition: ${service.taskDefinition}`);
    this.log(`  Desired Count: ${service.desiredCount}`);
    this.log(`  Launch Type: ${service.launchType || "N/A"}`);

    if (service.loadBalancers && service.loadBalancers.length > 0) {
      this.log(`  Load Balancers: ${service.loadBalancers.length} configured`);
    }

    if (service.serviceRegistries && service.serviceRegistries.length > 0) {
      this.log(`  Service Discovery: ${service.serviceRegistries.length} registry configured`);
    }
  }

  /**
   * Display result in JSON format
   *
   * @param service - Created service description
   * @internal
   */
  private displayJsonResult(service: ServiceDescription): void {
    this.log(JSON.stringify(service, undefined, 2));
  }

  /**
   * Display result in JSONL format
   *
   * @param service - Created service description
   * @internal
   */
  private displayJsonLinesResult(service: ServiceDescription): void {
    this.log(JSON.stringify(service));
  }

  /**
   * Display result in CSV format
   *
   * @param service - Created service description
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
      "launchType",
    ];
    this.log(headers.join(","));

    const row = [
      `"${service.serviceName}"`,
      `"${service.serviceArn}"`,
      `"${service.clusterArn}"`,
      `"${service.status}"`,
      `"${service.taskDefinition}"`,
      String(service.desiredCount),
      `"${service.launchType || "N/A"}"`,
    ];
    this.log(row.join(","));
  }

  /**
   * Display verbose information about service creation
   *
   * @param service - Created service description
   * @param clusterName - Cluster name
   * @internal
   */
  private displayVerboseInformation(service: ServiceDescription, clusterName: string): void {
    this.log(`\nService creation initiated. Monitor service status with:`);
    this.log(`  aws-ts ecs service describe ${service.serviceName} --cluster ${clusterName}`);
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

    let formattedMessage = `Failed to create ECS service: ${errorMessage}`;

    if (guidance) {
      formattedMessage += `\n\nGuidance: ${guidance}`;
    }

    if (verbose && error instanceof Error && error.stack) {
      formattedMessage += `\n\nStack trace:\n${error.stack}`;
    }

    return formattedMessage;
  }
}
