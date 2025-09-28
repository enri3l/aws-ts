/**
 * CloudWatch Logs analyze patterns command
 *
 * Analyzes log patterns in a CloudWatch log group to identify recurring patterns,
 * anomalies, and operational insights for debugging and monitoring.
 *
 */

import { Command, Flags } from "@oclif/core";
import { CloudWatchLogsService } from "../../../services/cloudwatch-logs-service.js";
import { DataProcessor } from "../../../lib/data-processing.js";
import { handleCloudWatchLogsCommandError } from "../../../lib/cloudwatch-logs-errors.js";
import {
  CloudWatchLogsAnalyzePatternsSchema,
  type CloudWatchLogsAnalyzePatterns,
} from "../../../lib/cloudwatch-logs-analytics-schemas.js";
import { parseTimeRange } from "../../../lib/time-utilities.js";

/**
 * CloudWatch Logs analyze patterns command implementation
 *
 * @public
 */
export default class CloudWatchLogsAnalyzePatternsCommand extends Command {
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
      command: "<%= config.bin %> <%= command.id %> /aws/lambda/my-function --start-time '2025-01-01' --export-file analysis.json",
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
      description: "Output format for analysis results",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with detailed information",
      default: false,
    }),

    "start-time": Flags.string({
      description: "Start time for pattern analysis (ISO 8601, Unix timestamp, or relative like 'last 2 hours')",
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
      max: 10000,
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

  static override readonly args = [
    {
      name: "logGroupName",
      description: "CloudWatch log group name to analyze",
      required: true,
    },
  ];

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

      // Initialize CloudWatch Logs service
      const logsService = new CloudWatchLogsService({
        enableDebugLogging: input.verbose,
        credentialService: {
          defaultRegion: input.region,
          defaultProfile: input.profile,
        },
      });

      // Execute pattern analysis
      const analysisResult = await logsService.analyzeLogPatterns(
        input.logGroupName,
        {
          region: input.region,
          profile: input.profile,
        },
        {
          startTime: input.timeRange.startTime ? new Date(input.timeRange.startTime) : undefined,
          endTime: input.timeRange.endTime ? new Date(input.timeRange.endTime) : undefined,
          maxPatterns: input.maxPatterns,
          minOccurrences: input.minOccurrences,
          sampleSize: input.sampleSize,
        }
      );

      // Process and display results
      if (input.format === "table") {
        this.displayPatternAnalysisTable(analysisResult, input.verbose);
      } else {
        const processor = new DataProcessor();
        const output = await processor.processData(
          [analysisResult],
          input.format as "json" | "jsonl" | "csv"
        );
        this.log(output);
      }

      // Export results if requested
      if (input.exportFile) {
        const fs = await import("node:fs/promises");
        await fs.writeFile(
          input.exportFile,
          JSON.stringify(analysisResult, null, 2),
          "utf8"
        );
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
  private displayPatternAnalysisTable(result: any, verbose: boolean): void {
    // Display analysis summary
    this.log(`\n📊 Pattern Analysis Results for: ${result.logGroupName}`);
    this.log(`📅 Analysis Period: ${result.timeRange.startTime.toISOString()} to ${result.timeRange.endTime.toISOString()}`);
    this.log(`📈 Total Events Analyzed: ${result.totalEvents.toLocaleString()}`);
    this.log(`🔍 Sample Size: ${result.sampleSize.toLocaleString()}`);
    this.log(`🎯 Unique Patterns Found: ${result.summary.uniquePatterns}`);
    this.log(`📊 Pattern Coverage: ${result.summary.coveragePercentage.toFixed(1)}%`);

    if (result.summary.anomalyCount > 0) {
      this.log(`⚠️  Anomalies Detected: ${result.summary.anomalyCount}`);
    }

    // Display top patterns table
    if (result.patterns.length > 0) {
      this.log("\n🔍 Top Log Patterns:");
      console.table(
        result.patterns.slice(0, 10).map((pattern: any, index: number) => ({
          "#": index + 1,
          "Pattern": pattern.pattern.length > 80 ?
            pattern.pattern.substring(0, 77) + "..." :
            pattern.pattern,
          "Count": pattern.count.toLocaleString(),
          "Percentage": `${pattern.percentage.toFixed(1)}%`,
          "First Seen": pattern.firstSeen ?
            new Date(pattern.firstSeen).toISOString().split('T')[0] :
            "N/A",
          "Last Seen": pattern.lastSeen ?
            new Date(pattern.lastSeen).toISOString().split('T')[0] :
            "N/A",
        }))
      );
    }

    // Display anomalies if any
    if (result.anomalies.length > 0) {
      this.log("\n⚠️  Pattern Anomalies Detected:");
      console.table(
        result.anomalies.map((anomaly: any, index: number) => ({
          "#": index + 1,
          "Pattern": anomaly.pattern.length > 60 ?
            anomaly.pattern.substring(0, 57) + "..." :
            anomaly.pattern,
          "Type": anomaly.anomalyType,
          "Severity": anomaly.severity.toUpperCase(),
          "Percentage": `${anomaly.percentage.toFixed(1)}%`,
          "Description": anomaly.description,
        }))
      );
    }

    // Display examples in verbose mode
    if (verbose && result.patterns.length > 0) {
      this.log("\n📝 Pattern Examples (Top 3 patterns):");
      result.patterns.slice(0, 3).forEach((pattern: any, index: number) => {
        this.log(`\n${index + 1}. Pattern: ${pattern.pattern}`);
        this.log(`   Count: ${pattern.count} (${pattern.percentage.toFixed(1)}%)`);
        this.log("   Examples:");
        pattern.examples.forEach((example: string, exIndex: number) => {
          this.log(`   ${exIndex + 1}. ${example}`);
        });
      });
    }

    this.log("\n✅ Pattern analysis complete");
  }
}