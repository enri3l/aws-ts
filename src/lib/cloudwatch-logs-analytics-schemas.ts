/**
 * CloudWatch Logs analytics and insights schemas and interfaces
 *
 * Provides comprehensive validation schemas and TypeScript interfaces for
 * CloudWatch Logs pattern analysis and metrics extraction operations.
 *
 */

import { z } from "zod";
import {
  CloudWatchLogsConfigSchema,
  LogGroupNameSchema,
  TimeRangeSchema,
} from "./cloudwatch-logs-schemas.js";

/**
 * Schema for pattern analysis command
 *
 * @public
 */
export const CloudWatchLogsAnalyzePatternsSchema = CloudWatchLogsConfigSchema.extend({
  /**
   * Log group name to analyze
   */
  logGroupName: LogGroupNameSchema,

  /**
   * Time range for pattern analysis
   */
  timeRange: TimeRangeSchema,

  /**
   * Maximum number of patterns to identify
   */
  maxPatterns: z.number().int().min(5).max(100).default(20),

  /**
   * Minimum occurrences for a pattern to be included
   */
  minOccurrences: z.number().int().min(1).max(100).default(5),

  /**
   * Sample size for pattern analysis
   */
  sampleSize: z.number().int().min(100).max(10_000).default(1000),

  /**
   * Include anomaly detection
   */
  detectAnomalies: z.boolean().default(true),

  /**
   * Export analysis results to file
   */
  exportFile: z.string().optional(),
});

/**
 * Schema for metrics extraction command
 *
 * @public
 */
export const CloudWatchLogsMetricsSchema = CloudWatchLogsConfigSchema.extend({
  /**
   * Log group name to analyze
   */
  logGroupName: LogGroupNameSchema,

  /**
   * Time range for metrics extraction
   */
  timeRange: TimeRangeSchema,

  /**
   * Type of metrics to extract
   */
  metricType: z.enum(["error-rate", "performance", "volume", "custom"]).default("volume"),

  /**
   * Custom query for metric extraction (required when metricType is 'custom')
   */
  customQuery: z.string().min(1).max(10_000).optional(),

  /**
   * Time grouping for metrics
   */
  groupBy: z.enum(["minute", "hour", "day"]).default("hour"),

  /**
   * Error patterns to search for (for error-rate metrics)
   */
  errorPatterns: z.array(z.string()).optional(),

  /**
   * Performance field names to extract (for performance metrics)
   */
  performanceFields: z.array(z.string()).optional(),

  /**
   * Include trend analysis
   */
  includeTrends: z.boolean().default(true),

  /**
   * Export metrics data to file
   */
  exportFile: z.string().optional(),
});

/**
 * Log pattern interface
 *
 * @public
 */
export interface LogPattern {
  /**
   * Normalized pattern string
   */
  pattern: string;

  /**
   * Number of occurrences
   */
  count: number;

  /**
   * Example messages matching this pattern
   */
  examples: string[];
}

/**
 * Enhanced pattern with statistics
 *
 * @public
 */
export interface PatternWithStats extends LogPattern {
  /**
   * Percentage of total events
   */
  percentage: number;

  /**
   * First occurrence time
   */
  firstSeen: Date | undefined;

  /**
   * Last occurrence time
   */
  lastSeen: Date | undefined;
}

/**
 * Pattern anomaly detection result
 *
 * @public
 */
export interface PatternAnomaly {
  /**
   * Pattern that shows anomalous behavior
   */
  pattern: string;

  /**
   * Occurrence count
   */
  count: number;

  /**
   * Percentage of total events
   */
  percentage: number;

  /**
   * Type of anomaly detected
   */
  anomalyType: "high-frequency" | "low-frequency" | "irregular-timing" | "unusual-pattern";

  /**
   * Severity level
   */
  severity: "low" | "medium" | "high" | "critical";

  /**
   * Human-readable description
   */
  description: string;
}

