/**
 * Batch processing utility for DynamoDB operations
 *
 * Provides centralized retry logic, exponential backoff, and batch management
 * for DynamoDB batch operations to reduce cognitive complexity in commands.
 *
 * @file Centralized batch processing with retry logic
 */

/**
 * Configuration options for batch processing
 */
export interface BatchProcessorOptions {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Number of items per batch */
  batchSize: number;
  /** Maximum concurrent batch requests */
  maxConcurrency: number;
  /** Enable verbose logging */
  verbose: boolean;
}

/**
 * Result of processing a single batch
 */
export interface BatchResult<T, R = T> {
  /** Successfully processed items */
  processed: R[];
  /** Items that failed processing (remain as original input type) */
  unprocessed: T[];
  /** Processing metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Executor function for processing a single batch
 */
export type BatchExecutor<T, R> = (batch: T[]) => Promise<BatchResult<T, R>>;

/**
 * Generic batch processor with retry logic and concurrency control
 *
 * Handles batching, retry logic with exponential backoff, and concurrent
 * processing for DynamoDB operations to reduce complexity in command classes.
 *
 * @remarks
 * This class implements the architectural pattern of extracting complex batch
 * processing logic from individual DynamoDB commands. It centralizes retry
 * logic, exponential backoff, and concurrency control to reduce cognitive
 * complexity in command implementations and ensure consistent behavior
 * across all batch operations.
 *
 * @typeParam T - Type of input items
 * @typeParam R - Type of result items
 */
export class BatchProcessor<T, R = T> {
  /**
   * Create a new batch processor instance
   *
   * @param options - Configuration options for batch processing
   * @param logger - Optional logger function for progress messages
   */
  constructor(
    private readonly options: BatchProcessorOptions,
    private readonly logger?: (message: string) => void,
  ) {}

  /**
   * Process items in batches with retry logic
   *
   * @param items - Items to process
   * @param executor - Function to execute a single batch
   * @returns Promise resolving to aggregated results
   */
  async process(
    items: T[],
    executor: BatchExecutor<T, R>,
  ): Promise<{
    processed: R[];
    failed: T[];
    totalBatches: number;
  }> {
    const batches = this.createBatches(items);
    const allProcessed: R[] = [];
    const allFailed: T[] = [];

    this.log(
      `Processing ${batches.length} batches of up to ${this.options.batchSize} items each...`,
    );

    // Process batches with controlled concurrency
    const batchPromises: Promise<void>[] = [];

    for (let index = 0; index < batches.length; index++) {
      const batchPromise = this.processSingleBatch(
        batches[index]!,
        index + 1,
        batches.length,
        executor,
      ).then((result) => {
        allProcessed.push(...result.processed);
        allFailed.push(...result.failed);
      });

      batchPromises.push(batchPromise);

      // Control concurrency
      if (batchPromises.length >= this.options.maxConcurrency || index === batches.length - 1) {
        await Promise.all(batchPromises.splice(0));
      }
    }

    return {
      processed: allProcessed,
      failed: allFailed,
      totalBatches: batches.length,
    };
  }

  /**
   * Process a single batch with retry logic
   *
   * @param batch - Items in this batch
   * @param batchNumber - Batch number for logging
   * @param totalBatches - Total number of batches
   * @param executor - Function to execute the batch
   * @returns Promise resolving to batch results
   */
  private async processSingleBatch(
    batch: T[],
    batchNumber: number,
    totalBatches: number,
    executor: BatchExecutor<T, R>,
  ): Promise<{ processed: R[]; failed: T[] }> {
    let currentItems = [...batch];
    let retryCount = 0;
    const allProcessed: R[] = [];

    while (currentItems.length > 0 && retryCount <= this.options.maxRetries) {
      const attemptResult = await this.executeAttempt(
        currentItems,
        batchNumber,
        totalBatches,
        executor,
      );

      if (attemptResult.success) {
        allProcessed.push(...attemptResult.processed);
        currentItems = attemptResult.unprocessed;
        this.logProgress(batchNumber, totalBatches, allProcessed.length, batch.length);
      } else {
        this.logError(batchNumber, totalBatches, attemptResult.error);
      }

      if (!this.shouldRetry(currentItems.length, retryCount)) {
        break;
      }

      retryCount++;
      await this.waitWithExponentialBackoff(retryCount);
    }

    this.logFinalResult(batchNumber, totalBatches, currentItems.length, retryCount);

    return {
      processed: allProcessed,
      failed: currentItems,
    };
  }

