/**
 * DynamoDB-specific error types for AWS CLI operations
 *
 * Extends the base error system with DynamoDB-specific error handling
 * for table operations, queries, scans, and item manipulations.
 *
 */

import { BaseError } from "./errors.js";

/**
 * DynamoDB error for general DynamoDB operation failures
 *
 * Used when DynamoDB operations fail, including service errors,
 * configuration issues, and API-level failures.
 *
 * @public
 */
export class DynamoDBError extends BaseError {
  /**
   * Create a new DynamoDB error
   *
   * @param message - User-friendly DynamoDB error message
   * @param operation - The DynamoDB operation that failed
   * @param tableName - The table involved in the operation
   * @param cause - The underlying error that caused the DynamoDB failure
   * @param metadata - Additional DynamoDB context
   */
  constructor(
    message: string,
    operation?: string,
    tableName?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "DYNAMODB_ERROR", {
      operation,
      tableName,
      cause,
      ...metadata,
    });
  }
}

/**
 * Table error for DynamoDB table-specific failures
 *
 * Used when table operations fail, including table not found,
 * table status issues, and schema validation failures.
 *
 * @public
 */
export class TableError extends BaseError {
  /**
   * Create a new table error
   *
   * @param message - User-friendly table error message
   * @param tableName - The table that encountered the error
   * @param operation - The table operation that failed
   * @param tableStatus - The current table status if available
   * @param metadata - Additional table context
   */
  constructor(
    message: string,
    tableName?: string,
    operation?: string,
    tableStatus?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "TABLE_ERROR", {
      tableName,
      operation,
      tableStatus,
      ...metadata,
    });
  }
}

/**
 * Query error for DynamoDB query operation failures
 *
 * Used when query operations fail, including invalid key conditions,
 * filter expressions, and index access issues.
 *
 * @public
 */
export class QueryError extends BaseError {
  /**
   * Create a new query error
   *
   * @param message - User-friendly query error message
   * @param tableName - The table being queried
   * @param indexName - The index being queried (if applicable)
   * @param keyCondition - The key condition expression used
   * @param cause - The underlying error that caused the query failure
   * @param metadata - Additional query context
   */
  constructor(
    message: string,
    tableName?: string,
    indexName?: string,
    keyCondition?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "QUERY_ERROR", {
      tableName,
      indexName,
      keyCondition,
      cause,
      ...metadata,
    });
  }
}

/**
 * Scan error for DynamoDB scan operation failures
 *
 * Used when scan operations fail, including filter expression issues,
 * segment configuration problems, and large dataset handling.
 *
 * @public
 */
export class ScanError extends BaseError {
  /**
   * Create a new scan error
   *
   * @param message - User-friendly scan error message
   * @param tableName - The table being scanned
   * @param indexName - The index being scanned (if applicable)
   * @param filterExpression - The filter expression used (if any)
   * @param cause - The underlying error that caused the scan failure
   * @param metadata - Additional scan context
   */
  constructor(
    message: string,
    tableName?: string,
    indexName?: string,
    filterExpression?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "SCAN_ERROR", {
      tableName,
      indexName,
      filterExpression,
      cause,
      ...metadata,
    });
  }
}

/**
 * Item error for DynamoDB item operation failures
 *
 * Used when item-level operations fail, including get, put, update, delete,
 * condition expression failures, and data validation issues.
 *
 * @public
 */
export class ItemError extends BaseError {
  /**
   * Create a new item error
   *
   * @param message - User-friendly item error message
   * @param tableName - The table containing the item
   * @param operation - The item operation that failed
   * @param itemKey - The primary key of the item (if applicable)
   * @param conditionExpression - The condition expression used (if any)
   * @param cause - The underlying error that caused the item operation failure
   * @param metadata - Additional item context
   */
  constructor(
    message: string,
    tableName?: string,
    operation?: string,
    itemKey?: Record<string, unknown>,
    conditionExpression?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "ITEM_ERROR", {
      tableName,
      operation,
      itemKey,
      conditionExpression,
      cause,
      ...metadata,
    });
  }
}

