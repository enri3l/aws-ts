/**
 * @module cloudwatch-logs-analytics-errors
 * CloudWatch Logs Analytics-specific error types
 *
 * Extends the base error system with analytics-specific error handling
 * for pattern analysis, metrics extraction, and anomaly detection.
 *
 */

import { BaseError } from "./errors.js";

/**
 * Analytics error for CloudWatch Logs analytics and pattern analysis failures
 *
 * Used when analytics operations fail, including pattern detection errors,
 * metric extraction issues, and analysis configuration problems.
 *
 * @public
 */
export class AnalyticsError extends BaseError {
  /**
   * Create a new analytics error
   *
   * @param message - User-friendly analytics error message
   * @param operation - The analytics operation that failed
   * @param logGroup - The log group being analyzed
   * @param analysisType - The type of analysis that failed
   * @param timeRange - The time range for analysis
   * @param cause - The underlying error that caused the analytics failure
   * @param metadata - Additional analytics context
   */
  constructor(
    message: string,
    operation?: string,
    logGroup?: string,
    analysisType?: string,
    timeRange?: { start?: Date; end?: Date },
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "ANALYTICS_ERROR", {
      operation,
      logGroup,
      analysisType,
      timeRange: timeRange
        ? {
            start: timeRange.start?.toISOString(),
            end: timeRange.end?.toISOString(),
          }
        : undefined,
      cause,
      ...metadata,
    });
  }
}

/**
 * Check if an error is an analytics-related error
 *
 * @param error - The error to check
 * @returns True if the error is analytics-related
 *
 * @public
 */
export function isAnalyticsError(error: unknown): error is AnalyticsError {
  return error instanceof AnalyticsError;
}

/**
 * Get user-friendly guidance for analytics errors
 *
 * @param error - The error to provide guidance for
 * @returns User-friendly guidance message
 *
 * @public
 */
export function getAnalyticsErrorGuidance(error: unknown): string {
  if (isAnalyticsError(error)) {
    return "Analytics operation failed. Verify the log group contains sufficient data for the analysis time range. Check that field indexes are configured if using complex patterns.";
  }

  return "Unknown analytics error. Check AWS credentials and CloudWatch Logs configuration.";
}
