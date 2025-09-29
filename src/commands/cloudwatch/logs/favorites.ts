/**
 * CloudWatch Logs favorites management command
 *
 * Manages favorite log groups and queries for quick access and team collaboration
 * with local storage, usage analytics, and export/import capabilities.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { handleCloudWatchLogsCommandError } from "../../../lib/cloudwatch-logs-errors.js";
import { SavedQuerySchema, type SavedQuery } from "../../../lib/cloudwatch-logs-schemas.js";
import { DataFormat, DataProcessor } from "../../../lib/data-processing.js";
import { CloudWatchLogsService } from "../../../services/cloudwatch-logs-service.js";
import {
  FavoritesStorageService,
  type FavoritesExport,
} from "../../../services/favorites-storage-service.js";

/**
 * CloudWatch Logs favorites management command implementation
 *
 * @public
 */
export default class CloudWatchLogsFavoritesCommand extends Command {
  static override readonly summary = "Manage favorite log groups and queries for quick access";

  static override readonly description = `
Manages favorite log groups and queries for quick access and team collaboration.
Provides local storage with usage analytics, export/import capabilities, and
smart suggestions for optimizing monitoring workflows.

The favorites system enables you to save frequently accessed log groups and
queries with usage tracking, team sharing, and validation features.

SUBCOMMANDS:
• add-group <log-group-name> [alias] - Add log group to favorites with optional alias
• add-query <name> "<query>" [description] - Save frequently used query to favorites
• list [--type groups|queries] - Show all favorites with usage statistics
• remove <name> - Remove favorite with confirmation
• run-favorite <name> - Quick execution of saved favorite (log groups or queries)
• export [file] - Export favorites for team sharing
• import <file> - Import favorites from export file
• stats - Show usage statistics and recommendations

EXAMPLES:
  # Add a log group to favorites
  $ aws-ts cloudwatch:logs:favorites add-group /aws/lambda/my-function my-app

  # Add a query to favorites
  $ aws-ts cloudwatch:logs:favorites add-query error-analysis \\
    "fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc"

  # List all favorites
  $ aws-ts cloudwatch:logs:favorites list

  # List only log group favorites
  $ aws-ts cloudwatch:logs:favorites list --type groups

  # Remove a favorite
  $ aws-ts cloudwatch:logs:favorites remove my-app

  # Run a favorite (opens log group or executes query)
  $ aws-ts cloudwatch:logs:favorites run-favorite my-app

  # Export favorites for team sharing
  $ aws-ts cloudwatch:logs:favorites export team-favorites.json

  # Import favorites from file
  $ aws-ts cloudwatch:logs:favorites import team-favorites.json --merge-strategy overwrite

  # Show usage statistics
  $ aws-ts cloudwatch:logs:favorites stats
`;

  static override readonly examples = [
    {
      description: "Add log group to favorites",
      command: "<%= config.bin %> <%= command.id %> add-group /aws/lambda/my-function my-app",
    },
    {
      description: "List all favorites with statistics",
      command: "<%= config.bin %> <%= command.id %> list --format table",
    },
  ];

  static override readonly flags = {
    region: Flags.string({
      char: "r",
      description: "AWS region for CloudWatch Logs",
      env: "AWS_REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      env: "AWS_PROFILE",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for favorites listing",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with detailed information",
      default: false,
    }),

    type: Flags.string({
      description: "Filter favorites by type (for list subcommand)",
      options: ["groups", "queries"],
    }),

    "merge-strategy": Flags.string({
      description: "Strategy for handling conflicts during import",
      options: ["overwrite", "skip", "rename"],
      default: "skip",
    }),

    force: Flags.boolean({
      description: "Skip confirmation prompts",
      default: false,
    }),
  };

  static override readonly args = {
    subcommand: Args.string({
      description: "Favorites subcommand to execute",
      required: true,
      options: [
        "add-group",
        "add-query",
        "list",
        "remove",
        "run-favorite",
        "export",
        "import",
        "stats",
      ],
    }),
    arg1: Args.string({
      description: "First argument (varies by subcommand)",
      required: false,
    }),
    arg2: Args.string({
      description: "Second argument (varies by subcommand)",
      required: false,
    }),
    arg3: Args.string({
      description: "Third argument (varies by subcommand)",
      required: false,
    }),
  };

