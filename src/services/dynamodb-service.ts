/**
 * DynamoDB service for high-level table operations
 *
 * Orchestrates DynamoDB operations by providing a unified interface for
 * table management, queries, scans, and item operations. Integrates with
 * existing credential management for seamless AWS SDK client creation.
 *
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchGetCommand,
  BatchWriteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import ora from "ora";
import { ServiceError } from "../lib/errors.js";
import { CredentialService, type AwsClientConfig } from "./credential-service.js";

/**
 * Spinner interface for progress indicators
 * @internal
 */
interface SpinnerInterface {
  text: string;
  succeed: (message?: string) => void;
  fail: (message?: string) => void;
  warn: (message?: string) => void;
}

/**
 * Configuration options for DynamoDB service
 *
 * @public
 */
export interface DynamoDBServiceOptions {
  /**
   * Credential service configuration
   */
  credentialService?: {
    defaultRegion?: string;
    defaultProfile?: string;
    enableDebugLogging?: boolean;
  };

  /**
   * Enable debug logging for DynamoDB operations
   */
  enableDebugLogging?: boolean;

  /**
   * Enable progress indicators for long-running operations
   */
  enableProgressIndicators?: boolean;

  /**
   * DynamoDB client configuration overrides
   */
  clientConfig?: {
    region?: string;
    profile?: string;
    endpoint?: string;
  };
}

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
 * coordinating with credential management and providing comprehensive error handling.
 *
 * @public
 */
export class DynamoDBService {
  private readonly credentialService: CredentialService;
  private readonly options: DynamoDBServiceOptions;
  private clientCache = new Map<string, DynamoDBClient>();
  private docClientCache = new Map<string, DynamoDBDocumentClient>();

  /**
   * Create a new DynamoDB service instance
   *
   * @param options - Configuration options for the service
   */
  constructor(options: DynamoDBServiceOptions = {}) {
    this.options = {
      ...options,
      enableProgressIndicators:
        options.enableProgressIndicators ??
        (process.env.NODE_ENV !== "test" && !process.env.CI && !process.env.VITEST),
    };

    this.credentialService = new CredentialService({
      enableDebugLogging: options.enableDebugLogging ?? false,
      ...options.credentialService,
    });
  }

  /**
   * Get DynamoDB client with caching
   *
   * @param config - Client configuration options
   * @returns DynamoDB client instance
   * @internal
   */
  private async getDynamoDBClient(config: AwsClientConfig = {}): Promise<DynamoDBClient> {
    const cacheKey = `${config.region || "default"}-${config.profile || "default"}`;

    if (!this.clientCache.has(cacheKey)) {
      const clientConfig = {
        ...config,
        ...this.options.clientConfig,
      };

      const client = await this.credentialService.createClient(DynamoDBClient, clientConfig);
      this.clientCache.set(cacheKey, client);
    }

    return this.clientCache.get(cacheKey)!;
  }

  /**
   * Get DynamoDB document client with caching
   *
   * @param config - Client configuration options
   * @returns DynamoDB document client instance
   * @internal
   */
  private async getDocumentClient(config: AwsClientConfig = {}): Promise<DynamoDBDocumentClient> {
    const cacheKey = `doc-${config.region || "default"}-${config.profile || "default"}`;

    if (!this.docClientCache.has(cacheKey)) {
      const dynamoClient = await this.getDynamoDBClient(config);
      const docClient = DynamoDBDocumentClient.from(dynamoClient, {
        marshallOptions: {
          removeUndefinedValues: true,
          convertEmptyValues: true,
        },
        unmarshallOptions: {
          wrapNumbers: false,
        },
      });
      this.docClientCache.set(cacheKey, docClient);
    }

    return this.docClientCache.get(cacheKey)!;
  }

  /**
   * Create a progress spinner if enabled
   *
   * @param text - Initial spinner text
   * @returns Spinner instance or mock object
   * @internal
   */
  private createSpinner(text: string): SpinnerInterface {
    return (this.options.enableProgressIndicators ?? true)
      ? ora(text).start()
      : {
          text,
          succeed: () => {},
          fail: () => {},
          warn: () => {},
        };
  }

