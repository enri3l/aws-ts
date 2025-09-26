/**
 * Output formatting utilities for DynamoDB commands
 *
 * Provides Strategy pattern implementation for different output formats
 * to reduce cognitive complexity in command classes.
 *
 * @file Centralized output formatting with Strategy pattern
 */

import { DataFormat, DataProcessor } from "./data-processing.js";

/**
 * Base interface for all output formatters
 */
export interface Formatter {
  /**
   * Display the formatted output
   *
   * @param data - Data to format and display
   */
  display(data: unknown): void;
}

/**
 * Base formatter with common functionality
 */
abstract class BaseFormatter implements Formatter {
  constructor(protected readonly logger: (message: string) => void) {}

  abstract display(data: unknown): void;
}

/**
 * Table formatter for human-readable output
 */
export class TableFormatter extends BaseFormatter {
  /**
   *
   */
  display(data: unknown): void {
    if (this.isBatchGetResult(data)) {
      this.displayBatchGetResult(data);
    } else if (this.isBatchWriteResult(data)) {
      this.displayBatchWriteResult(data);
    } else if (this.isSingleItemResult(data)) {
      this.displaySingleItem(data);
    } else {
      this.logger("No data to display.");
    }
  }

  private displayBatchGetResult(result: {
    responses: Record<string, Record<string, unknown>[]>;
    unprocessedKeys: Record<string, unknown>;
  }): void {
    const totalItems = Object.values(result.responses).reduce(
      (sum, items) => sum + items.length,
      0,
    );

    if (totalItems === 0) {
      this.logger("No items found matching the batch get request.");
      return;
    }

    this.logger(`\n=== Batch Get Results ===`);
    this.logger(`Total items retrieved: ${totalItems}`);

    for (const [tableName, items] of Object.entries(result.responses)) {
      if (items.length > 0) {
        this.logger(`\n--- Table: ${tableName} (${items.length} items) ---`);
        const processor = new DataProcessor({ format: DataFormat.CSV });
        const output = processor.formatOutput(items.map((item, index) => ({ data: item, index })));
        this.logger(output);
      }
    }

    if (Object.keys(result.unprocessedKeys).length > 0) {
      this.logger("\nWarning: Some keys were not processed:");
      this.logger(JSON.stringify(result.unprocessedKeys, undefined, 2));
    }
  }

  private displayBatchWriteResult(result: {
    processedItems: number;
    failedItems: number;
    unprocessedItems: Record<string, unknown>[];
  }): void {
    const total = result.processedItems + result.failedItems;

    this.logger(`\n=== Batch Write Results ===`);
    this.logger(`Total items: ${total}`);
    this.logger(`Successfully processed: ${result.processedItems}`);
    this.logger(`Failed items: ${result.failedItems}`);

    if (result.failedItems > 0) {
      this.logger(`Success rate: ${((result.processedItems / total) * 100).toFixed(1)}%`);
    } else {
      this.logger("✅ All items processed successfully!");
    }

    if (result.unprocessedItems.length > 0) {
      this.logger(`\nFirst few unprocessed items:`);
      const sampleItems = result.unprocessedItems.slice(0, 3);
      for (const [index, item] of sampleItems.entries()) {
        this.logger(`${index + 1}. ${JSON.stringify(item)}`);
      }
    }
  }

  private displaySingleItem(item: Record<string, unknown>): void {
    this.logger("\n=== Item Retrieved ===");
    const processor = new DataProcessor({ format: DataFormat.CSV });
    const output = processor.formatOutput([{ data: item, index: 0 }]);
    this.logger(output);
  }

  private isBatchGetResult(data: unknown): data is {
    responses: Record<string, Record<string, unknown>[]>;
    unprocessedKeys: Record<string, unknown>;
  } {
    return (
      typeof data === "object" && data !== null && "responses" in data && "unprocessedKeys" in data
    );
  }

  private isBatchWriteResult(data: unknown): data is {
    processedItems: number;
    failedItems: number;
    unprocessedItems: Record<string, unknown>[];
  } {
    return (
      typeof data === "object" &&
      data !== null &&
      "processedItems" in data &&
      "failedItems" in data &&
      "unprocessedItems" in data
    );
  }

  private isSingleItemResult(data: unknown): data is Record<string, unknown> {
    return typeof data === "object" && data !== null && !Array.isArray(data);
  }
}

/**
 * JSON formatter for machine-readable output
 */
export class JsonFormatter extends BaseFormatter {
  /**
   *
   */
  display(data: unknown): void {
    this.logger(JSON.stringify(data, undefined, 2));
  }
}

/**
 * Factory for creating formatters
 */
export const FormatterFactory = {
  /**
   * Create a formatter instance based on the format type
   *
   * @param format - Output format type
   * @param logger - Logger function for output
   * @returns Formatter instance
   * @throws Error for unsupported formats
   */
  create(format: string, logger: (message: string) => void): Formatter {
    switch (format) {
      case "table": {
        return new TableFormatter(logger);
      }
      case "json": {
        return new JsonFormatter(logger);
      }
      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  },
};
