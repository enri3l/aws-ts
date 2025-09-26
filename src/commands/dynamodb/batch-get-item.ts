/**
 * DynamoDB batch get item command
 *
 * Retrieves multiple items efficiently from one or more DynamoDB tables
 * with automatic batching and retry handling.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { BatchGetCommand } from "@aws-sdk/lib-dynamodb";
import { DataProcessor } from "../../lib/data-processing.js";
import { formatErrorWithGuidance } from "../../lib/errors.js";
import type { DynamoDBBatchGetItem } from "../../lib/dynamodb-schemas.js";
import { DynamoDBBatchGetItemSchema } from "../../lib/dynamodb-schemas.js";
import { DynamoDBService } from "../../services/dynamodb-service.js";

/**
 * DynamoDB batch get item command for efficient multi-item retrieval
 *
 * Provides efficient batch retrieval capabilities for multiple items
 * across one or more tables with automatic retry handling.
 *
 * @public
 */
export default class DynamoDBBatchGetItemCommand extends Command {
  static override readonly description = "Get multiple items from DynamoDB tables in batch";

  static override readonly examples = [
    {
      description: "Batch get items using JSON request specification",
      command: "<%= config.bin %> <%= command.id %> '{\"my-table\": {\"Keys\": [{\"id\": \"user1\"}, {\"id\": \"user2\"}]}}'",
    },
    {
      description: "Batch get items from file",
      command: "<%= config.bin %> <%= command.id %> file://batch-request.json",
    },
    {
      description: "Batch get with projection expression",
      command: "<%= config.bin %> <%= command.id %> '{\"my-table\": {\"Keys\": [{\"id\": \"user1\"}], \"ProjectionExpression\": \"id, #name, email\", \"ExpressionAttributeNames\": {\"#name\": \"name\"}}}'",
    },
    {
      description: "Batch get with consistent reads",
      command: "<%= config.bin %> <%= command.id %> '{\"my-table\": {\"Keys\": [{\"id\": \"user1\"}], \"ConsistentRead\": true}}' --consistent-read",
    },
  ];

  static override readonly args = {
    requestItems: Args.string({
      name: "requestItems",
      description: "Request items specification as JSON string or file path (file://request.json)",
      required: true,
    }),
  };

