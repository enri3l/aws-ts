/**
 * DynamoDB batch write item command
 *
 * Performs bulk write operations (put/delete) to a DynamoDB table with
 * support for CSV import, automatic batching, and comprehensive retry logic.
 *
 */

import { BatchWriteCommand, type DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Args, Command, Flags } from "@oclif/core";
import { BatchProcessor } from "../../lib/batch-processor.js";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import type { DynamoDBBatchWriteItem } from "../../lib/dynamodb-schemas.js";
import { DynamoDBBatchWriteItemSchema } from "../../lib/dynamodb-schemas.js";
import { handleDynamoDBCommandError } from "../../lib/errors.js";
import { FormatterFactory } from "../../lib/formatters.js";
import { DynamoDBService } from "../../services/dynamodb-service.js";

interface BatchWriteResult {
  processedItems: number;
  failedItems: number;
  unprocessedItems: Record<string, unknown>[];
}

/**
 * Type guard for DynamoDB WriteRequest objects from UnprocessedItems
 *
 * @param request - Unknown request object from AWS SDK response
 * @returns True if request is a valid WriteRequest with PutRequest.Item
 */
function isWriteRequestWithPutItem(
  request: unknown,
): request is { PutRequest: { Item: Record<string, unknown> } } {
  if (typeof request !== "object" || request === null) {
    return false;
  }

  const requestObject = request as Record<string, unknown>;
  if (!("PutRequest" in requestObject)) {
    return false;
  }

  const putRequest = requestObject.PutRequest;
  if (typeof putRequest !== "object" || putRequest === null) {
    return false;
  }

  const putRequestObject = putRequest as Record<string, unknown>;
  if (!("Item" in putRequestObject)) {
    return false;
  }

  const item = putRequestObject.Item;
  return typeof item === "object" && item !== null && !Array.isArray(item);
}

/**
 * Safely extract items from AWS DynamoDB UnprocessedItems response
 *
 * @param unprocessedRequests - Array of WriteRequest objects from AWS SDK
 * @returns Array of extracted items
 */
function extractItemsFromUnprocessedRequests(
  unprocessedRequests: unknown[],
): Record<string, unknown>[] {
  return unprocessedRequests
    .filter((request) => isWriteRequestWithPutItem(request))
    .map((request) => request.PutRequest.Item);
}

/**
 * DynamoDB batch write item command for bulk operations
 *
 * Provides efficient bulk write capabilities with CSV import support,
 * automatic batching, and comprehensive retry handling for large datasets.
 *
 * @public
 */
export default class DynamoDBBatchWriteItemCommand extends Command {
  static override readonly description = "Batch write (put/delete) items to a DynamoDB table";

  static override readonly examples = [
    {
      description: "Batch write items from a CSV file",
      command: "<%= config.bin %> <%= command.id %> my-table data.csv",
    },
    {
      description: "Batch write from JSON file",
      command: "<%= config.bin %> <%= command.id %> my-table data.json",
    },
    {
      description: "Batch write from JSONL file with custom batch size",
      command: "<%= config.bin %> <%= command.id %> my-table data.jsonl --batch-size 10",
    },
    {
      description: "Batch write with custom concurrency",
      command: "<%= config.bin %> <%= command.id %> my-table data.csv --max-concurrency 5",
    },
    {
      description: "Batch write without retry on failures",
      command: "<%= config.bin %> <%= command.id %> my-table data.csv --no-enable-retry",
    },
  ];

  static override readonly args = {
    tableName: Args.string({
      name: "tableName",
      description: "Name of the DynamoDB table for batch write operations",
      required: true,
    }),
    inputFile: Args.string({
      name: "inputFile",
      description: "Input file path (CSV, JSON, or JSONL format)",
      required: true,
    }),
  };

