/**
 * Authentication-specific error types for AWS CLI operations
 *
 * Extends the base error system with authentication-specific error handling
 * for AWS CLI subprocess operations, credential validation, and profile management.
 *
 */

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
 * Get user-friendly resolution guidance for authentication errors
 *
 * @param error - The authentication error to get guidance for
 * @returns Resolution guidance message
 *
 * @public
 */
export function getAuthErrorGuidance(error: unknown): string {
  if (error instanceof AuthenticationError) {
    const operation = error.metadata.operation as string;
    switch (operation) {
      case "sso-login": {
        return "Try running 'aws configure sso' to set up your SSO profile, then 'aws sso login --profile <profile>'";
      }
      case "credential-validation": {
        return "Your credentials may have expired. Try running 'aws sso login --profile <profile>' to refresh them";
      }
      default: {
        return "Check your AWS credentials and profile configuration";
      }
    }
  }

  if (error instanceof ProfileError) {
    const operation = error.metadata.operation as string;
    switch (operation) {
      case "profile-discovery": {
        return "Check that your AWS config file exists at ~/.aws/config and contains valid profile configurations";
      }
      case "profile-switch": {
        return "Verify the profile name exists in your AWS configuration and has valid credentials";
      }
      default: {
        return "Check your AWS profile configuration in ~/.aws/config";
      }
    }
  }

  if (error instanceof TokenError) {
    return "Your SSO token has expired. Run 'aws sso login --profile <profile>' to refresh your credentials";
  }

  if (error instanceof AwsCliError) {
    const exitCode = error.metadata.exitCode as number;
    if (exitCode === 127) {
      return "AWS CLI is not installed or not found in PATH. Please install AWS CLI v2 from https://aws.amazon.com/cli/";
    }
    if (exitCode === 255) {
      return "AWS CLI authentication failed. Check your credentials and network connectivity";
    }
    return "AWS CLI operation failed. Check the error details and try again";
  }

  return "Unknown authentication error. Check your AWS configuration and try again";
}
