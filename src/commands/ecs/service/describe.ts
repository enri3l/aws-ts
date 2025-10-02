/**
 * @module ecs/service/describe
 * ECS service describe command
 *
 * Describes ECS services with detailed configuration, status,
 * and deployment information for troubleshooting and monitoring.
 *
 */

import { Args, Flags } from "@oclif/core";
import { formatECSError } from "../../../lib/ecs-errors.js";
import type { ECSDescribeServices } from "../../../lib/ecs-schemas.js";
import { ECSDescribeServicesSchema } from "../../../lib/ecs-schemas.js";
import { ECSService, type ServiceDescription } from "../../../services/ecs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * ECS service describe command for detailed service information
 *
 * Describes ECS services with information including
 * configuration, deployments, events, and status details.
 *
 * @public
 */
export default class ECSServiceDescribeCommand extends BaseCommand {
  static override readonly description = "Describe ECS services in detail";

  static override readonly examples = [
    {
      description: "Describe a service in the default cluster",
      command: "<%= config.bin %> <%= command.id %> my-service",
    },
    {
      description: "Describe multiple services",
      command: "<%= config.bin %> <%= command.id %> service1,service2",
    },
    {
      description: "Describe a service in a specific cluster",
      command: "<%= config.bin %> <%= command.id %> my-service --cluster my-cluster",
    },
    {
      description: "Describe services with tags included",
      command: "<%= config.bin %> <%= command.id %> my-service --include TAGS",
    },
    {
      description: "Describe service with JSON output",
      command: "<%= config.bin %> <%= command.id %> my-service --format json",
    },
    {
      description: "Describe service in a specific region",
      command: "<%= config.bin %> <%= command.id %> my-service --region us-west-2",
    },
  ];

