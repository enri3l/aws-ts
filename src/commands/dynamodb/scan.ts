/**
 * DynamoDB scan table command
 *
 * Performs full table or index scans with support for filtering,
 * projection, and pagination with multiple output formats.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { ScanParameterBuilder } from "../../lib/dynamodb-parameter-builders.js";
import type { DynamoDBScan } from "../../lib/dynamodb-schemas.js";
import { DynamoDBScanSchema } from "../../lib/dynamodb-schemas.js";
import { handleDynamoDBCommandError } from "../../lib/errors.js";
import { FormatterFactory } from "../../lib/formatters.js";
import { parseOptionalJson } from "../../lib/parsing.js";
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
      command:
        '<%= config.bin %> <%= command.id %> my-table --filter-expression \'#status = :active\' --expression-attribute-names \'{"#status": "status"}\' --expression-attribute-values \'{":active": "ACTIVE"}\'',
    },
    {
      description: "Scan with projection expression to select specific attributes",
      command:
        "<%= config.bin %> <%= command.id %> my-table --projection-expression 'id, #name, email' --expression-attribute-names '{\"#name\": \"name\"}'",
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
      max: 10_000,
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
      max: 1_000_000,
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
      // Parse optional JSON inputs with safe parsing
      const expressionAttributeNames = parseOptionalJson(flags["expression-attribute-names"]);
      const expressionAttributeValues = parseOptionalJson(flags["expression-attribute-values"]);
      const exclusiveStartKey = parseOptionalJson(flags["exclusive-start-key"]);

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
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      // Prepare scan parameters
      const scanParameters = ScanParameterBuilder.build(
        input,
        expressionAttributeNames as Record<string, string> | undefined,
        expressionAttributeValues,
        exclusiveStartKey,
      );

      // Execute scan operation
      const result = await dynamoService.scan(scanParameters, {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      });

      // Format output based on requested format
      if (result.items.length === 0) {
        this.log(`No items found in table '${input.tableName}'.`);
      } else {
        const formatter = FormatterFactory.create(input.format, (message) => this.log(message));
        formatter.display(result);
      }
    } catch (error) {
      const formattedError = handleDynamoDBCommandError(error, flags.verbose, "scan operation");
      this.error(formattedError, { exit: 1 });
    }
  }
}
