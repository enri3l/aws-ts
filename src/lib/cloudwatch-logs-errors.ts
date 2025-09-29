/**
 * CloudWatch Logs-specific error types for AWS CLI operations
 *
 * Extends the base error system with CloudWatch Logs-specific error handling
 * for log group operations, streaming, queries, and real-time monitoring.
 *
 */

import { BaseError } from "./errors.js";

/**
 * CloudWatch Logs error for general CloudWatch Logs operation failures
 *
 * Used when CloudWatch Logs operations fail, including service errors,
 * configuration issues, and API-level failures.
 *
 * @public
 */
export class CloudWatchLogsError extends BaseError {
  /**
   * Create a new CloudWatch Logs error
   *
   * @param message - User-friendly CloudWatch Logs error message
   * @param operation - The CloudWatch Logs operation that failed
   * @param logGroup - The log group involved in the operation
   * @param cause - The underlying error that caused the CloudWatch Logs failure
   * @param metadata - Additional CloudWatch Logs context
   */
  constructor(
    message: string,
    operation?: string,
    logGroup?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "CLOUDWATCH_LOGS_ERROR", {
      operation,
      logGroup,
      cause,
      ...metadata,
    });
  }
}

/**
 * Log group error for CloudWatch Logs log group-specific failures
 *
 * Used when log group operations fail, including log group not found,
 * access permission issues, and log group configuration problems.
 *
 * @public
 */
export class LogGroupError extends BaseError {
  /**
   * Create a new log group error
   *
   * @param message - User-friendly log group error message
   * @param logGroup - The log group that encountered the error
   * @param operation - The log group operation that failed
   * @param retentionPolicy - The retention policy if relevant
   * @param metadata - Additional log group context
   */
  constructor(
    message: string,
    logGroup?: string,
    operation?: string,
    retentionPolicy?: number,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "LOG_GROUP_ERROR", {
      logGroup,
      operation,
      retentionPolicy,
      ...metadata,
    });
  }
}

/**
 * Log stream error for CloudWatch Logs log stream-specific failures
 *
 * Used when log stream operations fail, including stream not found,
 * stream creation issues, and stream access problems.
 *
 * @public
 */
export class LogStreamError extends BaseError {
  /**
   * Create a new log stream error
   *
   * @param message - User-friendly log stream error message
   * @param logGroup - The log group containing the stream
   * @param logStream - The log stream that encountered the error
   * @param operation - The log stream operation that failed
   * @param metadata - Additional log stream context
   */
  constructor(
    message: string,
    logGroup?: string,
    logStream?: string,
    operation?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "LOG_STREAM_ERROR", {
      logGroup,
      logStream,
      operation,
      ...metadata,
    });
  }
}

/**
 * Streaming error for CloudWatch Logs real-time streaming failures
 *
 * Used when live tail or streaming operations fail, including WebSocket
 * connection issues, session timeouts, and streaming configuration problems.
 *
 * @public
 */
export class StreamingError extends BaseError {
  /**
   * Create a new streaming error
   *
   * @param message - User-friendly streaming error message
   * @param operation - The streaming operation that failed
   * @param logGroups - The log groups being streamed
   * @param sessionId - The streaming session ID if available
   * @param connectionState - The connection state when error occurred
   * @param cause - The underlying error that caused the streaming failure
   * @param metadata - Additional streaming context
   */
  constructor(
    message: string,
    operation?: string,
    logGroups?: string[],
    sessionId?: string,
    connectionState?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "STREAMING_ERROR", {
      operation,
      logGroups,
      sessionId,
      connectionState,
      cause,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  }
}

/**
 * Query error for CloudWatch Logs Insights query failures
 *
 * Used when Logs Insights queries fail, including syntax errors,
 * timeout issues, and query execution problems.
 *
 * @public
 */
export class QueryError extends BaseError {
  /**
   * Create a new query error
   *
   * @param message - User-friendly query error message
   * @param query - The query that failed
   * @param logGroups - The log groups being queried
   * @param queryLanguage - The query language used
   * @param startTime - Query start time
   * @param endTime - Query end time
   * @param cause - The underlying error that caused the query failure
   * @param metadata - Additional query context
   */
  constructor(
    message: string,
    query?: string,
    logGroups?: string[],
    queryLanguage?: string,
    startTime?: Date,
    endTime?: Date,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "QUERY_ERROR", {
      query,
      logGroups,
      queryLanguage,
      startTime: startTime?.toISOString(),
      endTime: endTime?.toISOString(),
      cause,
      ...metadata,
    });
  }
}

