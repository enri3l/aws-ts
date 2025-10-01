/**
 * @module dynamodb/query-index
 * DynamoDB query index command
 *
 * Performs efficient queries on a DynamoDB Global or Local Secondary Index
 * using key conditions with support for filtering, projection, and pagination.
 *
 */

import { Args, Flags } from "@oclif/core";
import { QueryParameterBuilder } from "../../lib/dynamodb-parameter-builders.js";
import type { DynamoDBQuery } from "../../lib/dynamodb-schemas.js";
import { DynamoDBQuerySchema } from "../../lib/dynamodb-schemas.js";
import { handleDynamoDBCommandError } from "../../lib/errors.js";
import { FormatterFactory } from "../../lib/formatters.js";
import { parseOptionalJson, parseRequiredJson } from "../../lib/parsing.js";
import { DynamoDBService } from "../../services/dynamodb-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * DynamoDB query index command for index querying
 *
 * Provides querying capabilities on Global and Local Secondary Indexes
 * using key condition expressions with filtering, projection, and pagination support.
 *
 * @public
 */
export default class DynamoDBQueryIndexCommand extends BaseCommand {
  static override readonly description = "Query a DynamoDB Global or Local Secondary Index";

  static override readonly examples = [
    {
      description: "Query a GSI by its partition key",
      command:
        "<%= config.bin %> <%= command.id %> my-table my-gsi --key-condition-expression 'gsi_pk = :pk' --expression-attribute-values '{\":pk\": \"STATUS#ACTIVE\"}'",
    },
    {
      description: "Query a GSI with partition key and sort key condition",
      command:
        '<%= config.bin %> <%= command.id %> my-table my-gsi --key-condition-expression \'gsi_pk = :pk AND gsi_sk BETWEEN :start AND :end\' --expression-attribute-values \'{":pk": "STATUS#ACTIVE", ":start": "2023-01-01", ":end": "2023-12-31"}\'',
    },
    {
      description: "Query LSI with filter expression",
      command:
        '<%= config.bin %> <%= command.id %> my-table my-lsi --key-condition-expression \'pk = :pk AND lsi_sk > :sk\' --filter-expression \'#status = :status\' --expression-attribute-names \'{"#status": "status"}\' --expression-attribute-values \'{":pk": "USER#123", ":sk": "2023-01-01", ":status": "ACTIVE"}\'',
    },
    {
      description: "Query GSI with projection expression",
      command:
        "<%= config.bin %> <%= command.id %> my-table my-gsi --key-condition-expression 'gsi_pk = :pk' --projection-expression 'id, #name, email' --expression-attribute-names '{\"#name\": \"name\"}' --expression-attribute-values '{\":pk\": \"STATUS#ACTIVE\"}'",
    },
    {
      description: "Query GSI in reverse order",
      command:
        "<%= config.bin %> <%= command.id %> my-table my-gsi --key-condition-expression 'gsi_pk = :pk' --expression-attribute-values '{\":pk\": \"STATUS#ACTIVE\"}' --no-scan-index-forward",
    },
    {
      description: "Query GSI with pagination",
      command:
        "<%= config.bin %> <%= command.id %> my-table my-gsi --key-condition-expression 'gsi_pk = :pk' --expression-attribute-values '{\":pk\": \"STATUS#ACTIVE\"}' --limit 20",
    },
  ];

  static override readonly args = {
    tableName: Args.string({
      name: "tableName",
      description: "Name of the DynamoDB table containing the index",
      required: true,
    }),
    indexName: Args.string({
      name: "indexName",
      description: "Name of the Global or Local Secondary Index to query",
      required: true,
    }),
  };

