/**
 * CloudWatch Logs metrics command
 *
 * Extracts metrics and analytics from CloudWatch log data including error rates,
 * performance metrics, volume analysis, and custom metric extraction.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import {
  CloudWatchLogsMetricsSchema,
  type CloudWatchLogsMetrics,
  type LogMetricsResult,
} from "../../../lib/cloudwatch-logs-analytics-schemas.js";
import { handleCloudWatchLogsCommandError } from "../../../lib/cloudwatch-logs-errors.js";
import { DataFormat, DataProcessor } from "../../../lib/data-processing.js";
import { parseTimeRange } from "../../../lib/time-utilities.js";
import { CloudWatchLogsAnalyticsService } from "../../../services/cloudwatch-logs-analytics-service.js";
import { CloudWatchLogsService } from "../../../services/cloudwatch-logs-service.js";

/**
 * Base data point interface
 * @internal
 */
interface BaseDataPoint {
  time_bucket?: string;
}

/**
 * Error rate data point
 * @internal
 */
interface ErrorRateDataPoint extends BaseDataPoint {
  errors?: number;
}

/**
 * Volume data point
 * @internal
 */
interface VolumeDataPoint extends BaseDataPoint {
  log_volume?: number;
}

/**
 * Performance data point
 * @internal
 */
interface PerformanceDataPoint extends BaseDataPoint {
  avg_performance?: number;
  min_performance?: number;
  max_performance?: number;
}

/**
 * Custom data point (allows any additional fields)
 * @internal
 */
interface CustomDataPoint extends BaseDataPoint {
  [key: string]: unknown;
}

/**
 * Union type for all data point types
 * @internal
 */
type MetricDataPoint =
  | ErrorRateDataPoint
  | VolumeDataPoint
  | PerformanceDataPoint
  | CustomDataPoint;

/**
 * CloudWatch Logs metrics command implementation
 *
 * @public
 */
export default class CloudWatchLogsMetricsCommand extends Command {
  static override readonly summary = "Extract metrics and analytics from CloudWatch log data";

  static override readonly description = `
Extracts metrics and analytics from CloudWatch log data including error rates,
performance metrics, volume analysis, and custom metric extraction using
CloudWatch Logs Insights queries.

The command supports multiple metric types with automatic trend analysis,
summary statistics, and export capabilities for further analysis and monitoring.

METRIC TYPES:
• error-rate: Extract error patterns and calculate error rates over time
• performance: Analyze timing metrics like latency, duration, response time
• volume: Analyze log volume trends and patterns over time
• custom: Execute custom CloudWatch Logs Insights queries for specific metrics

FEATURES:
• Time-series data with configurable grouping (minute, hour, day)
• Trend analysis with direction, magnitude, and confidence levels
• Summary statistics including min, max, average, and trend direction
• Export capabilities for integration with monitoring and analysis tools
• Cost analysis with bytes scanned and query optimization recommendations

EXAMPLES:
  # Extract error rate metrics for the last 24 hours
  $ aws-ts cloudwatch:logs:metrics /aws/lambda/my-function --metric-type error-rate

  # Analyze performance metrics with custom error patterns
  $ aws-ts cloudwatch:logs:metrics /aws/lambda/my-function \\
    --metric-type error-rate \\
    --error-patterns "ERROR,FATAL,exception,timeout"

  # Volume analysis with hourly grouping
  $ aws-ts cloudwatch:logs:metrics /aws/lambda/my-function \\
    --metric-type volume \\
    --group-by hour \\
    --start-time "last 7 days"

  # Custom metrics with CloudWatch Logs Insights query
  $ aws-ts cloudwatch:logs:metrics /aws/lambda/my-function \\
    --metric-type custom \\
    --custom-query "fields @timestamp | filter @message like /CUSTOM_METRIC/ | stats count() by bin(1h)"

  # Performance metrics with export to file
  $ aws-ts cloudwatch:logs:metrics /aws/lambda/my-function \\
    --metric-type performance \\
    --performance-fields "latency,duration,response_time" \\
    --export-file metrics-report.json \\
    --format json
`;

