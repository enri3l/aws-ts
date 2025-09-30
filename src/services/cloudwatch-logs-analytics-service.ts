/**
 * CloudWatch Logs Analytics service for pattern analysis and metrics extraction
 *
 * Provides analytics capabilities for CloudWatch Logs, including pattern detection,
 * anomaly identification, and metrics generation. Depends on CloudWatchLogsService
 * for raw data retrieval operations.
 *
 */

import ora from "ora";
import type {
  LogMetricDataPoint,
  LogMetricsResult,
  LogPattern,
  MetricSummary,
  PatternAnalysisResult,
  PatternAnomaly,
  PatternWithStats,
  TrendAnalysis,
} from "../lib/cloudwatch-logs-analytics-schemas.js";
import { CloudWatchLogsError } from "../lib/cloudwatch-logs-errors.js";
import type { CloudWatchLogsService, LogEvent } from "./cloudwatch-logs-service.js";
import type { AwsClientConfig } from "./credential-service.js";

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
 * Configuration options for CloudWatch Logs Analytics service
 *
 * @public
 */
export interface CloudWatchLogsAnalyticsServiceOptions {
  /**
   * Enable debug logging for analytics operations
   */
  enableDebugLogging?: boolean;

  /**
   * Enable progress indicators for long-running operations
   */
  enableProgressIndicators?: boolean;
}

/**
 * CloudWatch Logs Analytics service for pattern analysis and metrics extraction
 *
 * Provides advanced analytics capabilities for CloudWatch Logs data, including
 * log pattern detection, anomaly identification, and metrics generation.
 *
 * @public
 */
export class CloudWatchLogsAnalyticsService {
  private readonly options: CloudWatchLogsAnalyticsServiceOptions;

