/**
 * DynamoDB-specific Zod schemas for input validation
 *
 * Provides comprehensive validation schemas for DynamoDB commands
 * and operations with automatic TypeScript type generation.
 *
 */

import { z } from "zod";
import { AwsProfileSchema, AwsRegionSchema, TableNameSchema } from "./schemas.js";

/**
 * Schema for DynamoDB attribute types
 *
 * @public
 */
export const AttributeTypeSchema = z.enum(["S", "N", "B"], {
  description: "S=String, N=Number, B=Binary",
});

/**
 * Schema for DynamoDB key types
 *
 * @public
 */
export const KeyTypeSchema = z.enum(["HASH", "RANGE"], {
  description: "HASH=Partition Key, RANGE=Sort Key",
});

/**
 * Schema for DynamoDB index names
 *
 * @public
 */
export const IndexNameSchema = z
  .string()
  .min(3, "Index name must be at least 3 characters")
  .max(255, "Index name must be 255 characters or less")
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "Index name can only contain letters, numbers, dots, underscores, and hyphens",
  );

/**
 * Schema for expression attribute names
 *
 * @public
 */
export const ExpressionAttributeNamesSchema = z
  .record(z.string().regex(/^#\w+$/, "Attribute name must start with #"))
  .optional();

/**
 * Schema for expression attribute values
 *
 * @public
 */
export const ExpressionAttributeValuesSchema = z
  .record(z.string().regex(/^:\w+$/, "Attribute value must start with :"), z.unknown())
  .optional();

/**
 * Schema for DynamoDB expressions
 *
 * @public
 */
export const ExpressionSchema = z
  .string()
  .min(1, "Expression cannot be empty")
  .max(4096, "Expression must be 4096 characters or less");

/**
 * Schema for projection expressions
 *
 * @public
 */
export const ProjectionExpressionSchema = z
  .string()
  .min(1, "Projection expression cannot be empty")
  .max(4096, "Projection expression must be 4096 characters or less")
  .optional();

/**
 * Common DynamoDB configuration schema
 *
 * @public
 */
export const DynamoDBConfigSchema = z.object({
  /**
   * AWS region for operations
   */
  region: AwsRegionSchema.optional(),

  /**
   * AWS profile to use
   */
  profile: AwsProfileSchema.optional(),

  /**
   * Output format for command results
   */
  format: z.enum(["json", "jsonl", "csv", "table"]).default("table"),

  /**
   * Enable verbose logging
   */
  verbose: z.boolean().default(false),

  /**
   * Enable consistent reads
   */
  consistentRead: z.boolean().default(false),

  /**
   * Maximum number of items to return
   */
  limit: z.number().int().min(1).max(10_000).optional(),
});

/**
 * DynamoDB list tables command schema
 *
 * @public
 */
export const DynamoDBListTablesSchema = DynamoDBConfigSchema.pick({
  region: true,
  profile: true,
  format: true,
  verbose: true,
});

/**
 * DynamoDB describe table command schema
 *
 * @public
 */
export const DynamoDBDescribeTableSchema = DynamoDBConfigSchema.pick({
  region: true,
  profile: true,
  format: true,
  verbose: true,
}).extend({
  /**
   * Table name to describe
   */
  tableName: TableNameSchema,
});

/**
 * DynamoDB query command schema
 *
 * @public
 */
export const DynamoDBQuerySchema = DynamoDBConfigSchema.extend({
  /**
   * Table name to query
   */
  tableName: TableNameSchema,

  /**
   * Index name for query (optional)
   */
  indexName: IndexNameSchema.optional(),

  /**
   * Key condition expression (required for queries)
   */
  keyConditionExpression: ExpressionSchema,

  /**
   * Filter expression to apply after query
   */
  filterExpression: ExpressionSchema.optional(),

  /**
   * Expression attribute names mapping
   */
  expressionAttributeNames: ExpressionAttributeNamesSchema,

  /**
   * Expression attribute values mapping
   */
  expressionAttributeValues: ExpressionAttributeValuesSchema,

  /**
   * Projection expression for attribute selection
   */
  projectionExpression: ProjectionExpressionSchema,

  /**
   * Scan index forward (sort order)
   */
  scanIndexForward: z.boolean().default(true),

  /**
   * Exclusive start key for pagination (JSON string)
   */
  exclusiveStartKey: z.string().optional(),
});

/**
 * DynamoDB scan command schema
 *
 * @public
 */
export const DynamoDBScanSchema = DynamoDBConfigSchema.extend({
  /**
   * Table name to scan
   */
  tableName: TableNameSchema,

  /**
   * Index name for scan (optional)
   */
  indexName: IndexNameSchema.optional(),

  /**
   * Filter expression to apply during scan
   */
  filterExpression: ExpressionSchema.optional(),

  /**
   * Expression attribute names mapping
   */
  expressionAttributeNames: ExpressionAttributeNamesSchema,

  /**
   * Expression attribute values mapping
   */
  expressionAttributeValues: ExpressionAttributeValuesSchema,

  /**
   * Projection expression for attribute selection
   */
  projectionExpression: ProjectionExpressionSchema,

  /**
   * Segment number for parallel scans
   */
  segment: z.number().int().min(0).max(999999).optional(),

  /**
   * Total segments for parallel scans
   */
  totalSegments: z.number().int().min(1).max(1000000).optional(),

  /**
   * Exclusive start key for pagination (JSON string)
   */
  exclusiveStartKey: z.string().optional(),
});

/**
 * Schema for DynamoDB item key
 *
 * @public
 */
export const ItemKeySchema = z
  .record(z.unknown())
  .refine((key) => Object.keys(key).length > 0, "Item key cannot be empty");

/**
 * DynamoDB get item command schema
 *
 * @public
 */
export const DynamoDBGetItemSchema = DynamoDBConfigSchema.pick({
  region: true,
  profile: true,
  format: true,
  verbose: true,
  consistentRead: true,
}).extend({
  /**
   * Table name to get item from
   */
  tableName: TableNameSchema,

  /**
   * Item primary key (JSON string or key-value pairs)
   */
  key: z.string().min(1, "Key is required"),

  /**
   * Expression attribute names mapping
   */
  expressionAttributeNames: ExpressionAttributeNamesSchema,

  /**
   * Projection expression for attribute selection
   */
  projectionExpression: ProjectionExpressionSchema,
});

/**
 * DynamoDB put item command schema
 *
 * @public
 */
export const DynamoDBPutItemSchema = DynamoDBConfigSchema.pick({
  region: true,
  profile: true,
  format: true,
  verbose: true,
}).extend({
  /**
   * Table name to put item to
   */
  tableName: TableNameSchema,

  /**
   * Item data (JSON string or file path)
   */
  item: z.string().min(1, "Item data is required"),

  /**
   * Condition expression for put operation
   */
  conditionExpression: ExpressionSchema.optional(),

  /**
   * Expression attribute names mapping
   */
  expressionAttributeNames: ExpressionAttributeNamesSchema,

  /**
   * Expression attribute values mapping
   */
  expressionAttributeValues: ExpressionAttributeValuesSchema,

  /**
   * Return values option
   */
  returnValues: z.enum(["NONE", "ALL_OLD"]).default("NONE"),
});

/**
 * DynamoDB update item command schema
 *
 * @public
 */
export const DynamoDBUpdateItemSchema = DynamoDBConfigSchema.pick({
  region: true,
  profile: true,
  format: true,
  verbose: true,
}).extend({
  /**
   * Table name to update item in
   */
  tableName: TableNameSchema,

  /**
   * Item primary key (JSON string)
   */
  key: z.string().min(1, "Key is required"),

  /**
   * Update expression (required for updates)
   */
  updateExpression: ExpressionSchema,

  /**
   * Condition expression for update operation
   */
  conditionExpression: ExpressionSchema.optional(),

  /**
   * Expression attribute names mapping
   */
  expressionAttributeNames: ExpressionAttributeNamesSchema,

  /**
   * Expression attribute values mapping
   */
  expressionAttributeValues: ExpressionAttributeValuesSchema,

  /**
   * Return values option
   */
  returnValues: z.enum(["NONE", "ALL_OLD", "UPDATED_OLD", "ALL_NEW", "UPDATED_NEW"]).default("NONE"),
});

/**
 * DynamoDB batch get item command schema
 *
 * @public
 */
export const DynamoDBBatchGetItemSchema = DynamoDBConfigSchema.pick({
  region: true,
  profile: true,
  format: true,
  verbose: true,
  consistentRead: true,
}).extend({
  /**
   * Request items specification (JSON string or file path)
   */
  requestItems: z.string().min(1, "Request items specification is required"),
});

/**
 * DynamoDB batch write item command schema
 *
 * @public
 */
export const DynamoDBBatchWriteItemSchema = DynamoDBConfigSchema.pick({
  region: true,
  profile: true,
  format: true,
  verbose: true,
}).extend({
  /**
   * Table name for batch write operation
   */
  tableName: TableNameSchema,

  /**
   * Input file path (CSV, JSON, or JSONL)
   */
  inputFile: z.string().min(1, "Input file path is required"),

  /**
   * Batch size for write operations
   */
  batchSize: z.number().int().min(1).max(25).default(25),

  /**
   * Maximum concurrent batch requests
   */
  maxConcurrency: z.number().int().min(1).max(20).default(10),

  /**
   * Enable retry for failed items
   */
  enableRetry: z.boolean().default(true),

  /**
   * Maximum retry attempts for failed items
   */
  maxRetries: z.number().int().min(0).max(10).default(3),
});

/**
 * File input validation schema
 *
 * @public
 */
export const FileInputSchema = z
  .string()
  .min(1, "File path is required")
  .refine((path) => {
    return (
      path.startsWith("file://") ||
      path.endsWith(".json") ||
      path.endsWith(".jsonl") ||
      path.endsWith(".csv") ||
      path.endsWith(".tsv")
    );
  }, "File must be a JSON, JSONL, CSV, TSV file or use file:// protocol");

/**
 * CLI input JSON schema for AWS CLI compatibility
 *
 * @public
 */
export const CliInputJsonSchema = z.object({
  /**
   * File path for complete CLI input JSON
   */
  cliInputJson: FileInputSchema.optional(),

  /**
   * Item file path for item-specific operations
   */
  item: FileInputSchema.optional(),

  /**
   * Request items file for batch operations
   */
  requestItems: FileInputSchema.optional(),
});

// Type exports for TypeScript inference
export type DynamoDBListTables = z.infer<typeof DynamoDBListTablesSchema>;
export type DynamoDBDescribeTable = z.infer<typeof DynamoDBDescribeTableSchema>;
export type DynamoDBQuery = z.infer<typeof DynamoDBQuerySchema>;
export type DynamoDBScan = z.infer<typeof DynamoDBScanSchema>;
export type DynamoDBGetItem = z.infer<typeof DynamoDBGetItemSchema>;
export type DynamoDBPutItem = z.infer<typeof DynamoDBPutItemSchema>;
export type DynamoDBUpdateItem = z.infer<typeof DynamoDBUpdateItemSchema>;
export type DynamoDBBatchGetItem = z.infer<typeof DynamoDBBatchGetItemSchema>;
export type DynamoDBBatchWriteItem = z.infer<typeof DynamoDBBatchWriteItemSchema>;
export type DynamoDBConfig = z.infer<typeof DynamoDBConfigSchema>;
export type FileInput = z.infer<typeof FileInputSchema>;
export type CliInputJson = z.infer<typeof CliInputJsonSchema>;