  static override readonly flags = {
    "consistent-read": Flags.boolean({
      description: "Use consistent reads for all tables (can be overridden per table)",
      default: false,
    }),

    region: Flags.string({
      char: "r",
      description: "AWS region containing the tables",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for batch results",
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
   * Execute the DynamoDB batch get item command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(DynamoDBBatchGetItemCommand);

    try {
      // Parse request items input (JSON string or file path)
      let requestItemsObject: Record<string, unknown>;
      if (args.requestItems.startsWith("file://")) {
        const filePath = args.requestItems.replace("file://", "");
        const fs = await import("node:fs/promises");
        const fileContent = await fs.readFile(filePath, "utf-8");
        requestItemsObject = JSON.parse(fileContent);
      } else {
        requestItemsObject = JSON.parse(args.requestItems);
      }

      // Validate input using Zod schema
      const input: DynamoDBBatchGetItem = DynamoDBBatchGetItemSchema.parse({
        requestItems: args.requestItems,
        consistentRead: flags["consistent-read"],
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

      // Execute batch get operation
      const result = await this.executeBatchGetItem(
        dynamoService,
        requestItemsObject,
        input.consistentRead,
        {
          region: input.region,
          profile: input.profile,
        }
      );

      // Format output based on requested format
      await this.formatAndDisplayOutput(result, input.format);
    } catch (error) {
      if (error instanceof SyntaxError && error.message.includes("JSON")) {
        this.error(`Invalid JSON in request items parameter: ${error.message}`, { exit: 1 });
      }

      if (error instanceof Error && error.message.includes("ENOENT")) {
        this.error("Request items file not found. Ensure the file path is correct.", { exit: 1 });
      }

      const formattedError = formatErrorWithGuidance(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Execute batch get item operation with retry handling
   *
   * @param dynamoService - DynamoDB service instance
   * @param requestItems - Request items specification
   * @param consistentRead - Whether to use consistent reads
   * @param config - AWS client configuration
   * @returns Promise resolving to batch get results
   * @internal
   */
  private async executeBatchGetItem(
    dynamoService: DynamoDBService,
    requestItems: Record<string, unknown>,
    consistentRead: boolean,
    config: { region?: string; profile?: string }
  ): Promise<{
    responses: Record<string, Record<string, unknown>[]>;
    unprocessedKeys: Record<string, unknown>;
  }> {
    // Access private method to get document client
    // This is a workaround since we don't have a public batch get method in the service
    const docClient = await (dynamoService as any).getDocumentClient(config);

    // Apply consistent read to all tables if flag is set
    if (consistentRead) {
      for (const tableName in requestItems) {
        const tableRequest = requestItems[tableName] as any;
        if (!tableRequest.ConsistentRead) {
          tableRequest.ConsistentRead = true;
        }
      }
    }

    let allResponses: Record<string, Record<string, unknown>[]> = {};
    let currentRequestItems = { ...requestItems };
    let retryCount = 0;
    const maxRetries = 3;

    while (Object.keys(currentRequestItems).length > 0 && retryCount < maxRetries) {
      const command = new BatchGetCommand({
        RequestItems: currentRequestItems,
      });

      const response = await docClient.send(command);

      // Merge responses
      if (response.Responses) {
        for (const [tableName, items] of Object.entries(response.Responses)) {
          if (!allResponses[tableName]) {
            allResponses[tableName] = [];
          }
          allResponses[tableName].push(...items);
        }
      }

      // Handle unprocessed keys
      if (response.UnprocessedKeys && Object.keys(response.UnprocessedKeys).length > 0) {
        currentRequestItems = response.UnprocessedKeys;
        retryCount++;

        if (retryCount < maxRetries) {
          // Exponential backoff
          const delay = Math.pow(2, retryCount) * 100;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } else {
        currentRequestItems = {};
      }
    }

    return {
      responses: allResponses,
      unprocessedKeys: currentRequestItems,
    };
  }

  /**
   * Format and display the batch get results
   *
   * @param result - Batch get result to display
   * @param format - Output format to use
   * @returns Promise resolving when output is complete
   * @internal
   */
  private async formatAndDisplayOutput(
    result: {
      responses: Record<string, Record<string, unknown>[]>;
      unprocessedKeys: Record<string, unknown>;
    },
    format: string
  ): Promise<void> {
    const totalItems = Object.values(result.responses).reduce((sum, items) => sum + items.length, 0);

    if (totalItems === 0) {
      this.log("No items found matching the batch get request.");
      return;
    }

    switch (format) {
      case "table": {
        this.log(`\n=== Batch Get Results ===`);
        this.log(`Total items retrieved: ${totalItems}`);

        for (const [tableName, items] of Object.entries(result.responses)) {
          if (items.length > 0) {
            this.log(`\n--- Table: ${tableName} (${items.length} items) ---`);
            const processor = new DataProcessor({ format: "table" });
            const output = processor.formatOutput(items);
            this.log(output);
          }
        }

        if (Object.keys(result.unprocessedKeys).length > 0) {
          this.log("\nWarning: Some keys were not processed:");
          this.log(JSON.stringify(result.unprocessedKeys, null, 2));
        }
        break;
      }

      case "json": {
        const output = {
          responses: result.responses,
          totalItems,
          unprocessedKeys: Object.keys(result.unprocessedKeys).length > 0 ? result.unprocessedKeys : undefined,
        };
        this.log(JSON.stringify(output, null, 2));
        break;
      }

      case "jsonl": {
        for (const [tableName, items] of Object.entries(result.responses)) {
          for (const item of items) {
            this.log(JSON.stringify({ table: tableName, ...item }));
          }
        }
        break;
      }

      case "csv": {
        // For CSV, combine all items and add table name column
        const allItems: Record<string, unknown>[] = [];
        for (const [tableName, items] of Object.entries(result.responses)) {
          for (const item of items) {
            allItems.push({ __table: tableName, ...item });
          }
        }

        const processor = new DataProcessor({ format: "csv" });
        const output = processor.formatOutput(allItems);
        this.log(output);
        break;
      }

      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }
}