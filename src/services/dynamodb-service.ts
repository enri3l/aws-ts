/**
 * DynamoDB service for high-level table operations
 *
 * Orchestrates DynamoDB operations by providing a unified interface for
 * table management, queries, scans, and item operations. Integrates with
 * existing credential management for AWS SDK client creation.
 *
 */

import { DynamoDBClient, paginateListTables } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { BaseAwsService, type BaseServiceOptions } from "../lib/base-aws-service.js";
import {
  DynamoDBError,
  DynamoDBQueryError,
  ItemError,
  ScanError,
  TableError,
} from "../lib/dynamodb-errors.js";
import { retryWithBackoff } from "../lib/retry.js";
import type { AwsClientConfig } from "./credential-service.js";

/**
 * Configuration options for DynamoDB service
 *
 * @public
 */
export type DynamoDBServiceOptions = BaseServiceOptions;

/**
 * DynamoDB table description
 *
 * @public
 */
export interface TableDescription {
  tableName: string;
  tableStatus: string;
  keySchema: Array<{
    attributeName: string;
    keyType: "HASH" | "RANGE";
  }>;
  attributeDefinitions: Array<{
    attributeName: string;
    attributeType: "S" | "N" | "B";
  }>;
  globalSecondaryIndexes?: Array<{
    indexName: string;
    keySchema: Array<{
      attributeName: string;
      keyType: "HASH" | "RANGE";
    }>;
  }>;
  localSecondaryIndexes?: Array<{
    indexName: string;
    keySchema: Array<{
      attributeName: string;
      keyType: "HASH" | "RANGE";
    }>;
  }>;
  billingMode?: string;
  provisionedThroughput?: {
    readCapacityUnits: number;
    writeCapacityUnits: number;
  };
  itemCount?: number;
  tableSizeBytes?: number;
}

/**
 * Query operation parameters
 *
 * @public
 */
export interface QueryParameters {
  tableName: string;
  indexName?: string;
  keyConditionExpression: string;
  filterExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, unknown>;
  projectionExpression?: string;
  limit?: number;
  exclusiveStartKey?: Record<string, unknown>;
  consistentRead?: boolean;
  scanIndexForward?: boolean;
}

/**
 * Scan operation parameters
 *
 * @public
 */
export interface ScanParameters {
  tableName: string;
  indexName?: string;
  filterExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, unknown>;
  projectionExpression?: string;
  limit?: number;
  exclusiveStartKey?: Record<string, unknown>;
  consistentRead?: boolean;
  segment?: number;
  totalSegments?: number;
}

/**
 * Get item operation parameters
 *
 * @public
 */
export interface GetItemParameters {
  tableName: string;
  key: Record<string, unknown>;
  projectionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  consistentRead?: boolean;
}

/**
 * Put item operation parameters
 *
 * @public
 */
export interface PutItemParameters {
  tableName: string;
  item: Record<string, unknown>;
  conditionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, unknown>;
  returnValues?: "NONE" | "ALL_OLD";
}

/**
 * Update item operation parameters
 *
 * @public
 */
export interface UpdateItemParameters {
  tableName: string;
  key: Record<string, unknown>;
  updateExpression: string;
  conditionExpression?: string;
  expressionAttributeNames?: Record<string, string>;
  expressionAttributeValues?: Record<string, unknown>;
  returnValues?: "NONE" | "ALL_OLD" | "UPDATED_OLD" | "ALL_NEW" | "UPDATED_NEW";
}

/**
 * Paginated query/scan result
 *
 * @public
 */
export interface PaginatedResult<T = Record<string, unknown>> {
  items: T[];
  lastEvaluatedKey?: Record<string, unknown>;
  count: number;
  scannedCount?: number;
}

/**
 * DynamoDB service for high-level table operations
 *
 * Provides a unified interface for all DynamoDB operations,
 * coordinating with credential management and providing error handling.
 *
 * @public
 */
export class DynamoDBService extends BaseAwsService<DynamoDBClient> {
  private docClientCache = new Map<string, DynamoDBDocumentClient>();

  /**
   * Create a new DynamoDB service instance
   *
   * @param options - Configuration options for the service
   */
  constructor(options: DynamoDBServiceOptions = {}) {
    super(DynamoDBClient, options);
  }

  /**
   * Get DynamoDB document client with caching
   *
   * @param config - Client configuration options
   * @returns DynamoDB document client instance
   * @public
   */
  async getDocumentClient(config: AwsClientConfig = {}): Promise<DynamoDBDocumentClient> {
    const cacheKey = `doc-${config.region || "default"}-${config.profile || "default"}`;

    if (!this.docClientCache.has(cacheKey)) {
      const dynamoClient = await this.getClient(config);
      const documentClient = DynamoDBDocumentClient.from(dynamoClient, {
        marshallOptions: {
          removeUndefinedValues: true,
          convertEmptyValues: true,
        },
        unmarshallOptions: {
          wrapNumbers: false,
        },
      });
      this.docClientCache.set(cacheKey, documentClient);
    }

    return this.docClientCache.get(cacheKey)!;
  }

