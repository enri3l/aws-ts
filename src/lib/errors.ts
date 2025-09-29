/**
 * Error categorization system for AWS CLI application
 *
 * Provides structured error types with consistent error codes and user-friendly
 * messages. Integrates with Oclif's error handling mechanisms while maintaining
 * clear separation between different error categories.
 *
 * @file
 * This module implements a error hierarchy for the AWS CLI:
 *
 * **Core Error Types:**
 * - BaseError: Abstract base class for all CLI errors
 * - ValidationError: User input validation failures
 * - ServiceError: AWS service operation failures
 * - ConfigurationError: Invalid CLI configuration issues
 *
 * **Extended Error Types (Phase 2):**
 * - UserConfigurationError: User-provided configuration issues
 * - ApiError: External API failures with cause tracking
 * - TimeoutError: Network operation timeout failures
 *
 * **Security Features:**
 * - Metadata sanitization for verbose output (prevents sensitive data exposure)
 * - Structured error formatting with optional debugging details
 * - Authentication-specific error guidance integration
 *
 * @author AWS TypeScript CLI Team
 * @since 0.4.0
 */

import { getAuthErrorGuidance } from "./auth-guidance.js";
import { sanitizeErrorForVerboseOutput } from "./error-sanitization.js";

/**
 * Base error class for all AWS CLI errors
 *
 * Extends the standard Error class with error codes and structured
 * metadata for consistent error handling across the application.
 *
 * @public
 */
export abstract class BaseError extends Error {
  /**
   * Unique error code for this error type
   */
  public readonly code: string;

  /**
   * Additional error metadata
   */
  public readonly metadata: Record<string, unknown>;

  /**
   * Create a new base error
   *
   * @param message - Human-readable error message
   * @param code - Unique error code
   * @param metadata - Additional error context
   */
  constructor(message: string, code: string, metadata: Record<string, unknown> = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.metadata = metadata;

    // Ensure proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Validation error for invalid user inputs or malformed data
 *
 * Used when user-provided data fails validation or schema checks.
 * Includes specific field information and validation failure details.
 *
 * @public
 */
export class ValidationError extends BaseError {
  /**
   * Create a new validation error
   *
   * @param message - User-friendly validation error message
   * @param field - The field or input that failed validation
   * @param value - The invalid value that was provided
   * @param metadata - Additional validation context
   */
  constructor(
    message: string,
    field?: string,
    value?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "VALIDATION_ERROR", {
      field,
      value,
      ...metadata,
    });
  }
}

/**
 * Service error for AWS service-related failures
 *
 * Used when AWS API calls fail or return unexpected responses.
 * Includes AWS error details and service-specific context.
 *
 * @public
 */
export class ServiceError extends BaseError {
  /**
   * Create a new service error
   *
   * @param message - User-friendly service error message
   * @param service - The AWS service that encountered the error
   * @param operation - The specific operation that failed
   * @param awsError - Original AWS SDK error details
   * @param metadata - Additional service context
   */
  constructor(
    message: string,
    service?: string,
    operation?: string,
    awsError?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "SERVICE_ERROR", {
      service,
      operation,
      awsError,
      ...metadata,
    });
  }
}

/**
 * Configuration error for invalid or missing configuration
 *
 * Used when CLI configuration is invalid, missing, or incompatible.
 * Includes specific configuration details and resolution guidance.
 *
 * @public
 */
export class ConfigurationError extends BaseError {
  /**
   * Create a new configuration error
   *
   * @param message - User-friendly configuration error message
   * @param configKey - The configuration key that is invalid or missing
   * @param expectedValue - The expected configuration value or format
   * @param actualValue - The actual configuration value found
   * @param metadata - Additional configuration context
   */
  constructor(
    message: string,
    configKey?: string,
    expectedValue?: unknown,
    actualValue?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "CONFIGURATION_ERROR", {
      configKey,
      expectedValue,
      actualValue,
      ...metadata,
    });
  }
}

/**
 * User configuration error for invalid user inputs or configuration issues
 *
 * Used when user-provided configuration, command arguments, or input data
 * is invalid, malformed, or incompatible with expected formats. Extends
 * ValidationError semantics for configuration-specific scenarios.
 *
 * @public
 */
export class UserConfigurationError extends BaseError {
  /**
   * Create a new user configuration error
   *
   * @param message - User-friendly configuration error message
   * @param configType - Type of configuration that failed (e.g., 'profile', 'region', 'credentials')
   * @param providedValue - The invalid value that was provided by the user
   * @param expectedFormat - Description of the expected configuration format
   * @param metadata - Additional configuration context
   */
  constructor(
    message: string,
    configType?: string,
    providedValue?: unknown,
    expectedFormat?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "USER_CONFIGURATION_ERROR", {
      configType,
      providedValue,
      expectedFormat,
      ...metadata,
    });
  }
}

