/**
 * @module ecs/service/list
 * ECS service list command
 *
 * Lists ECS services in a cluster with filtering options
 * and multiple output formats for service discovery.
 *
 */

import { Flags } from "@oclif/core";
import { formatECSError } from "../../../lib/ecs-errors.js";
import type { ECSListServices } from "../../../lib/ecs-schemas.js";
import { ECSListServicesSchema } from "../../../lib/ecs-schemas.js";
import { ECSService, type ServiceDescription } from "../../../services/ecs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * ECS service list command for discovering services
 *
 * Lists ECS services within a cluster with optional filtering
 * by launch type and scheduling strategy.
 *
 * @public
 */
export default class ECSServiceListCommand extends BaseCommand {
  static override readonly description = "List ECS services in a cluster";

  static override readonly examples = [
    {
      description: "List all services in default cluster",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "List services in a specific cluster",
      command: "<%= config.bin %> <%= command.id %> --cluster my-cluster",
    },
    {
      description: "List only Fargate services",
      command: "<%= config.bin %> <%= command.id %> --cluster my-cluster --launch-type FARGATE",
    },
    {
      description: "List services with table output format",
      command: "<%= config.bin %> <%= command.id %> --cluster my-cluster --format table",
    },
    {
      description: "List services in a specific region",
      command: "<%= config.bin %> <%= command.id %> --cluster my-cluster --region us-west-2",
    },
    {
      description: "List services with verbose debug information",
      command: "<%= config.bin %> <%= command.id %> --cluster my-cluster --verbose",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    cluster: Flags.string({
      char: "c",
      description: "Name of the cluster to list services from",
      helpValue: "CLUSTER_NAME",
    }),

    "launch-type": Flags.string({
      description: "Filter services by launch type",
      options: ["EC2", "FARGATE", "EXTERNAL"],
      helpValue: "TYPE",
    }),

    "scheduling-strategy": Flags.string({
      description: "Filter services by scheduling strategy",
      options: ["REPLICA", "DAEMON"],
      helpValue: "STRATEGY",
    }),

    "max-items": Flags.integer({
      description: "Maximum number of services to list",
      helpValue: "NUMBER",
    }),
  };

  /**
   * Execute the ECS service list command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(ECSServiceListCommand);

    try {
      const input: ECSListServices = ECSListServicesSchema.parse({
        clusterName: flags.cluster,
        launchType: flags["launch-type"] as "EC2" | "FARGATE" | "EXTERNAL" | undefined,
        schedulingStrategy: flags["scheduling-strategy"] as "REPLICA" | "DAEMON" | undefined,
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

      const serviceArns = await this.listServiceArns(ecsService, input);

      if (serviceArns.length === 0) {
        this.displayNoServicesFound(input.clusterName);
        return;
      }

      const services = await this.getServiceDetails(ecsService, serviceArns, input);

      this.displayServicesResult(services, input);

      if (input.verbose) {
        this.displayVerboseInformation(services, input.clusterName);
      }
    } catch (error) {
      const formattedError = formatECSError(error, "list ECS services", flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * List service ARNs based on filtering criteria
   *
   * @param ecsService - ECS service instance
   * @param input - Validated input parameters
   * @returns Array of service ARNs
   * @internal
   */
  private async listServiceArns(ecsService: ECSService, input: ECSListServices): Promise<string[]> {
    return await ecsService.listServices(
      {
        ...(input.clusterName && { cluster: input.clusterName }),
        ...(input.launchType && { launchType: input.launchType }),
        ...(input.schedulingStrategy && { schedulingStrategy: input.schedulingStrategy }),
        ...(input.maxItems && { maxResults: input.maxItems }),
      },
      {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      },
    );
  }

  /**
   * Display message when no services are found
   *
   * @param clusterName - Cluster name for message context
   * @internal
   */
  private displayNoServicesFound(clusterName?: string): void {
    const clusterInfo = clusterName ? ` in cluster '${clusterName}'` : "";
    this.log(`No services found${clusterInfo}.`);
  }

  /**
   * Get detailed service information
   *
   * @param ecsService - ECS service instance
   * @param serviceArns - Service ARNs to describe
   * @param input - Validated input parameters
   * @returns Array of service descriptions
   * @internal
   */
  private async getServiceDetails(
    ecsService: ECSService,
    serviceArns: string[],
    input: ECSListServices,
  ): Promise<ServiceDescription[]> {
    return await ecsService.describeServices(
      serviceArns,
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
   * Display services result in specified format
   *
   * @param services - Services to display
   * @param input - Validated input parameters
   * @internal
   */
  private displayServicesResult(services: ServiceDescription[], input: ECSListServices): void {
    switch (input.format) {
      case "table": {
        this.displayTableResult(services);
        break;
      }
      case "json": {
        this.displayJsonResult(services);
        break;
      }
      case "jsonl": {
        this.displayJsonLinesResult(services);
        break;
      }
      case "csv": {
        this.displayCsvResult(services);
        break;
      }
    }
  }

  /**
   * Display result in table format
   *
   * @param services - Services to display
   * @internal
   */
  private displayTableResult(services: ServiceDescription[]): void {
    const serviceText = services.length === 1 ? "" : "s";
    this.log(`Found ${services.length} service${serviceText}:\n`);

    const tableData = services.map((service) => ({
      "Service Name": service.serviceName,
      Cluster: service.clusterArn.split("/").pop() || "Unknown",
      Status: service.status,
      "Desired Count": service.desiredCount,
      "Running Count": service.runningCount,
      "Launch Type": service.launchType || "N/A",
    }));

    console.table(tableData);
  }

  /**
   * Display result in JSON format
   *
   * @param services - Services to display
   * @internal
   */
  private displayJsonResult(services: ServiceDescription[]): void {
    this.log(JSON.stringify(services, undefined, 2));
  }

  /**
   * Display result in JSONL format
   *
   * @param services - Services to display
   * @internal
   */
  private displayJsonLinesResult(services: ServiceDescription[]): void {
    for (const service of services) {
      this.log(JSON.stringify(service));
    }
  }

  /**
   * Display result in CSV format
   *
   * @param services - Services to display
   * @internal
   */
  private displayCsvResult(services: ServiceDescription[]): void {
    const headers = [
      "serviceName",
      "clusterArn",
      "status",
      "desiredCount",
      "runningCount",
      "launchType",
    ];
    this.log(headers.join(","));

    for (const service of services) {
      const row = [
        `"${service.serviceName}"`,
        `"${service.clusterArn}"`,
        `"${service.status}"`,
        String(service.desiredCount),
        String(service.runningCount),
        `"${service.launchType || "N/A"}"`,
      ];
      this.log(row.join(","));
    }
  }

  /**
   * Display verbose information about the services
   *
   * @param services - Services information
   * @param clusterName - Cluster name
   * @internal
   */
  private displayVerboseInformation(services: ServiceDescription[], clusterName?: string): void {
    this.log(`\nTotal services: ${services.length}`);
    const clusterInfo = clusterName || "default";
    this.log(`Cluster: ${clusterInfo}`);
  }
}