/**
 * Filter error for CloudWatch Logs filter operation failures
 *
 * Used when filter operations fail, including invalid filter patterns,
 * filtering expression errors, and search configuration issues.
 *
 * @public
 */
export class FilterError extends BaseError {
  /**
   * Create a new filter error
   *
   * @param message - User-friendly filter error message
   * @param filterPattern - The filter pattern that failed
   * @param logGroup - The log group being filtered
   * @param operation - The filter operation that failed
   * @param startTime - Filter start time
   * @param endTime - Filter end time
   * @param metadata - Additional filter context
   */
  constructor(
    message: string,
    filterPattern?: string,
    logGroup?: string,
    operation?: string,
    startTime?: Date,
    endTime?: Date,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "FILTER_ERROR", {
      filterPattern,
      logGroup,
      operation,
      startTime: startTime?.toISOString(),
      endTime: endTime?.toISOString(),
      ...metadata,
    });
  }
}

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
 * Favorites error for CloudWatch Logs favorites management failures
 *
 * Used when favorites operations fail, including storage issues,
 * validation problems, and configuration management errors.
 *
 * @public
 */
export class FavoritesError extends BaseError {
  /**
   * Create a new favorites error
   *
   * @param message - User-friendly favorites error message
   * @param operation - The favorites operation that failed
   * @param favoriteName - The favorite name involved
   * @param favoriteType - The type of favorite (log-group or query)
   * @param storageLocation - Where favorites are stored
   * @param cause - The underlying error that caused the favorites failure
   * @param metadata - Additional favorites context
   */
  constructor(
    message: string,
    operation?: string,
    favoriteName?: string,
    favoriteType?: string,
    storageLocation?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "FAVORITES_ERROR", {
      operation,
      favoriteName,
      favoriteType,
      storageLocation,
      cause,
      ...metadata,
    });
  }
}

/**
 * Permission error for CloudWatch Logs access and permission failures
 *
 * Used when operations fail due to insufficient permissions,
 * IAM policy issues, or resource access restrictions.
 *
 * @public
 */
export class PermissionError extends BaseError {
  /**
   * Create a new permission error
   *
   * @param message - User-friendly permission error message
   * @param operation - The operation that was denied
   * @param resource - The resource that couldn't be accessed
   * @param requiredPermissions - The permissions that are required
   * @param currentPrincipal - The current AWS principal if available
   * @param metadata - Additional permission context
   */
  constructor(
    message: string,
    operation?: string,
    resource?: string,
    requiredPermissions?: string[],
    currentPrincipal?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "PERMISSION_ERROR", {
      operation,
      resource,
      requiredPermissions,
      currentPrincipal,
      ...metadata,
    });
  }
}

/**
 * Check if an error is a CloudWatch Logs-related error
 *
 * @param error - The error to check
 * @returns True if the error is CloudWatch Logs-related
 *
 * @public
 */
export function isCloudWatchLogsError(
  error: unknown,
): error is
  | CloudWatchLogsError
  | LogGroupError
  | LogStreamError
  | StreamingError
  | QueryError
  | FilterError
  | AnalyticsError
  | FavoritesError
  | PermissionError {
  return (
    error instanceof CloudWatchLogsError ||
    error instanceof LogGroupError ||
    error instanceof LogStreamError ||
    error instanceof StreamingError ||
    error instanceof QueryError ||
    error instanceof FilterError ||
    error instanceof AnalyticsError ||
    error instanceof FavoritesError ||
    error instanceof PermissionError
  );
}