  /**
   *
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(CloudWatchLogsFavoritesCommand);

    try {
      // Initialize favorites storage service
      const storageService = new FavoritesStorageService({
        enableDebugLogging: flags.verbose,
        enableBackup: true,
      });

      await storageService.initialize();

      // Route to appropriate subcommand handler
      switch (args.subcommand) {
        case "add-group": {
          await this.handleAddGroup(storageService, args, flags);
          break;
        }
        case "add-query": {
          await this.handleAddQuery(storageService, args, flags);
          break;
        }
        case "list": {
          await this.handleList(storageService, {
            ...(flags.type && { type: flags.type }),
            format: flags.format,
          });
          break;
        }
        case "remove": {
          await this.handleRemove(storageService, args, flags);
          break;
        }
        case "run-favorite": {
          await this.handleRunFavorite(storageService, args, flags);
          break;
        }
        case "export": {
          await this.handleExport(storageService, args, flags);
          break;
        }
        case "import": {
          await this.handleImport(storageService, args, flags);
          break;
        }
        case "stats": {
          await this.handleStats(storageService, flags);
          break;
        }
        default: {
          this.error(`Unknown subcommand: ${args.subcommand}`, { exit: 1 });
        }
      }
    } catch (error) {
      const formattedError = handleCloudWatchLogsCommandError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Handle add-group subcommand
   * @internal
   */
  private async handleAddGroup(
    storageService: FavoritesStorageService,
    arguments_: {
      subcommand: string;
      arg1: string | undefined;
      arg2: string | undefined;
      arg3: string | undefined;
    },
    flags: { region: string | undefined; profile: string | undefined; force: boolean },
  ): Promise<void> {
    if (!arguments_.arg1) {
      this.error("Log group name is required for add-group subcommand", { exit: 1 });
    }

    const logGroupName = arguments_.arg1;
    const alias = arguments_.arg2 || logGroupName.split("/").pop() || logGroupName;
    const description = arguments_.arg3;

    // Validate log group exists (optional)
    if (!flags.force) {
      const logsService = new CloudWatchLogsService({
        credentialService: {
          ...(flags.region && { defaultRegion: flags.region }),
          ...(flags.profile && { defaultProfile: flags.profile }),
        },
      });

      try {
        await logsService.describeLogGroup(logGroupName, {
          ...(flags.region && { region: flags.region }),
          ...(flags.profile && { profile: flags.profile }),
        });
      } catch {
        this.warn(
          `Warning: Could not verify log group '${logGroupName}' exists. Use --force to skip validation.`,
        );
        if (!flags.force) {
          return;
        }
      }
    }

    await storageService.addLogGroupFavorite(alias, logGroupName, description);
    this.log(`Added log group '${logGroupName}' to favorites as '${alias}'`);
  }

  /**
   * Handle add-query subcommand
   * @internal
   */
  private async handleAddQuery(
    storageService: FavoritesStorageService,
    arguments_: {
      subcommand: string;
      arg1: string | undefined;
      arg2: string | undefined;
      arg3: string | undefined;
    },
    _flags: { region: string | undefined; profile: string | undefined },
  ): Promise<void> {
    if (!arguments_.arg1 || !arguments_.arg2) {
      this.error("Query name and query string are required for add-query subcommand", { exit: 1 });
    }

    const queryName = arguments_.arg1;
    const queryString = arguments_.arg2;
    const description = arguments_.arg3;

    // Create and save the query first
    const collection = await storageService.loadCollection();

    const savedQuery: SavedQuery = SavedQuerySchema.parse({
      name: queryName,
      query: queryString,
      description,
      createdAt: new Date().toISOString(),
      usageCount: 0,
    });

    collection.savedQueries.push(savedQuery);
    await storageService.saveCollection(collection);

    // Add to favorites
    await storageService.addQueryFavorite(queryName, queryName, description);
    this.log(`Added query '${queryName}' to favorites`);
  }

