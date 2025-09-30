/**
 * @module cloudwatch-logs-schemas
 * CloudWatch Logs-specific Zod schemas for input validation
 *
 * Provides validation schemas for CloudWatch Logs commands
 * and operations with automatic TypeScript type generation.
 *
 */

import { z } from "zod";
import { AwsProfileSchema, AwsRegionSchema } from "./schemas.js";

/**
 * Schema for CloudWatch Logs log group names
 *
 * @public
 */
export const LogGroupNameSchema = z
  .string()
  .min(1, "Log group name is required")
  .max(512, "Log group name must be 512 characters or less")
  .regex(/^[.\-_/#A-Za-z0-9]+$/, "Invalid log group name format");

/**
 * Schema for CloudWatch Logs log stream names
 *
 * @public
 */
export const LogStreamNameSchema = z
  .string()
  .min(1, "Log stream name is required")
  .max(512, "Log stream name must be 512 characters or less")
  .regex(/^[^:*]*$/, "Log stream name cannot contain : or * characters");

/**
 * Schema for CloudWatch Logs filter patterns
 *
 * @public
 */
export const FilterPatternSchema = z
  .string()
  .max(1024, "Filter pattern must be 1024 characters or less")
  .optional();

/**
 * Schema for CloudWatch Logs Insights query validation
 *
 * @public
 */
export const LogsInsightsQuerySchema = z
  .string()
  .min(1, "Query is required")
  .max(10_000, "Query must be 10000 characters or less");

/**
 * Schema for time range validation
 *
 * @public
 */
export const TimeRangeSchema = z.object({
  /**
   * Start time (ISO 8601 string, Unix timestamp, or relative time)
   */
  startTime: z
    .union([
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
      z.number().int().positive(),
      z
        .string()
        .regex(
          /^(last|past)\s+\d+\s+(minutes?|hours?|days?|weeks?)$/i,
          "Invalid relative time format",
        ),
    ])
    .optional(),

  /**
   * End time (ISO 8601 string, Unix timestamp, or relative time)
   */
  endTime: z
    .union([
      z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
      z.number().int().positive(),
      z
        .string()
        .regex(
          /^(last|past)\s+\d+\s+(minutes?|hours?|days?|weeks?)$/i,
          "Invalid relative time format",
        ),
    ])
    .optional(),
});

/**
 * Schema for log event ordering
 *
 * @public
 */
export const LogOrderSchema = z.enum(["LogStreamName", "LastEventTime"]).default("LogStreamName");

/**
 * Common CloudWatch Logs configuration schema
 *
 * @public
 */
export const CloudWatchLogsConfigSchema = z.object({
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
   * Maximum number of items to return
   */
  limit: z.number().int().min(1).max(10_000).optional(),
});

/**
 * CloudWatch Logs list groups command schema
 *
 * @public
 */
export const CloudWatchLogsListGroupsSchema = CloudWatchLogsConfigSchema.pick({
  region: true,
  profile: true,
  format: true,
  verbose: true,
  limit: true,
}).extend({
  /**
   * Log group name prefix filter
   */
  prefix: z.string().min(1).max(512).optional(),

  /**
   * Order by field for log groups
   */
  orderBy: LogOrderSchema.optional(),

  /**
   * Descending order flag
   */
  descending: z.boolean().default(false),
});

/**
 * CloudWatch Logs describe group command schema
 *
 * @public
 */
export const CloudWatchLogsDescribeGroupSchema = CloudWatchLogsConfigSchema.pick({
  region: true,
  profile: true,
  format: true,
  verbose: true,
}).extend({
  /**
   * Log group name to describe
   */
  logGroupName: LogGroupNameSchema,

  /**
   * Include metric filters information
   */
  includeMetricFilters: z.boolean().default(false),

  /**
   * Include subscription filters information
   */
  includeSubscriptionFilters: z.boolean().default(false),

  /**
   * Include field indexes information
   */
  includeFieldIndexes: z.boolean().default(false),
});

/**
 * CloudWatch Logs tail command schema
 *
 * @public
 */
export const CloudWatchLogsTailSchema = CloudWatchLogsConfigSchema.pick({
  region: true,
  profile: true,
  verbose: true,
}).extend({
  /**
   * Log group names to tail (up to 10)
   */
  logGroupNames: z.array(LogGroupNameSchema).min(1).max(10),

  /**
   * Log stream names to include
   */
  logStreamNames: z.array(LogStreamNameSchema).max(100).optional(),

  /**
   * Log stream name prefix filter
   */
  logStreamNamePrefix: z.string().max(512).optional(),

  /**
   * Filter pattern for log events
   */
  filter: FilterPatternSchema,

  /**
   * Start time for tailing (relative or absolute)
   */
  since: z.string().optional(),

  /**
   * File to save streaming output
   */
  outputFile: z.string().optional(),

  /**
   * Disable colored output
   */
  noColor: z.boolean().default(false),

  /**
   * Show timestamps in output
   */
  showTimestamp: z.boolean().default(true),

  /**
   * Show log stream names in output
   */
  showLogStream: z.boolean().default(false),
});

/**
 * CloudWatch Logs follow command schema
 *
 * @public
 */
export const CloudWatchLogsFollowSchema = CloudWatchLogsConfigSchema.pick({
  region: true,
  profile: true,
  verbose: true,
}).extend({
  /**
   * Log group name to follow
   */
  logGroupName: LogGroupNameSchema,

  /**
   * Log stream pattern to match
   */
  streamPattern: z.string().max(512).optional(),

  /**
   * Use regex for stream pattern matching
   */
  regex: z.boolean().default(false),

  /**
   * Filter pattern for log events
   */
  filter: FilterPatternSchema,

  /**
   * Start time for following (relative or absolute)
   */
  since: z.string().optional(),

  /**
   * File to export streaming data
   */
  exportFile: z.string().optional(),

  /**
   * Maximum number of reconnection attempts
   */
  maxReconnects: z.number().int().min(0).max(20).default(5),

  /**
   * Initial reconnection delay in milliseconds
   */
  reconnectDelay: z.number().int().min(500).max(10_000).default(1000),

  /**
   * Maximum number of events to buffer
   */
  bufferSize: z.number().int().min(100).max(5000).default(500),

  /**
   * Buffer flush interval in milliseconds
   */
  flushInterval: z.number().int().min(1000).max(30_000).default(2000),

  /**
   * Disable colored output
   */
  noColor: z.boolean().default(false),

  /**
   * Show timestamps in output
   */
  showTimestamp: z.boolean().default(true),

  /**
   * Show log stream names in output
   */
  showStreamName: z.boolean().default(true),

  /**
   * Automatically follow new streams matching pattern
   */
  followNewStreams: z.boolean().default(true),
});

/**
 * CloudWatch Logs query command schema
 *
 * @public
 */
export const CloudWatchLogsQuerySchema = CloudWatchLogsConfigSchema.extend({
  /**
   * Log group names to query
   */
  logGroupNames: z.array(LogGroupNameSchema).min(1).max(20),

  /**
   * CloudWatch Logs Insights query
   */
  query: LogsInsightsQuerySchema,

  /**
   * Query language type
   */
  queryLanguage: z
    .enum(["CloudWatchLogsInsights", "OpenSearchPPL", "OpenSearchSQL"])
    .default("CloudWatchLogsInsights"),

  /**
   * Time range for query
   */
  timeRange: TimeRangeSchema,

  /**
   * Maximum execution time in minutes
   */
  maxExecutionTime: z.number().int().min(1).max(60).default(15),

  /**
   * Enable query result caching
   */
  enableCaching: z.boolean().default(true),
});

/**
 * CloudWatch Logs search command schema
 *
 * @public
 */
export const CloudWatchLogsSearchSchema = CloudWatchLogsConfigSchema.extend({
  /**
   * Log group name to search
   */
  logGroupName: LogGroupNameSchema,

  /**
   * Search pattern (text or regex)
   */
  searchPattern: z.string().min(1).max(1024),

  /**
   * Enable regex pattern matching
   */
  regex: z.boolean().default(false),

  /**
   * Case sensitive search
   */
  caseSensitive: z.boolean().default(false),

  /**
   * Time range for search
   */
  timeRange: TimeRangeSchema,

  /**
   * Context lines before match
   */
  contextBefore: z.number().int().min(0).max(10).default(0),

  /**
   * Context lines after match
   */
  contextAfter: z.number().int().min(0).max(10).default(0),

  /**
   * Highlight matching terms
   */
  highlight: z.boolean().default(true),
});

/**
 * CloudWatch Logs filter events command schema
 *
 * @public
 */
export const CloudWatchLogsFilterEventsSchema = CloudWatchLogsConfigSchema.extend({
  /**
   * Log group name to filter
   */
  logGroupName: LogGroupNameSchema,

  /**
   * Log stream names to include
   */
  logStreamNames: z.array(LogStreamNameSchema).max(100).optional(),

  /**
   * Filter pattern for events
   */
  filterPattern: FilterPatternSchema,

  /**
   * Time range for filtering
   */
  timeRange: TimeRangeSchema,

  /**
   * Interleaved results across streams
   */
  interleaved: z.boolean().default(false),

  /**
   * Pagination token for next page
   */
  nextToken: z.string().optional(),
});

/**
 * CloudWatch Logs saved query schema
 *
 * @public
 */
export const SavedQuerySchema = z.object({
  /**
   * Unique query name
   */
  name: z.string().min(1).max(100),

  /**
   * Query description
   */
  description: z.string().max(500).optional(),

  /**
   * CloudWatch Logs Insights query
   */
  query: LogsInsightsQuerySchema,

  /**
   * Default log group names
   */
  defaultLogGroups: z.array(LogGroupNameSchema).optional(),

  /**
   * Query language type
   */
  queryLanguage: z
    .enum(["CloudWatchLogsInsights", "OpenSearchPPL", "OpenSearchSQL"])
    .default("CloudWatchLogsInsights"),

  /**
   * Creation timestamp
   */
  createdAt: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/,
      "Invalid datetime format (ISO 8601)",
    ),

  /**
   * Last used timestamp
   */
  lastUsedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, "Invalid datetime format (ISO 8601)")
    .optional(),

  /**
   * Usage count
   */
  usageCount: z.number().int().min(0).default(0),
});

