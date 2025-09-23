/**
 * Type utilities for safe value conversion and type handling
 *
 * @file
 * Provides type-safe utilities for converting unknown values to strings,
 * handling metadata safely, and ensuring TypeScript compliance while
 * maintaining security guarantees.
 *
 * @author AWS TypeScript CLI Team
 * @since 0.4.0
 */

/**
 * Sanitized error object with known safe properties
 *
 * @public
 */
export interface SanitizedError {
  readonly message: string;
  readonly name?: string;
  readonly code?: string;
  readonly stack?: string;
  readonly requestId?: string;
  readonly httpStatusCode?: number;
  readonly statusCode?: number;
  readonly errno?: number;
  readonly syscall?: string;
  readonly signal?: string;
}

/**
 * Safely convert unknown value to string for template literals
 *
 * @param value - Unknown value to convert
 * @returns Safe string representation
 *
 * @remarks
 * This function provides type-safe conversion of unknown values to strings
 * for use in template literals and error messages. It handles all value types
 * gracefully and never throws exceptions.
 *
 * @example
 * ```typescript
 * const timeout = error.metadata.timeoutMs;
 * const message = 'Operation timed out after ' + toSafeString(timeout) + 'ms';
 * ```
 *
 * @public
 */
export function toSafeString(value: unknown): string {
  if (value === null || value === undefined) {
    return "Unknown";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  // Handle objects
  // eslint-disable-next-line sonarjs/different-types-comparison -- typeof null === 'object' in JavaScript, null check required
  if (typeof value === "object" && value !== null) {
    return stringifyObject(value);
  }

  // Handle other types (function, symbol, bigint)
  try {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- Only function, symbol, bigint reach here; all stringify correctly
    return String(value);
  } catch {
    return "Unknown";
  }
}

/**
 * Convert an object to a safe string representation
 * @param object - Object to stringify
 * @returns Safe string representation
 * @internal
 */
function stringifyObject(object: object): string {
  // Handle RegExp objects - return the regex pattern with quotes
  if (object instanceof RegExp) {
    return `"${object.toString()}"`;
  }

  // Handle Error objects - try to include the message
  if (object instanceof Error) {
    return stringifyError(object);
  }

  // Handle other objects
  return stringifyGenericObject(object);
}

/**
 * Convert an Error object to a safe string representation
 * @param error - Error to stringify
 * @returns Safe string representation
 * @internal
 */
function stringifyError(error: Error): string {
  try {
    const jsonResult = JSON.stringify(error);
    // If JSON.stringify returns '{}', try to extract the message
    if (jsonResult === "{}") {
      return error.message || "[Error]";
    }
    return jsonResult;
  } catch {
    return error.message || "[Error]";
  }
}

/**
 * Convert a generic object to a safe string representation
 * @param object - Object to stringify
 * @returns Safe string representation
 * @internal
 */
function stringifyGenericObject(object: object): string {
  try {
    const jsonResult = JSON.stringify(object);

    // For empty objects {}, validate that toString works properly
    if (jsonResult === "{}") {
      return validateEmptyObjectToString(object, jsonResult);
    }

    return jsonResult;
  } catch {
    // If JSON.stringify fails (circular refs, etc.), return safe fallback
    return tryStringConversionFallback(object);
  }
}

/**
 * Validate empty object string conversion
 * @param object - Object to validate
 * @param jsonResult - JSON result to return if valid
 * @returns Safe string representation
 * @internal
 */
function validateEmptyObjectToString(object: object, jsonResult: string): string {
  try {
    // Check if the object has a working toString method
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- Intentional check for custom toString implementation
    object.toString();
    // String() works, return the JSON result
    return jsonResult;
  } catch {
    // String() fails, this indicates problematic toString/valueOf
    return "Unknown";
  }
}

/**
 * Try string conversion as fallback for objects that can't be JSON stringified
 * @param object - Object to convert
 * @returns Safe string representation
 * @internal
 */
function tryStringConversionFallback(object: object): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- Intentional check for custom toString implementation
    object.toString();
    return "[Object]";
  } catch {
    return "Unknown";
  }
}

/**
 * Check if a value is a safe primitive type
 *
 * @param value - Value to check
 * @returns True if value is a safe primitive (string, number, boolean)
 *
 * @internal
 */
export function isSafePrimitive(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
