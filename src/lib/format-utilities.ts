/**
 * @module format-utils
 * Formatting utilities for human-readable output
 *
 * Provides common formatting functions used across CLI commands for
 * displaying data in user-friendly formats.
 *
 * @public
 */

/**
 * Format bytes to human-readable string with appropriate unit
 *
 * Converts byte counts to human-readable format using binary units (1024-based).
 * Automatically selects the most appropriate unit (B, KB, MB, GB, TB) based on size.
 *
 * @param bytes - Number of bytes to format
 * @returns Formatted string with value and unit (e.g., "1.50 MB", "342 B")
 *
 * @remarks
 * Uses binary units (1 KB = 1024 bytes) rather than decimal units (1 kB = 1000 bytes)
 * to align with common file system and storage conventions.
 *
 * @example Format various byte counts
 * ```typescript
 * formatBytes(0);          // "0 B"
 * formatBytes(1024);       // "1.00 KB"
 * formatBytes(1536);       // "1.50 KB"
 * formatBytes(1048576);    // "1.00 MB"
 * formatBytes(1073741824); // "1.00 GB"
 * ```
 *
 * @public
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / k ** index).toFixed(2)} ${sizes[index]}`;
}