  static override readonly flags = {
    "batch-size": Flags.integer({
      description: "Number of items per batch write request",
      min: 1,
      max: 25,
      default: 25,
    }),

    "max-concurrency": Flags.integer({
      description: "Maximum concurrent batch requests",
      min: 1,
      max: 20,
      default: 10,
    }),

    "enable-retry": Flags.boolean({
      description: "Enable retry for failed items",
      default: true,
      allowNo: true,
    }),

    "max-retries": Flags.integer({
      description: "Maximum retry attempts for failed items",
      min: 0,
      max: 10,
      default: 3,
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
      description: "Output format for results",
      options: ["table", "json"],
      default: "table",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the DynamoDB batch write item command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(DynamoDBBatchWriteItemCommand);

    try {
      // Validate input using Zod schema
      const input: DynamoDBBatchWriteItem = DynamoDBBatchWriteItemSchema.parse({
        tableName: args.tableName,
        inputFile: args.inputFile,
        batchSize: flags["batch-size"],
        maxConcurrency: flags["max-concurrency"],
        enableRetry: flags["enable-retry"],
        maxRetries: flags["max-retries"],
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

      // Load and process input file
      const items = await this.loadInputFile(input.inputFile);

      if (items.length === 0) {
        this.log("No items found in input file.");
        return;
      }

      this.log(`Loaded ${items.length} items from ${input.inputFile}`);

      // Execute batch write operations
      const result = await this.executeBatchWriteOperations(
        dynamoService,
        input.tableName,
        items,
        input,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      // Format output based on requested format
      const formatter = FormatterFactory.create(input.format, (message) => this.log(message));
      formatter.display(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes("ENOENT")) {
        this.error("Input file not found. Ensure the file path is correct.", { exit: 1 });
      }

      const formattedError = handleDynamoDBCommandError(
        error,
        flags.verbose,
        "batch write item operation",
      );
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Load and parse input file based on format
   *
   * @param filePath - Path to the input file
   * @returns Promise resolving to array of items
   * @internal
   */
  private async loadInputFile(filePath: string): Promise<Record<string, unknown>[]> {
    const fs = await import("node:fs/promises");
    const { default: path } = await import("node:path");

    const fileExtension = path.extname(filePath).toLowerCase();
    const fileContent = await fs.readFile(filePath, "utf8");

    let format: DataFormat;
    switch (fileExtension) {
      case ".csv": {
        format = DataFormat.CSV;
        break;
      }
      case ".json": {
        format = DataFormat.JSON;
        break;
      }
      case ".jsonl": {
        format = DataFormat.JSONL;
        break;
      }
      default: {
        throw new Error(
          `Unsupported file format: ${fileExtension}. Supported formats: .csv, .json, .jsonl`,
        );
      }
    }

    const processor = new DataProcessor({ format });
    const result = processor.parseInput(fileContent, format);
    return result.records.map((record) => record.data);
  }

  /**
   * Execute batch write operations with batching and retry logic
   *
   * @param dynamoService - DynamoDB service instance
   * @param tableName - Name of the target table
   * @param items - Items to write
   * @param options - Batch write options
   * @param config - AWS client configuration with optional region and profile settings
   * @returns Promise resolving to batch write results
   * @throws Error When AWS operation fails or document client cannot be created
   * @internal
   */
  private async executeBatchWriteOperations(
    dynamoService: DynamoDBService,
    tableName: string,
    items: Record<string, unknown>[],
    options: DynamoDBBatchWriteItem,
    config: { region?: string; profile?: string },
  ): Promise<BatchWriteResult> {
    // Get document client for batch operations
    const documentClient = await dynamoService.getDocumentClient(config);

    // Create batch processor
    const processor = new BatchProcessor<Record<string, unknown>>(
      {
        maxRetries: options.maxRetries,
        batchSize: options.batchSize,
        maxConcurrency: options.maxConcurrency,
        verbose: options.verbose,
      },
      (message) => this.log(message),
    );

    // Execute batch processing with DynamoDB-specific logic
    const result = await processor.process(items, async (batch) => {
      return this.executeSingleBatch(documentClient, tableName, batch);
    });

    return {
      processedItems: result.processed.length,
      failedItems: result.failed.length,
      unprocessedItems: result.failed,
    };
  }

  /**
   * Execute a single batch write operation
   *
   * @param documentClient - DynamoDB document client
   * @param tableName - Name of the target table
   * @param batchItems - Items in this batch
   * @returns Promise resolving to batch processing result
   * @internal
   */
  private async executeSingleBatch(
    documentClient: DynamoDBDocumentClient,
    tableName: string,
    batchItems: Record<string, unknown>[],
  ): Promise<{ processed: Record<string, unknown>[]; unprocessed: Record<string, unknown>[] }> {
    // Prepare request items for batch write
    const requestItems = {
      [tableName]: batchItems.map((item) => ({
        PutRequest: { Item: item },
      })),
    };

    const command = new BatchWriteCommand({
      RequestItems: requestItems,
    });

    const response = await documentClient.send(command);

    // Handle unprocessed items
    let unprocessedItems: Record<string, unknown>[] = [];
    if (response.UnprocessedItems && response.UnprocessedItems[tableName]) {
      const unprocessedRequests = response.UnprocessedItems[tableName];
      if (Array.isArray(unprocessedRequests)) {
        unprocessedItems = extractItemsFromUnprocessedRequests(unprocessedRequests);
      }
    }

    // Calculate processed items (original - unprocessed)
    const processedItems = batchItems.slice(0, batchItems.length - unprocessedItems.length);

    return {
      processed: processedItems,
      unprocessed: unprocessedItems,
    };
  }
}