  /**
   * Execute a single attempt for a batch
   *
   * @param items - Items to process
   * @param batchNumber - Batch number for logging
   * @param totalBatches - Total number of batches
   * @param executor - Function to execute the batch
   * @returns Attempt result
   * @internal
   */
  private async executeAttempt(
    items: T[],
    batchNumber: number,
    totalBatches: number,
    executor: BatchExecutor<T, R>,
  ): Promise<{
    success: boolean;
    processed: R[];
    unprocessed: T[];
    error?: unknown;
  }> {
    try {
      const result = await executor(items);
      return {
        success: true,
        processed: result.processed,
        unprocessed: result.unprocessed,
      };
    } catch (error) {
      return {
        success: false,
        processed: [],
        unprocessed: items,
        error,
      };
    }
  }

  /**
   * Determine if retry should continue
   *
   * @param remainingItems - Number of remaining items
   * @param retryCount - Current retry count
   * @returns True if should retry
   * @internal
   */
  private shouldRetry(remainingItems: number, retryCount: number): boolean {
    return remainingItems > 0 && retryCount < this.options.maxRetries;
  }

  /**
   * Log progress if verbose mode is enabled
   *
   * @param batchNumber - Batch number
   * @param totalBatches - Total number of batches
   * @param processedCount - Number of processed items
   * @param totalCount - Total number of items in batch
   * @internal
   */
  private logProgress(
    batchNumber: number,
    totalBatches: number,
    processedCount: number,
    totalCount: number,
  ): void {
    if (this.options.verbose) {
      this.log(
        `Batch ${batchNumber}/${totalBatches}: Processed ${processedCount}/${totalCount} items`,
      );
    }
  }

  /**
   * Log error if verbose mode is enabled
   *
   * @param batchNumber - Batch number
   * @param totalBatches - Total number of batches
   * @param error - Error that occurred
   * @internal
   */
  private logError(batchNumber: number, totalBatches: number, error: unknown): void {
    if (this.options.verbose) {
      this.log(
        `Batch ${batchNumber}/${totalBatches} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Log final result if verbose mode is enabled
   *
   * @param batchNumber - Batch number
   * @param totalBatches - Total number of batches
   * @param failedCount - Number of failed items
   * @param retryCount - Number of retries attempted
   * @internal
   */
  private logFinalResult(
    batchNumber: number,
    totalBatches: number,
    failedCount: number,
    retryCount: number,
  ): void {
    if (failedCount > 0 && this.options.verbose) {
      this.log(
        `Batch ${batchNumber}/${totalBatches}: ${failedCount} items failed after ${retryCount} retries`,
      );
    }
  }

  /**
   * Create batches from items array
   *
   * @param items - Items to batch
   * @returns Array of batches
   */
  private createBatches(items: T[]): T[][] {
    const batches: T[][] = [];
    for (let index = 0; index < items.length; index += this.options.batchSize) {
      batches.push(items.slice(index, index + this.options.batchSize));
    }
    return batches;
  }

  /**
   * Wait with exponential backoff and jitter
   *
   * @param retryCount - Current retry attempt
   */
  private async waitWithExponentialBackoff(retryCount: number): Promise<void> {
    // Exponential backoff with jitter
    // eslint-disable-next-line sonarjs/pseudo-random -- Math.random is acceptable for adding jitter to a backoff delay
    const delay = Math.min(1000 * Math.pow(2, retryCount) + Math.random() * 1000, 30_000);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * Log message if logger is provided
   *
   * @param message - Message to log
   */
  private log(message: string): void {
    if (this.logger) {
      this.logger(message);
    }
  }
}