  /**
   * List all DynamoDB tables using AWS SDK v3 native pagination
   *
   * @param config - Client configuration options
   * @param limit - Maximum number of table names to return
   * @param exclusiveStartTableName - Pagination token (optional, for backwards compatibility)
   * @returns Promise resolving to array of table names
   * @throws When table listing fails
   *
   * @remarks
   * Uses AWS SDK v3's built-in async iterator pagination pattern. Fetches all
   * pages unless limit is specified.
   */
  async listTables(
    config: AwsClientConfig = {},
    limit?: number,
    exclusiveStartTableName?: string,
  ): Promise<string[]> {
    const spinner = this.createSpinner("Listing DynamoDB tables...");

    try {
      const client = await this.getClient(config);
      const allTables: string[] = [];
      let pageCount = 0;

      // Use AWS SDK v3 native paginator with async iterator
      const paginatorConfig = limit ? { client, pageSize: limit } : { client };
      const paginator = paginateListTables(paginatorConfig, {
        ...(limit && { Limit: limit }),
        ...(exclusiveStartTableName && { ExclusiveStartTableName: exclusiveStartTableName }),
      });

      for await (const page of paginator) {
        pageCount++;
        const tables = page.TableNames || [];
        allTables.push(...tables);

        spinner.text = `Loading DynamoDB tables... (${allTables.length} so far, ${pageCount} page${pageCount === 1 ? "" : "s"})`;

        // Stop if we've reached limit
        if (limit && allTables.length >= limit) {
          break;
        }
      }

      spinner.succeed(`Found ${allTables.length} DynamoDB tables`);
      return allTables;
    } catch (error) {
      spinner.fail("Failed to list tables");
      throw new DynamoDBError(
        `Failed to list DynamoDB tables: ${error instanceof Error ? error.message : String(error)}`,
        "list-tables",
        undefined,
        error,
      );
    }
  }

  /**
   * Describe a DynamoDB table
   *
   * @param tableName - Name of the table to describe
   * @param config - Client configuration options
   * @returns Promise resolving to table description
   * @throws When table description fails
   */
  async describeTable(tableName: string, config: AwsClientConfig = {}): Promise<TableDescription> {
    const spinner = this.createSpinner(`Describing table '${tableName}'...`);

    try {
      const client = await this.getClient(config);
      const { DescribeTableCommand } = await import("@aws-sdk/client-dynamodb");

      const response = await retryWithBackoff(
        () => client.send(new DescribeTableCommand({ TableName: tableName })),
        {
          maxAttempts: 3,
          onRetry: (error, attempt, _delay) => {
            spinner.text = `Retrying describe table (attempt ${attempt})...`;
          },
        },
      );
      const table = response.Table;

      if (!table) {
        throw new TableError(`Table '${tableName}' not found`, tableName, "describe-table");
      }

      const description: TableDescription = {
        tableName: table.TableName!,
        tableStatus: table.TableStatus!,
        keySchema:
          table.KeySchema?.map((key) => ({
            attributeName: key.AttributeName!,
            keyType: key.KeyType! as "HASH" | "RANGE",
          })) || [],
        attributeDefinitions:
          table.AttributeDefinitions?.map((attribute) => ({
            attributeName: attribute.AttributeName!,
            attributeType: attribute.AttributeType! as "S" | "N" | "B",
          })) || [],
        ...(table.BillingModeSummary?.BillingMode && {
          billingMode: table.BillingModeSummary.BillingMode,
        }),
        ...(table.ItemCount !== undefined && { itemCount: table.ItemCount }),
        ...(table.TableSizeBytes !== undefined && { tableSizeBytes: table.TableSizeBytes }),
      };

      if (table.GlobalSecondaryIndexes) {
        description.globalSecondaryIndexes = table.GlobalSecondaryIndexes.map((gsi) => ({
          indexName: gsi.IndexName!,
          keySchema:
            gsi.KeySchema?.map((key) => ({
              attributeName: key.AttributeName!,
              keyType: key.KeyType! as "HASH" | "RANGE",
            })) || [],
        }));
      }

      if (table.LocalSecondaryIndexes) {
        description.localSecondaryIndexes = table.LocalSecondaryIndexes.map((lsi) => ({
          indexName: lsi.IndexName!,
          keySchema:
            lsi.KeySchema?.map((key) => ({
              attributeName: key.AttributeName!,
              keyType: key.KeyType! as "HASH" | "RANGE",
            })) || [],
        }));
      }

      if (table.ProvisionedThroughput) {
        description.provisionedThroughput = {
          readCapacityUnits: table.ProvisionedThroughput.ReadCapacityUnits!,
          writeCapacityUnits: table.ProvisionedThroughput.WriteCapacityUnits!,
        };
      }

      spinner.succeed(`Retrieved description for table '${tableName}'`);
      return description;
    } catch (error) {
      spinner.fail(`Failed to describe table '${tableName}'`);
      throw new TableError(
        `Failed to describe table '${tableName}': ${error instanceof Error ? error.message : String(error)}`,
        tableName,
        "describe-table",
        undefined,
        { cause: error },
      );
    }
  }

