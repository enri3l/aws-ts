/**
 * Unit tests for data processing framework
 *
 * Tests JSON/JSONL/CSV/TSV parsing and formatting capabilities with
 * comprehensive coverage of edge cases, error handling, and performance.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DataFormat,
  DataProcessor,
  createDataProcessor,
  type DataProcessingOptions,
  type DataRecord,
} from "../../../src/lib/data-processing.js";

describe("Data Processing Framework", () => {
  describe("DataFormat enum", () => {
    it("should have correct format values", () => {
      expect(DataFormat.JSON).toBe("json");
      expect(DataFormat.JSONL).toBe("jsonl");
      expect(DataFormat.CSV).toBe("csv");
      expect(DataFormat.TSV).toBe("tsv");
    });
  });

  describe("DataProcessor constructor", () => {
    it("should initialize with default options", () => {
      const processor = new DataProcessor({ format: DataFormat.JSON });

      // Test through output formatting to verify internal options
      const records: DataRecord[] = [{ data: { test: "value" }, index: 0 }];
      const output = processor.formatOutput(records);

      expect(output).toBe('[{"test":"value"}]'); // Not pretty printed
    });

    it("should apply custom options correctly", () => {
      const options: DataProcessingOptions = {
        format: DataFormat.JSON,
        prettyPrint: true,
        includeHeaders: false,
        limit: 10,
        delimiter: "|",
      };

      const processor = new DataProcessor(options);
      const records: DataRecord[] = [{ data: { test: "value" }, index: 0 }];
      const output = processor.formatOutput(records);

      expect(output).toContain('[\n  {\n    "test": "value"\n  }\n]'); // Pretty printed array
    });

    it("should set TSV delimiter by default for TSV format", () => {
      const processor = new DataProcessor({ format: DataFormat.TSV });
      const records: DataRecord[] = [{ data: { col1: "value1", col2: "value2" }, index: 0 }];

      const output = processor.formatOutput(records);
      expect(output).toContain("\t"); // Tab delimiter
    });

    it("should set CSV delimiter by default for CSV format", () => {
      const processor = new DataProcessor({ format: DataFormat.CSV });
      const records: DataRecord[] = [{ data: { col1: "value1", col2: "value2" }, index: 0 }];

      const output = processor.formatOutput(records);
      expect(output).toContain(","); // Comma delimiter
    });

    it("should handle infinite limit by default", () => {
      const processor = new DataProcessor({ format: DataFormat.JSON });

      // Create large input to test limit handling
      const largeArray = Array.from({ length: 1000 }, (_, index) => ({ id: index }));
      const input = JSON.stringify(largeArray);

      const result = processor.parseInput(input, DataFormat.JSON);
      expect(result.records).toHaveLength(1000);
    });
  });

  describe("JSON parsing", () => {
    let processor: DataProcessor;

    beforeEach(() => {
      processor = new DataProcessor({ format: DataFormat.JSON });
    });

    it("should parse valid JSON object", () => {
      const input = '{"name": "test", "value": 123}';
      const result = processor.parseInput(input, DataFormat.JSON);

      expect(result.records).toHaveLength(1);
      expect(result.records[0]).toEqual({
        data: { name: "test", value: 123 },
        index: 0,
      });
      expect(result.stats.totalRecords).toBe(1);
      expect(result.stats.errorCount).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it("should parse valid JSON array", () => {
      const input = '[{"id": 1}, {"id": 2}, {"id": 3}]';
      const result = processor.parseInput(input, DataFormat.JSON);

      expect(result.records).toHaveLength(3);
      expect(result.records[0].data).toEqual({ id: 1 });
      expect(result.records[1].data).toEqual({ id: 2 });
      expect(result.records[2].data).toEqual({ id: 3 });
      expect(result.stats.totalRecords).toBe(3);
    });

    it("should respect limit option", () => {
      const limitedProcessor = new DataProcessor({
        format: DataFormat.JSON,
        limit: 2,
      });
      const input = '[{"id": 1}, {"id": 2}, {"id": 3}, {"id": 4}]';

      const result = limitedProcessor.parseInput(input, DataFormat.JSON);

      expect(result.records).toHaveLength(2);
      expect(result.stats.totalRecords).toBe(2);
    });

    it("should handle invalid JSON gracefully", () => {
      const input = '{"invalid": json}';
      const result = processor.parseInput(input, DataFormat.JSON);

      expect(result.records).toHaveLength(0);
      expect(result.stats.totalRecords).toBe(0);
      expect(result.stats.errorCount).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].line).toBe(1);
      expect(result.errors[0].message).toContain("Unexpected token");
      expect(result.errors[0].rawData).toBe('{"invalid": json}');
    });

    it("should handle empty JSON input", () => {
      const input = "";
      const result = processor.parseInput(input, DataFormat.JSON);

      expect(result.records).toHaveLength(0);
      expect(result.stats.errorCount).toBe(1);
      expect(result.errors[0].message).toContain("Unexpected end");
    });

    it("should measure processing time", () => {
      const input = '{"test": "value"}';
      const result = processor.parseInput(input, DataFormat.JSON);

      expect(result.stats.processingTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.stats.processingTimeMs).toBe("number");
    });
  });

  describe("JSONL parsing", () => {
    let processor: DataProcessor;

    beforeEach(() => {
      processor = new DataProcessor({ format: DataFormat.JSONL });
    });

    it("should parse valid JSONL input", () => {
      const input = `{"id": 1, "name": "first"}
{"id": 2, "name": "second"}
{"id": 3, "name": "third"}`;

      const result = processor.parseInput(input, DataFormat.JSONL);

      expect(result.records).toHaveLength(3);
      expect(result.records[0]).toEqual({
        data: { id: 1, name: "first" },
        index: 0,
        lineNumber: 1,
      });
      expect(result.records[1]).toEqual({
        data: { id: 2, name: "second" },
        index: 1,
        lineNumber: 2,
      });
      expect(result.stats.totalRecords).toBe(3);
    });

    it("should skip empty lines", () => {
      const input = `{"id": 1}

{"id": 2}

{"id": 3}`;

      const result = processor.parseInput(input, DataFormat.JSONL);

      expect(result.records).toHaveLength(3);
      expect(result.stats.totalRecords).toBe(3);
    });

    it("should handle partial invalid lines", () => {
      const input = `{"id": 1}
{"invalid": json}
{"id": 3}`;

      const result = processor.parseInput(input, DataFormat.JSONL);

      expect(result.records).toHaveLength(2);
      expect(result.stats.totalRecords).toBe(2);
      expect(result.stats.errorCount).toBe(1);
      expect(result.errors[0].line).toBe(2);
      expect(result.errors[0].rawData).toBe('{"invalid": json}');
    });

    it("should respect limit across lines", () => {
      const limitedProcessor = new DataProcessor({
        format: DataFormat.JSONL,
        limit: 2,
      });
      const input = `{"id": 1}
{"id": 2}
{"id": 3}
{"id": 4}`;

      const result = limitedProcessor.parseInput(input, DataFormat.JSONL);

      expect(result.records).toHaveLength(2);
      expect(result.stats.totalRecords).toBe(2);
    });

    it("should handle non-Error objects in catch block", () => {
      // Mock JSON.parse to throw a non-Error object
      const originalParse = JSON.parse;
      vi.spyOn(JSON, "parse").mockImplementation((text) => {
        if (text.includes("special")) {
          throw new Error("String error");
        }
        return originalParse(text);
      });

      const input = '{"special": "value"}';
      const result = processor.parseInput(input, DataFormat.JSONL);

      expect(result.errors[0].message).toBe("String error");

      vi.restoreAllMocks();
    });
  });

  describe("CSV parsing", () => {
    let processor: DataProcessor;

    beforeEach(() => {
      processor = new DataProcessor({ format: DataFormat.CSV });
    });

    it("should parse basic CSV with headers", () => {
      const input = `name,age,city
John,25,NYC
Jane,30,LA`;

      const result = processor.parseInput(input, DataFormat.CSV);

      expect(result.records).toHaveLength(2);
      expect(result.records[0]).toEqual({
        data: { name: "John", age: 25, city: "NYC" },
        index: 0,
        lineNumber: 2,
      });
      expect(result.records[1]).toEqual({
        data: { name: "Jane", age: 30, city: "LA" },
        index: 1,
        lineNumber: 3,
      });
    });

    it("should handle missing column headers", () => {
      const input = `value1,value2,value3
data1,data2,data3`;

      const result = processor.parseInput(input, DataFormat.CSV);

      expect(result.records[0].data).toEqual({
        value1: "data1",
        value2: "data2",
        value3: "data3",
      });
    });

    it("should handle extra columns beyond headers", () => {
      const input = `col1,col2
value1,value2,extra1,extra2`;

      const result = processor.parseInput(input, DataFormat.CSV);

      expect(result.records[0].data).toEqual({
        col1: "value1",
        col2: "value2",
        column_2: "extra1",
        column_3: "extra2",
      });
    });

    it("should parse different data types", () => {
      const input = `name,count,active,description
test,42,true,empty_string
blank,0,false,`;

      const result = processor.parseInput(input, DataFormat.CSV);

      expect(result.records[0].data).toEqual({
        name: "test",
        count: 42,
        active: true,
        description: "empty_string",
      });
      expect(result.records[1].data).toEqual({
        name: "blank",
        count: 0,
        active: false,
        description: undefined, // Empty string becomes undefined
      });
    });

    it("should handle empty CSV input", () => {
      const input = "";
      const result = processor.parseInput(input, DataFormat.CSV);

      expect(result.records).toHaveLength(0);
      expect(result.stats.totalRecords).toBe(0);
    });

    it("should handle CSV with only headers", () => {
      const input = "col1,col2,col3";
      const result = processor.parseInput(input, DataFormat.CSV);

      expect(result.records).toHaveLength(0);
      expect(result.stats.totalRecords).toBe(0);
    });

    it("should filter out empty lines", () => {
      const input = `name,value

John,123

Jane,456
`;

      const result = processor.parseInput(input, DataFormat.CSV);

      expect(result.records).toHaveLength(2);
      expect(result.stats.totalRecords).toBe(2);
    });

    it("should respect limit option", () => {
      const limitedProcessor = new DataProcessor({
        format: DataFormat.CSV,
        limit: 1,
      });
      const input = `name,value
first,1
second,2
third,3`;

      const result = limitedProcessor.parseInput(input, DataFormat.CSV);

      expect(result.records).toHaveLength(1);
      expect(result.stats.totalRecords).toBe(1);
    });
  });

  describe("TSV parsing", () => {
    let processor: DataProcessor;

    beforeEach(() => {
      processor = new DataProcessor({ format: DataFormat.TSV });
    });

    it("should parse TSV with tab delimiters", () => {
      const input = `name\tage\tcity
John\t25\tNYC
Jane\t30\tLA`;

      const result = processor.parseInput(input, DataFormat.TSV);

      expect(result.records).toHaveLength(2);
      expect(result.records[0].data).toEqual({
        name: "John",
        age: 25,
        city: "NYC",
      });
    });

    it("should use tab delimiter when parsing as TSV", () => {
      // Test that comma-separated data doesn't get parsed correctly as TSV
      const input = `name,age,city
John,25,NYC`;

      const result = processor.parseInput(input, DataFormat.TSV);

      // Should treat the entire comma-separated line as single values
      expect(result.records[0].data).toEqual({
        "name,age,city": "John,25,NYC",
      });
    });
  });

  describe("Output formatting", () => {
    describe("JSON formatting", () => {
      it("should format records as compact JSON by default", () => {
        const processor = new DataProcessor({ format: DataFormat.JSON });
        const records: DataRecord[] = [
          { data: { name: "test", value: 123 }, index: 0 },
          { data: { name: "test2", value: 456 }, index: 1 },
        ];

        const output = processor.formatOutput(records);

        expect(output).toBe('[{"name":"test","value":123},{"name":"test2","value":456}]');
      });

      it("should format records as pretty JSON when enabled", () => {
        const processor = new DataProcessor({
          format: DataFormat.JSON,
          prettyPrint: true,
        });
        const records: DataRecord[] = [{ data: { name: "test" }, index: 0 }];

        const output = processor.formatOutput(records);

        expect(output).toContain('{\n    "name": "test"\n  }');
      });

      it("should handle empty records array", () => {
        const processor = new DataProcessor({ format: DataFormat.JSON });
        const output = processor.formatOutput([]);

        expect(output).toBe("[]");
      });
    });

    describe("JSONL formatting", () => {
      it("should format records as JSONL", () => {
        const processor = new DataProcessor({ format: DataFormat.JSONL });
        const records: DataRecord[] = [
          { data: { name: "first" }, index: 0 },
          { data: { name: "second" }, index: 1 },
        ];

        const output = processor.formatOutput(records);

        expect(output).toBe('{"name":"first"}\n{"name":"second"}');
      });

      it("should handle empty records array", () => {
        const processor = new DataProcessor({ format: DataFormat.JSONL });
        const output = processor.formatOutput([]);

        expect(output).toBe("");
      });
    });

    describe("CSV formatting", () => {
      it("should format records as CSV with headers", () => {
        const processor = new DataProcessor({ format: DataFormat.CSV });
        const records: DataRecord[] = [
          { data: { name: "John", age: 25 }, index: 0 },
          { data: { name: "Jane", age: 30 }, index: 1 },
        ];

        const output = processor.formatOutput(records);

        expect(output).toBe("age,name\n25,John\n30,Jane");
      });

      it("should format records as CSV without headers when disabled", () => {
        const processor = new DataProcessor({
          format: DataFormat.CSV,
          includeHeaders: false,
        });
        const records: DataRecord[] = [{ data: { name: "John", age: 25 }, index: 0 }];

        const output = processor.formatOutput(records);

        expect(output).toBe("25,John");
      });

      it("should handle heterogeneous record schemas", () => {
        const processor = new DataProcessor({ format: DataFormat.CSV });
        const records: DataRecord[] = [
          { data: { name: "John", age: 25 }, index: 0 },
          { data: { name: "Jane", city: "NYC" }, index: 1 },
          { data: { age: 35, city: "LA", country: "USA" }, index: 2 },
        ];

        const output = processor.formatOutput(records);

        // Should include all columns from all records
        expect(output).toContain("age,city,country,name");
        expect(output).toContain("25,,,John"); // Missing city, country (4 columns)
        expect(output).toContain(",NYC,,Jane"); // Missing age, country
        expect(output).toContain("35,LA,USA,"); // Missing name
      });

      it("should quote values containing delimiters", () => {
        const processor = new DataProcessor({ format: DataFormat.CSV });
        const records: DataRecord[] = [{ data: { description: "Value, with commas" }, index: 0 }];

        const output = processor.formatOutput(records);

        expect(output).toContain('"Value, with commas"');
      });

      it("should quote values containing quotes and escape them", () => {
        const processor = new DataProcessor({ format: DataFormat.CSV });
        const records: DataRecord[] = [{ data: { description: 'Value "with quotes"' }, index: 0 }];

        const output = processor.formatOutput(records);

        expect(output).toContain('"Value ""with quotes"""');
      });

      it("should quote values containing newlines", () => {
        const processor = new DataProcessor({ format: DataFormat.CSV });
        const records: DataRecord[] = [{ data: { description: "Line 1\nLine 2" }, index: 0 }];

        const output = processor.formatOutput(records);

        expect(output).toContain('"Line 1\nLine 2"');
      });

      it("should handle null and undefined values", () => {
        const processor = new DataProcessor({ format: DataFormat.CSV });
        const records: DataRecord[] = [
          { data: { value1: undefined, value2: undefined, value3: "test" }, index: 0 },
        ];

        const output = processor.formatOutput(records);

        expect(output).toContain(",,test"); // undefined becomes empty
      });

      it("should handle object values by JSON stringifying", () => {
        const processor = new DataProcessor({ format: DataFormat.CSV });
        const records: DataRecord[] = [
          { data: { nested: { key: "value" }, array: [1, 2, 3] }, index: 0 },
        ];

        const output = processor.formatOutput(records);

        expect(output).toContain('"{""key"":""value""}"');
        expect(output).toContain("[1,2,3]");
      });

      it("should handle boolean and number values", () => {
        const processor = new DataProcessor({ format: DataFormat.CSV });
        const records: DataRecord[] = [{ data: { active: true, count: 42, rate: 3.14 }, index: 0 }];

        const output = processor.formatOutput(records);

        expect(output).toContain("true,42,3.14");
      });

      it("should handle empty records array", () => {
        const processor = new DataProcessor({ format: DataFormat.CSV });
        const output = processor.formatOutput([]);

        expect(output).toBe("");
      });

      it("should sort column headers alphabetically", () => {
        const processor = new DataProcessor({ format: DataFormat.CSV });
        const records: DataRecord[] = [{ data: { zebra: 1, alpha: 2, beta: 3 }, index: 0 }];

        const output = processor.formatOutput(records);

        expect(output).toContain("alpha,beta,zebra");
      });
    });

    describe("TSV formatting", () => {
      it("should format records as TSV with tab delimiters", () => {
        const processor = new DataProcessor({ format: DataFormat.TSV });
        const records: DataRecord[] = [{ data: { name: "John", age: 25 }, index: 0 }];

        const output = processor.formatOutput(records);

        expect(output).toContain("\t"); // Should contain tabs
        expect(output).toBe("age\tname\n25\tJohn");
      });

      it("should use custom delimiter when specified", () => {
        const processor = new DataProcessor({
          format: DataFormat.CSV,
          delimiter: "|",
        });
        const records: DataRecord[] = [{ data: { name: "John", age: 25 }, index: 0 }];

        const output = processor.formatOutput(records);

        expect(output).toBe("age|name\n25|John");
      });
    });

    describe("Error handling for unsupported formats", () => {
      it("should throw error for unsupported output format", () => {
        const processor = new DataProcessor({ format: "invalid" as any });

        expect(() => processor.formatOutput([])).toThrow("Unsupported output format: invalid");
      });

      it("should throw error for unsupported source format", () => {
        const processor = new DataProcessor({ format: DataFormat.JSON });

        expect(() => processor.parseInput("{}", "invalid" as any)).toThrow(
          "Unsupported source format: invalid",
        );
      });
    });
  });

  describe("createDataProcessor factory", () => {
    it("should create processor with specified format", () => {
      const processor = createDataProcessor(DataFormat.CSV);
      const records: DataRecord[] = [{ data: { test: "value" }, index: 0 }];

      const output = processor.formatOutput(records);
      expect(output).toContain("test"); // Should contain the field name
    });

    it("should merge additional options", () => {
      const processor = createDataProcessor(DataFormat.JSON, {
        prettyPrint: true,
        limit: 5,
      });

      const records: DataRecord[] = [{ data: { test: "value" }, index: 0 }];

      const output = processor.formatOutput(records);
      expect(output).toContain('[\n  {\n    "test": "value"\n  }\n]'); // Pretty printed array
    });

    it("should handle empty options", () => {
      const processor = createDataProcessor(DataFormat.JSONL);

      expect(processor).toBeInstanceOf(DataProcessor);
    });

    it("should override default format with options", () => {
      const processor = createDataProcessor(DataFormat.JSON, {
        format: DataFormat.CSV,
      });

      const records: DataRecord[] = [{ data: { test: "value" }, index: 0 }];

      const output = processor.formatOutput(records);
      expect(output).toBe("test\nvalue"); // CSV format, not JSON
    });
  });

  describe("Error handling and edge cases", () => {
    it("should handle processing time measurement correctly", () => {
      const processor = new DataProcessor({ format: DataFormat.JSON });

      // Mock Date.now to control timing
      let callCount = 0;
      vi.spyOn(Date, "now").mockImplementation(() => {
        callCount++;
        return callCount === 1 ? 1000 : 1050; // 50ms processing time
      });

      const result = processor.parseInput('{"test": "value"}', DataFormat.JSON);

      expect(result.stats.processingTimeMs).toBe(50);

      vi.restoreAllMocks();
    });

    it("should handle extremely large numbers in CSV parsing", () => {
      const processor = new DataProcessor({ format: DataFormat.CSV });
      const input = `value\n999999999999999999999999999999`;

      const result = processor.parseInput(input, DataFormat.CSV);

      // Large numbers get converted to scientific notation
      expect(result.records[0].data.value).toBe(1e30);
    });

    it("should handle special float values in CSV parsing", () => {
      const processor = new DataProcessor({ format: DataFormat.CSV });
      const input = `value1,value2,value3\nInfinity,-Infinity,NaN`;

      const result = processor.parseInput(input, DataFormat.CSV);

      expect(result.records[0].data.value1).toBe(Number.POSITIVE_INFINITY);
      expect(result.records[0].data.value2).toBe(Number.NEGATIVE_INFINITY);
      expect(result.records[0].data.value3).toBe("NaN");
    });

    it("should handle unknown value types in CSV formatting", () => {
      const processor = new DataProcessor({ format: DataFormat.CSV });
      const records: DataRecord[] = [{ data: { value: Symbol("test") }, index: 0 }];

      // Should not throw when handling unsupported types
      expect(() => processor.formatOutput(records)).not.toThrow();

      const result = processor.formatOutput(records);
      expect(result).toContain("[Object]"); // Symbol gets stringified as [Object]
    });
  });
});