/**
 * Pattern analysis result interface
 *
 * @public
 */
export interface PatternAnalysisResult {
  /**
   * Log group that was analyzed
   */
  logGroupName: string;

  /**
   * Analysis execution time
   */
  analysisTime: Date;

  /**
   * Time range analyzed
   */
  timeRange: {
    startTime: Date;
    endTime: Date;
  };

  /**
   * Total number of events analyzed
   */
  totalEvents: number;

  /**
   * Sample size used for analysis
   */
  sampleSize: number;

  /**
   * Identified patterns with statistics
   */
  patterns: PatternWithStats[];

  /**
   * Detected anomalies
   */
  anomalies: PatternAnomaly[];

  /**
   * Analysis summary
   */
  summary: {
    uniquePatterns: number;
    topPattern: string | undefined;
    coveragePercentage: number;
    anomalyCount: number;
  };
}

/**
 * Metric summary statistics
 *
 * @public
 */
export interface MetricSummary {
  /**
   * Total number of data points
   */
  totalDataPoints: number;

  /**
   * Time span covered
   */
  timeSpan: string;

  /**
   * Average metric value
   */
  averageValue: number;

  /**
   * Minimum metric value
   */
  minValue: number;

  /**
   * Maximum metric value
   */
  maxValue: number;

  /**
   * Overall trend direction
   */
  trend: "increasing" | "decreasing" | "stable";
}

/**
 * CloudWatch Logs metric data point
 *
 * @public
 */
export interface LogMetricDataPoint {
  /**
   * Timestamp for the data point
   */
  timestamp: string;

  /**
   * Metric value
   */
  value: number;

  /**
   * Additional metric fields from the query
   */
  fields?: Record<string, string | number>;

  /**
   * Time bucket for aggregated data
   */
  time_bucket?: string;

  /**
   * Error count for error-rate metrics
   */
  errors?: number;

  /**
   * Log volume for volume metrics
   */
  log_volume?: number;

  /**
   * Performance metrics
   */
  avg_performance?: number;
  min_performance?: number;
  max_performance?: number;

  /**
   * Allow any additional fields for custom metrics
   */
  [key: string]: unknown;
}

/**
 * Trend analysis result
 *
 * @public
 */
export interface TrendAnalysis {
  /**
   * Metric name
   */
  metric: string;

  /**
   * Trend direction
   */
  direction: "increasing" | "decreasing" | "stable";

  /**
   * Magnitude of change (percentage)
   */
  magnitude: number;

  /**
   * Confidence level in the trend
   */
  confidence: "low" | "medium" | "high";

  /**
   * Human-readable description
   */
  description: string;
}

/**
 * Log metrics extraction result interface
 *
 * @public
 */
export interface LogMetricsResult {
  /**
   * Log group that was analyzed
   */
  logGroupName: string;

  /**
   * Type of metrics extracted
   */
  metricType: "error-rate" | "performance" | "volume" | "custom";

  /**
   * Time range analyzed
   */
  timeRange: {
    startTime: Date;
    endTime: Date;
  };

  /**
   * Query that was executed
   */
  queryExecuted: string;

  /**
   * Extracted data points
   */
  dataPoints: LogMetricDataPoint[];

  /**
   * Summary statistics
   */
  summary: MetricSummary;

  /**
   * Trend analysis results
   */
  trends: TrendAnalysis[];

  /**
   * Query execution statistics
   */
  statistics?: {
    recordsMatched?: number;
    recordsScanned?: number;
    bytesScanned?: number;
  };

  /**
   * Result generation time
   */
  generatedAt: Date;
}

// Type exports for TypeScript inference
export type CloudWatchLogsAnalyzePatterns = z.infer<typeof CloudWatchLogsAnalyzePatternsSchema>;
export type CloudWatchLogsMetrics = z.infer<typeof CloudWatchLogsMetricsSchema>;