  /**
   * Create a new CloudWatch Logs Analytics service instance
   *
   * @param managementService - CloudWatch Logs management service for data retrieval
   * @param options - Configuration options for the analytics service
   */
  constructor(
    private readonly managementService: CloudWatchLogsService,
    options: CloudWatchLogsAnalyticsServiceOptions = {},
  ) {
    this.options = {
      ...options,
      enableProgressIndicators:
        options.enableProgressIndicators ??
        (process.env.NODE_ENV !== "test" && !process.env.CI && !process.env.VITEST),
    };
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
   * Analyze log patterns in a log group over a specified time period
   *
   * @param logGroupName - Log group name to analyze
   * @param config - Client configuration options
   * @param options - Pattern analysis options
   * @returns Promise resolving to pattern analysis results
   * @throws When pattern analysis fails
   */
  async analyzeLogPatterns(
    logGroupName: string,
    config: AwsClientConfig = {},
    options: {
      startTime?: Date;
      endTime?: Date;
      maxPatterns?: number;
      minOccurrences?: number;
      sampleSize?: number;
    } = {},
  ): Promise<PatternAnalysisResult> {
    const spinner = this.createSpinner(`Analyzing log patterns in '${logGroupName}'...`);

    try {
      const endTime = options.endTime || new Date();
      const startTime = options.startTime || new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // Default: last 24 hours
      const maxPatterns = options.maxPatterns || 20;
      const minOccurrences = options.minOccurrences || 5;
      const sampleSize = options.sampleSize || 1000;

      // Get log samples for pattern analysis
      const filterResult = await this.managementService.filterLogEvents(
        {
          logGroupName,
          startTime,
          endTime,
          limit: sampleSize,
          interleaved: true,
        },
        config,
      );

      const logMessages = filterResult.events.map((event) => event.message);

      // Perform pattern analysis
      const patterns = this.extractLogPatterns(logMessages, maxPatterns, minOccurrences);

      // Calculate pattern statistics
      const totalEvents = logMessages.length;
      const patternStats = patterns.map((pattern) => ({
        ...pattern,
        percentage: (pattern.count / totalEvents) * 100,
        firstSeen: this.findFirstOccurrence(pattern.pattern, filterResult.events) || undefined,
        lastSeen: this.findLastOccurrence(pattern.pattern, filterResult.events) || undefined,
      }));

      // Detect anomalies (patterns with unusual frequency)
      const anomalies = this.detectPatternAnomalies(patternStats);

      const result: PatternAnalysisResult = {
        logGroupName,
        analysisTime: new Date(),
        timeRange: { startTime, endTime },
        totalEvents,
        sampleSize: logMessages.length,
        patterns: patternStats,
        anomalies,
        summary: {
          uniquePatterns: patternStats.length,
          topPattern: patternStats[0]?.pattern ?? undefined,
          coveragePercentage: patternStats.reduce((sum, p) => sum + p.percentage, 0),
          anomalyCount: anomalies.length,
        },
      };

      spinner.succeed(`Found ${patterns.length} patterns in ${totalEvents} log events`);
      return result;
    } catch (error) {
      spinner.fail(`Failed to analyze patterns in log group '${logGroupName}'`);
      throw new CloudWatchLogsError(
        `Pattern analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        "analyze-patterns",
        logGroupName,
        error,
      );
    }
  }

  /**
   * Extract metrics and analytics from log data
   *
   * @param logGroupName - Log group name to analyze
   * @param config - Client configuration options
   * @param options - Metrics extraction options
   * @returns Promise resolving to log metrics and analytics
   * @throws When metrics extraction fails
   */
  async extractLogMetrics(
    logGroupName: string,
    config: AwsClientConfig = {},
    options: {
      startTime?: Date;
      endTime?: Date;
      metricType?: "error-rate" | "performance" | "volume" | "custom";
      customQuery?: string;
      groupBy?: "hour" | "day" | "minute";
      errorPatterns?: string[];
      performanceFields?: string[];
    } = {},
  ): Promise<LogMetricsResult> {
    const spinner = this.createSpinner(`Extracting metrics from '${logGroupName}'...`);

    try {
      const endTime = options.endTime || new Date();
      const startTime = options.startTime || new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // Default: last 24 hours
      const metricType = options.metricType || "volume";
      const groupBy = options.groupBy || "hour";

      let queryString = "";
      let metricData: LogMetricDataPoint[] = [];

      switch (metricType) {
        case "error-rate": {
          queryString = this.buildErrorRateQuery(
            options.errorPatterns || ["ERROR", "error", "exception"],
            groupBy,
          );
          break;
        }
        case "performance": {
          queryString = this.buildPerformanceQuery(
            options.performanceFields || ["duration", "response_time", "latency"],
            groupBy,
          );
          break;
        }
        case "volume": {
          queryString = this.buildVolumeQuery(groupBy);
          break;
        }
        case "custom": {
          if (!options.customQuery) {
            throw new CloudWatchLogsError(
              "Custom query is required when metricType is 'custom'",
              "extract-metrics",
              logGroupName,
            );
          }
          queryString = options.customQuery;
          break;
        }
      }

      // Execute the metrics query
      const queryResult = await this.managementService.executeQuery(
        {
          logGroupNames: [logGroupName],
          query: queryString,
          startTime,
          endTime,
          limit: 1000,
        },
        config,
      );

      if (queryResult.results) {
        metricData = queryResult.results.map((row) => {
          const record: LogMetricDataPoint = {
            timestamp: new Date().toISOString(),
            value: 0,
          };

          for (const field of row) {
            if (field.field && field.value !== undefined) {
              const parsedValue = this.parseMetricValue(field.value ?? "");

              // Map known fields to LogMetricDataPoint properties
              if (field.field === "timestamp") {
                record.timestamp = String(parsedValue);
              } else if (field.field === "value") {
                record.value = Number(parsedValue) || 0;
              } else {
                // Use the index signature for other fields
                record[field.field] = parsedValue;
              }
            }
          }
          return record;
        });
      }

      // Calculate summary statistics
      const summary = this.calculateMetricSummary(metricData, metricType);

      // Generate trend analysis
      const trends = this.analyzeTrends(metricData, groupBy);

      const result: LogMetricsResult = {
        logGroupName,
        metricType,
        timeRange: { startTime, endTime },
        queryExecuted: queryString,
        dataPoints: metricData,
        summary,
        trends,
        ...(queryResult.statistics && { statistics: queryResult.statistics }),
        generatedAt: new Date(),
      };

      spinner.succeed(`Extracted ${metricData.length} data points for ${metricType} metrics`);
      return result;
    } catch (error) {
      spinner.fail(`Failed to extract metrics from log group '${logGroupName}'`);
      if (error instanceof CloudWatchLogsError) {
        throw error;
      }
      throw new CloudWatchLogsError(
        `Metrics extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        "extract-metrics",
        logGroupName,
        error,
      );
    }
  }

  /**
   * Extract patterns from log messages using frequency analysis
   * @param messages - Array of log messages to analyze
   * @param maxPatterns - Maximum number of patterns to return
   * @param minOccurrences - Minimum occurrences for a pattern to be included
   * @returns Array of log patterns sorted by frequency
   * @internal
   */
  private extractLogPatterns(
    messages: string[],
    maxPatterns: number,
    minOccurrences: number,
  ): LogPattern[] {
    const patternMap = new Map<string, number>();

    // Simple pattern extraction - group by message structure
    for (const message of messages) {
      // Normalize message by replacing variable parts (timestamps, IDs, etc.)
      const normalized = message
        .replaceAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, "[TIMESTAMP]")
        .replaceAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[UUID]")
        .replaceAll(/\b\d+\b/g, "[NUMBER]")
        .replaceAll(/\b[a-f0-9]{32,}\b/gi, "[HASH]")
        .replaceAll(/\b\w+@\w+\.\w+\b/g, "[EMAIL]")
        .replaceAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP]");

      const count = patternMap.get(normalized) || 0;
      patternMap.set(normalized, count + 1);
    }