  /**
   * Query a DynamoDB table or index
   *
   * @param parameters - Query parameters including table name and conditions
   * @param config - Client configuration options
   * @returns Promise resolving to query results
   * @throws When query operation fails
   */
  async query(parameters: QueryParameters, config: AwsClientConfig = {}): Promise<PaginatedResult> {
    const spinner = this.createSpinner(`Querying table '${parameters.tableName}'...`);

    try {
      const documentClient = await this.getDocumentClient(config);

      const command = new QueryCommand({
        TableName: parameters.tableName,
        IndexName: parameters.indexName,
        KeyConditionExpression: parameters.keyConditionExpression,
        FilterExpression: parameters.filterExpression,
        ExpressionAttributeNames: parameters.expressionAttributeNames,
        ExpressionAttributeValues: parameters.expressionAttributeValues,
        ProjectionExpression: parameters.projectionExpression,
        Limit: parameters.limit,
        ExclusiveStartKey: parameters.exclusiveStartKey,
        ConsistentRead: parameters.consistentRead,
        ScanIndexForward: parameters.scanIndexForward,
      });

      const response = await retryWithBackoff(() => documentClient.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt, _delay) => {
          spinner.text = `Retrying query (attempt ${attempt})...`;
        },
      });

      const result: PaginatedResult = {
        items: response.Items || [],
        ...(response.LastEvaluatedKey && { lastEvaluatedKey: response.LastEvaluatedKey }),
        count: response.Count || 0,
        ...(response.ScannedCount !== undefined && { scannedCount: response.ScannedCount }),
      };

