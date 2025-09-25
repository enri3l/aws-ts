/**
 * @file Tests for check utilities functions
 */

import { promises as fs } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fileExists, readConfigFile, withTimeout } from "../../../src/lib/check-utilities.js";

// Mock fs module
vi.mock("node:fs", () => ({
  promises: {
    access: vi.fn(),
    readFile: vi.fn(),
  },
}));

const mockFs = fs as any;

describe("check-utilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("readConfigFile", () => {
    const testFilePath = "/path/to/config.json";
    const testContent = '{"key": "value"}';

    it("should successfully read a file when it exists", async () => {
      mockFs.access.mockResolvedValue();
      mockFs.readFile.mockResolvedValue(testContent);

      const result = await readConfigFile(testFilePath);

      expect(mockFs.access).toHaveBeenCalledWith(testFilePath);
      expect(mockFs.readFile).toHaveBeenCalledWith(testFilePath, "utf8");
      expect(result).toBe(testContent);
    });

    it("should throw categorized error when file not found (ENOENT)", async () => {
      const enoentError = new Error("ENOENT: no such file or directory");
      mockFs.access.mockRejectedValue(enoentError);

      await expect(readConfigFile(testFilePath)).rejects.toThrow(
        `Configuration file not found: ${testFilePath}`,
      );
      expect(mockFs.access).toHaveBeenCalledWith(testFilePath);
      expect(mockFs.readFile).not.toHaveBeenCalled();
    });

    it("should throw categorized error when permission denied (EACCES)", async () => {
      const eaccesError = new Error("EACCES: permission denied");
      mockFs.access.mockRejectedValue(eaccesError);

      await expect(readConfigFile(testFilePath)).rejects.toThrow(
        `Permission denied accessing file: ${testFilePath}`,
      );
      expect(mockFs.access).toHaveBeenCalledWith(testFilePath);
      expect(mockFs.readFile).not.toHaveBeenCalled();
    });

    it("should throw original error for other Error instances", async () => {
      const genericError = new Error("Some other filesystem error");
      mockFs.access.mockRejectedValue(genericError);

      await expect(readConfigFile(testFilePath)).rejects.toThrow(genericError);
      expect(mockFs.access).toHaveBeenCalledWith(testFilePath);
      expect(mockFs.readFile).not.toHaveBeenCalled();
    });

    it("should throw original error for non-Error instances", async () => {
      const nonErrorThrown = "string error";
      mockFs.access.mockRejectedValue(nonErrorThrown);

      await expect(readConfigFile(testFilePath)).rejects.toThrow(nonErrorThrown);
      expect(mockFs.access).toHaveBeenCalledWith(testFilePath);
      expect(mockFs.readFile).not.toHaveBeenCalled();
    });

    it("should handle readFile errors after successful access", async () => {
      const readError = new Error("Failed to read file");
      mockFs.access.mockResolvedValue();
      mockFs.readFile.mockRejectedValue(readError);

      await expect(readConfigFile(testFilePath)).rejects.toThrow(readError);
      expect(mockFs.access).toHaveBeenCalledWith(testFilePath);
      expect(mockFs.readFile).toHaveBeenCalledWith(testFilePath, "utf8");
    });

    it("should handle ENOENT error in readFile phase", async () => {
      const enoentError = new Error("ENOENT: no such file or directory in readFile");
      mockFs.access.mockResolvedValue();
      mockFs.readFile.mockRejectedValue(enoentError);

      await expect(readConfigFile(testFilePath)).rejects.toThrow(
        `Configuration file not found: ${testFilePath}`,
      );
      expect(mockFs.access).toHaveBeenCalledWith(testFilePath);
      expect(mockFs.readFile).toHaveBeenCalledWith(testFilePath, "utf8");
    });

    it("should handle EACCES error in readFile phase", async () => {
      const eaccesError = new Error("EACCES: permission denied in readFile");
      mockFs.access.mockResolvedValue();
      mockFs.readFile.mockRejectedValue(eaccesError);

      await expect(readConfigFile(testFilePath)).rejects.toThrow(
        `Permission denied accessing file: ${testFilePath}`,
      );
      expect(mockFs.access).toHaveBeenCalledWith(testFilePath);
      expect(mockFs.readFile).toHaveBeenCalledWith(testFilePath, "utf8");
    });
  });

  describe("fileExists", () => {
    const testFilePath = "/path/to/test.txt";

    it("should return true when file exists and is accessible", async () => {
      mockFs.access.mockResolvedValue();

      const result = await fileExists(testFilePath);

      expect(result).toBe(true);
      expect(mockFs.access).toHaveBeenCalledWith(testFilePath);
    });

    it("should return false when file does not exist", async () => {
      mockFs.access.mockRejectedValue(new Error("ENOENT: file not found"));

      const result = await fileExists(testFilePath);

      expect(result).toBe(false);
      expect(mockFs.access).toHaveBeenCalledWith(testFilePath);
    });

    it("should return false when permission denied", async () => {
      mockFs.access.mockRejectedValue(new Error("EACCES: permission denied"));

      const result = await fileExists(testFilePath);

      expect(result).toBe(false);
      expect(mockFs.access).toHaveBeenCalledWith(testFilePath);
    });

    it("should return false for any fs.access error", async () => {
      mockFs.access.mockRejectedValue(new Error("Generic filesystem error"));

      const result = await fileExists(testFilePath);

      expect(result).toBe(false);
      expect(mockFs.access).toHaveBeenCalledWith(testFilePath);
    });

    it("should return false for non-Error rejections", async () => {
      mockFs.access.mockRejectedValue("string rejection");

      const result = await fileExists(testFilePath);

      expect(result).toBe(false);
      expect(mockFs.access).toHaveBeenCalledWith(testFilePath);
    });
  });

  describe("withTimeout", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should resolve when promise resolves before timeout", async () => {
      const testValue = "resolved value";
      const fastPromise = Promise.resolve(testValue);

      const resultPromise = withTimeout(fastPromise, 1000, "test operation");

      vi.advanceTimersByTime(500); // Advance time but not enough to trigger timeout

      await expect(resultPromise).resolves.toBe(testValue);
    });

    it("should reject with timeout error when promise times out", async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve("too late"), 2000);
      });

      const resultPromise = withTimeout(slowPromise, 1000, "test operation");

      vi.advanceTimersByTime(1000); // Trigger timeout

      await expect(resultPromise).rejects.toThrow("test operation timed out after 1000ms");
    });

    it("should reject with original error when promise rejects before timeout", async () => {
      const rejectionReason = new Error("Promise rejected");
      const rejectingPromise = Promise.reject(rejectionReason);

      const resultPromise = withTimeout(rejectingPromise, 1000, "test operation");

      await expect(resultPromise).rejects.toThrow(rejectionReason);
    });

    it("should use default operation name when not provided", async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve("too late"), 2000);
      });

      const resultPromise = withTimeout(slowPromise, 1000);

      vi.advanceTimersByTime(1000);

      await expect(resultPromise).rejects.toThrow("operation timed out after 1000ms");
    });

    it("should handle multiple concurrent timeouts", async () => {
      const testValue1 = "first result";
      const testValue2 = "second result";
      const fastPromise1 = Promise.resolve(testValue1);
      const fastPromise2 = Promise.resolve(testValue2);

      const result1Promise = withTimeout(fastPromise1, 1000, "first operation");
      const result2Promise = withTimeout(fastPromise2, 1000, "second operation");

      await expect(result1Promise).resolves.toBe(testValue1);
      await expect(result2Promise).resolves.toBe(testValue2);
    });

    it("should handle timeout with custom operation name", async () => {
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve("too late"), 2000);
      });

      const customOperationName = "custom database query";
      const resultPromise = withTimeout(slowPromise, 500, customOperationName);

      vi.advanceTimersByTime(500);

      await expect(resultPromise).rejects.toThrow(`${customOperationName} timed out after 500ms`);
    });

    it("should handle very large timeout values", async () => {
      const testValue = "large timeout value";
      const fastPromise = Promise.resolve(testValue);
      const largeTimeout = Number.MAX_SAFE_INTEGER;

      const resultPromise = withTimeout(fastPromise, largeTimeout, "large timeout");

      await expect(resultPromise).resolves.toBe(testValue);
    });
  });
});