/**
 * Get user-friendly guidance for CloudWatch Logs errors
 *
 * @param error - The error to provide guidance for
 * @returns User-friendly guidance message
 *
 * @public
 */
export function getCloudWatchLogsErrorGuidance(error: unknown): string {
  if (isCloudWatchLogsError(error)) {
    return getErrorGuidanceByCode(error);
  }

  return "Unknown CloudWatch Logs error. Check AWS credentials and CloudWatch Logs configuration.";
}

/**
 * Get error guidance based on error code
 *
 * @param error - CloudWatch Logs error with code
 * @returns Specific guidance message
 * @internal
 */
function getErrorGuidanceByCode(
  error:
    | CloudWatchLogsError
    | LogGroupError
    | LogStreamError
    | StreamingError
    | QueryError
    | FilterError
    | AnalyticsError
    | FavoritesError
    | PermissionError,
): string {
  switch (error.code) {
    case "LOG_GROUP_ERROR": {
      return getLogGroupErrorGuidance(error);
    }

    case "LOG_STREAM_ERROR": {
      return "Verify the log stream name is correct and exists within the specified log group. Check that the log stream is active and accessible.";
    }

    case "STREAMING_ERROR": {
      return getStreamingErrorGuidance(error);
    }

    case "QUERY_ERROR": {
      return getQueryErrorGuidance(error);
    }

    case "FILTER_ERROR": {
      return "Check your filter pattern syntax. Ensure the pattern follows CloudWatch Logs filter syntax rules. Use quotes for exact matches and brackets for JSON field extraction.";
    }

    case "ANALYTICS_ERROR": {
      return "Analytics operation failed. Verify the log group contains sufficient data for the analysis time range. Check that field indexes are configured if using complex patterns.";
    }

    case "FAVORITES_ERROR": {
      return getFavoritesErrorGuidance(error);
    }

    case "PERMISSION_ERROR": {
      return getPermissionErrorGuidance(error);
    }

    default: {
      return "Check your AWS credentials, CloudWatch Logs permissions, and region configuration. Verify the log groups exist and are accessible.";
    }
  }
}

/**
 * Get guidance for log group errors
 *
 * @param error - Log group error
 * @returns Specific log group guidance
 * @internal
 */
function getLogGroupErrorGuidance(error: LogGroupError | CloudWatchLogsError): string {
  if (error.metadata.operation === "describe-group") {
    return "Verify the log group name is correct and exists in the specified region. Use 'aws-ts cloudwatch:logs:list-groups' to see available log groups.";
  }
  if (error.message.includes("does not exist")) {
    return "The log group doesn't exist. Check the name and region, or create the log group first.";
  }
  return "Check log group permissions and ensure the log group exists in the correct region with proper access.";
}

/**
 * Get guidance for streaming errors
 *
 * @param error - Streaming error
 * @returns Specific streaming guidance
 * @internal
 */
function getStreamingErrorGuidance(error: StreamingError): string {
  if (error.message.includes("session limit")) {
    return "CloudWatch Logs Live Tail sessions are limited to 3 hours. The session will automatically reconnect.";
  }
  if (error.message.includes("WebSocket")) {
    return "Network connection issue. Check your internet connection and firewall settings. The stream will attempt to reconnect automatically.";
  }
  return "Streaming connection failed. Verify network connectivity and CloudWatch Logs permissions. The connection will retry automatically.";
}

/**
 * Get guidance for query errors
 *
 * @param error - Query error
 * @returns Specific query guidance
 * @internal
 */
