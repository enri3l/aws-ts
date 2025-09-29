/**
 * CloudWatch Logs saved queries command
 *
 * Manage saved query definitions with local storage, execution capabilities,
 * and team collaboration features for CloudWatch Logs Insights queries.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { prompt } from "enquirer";
import { promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { handleCloudWatchLogsCommandError } from "../../../lib/cloudwatch-logs-errors.js";
import type { SavedQuery } from "../../../lib/cloudwatch-logs-schemas.js";
import { SavedQuerySchema } from "../../../lib/cloudwatch-logs-schemas.js";
import { DataFormat, DataProcessor } from "../../../lib/data-processing.js";
import { CloudWatchLogsService } from "../../../services/cloudwatch-logs-service.js";

/**
 * CloudWatch Logs query result structure
 * @internal
 */
interface CloudWatchQueryResult {
  status: string;
  results?: Array<Array<{ field?: string; value?: string }>>;
  statistics?: {
    recordsMatched?: number;
    recordsScanned?: number;
    bytesScanned?: number;
  };
}

/**
 * Query result field structure
 * @internal
 */
interface QueryResultField {
  field?: string;
  value?: string;
}

/**
 * Import file structure for saved queries
 * @internal
 */
type ImportFile = { queries: unknown[] } | unknown[];

/**
 * Saved queries storage manager
 * @internal
 */
class SavedQueriesStorage {
  private readonly storageDir: string;
  private readonly storageFile: string;

  constructor() {
    this.storageDir = path.join(homedir(), ".aws-ts");
    this.storageFile = path.join(this.storageDir, "saved-queries.json");
  }

  /**
   * Ensure storage directory exists
   */
  async ensureStorageDir(): Promise<void> {
    try {
      await fs.access(this.storageDir);
    } catch {
      await fs.mkdir(this.storageDir, { recursive: true });
    }
  }

  /**
   * Load saved queries from storage
   *
   * @returns Promise resolving to array of saved queries
   */
  async loadQueries(): Promise<SavedQuery[]> {
    try {
      await this.ensureStorageDir();
      const data = await fs.readFile(this.storageFile, "utf8");
      const queries = JSON.parse(data) as SavedQuery[];
      return queries.map((query) => SavedQuerySchema.parse(query));
    } catch {
      return [];
    }
  }

  /**
   * Save queries to storage
   */
  async saveQueries(queries: SavedQuery[]): Promise<void> {
    await this.ensureStorageDir();
    await fs.writeFile(this.storageFile, JSON.stringify(queries, undefined, 2));
  }

  /**
   * Add a new query
   */
  async addQuery(query: SavedQuery): Promise<void> {
    const queries = await this.loadQueries();

    // Remove existing query with same name
    const filteredQueries = queries.filter((q) => q.name !== query.name);
    filteredQueries.push(query);

    await this.saveQueries(filteredQueries);
  }

  /**
   * Remove a query by name
   *
   * @returns Promise resolving to true if query was found and removed, false otherwise
   */
  async removeQuery(name: string): Promise<boolean> {
    const queries = await this.loadQueries();
    const initialLength = queries.length;
    const filteredQueries = queries.filter((q) => q.name !== name);

    if (filteredQueries.length === initialLength) {
      return false; // Query not found
    }

    await this.saveQueries(filteredQueries);
    return true;
  }

  /**
   * Update query usage statistics
   */
  async updateQueryUsage(name: string): Promise<void> {
    const queries = await this.loadQueries();
    const query = queries.find((q) => q.name === name);

    if (query) {
      query.lastUsedAt = new Date().toISOString();
      query.usageCount += 1;
      await this.saveQueries(queries);
    }
  }
}

/**
 * CloudWatch Logs saved queries command for managing query definitions
 *
 * Provides management of saved CloudWatch Logs queries
 * with local storage, execution, and team collaboration features.
 *
 * @public
 */