/**
 * CloudWatch Logs favorites schema
 *
 * @public
 */
export const FavoriteSchema = z.object({
  /**
   * Favorite name/alias
   */
  name: z.string().min(1).max(100),

  /**
   * Favorite type
   */
  type: z.enum(["log-group", "query"]),

  /**
   * Log group name (for log-group favorites)
   */
  logGroupName: LogGroupNameSchema.optional(),

  /**
   * Saved query reference (for query favorites)
   */
  queryName: z.string().optional(),

  /**
   * Description or notes
   */
  description: z.string().max(500).optional(),

  /**
   * Creation timestamp
   */
  createdAt: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/,
      "Invalid datetime format (ISO 8601)",
    ),

  /**
   * Last accessed timestamp
   */
  lastAccessedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, "Invalid datetime format (ISO 8601)")
    .optional(),

  /**
   * Access count
   */
  accessCount: z.number().int().min(0).default(0),
});

/**
 * Live tail parameters schema for streaming operations
 *
 * @public
 */
export const LiveTailParametersSchema = z.object({
  /**
   * Log group identifiers for live tail
   */
  logGroupIdentifiers: z.array(LogGroupNameSchema).min(1).max(10),

  /**
   * Log stream names to include
   */
  logStreamNames: z.array(LogStreamNameSchema).max(100).optional(),

  /**
   * Log stream name prefixes to include
   */
  logStreamNamePrefixes: z.array(z.string().max(512)).max(100).optional(),

  /**
   * Log event filter pattern
   */
  logEventFilterPattern: FilterPatternSchema,
});

