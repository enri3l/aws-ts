/**
 * @module auth-errors
 * Authentication-specific error types for AWS CLI operations
 *
 * Extends the base error system with authentication-specific error handling
 * for AWS CLI subprocess operations, credential validation, and profile management.
 *
 */

import { getAuthErrorGuidance } from "./auth-guidance.js";
import { BaseError } from "./errors.js";

/**
 * Authentication error for AWS CLI authentication failures
 *
 * Used when AWS CLI authentication operations fail, including SSO login,
 * profile configuration, and credential validation failures.
 *
 * @public
 */
export class AuthenticationError extends BaseError {
  /**
   * Create a new authentication error
   *
   * @param message - User-friendly authentication error message
   * @param operation - The authentication operation that failed
   * @param profile - The AWS profile involved in the operation
   * @param cause - The underlying error that caused the authentication failure
   * @param metadata - Additional authentication context
   */
  constructor(
    message: string,
    operation?: string,
    profile?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "AUTHENTICATION_ERROR", {
      operation,
      profile,
      cause,
      ...metadata,
    });
  }
}

/**
 * Profile error for AWS profile management failures
 *
 * Used when profile discovery, validation, or switching operations fail.
 * Includes specific profile information and resolution guidance.
 *
 * @public
 */
export class ProfileError extends BaseError {
  /**
   * Create a new profile error
   *
   * @param message - User-friendly profile error message
   * @param profileName - The AWS profile that encountered the error
   * @param operation - The profile operation that failed
   * @param configPath - The configuration file path involved
   * @param metadata - Additional profile context
   */
  constructor(
    message: string,
    profileName?: string,
    operation?: string,
    configPath?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "PROFILE_ERROR", {
      profileName,
      operation,
      configPath,
      ...metadata,
    });
  }
}

/**
 * Token error for SSO token management failures
 *
 * Used when SSO token operations fail, including token expiry detection,
 * refresh operations, and token validation failures.
 *
 * @public
 */
export class TokenError extends BaseError {
  /**
   * Create a new token error
   *
   * @param message - User-friendly token error message
   * @param tokenType - The type of token that encountered the error
   * @param operation - The token operation that failed
   * @param expiryTime - The token expiry time if available
   * @param metadata - Additional token context
   */
  constructor(
    message: string,
    tokenType?: string,
    operation?: string,
    expiryTime?: Date,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "TOKEN_ERROR", {
      tokenType,
      operation,
      expiryTime: expiryTime?.toISOString(),
      ...metadata,
    });
  }
}

/**
 * AWS CLI error for subprocess operation failures
 *
 * Used when AWS CLI subprocess operations fail, including process execution,
 * timeout, and unexpected exit codes.
 *
 * @public
 */
export class AwsCliError extends BaseError {
  /**
   * Create a new AWS CLI error
   *
   * @param message - User-friendly AWS CLI error message
   * @param command - The AWS CLI command that failed
   * @param exitCode - The process exit code
   * @param stdout - The process stdout output
   * @param stderr - The process stderr output
   * @param metadata - Additional AWS CLI context
   */
  constructor(
    message: string,
    command?: string,
    exitCode?: number,
    stdout?: string,
    stderr?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "AWS_CLI_ERROR", {
      command,
      exitCode,
      stdout,
      stderr,
      ...metadata,
    });
  }
}

/**
 * Check if an error is an authentication-related error
 *
 * @param error - The error to check
 * @returns True if the error is authentication-related
 *
 * @public
 */
export function isAuthError(
  error: unknown,
): error is AuthenticationError | ProfileError | TokenError | AwsCliError {
  return (
    error instanceof AuthenticationError ||
    error instanceof ProfileError ||
    error instanceof TokenError ||
    error instanceof AwsCliError
  );
}

/**
 * Format authentication errors with guidance
 *
 * Provides centralized error formatting for all auth commands with
 * user-friendly messages and resolution guidance. Similar to formatLambdaError
 * but specific to authentication operations.
 *
 * @param error - The error that occurred
 * @param verbose - Whether to include verbose error details like stack traces
 * @param context - Optional context for the operation that failed
 * @returns Formatted error message with guidance
 *
 * @public
 */
export function formatAuthError(error: unknown, verbose = false, context?: string): string {
  const guidance = getAuthErrorGuidance(error);
  const contextPrefix = context ? `${context}: ` : "";

  if (error instanceof Error) {
    let message = `${contextPrefix}${error.message}`;

    if (verbose && error.stack) {
      message += `\n\nStack trace:\n${error.stack}`;
    }

    return `${message}\n\n${guidance}`;
  }

  return `${contextPrefix}An unknown error occurred\n\n${guidance}`;
}