export default class CloudWatchLogsSavedQueriesCommand extends Command {
  static override readonly description = "Manage saved CloudWatch Logs Insights queries";

  static override readonly examples = [
    {
      description: "List all saved queries",
      command: "<%= config.bin %> <%= command.id %> list",
    },
    {
      description: "Save a new query",
      command:
        "<%= config.bin %> <%= command.id %> save error-analysis 'fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 50'",
    },
    {
      description: "Run a saved query",
      command: "<%= config.bin %> <%= command.id %> run error-analysis /aws/lambda/my-function",
    },
    {
      description: "Delete a saved query",
      command: "<%= config.bin %> <%= command.id %> delete old-query",
    },
    {
      description: "Export queries to JSON file",
      command: "<%= config.bin %> <%= command.id %> export my-queries.json",
    },
    {
      description: "Import queries from JSON file",
      command: "<%= config.bin %> <%= command.id %> import team-queries.json",
    },
    {
      description: "List queries in JSON format",
      command: "<%= config.bin %> <%= command.id %> list --format json",
    },
    {
      description: "Save query with description",
      command:
        "<%= config.bin %> <%= command.id %> save performance-check 'fields @duration | filter @duration > 1000' --description 'Find slow requests over 1 second'",
    },
  ];

  static override readonly args = {
    action: Args.string({
      name: "action",
      description: "Action to perform (list, save, run, delete, export, import)",
      required: true,
      options: ["list", "save", "run", "delete", "export", "import"],
    }),
    name: Args.string({
      name: "name",
      description: "Query name (for save, run, delete actions)",
      required: false,
    }),
    query: Args.string({
      name: "query",
      description: "Query string (for save action)",
      required: false,
    }),
  };

  static override readonly flags = {
    region: Flags.string({
      char: "r",
      description: "AWS region for query execution",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for list action",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    description: Flags.string({
      char: "d",
      description: "Description for saved query",
      helpValue: "DESCRIPTION",
    }),

    "log-groups": Flags.string({
      char: "l",
      description: "Default log groups for saved query (comma-separated)",
      helpValue: "LOG_GROUP1,LOG_GROUP2",
    }),

    "query-language": Flags.string({
      description: "Query language for saved query",
      options: ["CloudWatchLogsInsights", "OpenSearchPPL", "OpenSearchSQL"],
      default: "CloudWatchLogsInsights",
    }),

    "start-time": Flags.string({
      char: "s",
      description: "Start time for query execution (relative or absolute)",
      helpValue: "TIME",
      default: "1 hour ago",
    }),

    "end-time": Flags.string({
      char: "e",
      description: "End time for query execution (relative or absolute)",
      helpValue: "TIME",
      default: "now",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with operation details",
      default: false,
    }),
  };

  private storage = new SavedQueriesStorage();

