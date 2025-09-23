/**
 * Error categorization system for AWS CLI application
 *
 * Provides structured error types with consistent error codes and user-friendly
 * messages. Integrates with Oclif's error handling mechanisms while maintaining
 * clear separation between different error categories.
 *
 */

import { getAuthErrorGuidance } from "./auth-guidance.js";

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
      formatted += `\nDetails: ${JSON.stringify(error.metadata, undefined, 2)}`;
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