/**
 * API error for external service failures with cause tracking
 *
 * Used when external API calls (AWS services, third-party APIs) fail
 * or return unexpected responses. Includes cause tracking
 * and service-specific context for debugging and user guidance.
 *
 * @public
 */
export class ApiError extends BaseError {
  /**
   * Create a new API error
   *
   * @param message - User-friendly API error message
   * @param apiName - Name of the API or service that failed
   * @param operation - Specific API operation or endpoint that failed
   * @param httpStatusCode - HTTP status code from the API response
   * @param originalError - Original error or response from the API
   * @param metadata - Additional API context and debugging information
   */
  constructor(
    message: string,
    apiName?: string,
    operation?: string,
    httpStatusCode?: number,
    originalError?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "API_ERROR", {
      apiName,
      operation,
      httpStatusCode,
      originalError,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  }
}

/**
 * Timeout error for network operation timeouts
 *
 * Used when network operations exceed configured timeout thresholds.
 * Provides specific timeout context and guidance for resolution,
 * distinguishing timeout failures from other network connectivity issues.
 *
 * @public
 */
export class TimeoutError extends BaseError {
  /**
   * Create a new timeout error
   *
   * @param message - User-friendly timeout error message
   * @param operation - The operation that timed out
   * @param timeoutMs - The timeout threshold in milliseconds
   * @param elapsedMs - Actual time elapsed before timeout (if available)
   * @param retryable - Whether this operation can be safely retried
   * @param metadata - Additional timeout context
   */
  constructor(
    message: string,
    operation?: string,
    timeoutMs?: number,
    elapsedMs?: number,
    retryable?: boolean,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "TIMEOUT_ERROR", {
      operation,
      timeoutMs,
      elapsedMs,
      retryable,
      timestamp: new Date().toISOString(),
      ...metadata,
    });
  }
}

/**
 * Check if an error is one of our custom error types
 *
 * @param error - The error to check
 * @returns True if the error is a BaseError instance
 *
 * @public
 */
export function isBaseError(error: unknown): error is BaseError {
  return error instanceof BaseError;
}

/**
 * Format error for user display with appropriate detail level
 *
 * @param error - The error to format
 * @param includeMetadata - Whether to include error metadata in output
 * @returns Formatted error message for user display
 *
 * @public
 */
export function formatError(error: unknown, includeMetadata = false): string {
  if (isBaseError(error)) {
    let formatted = `${error.code}: ${error.message}`;

    if (includeMetadata && Object.keys(error.metadata).length > 0) {
      const sanitizedMetadata = sanitizeErrorForVerboseOutput(error.metadata);
      formatted += `\nDetails: ${JSON.stringify(sanitizedMetadata, undefined, 2)}`;
    }

    return formatted;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * Format error for user display with SSO guidance
 *
 * @param error - The error to format
 * @param includeMetadata - Whether to include error metadata in output
 * @returns Formatted error message with guidance for user display
 *
 * @public
 */
export function formatErrorWithGuidance(error: unknown, includeMetadata = false): string {
  const basicMessage = formatError(error, includeMetadata);

  // Check if this is an authentication-related error that benefits from guidance
  const guidance = getAuthErrorGuidance(error);

  // Only add guidance if it's different from a generic fallback
  if (guidance && !guidance.includes("Unknown authentication error")) {
    return `${basicMessage}\n\n${guidance}`;
  }

  return basicMessage;
}

/**
 * Handle common DynamoDB command errors with standardized messages
 *
 * @param error - The error that occurred
 * @param verbose - Whether to include verbose error details
 * @param context - Optional context for the operation that failed
 * @returns Formatted error message
 *
 * @public
 */
export function handleDynamoDBCommandError(
  error: unknown,
  verbose = false,
  context?: string,
): string {
  // Handle JSON parsing errors
  if (error instanceof SyntaxError && error.message.includes("JSON")) {
    return `Invalid JSON in parameter: ${error.message}`;
  }

  // Handle file not found errors
  if (error instanceof Error && error.message.includes("ENOENT")) {
    const fileContext = context ? ` for ${context}` : "";
    return `File not found${fileContext}. Ensure the file path is correct.`;
  }

  // Handle all other errors with guidance
  return formatErrorWithGuidance(error, verbose);
}
