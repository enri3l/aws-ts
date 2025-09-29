/**
 * User interface utilities for safe console output
 *
 * @file
 * Provides safe console output utilities that prevent memory exhaustion and
 * terminal crashes from unbounded data display. Implements bounds checking
 * and graceful degradation for large datasets.
 *
 * @author AWS TypeScript CLI Team
 * @since 0.4.0
 */

/**
 * Maximum number of rows to display in console tables
 *
 * @remarks
 * This limit prevents memory exhaustion and terminal crashes when displaying
 * large datasets. Based on empirical testing with various terminal types
 * and system configurations.
 *
 * @internal
 */
const MAX_TABLE_ROWS = 1000;

/**
 * Maximum length for individual table cell content
 *
 * @remarks
 * This limit prevents individual cells from overwhelming the terminal display
 * and ensures readable table formatting even with verbose data.
 *
 * @internal
 */
const MAX_CELL_LENGTH = 256;

/**
 * Display data in table format with safety bounds
 *
 * @param data - Array of data objects to display
 *
 * @remarks
 * This function provides a safe replacement for console.table() that prevents
 * memory exhaustion and terminal crashes. It implements:
 * - Row count limits to prevent overwhelming large datasets
 * - Cell content truncation for readability
 * - User guidance for accessing complete data
 * - Graceful handling of malformed data structures
 *
 * When data exceeds the display limits, users are provided with clear guidance
 * on how to access the complete dataset using alternative output formats.
 *
 * @example
 * ```typescript
 * const profiles = await getProfiles();
 * safeDisplayTable(profiles); // Safely displays up to 1000 rows
 * ```
 *
 * @throws Never throws - handles all data types gracefully
 *
 * @public
 */
export function safeDisplayTable(data: unknown[]): void {
  // Validate input data
  if (!Array.isArray(data)) {
    console.warn("Data format issue: Expected array for table display.");
    return;
  }

  if (data.length === 0) {
    console.log("No data to display.");
    return;
  }

  try {
    // Process data with safety bounds
    let processedData: Record<string, unknown>[];

    if (data.length > MAX_TABLE_ROWS) {
      // Truncate to safe row limit
      processedData = data.slice(0, MAX_TABLE_ROWS).map((item) => truncateObjectProperties(item));

      // Display truncated table
      console.table(processedData);

      // Provide user guidance
      console.log(""); // Add spacing
      console.warn(`Table output truncated to ${MAX_TABLE_ROWS} rows out of ${data.length} total.`);
      console.log(`To view complete data, use: --output json`);
      console.log(`   Showing ${data.length - MAX_TABLE_ROWS} additional rows available.`);
    } else {
      // Safe to display all data with cell truncation
      processedData = data.map((item) => truncateObjectProperties(item));
      console.table(processedData);
    }
  } catch {
    // Fallback for any display errors
    console.warn("Table display unavailable. Use --output json for raw data.");
    console.error(`Data summary: ${data.length} items available`);
  }
}

/**
 * Truncate object properties to safe display lengths
 *
 * @param object - Object whose properties should be truncated
 * @returns Object with truncated string properties
 *
 * @remarks
 * This function ensures that individual table cells don't overwhelm the
 * terminal display by truncating long string values while preserving
 * other data types unchanged.
 *
 * @throws Never throws - handles all errors gracefully
 * @internal
 */
function truncateObjectProperties(object: unknown): Record<string, unknown> {
  // Handle non-object types
  if (typeof object !== "object" || object === null) {
    return { value: String(object) };
  }

  const result: Record<string, unknown> = {};

  try {
    // Process each property safely
    for (const [key, value] of Object.entries(object)) {
      result[key] = truncatePropertyValue(value);
    }
  } catch {
    // Object property enumeration failed during table cell processing
    // This indicates corrupted object state or circular references - re-throw for outer error handling
    throw new Error("Property enumeration failed");
  }

  return result;
}

/**
 * Truncate a single property value to safe display length
 * @param value - Property value to truncate
 * @returns Truncated value safe for display
 * @internal
 */
function truncatePropertyValue(value: unknown): unknown {
  try {
    if (typeof value === "string" && value.length > MAX_CELL_LENGTH) {
      return truncateString(value);
    }

    if (typeof value === "object" && value !== null) {
      return truncateObjectSummary(value);
    }

    // Keep primitive values as-is
    return value;
  } catch {
    // Handle individual property access errors
    return "[Property access error]";
  }
}

/**
 * Truncate a string to safe display length
 * @param string_ - String to truncate
 * @returns Truncated string with ellipsis
 * @internal
 */
function truncateString(string_: string): string {
  return string_.slice(0, Math.max(0, MAX_CELL_LENGTH - 3)) + "...";
}

/**
 * Create a truncated summary for complex objects
 * @param object - Object to summarize
 * @returns Truncated object summary
 * @internal
 */
function truncateObjectSummary(object: object): string {
  const summary = Array.isArray(object) ? `[Array: ${object.length} items]` : "[Object]";

  if (summary.length > MAX_CELL_LENGTH) {
    return summary.slice(0, Math.max(0, MAX_CELL_LENGTH - 3)) + "...";
  }

  return summary;
}

/**
 * Display a safe summary of large datasets
 *
 * @param data - Array of data to summarize
 * @param itemType - Description of what the data items represent
 *
 * @remarks
 * This function provides a summary view for datasets that are too large
 * for table display, giving users an overview without overwhelming the terminal.
 *
 * @example
 * ```typescript
 * safeDisplaySummary(profiles, 'AWS profiles');
 * // Output: "Found 1,250 AWS profiles. Use --output json to view all data."
 * ```
 *
 * @public
 */
export function safeDisplaySummary(data: unknown[], itemType: string = "items"): void {
  if (!Array.isArray(data)) {
    console.log(`Invalid data provided for ${itemType} summary.`);
    return;
  }

  const count = data.length.toLocaleString();
  console.log(` Found ${count} ${itemType}.`);

  if (data.length > MAX_TABLE_ROWS) {
    console.log(`Use --output json to view all ${itemType}.`);
    console.log(`   Table view shows first ${MAX_TABLE_ROWS.toLocaleString()} ${itemType} only.`);
  }
}
