/**
 * @module time-utilities
 * Time parsing utilities for CloudWatch Logs commands
 *
 * Provides helper functions for parsing and validating time ranges
 * used in CloudWatch Logs analytics and search operations.
 *
 */

/**
 * Time range interface
 *
 * @public
 */
export interface TimeRange {
  startTime?: Date;
  endTime?: Date;
}

/**
 * Parse time range from string inputs
 *
 * Converts optional start and end time strings into Date objects.
 * If no times are provided, returns an empty time range object.
 * If only end time is provided, start time defaults to 24 hours earlier.
 * If only start time is provided, end time defaults to current time.
 *
 * @param startTimeStr - Optional start time string (ISO 8601 format)
 * @param endTimeStr - Optional end time string (ISO 8601 format)
 * @returns Parsed time range with Date objects
 * @throws When time strings are invalid or start time is after end time
 *
 * @public
 */
export function parseTimeRange(startTimeString?: string, endTimeString?: string): TimeRange {
  const result: TimeRange = {};

  if (endTimeString) {
    const endTime = new Date(endTimeString);
    if (Number.isNaN(endTime.getTime())) {
      throw new TypeError(
        `Invalid end time format: ${endTimeString}. Expected ISO 8601 format (e.g., 2025-01-01T00:00:00Z)`,
      );
    }
    result.endTime = endTime;
  }

  if (startTimeString) {
    const startTime = new Date(startTimeString);
    if (Number.isNaN(startTime.getTime())) {
      throw new TypeError(
        `Invalid start time format: ${startTimeString}. Expected ISO 8601 format (e.g., 2025-01-01T00:00:00Z)`,
      );
    }
    result.startTime = startTime;
  }

  // Apply default values when only one boundary is specified or neither is provided.
  // Empty range: no start/end specified - return as-is for caller to handle.
  if (!result.endTime && !result.startTime) {
    return result;
  }

  // When only start time provided, default end time to current moment for open-ended queries.
  if (!result.endTime) {
    result.endTime = new Date();
  }

  // When only end time provided, default start to 24 hours before end for standard query window.
  if (!result.startTime) {
    result.startTime = new Date(result.endTime.getTime() - 24 * 60 * 60 * 1000);
  }

  // Validate that start time precedes end time to prevent invalid time range queries.
  if (result.startTime && result.endTime && result.startTime >= result.endTime) {
    throw new Error(
      `Start time (${result.startTime.toISOString()}) must be before end time (${result.endTime.toISOString()})`,
    );
  }

  return result;
}

/**
 * Format time range for display
 *
 * @param timeRange - Time range to format
 * @returns Human-readable time range string
 *
 * @public
 */
export function formatTimeRange(timeRange: TimeRange): string {
  if (!timeRange.startTime && !timeRange.endTime) {
    return "All time";
  }

  const start = timeRange.startTime?.toISOString() ?? "Beginning of time";
  const end = timeRange.endTime?.toISOString() ?? "Now";

  return `${start} to ${end}`;
}
