/**
 * DynamoDB scan table command
 *
 * Performs full table or index scans with support for filtering,
 * projection, and pagination with multiple output formats.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { DataProcessor } from "../../lib/data-processing.js";
import { formatErrorWithGuidance } from "../../lib/errors.js";
import type { DynamoDBScan } from "../../lib/dynamodb-schemas.js";
import { DynamoDBScanSchema } from "../../lib/dynamodb-schemas.js";
import type { ScanParameters } from "../../services/dynamodb-service.js";
import { DynamoDBService } from "../../services/dynamodb-service.js";

/**
 * DynamoDB scan command for full table/index scanning
 *
 * Provides comprehensive table scanning capabilities with filtering,
 * projection, and pagination support for large datasets.
 *
 * @public
 */
export default class DynamoDBScanCommand extends Command {
  static override readonly description = "Scan a DynamoDB table or index";

  static override readonly examples = [
    {
      description: "Scan all items from a table",
      command: "<%= config.bin %> <%= command.id %> my-table",
    },
    {
      description: "Scan with a filter expression",
      command: "<%= config.bin %> <%= command.id %> my-table --filter-expression '#status = :active' --expression-attribute-names '{\"#status\": \"status\"}' --expression-attribute-values '{\":active\": \"ACTIVE\"}'",
    },
    {
      description: "Scan with projection expression to select specific attributes",
      command: "<%= config.bin %> <%= command.id %> my-table --projection-expression 'id, #name, email' --expression-attribute-names '{\"#name\": \"name\"}'",
    },
    {
      description: "Scan a Global Secondary Index",
      command: "<%= config.bin %> <%= command.id %> my-table --index-name my-gsi",
    },
    {
      description: "Scan with pagination using limit",
      command: "<%= config.bin %> <%= command.id %> my-table --limit 100",
    },
    {
      description: "Scan with JSON output for programmatic processing",
      command: "<%= config.bin %> <%= command.id %> my-table --format json",
    },
  ];

  static override readonly args = {
    tableName: Args.string({
      name: "tableName",
      description: "Name of the DynamoDB table to scan",
      required: true,
    }),
  };

  static override readonly flags = {
    "index-name": Flags.string({
      char: "i",
      description: "Name of the index to scan (GSI or LSI)",
      helpValue: "INDEX_NAME",
    }),

    "filter-expression": Flags.string({
      description: "Filter expression to apply during scan",
      helpValue: "EXPRESSION",
    }),

    "projection-expression": Flags.string({
      description: "Projection expression to select specific attributes",
      helpValue: "EXPRESSION",
    }),

    "expression-attribute-names": Flags.string({
      description: "Expression attribute names (JSON object)",
      helpValue: "JSON",
    }),

    "expression-attribute-values": Flags.string({
      description: "Expression attribute values (JSON object)",
      helpValue: "JSON",
    }),

    "exclusive-start-key": Flags.string({
      description: "Exclusive start key for pagination (JSON object)",
      helpValue: "JSON",
    }),

    limit: Flags.integer({
      char: "l",
      description: "Maximum number of items to return",
      min: 1,
      max: 10000,
    }),

    "consistent-read": Flags.boolean({
      description: "Use consistent read (not applicable for GSI)",
      default: false,
    }),

    segment: Flags.integer({
      description: "Segment number for parallel scans (0-based)",
      min: 0,
    }),

    "total-segments": Flags.integer({
      description: "Total segments for parallel scans",
      min: 1,
      max: 1000000,
    }),

    region: Flags.string({
      char: "r",
      description: "AWS region containing the table",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for scan results",
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
   * Execute the DynamoDB scan command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(DynamoDBScanCommand);

    try {
      // Parse and validate JSON inputs
      const expressionAttributeNames = flags["expression-attribute-names"]
        ? JSON.parse(flags["expression-attribute-names"])
        : undefined;

      const expressionAttributeValues = flags["expression-attribute-values"]
        ? JSON.parse(flags["expression-attribute-values"])
        : undefined;

      const exclusiveStartKey = flags["exclusive-start-key"]
        ? JSON.parse(flags["exclusive-start-key"])
        : undefined;

      // Validate input using Zod schema
      const input: DynamoDBScan = DynamoDBScanSchema.parse({
        tableName: args.tableName,
        indexName: flags["index-name"],
        filterExpression: flags["filter-expression"],
        projectionExpression: flags["projection-expression"],
        expressionAttributeNames,
        expressionAttributeValues,
        exclusiveStartKey: flags["exclusive-start-key"],
        limit: flags.limit,
        consistentRead: flags["consistent-read"],
        segment: flags.segment,
        totalSegments: flags["total-segments"],
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      // Create DynamoDB service instance
      const dynamoService = new DynamoDBService({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          region: input.region,
          profile: input.profile,
        },
      });

      // Prepare scan parameters
      const scanParams: ScanParameters = {
        tableName: input.tableName,
        indexName: input.indexName,
        filterExpression: input.filterExpression,
        projectionExpression: input.projectionExpression,
        expressionAttributeNames,
        expressionAttributeValues,
        exclusiveStartKey,
        limit: input.limit,
        consistentRead: input.consistentRead,
        segment: input.segment,
        totalSegments: input.totalSegments,
      };

      // Execute scan operation
      const result = await dynamoService.scan(scanParams, {
        region: input.region,
        profile: input.profile,
      });

      // Format output based on requested format
      await this.formatAndDisplayOutput(result, input.format, input.tableName);
    } catch (error) {
      if (error instanceof SyntaxError && error.message.includes("JSON")) {
        this.error(`Invalid JSON in parameter: ${error.message}`, { exit: 1 });
      }

      const formattedError = formatErrorWithGuidance(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the scan results output
   *
   * @param result - Scan result to display
   * @param format - Output format to use
   * @param tableName - Name of the scanned table
   * @returns Promise resolving when output is complete
   * @internal
   */
  private async formatAndDisplayOutput(
    result: { items: Record<string, unknown>[]; lastEvaluatedKey?: Record<string, unknown>; count: number; scannedCount?: number },
    format: string,
    tableName: string
  ): Promise<void> {
    if (result.items.length === 0) {
      this.log(`No items found in table '${tableName}'.`);
      return;
    }

    switch (format) {
      case "table": {
        this.log(`\n=== Scan Results: ${tableName} ===`);
        this.log(`Items returned: ${result.count}`);
        if (result.scannedCount && result.scannedCount !== result.count) {
          this.log(`Items scanned: ${result.scannedCount}`);
        }
        this.log("");

        // Use DataProcessor for consistent table formatting
        const processor = new DataProcessor({ format: "table" });
        const output = processor.formatOutput(result.items);
        this.log(output);

        if (result.lastEvaluatedKey) {
          this.log("\nPagination available. Use --exclusive-start-key with:");
          this.log(JSON.stringify(result.lastEvaluatedKey, null, 2));
        }
        break;
      }

      case "json": {
        const output = {
          items: result.items,
          count: result.count,
          scannedCount: result.scannedCount,
          lastEvaluatedKey: result.lastEvaluatedKey,
        };
        this.log(JSON.stringify(output, null, 2));
        break;
      }

      case "jsonl": {
        for (const item of result.items) {
          this.log(JSON.stringify(item));
        }
        break;
      }

      case "csv": {
        const processor = new DataProcessor({ format: "csv" });
        const output = processor.formatOutput(result.items);
        this.log(output);
        break;
      }

      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }
}