/**
 * @module cloudwatch/logs/interactive-query
 * CloudWatch Logs interactive query command
 *
 * Interactive query builder with step-by-step query construction, field discovery,
 * query templates, and real-time validation for CloudWatch Logs Insights queries.
 *
 */

import { Flags } from "@oclif/core";
import enquirer from "enquirer";
import { handleCloudWatchLogsCommandError } from "../../../lib/cloudwatch-logs-errors.js";
import { DataFormat, DataProcessor } from "../../../lib/data-processing.js";
import { formatBytes } from "../../../lib/format-utilities.js";
import type { QueryResult } from "../../../services/cloudwatch-logs-service.js";
import { CloudWatchLogsService } from "../../../services/cloudwatch-logs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * Query template for common use cases
 * @internal
 */
interface QueryTemplate {
  name: string;
  description: string;
  query: string;
  category: "errors" | "performance" | "security" | "general";
}

/**
 * CloudWatch Logs interactive query command for guided query building
 *
 * Provides an interactive interface for building CloudWatch Logs Insights queries
 * with field discovery, templates, and real-time validation.
 *
 * @public
 */
export default class CloudWatchLogsInteractiveQueryCommand extends BaseCommand {
  static override readonly description =
    "Interactive CloudWatch Logs query builder with templates and field discovery";

