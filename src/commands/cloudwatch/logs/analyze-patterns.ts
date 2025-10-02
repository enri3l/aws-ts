/**
 * @module cloudwatch/logs/analyze-patterns
 * CloudWatch Logs analyze patterns command
 *
 * Analyzes log patterns in a CloudWatch log group to identify recurring patterns,
 * anomalies, and operational insights for debugging and monitoring.
 *
 */

import { Args, Flags } from "@oclif/core";
import {
  CloudWatchLogsAnalyzePatternsSchema,
  type CloudWatchLogsAnalyzePatterns,
  type PatternAnalysisResult,
  type PatternAnomaly,
  type PatternWithStats,
} from "../../../lib/cloudwatch-logs-analytics-schemas.js";
import { handleCloudWatchLogsCommandError } from "../../../lib/cloudwatch-logs-errors.js";
import { DataFormat, DataProcessor } from "../../../lib/data-processing.js";
import { parseTimeRange } from "../../../lib/time-utilities.js";
import { CloudWatchLogsAnalyticsService } from "../../../services/cloudwatch-logs-analytics-service.js";
import { CloudWatchLogsService } from "../../../services/cloudwatch-logs-service.js";
import { BaseCommand } from "../../base-command.js";

/**
 * CloudWatch Logs analyze patterns command implementation
 *
 * @public
 */
export default class CloudWatchLogsAnalyzePatternsCommand extends BaseCommand {
  static override readonly summary = "Analyze log patterns in a CloudWatch log group";

  static override readonly description = `
Analyzes log patterns in a CloudWatch log group to identify recurring patterns,
detect anomalies, and provide operational insights for debugging and monitoring.

The command performs intelligent pattern extraction by normalizing log messages
and grouping them by structural similarity. It identifies frequent patterns,
calculates coverage statistics, and detects anomalies that may indicate issues.

PATTERN ANALYSIS FEATURES:
• Automatic pattern detection with configurable thresholds
• Anomaly detection for unusual frequency patterns
• Pattern coverage and occurrence statistics
• Time-based pattern analysis with first/last occurrence tracking
• Configurable sample size for large datasets

EXAMPLES:
  # Analyze patterns in the last 24 hours
  $ aws-ts cloudwatch:logs:analyze-patterns /aws/lambda/my-function

  # Analyze with custom time range and sample size
  $ aws-ts cloudwatch:logs:analyze-patterns /aws/lambda/my-function \\
    --start-time "2025-01-01T00:00:00Z" \\
    --end-time "2025-01-01T23:59:59Z" \\
    --sample-size 5000

  # Export analysis results to file
  $ aws-ts cloudwatch:logs:analyze-patterns /aws/lambda/my-function \\
    --export-file patterns-analysis.json \\
    --format json

  # Find top 50 patterns with minimum 10 occurrences
  $ aws-ts cloudwatch:logs:analyze-patterns /aws/lambda/my-function \\
    --max-patterns 50 \\
    --min-occurrences 10
`;

  static override readonly examples = [
    {
      description: "Analyze patterns with default settings",
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function",
    },
    {
      description: "Custom time range and export",
      command:
        "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --start-time '2025-01-01' --export-file analysis.json",
    },
  ];

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "start-time": Flags.string({
      description:
        "Start time for pattern analysis (ISO 8601, Unix timestamp, or relative like 'last 2 hours')",
      helpValue: "2025-01-01T00:00:00Z",
    }),

    "end-time": Flags.string({
      description: "End time for pattern analysis (ISO 8601, Unix timestamp, or relative)",
      helpValue: "2025-01-01T23:59:59Z",
    }),

    "max-patterns": Flags.integer({
      description: "Maximum number of patterns to identify",
      default: 20,
      min: 5,
      max: 100,
    }),

    "min-occurrences": Flags.integer({
      description: "Minimum occurrences for a pattern to be included",
      default: 5,
      min: 1,
      max: 100,
    }),

    "sample-size": Flags.integer({
      description: "Number of log events to sample for analysis",
      default: 1000,
      min: 100,
      max: 10_000,
    }),

    "detect-anomalies": Flags.boolean({
      description: "Enable anomaly detection for unusual patterns",
      default: true,
      allowNo: true,
    }),