function getQueryErrorGuidance(error: QueryError): string {
  if (error.message.includes("syntax")) {
    return "Check your CloudWatch Logs Insights query syntax. Ensure all field names and operators are correct. Use 'fields @timestamp, @message' for basic queries.";
  }
  if (error.message.includes("timeout")) {
    return "Query execution timed out. Try reducing the time range or simplifying the query. Consider using field indexes for better performance.";
  }
  return "Verify your query syntax and time range. Ensure the log groups exist and contain data for the specified time period.";
}

/**
 * Get guidance for favorites errors
 *
 * @param error - Favorites error
 * @returns Specific favorites guidance
 * @internal
 */
function getFavoritesErrorGuidance(error: FavoritesError): string {
  if (error.message.includes("storage")) {
    return "Unable to save favorites. Check write permissions for the configuration directory (~/.aws-ts/). Ensure the directory exists and is writable.";
  }
  return "Favorites operation failed. Verify the favorite name is unique and the configuration is valid.";
}

/**
 * Get guidance for permission errors
 *
 * @param error - Permission error
 * @returns Specific permission guidance
 * @internal
 */
function getPermissionErrorGuidance(error: PermissionError): string {
  const requiredPerms = error.metadata.requiredPermissions as string[] | undefined;
  if (requiredPerms && requiredPerms.length > 0) {
    return `Missing required permissions: ${requiredPerms.join(", ")}. Update your IAM policy to include these CloudWatch Logs permissions.`;
  }
  return "Insufficient permissions for CloudWatch Logs operations. Ensure your AWS credentials have the necessary CloudWatch Logs permissions.";
}

/**
 * Handle common CloudWatch Logs command errors with standardized messages
 *
 * @param error - The error that occurred
 * @param verbose - Whether to include verbose error details
 * @param context - Optional context for the operation that failed
 * @returns Formatted error message
 *
 * @public
 */
export function handleCloudWatchLogsCommandError(
  error: unknown,
  verbose = false,
  context?: string,
): string {
  // Handle specific common error patterns
  const specificErrorMessage = handleSpecificErrorPatterns(error, context);
  if (specificErrorMessage) {
    return specificErrorMessage;
  }

  // Get CloudWatch Logs-specific guidance for other errors
  return formatErrorWithGuidance(error, verbose);
}

/**
 * Handle specific error patterns with direct messages
 *
 * @param error - The error that occurred
 * @param context - Optional context for the operation
 * @returns Formatted message or undefined if not a specific pattern
 * @internal
 */
function handleSpecificErrorPatterns(error: unknown, context?: string): string | undefined {
  if (!(error instanceof Error)) {
    return undefined;
  }

  // Handle time parsing errors
  if (error.message.includes("Invalid time")) {
    return `Invalid time format: ${error.message}. Use ISO 8601 format, Unix timestamps, or relative time like "last 2 hours".`;
  }

  // Handle WebSocket connection errors
  if (error.message.includes("WebSocket")) {
    return `Streaming connection failed: ${error.message}. Check network connectivity and try again.`;
  }

  // Handle query syntax errors
  if (error.message.includes("query syntax")) {
    return `Query syntax error: ${error.message}. Check CloudWatch Logs Insights query syntax documentation.`;
  }

  // Handle file not found errors for saved queries/favorites
  if (error.message.includes("ENOENT")) {
    const fileContext = context ? ` for ${context}` : "";
    return `Configuration file not found${fileContext}. Initialize favorites or saved queries first.`;
  }

  return undefined;
}

/**
 * Format error with CloudWatch Logs guidance
 *
 * @param error - The error that occurred
 * @param verbose - Whether to include verbose details
 * @returns Formatted error message with guidance
 * @internal
 */
function formatErrorWithGuidance(error: unknown, verbose: boolean): string {
  const guidance = getCloudWatchLogsErrorGuidance(error);
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (guidance && !guidance.includes("Unknown CloudWatch Logs error")) {
    const verboseDetails = verbose && error instanceof Error ? `\n\nDetails: ${error.stack}` : "";
    return `${errorMessage}\n\n${guidance}${verboseDetails}`;
  }

  return errorMessage;
}