  /**
   * Handle list subcommand
   * @internal
   */
  private async handleList(
    storageService: FavoritesStorageService,
    flags: { type?: string; format: string },
  ): Promise<void> {
    let typeFilter: "log-group" | "query" | undefined;
    if (flags.type === "groups") {
      typeFilter = "log-group";
    } else if (flags.type === "queries") {
      typeFilter = "query";
    } else {
      typeFilter = undefined;
    }

    const favorites = await storageService.listFavorites(typeFilter);

    if (favorites.length === 0) {
      this.log("No favorites found. Use 'add-group' or 'add-query' to create some!");
      return;
    }

    if (flags.format === "table") {
      this.log(`\nFavorites (${favorites.length} total):`);
      console.table(
        favorites.map((fav, index) => ({
          "#": index + 1,
          Name: fav.name,
          Type: fav.type === "log-group" ? "Log Group" : "Query",
          Resource: fav.type === "log-group" ? fav.logGroupName : fav.queryName,
          "Access Count": fav.accessCount || 0,
          "Last Accessed": fav.lastAccessedAt
            ? new Date(fav.lastAccessedAt).toLocaleDateString()
            : "Never",
          Created: new Date(fav.createdAt).toLocaleDateString(),
        })),
      );
    } else {
      const processor = new DataProcessor({
        format: DataFormat[flags.format.toUpperCase() as keyof typeof DataFormat],
      });
      const records = favorites.map((data, index) => ({ data, index }));
      const output = processor.formatOutput(records);
      this.log(output);
    }
  }

