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

  // For objects, arrays, and other complex types
  // eslint-disable-next-line sonarjs/different-types-comparison -- typeof null === 'object' in JavaScript, null check required
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return "[Object]";
    }
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-base-to-string -- Only function, symbol, bigint reach here; all stringify correctly
    return String(value);
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