  /**
   * List all DynamoDB tables
   *
   * @param config - Client configuration options
   * @returns Promise resolving to array of table names
   * @throws When table listing fails
   */
  async listTables(config: AwsClientConfig = {}): Promise<string[]> {
    const spinner = this.createSpinner("Listing DynamoDB tables...");

    try {
      const client = await this.getDynamoDBClient(config);
      const { ListTablesCommand } = await import("@aws-sdk/client-dynamodb");

      const response = await client.send(new ListTablesCommand({}));
      const tables = response.TableNames || [];

      spinner.succeed(`Found ${tables.length} DynamoDB tables`);
      return tables;
    } catch (error) {
      spinner.fail("Failed to list tables");
      throw new ServiceError(
        `Failed to list DynamoDB tables: ${error instanceof Error ? error.message : String(error)}`,
        "DynamoDB",
        "list-tables",
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
      const client = await this.getDynamoDBClient(config);
      const { DescribeTableCommand } = await import("@aws-sdk/client-dynamodb");

      const response = await client.send(new DescribeTableCommand({ TableName: tableName }));
      const table = response.Table;

      if (!table) {
        throw new ServiceError(
          `Table '${tableName}' not found`,
          "DynamoDB",
          "describe-table",
          { tableName },
        );
      }

      const description: TableDescription = {
        tableName: table.TableName!,
        tableStatus: table.TableStatus!,
        keySchema: table.KeySchema?.map(key => ({
          attributeName: key.AttributeName!,
          keyType: key.KeyType! as "HASH" | "RANGE",
        })) || [],
        attributeDefinitions: table.AttributeDefinitions?.map(attr => ({
          attributeName: attr.AttributeName!,
          attributeType: attr.AttributeType! as "S" | "N" | "B",
        })) || [],
        billingMode: table.BillingModeSummary?.BillingMode,
        itemCount: table.ItemCount,
        tableSizeBytes: table.TableSizeBytes,
      };

      if (table.GlobalSecondaryIndexes) {
        description.globalSecondaryIndexes = table.GlobalSecondaryIndexes.map(gsi => ({
          indexName: gsi.IndexName!,
          keySchema: gsi.KeySchema?.map(key => ({
            attributeName: key.AttributeName!,
            keyType: key.KeyType! as "HASH" | "RANGE",
          })) || [],
        }));
      }

      if (table.LocalSecondaryIndexes) {
        description.localSecondaryIndexes = table.LocalSecondaryIndexes.map(lsi => ({
          indexName: lsi.IndexName!,
          keySchema: lsi.KeySchema?.map(key => ({
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
      throw new ServiceError(
        `Failed to describe table '${tableName}': ${error instanceof Error ? error.message : String(error)}`,
        "DynamoDB",
        "describe-table",
        error,
        { tableName },
      );
    }
  }

  /**
   * Query a DynamoDB table or index
   *
   * @param params - Query parameters
   * @param config - Client configuration options
   * @returns Promise resolving to query results
   * @throws When query operation fails
   */
  async query(params: QueryParameters, config: AwsClientConfig = {}): Promise<PaginatedResult> {
    const spinner = this.createSpinner(`Querying table '${params.tableName}'...`);

    try {
      const docClient = await this.getDocumentClient(config);

      const command = new QueryCommand({
        TableName: params.tableName,
        IndexName: params.indexName,
        KeyConditionExpression: params.keyConditionExpression,
        FilterExpression: params.filterExpression,
        ExpressionAttributeNames: params.expressionAttributeNames,
        ExpressionAttributeValues: params.expressionAttributeValues,
        ProjectionExpression: params.projectionExpression,
        Limit: params.limit,
        ExclusiveStartKey: params.exclusiveStartKey,
        ConsistentRead: params.consistentRead,
        ScanIndexForward: params.scanIndexForward,
      });

      const response = await docClient.send(command);

      const result: PaginatedResult = {
        items: response.Items || [],
        lastEvaluatedKey: response.LastEvaluatedKey,
        count: response.Count || 0,
        scannedCount: response.ScannedCount,
      };

      spinner.succeed(`Query completed: ${result.count} items returned`);
      return result;
    } catch (error) {
      spinner.fail(`Failed to query table '${params.tableName}'`);
      throw new ServiceError(
        `Failed to query table '${params.tableName}': ${error instanceof Error ? error.message : String(error)}`,
        "DynamoDB",
        "query",
        error,
        { tableName: params.tableName, indexName: params.indexName },
      );
    }
  }

  /**
   * Scan a DynamoDB table or index
   *
   * @param params - Scan parameters
   * @param config - Client configuration options
   * @returns Promise resolving to scan results
   * @throws When scan operation fails
   */
  async scan(params: ScanParameters, config: AwsClientConfig = {}): Promise<PaginatedResult> {
    const spinner = this.createSpinner(`Scanning table '${params.tableName}'...`);

    try {
      const docClient = await this.getDocumentClient(config);

      const command = new ScanCommand({
        TableName: params.tableName,
        IndexName: params.indexName,
        FilterExpression: params.filterExpression,
        ExpressionAttributeNames: params.expressionAttributeNames,
        ExpressionAttributeValues: params.expressionAttributeValues,
        ProjectionExpression: params.projectionExpression,
        Limit: params.limit,
        ExclusiveStartKey: params.exclusiveStartKey,
        ConsistentRead: params.consistentRead,
        Segment: params.segment,
        TotalSegments: params.totalSegments,
      });

      const response = await docClient.send(command);

      const result: PaginatedResult = {
        items: response.Items || [],
        lastEvaluatedKey: response.LastEvaluatedKey,
        count: response.Count || 0,
        scannedCount: response.ScannedCount,
      };

      spinner.succeed(`Scan completed: ${result.count} items returned`);
      return result;
    } catch (error) {
      spinner.fail(`Failed to scan table '${params.tableName}'`);
      throw new ServiceError(
        `Failed to scan table '${params.tableName}': ${error instanceof Error ? error.message : String(error)}`,
        "DynamoDB",
        "scan",
        error,
        { tableName: params.tableName, indexName: params.indexName },
      );
    }
  }

  /**
   * Get a single item from a DynamoDB table
   *
   * @param params - Get item parameters
   * @param config - Client configuration options
   * @returns Promise resolving to the item or undefined if not found
   * @throws When get item operation fails
   */
  async getItem(params: GetItemParameters, config: AwsClientConfig = {}): Promise<Record<string, unknown> | undefined> {
    const spinner = this.createSpinner(`Getting item from table '${params.tableName}'...`);

    try {
      const docClient = await this.getDocumentClient(config);

      const command = new GetCommand({
        TableName: params.tableName,
        Key: params.key,
        ProjectionExpression: params.projectionExpression,
        ExpressionAttributeNames: params.expressionAttributeNames,
        ConsistentRead: params.consistentRead,
      });

      const response = await docClient.send(command);

      if (response.Item) {
        spinner.succeed("Item retrieved successfully");
        return response.Item;
      } else {
        spinner.warn("Item not found");
        return undefined;
      }
    } catch (error) {
      spinner.fail(`Failed to get item from table '${params.tableName}'`);
      throw new ServiceError(
        `Failed to get item from table '${params.tableName}': ${error instanceof Error ? error.message : String(error)}`,
        "DynamoDB",
        "get-item",
        error,
        { tableName: params.tableName, key: params.key },
      );
    }
  }

  /**
   * Put (create/update) an item in a DynamoDB table
   *
   * @param params - Put item parameters
   * @param config - Client configuration options
   * @returns Promise resolving to the previous item if returnValues is set
   * @throws When put item operation fails
   */
  async putItem(params: PutItemParameters, config: AwsClientConfig = {}): Promise<Record<string, unknown> | undefined> {
    const spinner = this.createSpinner(`Putting item to table '${params.tableName}'...`);

    try {
      const docClient = await this.getDocumentClient(config);

      const command = new PutCommand({
        TableName: params.tableName,
        Item: params.item,
        ConditionExpression: params.conditionExpression,
        ExpressionAttributeNames: params.expressionAttributeNames,
        ExpressionAttributeValues: params.expressionAttributeValues,
        ReturnValues: params.returnValues,
      });

      const response = await docClient.send(command);

      spinner.succeed("Item saved successfully");
      return response.Attributes;
    } catch (error) {
      spinner.fail(`Failed to put item to table '${params.tableName}'`);
      throw new ServiceError(
        `Failed to put item to table '${params.tableName}': ${error instanceof Error ? error.message : String(error)}`,
        "DynamoDB",
        "put-item",
        error,
        { tableName: params.tableName },
      );
    }
  }

  /**
   * Update an existing item in a DynamoDB table
   *
   * @param params - Update item parameters
   * @param config - Client configuration options
   * @returns Promise resolving to the updated attributes if returnValues is set
   * @throws When update item operation fails
   */
  async updateItem(params: UpdateItemParameters, config: AwsClientConfig = {}): Promise<Record<string, unknown> | undefined> {
    const spinner = this.createSpinner(`Updating item in table '${params.tableName}'...`);

    try {
      const docClient = await this.getDocumentClient(config);

      const command = new UpdateCommand({
        TableName: params.tableName,
        Key: params.key,
        UpdateExpression: params.updateExpression,
        ConditionExpression: params.conditionExpression,
        ExpressionAttributeNames: params.expressionAttributeNames,
        ExpressionAttributeValues: params.expressionAttributeValues,
        ReturnValues: params.returnValues,
      });

      const response = await docClient.send(command);

      spinner.succeed("Item updated successfully");
      return response.Attributes;
    } catch (error) {
      spinner.fail(`Failed to update item in table '${params.tableName}'`);
      throw new ServiceError(
        `Failed to update item in table '${params.tableName}': ${error instanceof Error ? error.message : String(error)}`,
        "DynamoDB",
        "update-item",
        error,
        { tableName: params.tableName, key: params.key },
      );
    }
  }

  /**
   * Clear client caches (useful for testing or configuration changes)
   *
   */
  clearClientCache(): void {
    this.clientCache.clear();
    this.docClientCache.clear();

    if (this.options.enableDebugLogging) {
      console.debug("Cleared DynamoDB client caches");
    }
  }
}