// Type exports for TypeScript inference
export type CloudWatchLogsConfig = z.infer<typeof CloudWatchLogsConfigSchema>;
export type CloudWatchLogsListGroups = z.infer<typeof CloudWatchLogsListGroupsSchema>;
export type CloudWatchLogsDescribeGroup = z.infer<typeof CloudWatchLogsDescribeGroupSchema>;
export type CloudWatchLogsTail = z.infer<typeof CloudWatchLogsTailSchema>;
export type CloudWatchLogsFollow = z.infer<typeof CloudWatchLogsFollowSchema>;
export type CloudWatchLogsQuery = z.infer<typeof CloudWatchLogsQuerySchema>;
export type CloudWatchLogsSearch = z.infer<typeof CloudWatchLogsSearchSchema>;
export type CloudWatchLogsFilterEvents = z.infer<typeof CloudWatchLogsFilterEventsSchema>;
export type SavedQuery = z.infer<typeof SavedQuerySchema>;
export type Favorite = z.infer<typeof FavoriteSchema>;
export type LiveTailParameters = z.infer<typeof LiveTailParametersSchema>;
export type TimeRange = z.infer<typeof TimeRangeSchema>;
export type LogGroupName = z.infer<typeof LogGroupNameSchema>;
export type LogStreamName = z.infer<typeof LogStreamNameSchema>;
export type FilterPattern = z.infer<typeof FilterPatternSchema>;
export type LogsInsightsQuery = z.infer<typeof LogsInsightsQuerySchema>;