    // Filter and sort patterns
    return [...patternMap.entries()]
      .filter(([, count]) => count >= minOccurrences)
      .toSorted(([, a], [, b]) => b - a)
      .slice(0, maxPatterns)
      .map(([pattern, count]) => ({
        pattern,
        count,
        examples: messages
          .filter((message) => this.normalizeForPattern(message) === pattern)
          .slice(0, 3),
      }));
  }

  /**
   * Normalize message for pattern matching
   * @param message - Message to normalize
   * @returns Normalized message with placeholders for timestamps, UUIDs, and numbers
   * @internal
   */
  private normalizeForPattern(message: string): string {
    return message
      .replaceAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, "[TIMESTAMP]")
      .replaceAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[UUID]")
      .replaceAll(/\b\d+\b/g, "[NUMBER]")
      .replaceAll(/\b[a-f0-9]{32,}\b/gi, "[HASH]")
      .replaceAll(/\b\w+@\w+\.\w+\b/g, "[EMAIL]")
      .replaceAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP]");
  }

  /**
   * Find first occurrence of a pattern in events
   * @param pattern - Pattern to search for
   * @param events - Array of log events to search
   * @returns Date of first occurrence or undefined if not found
   * @internal
   */
  private findFirstOccurrence(pattern: string, events: LogEvent[]): Date | undefined {
    for (const event of events) {
      if (this.normalizeForPattern(event.message) === pattern) {
        return new Date(event.timestamp);
      }
    }
    return undefined;
  }

  /**
   * Find last occurrence of a pattern in events
   * @param pattern - Pattern to search for
   * @param events - Array of log events to search
   * @returns Date of last occurrence or undefined if not found
   * @internal
   */
  private findLastOccurrence(pattern: string, events: LogEvent[]): Date | undefined {
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index];
      if (
        event?.message &&
        event?.timestamp &&
        this.normalizeForPattern(event.message) === pattern
      ) {
        return new Date(event.timestamp);
      }
    }
    return undefined;
  }

  /**
   * Detect pattern anomalies based on frequency analysis
   * @param patterns - Array of patterns with statistics
   * @returns Array of detected anomalies
   * @internal
   */
  private detectPatternAnomalies(patterns: PatternWithStats[]): PatternAnomaly[] {
    const anomalies: PatternAnomaly[] = [];
    const avgPercentage = patterns.reduce((sum, p) => sum + p.percentage, 0) / patterns.length;
    const threshold = avgPercentage * 3; // 3x average is considered anomalous

    for (const pattern of patterns) {
      if (pattern.percentage > threshold) {
        anomalies.push({
          pattern: pattern.pattern,
          count: pattern.count,
          percentage: pattern.percentage,
          anomalyType: "high-frequency",
          severity: pattern.percentage > threshold * 2 ? "high" : "medium",
          description: `Pattern occurs ${pattern.percentage.toFixed(1)}% of the time (${threshold.toFixed(1)}% above average)`,
        });
      }
    }

    return anomalies;
  }

  /**
   * Build error rate query string
   * @param errorPatterns - Array of error patterns to search for
   * @param groupBy - Time grouping for results
   * @returns CloudWatch Logs Insights query string
   * @internal
   */
  private buildErrorRateQuery(errorPatterns: string[], groupBy: string): string {
    const patterns = errorPatterns.map((p) => `@message like /${p}/`).join(" or ");
    const timeBucket = this.getTimeBucketForGroupBy(groupBy);

    return `
      fields @timestamp, @message
      | filter ${patterns}
      | stats count() as errors by bin(5${timeBucket}) as time_bucket
      | sort time_bucket
    `.trim();
  }

  /**
   * Get time bucket format for groupBy option
   * @param groupBy - Time grouping option (minute, hour, day)
   * @returns Time bucket format for CloudWatch Logs Insights
   * @internal
   */
  private getTimeBucketForGroupBy(groupBy: string): string {
    if (groupBy === "minute") {
      return "m";
    }
    if (groupBy === "hour") {
      return "h";
    }
    return "d";
  }

  /**
   * Get time format for groupBy option
   * @param groupBy - Time grouping option (minute, hour, day)
   * @returns Time format string for CloudWatch Logs Insights
   * @internal
   */
  private getTimeFormatForGroupBy(groupBy: string): string {
    if (groupBy === "minute") {
      return "5m";
    }
    if (groupBy === "hour") {
      return "1h";
    }
    return "1d";
  }

  /**
   * Build performance metrics query string
   * @param performanceFields - Array of performance field names to extract
   * @param groupBy - Time grouping for results
   * @returns CloudWatch Logs Insights query string
   * @internal
   */
  private buildPerformanceQuery(performanceFields: string[], groupBy: string): string {
    const timeFormat = this.getTimeFormatForGroupBy(groupBy);

    return `
      fields @timestamp, @message
      | filter @message like /duration|response_time|latency/
      | parse @message /(?<metric_name>duration|response_time|latency)[:s=]+(?<metric_value>d+.?d*)/
      | stats avg(metric_value) as avg_performance, max(metric_value) as max_performance, min(metric_value) as min_performance by bin(${timeFormat}) as time_bucket
      | sort time_bucket
    `.trim();
  }

  /**
   * Build volume metrics query string
   * @param groupBy - Time grouping for results
   * @returns CloudWatch Logs Insights query string
   * @internal
   */
  private buildVolumeQuery(groupBy: string): string {
    const timeFormat = this.getTimeFormatForGroupBy(groupBy);

    return `
      fields @timestamp
      | stats count() as log_volume by bin(${timeFormat}) as time_bucket
      | sort time_bucket
    `.trim();
  }

  /**
   * Parse metric value from string
   * @param value - String value to parse
   * @returns Parsed number or original string if not a valid number
   * @internal
   */
  private parseMetricValue(value: string): number | string {
    // Try to parse as number
    const numberValue = Number.parseFloat(value);
    return Number.isNaN(numberValue) ? value : numberValue;
  }

  /**
   * Calculate summary statistics for metrics
   * @param data - Array of metric data points
   * @param metricType - Type of metric being calculated
   * @returns Summary statistics for the metrics
   * @internal
   */
  private calculateMetricSummary(
    data: Record<string, unknown>[],
    metricType: string,
  ): MetricSummary {
    if (data.length === 0) {
      return {
        totalDataPoints: 0,
        timeSpan: "0h",
        averageValue: 0,
        minValue: 0,
        maxValue: 0,
        trend: "stable",
      };
    }

    // Extract numeric values based on metric type
    let values: number[] = [];
    const valueField = this.getValueFieldForMetricType(metricType);

    values = data.map((d) => {
      const value = d[valueField];
      return typeof value === "number" ? value : 0;
    });

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Simple trend calculation (compare first half vs second half)
    const midpoint = Math.floor(values.length / 2);
    const firstHalfAvg = values.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;
    const secondHalfAvg =
      values.slice(midpoint).reduce((a, b) => a + b, 0) / (values.length - midpoint);

    let trend: "increasing" | "decreasing" | "stable" = "stable";
    if (secondHalfAvg > firstHalfAvg * 1.1) trend = "increasing";
    else if (secondHalfAvg < firstHalfAvg * 0.9) trend = "decreasing";

    return {
      totalDataPoints: data.length,
      timeSpan: `${data.length}h`, // Simplified
      averageValue: avg,
      minValue: min,
      maxValue: max,
      trend,
    };
  }

  /**
   * Get value field name for metric type
   * @param metricType - Type of metric
   * @returns Field name to extract from data
   * @internal
   */
  private getValueFieldForMetricType(metricType: string): string {
    switch (metricType) {
      case "error-rate": {
        return "errors";
      }
      case "volume": {
        return "log_volume";
      }
      default: {
        return "avg_performance";
      }
    }
  }

  /**
   * Analyze trends in metric data
   * @param data - Array of metric data points
   * @param _groupBy - Time grouping (reserved for future use)
   * @returns Array of trend analysis results
   * @internal
   */
  private analyzeTrends(data: Record<string, unknown>[], _groupBy: string): TrendAnalysis[] {
    if (data.length < 2) return [];

    const trends: TrendAnalysis[] = [];

    // Simple trend analysis for volume
    if (data.every((d) => typeof d.log_volume === "number")) {
      const volumes = data.map((d) => d.log_volume as number);
      const lastVolume = volumes.at(-1);
      const firstVolume = volumes[0];

      if (lastVolume === undefined || firstVolume === undefined) {
        return trends;
      }

      const change = lastVolume - firstVolume;
      const changePercent = (change / firstVolume) * 100;

      let direction: "increasing" | "decreasing" | "stable";
      if (change > 0) {
        direction = "increasing";
      } else if (change < 0) {
        direction = "decreasing";
      } else {
        direction = "stable";
      }

      let changeDescription: string;
      if (change > 0) {
        changeDescription = "increased";
      } else if (change < 0) {
        changeDescription = "decreased";
      } else {
        changeDescription = "remained stable";
      }

      trends.push({
        metric: "log_volume",
        direction,
        magnitude: Math.abs(changePercent),
        confidence: volumes.length > 5 ? "high" : "medium",
        description: `Log volume ${changeDescription} by ${Math.abs(changePercent).toFixed(1)}%`,
      });
    }

    return trends;
  }
}
