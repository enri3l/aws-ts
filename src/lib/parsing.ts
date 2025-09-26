/**
 * Shared parsing utilities for DynamoDB commands
 *
 * Provides common functionality for parsing JSON inputs, handling file:// protocol,
 * and validating input formats across all DynamoDB command implementations.
 *
 * @file Centralized parsing utilities to reduce code duplication and cognitive complexity
 */

/**
 * Safely parse JSON content and validate as Record\<string, unknown\>
 *
 * @param content - JSON string to parse
 * @param context - Context for error messages
 * @returns Parsed and validated object
 * @throws Error if JSON is invalid or not an object
 */
export function parseJsonAsRecord(content: string, context: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(content);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError(`${context} must be a valid JSON object, got ${typeof parsed}`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Safely parse JSON content and validate as Record\<string, string\>
 *
 * @param content - JSON string to parse
 * @param context - Context for error messages
 * @returns Parsed and validated object
 * @throws Error if JSON is invalid or contains non-string values
 */
export function parseJsonAsStringRecord(content: string, context: string): Record<string, string> {
  const parsed: unknown = JSON.parse(content);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new TypeError(`${context} must be a valid JSON object, got ${typeof parsed}`);
  }

  const record = parsed as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (typeof value !== "string") {
      throw new TypeError(
        `${context} must contain only string values, key "${key}" has type ${typeof value}`,
      );
    }
  }

  return record as Record<string, string>;
}

/**
 * Parse input from either direct JSON string or file:// protocol
 *
 * Handles both direct JSON input and file:// URLs, reading file content
 * when necessary and parsing as a JSON object.
 *
 * @param input - JSON string or file:// URL
 * @param context - Context for error messages
 * @returns Parsed and validated object
 * @throws Error if file not found, JSON is invalid, or not an object
 * @example
 * ```typescript
 * // Direct JSON
 * const data = await parseJsonInput('{"key": "value"}', 'User input');
 *
 * // File input
 * const data = await parseJsonInput('file://data.json', 'Configuration file');
 * ```
 */
export async function parseJsonInput(
  input: string,
  context: string,
): Promise<Record<string, unknown>> {
  let content: string;

  if (input.startsWith("file://")) {
    const filePath = input.replace("file://", "");
    const fs = await import("node:fs/promises");
    content = await fs.readFile(filePath, "utf8");
  } else {
    content = input;
  }

  return parseJsonAsRecord(content, context);
}

/**
 * Parse input from either direct JSON string or file:// protocol for string records
 *
 * Handles both direct JSON input and file:// URLs, reading file content
 * when necessary and parsing as a JSON object with string values only.
 *
 * @param input - JSON string or file:// URL
 * @param context - Context for error messages
 * @returns Parsed and validated string record
 * @throws Error if file not found, JSON is invalid, or contains non-string values
 */
export async function parseJsonStringInput(
  input: string,
  context: string,
): Promise<Record<string, string>> {
  let content: string;

  if (input.startsWith("file://")) {
    const filePath = input.replace("file://", "");
    const fs = await import("node:fs/promises");
    content = await fs.readFile(filePath, "utf8");
  } else {
    content = input;
  }

  return parseJsonAsStringRecord(content, context);
}

/**
 * Parse optional JSON string safely
 *
 * @param value - String value to parse (or undefined)
 * @returns Parsed object or undefined if input is not a string
 */
export function parseOptionalJson(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  return JSON.parse(value) as Record<string, unknown>;
}

/**
 * Parse required JSON string safely
 *
 * @param value - String value to parse
 * @returns Parsed object
 * @throws SyntaxError if parsing fails
 */
export function parseRequiredJson(value: string): Record<string, unknown> {
  return JSON.parse(value) as Record<string, unknown>;
}