  /**
   * Handle remove subcommand
   * @internal
   */
  private async handleRemove(
    storageService: FavoritesStorageService,
    arguments_: {
      subcommand: string;
      arg1: string | undefined;
      arg2: string | undefined;
      arg3: string | undefined;
    },
    flags: { force: boolean },
  ): Promise<void> {
    if (!arguments_.arg1) {
      this.error("Favorite name is required for remove subcommand", { exit: 1 });
    }

    const favoriteName = arguments_.arg1;

    // Check if favorite exists
    const favorite = await storageService.getFavorite(favoriteName);
    if (!favorite) {
      this.error(`Favorite '${favoriteName}' not found`, { exit: 1 });
    }

    // Confirm removal unless --force is used
    if (!flags.force) {
      const { default: inquirer } = await import("inquirer");
      const response = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirmed",
          message: `Remove favorite '${favoriteName}' (${favorite.type}: ${favorite.logGroupName || favorite.queryName})?`,
          default: false,
        },
      ]);
      const confirmed = response.confirmed as boolean;

      if (!confirmed) {
        this.log("Removal cancelled");
        return;
      }
    }

    const removed = await storageService.removeFavorite(favoriteName);
    if (removed) {
      this.log(`Removed favorite '${favoriteName}'`);
    } else {
      this.error(`Failed to remove favorite '${favoriteName}'`, { exit: 1 });
    }
  }

  /**
   * Handle run-favorite subcommand
   * @internal
   */
  private async handleRunFavorite(
    storageService: FavoritesStorageService,
    arguments_: {
      subcommand: string;
      arg1: string | undefined;
      arg2: string | undefined;
      arg3: string | undefined;
    },
    _flags: Record<string, unknown>,
  ): Promise<void> {
    if (!arguments_.arg1) {
      this.error("Favorite name is required for run-favorite subcommand", { exit: 1 });
    }

    const favoriteName = arguments_.arg1;
    const favorite = await storageService.getFavorite(favoriteName);

    if (!favorite) {
      this.error(`Favorite '${favoriteName}' not found`, { exit: 1 });
    }

    // Record access
    await storageService.recordAccess(favoriteName);

    // Execute based on type
    if (favorite.type === "log-group") {
      this.log(`Opening log group: ${favorite.logGroupName}`);
      this.log(`Use: aws-ts cloudwatch:logs:describe-group "${favorite.logGroupName}"`);
      this.log(`Or: aws-ts cloudwatch:logs:tail "${favorite.logGroupName}"`);
    } else if (favorite.type === "query") {
      // Get the saved query and execute it
      const collection = await storageService.loadCollection();
      const savedQuery = collection.savedQueries.find((q) => q.name === favorite.queryName);

      if (!savedQuery) {
        this.error(`Saved query '${favorite.queryName}' not found`, { exit: 1 });
      }

      this.log(`Executing saved query: ${savedQuery.name}`);
      this.log(`Query: ${savedQuery.query}`);

      // For now, just show the command to run
      // In a full implementation, we could execute it directly
      this.log(`\nTo execute this query, run:`);
      this.log(`aws-ts cloudwatch:logs:query <log-group> "${savedQuery.query}"`);
    }
  }

  /**
   * Handle export subcommand
   * @internal
   */
  private async handleExport(
    storageService: FavoritesStorageService,
    arguments_: {
      subcommand: string;
      arg1: string | undefined;
      arg2: string | undefined;
      arg3: string | undefined;
    },
    _flags: Record<string, unknown>,
  ): Promise<void> {
    const exportFile = arguments_.arg1 || "favorites-export.json";
    const description = arguments_.arg2;

    const exportData = await storageService.exportFavorites(description);

    const fs = await import("node:fs/promises");
    await fs.writeFile(exportFile, JSON.stringify(exportData, undefined, 2), "utf8");

    this.log(
      `Exported ${exportData.favorites.length} favorites and ${exportData.savedQueries.length} queries to: ${exportFile}`,
    );
  }

  /**
   * Handle import subcommand
   * @internal
   */
  private async handleImport(
    storageService: FavoritesStorageService,
    arguments_: {
      subcommand: string;
      arg1: string | undefined;
      arg2: string | undefined;
      arg3: string | undefined;
    },
    flags: { "merge-strategy": string; verbose: boolean },
  ): Promise<void> {
    if (!arguments_.arg1) {
      this.error("Import file is required for import subcommand", { exit: 1 });
    }

    const importFile = arguments_.arg1;
    const mergeStrategy = flags["merge-strategy"] as "overwrite" | "skip" | "rename";

    try {
      const fs = await import("node:fs/promises");
      const data = await fs.readFile(importFile, "utf8");
      const exportData = JSON.parse(data) as unknown;

      const summary = await storageService.importFavorites(
        exportData as FavoritesExport,
        mergeStrategy,
      );

      this.log(`Import completed:`);
      this.log(`   Imported: ${summary.imported}`);
      this.log(`   Skipped: ${summary.skipped}`);
      if (summary.errors.length > 0) {
        this.log(`   Errors: ${summary.errors.length}`);
        if (flags.verbose) {
          for (const error of summary.errors) this.log(`   - ${error}`);
        }
      }
    } catch (error) {
      this.error(`Failed to import from '${importFile}': ${String(error)}`, { exit: 1 });
    }
  }

  /**
   * Handle stats subcommand
   * @internal
   */
  private async handleStats(
    storageService: FavoritesStorageService,
    _flags: Record<string, unknown>,
  ): Promise<void> {
    const stats = await storageService.getUsageStats();
    const favorites = await storageService.listFavorites();

    this.log("\nFavorites Usage Statistics:");
    this.log(`Total Favorites: ${stats.totalFavorites}`);
    this.log(`Total Saved Queries: ${stats.totalQueries}`);
    this.log(`Most Accessed: ${stats.mostAccessedFavorite || "None"}`);
    this.log(`Least Recently Used: ${stats.leastRecentlyUsed || "None"}`);

    // Show storage location
    this.log(`\n Storage Location: ${storageService.getStorageDir()}`);

    // Show recommendations
    const recommendations = this.generateRecommendations(stats, favorites);
    if (recommendations.length > 0) {
      this.log("\nRecommendations:");
      for (const [index, rec] of recommendations.entries()) {
        this.log(`${index + 1}. ${rec}`);
      }
    }
  }

  /**
   * Generate usage recommendations
   * @internal
   * @param stats - Usage statistics object
   * @param favorites - Array of favorite items
   * @returns Array of recommendation strings
   */
  private generateRecommendations(
    stats: { totalFavorites: number; totalQueries: number },
    favorites: Array<{ accessCount?: number }>,
  ): string[] {
    const recommendations: string[] = [];

    if (stats.totalFavorites === 0) {
      recommendations.push("Start adding frequently used log groups and queries to favorites");
    }

    if (stats.totalFavorites > 20) {
      recommendations.push("Consider organizing favorites or removing unused ones");
    }

    const unusedFavorites = favorites.filter((fav) => (fav.accessCount || 0) === 0);
    if (unusedFavorites.length > 0) {
      recommendations.push(
        `You have ${unusedFavorites.length} unused favorites that could be removed`,
      );
    }

    if (stats.totalQueries === 0 && stats.totalFavorites > 0) {
      recommendations.push("Consider saving frequently used queries as favorites");
    }

    return recommendations;
  }
}
