/**
 * Utility functions for diagnostic checks
 *
 * Common operations used across multiple check implementations including
 * file system operations and promise timeout handling.
 */

import { promises as fs } from "node:fs";

/**
 * Read a configuration file with standardized error handling
 *
 * Provides consistent file access patterns used across configuration checks
 * with proper error categorization for common filesystem errors.
 *
 * @param filePath - Path to the file to read
 * @returns Promise resolving to file contents as string
 * @throws Error with categorized message for file access failures
 */
export async function readConfigFile(filePath: string): Promise<string> {
  try {
    await fs.access(filePath);
    const content = await fs.readFile(filePath, "utf8");
    return content;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("ENOENT")) {
        throw new Error(`Configuration file not found: ${filePath}`);
      }
      if (error.message.includes("EACCES")) {
        throw new Error(`Permission denied accessing file: ${filePath}`);
      }
    }
    throw error;
  }
}

/**
 * Check if a file exists and is accessible
 *
 * @param filePath - Path to check
 * @returns Promise resolving to true if file exists and is accessible
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wrap a promise with a timeout
 *
 * Provides consistent timeout handling across connectivity checks
 * with standardized timeout error messaging.
 *
 * @param promise - Promise to wrap with timeout
 * @param timeoutMs - Timeout in milliseconds
 * @param operation - Description of the operation for error messaging
 * @returns Promise that resolves with original promise or rejects on timeout
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string = "operation",
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}
