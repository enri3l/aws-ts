/**
 * @module ecs/cluster/describe
 * ECS cluster describe command
 *
 * Describes ECS clusters with detailed configuration information including
 * capacity providers, settings, statistics, and resource counts.
 *
 */

import { Args, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../../lib/data-processing.js";
import { formatECSError } from "../../../lib/ecs-errors.js";
import type { ECSDescribeClusters } from "../../../lib/ecs-schemas.js";
import { ECSDescribeClustersSchema } from "../../../lib/ecs-schemas.js";
import type { ClusterDescription } from "../../../services/ecs-service.js";
import { ECSService } from "../../../services/ecs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * Extended cluster description with index signature for data processing
 *
 * @internal
 */
interface ExtendedClusterDescription extends ClusterDescription {
  /**
   * Index signature for data processing compatibility
   */
  [key: string]: unknown;
}

/**
 * ECS cluster describe command for detailed cluster inspection
 *
 * Provides detailed configuration and status information for specified ECS clusters
 * with support for multiple output formats and metadata inclusion.
 *
 * @public
 */
export default class ECSClusterDescribeCommand extends BaseCommand {
  static override readonly description =
    "Describe ECS clusters with detailed configuration information";

  static override readonly examples = [
    {
      description: "Describe a single cluster",
      command: "<%= config.bin %> <%= command.id %> my-cluster",
    },
    {
      description: "Describe multiple clusters",
      command: "<%= config.bin %> <%= command.id %> cluster1 cluster2 cluster3",
    },
    {
      description: "Describe clusters with JSON output format",
      command: "<%= config.bin %> <%= command.id %> my-cluster --format json",
    },
    {
      description: "Describe clusters in a specific region",
      command: "<%= config.bin %> <%= command.id %> my-cluster --region us-west-2",
    },
    {
      description: "Describe clusters using a specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> my-cluster --profile production",
    },
    {
      description: "Describe clusters with verbose debug information",
      command: "<%= config.bin %> <%= command.id %> my-cluster --verbose",
    },
  ];

  static override readonly args = {
    clusterNames: Args.string({
      name: "clusterNames",
      description: "Names of clusters to describe (space-separated)",
      required: true,
    }),
  };

  static override readonly flags = {
    region: Flags.string({
      char: "r",
      description: "AWS region to describe clusters in",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for cluster description",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the ECS cluster describe command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ECSClusterDescribeCommand);

    try {
      // Parse cluster names from arguments
      const clusterNames = args.clusterNames.split(/\s+/).filter((name: string) => name.trim());

      // Validate input using Zod schema
      const input: ECSDescribeClusters = ECSDescribeClustersSchema.parse({
        clusterNames,
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
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

      // Describe clusters from ECS
      const clusters = await ecsService.describeClusters(input.clusterNames, {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      });

      // Format output based on requested format
      this.formatAndDisplayOutput(clusters, input.format);
    } catch (error) {
      const formattedError = formatECSError(error, "describe ECS clusters", flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the cluster description output
   *
   * @param clusters - Array of cluster descriptions to display
   * @param format - Output format to use
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(clusters: ClusterDescription[], format: string): void {
    if (clusters.length === 0) {
      this.log("No cluster descriptions found.");
      return;
    }

    switch (format) {
      case "table": {
        this.displayClustersAsTable(clusters);
        break;
      }
      case "json": {
        this.displayClustersAsJson(clusters);
        break;
      }
      case "jsonl": {
        this.displayClustersAsJsonLines(clusters);
        break;
      }
      case "csv": {
        this.displayClustersAsCsv(clusters);
        break;
      }
      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }

  /**
   * Display clusters in table format
   *
   * @param clusters - Clusters to display
   * @internal
   */
  private displayClustersAsTable(clusters: ClusterDescription[]): void {
    this.log(`Found ${clusters.length} ECS cluster descriptions:\n`);

    for (const cluster of clusters) {
      this.displayClusterBasicInfo(cluster);
      this.displayClusterCapacityProviders(cluster);
      this.displayClusterSettings(cluster);
      this.displayClusterTags(cluster);
      this.log(""); // Empty line between clusters
    }
  }

  /**
   * Display basic cluster information
   *
   * @param cluster - Cluster to display
   * @internal
   */
  private displayClusterBasicInfo(cluster: ClusterDescription): void {
    this.log(`Cluster: ${cluster.clusterName}`);
    this.log(`  ARN: ${cluster.clusterArn}`);
    this.log(`  Status: ${cluster.status}`);
    this.log(`  Running Tasks: ${cluster.runningTasksCount}`);
    this.log(`  Pending Tasks: ${cluster.pendingTasksCount}`);
    this.log(`  Active Services: ${cluster.activeServicesCount}`);
    this.log(`  Container Instances: ${cluster.registeredContainerInstancesCount}`);
  }

  /**
   * Display cluster capacity provider information
   *
   * @param cluster - Cluster to display
   * @internal
   */
  private displayClusterCapacityProviders(cluster: ClusterDescription): void {
    if (cluster.capacityProviders && cluster.capacityProviders.length > 0) {
      this.log(`  Capacity Providers: ${cluster.capacityProviders.join(", ")}`);
    }

    if (
      cluster.defaultCapacityProviderStrategy &&
      cluster.defaultCapacityProviderStrategy.length > 0
    ) {
      this.log("  Default Capacity Provider Strategy:");
      for (const strategy of cluster.defaultCapacityProviderStrategy) {
        this.log(`    - Provider: ${strategy.capacityProvider}`);
        if (strategy.weight !== undefined) this.log(`      Weight: ${strategy.weight}`);
        if (strategy.base !== undefined) this.log(`      Base: ${strategy.base}`);
      }
    }
  }

  /**
   * Display cluster settings
   *
   * @param cluster - Cluster to display
   * @internal
   */
  private displayClusterSettings(cluster: ClusterDescription): void {
    if (cluster.settings && cluster.settings.length > 0) {
      this.log("  Settings:");
      for (const setting of cluster.settings) {
        this.log(`    ${setting.name}: ${setting.value}`);
      }
    }
  }

  /**
   * Display cluster tags
   *
   * @param cluster - Cluster to display
   * @internal
   */
  private displayClusterTags(cluster: ClusterDescription): void {
    if (cluster.tags && cluster.tags.length > 0) {
      this.log("  Tags:");
      for (const tag of cluster.tags) {
        this.log(`    ${tag.key}: ${tag.value}`);
      }
    }
  }

  /**
   * Display clusters in JSON format
   *
   * @param clusters - Clusters to display
   * @internal
   */
  private displayClustersAsJson(clusters: ClusterDescription[]): void {
    const output = {
      clusters,
      count: clusters.length,
    };
    this.log(JSON.stringify(output, undefined, 2));
  }

  /**
   * Display clusters in JSONL format
   *
   * @param clusters - Clusters to display
   * @internal
   */
  private displayClustersAsJsonLines(clusters: ClusterDescription[]): void {
    for (const cluster of clusters) {
      this.log(JSON.stringify(cluster));
    }
  }

  /**
   * Display clusters in CSV format
   *
   * @param clusters - Clusters to display
   * @internal
   */
  private displayClustersAsCsv(clusters: ClusterDescription[]): void {
    // Flatten cluster data for CSV format
    const csvData = clusters.map((cluster) => ({
      "Cluster Name": cluster.clusterName,
      ARN: cluster.clusterArn,
      Status: cluster.status,
      "Running Tasks": cluster.runningTasksCount,
      "Pending Tasks": cluster.pendingTasksCount,
      "Active Services": cluster.activeServicesCount,
      "Container Instances": cluster.registeredContainerInstancesCount,
      "Capacity Providers": cluster.capacityProviders?.join(";") || "",
    }));

    const processor = new DataProcessor({ format: DataFormat.CSV });
    const output = processor.formatOutput(
      csvData.map((item, index) => ({
        data: item as unknown as ExtendedClusterDescription,
        index,
      })),
    );
    this.log(output);
  }
}
