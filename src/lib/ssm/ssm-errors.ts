/**
 * @module ssm/ssm-errors
 * SSM-specific error types for AWS Systems Manager operations
 *
 * Extends the base error system with SSM-specific error handling
 * for session management, parameter store, instance discovery, and document operations.
 */

import { BaseError } from "../errors.js";
import { getSSMErrorGuidance } from "./ssm-guidance.js";

/**
 * Session error for SSM Session Manager operation failures
 *
 * Used when session operations fail, including session start,
 * termination, and description failures.
 *
 * @public
 */
export class SSMSessionError extends BaseError {
  /**
   * Create a new SSM session error
   *
   * @param message - User-friendly session error message
   * @param sessionId - The session ID that encountered the error
   * @param instanceId - The target instance ID
   * @param operation - The session operation that failed
   * @param cause - The underlying error that caused the session failure
   * @param metadata - Additional session context
   */
  constructor(
    message: string,
    sessionId?: string,
    instanceId?: string,
    operation?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "SSM_SESSION_ERROR", {
      sessionId,
      instanceId,
      operation,
      cause,
      ...metadata,
    });
  }
}

/**
 * Parameter error for SSM Parameter Store operation failures
 *
 * Used when parameter operations fail, including get, put,
 * delete, and list operations.
 *
 * @public
 */
export class SSMParameterError extends BaseError {
  /**
   * Create a new SSM parameter error
   *
   * @param message - User-friendly parameter error message
   * @param parameterName - The parameter name that encountered the error
   * @param operation - The parameter operation that failed
   * @param tier - The parameter tier (Standard/Advanced)
   * @param cause - The underlying error that caused the parameter failure
   * @param metadata - Additional parameter context
   */
  constructor(
    message: string,
    parameterName?: string,
    operation?: string,
    tier?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "SSM_PARAMETER_ERROR", {
      parameterName,
      operation,
      tier,
      cause,
      ...metadata,
    });
  }
}

/**
 * Instance error for SSM instance discovery and management failures
 *
 * Used when instance operations fail, including instance listing
 * and description failures.
 *
 * @public
 */
export class SSMInstanceError extends BaseError {
  /**
   * Create a new SSM instance error
   *
   * @param message - User-friendly instance error message
   * @param instanceId - The instance ID that encountered the error
   * @param filters - The filters applied during the operation
   * @param operation - The instance operation that failed
   * @param cause - The underlying error that caused the instance failure
   * @param metadata - Additional instance context
   */
  constructor(
    message: string,
    instanceId?: string,
    filters?: Record<string, unknown>,
    operation?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "SSM_INSTANCE_ERROR", {
      instanceId,
      filters,
      operation,
      cause,
      ...metadata,
    });
  }
}

/**
 * Document error for SSM document operation failures
 *
 * Used when document operations fail, including document listing
 * and description failures.
 *
 * @public
 */
export class SSMDocumentError extends BaseError {
  /**
   * Create a new SSM document error
   *
   * @param message - User-friendly document error message
   * @param documentName - The document name that encountered the error
   * @param documentVersion - The document version if specified
   * @param operation - The document operation that failed
   * @param cause - The underlying error that caused the document failure
   * @param metadata - Additional document context
   */
  constructor(
    message: string,
    documentName?: string,
    documentVersion?: string,
    operation?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "SSM_DOCUMENT_ERROR", {
      documentName,
      documentVersion,
      operation,
      cause,
      ...metadata,
    });
  }
}

/**
 * Connection error for SSM SSH and port forwarding failures
 *
 * Used when connection operations fail, including SSH connections
 * and port forwarding setup.
 *
 * @public
 */
export class SSMConnectionError extends BaseError {
  /**
   * Create a new SSM connection error
   *
   * @param message - User-friendly connection error message
   * @param connectionType - The type of connection (ssh, port-forward, remote-port-forward)
   * @param instanceId - The target instance ID
   * @param port - The port number if applicable
   * @param cause - The underlying error that caused the connection failure
   * @param metadata - Additional connection context
   */
  constructor(
    message: string,
    connectionType?: string,
    instanceId?: string,
    port?: number,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "SSM_CONNECTION_ERROR", {
      connectionType,
      instanceId,
      port,
      cause,
      ...metadata,
    });
  }
}

/**
 * Check if an error is an SSM-related error
 *
 * @param error - The error to check
 * @returns True if the error is SSM-related
 *
 * @public
 */
export function isSSMError(
  error: unknown,
): error is
  | SSMSessionError
  | SSMParameterError
  | SSMInstanceError
  | SSMDocumentError
  | SSMConnectionError {
  return (
    error instanceof SSMSessionError ||
    error instanceof SSMParameterError ||
    error instanceof SSMInstanceError ||
    error instanceof SSMDocumentError ||
    error instanceof SSMConnectionError
  );
}

/**
 * Format SSM errors with context and guidance
 *
 * Provides consistent error formatting across all SSM commands
 * with optional verbose mode for debugging.
 *
 * @param error - The error to format
 * @param verbose - Whether to include stack traces and metadata
 * @param context - Optional context string (e.g., command name)
 * @returns Formatted error message with resolution guidance
 *
 * @public
 */
export function formatSSMError(error: unknown, verbose = false, context?: string): string {
  const guidance = getSSMErrorGuidance(error);
  const contextPrefix = context ? `[${context}] ` : "";

  if (isSSMError(error)) {
    let formatted = `${contextPrefix}${error.code}: ${error.message}`;

    if (verbose && Object.keys(error.metadata).length > 0) {
      formatted += `\n\nError Details:\n${JSON.stringify(error.metadata, undefined, 2)}`;
    }

    if (verbose && error.stack) {
      formatted += `\n\nStack Trace:\n${error.stack}`;
    }

    formatted += `\n\nResolution:\n${guidance}`;
    return formatted;
  }

  if (error instanceof Error) {
    let formatted = `${contextPrefix}${error.message}`;

    if (verbose && error.stack) {
      formatted += `\n\nStack Trace:\n${error.stack}`;
    }

    formatted += `\n\nResolution:\n${guidance}`;
    return formatted;
  }

  return `${contextPrefix}${String(error)}\n\nResolution:\n${guidance}`;
}