      spinner.succeed(`Query completed: ${result.count} items returned`);
      return result;
    } catch (error) {
      spinner.fail(`Failed to query table '${parameters.tableName}'`);
      throw new DynamoDBQueryError(
        `Failed to query table '${parameters.tableName}': ${error instanceof Error ? error.message : String(error)}`,
        parameters.tableName,
        parameters.indexName,
        parameters.keyConditionExpression,
        error,
      );
    }
  }

  /**
   * Scan a DynamoDB table or index
   *
   * @param parameters - Scan parameters including table name and filters
   * @param config - Client configuration options
   * @returns Promise resolving to scan results
   * @throws When scan operation fails
   */
  async scan(parameters: ScanParameters, config: AwsClientConfig = {}): Promise<PaginatedResult> {
    const spinner = this.createSpinner(`Scanning table '${parameters.tableName}'...`);

    try {
      const documentClient = await this.getDocumentClient(config);

      const command = new ScanCommand({
        TableName: parameters.tableName,
        IndexName: parameters.indexName,
        FilterExpression: parameters.filterExpression,
        ExpressionAttributeNames: parameters.expressionAttributeNames,
        ExpressionAttributeValues: parameters.expressionAttributeValues,
        ProjectionExpression: parameters.projectionExpression,
        Limit: parameters.limit,
        ExclusiveStartKey: parameters.exclusiveStartKey,
        ConsistentRead: parameters.consistentRead,
        Segment: parameters.segment,
        TotalSegments: parameters.totalSegments,
      });

      const response = await retryWithBackoff(() => documentClient.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt, _delay) => {
          spinner.text = `Retrying scan (attempt ${attempt})...`;
        },
      });

      const result: PaginatedResult = {
        items: response.Items || [],
        ...(response.LastEvaluatedKey && { lastEvaluatedKey: response.LastEvaluatedKey }),
        count: response.Count || 0,
        ...(response.ScannedCount !== undefined && { scannedCount: response.ScannedCount }),
      };

      spinner.succeed(`Scan completed: ${result.count} items returned`);
      return result;
    } catch (error) {
      spinner.fail(`Failed to scan table '${parameters.tableName}'`);
      throw new ScanError(
        `Failed to scan table '${parameters.tableName}': ${error instanceof Error ? error.message : String(error)}`,
        parameters.tableName,
        parameters.indexName,
        parameters.filterExpression,
        error,
      );
    }
  }

  /**
   * Get a single item from a DynamoDB table
   *
   * @param parameters - Get item parameters including table name and key
   * @param config - Client configuration options
   * @returns Promise resolving to the item or undefined if not found
   * @throws When get item operation fails
   */
  async getItem(
    parameters: GetItemParameters,
    config: AwsClientConfig = {},
  ): Promise<Record<string, unknown> | undefined> {
    const spinner = this.createSpinner(`Getting item from table '${parameters.tableName}'...`);

    try {
      const documentClient = await this.getDocumentClient(config);

      const command = new GetCommand({
        TableName: parameters.tableName,
        Key: parameters.key,
        ProjectionExpression: parameters.projectionExpression,
        ExpressionAttributeNames: parameters.expressionAttributeNames,
        ConsistentRead: parameters.consistentRead,
      });

      const response = await retryWithBackoff(() => documentClient.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt, _delay) => {
          spinner.text = `Retrying get item (attempt ${attempt})...`;
        },
      });

      if (response.Item) {
        spinner.succeed("Item retrieved successfully");
        return response.Item;
      } else {
        spinner.warn("Item not found");
        return undefined;
      }
    } catch (error) {
      spinner.fail(`Failed to get item from table '${parameters.tableName}'`);
      throw new ItemError(
        `Failed to get item from table '${parameters.tableName}': ${error instanceof Error ? error.message : String(error)}`,
        parameters.tableName,
        "get-item",
        parameters.key,
        undefined,
        error,
      );
    }
  }

  /**
   * Put (create/update) an item in a DynamoDB table
   *
   * @param parameters - Put item parameters including table name and item data
   * @param config - Client configuration options
   * @returns Promise resolving to the previous item if returnValues is set
   * @throws When put item operation fails
   */
  async putItem(
    parameters: PutItemParameters,
    config: AwsClientConfig = {},
  ): Promise<Record<string, unknown> | undefined> {
    const spinner = this.createSpinner(`Putting item to table '${parameters.tableName}'...`);

    try {
      const documentClient = await this.getDocumentClient(config);

      const command = new PutCommand({
        TableName: parameters.tableName,
        Item: parameters.item,
        ConditionExpression: parameters.conditionExpression,
        ExpressionAttributeNames: parameters.expressionAttributeNames,
        ExpressionAttributeValues: parameters.expressionAttributeValues,
        ReturnValues: parameters.returnValues,
      });

      const response = await retryWithBackoff(() => documentClient.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt, _delay) => {
          spinner.text = `Retrying put item (attempt ${attempt})...`;
        },
      });

      spinner.succeed("Item saved successfully");
      return response.Attributes;
    } catch (error) {
      spinner.fail(`Failed to put item to table '${parameters.tableName}'`);
      throw new ItemError(
        `Failed to put item to table '${parameters.tableName}': ${error instanceof Error ? error.message : String(error)}`,
        parameters.tableName,
        "put-item",
        undefined,
        parameters.conditionExpression,
        error,
      );
    }
  }

  /**
   * Update an existing item in a DynamoDB table
   *
   * @param parameters - Update item parameters including table name and update expression
   * @param config - Client configuration options
   * @returns Promise resolving to the updated attributes if returnValues is set
   * @throws When update item operation fails
   */
  async updateItem(
    parameters: UpdateItemParameters,
    config: AwsClientConfig = {},
  ): Promise<Record<string, unknown> | undefined> {
    const spinner = this.createSpinner(`Updating item in table '${parameters.tableName}'...`);

    try {
      const documentClient = await this.getDocumentClient(config);

      const command = new UpdateCommand({
        TableName: parameters.tableName,
        Key: parameters.key,
        UpdateExpression: parameters.updateExpression,
        ConditionExpression: parameters.conditionExpression,
        ExpressionAttributeNames: parameters.expressionAttributeNames,
        ExpressionAttributeValues: parameters.expressionAttributeValues,
        ReturnValues: parameters.returnValues,
      });

      const response = await retryWithBackoff(() => documentClient.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt, _delay) => {
          spinner.text = `Retrying update item (attempt ${attempt})...`;
        },
      });

      spinner.succeed("Item updated successfully");
      return response.Attributes;
    } catch (error) {
      spinner.fail(`Failed to update item in table '${parameters.tableName}'`);
      throw new ItemError(
        `Failed to update item in table '${parameters.tableName}': ${error instanceof Error ? error.message : String(error)}`,
        parameters.tableName,
        "update-item",
        parameters.key,
        parameters.conditionExpression,
        error,
      );
    }
  }

  /**
   * Clear client caches (useful for testing or configuration changes)
   *
   */
  override clearClientCache(): void {
    super.clearClientCache();
    this.docClientCache.clear();
  }
}
