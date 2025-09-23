/**
 * Error sanitization utilities for secure verbose output
 *
 * @file
 * Provides secure error sanitization functionality to prevent sensitive data exposure
 * in verbose error output. Implements allowlist-based property filtering with
 * primitive type validation to ensure only safe error metadata is included.
 *
 * @author AWS TypeScript CLI Team
 * @since 0.4.0
 */

import type { SanitizedError } from "./type-utilities.js";
import { isSafePrimitive } from "./type-utilities.js";

/**
 * Set of error properties that are safe to include in verbose output
 *
 * @remarks
 * This allowlist follows the principle of least privilege, only including
 * properties that are explicitly known to be safe for logging and debugging.
 * Properties containing sensitive data (credentials, tokens, internal paths)
 * are excluded by default.
 *
 * @internal
 */
const SAFE_ERROR_PROPERTIES = new Set([
  "message",
  "stack",
  "name",
  "code",
  "requestId",
  "httpStatusCode",
  "statusCode",
  "errno",
  "syscall",
  "signal",
  "field",
  "value",
  "config.region",
  "expectedFormat",
  "suggestions",
]);

/**
 * Sanitize error objects for verbose output display
 *
 * @param error - Error object to sanitize
 * @returns Sanitized error data safe for logging
 *
 * @remarks
 * This function implements a security-first approach to error serialization by:
 * - Using an allowlist of safe properties (SAFE_ERROR_PROPERTIES)
 * - Validating that property values are primitive types only
 * - Preventing exposure of complex objects that might contain sensitive data
 * - Handling circular references and malformed error objects gracefully
 *
 * The sanitization process never throws exceptions and provides fallback
 * behavior for all input types.
 *
 * @example
 * ```typescript
 * const error = new Error('Something went wrong');
 * error.code = 'AUTH_FAILED';
 * error.sensitiveToken = 'secret-123'; // This will be excluded
 *
 * const sanitized = sanitizeErrorForVerboseOutput(error);
 * // Result: { message: 'Something went wrong', name: 'Error', code: 'AUTH_FAILED' }
 * ```
 *
 * @throws Never throws - handles all error types gracefully
 *
 * @public
 */
export function sanitizeErrorForVerboseOutput(error: unknown): SanitizedError {
  // Handle non-object types
  if (!(error instanceof Object)) {
    return { message: String(error) };
  }

  const sanitized: Partial<SanitizedError> = {};

  // Iterate through object properties safely
  try {
    for (const key in error) {
      // Only include allowlisted properties
      if (SAFE_ERROR_PROPERTIES.has(key)) {
        const value = (error as Record<string, unknown>)[key];
        assignSafeProperty(sanitized, key, value);
      }
    }
  } catch {
    // Handle cases where property enumeration fails
    // Fall through to ensure we always return something useful
  }

  // Ensure we always have a message property for debugging
  if (!sanitized.message && "message" in error) {
    const errorObject = error as Record<string, unknown>;
    const message = errorObject.message;
    if (
      typeof message === "string" && // For standard Error objects, include message even if not enumerable
      // For other objects, only include if enumerable
      (error instanceof Error || Object.prototype.propertyIsEnumerable.call(error, "message"))
    ) {
      assignSafeProperty(sanitized, "message", message);
    }
  }

  // Fallback for completely empty sanitized objects
  if (Object.keys(sanitized).length === 0) {
    return { message: "Error details not available" };
  }

  return sanitized as SanitizedError;
}

/**
 * Assign a safe property to the sanitized error object
 *
 * @param sanitized - Partial sanitized error object to modify
 * @param key - Property key to assign
 * @param value - Property value to assign if safe
 * @internal
 */
function assignSafeProperty(sanitized: Partial<SanitizedError>, key: string, value: unknown): void {
  // Type-safe assignment based on known safe properties
  switch (key) {
    case "message":
    case "name":
    case "code":
    case "stack":
    case "requestId":
    case "syscall":
    case "signal":
    case "field":
    case "config.region": {
      if (typeof value === "string") {
        (sanitized as Record<string, string>)[key] = value;
      }
      break;
    }
    case "httpStatusCode":
    case "statusCode":
    case "errno": {
      if (typeof value === "number") {
        (sanitized as Record<string, number>)[key] = value;
      }
      break;
    }
    case "value":
    case "expectedFormat":
    case "suggestions": {
      // These can be any primitive type or array
      if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean" ||
        Array.isArray(value)
      ) {
        (sanitized as Record<string, unknown>)[key] = value;
      }
      break;
    }
    default: {
      // For other properties, only include primitive values to prevent object exposure
      if (isSafePrimitive(value)) {
        (sanitized as Record<string, unknown>)[key] = value;
      }
      break;
    }
  }
}

/**
 * Check if an error property is safe for inclusion in verbose output
 *
 * @param propertyName - Name of the error property to check
 * @returns True if the property is safe to include
 *
 * @remarks
 * This function provides a way to programmatically check if a property
 * would be included by the sanitization process. Useful for testing
 * and validation scenarios.
 *
 * @example
 * ```typescript
 * isSafeErrorProperty('message'); // true
 * isSafeErrorProperty('credentials'); // false
 * ```
 *
 * @public
 */
export function isSafeErrorProperty(propertyName: string): boolean {
  return SAFE_ERROR_PROPERTIES.has(propertyName);
}