  /**
   * Execute the CloudWatch Logs saved queries command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(CloudWatchLogsSavedQueriesCommand);

    try {
      switch (args.action) {
        case "list": {
          await this.listQueries(flags.format, flags.verbose);
          break;
        }
        case "save": {
          if (!args.name || !args.query) {
            this.error("Both name and query are required for save action", { exit: 1 });
          }
          await this.saveQuery(
            args.name,
            args.query,
            flags.description,
            flags["log-groups"],
            flags["query-language"],
            flags.verbose,
          );
          break;
        }
        case "run": {
          if (!args.name) {
            this.error("Query name is required for run action", { exit: 1 });
          }
          await this.runQuery(
            args.name,
            args.query, // This will be used as log groups override
            flags.region,
            flags.profile,
            flags["start-time"],
            flags["end-time"],
            flags.verbose,
          );
          break;
        }
        case "delete": {
          if (!args.name) {
            this.error("Query name is required for delete action", { exit: 1 });
          }
          await this.deleteQuery(args.name, flags.verbose);
          break;
        }
        case "export": {
          if (!args.name) {
            this.error("File path is required for export action", { exit: 1 });
          }
          await this.exportQueries(args.name, flags.verbose);
          break;
        }
        case "import": {
          if (!args.name) {
            this.error("File path is required for import action", { exit: 1 });
          }
          await this.importQueries(args.name, flags.verbose);
          break;
        }
        default: {
          this.error(`Unknown action: ${args.action}`, { exit: 1 });
        }
      }
    } catch (error) {
      const formattedError = handleCloudWatchLogsCommandError(
        error,
        flags.verbose,
        `saved queries ${args.action} operation`,
      );
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * List all saved queries
   *
   * @param format - Output format
   * @param verbose - Verbose output
   * @internal
   */
  private async listQueries(format: string, verbose: boolean): Promise<void> {
    const queries = await this.storage.loadQueries();

    if (queries.length === 0) {
      this.log("No saved queries found.");
      return;
    }

    switch (format) {
      case "table": {
        this.displayQueriesTable(queries, verbose);
        break;
      }
      case "json": {
        this.log(JSON.stringify({ queries, count: queries.length }, undefined, 2));
        break;
      }
      case "jsonl": {
        for (const query of queries) {
          this.log(JSON.stringify(query));
        }
        break;
      }
      case "csv": {
        this.displayQueriesCsv(queries);
        break;
      }
      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }

  /**
   * Save a new query
   *
   * @param name - Query name
   * @param queryString - Query string
   * @param description - Optional description
   * @param logGroups - Default log groups
   * @param queryLanguage - Query language
   * @param verbose - Verbose output
   * @internal
   */
  private async saveQuery(
    name: string,
    queryString: string,
    description?: string,
    logGroups?: string,
    queryLanguage?: string,
    verbose?: boolean,
  ): Promise<void> {
    const savedQuery: SavedQuery = {
      name,
      query: queryString,
      queryLanguage:
        (queryLanguage as "CloudWatchLogsInsights" | "OpenSearchPPL" | "OpenSearchSQL") ||
        "CloudWatchLogsInsights",
      createdAt: new Date().toISOString(),
      usageCount: 0,
      ...(description && { description }),
      ...(logGroups && { defaultLogGroups: logGroups.split(",").map((g) => g.trim()) }),
    };

    // Validate the saved query
    SavedQuerySchema.parse(savedQuery);

    await this.storage.addQuery(savedQuery);

    if (verbose) {
      this.log(`Saved query '${name}' successfully.`);
      this.log(`  Query: ${queryString}`);
      this.log(`  Language: ${savedQuery.queryLanguage}`);
      if (description) this.log(`  Description: ${description}`);
      if (logGroups) this.log(`  Default log groups: ${logGroups}`);
    } else {
      this.log(`Query '${name}' saved successfully.`);
    }
  }

  /**
   * Run a saved query
   *
   * @param name - Query name
   * @param logGroupsOverride - Log groups override
   * @param region - AWS region
   * @param profile - AWS profile
   * @param startTime - Start time
   * @param endTime - End time
   * @param verbose - Verbose output
   * @internal
   */
  private async runQuery(
    name: string,
    logGroupsOverride?: string,
    region?: string,
    profile?: string,
    startTime?: string,
    endTime?: string,
    verbose?: boolean,
  ): Promise<void> {
    const queries = await this.storage.loadQueries();
    const savedQuery = queries.find((q) => q.name === name);

    if (!savedQuery) {
      this.error(`Saved query '${name}' not found.`, { exit: 1 });
    }

    // Determine log groups to use
    let logGroupNames: string[];
    if (logGroupsOverride) {
      logGroupNames = logGroupsOverride.split(",").map((g) => g.trim());
    } else if (savedQuery.defaultLogGroups && savedQuery.defaultLogGroups.length > 0) {
      logGroupNames = savedQuery.defaultLogGroups;
    } else {
      this.error(
        `No log groups specified. Provide log groups as argument or set default log groups when saving the query.`,
        { exit: 1 },
      );
    }

    // Parse time range
    const timeRange = this.parseTimeRange(startTime || "1 hour ago", endTime || "now");

    if (verbose) {
      this.log(`Running saved query '${name}':`);
      this.log(`  Query: ${savedQuery.query}`);
      this.log(`  Language: ${savedQuery.queryLanguage}`);
      this.log(`  Log groups: ${logGroupNames.join(", ")}`);
      this.log(
        `  Time range: ${timeRange.startTime.toISOString()} to ${timeRange.endTime.toISOString()}`,
      );
      this.log("");
    }

    // Create service and execute query
    const logsService = new CloudWatchLogsService({
      enableDebugLogging: !!verbose,
      enableProgressIndicators: true,
      clientConfig: {
        ...(region && { region }),
        ...(profile && { profile }),
      },
    });

    const result = await logsService.executeQuery(
      {
        logGroupNames,
        query: savedQuery.query,
        queryLanguage: savedQuery.queryLanguage,
        startTime: timeRange.startTime,
        endTime: timeRange.endTime,
        limit: 1000,
      },
      {
        ...(region && { region }),
        ...(profile && { profile }),
      },
    );

    // Update usage statistics
    await this.storage.updateQueryUsage(name);

    // Display results
    this.displayQueryResults(result, verbose);
  }

  /**
   * Delete a saved query
   *
   * @param name - Query name
   * @param verbose - Verbose output
   * @internal
   */
  private async deleteQuery(name: string, verbose: boolean): Promise<void> {
    const queries = await this.storage.loadQueries();
    const query = queries.find((q) => q.name === name);

    if (!query) {
      this.error(`Saved query '${name}' not found.`, { exit: 1 });
    }

    // Confirm deletion
    const { confirmDelete } = await prompt<{ confirmDelete: boolean }>({
      type: "confirm",
      name: "confirmDelete",
      message: `Are you sure you want to delete the query '${name}'?`,
      initial: false,
    });

    if (!confirmDelete) {
      this.log("Delete operation cancelled.");
      return;
    }

    const deleted = await this.storage.removeQuery(name);

    if (deleted) {
      if (verbose) {
        this.log(`Successfully deleted query '${name}'.`);
        this.log(`  Query was: ${query.query}`);
      } else {
        this.log(`Query '${name}' deleted successfully.`);
      }
    } else {
      this.error(`Failed to delete query '${name}'.`, { exit: 1 });
    }
  }

  /**
   * Export queries to JSON file
   *
   * @param filePath - Export file path
   * @param verbose - Verbose output
   * @internal
   */
  private async exportQueries(filePath: string, verbose: boolean): Promise<void> {
    const queries = await this.storage.loadQueries();

    if (queries.length === 0) {
      this.error("No saved queries to export.", { exit: 1 });
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      version: "1.0",
      queries,
    };

    await fs.writeFile(filePath, JSON.stringify(exportData, undefined, 2));

    if (verbose) {
      this.log(`Exported ${queries.length} queries to '${filePath}'.`);
      this.log("Exported queries:");
      for (const query of queries) {
        this.log(`  - ${query.name}: ${query.description || "No description"}`);
      }
    } else {
      this.log(`Exported ${queries.length} queries to '${filePath}'.`);
    }
  }

  /**
   * Import queries from JSON file
   *
   * @param filePath - Import file path
   * @param verbose - Verbose output
   * @internal
   */
  private async importQueries(filePath: string, verbose: boolean): Promise<void> {
    try {
      const data = await fs.readFile(filePath, "utf8");
      const importData: ImportFile = JSON.parse(data) as ImportFile;

      const queries =
        "queries" in importData && Array.isArray(importData.queries)
          ? importData.queries
          : importData;

      if (!Array.isArray(queries)) {
        throw new TypeError("Invalid import file format. Expected array of queries.");
      }

      // Validate each query
      const validQueries = this.validateImportedQueries(queries);

      if (validQueries.length === 0) {
        this.error("No valid queries found in import file.", { exit: 1 });
      }

      // Import queries (will overwrite existing queries with same names)
      await this.importValidatedQueries(validQueries);
      this.displayImportResults(validQueries, filePath, verbose);
    } catch (error) {
      this.error(
        `Failed to import queries: ${error instanceof Error ? error.message : String(error)}`,
        { exit: 1 },
      );
    }
  }

  /**
   * Validate imported queries against schema
   *
   * @param queries - Raw query data to validate
   * @returns Array of valid SavedQuery objects
   * @internal
   */
  private validateImportedQueries(queries: unknown[]): SavedQuery[] {
    const validQueries: SavedQuery[] = [];
    for (const query of queries) {
      try {
        validQueries.push(SavedQuerySchema.parse(query));
      } catch (error) {
        this.log(
          `Skipping invalid query '${(query as { name?: string }).name || "unknown"}': ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    return validQueries;
  }

  /**
   * Import validated queries to storage
   *
   * @param validQueries - Validated queries to import
   * @returns Promise resolving when all queries are imported
   * @internal
   */
  private async importValidatedQueries(validQueries: SavedQuery[]): Promise<void> {
    for (const query of validQueries) {
      await this.storage.addQuery(query);
    }
  }

  /**
   * Display import results to user
   *
   * @param validQueries - Successfully imported queries
   * @param filePath - Import file path
   * @param verbose - Whether to show detailed output
   * @internal
   */
  private displayImportResults(
    validQueries: SavedQuery[],
    filePath: string,
    verbose: boolean,
  ): void {
    this.log(`Imported ${validQueries.length} queries from '${filePath}'.`);

    if (verbose) {
      this.displayImportedQueryDetails(validQueries);
    }
  }

  /**
   * Display detailed list of imported queries
   *
   * @param validQueries - Successfully imported queries
   * @internal
   */
  private displayImportedQueryDetails(validQueries: SavedQuery[]): void {
    this.log("Imported queries:");
    for (const query of validQueries) {
      this.log(`  - ${query.name}: ${query.description || "No description"}`);
    }
  }

  /**
   * Display queries in table format
   *
   * @param queries - Saved queries
   * @param verbose - Verbose output
   * @internal
   */
  private displayQueriesTable(queries: SavedQuery[], verbose: boolean): void {
    const tableData = queries.map((query, index) => ({
      "#": index + 1,
      Name: query.name,
      Description: query.description || "No description",
      Language: query.queryLanguage,
      "Usage Count": query.usageCount,
      "Last Used": query.lastUsedAt ? new Date(query.lastUsedAt).toLocaleDateString() : "Never",
      Created: new Date(query.createdAt).toLocaleDateString(),
    }));

    const processor = new DataProcessor({
      format: DataFormat.CSV,
      includeHeaders: true,
    });

    const output = processor.formatOutput(tableData.map((item, index) => ({ data: item, index })));

    this.log(`Saved Queries (${queries.length} total):\n`);
    this.log(output);

    if (verbose) {
      this.log("\nQuery Details:");
      for (const query of queries) {
        this.log(`\n${query.name}:`);
        this.log(`  Query: ${query.query}`);
        if (query.defaultLogGroups) {
          this.log(`  Default log groups: ${query.defaultLogGroups.join(", ")}`);
        }
      }
    }
  }

  /**
   * Display queries in CSV format
   *
   * @param queries - Saved queries
   * @internal
   */
  private displayQueriesCsv(queries: SavedQuery[]): void {
    const csvData = queries.map((query) => ({
      Name: query.name,
      Description: query.description || "",
      Query: query.query,
      Language: query.queryLanguage,
      UsageCount: query.usageCount,
      LastUsed: query.lastUsedAt || "",
      Created: query.createdAt,
      DefaultLogGroups: query.defaultLogGroups?.join(";") || "",
    }));

    const processor = new DataProcessor({
      format: DataFormat.CSV,
      includeHeaders: true,
    });

    const output = processor.formatOutput(csvData.map((item, index) => ({ data: item, index })));
    this.log(output);
  }

  /**
   * Display query execution results
   *
   * @param result - Query result
   * @param verbose - Verbose output
   * @internal
   */
  private displayQueryResults(result: CloudWatchQueryResult, verbose?: boolean): void {
    if (result.status !== "Complete") {
      this.error(`Query failed with status: ${result.status}`, { exit: 1 });
    }

    const results = result.results || [];
    this.log(`\nQuery executed successfully! Found ${results.length} results.\n`);

    if (results.length === 0) {
      this.log("No results found for the specified query and time range.");
      return;
    }

    // Display first 10 results for quick preview
    if (results.length > 0) {
      const tableData = results.slice(0, 10).map((row: QueryResultField[], index: number) => {
        const rowData: Record<string, string> = { "#": (index + 1).toString() };
        for (const field of row) {
          if (field.field && field.value !== undefined) {
            rowData[field.field] = field.value;
          }
        }
        return rowData;
      });

      const processor = new DataProcessor({
        format: DataFormat.CSV,
        includeHeaders: true,
      });

      const output = processor.formatOutput(
        tableData.map((item: Record<string, unknown>, index: number) => ({ data: item, index })),
      );

      this.log(output);

      if (results.length > 10) {
        this.log(`\n... and ${results.length - 10} more results (showing first 10)`);
      }
    }

    if (verbose && result.statistics) {
      this.log(`\nQuery Statistics:`);
      this.log(`  Records Matched: ${result.statistics.recordsMatched || 0}`);
      this.log(`  Records Scanned: ${result.statistics.recordsScanned || 0}`);
      this.log(`  Bytes Scanned: ${this.formatBytes(result.statistics.bytesScanned || 0)}`);
    }
  }

  /**
   * Parse time range from start and end time strings
   *
   * @param startTimeStr - Start time string
   * @param endTimeStr - End time string
   * @returns Parsed time range
   * @throws When time string format is invalid
   * @internal
   */
  private parseTimeRange(
    startTimeString: string,
    endTimeString: string,
  ): { startTime: Date; endTime: Date } {
    const endTime = this.parseTimeString(endTimeString);
    const startTime = this.parseTimeString(startTimeString, endTime);

    if (startTime >= endTime) {
      throw new Error("Start time must be before end time");
    }

    return { startTime, endTime };
  }

  /**
   * Parse time string (relative or absolute)
   *
   * @param timeString - Time string
   * @param referenceTime - Reference time
   * @returns Parsed Date
   * @throws When time string format is invalid or unsupported
   * @internal
   */
  private parseTimeString(timeString: string, referenceTime = new Date()): Date {
    if (timeString.toLowerCase() === "now") {
      return referenceTime;
    }

    const relativeTimeRegex = /^(\d+)\s*(m|min|minutes?|h|hour|hours?|d|day|days?)\s*ago$/i;
    const match = relativeTimeRegex.exec(timeString);

    if (match) {
      const value = Number.parseInt(match[1]!, 10);
      const unit = match[2]!.toLowerCase();
      const now = referenceTime;

      switch (unit.charAt(0)) {
        case "m": {
          return new Date(now.getTime() - value * 60 * 1000);
        }
        case "h": {
          return new Date(now.getTime() - value * 60 * 60 * 1000);
        }
        case "d": {
          return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
        }
        default: {
          throw new Error(`Unsupported time unit: ${unit}`);
        }
      }
    }

    const absoluteTime = new Date(timeString);
    if (Number.isNaN(absoluteTime.getTime())) {
      throw new TypeError(`Invalid time format: ${timeString}`);
    }

    return absoluteTime;
  }

  /**
   * Format bytes to human readable format
   *
   * @param bytes - Number of bytes
   * @returns Formatted string
   * @internal
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";

    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.floor(Math.log(bytes) / Math.log(k));

    return `${Number.parseFloat((bytes / Math.pow(k, index)).toFixed(2))} ${sizes[index]}`;
  }
}
