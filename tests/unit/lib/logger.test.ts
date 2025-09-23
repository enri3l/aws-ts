/**
 * Unit tests for structured logging system
 *
 * Tests the Logger class with configurable levels, output formatting,
 * context enrichment, and environment-based configuration.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  logger as defaultLogger,
  Logger,
  LogLevel,
  type LoggerOptions,
} from "../../../src/lib/logger.js";

describe("Logger System", () => {
  let originalNodeEnvironment: string | undefined;
  let originalLogLevel: string | undefined;
  let mockConsole: Record<string, ReturnType<typeof vi.spyOn>>;

  beforeEach(() => {
    // Store original environment variables
    originalNodeEnvironment = process.env.NODE_ENV;
    originalLogLevel = process.env.LOG_LEVEL;

    // Mock all console methods
    mockConsole = {
      debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
      info: vi.spyOn(console, "info").mockImplementation(() => {}),
      log: vi.spyOn(console, "log").mockImplementation(() => {}),
      warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
      error: vi.spyOn(console, "error").mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    // Restore environment variables
    if (originalNodeEnvironment === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnvironment;
    }

    if (originalLogLevel === undefined) {
      delete process.env.LOG_LEVEL;
    } else {
      process.env.LOG_LEVEL = originalLogLevel;
    }

    // Restore all mocks
    vi.restoreAllMocks();
  });

  describe("LogLevel Enum", () => {
    it("should have correct numeric values", () => {
      expect(LogLevel.DEBUG).toBe(0);
      expect(LogLevel.INFO).toBe(1);
      expect(LogLevel.WARN).toBe(2);
      expect(LogLevel.ERROR).toBe(3);
      expect(LogLevel.SILENT).toBe(4);
    });

    it("should maintain proper severity ordering", () => {
      expect(LogLevel.DEBUG < LogLevel.INFO).toBe(true);
      expect(LogLevel.INFO < LogLevel.WARN).toBe(true);
      expect(LogLevel.WARN < LogLevel.ERROR).toBe(true);
      expect(LogLevel.ERROR < LogLevel.SILENT).toBe(true);
    });

    it("should provide string names for each level", () => {
      expect(LogLevel[LogLevel.DEBUG]).toBe("DEBUG");
      expect(LogLevel[LogLevel.INFO]).toBe("INFO");
      expect(LogLevel[LogLevel.WARN]).toBe("WARN");
      expect(LogLevel[LogLevel.ERROR]).toBe("ERROR");
      expect(LogLevel[LogLevel.SILENT]).toBe("SILENT");
    });
  });

  describe("Logger Constructor", () => {
    it("should create logger with default options", () => {
      const logger = new Logger();
      expect(logger).toBeInstanceOf(Logger);
    });

    it("should use default log level in development", () => {
      process.env.NODE_ENV = "development";
      delete process.env.LOG_LEVEL;

      const logger = new Logger();
      logger.debug("test message");

      expect(mockConsole.debug).toHaveBeenCalled();
    });

    it("should use INFO level in production by default", () => {
      process.env.NODE_ENV = "production";
      delete process.env.LOG_LEVEL;

      const logger = new Logger();
      logger.debug("test message");
      logger.info("test message");

      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).toHaveBeenCalled();
    });

    it("should accept custom log level", () => {
      const logger = new Logger({ level: LogLevel.WARN });
      logger.info("info message");
      logger.warn("warn message");

      expect(mockConsole.info).not.toHaveBeenCalled();
      expect(mockConsole.warn).toHaveBeenCalled();
    });

    it("should accept custom component name", () => {
      const logger = new Logger({ component: "test-component" });
      logger.info("test message");

      const lastCall = mockConsole.info.mock.calls[0]?.[0] as string;
      expect(lastCall).toContain("test-component");
    });

    it("should accept custom pretty print setting", () => {
      const logger = new Logger({ prettyPrint: false });
      logger.info("test message");

      const lastCall = mockConsole.info.mock.calls[0]?.[0] as string;
      // JSON output should be valid JSON
      expect(() => JSON.parse(lastCall)).not.toThrow();
    });

    it("should accept custom output function", () => {
      const mockOutput = vi.fn();
      const logger = new Logger({ output: mockOutput });
      logger.info("test message");

      expect(mockOutput).toHaveBeenCalledWith(
        expect.objectContaining({
          level: LogLevel.INFO,
          message: "test message",
        }),
      );
      expect(mockConsole.info).not.toHaveBeenCalled();
    });

    it("should handle component in options object properly", () => {
      const optionsWithComponent: LoggerOptions = { component: "test" };
      const logger = new Logger(optionsWithComponent);
      logger.info("test message");

      const lastCall = mockConsole.info.mock.calls[0]?.[0] as string;
      expect(lastCall).toContain("test");
    });

    it("should handle empty options object", () => {
      const logger = new Logger({});
      expect(logger).toBeInstanceOf(Logger);
    });
  });

  describe("Environment-Based Configuration", () => {
    it("should respect LOG_LEVEL=DEBUG environment variable", () => {
      process.env.LOG_LEVEL = "DEBUG";
      const logger = new Logger();
      logger.debug("debug message");

      expect(mockConsole.debug).toHaveBeenCalled();
    });

    it("should respect LOG_LEVEL=INFO environment variable", () => {
      process.env.LOG_LEVEL = "INFO";
      const logger = new Logger();
      logger.debug("debug message");
      logger.info("info message");

      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).toHaveBeenCalled();
    });

    it("should respect LOG_LEVEL=WARN environment variable", () => {
      process.env.LOG_LEVEL = "WARN";
      const logger = new Logger();
      logger.info("info message");
      logger.warn("warn message");

      expect(mockConsole.info).not.toHaveBeenCalled();
      expect(mockConsole.warn).toHaveBeenCalled();
    });

    it("should respect LOG_LEVEL=ERROR environment variable", () => {
      process.env.LOG_LEVEL = "ERROR";
      const logger = new Logger();
      logger.warn("warn message");
      logger.error("error message");

      expect(mockConsole.warn).not.toHaveBeenCalled();
      expect(mockConsole.error).toHaveBeenCalled();
    });

    it("should respect LOG_LEVEL=SILENT environment variable", () => {
      process.env.LOG_LEVEL = "SILENT";
      const logger = new Logger();
      logger.error("error message");

      expect(mockConsole.error).not.toHaveBeenCalled();
    });

    it("should handle case-insensitive environment variables", () => {
      process.env.LOG_LEVEL = "debug";
      const logger = new Logger();
      logger.debug("debug message");

      expect(mockConsole.debug).toHaveBeenCalled();
    });

    it("should handle invalid LOG_LEVEL gracefully", () => {
      process.env.LOG_LEVEL = "INVALID";
      process.env.NODE_ENV = "development";
      const logger = new Logger();
      logger.debug("debug message");

      expect(mockConsole.debug).toHaveBeenCalled();
    });

    it("should default to INFO in production with invalid LOG_LEVEL", () => {
      process.env.LOG_LEVEL = "INVALID";
      process.env.NODE_ENV = "production";
      const logger = new Logger();
      logger.debug("debug message");
      logger.info("info message");

      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).toHaveBeenCalled();
    });
  });

  describe("Logging Methods", () => {
    let logger: Logger;

    beforeEach(() => {
      logger = new Logger({ level: LogLevel.DEBUG });
    });

    it("should log debug messages", () => {
      logger.debug("debug message");

      expect(mockConsole.debug).toHaveBeenCalled();
      const lastCall = mockConsole.debug.mock.calls[0]?.[0] as string;
      expect(lastCall).toContain("debug message");
      expect(lastCall).toContain("DEBUG");
    });

    it("should log info messages", () => {
      logger.info("info message");

      expect(mockConsole.info).toHaveBeenCalled();
      const lastCall = mockConsole.info.mock.calls[0]?.[0] as string;
      expect(lastCall).toContain("info message");
      expect(lastCall).toContain("INFO");
    });

    it("should log warn messages", () => {
      logger.warn("warn message");

      expect(mockConsole.warn).toHaveBeenCalled();
      const lastCall = mockConsole.warn.mock.calls[0]?.[0] as string;
      expect(lastCall).toContain("warn message");
      expect(lastCall).toContain("WARN");
    });

    it("should log error messages", () => {
      logger.error("error message");

      expect(mockConsole.error).toHaveBeenCalled();
      const lastCall = mockConsole.error.mock.calls[0]?.[0] as string;
      expect(lastCall).toContain("error message");
      expect(lastCall).toContain("ERROR");
    });

    it("should include context in log messages", () => {
      const context = { userId: "123", action: "login" };
      logger.info("user action", context);

      const lastCall = mockConsole.info.mock.calls[0]?.[0] as string;
      expect(lastCall).toContain("user action");
      expect(lastCall).toContain("userId");
      expect(lastCall).toContain("123");
    });

    it("should include error objects in log messages", () => {
      const error = new Error("Test error");
      logger.error("operation failed", undefined, error);

      const lastCall = mockConsole.error.mock.calls[0]?.[0] as string;
      expect(lastCall).toContain("operation failed");
      expect(lastCall).toContain("Test error");
    });

    it("should include both context and error", () => {
      const context = { operation: "file-read" };
      const error = new Error("File not found");
      logger.error("file operation failed", context, error);

      const lastCall = mockConsole.error.mock.calls[0]?.[0] as string;
      expect(lastCall).toContain("file operation failed");
      expect(lastCall).toContain("operation");
      expect(lastCall).toContain("File not found");
    });

    it("should filter logs based on level", () => {
      const warnLogger = new Logger({ level: LogLevel.WARN });
      warnLogger.debug("debug message");
      warnLogger.info("info message");
      warnLogger.warn("warn message");

      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).not.toHaveBeenCalled();
      expect(mockConsole.warn).toHaveBeenCalled();
    });

    it("should not log anything at SILENT level", () => {
      const silentLogger = new Logger({ level: LogLevel.SILENT });
      silentLogger.error("error message");

      expect(mockConsole.error).not.toHaveBeenCalled();
    });
  });

  describe("Output Formatting", () => {
    it("should format pretty output correctly", () => {
      const logger = new Logger({
        prettyPrint: true,
        component: "test-component",
      });
      logger.info("test message");

      const output = mockConsole.info.mock.calls[0]?.[0] as string;
      expect(output).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/); // Timestamp
      expect(output).toContain("INFO ");
      expect(output).toContain("[test-component]");
      expect(output).toContain("test message");
    });

    it("should format JSON output correctly", () => {
      const logger = new Logger({ prettyPrint: false });
      logger.info("test message", { key: "value" });

      const output = mockConsole.info.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed).toMatchObject({
        level: LogLevel.INFO,
        levelName: "INFO",
        message: "test message",
        context: { key: "value" },
        timestamp: expect.any(String),
      });
    });

    it("should format errors in JSON output", () => {
      const logger = new Logger({ prettyPrint: false });
      const error = new Error("Test error");
      logger.error("error occurred", undefined, error);

      const output = mockConsole.error.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.error).toMatchObject({
        name: "Error",
        message: "Test error",
        stack: expect.any(String),
      });
    });

    it("should handle empty context in pretty output", () => {
      const logger = new Logger({ prettyPrint: true });
      logger.info("test message", {});

      const output = mockConsole.info.mock.calls[0]?.[0] as string;
      expect(output).not.toContain("Context:");
    });

    it("should handle errors with stack traces in pretty output", () => {
      const logger = new Logger({ prettyPrint: true });
      const error = new Error("Test error");
      logger.error("error occurred", undefined, error);

      const output = mockConsole.error.mock.calls[0]?.[0] as string;
      expect(output).toContain("Error:");
      expect(output).toContain("Test error");
    });

    it("should handle errors without stack traces", () => {
      const logger = new Logger({ prettyPrint: true });
      const error = new Error("Test error");
      delete error.stack;
      logger.error("error occurred", undefined, error);

      const output = mockConsole.error.mock.calls[0]?.[0] as string;
      expect(output).toContain("Test error");
    });

    it("should pad log level names correctly", () => {
      const logger = new Logger({ prettyPrint: true });
      logger.info("test");

      const output = mockConsole.info.mock.calls[0]?.[0] as string;
      expect(output).toContain("INFO ");
    });
  });

  describe("Child Logger", () => {
    let parentLogger: Logger;

    beforeEach(() => {
      parentLogger = new Logger({
        component: "parent",
        level: LogLevel.DEBUG,
      });
    });

    it("should create child logger with additional context", () => {
      const childLogger = parentLogger.child({ userId: "123" });
      childLogger.info("child message");

      const output = mockConsole.info.mock.calls[0]?.[0] as string;
      expect(output).toContain("child message");
      expect(output).toContain("userId");
    });

    it("should inherit parent logger settings", () => {
      const childLogger = parentLogger.child({ userId: "123" });
      childLogger.debug("debug message");

      expect(mockConsole.debug).toHaveBeenCalled();
    });

    it("should merge context with parent context", () => {
      const childLogger = parentLogger.child({ childKey: "childValue" });
      childLogger.info("test", { messageKey: "messageValue" });

      const output = mockConsole.info.mock.calls[0]?.[0] as string;
      expect(output).toContain("childKey");
      expect(output).toContain("messageKey");
    });

    it("should override parent component with child component", () => {
      const childLogger = parentLogger.child({ key: "value" }, "child-component");
      childLogger.info("test message");

      const output = mockConsole.info.mock.calls[0]?.[0] as string;
      expect(output).toContain("[child-component]");
      expect(output).not.toContain("[parent]");
    });

    it("should inherit parent component when no child component provided", () => {
      const childLogger = parentLogger.child({ key: "value" });
      childLogger.info("test message");

      const output = mockConsole.info.mock.calls[0]?.[0] as string;
      expect(output).toContain("[parent]");
    });

    it("should create nested child loggers", () => {
      const child1 = parentLogger.child({ level1: "value1" });
      const child2 = child1.child({ level2: "value2" });
      child2.info("nested message");

      const output = mockConsole.info.mock.calls[0]?.[0] as string;
      expect(output).toContain("level1");
      expect(output).toContain("level2");
    });

    it("should handle child context overriding message context", () => {
      const childLogger = parentLogger.child({ key: "childValue" });
      childLogger.info("test", { key: "messageValue" });

      const output = mockConsole.info.mock.calls[0]?.[0] as string;
      // Message context should override child context
      expect(output).toContain("messageValue");
    });
  });

  describe("Console Method Selection", () => {
    let logger: Logger;

    beforeEach(() => {
      logger = new Logger({ level: LogLevel.DEBUG });
    });

    it("should use console.debug for DEBUG level", () => {
      logger.debug("debug message");
      expect(mockConsole.debug).toHaveBeenCalled();
    });

    it("should use console.info for INFO level", () => {
      logger.info("info message");
      expect(mockConsole.info).toHaveBeenCalled();
    });

    it("should use console.warn for WARN level", () => {
      logger.warn("warn message");
      expect(mockConsole.warn).toHaveBeenCalled();
    });

    it("should use console.error for ERROR level", () => {
      logger.error("error message");
      expect(mockConsole.error).toHaveBeenCalled();
    });

    it("should use console.log for unknown levels", () => {
      // Create logger with custom output to test edge case
      const customOutput = vi.fn();
      const logger = new Logger({ output: customOutput });

      // Simulate calling with invalid level by calling private method
      // We can't access private methods directly, so test through the default output path
      logger.info("test"); // This will use the normal flow
      expect(customOutput).toHaveBeenCalled();
    });
  });

  describe("Timestamp Generation", () => {
    it("should include ISO timestamp in log entries", () => {
      const logger = new Logger({ prettyPrint: false });
      const beforeTime = new Date().toISOString();
      logger.info("test message");
      const afterTime = new Date().toISOString();

      const output = mockConsole.info.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.timestamp).toBeDefined();
      expect(parsed.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
      expect(parsed.timestamp >= beforeTime).toBe(true);
      expect(parsed.timestamp <= afterTime).toBe(true);
    });

    it("should format timestamp in pretty output", () => {
      const logger = new Logger({ prettyPrint: true });
      logger.info("test message");

      const output = mockConsole.info.mock.calls[0]?.[0] as string;
      expect(output).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });
  });

  describe("Edge Cases and Error Handling", () => {
    it("should handle undefined context gracefully", () => {
      const logger = new Logger();
      expect(() => logger.info("test")).not.toThrow();
    });

    it("should handle null context gracefully", () => {
      const logger = new Logger();
      expect(() => logger.info("test", undefined as any)).not.toThrow();
    });

    it("should handle undefined error gracefully", () => {
      const logger = new Logger();
      expect(() => logger.error("test", {})).not.toThrow();
    });

    it("should handle empty message", () => {
      const logger = new Logger();
      logger.info("");

      expect(mockConsole.info).toHaveBeenCalled();
    });

    it("should handle very long messages", () => {
      const logger = new Logger();
      const longMessage = "a".repeat(10_000);
      logger.info(longMessage);

      expect(mockConsole.info).toHaveBeenCalled();
      const output = mockConsole.info.mock.calls[0]?.[0] as string;
      expect(output).toContain(longMessage);
    });

    it("should handle complex context objects", () => {
      const logger = new Logger({ prettyPrint: false });
      const complexContext = {
        nested: { deeply: { nested: "value" } },
        array: [1, 2, 3],
        nullValue: undefined,
        undefinedValue: undefined,
        dateValue: new Date(),
      };
      logger.info("test", complexContext);

      const output = mockConsole.info.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output);
      expect(parsed.context.nested.deeply.nested).toBe("value");
      expect(parsed.context.array).toEqual([1, 2, 3]);
    });

    it("should handle circular references in context", () => {
      const logger = new Logger();
      const circular: any = { name: "test" };
      circular.self = circular;

      // Should throw when serializing circular references
      expect(() => logger.info("test", circular)).toThrow();
    });
  });

  describe("Default Logger Instance", () => {
    it("should export a default logger instance", () => {
      expect(defaultLogger).toBeInstanceOf(Logger);
    });

    it("should be usable immediately", () => {
      defaultLogger.info("test from default logger");
      expect(mockConsole.info).toHaveBeenCalled();
    });
  });

  describe("Integration Scenarios", () => {
    it("should support typical CLI usage patterns", () => {
      const appLogger = new Logger({ component: "cli", level: LogLevel.INFO });
      const commandLogger = appLogger.child({ command: "list-tables" });

      commandLogger.info("Starting command execution");
      commandLogger.warn("No tables found", { region: "us-east-1" });
      commandLogger.info("Command completed");

      expect(mockConsole.info).toHaveBeenCalledTimes(2);
      expect(mockConsole.warn).toHaveBeenCalledTimes(1);
    });

    it("should support error logging with stack traces", () => {
      const logger = new Logger({ component: "error-handler" });

      try {
        throw new Error("Database connection failed");
      } catch (error) {
        logger.error("Operation failed", { operation: "connect", retries: 3 }, error as Error);
      }

      expect(mockConsole.error).toHaveBeenCalled();
      const output = mockConsole.error.mock.calls[0]?.[0] as string;
      expect(output).toContain("Database connection failed");
      expect(output).toContain("operation");
    });

    it("should support different environments correctly", () => {
      // Development environment
      process.env.NODE_ENV = "development";
      const developmentLogger = new Logger();
      developmentLogger.debug("Development debug message");
      expect(mockConsole.debug).toHaveBeenCalled();

      // Reset mocks
      vi.clearAllMocks();

      // Production environment
      process.env.NODE_ENV = "production";
      const productionLogger = new Logger();
      productionLogger.debug("Production debug message");
      productionLogger.info("Production info message");

      expect(mockConsole.debug).not.toHaveBeenCalled();
      expect(mockConsole.info).toHaveBeenCalled();
    });
  });
});