  static override readonly flags = {
    "key-condition-expression": Flags.string({
      description: "Key condition expression (required for queries)",
      helpValue: "EXPRESSION",
      required: true,
    }),

    "filter-expression": Flags.string({
      description: "Filter expression to apply after query",
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
      required: true,
    }),

    "exclusive-start-key": Flags.string({
      description: "Exclusive start key for pagination (JSON object)",
      helpValue: "JSON",
    }),

    limit: Flags.integer({
      char: "l",
      description: "Maximum number of items to return",
      min: 1,
      max: 10_000,
    }),

    "consistent-read": Flags.boolean({
      description: "Use consistent read (only for Local Secondary Indexes)",
      default: false,
    }),

    "scan-index-forward": Flags.boolean({
      description: "Scan index forward (ascending sort order)",
      default: true,
      allowNo: true,
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
      description: "Output format for query results",
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
   * Execute the DynamoDB query index command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(DynamoDBQueryIndexCommand);

    try {
      // Parse JSON inputs safely
      const expressionAttributeNames = parseOptionalJson(flags["expression-attribute-names"]);
      const expressionAttributeValues = parseRequiredJson(flags["expression-attribute-values"]);
      const exclusiveStartKey = parseOptionalJson(flags["exclusive-start-key"]);

      // Validate input using Zod schema (with indexName added)
      const input: DynamoDBQuery = DynamoDBQuerySchema.parse({
        tableName: args.tableName,
        indexName: args.indexName,
        keyConditionExpression: flags["key-condition-expression"],
        filterExpression: flags["filter-expression"],
        projectionExpression: flags["projection-expression"],
        expressionAttributeNames,
        expressionAttributeValues,
        exclusiveStartKey: flags["exclusive-start-key"],
        limit: flags.limit,
        consistentRead: flags["consistent-read"],
        scanIndexForward: flags["scan-index-forward"],
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
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      // Prepare query parameters
      const queryParameters = QueryParameterBuilder.build(
        input,
        expressionAttributeNames as Record<string, string> | undefined,
        expressionAttributeValues,
        exclusiveStartKey,
      );

      // Execute query operation
      const result = await dynamoService.query(queryParameters, {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      });

      // Format output based on requested format
      this.formatAndDisplayOutput(result, input.format, input.tableName, input.indexName);
    } catch (error) {
      const formattedError = handleDynamoDBCommandError(
        error,
        flags.verbose,
        "query index operation",
      );
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the query results output
   *
   * @param result - Query result containing items, count, and pagination info
   * @param format - Output format to use
   * @param tableName - Name of the queried table
   * @param indexName - Name of the queried index
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    result: {
      items: Record<string, unknown>[];
      lastEvaluatedKey?: Record<string, unknown>;
      count: number;
      scannedCount?: number;
    },
    format: string,
    tableName: string,
    indexName?: string,
  ): void {
    if (result.items.length === 0) {
      this.log(
        `No items found in index '${indexName}' of table '${tableName}' matching the query conditions.`,
      );
      return;
    }

    switch (format) {
      case "table": {
        this.log(`\n=== Query Results: ${tableName}.${indexName} ===`);
        this.log(`Items returned: ${result.count}`);
        if (result.scannedCount && result.scannedCount !== result.count) {
          this.log(`Items examined: ${result.scannedCount}`);
        }
        this.log("");

        // Use FormatterFactory for consistent table formatting
        const formatter = FormatterFactory.create("table", (message) => this.log(message));
        formatter.display({ items: result.items });

        if (result.lastEvaluatedKey) {
          this.log("\nPagination available. Use --exclusive-start-key with:");
          this.log(JSON.stringify(result.lastEvaluatedKey, undefined, 2));
        }
        break;
      }

      case "json": {
        const output = {
          items: result.items,
          count: result.count,
          scannedCount: result.scannedCount,
          lastEvaluatedKey: result.lastEvaluatedKey,
          indexName,
        };
        this.log(JSON.stringify(output, undefined, 2));
        break;
      }

      case "jsonl": {
        for (const item of result.items) {
          this.log(JSON.stringify(item));
        }
        break;
      }

      case "csv": {
        const formatter = FormatterFactory.create("csv", (message) => this.log(message));
        formatter.display({ items: result.items });
        break;
      }

      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }
}
