/**
 * @module list
 * ECS cluster list command
 *
 * Lists all ECS clusters in the specified region with support for
 * multiple output formats and error handling.
 *
 */

import { Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../../lib/data-processing.js";
import { formatECSError } from "../../../lib/ecs-errors.js";
import type { ECSListClusters } from "../../../lib/ecs-schemas.js";
import { ECSListClustersSchema } from "../../../lib/ecs-schemas.js";
import { ECSService } from "../../../services/ecs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * ECS cluster list command for discovering available clusters
 *
 * Provides a list of all ECS clusters in the specified region
 * with support for multiple output formats and region/profile selection.
 *
 * @public
 */
export default class ECSClusterListCommand extends BaseCommand {
  static override readonly description = "List all ECS clusters in the region";

  static override readonly examples = [
    {
      description: "List all clusters in the current region",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "List clusters with JSON output format",
      command: "<%= config.bin %> <%= command.id %> --format json",
    },
    {
      description: "List clusters in a specific region",
      command: "<%= config.bin %> <%= command.id %> --region us-west-2",
    },
    {
      description: "List clusters using a specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> --profile production",
    },
    {
      description: "List clusters with CSV output format for spreadsheet import",
      command: "<%= config.bin %> <%= command.id %> --format csv",
    },
    {
      description: "List first 20 clusters with pagination",
      command: "<%= config.bin %> <%= command.id %> --max-items 20",
    },
    {
      description: "Verbose cluster listing with debug information",
      command: "<%= config.bin %> <%= command.id %> --verbose",
    },
  ];

  static override readonly flags = {
    region: Flags.string({
      char: "r",
      description: "AWS region to list clusters from",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for cluster list",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    "max-items": Flags.integer({
      description: "Maximum number of clusters to return",
      helpValue: "COUNT",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the ECS cluster list command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(ECSClusterListCommand);

    try {
      // Validate input using Zod schema
      const input: ECSListClusters = ECSListClustersSchema.parse({
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        maxItems: flags["max-items"],
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

      // List clusters from ECS
      const clusterNames = await ecsService.listClusters({
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      });

      // Apply max-items limit if specified
      const limitedClusters = input.maxItems ? clusterNames.slice(0, input.maxItems) : clusterNames;

      // Format output based on requested format
      this.formatAndDisplayOutput(limitedClusters, input.format);
    } catch (error) {
      const formattedError = formatECSError(error, "list ECS clusters", flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the cluster list output
   *
   * @param clusterNames - Array of cluster names to display
   * @param format - Output format to use
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(clusterNames: string[], format: string): void {
    if (clusterNames.length === 0) {
      this.log("No ECS clusters found in the specified region.");
      return;
    }

    switch (format) {
      case "table": {
        this.log(`Found ${clusterNames.length} ECS clusters:\n`);
        const tableData = clusterNames.map((name, index) => ({
          "#": index + 1,
          "Cluster Name": name,
        }));

        // Use DataProcessor for consistent table formatting
        const processor = new DataProcessor({ format: DataFormat.CSV });
        const output = processor.formatOutput(
          tableData.map((item, index) => ({ data: item, index })),
        );
        this.log(output);
        break;
      }

      case "json": {
        const output = {
          clusters: clusterNames,
          count: clusterNames.length,
        };
        this.log(JSON.stringify(output, undefined, 2));
        break;
      }

      case "jsonl": {
        for (const clusterName of clusterNames) {
          this.log(JSON.stringify({ clusterName }));
        }
        break;
      }

      case "csv": {
        // Create CSV data with headers
        const csvData = [
          { "Cluster Name": "Cluster Name" }, // Header row
          ...clusterNames.map((name) => ({ "Cluster Name": name })),
        ];

        const processor = new DataProcessor({ format: DataFormat.CSV });
        const output = processor.formatOutput(
          csvData.map((item, index) => ({ data: item, index })),
        );
        this.log(output);
        break;
      }

      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }
}