  static override readonly examples = [
    {
      description: "Extract error rate metrics",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --metric-type error-rate",
    },
    {
      description: "Volume analysis with custom time range",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --metric-type volume --start-time 'last 7 days'",
    },
  ];

  static override readonly flags = {
    region: Flags.string({
      char: "r",
      description: "AWS region for CloudWatch Logs",
      env: "AWS_REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      env: "AWS_PROFILE",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for metrics results",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with detailed information",
      default: false,
    }),

    "start-time": Flags.string({
      description:
        "Start time for metrics extraction (ISO 8601, Unix timestamp, or relative like 'last 24 hours')",
      helpValue: "2025-01-01T00:00:00Z",
    }),

    "end-time": Flags.string({
      description: "End time for metrics extraction (ISO 8601, Unix timestamp, or relative)",
      helpValue: "2025-01-01T23:59:59Z",
    }),

    "metric-type": Flags.string({
      description: "Type of metrics to extract",
      options: ["error-rate", "performance", "volume", "custom"],
      default: "volume",
    }),

    "custom-query": Flags.string({
      description: "Custom CloudWatch Logs Insights query (required when metric-type is 'custom')",
      helpValue: "fields @timestamp | stats count() by bin(1h)",
    }),

    "group-by": Flags.string({
      description: "Time grouping for metrics aggregation",
      options: ["minute", "hour", "day"],
      default: "hour",
    }),

    "error-patterns": Flags.string({
      description: "Comma-separated error patterns to search for (for error-rate metrics)",
      default: "ERROR,error,exception,FATAL,WARN",
    }),

    "performance-fields": Flags.string({
      description: "Comma-separated performance field names to extract (for performance metrics)",
      default: "duration,response_time,latency",
    }),

    "include-trends": Flags.boolean({
      description: "Include trend analysis in results",
      default: true,
      allowNo: true,
    }),

    "export-file": Flags.string({
      description: "Export metrics data to specified file",
      helpValue: "metrics-report.json",
    }),
  };

  static override readonly args = {
    logGroupName: Args.string({
      description: "CloudWatch log group name to analyze",
      required: true,
    }),
  };