/**
 * Expression error for DynamoDB expression-related failures
 *
 * Used when expression parsing, validation, or execution fails,
 * including attribute name/value mapping issues.
 *
 * @public
 */
export class ExpressionError extends BaseError {
  /**
   * Create a new expression error
   *
   * @param message - User-friendly expression error message
   * @param expressionType - The type of expression that failed
   * @param expression - The expression that caused the error
   * @param attributeNames - Expression attribute names used
   * @param attributeValues - Expression attribute values used
   * @param metadata - Additional expression context
   */
  constructor(
    message: string,
    expressionType?: string,
    expression?: string,
    attributeNames?: Record<string, string>,
    attributeValues?: Record<string, unknown>,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "EXPRESSION_ERROR", {
      expressionType,
      expression,
      attributeNames,
      attributeValues,
      ...metadata,
    });
  }
}

/**
 * Batch operation error for DynamoDB batch operation failures
 *
 * Used when batch operations fail, including batch size limits,
 * partial failures, and retry exhaustion.
 *
 * @public
 */
export class BatchOperationError extends BaseError {
  /**
   * Create a new batch operation error
   *
   * @param message - User-friendly batch operation error message
   * @param operation - The batch operation that failed
   * @param processedItems - Number of items successfully processed
   * @param failedItems - Number of items that failed processing
   * @param unprocessedItems - Items that were not processed
   * @param cause - The underlying error that caused the batch failure
   * @param metadata - Additional batch operation context
   */
  constructor(
    message: string,
    operation?: string,
    processedItems?: number,
    failedItems?: number,
    unprocessedItems?: Record<string, unknown>[],
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "BATCH_OPERATION_ERROR", {
      operation,
      processedItems,
      failedItems,
      unprocessedItems,
      cause,
      ...metadata,
    });
  }
}

/**
 * Check if an error is a DynamoDB-related error
 *
 * @param error - The error to check
 * @returns True if the error is DynamoDB-related
 *
 * @public
 */
export function isDynamoDBError(
  error: unknown,
): error is DynamoDBError | TableError | QueryError | ScanError | ItemError | ExpressionError | BatchOperationError {
  return (
    error instanceof DynamoDBError ||
    error instanceof TableError ||
    error instanceof QueryError ||
    error instanceof ScanError ||
    error instanceof ItemError ||
    error instanceof ExpressionError ||
    error instanceof BatchOperationError
  );
}

/**
 * Get user-friendly guidance for DynamoDB errors
 *
 * @param error - The error to provide guidance for
 * @returns User-friendly guidance message
 *
 * @public
 */
export function getDynamoDBErrorGuidance(error: unknown): string {
  if (isDynamoDBError(error)) {
    switch (error.code) {
      case "TABLE_ERROR":
        if (error.metadata.operation === "describe-table") {
          return "Verify the table name is correct and exists in the specified region. Use 'aws-ts dynamodb list-tables' to see available tables.";
        }
        return "Check table status and ensure the table exists in the correct region with proper permissions.";

      case "QUERY_ERROR":
        return "Verify your key condition expression syntax and ensure the partition key is specified. Check that attribute names and values are correctly mapped.";

      case "SCAN_ERROR":
        return "Check your filter expression syntax and consider using pagination for large datasets. Verify attribute names and values are correctly specified.";

      case "ITEM_ERROR":
        if (error.message.includes("ConditionalCheckFailedException")) {
          return "The condition expression failed. Verify the item exists and meets the specified conditions before retrying.";
        }
        return "Check the item structure, primary key values, and any condition expressions. Ensure all required attributes are provided.";

      case "EXPRESSION_ERROR":
        return "Review your expression syntax. Ensure attribute names with reserved words use expression attribute names (#name) and values use expression attribute values (:value).";

      case "BATCH_OPERATION_ERROR":
        return "Reduce batch size or implement retry logic for unprocessed items. Check for throttling and consider implementing exponential backoff.";

      default:
        return "Check your AWS credentials, table permissions, and region configuration. Verify the table exists and is in an active state.";
    }
  }

  return "Unknown DynamoDB error. Check AWS credentials and table configuration.";
}