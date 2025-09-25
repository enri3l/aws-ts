/**
 * Unit tests for main CLI entry point
 *
 * Tests the main entry point module including Oclif initialization,
 * error handling, and proper CLI execution flow.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @oclif/core dependencies before importing the main module
const mockExecute = vi.fn();
const mockHandle = vi.fn();

vi.mock("@oclif/core", () => ({
  execute: mockExecute,
}));

vi.mock("@oclif/core/handle", () => ({
  handle: mockHandle,
}));

describe("CLI Entry Point", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe("successful execution", () => {
    it("should call execute with correct parameters", async () => {
      mockExecute.mockResolvedValue();

      // Import and execute the main module
      await import("../../src/index.js");

      expect(mockExecute).toHaveBeenCalledWith({
        dir: expect.stringContaining("index.ts"),
      });
      expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    it("should not call handle when execution succeeds", async () => {
      mockExecute.mockResolvedValue();

      // Import and execute the main module
      await import("../../src/index.js");

      expect(mockHandle).not.toHaveBeenCalled();
    });

    it("should pass import.meta.url to execute", async () => {
      mockExecute.mockResolvedValue();

      // Import and execute the main module
      await import("../../src/index.js");

      const callArguments = mockExecute.mock.calls[0][0];
      expect(callArguments.dir).toBeDefined();
      expect(typeof callArguments.dir).toBe("string");
      expect(callArguments.dir.length).toBeGreaterThan(0);
    });
  });

  describe("error handling", () => {
    it("should handle errors from execute function", async () => {
      const testError = new Error("Test execution error");
      mockExecute.mockRejectedValue(testError);

      try {
        await import("../../src/index.js");
      } catch {
        // Expected to catch the error
      }

      // Allow the catch block to execute
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockHandle).toHaveBeenCalledWith(testError);
    });

    it("should handle non-Error objects from execute function", async () => {
      const testError = "String error";
      mockExecute.mockRejectedValue(testError);

      try {
        await import("../../src/index.js");
      } catch {
        // Expected to catch the error
      }

      // Allow the catch block to execute
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockHandle).toHaveBeenCalledWith(testError);
    });

    it("should handle undefined error from execute function", async () => {
      mockExecute.mockRejectedValue();

      try {
        await import("../../src/index.js");
      } catch {
        // Expected to catch the error
      }

      // Allow the catch block to execute
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockHandle).toHaveBeenCalledWith(undefined);
    });

    it("should handle null error from execute function", async () => {
      mockExecute.mockRejectedValue(null);

      try {
        await import("../../src/index.js");
      } catch {
        // Expected to catch the error
      }

      // Allow the catch block to execute
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockHandle).toHaveBeenCalledWith(null);
    });
  });

  describe("run function invocation", () => {
    it("should execute the run function immediately on module import", async () => {
      mockExecute.mockResolvedValue();

      await import("../../src/index.js");

      expect(mockExecute).toHaveBeenCalledTimes(1);
    });

    it("should call execute with proper dir parameter", async () => {
      mockExecute.mockResolvedValue();

      await import("../../src/index.js");

      expect(mockExecute).toHaveBeenCalledWith(
        expect.objectContaining({
          dir: expect.any(String),
        }),
      );
    });

    it("should handle complex error objects", async () => {
      const complexError = {
        name: "ComplexError",
        message: "Complex error message",
        code: "COMPLEX_ERROR",
        details: {
          operation: "test",
          context: "unit-test",
        },
      };

      mockExecute.mockRejectedValue(complexError);

      try {
        await import("../../src/index.js");
      } catch {
        // Expected to catch the error
      }

      // Allow the catch block to execute
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockHandle).toHaveBeenCalledWith(complexError);
    });
  });

  describe("module structure validation", () => {
    it("should contain the expected top-level await structure", async () => {
      mockExecute.mockResolvedValue();

      // Read the source file to verify structure
      const fs = await import("node:fs/promises");
      const source = await fs.readFile("src/index.ts", "utf8");

      // Verify key structural elements exist
      expect(source).toContain("await execute(");
      expect(source).toContain("import.meta.url");
      expect(source).toContain("try {");
      expect(source).toContain("catch (error: unknown)");
      expect(source).toContain("await handle(error as Error)");
    });

    it("should handle module import and execution in single operation", async () => {
      mockExecute.mockResolvedValue();

      // The import itself triggers execution due to top-level await
      const moduleImport = import("../../src/index.js");

      // This should complete successfully
      await expect(moduleImport).resolves.not.toThrow();

      expect(mockExecute).toHaveBeenCalled();
    });
  });
});
