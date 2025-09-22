/**
 * Data parsing/processing framework for JSON/JSONLine/CSV normalization
 *
 * Provides unified data processing capabilities for CLI output and input handling
 * with support for multiple formats and streaming processing for large datasets.
 *
 */

/**
 * Supported data formats for parsing and output
 *
 * @public
 */
export enum DataFormat {
  JSON = "json",
  JSONL = "jsonl",
  CSV = "csv",
  TSV = "tsv",
}

/**
 * Data processing options
 *
 * @public
 */
export interface DataProcessingOptions {
  /**
   * Output format for processed data
   */
  format: DataFormat;

  /**
   * Custom field delimiter for CSV/TSV formats
   */
  delimiter?: string;

  /**
   * Include headers in CSV output
   */
  includeHeaders?: boolean;

  /**
   * Pretty print JSON output
   */
  prettyPrint?: boolean;

  /**
   * Maximum number of records to process
   */
  limit?: number;
}

/**
 * Parsed data record with metadata
 *
 * @public
 */
export interface DataRecord {
  /**
   * Record data as key-value pairs
   */
  data: Record<string, unknown>;

  /**
   * Record index in the source data
   */
  index: number;

  /**
   * Source line number (for line-based formats)
   */
  lineNumber?: number;
}

/**
 * Data processing result with statistics
 *
 * @public
 */
export interface ProcessingResult {
  /**
   * Processed data records
   */
  records: DataRecord[];

  /**
   * Processing statistics
   */
  stats: {
    /**
     * Total records processed
     */
    totalRecords: number;

    /**
     * Records with parsing errors
     */
    errorCount: number;

    /**
     * Processing time in milliseconds
     */
    processingTimeMs: number;
  };

  /**
   * Parsing errors encountered
   */
  errors: Array<{
    /**
     * Line number where error occurred
     */
    line: number;

    /**
     * Error message
     */
    message: string;

    /**
     * Raw data that caused the error
     */
    rawData: string;
  }>;
}

/**
 * Data processor for handling multiple input/output formats
 *
 * Provides unified interface for parsing and formatting data in various formats
 * commonly used in CLI applications and AWS service outputs.
 *
 * @public
 */
export class DataProcessor {
  private readonly options: Required<DataProcessingOptions>;

  /**
   * Create a new data processor
   *
   * @param options - Processing configuration options
   */
  constructor(options: DataProcessingOptions) {
    this.options = {
      format: options.format,
      delimiter: options.delimiter ?? (options.format === DataFormat.TSV ? "\t" : ","),
      includeHeaders: options.includeHeaders ?? true,
      prettyPrint: options.prettyPrint ?? false,
      limit: options.limit ?? Number.POSITIVE_INFINITY,
    };
  }

  /**
   * Parse input data from string
   *
   * @param input - Raw input data string
   * @param sourceFormat - Format of the input data
   * @returns Processing result with parsed records
   *
   * @throws When input format is unsupported or parsing fails
   */
  parseInput(input: string, sourceFormat: DataFormat): ProcessingResult {
    const startTime = Date.now();
    const result: ProcessingResult = {
      records: [],
      stats: {
        totalRecords: 0,
        errorCount: 0,
        processingTimeMs: 0,
      },
      errors: [],
    };

    try {
      switch (sourceFormat) {
        case DataFormat.JSON: {
          this.parseJson(input, result);
          break;
        }
        case DataFormat.JSONL: {
          this.parseJsonLines(input, result);
          break;
        }
        case DataFormat.CSV:
        case DataFormat.TSV: {
          this.parseCsv(input, result, sourceFormat === DataFormat.TSV ? "\t" : ",");
          break;
        }
        default: {
          throw new Error(`Unsupported source format: ${String(sourceFormat)}`);
        }
      }
    } finally {
      result.stats.processingTimeMs = Date.now() - startTime;
    }

    return result;
  }

  /**
   * Format data records for output
   *
   * @param records - Data records to format
   * @returns Formatted output string
   *
   * @throws When output format is unsupported
   */
  formatOutput(records: DataRecord[]): string {
    switch (this.options.format) {
      case DataFormat.JSON: {
        return this.formatJson(records);
      }
      case DataFormat.JSONL: {
        return this.formatJsonLines(records);
      }
      case DataFormat.CSV:
      case DataFormat.TSV: {
        return this.formatCsv(records);
      }
      default: {
        throw new Error(`Unsupported output format: ${String(this.options.format)}`);
      }
    }
  }

  /**
   * Parse JSON input
   *
   * @param input - JSON string input
   * @param result - Result object to populate
   * @internal
   */
  private parseJson(input: string, result: ProcessingResult): void {
    try {
      const parsed = JSON.parse(input) as unknown;
      const records = Array.isArray(parsed) ? parsed : [parsed];

      for (const [index, record] of records.entries()) {
        if (index >= this.options.limit) break;

        result.records.push({
          data: record as Record<string, unknown>,
          index,
        });
        result.stats.totalRecords++;
      }
    } catch (error) {
      result.errors.push({
        line: 1,
        message: error instanceof Error ? error.message : String(error),
        rawData: input.slice(0, 100),
      });
      result.stats.errorCount++;
    }
  }