  static override readonly args = {
    serviceNames: Args.string({
      name: "serviceNames",
      description: "Comma-separated list of service names to describe",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    cluster: Flags.string({
      char: "c",
      description: "Name of the cluster containing the services",
      helpValue: "CLUSTER_NAME",
    }),

    include: Flags.string({
      description: "Additional information to include",
      options: ["TAGS"],
      helpValue: "INFO_TYPE",
    }),
  };

  /**
   * Execute the ECS service describe command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSServiceDescribeCommand);

    try {
      // Parse service names from comma-separated string
      const serviceNames = args.serviceNames.split(",").map((name) => name.trim());

      // Validate input using Zod schema
      const input: ECSDescribeServices = ECSDescribeServicesSchema.parse({
        serviceNames,
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

      // Describe services
      const services = await ecsService.describeServices(
        input.serviceNames,
        {
          ...(input.clusterName && { cluster: input.clusterName }),
          ...(input.include && { include: input.include }),
        },
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      if (services.length === 0) {
        this.log("No services found with the specified names.");
        return;
      }

      // Format and display output
      this.formatAndDisplayEcsOutput(input, services);

      if (input.verbose) {
        this.log(`\nDescribed ${services.length} service${services.length === 1 ? "" : "s"}`);
      }
    } catch (error) {
      const formattedError = formatECSError(error, "describe ECS services", flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Display services output in the specified format
   *
   * @param input - Validated input parameters
   * @param services - Services to display
   * @internal
   */
  private formatAndDisplayEcsOutput(
    input: ECSDescribeServices,
    services: ServiceDescription[],
  ): void {
    switch (input.format) {
      case "table": {
        this.displayServicesAsTable(services);
        break;
      }
      case "json": {
        this.displayServicesAsJson(services);
        break;
      }
      case "jsonl": {
        this.displayServicesAsJsonLines(services);
        break;
      }
      case "csv": {
        this.displayServicesAsCsv(services);
        break;
      }
    }
  }

  /**
   * Display services in table format
   *
   * @param services - Services to display
   * @internal
   */
  private displayServicesAsTable(services: ServiceDescription[]): void {
    for (const [index, service] of services.entries()) {
      if (index > 0) this.log("\n" + "=".repeat(80) + "\n");

      this.displayServiceBasicInfo(service);
      this.displayServiceLoadBalancers(service);
      this.displayServiceDiscovery(service);
      this.displayServiceDeployments(service);
    }
  }

  /**
   * Display basic service information
   *
   * @param service - Service to display
   * @internal
   */
  private displayServiceBasicInfo(service: ServiceDescription): void {
    this.log(`Service: ${service.serviceName}`);
    this.log(`Cluster: ${service.clusterArn?.split("/").pop() || "Unknown"}`);
    this.log(`Status: ${service.status}`);
    this.log(`Task Definition: ${service.taskDefinition}`);
    this.log(`Desired Count: ${service.desiredCount}`);
    this.log(`Running Count: ${service.runningCount}`);
    this.log(`Pending Count: ${service.pendingCount}`);
    this.log(`Launch Type: ${service.launchType || "N/A"}`);
  }

  /**
   * Display service load balancer information
   *
   * @param service - Service to display
   * @internal
   */
  private displayServiceLoadBalancers(service: ServiceDescription): void {
    if (service.loadBalancers && service.loadBalancers.length > 0) {
      this.log("\nLoad Balancers:");
      for (const lb of service.loadBalancers) {
        this.log(`  - Target Group: ${lb.targetGroupArn || "N/A"}`);
        this.log(`    Container: ${lb.containerName}:${lb.containerPort}`);
      }
    }
  }

  /**
   * Display service discovery information
   *
   * @param service - Service to display
   * @internal
   */
  private displayServiceDiscovery(service: ServiceDescription): void {
    if (service.serviceRegistries && service.serviceRegistries.length > 0) {
      this.log("\nService Discovery:");
      for (const sr of service.serviceRegistries) {
        this.log(`  - Registry: ${sr.registryArn}`);
        if (sr.containerName) {
          this.log(`    Container: ${sr.containerName}:${sr.containerPort || "N/A"}`);
        }
      }
    }
  }

  /**
   * Display service deployment information
   *
   * @param service - Service to display
   * @internal
   */
  private displayServiceDeployments(service: ServiceDescription): void {
    if (service.deployments && service.deployments.length > 0) {
      this.log("\nDeployments:");
      for (const deployment of service.deployments) {
        this.log(`  - Status: ${deployment.status}`);
        this.log(`    Task Definition: ${deployment.taskDefinition}`);
        this.log(`    Desired: ${deployment.desiredCount}, Running: ${deployment.runningCount}`);
        this.log(`    Created: ${deployment.createdAt?.toISOString() ?? "N/A"}`);
      }
    }
  }

  /**
   * Display services in JSON format
   *
   * @param services - Services to display
   * @internal
   */
  private displayServicesAsJson(services: ServiceDescription[]): void {
    this.log(JSON.stringify(services, undefined, 2));
  }

  /**
   * Display services in JSONL format
   *
   * @param services - Services to display
   * @internal
   */
  private displayServicesAsJsonLines(services: ServiceDescription[]): void {
    for (const service of services) {
      this.log(JSON.stringify(service));
    }
  }

  /**
   * Escape CSV values according to RFC 4180
   * Handles quotes, commas, and newlines
   *
   * @param value - The value to escape
   * @returns Escaped CSV value
   * @internal
   */
  private escapeCsvValue(value: string | number | undefined): string {
    const stringValue = String(value ?? "");
    if (/[",\n\r]/.test(stringValue)) {
      return `"${stringValue.replaceAll('"', '""')}"`;
    }
    return stringValue;
  }

  /**
   * Display services in CSV format
   *
   * @param services - Services to display
   * @internal
   */
  private displayServicesAsCsv(services: ServiceDescription[]): void {
    // CSV header
    const headers = [
      "serviceName",
      "clusterArn",
      "status",
      "taskDefinition",
      "desiredCount",
      "runningCount",
      "pendingCount",
      "launchType",
    ];
    this.log(headers.join(","));

    // CSV rows with proper escaping
    for (const service of services) {
      const row = [
        this.escapeCsvValue(service.serviceName),
        this.escapeCsvValue(service.clusterArn),
        this.escapeCsvValue(service.status),
        this.escapeCsvValue(service.taskDefinition),
        this.escapeCsvValue(service.desiredCount),
        this.escapeCsvValue(service.runningCount),
        this.escapeCsvValue(service.pendingCount),
        this.escapeCsvValue(service.launchType || "N/A"),
      ];
      this.log(row.join(","));
    }
  }
}
