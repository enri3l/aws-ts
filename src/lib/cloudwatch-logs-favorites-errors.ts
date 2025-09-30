/**
 * CloudWatch Logs Favorites-specific error types
 *
 * Extends the base error system with favorites-specific error handling
 * for favorites management, storage operations, and saved query operations.
 *
 */

import { BaseError } from "./errors.js";

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
 * Check if an error is a favorites-related error
 *
 * @param error - The error to check
 * @returns True if the error is favorites-related
 *
 * @public
 */
export function isFavoritesError(error: unknown): error is FavoritesError {
  return error instanceof FavoritesError;
}

/**
 * Get user-friendly guidance for favorites errors
 *
 * @param error - The error to provide guidance for
 * @returns User-friendly guidance message
 *
 * @public
 */
export function getFavoritesErrorGuidance(error: unknown): string {
  if (isFavoritesError(error)) {
    if (error.message.includes("storage")) {
      return "Unable to save favorites. Check write permissions for the configuration directory (~/.aws-ts/). Ensure the directory exists and is writable.";
    }
    return "Favorites operation failed. Verify the favorite name is unique and the configuration is valid.";
  }

  return "Unknown favorites error. Check storage permissions and configuration.";
}