  /**
   * Parse JSONL (JSON Lines) input
   *
   * @param input - JSONL string input
   * @param result - Result object to populate
   * @internal
   */
  private parseJsonLines(input: string, result: ProcessingResult): void {
    const lines = input.split("\n").filter((line) => line.trim());

    for (const [lineNumber, line] of lines.entries()) {
      if (result.stats.totalRecords >= this.options.limit) break;

      try {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        result.records.push({
          data: parsed,
          index: result.stats.totalRecords,
          lineNumber: lineNumber + 1,
        });
        result.stats.totalRecords++;
      } catch (error) {
        result.errors.push({
          line: lineNumber + 1,
          message: error instanceof Error ? error.message : String(error),
          rawData: line,
        });
        result.stats.errorCount++;
      }
    }
  }

  /**
   * Parse CSV/TSV input
   *
   * @param input - CSV/TSV string input
   * @param result - Result object to populate
   * @param delimiter - Field delimiter
   * @internal
   */
  private parseCsv(input: string, result: ProcessingResult, delimiter: string): void {
    const lines = input.split("\n").filter((line) => line.trim());
    if (lines.length === 0) return;

    const firstLine = lines[0];
    if (!firstLine) return;

    const headers = firstLine.split(delimiter).map((h) => h.trim());
    const dataLines = lines.slice(1);

    for (const [lineIndex, line] of dataLines.entries()) {
      if (result.stats.totalRecords >= this.options.limit) break;

      try {
        const values = line.split(delimiter).map((v) => v.trim());
        const record: Record<string, unknown> = {};

        for (const [colIndex, value] of values.entries()) {
          const header = headers[colIndex] ?? `column_${colIndex}`;
          record[header] = this.parseValue(value);
        }

        result.records.push({
          data: record,
          index: result.stats.totalRecords,
          lineNumber: lineIndex + 2, // +2 because we skip header and arrays are 0-indexed
        });
        result.stats.totalRecords++;
      } catch (error) {
        result.errors.push({
          line: lineIndex + 2,
          message: error instanceof Error ? error.message : String(error),
          rawData: line,
        });
        result.stats.errorCount++;
      }
    }
  }

  /**
   * Format records as JSON
   *
   * @param records - Records to format
   * @returns JSON string
   * @internal
   */
  private formatJson(records: DataRecord[]): string {
    const data = records.map((r) => r.data);
    return this.options.prettyPrint ? JSON.stringify(data, undefined, 2) : JSON.stringify(data);
  }

  /**
   * Format records as JSONL
   *
   * @param records - Records to format
   * @returns JSONL string
   * @internal
   */
  private formatJsonLines(records: DataRecord[]): string {
    return records.map((r) => JSON.stringify(r.data)).join("\n");
  }

  /**
   * Format records as CSV/TSV
   *
   * @param records - Records to format
   * @returns CSV/TSV string
   * @internal
   */
  private formatCsv(records: DataRecord[]): string {
    if (records.length === 0) return "";

    /**
     * Extract comprehensive column schema from heterogeneous data records.
     * This approach handles varying record structures by collecting all possible
     * field names, ensuring CSV output includes all data points even when
     * individual records have different schemas. Critical for maintaining
     * data integrity during format transformations.
     *
     * @internal
     */
    const allKeys = new Set<string>();
    for (const record of records) {
      for (const key of Object.keys(record.data)) allKeys.add(key);
    }
    const headers = [...allKeys].toSorted((a, b) => a.localeCompare(b));

    const lines: string[] = [];

    /**
     * Include column headers when requested by configuration.
     * Header inclusion is configurable to support both human-readable
     * CSV files (with headers) and raw data exports (without headers)
     * for different consumption patterns and data pipeline requirements.
     *
     * @internal
     */
    if (this.options.includeHeaders) {
      lines.push(headers.join(this.options.delimiter));
    }

    /**
     * Transform each data record into CSV row format.
     * Maps record values to the standardized column schema, handling
     * missing fields gracefully and applying proper CSV value formatting
     * (escaping, quoting) to ensure data integrity in the output format.
     *
     * @internal
     */
    for (const record of records) {
      const values = headers.map((header) => {
        const value = record.data[header];
        return this.formatCsvValue(value);
      });
      lines.push(values.join(this.options.delimiter));
    }

    return lines.join("\n");
  }

  /**
   * Parse string value to appropriate type
   *
   * @param value - String value to parse
   * @returns Parsed value
   * @internal
   */
  private parseValue(value: string): unknown {
    if (value === "") return undefined;
    if (value === "true") return true;
    if (value === "false") return false;

    const numberValue = Number(value);
    if (!Number.isNaN(numberValue)) return numberValue;

    return value;
  }

  /**
   * Format value for CSV output
   *
   * @param value - Value to format
   * @returns Formatted string value
   * @internal
   */
  private formatCsvValue(value: unknown): string {
    if (value === null || value === undefined) return "";

    let stringValue: string;
    if (typeof value === "object") {
      stringValue = JSON.stringify(value);
    } else if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      stringValue = String(value);
    } else {
      stringValue = JSON.stringify(value);
    }

    // Quote values that contain delimiter, quotes, or newlines
    if (
      stringValue.includes(this.options.delimiter) ||
      stringValue.includes('"') ||
      stringValue.includes("\n")
    ) {
      return `"${stringValue.replaceAll('"', '""')}"`;
    }

    return stringValue;
  }
}

/**
 * Create a data processor with common configuration
 *
 * @param format - Output format
 * @param options - Additional processing options
 * @returns Configured data processor
 *
 * @public
 */
export function createDataProcessor(
  format: DataFormat,
  options: Partial<DataProcessingOptions> = {},
): DataProcessor {
  return new DataProcessor({
    format,
    ...options,
  });
}