    "export-file": Flags.string({
      description: "Export analysis results to specified file",
      helpValue: "patterns-analysis.json",
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
    const { args, flags } = await this.parse(CloudWatchLogsAnalyzePatternsCommand);

    try {
      // Parse and validate input parameters
      const timeRange = parseTimeRange(flags["start-time"], flags["end-time"]);

      const input: CloudWatchLogsAnalyzePatterns = CloudWatchLogsAnalyzePatternsSchema.parse({
        logGroupName: args.logGroupName,
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
        timeRange,
        maxPatterns: flags["max-patterns"],
        minOccurrences: flags["min-occurrences"],
        sampleSize: flags["sample-size"],
        detectAnomalies: flags["detect-anomalies"],
        exportFile: flags["export-file"],
      });

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

      // Execute pattern analysis
      const analysisResult = await analyticsService.analyzeLogPatterns(
        input.logGroupName,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          ...(input.timeRange.startTime && { startTime: new Date(input.timeRange.startTime) }),
          ...(input.timeRange.endTime && { endTime: new Date(input.timeRange.endTime) }),
          ...(input.maxPatterns && { maxPatterns: input.maxPatterns }),
          ...(input.minOccurrences && { minOccurrences: input.minOccurrences }),
          ...(input.sampleSize && { sampleSize: input.sampleSize }),
        },
      );

      // Process and display results
      if (input.format === "table") {
        this.displayPatternAnalysisTable(analysisResult, input.verbose);
      } else {
        const processor = new DataProcessor({
          format: DataFormat[input.format.toUpperCase() as keyof typeof DataFormat],
        });
        const records = [{ data: analysisResult as unknown as Record<string, unknown>, index: 0 }];
        const output = processor.formatOutput(records);
        this.log(output);
      }

      // Export results if requested
      if (input.exportFile) {
        const fs = await import("node:fs/promises");
        await fs.writeFile(input.exportFile, JSON.stringify(analysisResult, undefined, 2), "utf8");
        this.log(`\nAnalysis results exported to: ${input.exportFile}`);
      }
    } catch (error) {
      const formattedError = handleCloudWatchLogsCommandError(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Display pattern analysis results in table format
   * @internal
   */
  private displayPatternAnalysisTable(result: PatternAnalysisResult, verbose: boolean): void {
    // Display analysis summary
    this.log(`\n Pattern Analysis Results for: ${result.logGroupName}`);
    this.log(
      ` Analysis Period: ${result.timeRange.startTime.toISOString()} to ${result.timeRange.endTime.toISOString()}`,
    );
    this.log(` Total Events Analyzed: ${result.totalEvents.toLocaleString()}`);
    this.log(`Sample Size: ${result.sampleSize.toLocaleString()}`);
    this.log(` Unique Patterns Found: ${result.summary.uniquePatterns}`);
    this.log(` Pattern Coverage: ${result.summary.coveragePercentage.toFixed(1)}%`);

    if (result.summary.anomalyCount > 0) {
      this.log(`Anomalies Detected: ${result.summary.anomalyCount}`);
    }

    // Display top patterns table
    if (result.patterns.length > 0) {
      this.log("\nTop Log Patterns:");
      console.table(
        result.patterns.slice(0, 10).map((pattern: PatternWithStats, index: number) => ({
          "#": index + 1,
          Pattern:
            pattern.pattern.length > 80 ? pattern.pattern.slice(0, 77) + "..." : pattern.pattern,
          Count: pattern.count.toLocaleString(),
          Percentage: `${pattern.percentage.toFixed(1)}%`,
          "First Seen": pattern.firstSeen
            ? new Date(pattern.firstSeen).toISOString().split("T")[0]
            : "N/A",
          "Last Seen": pattern.lastSeen
            ? new Date(pattern.lastSeen).toISOString().split("T")[0]
            : "N/A",
        })),
      );
    }

    // Display anomalies if any
    if (result.anomalies.length > 0) {
      this.log("\nPattern Anomalies Detected:");
      console.table(
        result.anomalies.map((anomaly: PatternAnomaly, index: number) => ({
          "#": index + 1,
          Pattern:
            anomaly.pattern.length > 60 ? anomaly.pattern.slice(0, 57) + "..." : anomaly.pattern,
          Type: anomaly.anomalyType,
          Severity: anomaly.severity.toUpperCase(),
          Percentage: `${anomaly.percentage.toFixed(1)}%`,
          Description: anomaly.description,
        })),
      );
    }

    // Display examples in verbose mode
    if (verbose && result.patterns.length > 0) {
      this.log("\nPattern Examples (Top 3 patterns):");
      for (const [index, pattern] of result.patterns.slice(0, 3).entries()) {
        this.log(`\n${index + 1}. Pattern: ${pattern.pattern}`);
        this.log(`   Count: ${pattern.count} (${pattern.percentage.toFixed(1)}%)`);
        this.log("   Examples:");
        for (const [exIndex, example] of pattern.examples.entries()) {
          this.log(`   ${exIndex + 1}. ${example}`);
        }
      }
    }

    this.log("\nPattern analysis complete");
  }
}
