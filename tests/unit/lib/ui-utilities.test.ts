/**
 * Unit tests for UI utilities for safe console output
 *
 * Tests terminal-safe console output utilities that prevent memory exhaustion and
 * terminal crashes from unbounded data display with comprehensive boundary testing.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeDisplaySummary, safeDisplayTable } from "../../../src/lib/ui-utilities.js";

describe("UI Utilities", () => {
  // Mock console methods for testing
  const mockConsole = {
    table: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  beforeEach(() => {
    vi.spyOn(console, "table").mockImplementation(mockConsole.table);
    vi.spyOn(console, "log").mockImplementation(mockConsole.log);
    vi.spyOn(console, "warn").mockImplementation(mockConsole.warn);
    vi.spyOn(console, "error").mockImplementation(mockConsole.error);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockConsole.table.mockClear();
    mockConsole.log.mockClear();
    mockConsole.warn.mockClear();
    mockConsole.error.mockClear();
  });

  describe("safeDisplayTable", () => {
    describe("input validation", () => {
      it("should handle non-array input", () => {
        safeDisplayTable("not an array" as unknown as unknown[]);

        expect(mockConsole.warn).toHaveBeenCalledWith(
          "⚠ Data format issue: Expected array for table display.",
        );
        expect(mockConsole.table).not.toHaveBeenCalled();
      });

      it("should handle null input", () => {
        safeDisplayTable(null as unknown as unknown[]);

        expect(mockConsole.warn).toHaveBeenCalledWith(
          "⚠ Data format issue: Expected array for table display.",
        );
        expect(mockConsole.table).not.toHaveBeenCalled();
      });

      it("should handle undefined input", () => {
        safeDisplayTable(undefined as unknown as unknown[]);

        expect(mockConsole.warn).toHaveBeenCalledWith(
          "⚠ Data format issue: Expected array for table display.",
        );
        expect(mockConsole.table).not.toHaveBeenCalled();
      });

      it("should handle object input", () => {
        safeDisplayTable({} as unknown as unknown[]);

        expect(mockConsole.warn).toHaveBeenCalledWith(
          "⚠ Data format issue: Expected array for table display.",
        );
        expect(mockConsole.table).not.toHaveBeenCalled();
      });
    });

    describe("empty data handling", () => {
      it("should handle empty array", () => {
        safeDisplayTable([]);

        expect(mockConsole.log).toHaveBeenCalledWith("No data to display.");
        expect(mockConsole.table).not.toHaveBeenCalled();
      });
    });

    describe("normal data display", () => {
      it("should display small dataset without truncation", () => {
        const data = [
          { name: "Alice", age: 30 },
          { name: "Bob", age: 25 },
        ];

        safeDisplayTable(data);

        expect(mockConsole.table).toHaveBeenCalledWith([
          { name: "Alice", age: 30 },
          { name: "Bob", age: 25 },
        ]);
        expect(mockConsole.warn).not.toHaveBeenCalled();
      });

      it("should handle single item array", () => {
        const data = [{ test: "value" }];

        safeDisplayTable(data);

        expect(mockConsole.table).toHaveBeenCalledWith([{ test: "value" }]);
        expect(mockConsole.warn).not.toHaveBeenCalled();
      });

      it("should handle data with different property types", () => {
        const data = [
          { string: "text", number: 42, boolean: true, null: null, undefined: undefined },
        ];

        safeDisplayTable(data);

        expect(mockConsole.table).toHaveBeenCalledWith([
          { string: "text", number: 42, boolean: true, null: null, undefined: undefined },
        ]);
      });
    });

    describe("large dataset handling", () => {
      it("should truncate datasets exceeding MAX_TABLE_ROWS (1000)", () => {
        const data = Array.from({ length: 1500 }, (_, index) => ({
          id: index,
          name: `Item ${index}`,
        }));

        safeDisplayTable(data);

        expect(mockConsole.table).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({ id: 0, name: "Item 0" }),
            expect.objectContaining({ id: 999, name: "Item 999" }),
          ]),
        );
        expect(mockConsole.table).toHaveBeenCalledWith(
          expect.not.arrayContaining([expect.objectContaining({ id: 1000 })]),
        );
        expect(mockConsole.warn).toHaveBeenCalledWith(
          "⚠ Table output truncated to 1000 rows out of 1500 total.",
        );
        expect(mockConsole.log).toHaveBeenCalledWith(
          "💡 To view complete data, use: --output json",
        );
        expect(mockConsole.log).toHaveBeenCalledWith("   Showing 500 additional rows available.");
      });

      it("should handle exactly MAX_TABLE_ROWS items", () => {
        const data = Array.from({ length: 1000 }, (_, index) => ({ id: index }));

        safeDisplayTable(data);

        expect(mockConsole.table).toHaveBeenCalledWith(
          expect.arrayContaining([expect.objectContaining({ id: 999 })]),
        );
        expect(mockConsole.warn).not.toHaveBeenCalled();
      });

      it("should handle one item over MAX_TABLE_ROWS", () => {
        const data = Array.from({ length: 1001 }, (_, index) => ({ id: index }));

        safeDisplayTable(data);

        expect(mockConsole.warn).toHaveBeenCalledWith(
          "⚠ Table output truncated to 1000 rows out of 1001 total.",
        );
        expect(mockConsole.log).toHaveBeenCalledWith("   Showing 1 additional rows available.");
      });
    });

    describe("cell content truncation", () => {
      it("should truncate long string values exceeding MAX_CELL_LENGTH (256)", () => {
        const longString = "a".repeat(300);
        const data = [{ longText: longString }];

        safeDisplayTable(data);

        const expectedTruncated = "a".repeat(253) + "...";
        expect(mockConsole.table).toHaveBeenCalledWith([{ longText: expectedTruncated }]);
      });

      it("should handle strings exactly at MAX_CELL_LENGTH", () => {
        const exactString = "a".repeat(256);
        const data = [{ text: exactString }];

        safeDisplayTable(data);

        expect(mockConsole.table).toHaveBeenCalledWith([{ text: exactString }]);
      });

      it("should handle strings just over MAX_CELL_LENGTH", () => {
        const longString = "a".repeat(257);
        const data = [{ text: longString }];

        safeDisplayTable(data);

        const expectedTruncated = "a".repeat(253) + "...";
        expect(mockConsole.table).toHaveBeenCalledWith([{ text: expectedTruncated }]);
      });

      it("should preserve non-string values unchanged", () => {
        const data = [{ number: 12_345, boolean: true, null: null }];

        safeDisplayTable(data);

        expect(mockConsole.table).toHaveBeenCalledWith([
          { number: 12_345, boolean: true, null: null },
        ]);
      });
    });

    describe("complex object handling", () => {
      it("should convert arrays to summary strings", () => {
        const data = [{ items: [1, 2, 3, 4, 5] }];

        safeDisplayTable(data);

        expect(mockConsole.table).toHaveBeenCalledWith([{ items: "[Array: 5 items]" }]);
      });

      it("should convert objects to summary strings", () => {
        const data = [{ config: { setting1: "value1", setting2: "value2" } }];

        safeDisplayTable(data);

        expect(mockConsole.table).toHaveBeenCalledWith([{ config: "[Object]" }]);
      });

      it("should truncate long array summaries", () => {
        const longArray = Array.from({ length: 1_000_000 }, (_, index) => index);
        const data = [{ bigArray: longArray }];

        safeDisplayTable(data);

        const summary = `[Array: ${longArray.length} items]`;
        // Summary is only 22 characters, which is less than MAX_CELL_LENGTH (256), so no truncation
        expect(mockConsole.table).toHaveBeenCalledWith([{ bigArray: summary }]);
      });

      it("should handle nested objects safely", () => {
        const data = [
          {
            user: { name: "Alice", settings: { theme: "dark", language: "en" } },
            metadata: [{ type: "admin" }, { type: "user" }],
          },
        ];

        safeDisplayTable(data);

        expect(mockConsole.table).toHaveBeenCalledWith([
          {
            user: "[Object]",
            metadata: "[Array: 2 items]",
          },
        ]);
      });
    });

    describe("non-object input handling", () => {
      it("should handle primitive values in array", () => {
        const data = ["string", 42, true, null, undefined];

        safeDisplayTable(data);

        expect(mockConsole.table).toHaveBeenCalledWith([
          { value: "string" },
          { value: "42" },
          { value: "true" },
          { value: "null" },
          { value: "undefined" },
        ]);
      });

      it("should handle mixed primitive and object data", () => {
        const data = ["text", { name: "Alice" }, 42];

        safeDisplayTable(data);

        expect(mockConsole.table).toHaveBeenCalledWith([
          { value: "text" },
          { name: "Alice" },
          { value: "42" },
        ]);
      });
    });

    describe("error handling", () => {
      it("should handle console.table errors gracefully", () => {
        mockConsole.table.mockImplementation(() => {
          throw new Error("Console table failed");
        });

        const data = [{ test: "value" }];
        safeDisplayTable(data);

        expect(mockConsole.warn).toHaveBeenCalledWith(
          "⚠ Table display unavailable. Use --output json for raw data.",
        );
        expect(mockConsole.error).toHaveBeenCalledWith("Data summary: 1 items available");
      });

      it("should handle property enumeration errors", () => {
        const problematicObject = Object.create(null);
        Object.defineProperty(problematicObject, "badProperty", {
          get() {
            throw new Error("Property access failed");
          },
          enumerable: true,
        });

        const data = [problematicObject];
        safeDisplayTable(data);

        // Should not throw and should fall back to error display
        expect(mockConsole.warn).toHaveBeenCalledWith(
          "⚠ Table display unavailable. Use --output json for raw data.",
        );
      });

      it("should handle circular reference objects", () => {
        const circular: any = { name: "test" };
        circular.self = circular;

        const data = [circular];
        safeDisplayTable(data);

        expect(mockConsole.table).toHaveBeenCalledWith([
          {
            name: "test",
            self: "[Object]",
          },
        ]);
      });
    });

    describe("edge cases", () => {
      it("should handle empty string properties", () => {
        const data = [{ empty: "", space: " ", tab: "\t", newline: "\n" }];

        safeDisplayTable(data);

        expect(mockConsole.table).toHaveBeenCalledWith([
          { empty: "", space: " ", tab: "\t", newline: "\n" },
        ]);
      });

      it("should handle special characters in property names", () => {
        const data = [{ "special-key": "value", "key with spaces": "value2", "🚀": "emoji" }];

        safeDisplayTable(data);

        expect(mockConsole.table).toHaveBeenCalledWith([
          { "special-key": "value", "key with spaces": "value2", "🚀": "emoji" },
        ]);
      });

      it("should handle very large numbers", () => {
        const data = [
          {
            small: Number.MIN_SAFE_INTEGER,
            large: Number.MAX_SAFE_INTEGER,
            infinity: Infinity,
            negInfinity: -Infinity,
            nan: Number.NaN,
          },
        ];

        safeDisplayTable(data);

        expect(mockConsole.table).toHaveBeenCalledWith([
          {
            small: Number.MIN_SAFE_INTEGER,
            large: Number.MAX_SAFE_INTEGER,
            infinity: Infinity,
            negInfinity: -Infinity,
            nan: Number.NaN,
          },
        ]);
      });

      it("should handle symbols as object properties", () => {
        const sym = Symbol("test");
        const data = [{ [sym]: "symbol value", regular: "regular value" }];

        safeDisplayTable(data);

        // Only enumerable string properties should be included
        expect(mockConsole.table).toHaveBeenCalledWith([{ regular: "regular value" }]);
      });
    });
  });

  describe("safeDisplaySummary", () => {
    describe("input validation", () => {
      it("should handle non-array input", () => {
        safeDisplaySummary("not an array" as unknown as unknown[]);

        expect(mockConsole.log).toHaveBeenCalledWith("Invalid data provided for items summary.");
      });

      it("should handle null input", () => {
        safeDisplaySummary(null as unknown as unknown[]);

        expect(mockConsole.log).toHaveBeenCalledWith("Invalid data provided for items summary.");
      });

      it("should handle undefined input", () => {
        safeDisplaySummary(undefined as unknown as unknown[]);

        expect(mockConsole.log).toHaveBeenCalledWith("Invalid data provided for items summary.");
      });
    });

    describe("normal data display", () => {
      it("should display summary for small dataset", () => {
        const data = [1, 2, 3];

        safeDisplaySummary(data);

        expect(mockConsole.log).toHaveBeenCalledWith("📊 Found 3 items.");
        expect(mockConsole.log).not.toHaveBeenCalledWith(
          expect.stringContaining("Use --output json"),
        );
      });

      it("should display summary with custom item type", () => {
        const data = [1, 2, 3];

        safeDisplaySummary(data, "profiles");

        expect(mockConsole.log).toHaveBeenCalledWith("📊 Found 3 profiles.");
      });

      it("should handle empty array", () => {
        safeDisplaySummary([]);

        expect(mockConsole.log).toHaveBeenCalledWith("📊 Found 0 items.");
      });

      it("should handle single item", () => {
        safeDisplaySummary([1]);

        expect(mockConsole.log).toHaveBeenCalledWith("📊 Found 1 items.");
      });
    });

    describe("large dataset handling", () => {
      it("should show guidance for datasets exceeding MAX_TABLE_ROWS", () => {
        const data = Array.from({ length: 1500 }, (_, index) => index);

        safeDisplaySummary(data, "records");

        expect(mockConsole.log).toHaveBeenCalledWith("📊 Found 1,500 records.");
        expect(mockConsole.log).toHaveBeenCalledWith("💡 Use --output json to view all records.");
        expect(mockConsole.log).toHaveBeenCalledWith(
          "   Table view shows first 1,000 records only.",
        );
      });

      it("should handle exactly MAX_TABLE_ROWS items", () => {
        const data = Array.from({ length: 1000 }, (_, index) => index);

        safeDisplaySummary(data);

        expect(mockConsole.log).toHaveBeenCalledWith("📊 Found 1,000 items.");
        expect(mockConsole.log).not.toHaveBeenCalledWith(
          expect.stringContaining("Use --output json"),
        );
      });

      it("should show guidance for one item over MAX_TABLE_ROWS", () => {
        const data = Array.from({ length: 1001 }, (_, index) => index);

        safeDisplaySummary(data, "users");

        expect(mockConsole.log).toHaveBeenCalledWith("📊 Found 1,001 users.");
        expect(mockConsole.log).toHaveBeenCalledWith("💡 Use --output json to view all users.");
        expect(mockConsole.log).toHaveBeenCalledWith("   Table view shows first 1,000 users only.");
      });
    });

    describe("number formatting", () => {
      it("should format large numbers with locale separators", () => {
        const data = Array.from({ length: 1_234_567 }, (_, index) => index);

        safeDisplaySummary(data);

        expect(mockConsole.log).toHaveBeenCalledWith("📊 Found 1,234,567 items.");
      });

      it("should format small numbers without separators", () => {
        const data = Array.from({ length: 123 }, (_, index) => index);

        safeDisplaySummary(data);

        expect(mockConsole.log).toHaveBeenCalledWith("📊 Found 123 items.");
      });
    });

    describe("default item type", () => {
      it("should use 'items' as default when no itemType provided", () => {
        const data = [1, 2, 3, 4, 5];

        safeDisplaySummary(data);

        expect(mockConsole.log).toHaveBeenCalledWith("📊 Found 5 items.");
      });

      it("should use empty string itemType", () => {
        const data = [1, 2, 3];

        safeDisplaySummary(data, "");

        expect(mockConsole.log).toHaveBeenCalledWith("📊 Found 3 .");
      });

      it("should handle special characters in itemType", () => {
        const data = [1, 2, 3];

        safeDisplaySummary(data, "AWS profiles");

        expect(mockConsole.log).toHaveBeenCalledWith("📊 Found 3 AWS profiles.");
      });
    });
  });
});