  /**
   *
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(CloudWatchLogsMetricsCommand);

    try {
      // Parse and validate input parameters
      const timeRange = parseTimeRange(flags["start-time"], flags["end-time"]);

      const input: CloudWatchLogsMetrics = CloudWatchLogsMetricsSchema.parse({
        logGroupName: args.logGroupName,
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
        timeRange,
        metricType: flags["metric-type"],
        customQuery: flags["custom-query"],
        groupBy: flags["group-by"],
        errorPatterns: flags["error-patterns"]?.split(",").map((p) => p.trim()),
        performanceFields: flags["performance-fields"]?.split(",").map((f) => f.trim()),
        includeTrends: flags["include-trends"],
        exportFile: flags["export-file"],
      });

      // Validate custom query if needed
      if (input.metricType === "custom" && !input.customQuery) {
        this.error(
          "Custom query is required when metric-type is 'custom'. Use --custom-query flag.",
          { exit: 1 },
        );
      }

      // Initialize CloudWatch Logs services
      const managementService = new CloudWatchLogsService({
        enableDebugLogging: input.verbose,
        credentialService: {
          ...(input.region && { defaultRegion: input.region }),
          ...(input.profile && { defaultProfile: input.profile }),
        },
      });

      const analyticsService = new CloudWatchLogsAnalyticsService(managementService, {
        enableDebugLogging: input.verbose,
      });

      // Execute metrics extraction
      const metricsResult = await analyticsService.extractLogMetrics(
        input.logGroupName,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          ...(input.timeRange.startTime && { startTime: new Date(input.timeRange.startTime) }),
          ...(input.timeRange.endTime && { endTime: new Date(input.timeRange.endTime) }),
          metricType: input.metricType,
          ...(input.customQuery && { customQuery: input.customQuery }),
          groupBy: input.groupBy,
          ...(input.errorPatterns && { errorPatterns: input.errorPatterns }),
          ...(input.performanceFields && { performanceFields: input.performanceFields }),
        },
      );

      // Process and display results
      if (input.format === "table") {
        this.displayMetricsTable(metricsResult, input.verbose);
      } else {
        const processor = new DataProcessor({
          format: DataFormat[input.format.toUpperCase() as keyof typeof DataFormat],
        });
        const output = processor.formatOutput([
          { data: metricsResult as unknown as Record<string, unknown>, index: 0 },
        ]);
        this.log(output);
      }

      // Export results if requested
      if (input.exportFile) {
        const fs = await import("node:fs/promises");
        await fs.writeFile(input.exportFile, JSON.stringify(metricsResult, undefined, 2), "utf8");
        this.log(`\nMetrics data exported to: ${input.exportFile}`);
      }
    } catch (error) {
      const formattedError = handleCloudWatchLogsCommandError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Display metrics results in table format
   * @internal
   */
  private displayMetricsTable(result: LogMetricsResult, verbose: boolean): void {
    // Display metrics summary
    this.log(`\n ${result.metricType.toUpperCase()} Metrics for: ${result.logGroupName}`);
    this.log(
      ` Analysis Period: ${result.timeRange.startTime.toISOString()} to ${result.timeRange.endTime.toISOString()}`,
    );
    this.log(` Data Points: ${result.summary.totalDataPoints.toLocaleString()}`);
    this.log(`Time Span: ${result.summary.timeSpan}`);
    this.log(` Average Value: ${result.summary.averageValue.toFixed(2)}`);
    this.log(` Min Value: ${result.summary.minValue.toFixed(2)}`);
    this.log(` Max Value: ${result.summary.maxValue.toFixed(2)}`);
    this.log(` Trend: ${this.formatTrend(result.summary.trend)}`);

    // Display query execution statistics
    if (result.statistics && verbose) {
      this.log("\n Query Execution Statistics:");
      this.log(` Records Matched: ${result.statistics.recordsMatched?.toLocaleString() || "N/A"}`);
      this.log(`Records Scanned: ${result.statistics.recordsScanned?.toLocaleString() || "N/A"}`);
      this.log(` Bytes Scanned: ${this.formatBytes(result.statistics.bytesScanned || 0)}`);
    }

    // Display data points table
    if (result.dataPoints.length > 0) {
      this.log(`\n ${result.metricType.toUpperCase()} Data Points:`);
      const displayData = result.dataPoints
        .slice(0, 20)
        .map((point: MetricDataPoint, index: number) => {
          const row: Record<string, unknown> = { "#": index + 1 };

          // Add time bucket if available
          if (point.time_bucket) {
            row["Time"] = new Date(point.time_bucket).toISOString().replace("T", " ").slice(0, 16);
          }

          // Add metric-specific columns
          switch (result.metricType) {
            case "error-rate": {
              const errorPoint = point as ErrorRateDataPoint;
              row["Errors"] = errorPoint.errors || 0;
              break;
            }
            case "volume": {
              const volumePoint = point as VolumeDataPoint;
              row["Log Volume"] = (volumePoint.log_volume || 0).toLocaleString();
              break;
            }
            case "performance": {
              const perfPoint = point as PerformanceDataPoint;
              row["Avg Performance"] = (perfPoint.avg_performance || 0).toFixed(2);
              if (verbose) {
                row["Min"] = (perfPoint.min_performance || 0).toFixed(2);
                row["Max"] = (perfPoint.max_performance || 0).toFixed(2);
              }
              break;
            }
            default: {
              // Custom metrics - add all available fields
              const customPoint = point as CustomDataPoint;
              for (const key of Object.keys(customPoint)) {
                if (key !== "time_bucket") {
                  row[key] = customPoint[key];
                }
              }
            }
          }

          return row;
        });

      console.table(displayData);

      if (result.dataPoints.length > 20) {
        this.log(`\n... and ${result.dataPoints.length - 20} more data points`);
      }
    }

    // Display trend analysis
    if (result.trends.length > 0) {
      this.log("\n Trend Analysis:");
      console.table(
        result.trends.map((trend, index: number) => ({
          "#": index + 1,
          Metric: trend.metric,
          Direction: this.formatTrend(trend.direction),
          Magnitude: `${trend.magnitude.toFixed(1)}%`,
          Confidence: trend.confidence.toUpperCase(),
          Description: trend.description,
        })),
      );
    }

    // Display recommendations
    this.displayRecommendations(result);

    this.log("\nMetrics extraction complete");
  }

