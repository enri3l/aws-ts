/**
 * DynamoDB batch write item command
 *
 * Performs bulk write operations (put/delete) to a DynamoDB table with
 * support for CSV import, automatic batching, and comprehensive retry logic.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { BatchWriteCommand } from "@aws-sdk/lib-dynamodb";
import { DataProcessor, type DataFormat } from "../../lib/data-processing.js";
import { formatErrorWithGuidance } from "../../lib/errors.js";
import type { DynamoDBBatchWriteItem } from "../../lib/dynamodb-schemas.js";
import { DynamoDBBatchWriteItemSchema } from "../../lib/dynamodb-schemas.js";
import { DynamoDBService } from "../../services/dynamodb-service.js";

interface BatchWriteResult {
  processedItems: number;
  failedItems: number;
  unprocessedItems: Record<string, unknown>[];
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
          region: input.region,
          profile: input.profile,
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
          region: input.region,
          profile: input.profile,
        }
      );

      // Format output based on requested format
      await this.formatAndDisplayOutput(result, input.format);
    } catch (error) {
      if (error instanceof Error && error.message.includes("ENOENT")) {
        this.error("Input file not found. Ensure the file path is correct.", { exit: 1 });
      }

      const formattedError = formatErrorWithGuidance(error, flags.verbose);
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
    const path = await import("node:path");

    const fileExtension = path.extname(filePath).toLowerCase();
    const fileContent = await fs.readFile(filePath, "utf-8");

    let format: DataFormat;
    switch (fileExtension) {
      case ".csv":
        format = "csv";
        break;
      case ".json":
        format = "json";
        break;
      case ".jsonl":
        format = "jsonl";
        break;
      default:
        throw new Error(`Unsupported file format: ${fileExtension}. Supported formats: .csv, .json, .jsonl`);
    }

    const processor = new DataProcessor({ format });
    return processor.parseInput(fileContent) as Record<string, unknown>[];
  }

  /**
   * Execute batch write operations with batching and retry logic
   *
   * @param dynamoService - DynamoDB service instance
   * @param tableName - Name of the target table
   * @param items - Items to write
   * @param options - Batch write options
   * @param config - AWS client configuration
   * @returns Promise resolving to batch write results
   * @internal
   */
  private async executeBatchWriteOperations(
    dynamoService: DynamoDBService,
    tableName: string,
    items: Record<string, unknown>[],
    options: DynamoDBBatchWriteItem,
    config: { region?: string; profile?: string }
  ): Promise<BatchWriteResult> {
    // Access private method to get document client
    const docClient = await (dynamoService as any).getDocumentClient(config);

    let processedItems = 0;
    let failedItems = 0;
    const allUnprocessedItems: Record<string, unknown>[] = [];

    // Create batches
    const batches: Record<string, unknown>[][] = [];
    for (let i = 0; i < items.length; i += options.batchSize) {
      batches.push(items.slice(i, i + options.batchSize));
    }

    this.log(`Processing ${batches.length} batches of up to ${options.batchSize} items each...`);

    // Process batches with controlled concurrency
    const batchPromises: Promise<void>[] = [];
    const semaphore = new Array(options.maxConcurrency).fill(0);

    for (let i = 0; i < batches.length; i++) {
      const batchPromise = this.processSingleBatch(
        docClient,
        tableName,
        batches[i],
        i + 1,
        batches.length,
        options
      ).then(result => {
        processedItems += result.processed;
        failedItems += result.failed;
        allUnprocessedItems.push(...result.unprocessed);
      });

      batchPromises.push(batchPromise);

      // Control concurrency
      if (batchPromises.length >= options.maxConcurrency || i === batches.length - 1) {
        await Promise.all(batchPromises.splice(0, batchPromises.length));
      }
    }

    return {
      processedItems,
      failedItems,
      unprocessedItems: allUnprocessedItems,
    };
  }

  /**
   * Process a single batch with retry logic
   *
   * @param docClient - DynamoDB document client
   * @param tableName - Name of the target table
   * @param batchItems - Items in this batch
   * @param batchNum - Batch number for progress reporting
   * @param totalBatches - Total number of batches
   * @param options - Batch write options
   * @returns Promise resolving to batch processing result
   * @internal
   */
  private async processSingleBatch(
    docClient: any,
    tableName: string,
    batchItems: Record<string, unknown>[],
    batchNum: number,
    totalBatches: number,
    options: DynamoDBBatchWriteItem
  ): Promise<{ processed: number; failed: number; unprocessed: Record<string, unknown>[] }> {
    let currentItems = [...batchItems];
    let retryCount = 0;
    let processed = 0;

    while (currentItems.length > 0 && retryCount <= options.maxRetries) {
      try {
        // Prepare request items for batch write
        const requestItems = {
          [tableName]: currentItems.map(item => ({
            PutRequest: { Item: item }
          }))
        };

        const command = new BatchWriteCommand({
          RequestItems: requestItems,
        });

        const response = await docClient.send(command);
        const initialCount = currentItems.length;

        // Handle unprocessed items
        if (response.UnprocessedItems && response.UnprocessedItems[tableName]) {
          currentItems = response.UnprocessedItems[tableName].map((req: any) => req.PutRequest.Item);
          processed += initialCount - currentItems.length;
        } else {
          processed += currentItems.length;
          currentItems = [];
        }

        if (options.verbose) {
          this.log(`Batch ${batchNum}/${totalBatches}: Processed ${processed}/${batchItems.length} items`);
        }

        if (currentItems.length > 0 && options.enableRetry && retryCount < options.maxRetries) {
          retryCount++;
          // Exponential backoff with jitter
          const delay = Math.min(1000 * Math.pow(2, retryCount) + Math.random() * 1000, 30000);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          break;
        }
      } catch (error) {
        if (options.verbose) {
          this.log(`Batch ${batchNum}/${totalBatches} failed: ${error instanceof Error ? error.message : String(error)}`);
        }

        if (options.enableRetry && retryCount < options.maxRetries) {
          retryCount++;
          const delay = Math.min(1000 * Math.pow(2, retryCount), 30000);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          break;
        }
      }
    }

    const failed = currentItems.length;
    if (failed > 0 && options.verbose) {
      this.log(`Batch ${batchNum}/${totalBatches}: ${failed} items failed after ${retryCount} retries`);
    }

    return {
      processed,
      failed,
      unprocessed: currentItems,
    };
  }

  /**
   * Format and display the batch write results
   *
   * @param result - Batch write result to display
   * @param format - Output format to use
   * @returns Promise resolving when output is complete
   * @internal
   */
  private async formatAndDisplayOutput(result: BatchWriteResult, format: string): Promise<void> {
    const total = result.processedItems + result.failedItems;

    switch (format) {
      case "table": {
        this.log(`\n=== Batch Write Results ===`);
        this.log(`Total items: ${total}`);
        this.log(`Successfully processed: ${result.processedItems}`);
        this.log(`Failed items: ${result.failedItems}`);

        if (result.failedItems > 0) {
          this.log(`Success rate: ${((result.processedItems / total) * 100).toFixed(1)}%`);
        } else {
          this.log("✅ All items processed successfully!");
        }

        if (result.unprocessedItems.length > 0) {
          this.log(`\nFirst few unprocessed items:`);
          const sampleItems = result.unprocessedItems.slice(0, 3);
          for (const [index, item] of sampleItems.entries()) {
            this.log(`${index + 1}. ${JSON.stringify(item)}`);
          }
        }
        break;
      }

      case "json": {
        const output = {
          total,
          processedItems: result.processedItems,
          failedItems: result.failedItems,
          successRate: result.failedItems > 0 ? (result.processedItems / total) * 100 : 100,
          unprocessedItems: result.unprocessedItems.length > 0 ? result.unprocessedItems : undefined,
        };
        this.log(JSON.stringify(output, null, 2));
        break;
      }

      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }
}