  static override readonly examples = [
    {
      description: "Start interactive query builder",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "Start with specific log groups pre-selected",
      command:
        "<%= config.bin %> <%= command.id %> --log-groups /aws/lambda/my-function,/aws/apigateway/my-api",
    },
    {
      description: "Start with a specific region and profile",
      command: "<%= config.bin %> <%= command.id %> --region us-west-2 --profile production",
    },
    {
      description: "Skip templates and go directly to query building",
      command: "<%= config.bin %> <%= command.id %> --skip-templates",
    },
    {
      description: "Use specific query language",
      command: "<%= config.bin %> <%= command.id %> --query-language OpenSearchPPL",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "log-groups": Flags.string({
      description: "Comma-separated list of log groups to pre-select",
      helpValue: "LOG_GROUP1,LOG_GROUP2",
    }),

    "query-language": Flags.string({
      char: "l",
      description: "Query language to use for building queries",
      options: ["CloudWatchLogsInsights", "OpenSearchPPL", "OpenSearchSQL"],
      default: "CloudWatchLogsInsights",
    }),

    "skip-templates": Flags.boolean({
      description: "Skip query templates and go directly to custom query building",
      default: false,
    }),

    "output-format": Flags.string({
      description: "Default output format for query results",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),
  };

  private logsService!: CloudWatchLogsService;
  private availableLogGroups: string[] = [];
  private selectedLogGroups: string[] = [];
  private discoveredFields: string[] = [];

  /**
   * Execute the CloudWatch Logs interactive query command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(CloudWatchLogsInteractiveQueryCommand);

    try {
      // Initialize CloudWatch Logs service with configuration from CLI flags and credential context.
      this.logsService = new CloudWatchLogsService({
        enableDebugLogging: flags.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(flags.region && { region: flags.region }),
          ...(flags.profile && { profile: flags.profile }),
        },
      });

      this.log("CloudWatch Logs Interactive Query Builder\n");

      // Step 1: Select log groups
      await this.selectLogGroups(flags["log-groups"], flags.region, flags.profile);

      // Step 2: Discover fields (optional)
      await this.discoverFields(flags.region, flags.profile);

      // Step 3: Choose query approach
      const queryApproach = await this.chooseQueryApproach(flags["skip-templates"]);

      let finalQuery: string;
      let timeRange: { startTime: Date; endTime: Date };

      if (queryApproach === "template") {
        // Step 4a: Use template
        const result = await this.useQueryTemplate();
        finalQuery = result.query;
        timeRange = result.timeRange;
      } else {
        // Step 4b: Build custom query
        const result = await this.buildCustomQuery(flags["query-language"]);
        finalQuery = result.query;
        timeRange = result.timeRange;
      }

      // Step 5: Execute query
      await this.executeQuery(
        finalQuery,
        timeRange,
        flags["query-language"],
        flags["output-format"],
        flags.region,
        flags.profile,
        flags.verbose,
      );
    } catch (error) {
      const formattedError = handleCloudWatchLogsCommandError(
        error,
        flags.verbose,
        "interactive query building",
      );
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Select log groups for querying
   *
   * @param preSelectedGroups - Pre-selected log groups from flags
   * @param region - AWS region
   * @param profile - AWS profile
   * @internal
   */
  private async selectLogGroups(
    preSelectedGroups?: string,
    region?: string,
    profile?: string,
  ): Promise<void> {
    if (preSelectedGroups) {
      this.selectedLogGroups = preSelectedGroups.split(",").map((g) => g.trim());
      this.log(`Using pre-selected log groups: ${this.selectedLogGroups.join(", ")}\n`);
      return;
    }

    this.log("Step 1: Select Log Groups");

    // Fetch available log groups
    try {
      const result = await this.logsService.listLogGroups(
        { ...(region && { region }), ...(profile && { profile }) },
        undefined,
        50, // Limit to first 50 groups for performance
      );
      this.availableLogGroups = result.items.map((group) => group.logGroupName);
    } catch {
      this.log("Unable to fetch log groups. You can enter them manually.");
      this.availableLogGroups = [];
    }

    if (this.availableLogGroups.length > 0) {
      const { logGroupSelection } = await enquirer.prompt<{ logGroupSelection: string[] }>({
        type: "multiselect",
        name: "logGroupSelection",
        message: "Select log groups to query:",
        choices: this.availableLogGroups.slice(0, 20).map((group) => ({
          name: group,
          value: group,
        })),
        validate: (value: string) => {
          const selected = Array.isArray(value) ? value : [value];
          return selected.length > 0 || "Please select at least one log group";
        },
      });
      this.selectedLogGroups = logGroupSelection;
    } else {
      const { manualLogGroups } = await enquirer.prompt<{ manualLogGroups: string }>({
        type: "input",
        name: "manualLogGroups",
        message: "Enter log group names (comma-separated):",
        validate: (input: string) =>
          input.trim().length > 0 || "Please enter at least one log group",
      });
      this.selectedLogGroups = manualLogGroups.split(",").map((g) => g.trim());
    }

    this.log(`Selected log groups: ${this.selectedLogGroups.join(", ")}\n`);
  }

  /**
   * Discover available fields in selected log groups
   *
   * @param region - AWS region
   * @param profile - AWS profile
   * @internal
   */
  private async discoverFields(_region?: string, _profile?: string): Promise<void> {
    this.log("Step 2: Field Discovery");

    const { discoverFields } = await enquirer.prompt<{ discoverFields: boolean }>({
      type: "confirm",
      name: "discoverFields",
      message: "Would you like to discover available fields in your log groups?",
      initial: true,
    });

    if (!discoverFields) {
      this.log("Skipping field discovery.\n");
      return;
    }

    // Note: AWS SDK doesn't have GetLogGroupFields in the current implementation
    // This would be a future enhancement
    this.log("Field discovery is not yet implemented. Common fields include:");
    this.log("  @timestamp, @message, @requestId, @duration, @billedDuration");
    this.log("  @type, @logStream, @log, @ptr\n");

    this.discoveredFields = [
      "@timestamp",
      "@message",
      "@requestId",
      "@duration",
      "@billedDuration",
    ];
  }

  /**
   * Choose query building approach
   *
   * @param skipTemplates - Whether to skip template selection
   * @returns Query approach choice
   * @internal
   */
  private async chooseQueryApproach(skipTemplates: boolean): Promise<"template" | "custom"> {
    if (skipTemplates) {
      return "custom";
    }

    this.log(" Step 3: Query Approach");

    const { approach } = await enquirer.prompt<{ approach: "template" | "custom" }>({
      type: "select",
      name: "approach",
      message: "How would you like to build your query?",
      choices: [
        { name: "Use a pre-built template", value: "template" },
        { name: "Build a custom query", value: "custom" },
      ],
    });

    return approach;
  }

  /**
   * Use a query template
   *
   * @returns Selected query and time range
   * @internal
   */
  private async useQueryTemplate(): Promise<{
    query: string;
    timeRange: { startTime: Date; endTime: Date };
  }> {
    this.log("Step 4: Select Query Template");

    const templates = this.getQueryTemplates();

    const { selectedTemplate } = await enquirer.prompt<{ selectedTemplate: QueryTemplate }>({
      type: "select",
      name: "selectedTemplate",
      message: "Choose a query template:",
      choices: templates.map((template) => ({
        name: `${template.name} - ${template.description}`,
        value: template,
      })),
    });

    this.log(`\nSelected template: ${selectedTemplate.name}`);
    this.log(`Query: ${selectedTemplate.query}\n`);

    // Get time range
    const timeRange = await this.getTimeRange();

    return { query: selectedTemplate.query, timeRange };
  }

  /**
   * Build a custom query interactively
   *
   * @param queryLanguage - Query language to use
   * @returns Built query and time range
   * @internal
   */
  private async buildCustomQuery(
    queryLanguage: string,
  ): Promise<{ query: string; timeRange: { startTime: Date; endTime: Date } }> {
    this.log(`Step 4: Build Custom ${queryLanguage} Query`);

    return queryLanguage === "CloudWatchLogsInsights"
      ? this.buildLogsInsightsQuery()
      : this.buildAdvancedQuery(queryLanguage);
  }

  /**
   * Build a CloudWatch Logs Insights query
   *
   * @returns Built query and time range
   * @internal
   */
  private async buildLogsInsightsQuery(): Promise<{
    query: string;
    timeRange: { startTime: Date; endTime: Date };
  }> {
    const queryParts: string[] = [];

    // Fields selection
    const { fields } = await enquirer.prompt<{ fields: string }>({
      type: "input",
      name: "fields",
      message: "Enter fields to select (comma-separated, or press Enter for default):",
      initial: "@timestamp, @message",
    });
    queryParts.push(`fields ${fields}`);

    // Filter conditions
    const { addFilter } = await enquirer.prompt<{ addFilter: boolean }>({
      type: "confirm",
      name: "addFilter",
      message: "Add filter conditions?",
      initial: false,
    });

    if (addFilter) {
      const { filterCondition } = await enquirer.prompt<{ filterCondition: string }>({
        type: "input",
        name: "filterCondition",
        message: "Enter filter condition (e.g., @message like /ERROR/):",
        validate: (input: string) => input.trim().length > 0 || "Please enter a filter condition",
      });
      queryParts.push(`filter ${filterCondition}`);
    }

    // Sorting
    const { addSort } = await enquirer.prompt<{ addSort: boolean }>({
      type: "confirm",
      name: "addSort",
      message: "Add sorting?",
      initial: true,
    });

    if (addSort) {
      const { sortField } = await enquirer.prompt<{ sortField: string }>({
        type: "input",
        name: "sortField",
        message: "Sort by field:",
        initial: "@timestamp",
      });

      const { sortOrder } = await enquirer.prompt<{ sortOrder: "asc" | "desc" }>({
        type: "select",
        name: "sortOrder",
        message: "Sort order:",
        choices: [
          { name: "Ascending", value: "asc" },
          { name: "Descending", value: "desc" },
        ],
        initial: 1,
      });

      queryParts.push(`sort ${sortField} ${sortOrder}`);
    }

    // Limit
    const { limit } = await enquirer.prompt<{ limit: number }>({
      type: "numeral",
      name: "limit",
      message: "Number of results to return:",
      initial: 100,
      validate: (value: string) => {
        const number_ = Number(value);
        return (number_ > 0 && number_ <= 10_000) || "Please enter a number between 1 and 10000";
      },
    });
    queryParts.push(`limit ${limit}`);

    const finalQuery = queryParts.join(" | ");
    this.log(`\nBuilt query: ${finalQuery}\n`);

    const timeRange = await this.getTimeRange();

    return { query: finalQuery, timeRange };
  }

  /**
   * Build an advanced query (OpenSearch PPL/SQL)
   *
   * @param queryLanguage - Query language
   * @returns Built query and time range
   * @internal
   */
  private async buildAdvancedQuery(
    queryLanguage: string,
  ): Promise<{ query: string; timeRange: { startTime: Date; endTime: Date } }> {
    const { customQuery } = await enquirer.prompt<{ customQuery: string }>({
      type: "input",
      name: "customQuery",
      message: `Enter your ${queryLanguage} query:`,
      validate: (input: string) => input.trim().length > 0 || "Please enter a query",
    });

    this.log(`\nQuery: ${customQuery}\n`);

    const timeRange = await this.getTimeRange();

    return { query: customQuery, timeRange };
  }

  /**
   * Get time range for query
   *
   * @returns Time range object
   * @internal
   */
  private async getTimeRange(): Promise<{ startTime: Date; endTime: Date }> {
    this.log(" Time Range Selection");

    const { timeRangeType } = await enquirer.prompt<{ timeRangeType: "relative" | "absolute" }>({
      type: "select",
      name: "timeRangeType",
      message: "How would you like to specify the time range?",
      choices: [
        { name: "Relative (e.g., last 1 hour)", value: "relative" },
        { name: "Absolute (specific dates)", value: "absolute" },
      ],
    });

    if (timeRangeType === "relative") {
      const { relativeTime } = await enquirer.prompt<{ relativeTime: string }>({
        type: "select",
        name: "relativeTime",
        message: "Select time range:",
        choices: [
          { name: "Last 15 minutes", value: "15m" },
          { name: "Last 1 hour", value: "1h" },
          { name: "Last 4 hours", value: "4h" },
          { name: "Last 12 hours", value: "12h" },
          { name: "Last 24 hours", value: "24h" },
          { name: "Last 3 days", value: "3d" },
          { name: "Last 7 days", value: "7d" },
        ],
      });

      const endTime = new Date();
      const startTime = this.parseRelativeTime(relativeTime, endTime);

      return { startTime, endTime };
    } else {
      const { startTimeStr } = await enquirer.prompt<{ startTimeStr: string }>({
        type: "input",
        name: "startTimeStr",
        message: "Enter start time (ISO 8601 format):",
        initial: new Date(Date.now() - 3_600_000).toISOString(),
      });

      const { endTimeStr } = await enquirer.prompt<{ endTimeStr: string }>({
        type: "input",
        name: "endTimeStr",
        message: "Enter end time (ISO 8601 format):",
        initial: new Date().toISOString(),
      });

      return {
        startTime: new Date(startTimeStr),
        endTime: new Date(endTimeStr),
      };
    }
  }

  /**
   * Execute the built query
   *
   * @param query - Query string to execute
   * @param timeRange - Time range for query
   * @param queryLanguage - Query language
   * @param outputFormat - Output format
   * @param region - AWS region
   * @param profile - AWS profile
   * @param verbose - Verbose output
   * @internal
   */
  private async executeQuery(
    query: string,
    timeRange: { startTime: Date; endTime: Date },
    queryLanguage: string,
    outputFormat: string,
    region?: string,
    profile?: string,
    verbose?: boolean,
  ): Promise<void> {
    this.log("Step 5: Execute Query");

    const { confirmExecution } = await enquirer.prompt<{ confirmExecution: boolean }>({
      type: "confirm",
      name: "confirmExecution",
      message: "Execute the query now?",
      initial: true,
    });

    if (!confirmExecution) {
      this.log("Query execution cancelled.");
      return;
    }

    const result = await this.logsService.executeQuery(
      {
        logGroupNames: this.selectedLogGroups,
        query,
        queryLanguage: queryLanguage as
          | "CloudWatchLogsInsights"
          | "OpenSearchPPL"
          | "OpenSearchSQL",
        startTime: timeRange.startTime,
        endTime: timeRange.endTime,
        limit: 1000,
      },
      {
        ...(region && { region }),
        ...(profile && { profile }),
      },
    );

    this.displayQueryResults(result, outputFormat, verbose);
  }

  /**
   * Display query results
   *
   * @param result - Query execution result
   * @param format - Output format
   * @param verbose - Verbose output
   * @internal
   */
  private displayQueryResults(result: QueryResult, format: string, verbose?: boolean): void {
    if (result.status !== "Complete") {
      this.error(`Query failed with status: ${result.status}`, { exit: 1 });
      return;
    }

    const results = result.results || [];
    this.log(`\nQuery completed successfully! Found ${results.length} results.\n`);

    if (results.length === 0) {
      this.log("No results found for the specified query and time range.");
      return;
    }

    // Display results using the same logic as the query command
    if (format === "table" && results.length > 0) {
      const tableData = results.slice(0, 20).map((row, index) => {
        // Limit to first 20 for readability
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
        tableData.map((item, index) => ({ data: item, index })),
      );

      this.log(output);

      if (results.length > 20) {
        this.log(`\n... and ${results.length - 20} more results (showing first 20)`);
      }
    } else {
      // For other formats, just show a summary
      this.log(
        `Results available in ${format} format. Use the regular query command to see full output.`,
      );
    }

    if (verbose && result.statistics) {
      this.log(`\nQuery Statistics:`);
      this.log(`  Records Matched: ${result.statistics.recordsMatched || 0}`);
      this.log(`  Records Scanned: ${result.statistics.recordsScanned || 0}`);
      this.log(`  Bytes Scanned: ${formatBytes(result.statistics.bytesScanned || 0)}`);
    }
  }

  /**
   * Get predefined query templates
   *
   * @returns Array of query templates
   * @internal
   */
  private getQueryTemplates(): QueryTemplate[] {
    return [
      {
        name: "Recent Errors",
        description: "Find recent error messages",
        query:
          "fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 50",
        category: "errors",
      },
      {
        name: "High Duration Requests",
        description: "Find requests with high duration",
        query:
          "fields @timestamp, @message, @duration | filter @duration > 1000 | sort @duration desc | limit 20",
        category: "performance",
      },
      {
        name: "Request Volume",
        description: "Count requests by time period",
        query: "fields @timestamp | stats count(*) by bin(5m) | sort @timestamp",
        category: "general",
      },
      {
        name: "Error Rate Analysis",
        description: "Calculate error rate over time",
        query:
          "fields @timestamp, @message | filter @message like /ERROR/ or @message like /WARN/ | stats count(*) by bin(5m) | sort @timestamp",
        category: "errors",
      },
      {
        name: "Top Request IDs",
        description: "Find most frequent request IDs",
        query:
          "fields @timestamp, @requestId | stats count() as requestCount by @requestId | sort requestCount desc | limit 10",
        category: "general",
      },
      {
        name: "Memory Usage Patterns",
        description: "Analyze memory usage in Lambda logs",
        query:
          "fields @timestamp, @message | filter @message like /Memory/ | sort @timestamp desc | limit 50",
        category: "performance",
      },
    ];
  }

  /**
   * Parse relative time string to Date
   *
   * @param relativeTime - Relative time string
   * @param referenceTime - Reference time
   * @returns Parsed Date
   * @throws When an unsupported time unit is provided
   * @internal
   */
  private parseRelativeTime(relativeTime: string, referenceTime: Date): Date {
    const value = Number.parseInt(relativeTime.slice(0, -1), 10);
    const unit = relativeTime.slice(-1);

    switch (unit) {
      case "m": {
        return new Date(referenceTime.getTime() - value * 60 * 1000);
      }
      case "h": {
        return new Date(referenceTime.getTime() - value * 60 * 60 * 1000);
      }
      case "d": {
        return new Date(referenceTime.getTime() - value * 24 * 60 * 60 * 1000);
      }
      default: {
        throw new Error(`Unsupported time unit: ${unit}`);
      }
    }
  }
}