  /**
   * Format trend direction with emojis
   * @returns Formatted trend string with emoji
   * @internal
   */
  private formatTrend(trend: string): string {
    switch (trend) {
      case "increasing": {
        return " INCREASING";
      }
      case "decreasing": {
        return " DECREASING";
      }
      case "stable": {
        return "STABLE";
      }
      default: {
        return trend.toUpperCase();
      }
    }
  }

  /**
   * Format bytes with appropriate units
   * @returns Formatted bytes string with units
   * @internal
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const index = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, index)).toFixed(1)} ${sizes[index]}`;
  }

  /**
   * Display recommendations based on metrics
   * @internal
   */
  private displayRecommendations(result: LogMetricsResult): void {
    const recommendations: string[] = [];

    // Add metric-specific recommendations
    this.addMetricTypeRecommendations(result, recommendations);

    // Add cost optimization recommendations
    this.addCostOptimizationRecommendations(result, recommendations);

    // Display recommendations if any exist
    if (recommendations.length > 0) {
      this.log("\nRecommendations:");
      for (const [index, rec] of recommendations.entries()) {
        this.log(`${index + 1}. ${rec}`);
      }
    }
  }

  /**
   * Add recommendations based on metric type
   * @internal
   */
  private addMetricTypeRecommendations(result: LogMetricsResult, recommendations: string[]): void {
    switch (result.metricType) {
      case "error-rate": {
        this.addErrorRateRecommendations(result, recommendations);
        break;
      }
      case "volume": {
        this.addVolumeRecommendations(result, recommendations);
        break;
      }
      case "performance": {
        this.addPerformanceRecommendations(result, recommendations);
        break;
      }
    }
  }

  /**
   * Add error rate specific recommendations
   * @internal
   */
  private addErrorRateRecommendations(result: LogMetricsResult, recommendations: string[]): void {
    if (result.summary.trend === "increasing") {
      recommendations.push("Error rate is increasing - investigate recent changes");
    }
    if (result.summary.averageValue > 5) {
      recommendations.push(
        "High error rate detected - consider implementing error monitoring alerts",
      );
    }
  }

  /**
   * Add volume specific recommendations
   * @internal
   */
  private addVolumeRecommendations(result: LogMetricsResult, recommendations: string[]): void {
    if (result.summary.trend === "increasing") {
      recommendations.push(
        " Log volume is increasing - monitor storage costs and retention policies",
      );
    }
    if (result.summary.maxValue > result.summary.averageValue * 3) {
      recommendations.push("Volume spikes detected - consider implementing volume-based alerts");
    }
  }

  /**
   * Add performance specific recommendations
   * @internal
   */
  private addPerformanceRecommendations(result: LogMetricsResult, recommendations: string[]): void {
    if (result.summary.trend === "increasing") {
      recommendations.push(" Performance is degrading - investigate performance bottlenecks");
    }
    if (result.summary.maxValue > result.summary.averageValue * 2) {
      recommendations.push(" Performance spikes detected - implement latency monitoring");
    }
  }

  /**
   * Add cost optimization recommendations
   * @internal
   */
  private addCostOptimizationRecommendations(
    result: LogMetricsResult,
    recommendations: string[],
  ): void {
    if (result.statistics?.bytesScanned) {
      const bytesScanned = result.statistics.bytesScanned;
      if (bytesScanned > 1024 * 1024 * 1024) {
        // > 1GB
        recommendations.push(
          " Large amount of data scanned - consider using field indexes for better performance",
        );
      }
    }
  }
}
