/**
 * Unit tests for CQRS Handler Factory Pattern
 *
 * Tests the centralized factory for creating command and query handlers
 * with dependency injection, error handling, and configuration management.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  HandlerFactory,
  type CommandHandler,
  type HandlerFactoryOptions,
  type QueryHandler,
} from "../../../src/handlers/handler-factory.js";

describe("HandlerFactory", () => {
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  describe("Constructor and Options", () => {
    it("should create factory with default options", () => {
      // Act
      const factory = new HandlerFactory();

      // Act & Assert - Test via creating a handler to access private options
      const wrappedHandler = factory.createCommandHandler(MockCommandHandler as any, {
        testDep: "value",
      });

      expect(wrappedHandler).toBeDefined();
    });

    it("should create factory with custom options", () => {
      // Arrange
      const options: HandlerFactoryOptions = {
        enableDebugLogging: true,
        maxRetries: 5,
        timeoutMs: 60_000,
      };

      // Act
      const factory = new HandlerFactory(options);

      // Assert - Verify options are applied by testing debug logging behavior
      const handler = factory.createCommandHandler(MockCommandHandler as any, {});
      expect(handler).toBeDefined();
    });

    it("should apply default values for partial options", () => {
      // Arrange
      const partialOptions: HandlerFactoryOptions = {
        enableDebugLogging: true,
        // maxRetries and timeoutMs should use defaults
      };

      // Act
      const factory = new HandlerFactory(partialOptions);
      const handler = factory.createCommandHandler(MockCommandHandler as any, {});

      // Assert
      expect(handler).toBeDefined();
    });

    it("should handle empty options object", () => {
      // Act
      const factory = new HandlerFactory({});
      const handler = factory.createCommandHandler(MockCommandHandler as any, {});

      // Assert
      expect(handler).toBeDefined();
    });
  });

  describe("Command Handler Creation", () => {
    it("should create command handler with dependencies", () => {
      // Arrange
      const factory = new HandlerFactory();
      const dependencies = { logger: "mock-logger", client: "mock-client" };

      // Act
      const handler = factory.createCommandHandler(MockCommandHandler as any, dependencies);

      // Assert
      expect(handler).toBeDefined();
      expect(handler).toBeInstanceOf(MockCommandHandler);
    });

    it("should inject factory options into handler", () => {
      // Arrange
      const factory = new HandlerFactory({ enableDebugLogging: true });
      let injectedDependencies: Record<string, unknown> = {};

      class TestCommandHandler implements CommandHandler {
        constructor(deps: Record<string, unknown>) {
          injectedDependencies = deps;
        }

        handle(): Promise<unknown> {
          return Promise.resolve("success");
        }

        validateInput(): Promise<void> {
          return Promise.resolve();
        }
      }

      // Act
      factory.createCommandHandler(TestCommandHandler as any, { testDep: "value" });

      // Assert
      expect(injectedDependencies).toHaveProperty("testDep", "value");
      expect(injectedDependencies).toHaveProperty("factoryOptions");
      expect(injectedDependencies.factoryOptions).toMatchObject({
        enableDebugLogging: true,
        maxRetries: 3,
        timeoutMs: 30_000,
      });
    });

    it("should create command handler without dependencies", () => {
      // Arrange
      const factory = new HandlerFactory();

      // Act
      const handler = factory.createCommandHandler(MockCommandHandler as any);

      // Assert
      expect(handler).toBeDefined();
      expect(handler).toBeInstanceOf(MockCommandHandler);
    });
  });

  describe("Query Handler Creation", () => {
    it("should create query handler with dependencies", () => {
      // Arrange
      const factory = new HandlerFactory();
      const dependencies = { database: "mock-db", cache: "mock-cache" };

      // Act
      const handler = factory.createQueryHandler(MockQueryHandler as any, dependencies);

      // Assert
      expect(handler).toBeDefined();
      expect(handler).toBeInstanceOf(MockQueryHandler);
    });

    it("should inject factory options into query handler", () => {
      // Arrange
      const factory = new HandlerFactory({ maxRetries: 5, timeoutMs: 45_000 });
      let injectedDependencies: Record<string, unknown> = {};

      class TestQueryHandler implements QueryHandler {
        constructor(deps: Record<string, unknown>) {
          injectedDependencies = deps;
        }

        handle(): Promise<unknown> {
          return Promise.resolve("query-result");
        }

        validateQuery(): Promise<void> {
          return Promise.resolve();
        }
      }

      // Act
      factory.createQueryHandler(TestQueryHandler as any, { queryDep: "value" });

      // Assert
      expect(injectedDependencies).toHaveProperty("queryDep", "value");
      expect(injectedDependencies).toHaveProperty("factoryOptions");
      expect(injectedDependencies.factoryOptions).toMatchObject({
        enableDebugLogging: false,
        maxRetries: 5,
        timeoutMs: 45_000,
      });
    });

    it("should create query handler without dependencies", () => {
      // Arrange
      const factory = new HandlerFactory();

      // Act
      const handler = factory.createQueryHandler(MockQueryHandler as any);

      // Assert
      expect(handler).toBeDefined();
      expect(handler).toBeInstanceOf(MockQueryHandler);
    });
  });

  describe("Error Handling Wrapper", () => {
    it("should wrap handler with error handling", async () => {
      // Arrange
      const factory = new HandlerFactory();
      const handler = factory.createCommandHandler(MockCommandHandler as any, {});

      // Act & Assert
      const result = await handler.handle("test-input");
      expect(result).toBe("command-success");
    });

    it("should log debug information when enabled", async () => {
      // Arrange
      const factory = new HandlerFactory({ enableDebugLogging: true });
      const handler = factory.createCommandHandler(MockCommandHandler as any, {});

      // Act
      await handler.handle("test-input");

      // Assert
      expect(consoleDebugSpy).toHaveBeenCalledWith("Executing handler: MockCommandHandler", {
        input: "test-input",
      });
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        "Handler completed: MockCommandHandler",
        expect.objectContaining({
          duration: expect.any(Number),
          success: true,
        }),
      );
    });

    it("should not log debug information when disabled", async () => {
      // Arrange
      const factory = new HandlerFactory({ enableDebugLogging: false });
      const handler = factory.createCommandHandler(MockCommandHandler as any, {});

      // Act
      await handler.handle("test-input");

      // Assert
      expect(consoleDebugSpy).not.toHaveBeenCalled();
    });

    it("should handle errors and log failure when debug enabled", async () => {
      // Arrange
      const factory = new HandlerFactory({ enableDebugLogging: true });
      const handler = factory.createCommandHandler(ErrorCommandHandler as any, {});

      // Act & Assert
      await expect(handler.handle("test-input")).rejects.toThrow("Command failed");

      expect(consoleDebugSpy).toHaveBeenCalledWith("Executing handler: ErrorCommandHandler", {
        input: "test-input",
      });
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        "Handler failed: ErrorCommandHandler",
        expect.objectContaining({
          duration: expect.any(Number),
          error: "Command failed",
        }),
      );
    });

    it("should handle non-Error objects in catch block", async () => {
      // Arrange
      const factory = new HandlerFactory({ enableDebugLogging: true });
      const handler = factory.createCommandHandler(NonErrorThrowingHandler as any, {});

      // Act & Assert
      await expect(handler.handle("test-input")).rejects.toBe("String error");

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        "Handler failed: NonErrorThrowingHandler",
        expect.objectContaining({
          duration: expect.any(Number),
          error: "String error",
        }),
      );
    });

    it("should propagate original errors without modification", async () => {
      // Arrange
      const factory = new HandlerFactory();
      const handler = factory.createCommandHandler(ErrorCommandHandler as any, {});

      // Act & Assert
      await expect(handler.handle("test-input")).rejects.toThrow("Command failed");
    });
  });

  describe("Timeout Handling", () => {
    it("should timeout handler operations when they exceed configured timeout", async () => {
      // Arrange
      const factory = new HandlerFactory({ timeoutMs: 100 });
      const handler = factory.createCommandHandler(SlowCommandHandler as any, {});

      // Act & Assert
      await expect(handler.handle("test-input")).rejects.toThrow(
        "Handler operation timed out after 100ms",
      );
    }, 10_000);

    it("should complete fast operations within timeout", async () => {
      // Arrange
      const factory = new HandlerFactory({ timeoutMs: 1000 });
      const handler = factory.createCommandHandler(MockCommandHandler as any, {});

      // Act & Assert
      const result = await handler.handle("test-input");
      expect(result).toBe("command-success");
    });

    it("should use custom timeout configuration", async () => {
      // Arrange
      const factory = new HandlerFactory({ timeoutMs: 50 });
      const handler = factory.createCommandHandler(SlowCommandHandler as any, {});

      // Act & Assert
      await expect(handler.handle("test-input")).rejects.toThrow(
        "Handler operation timed out after 50ms",
      );
    }, 10_000);
  });

  describe("Integration Tests", () => {
    it("should work with both command and query handlers", async () => {
      // Arrange
      const factory = new HandlerFactory({ enableDebugLogging: true });
      const commandHandler = factory.createCommandHandler(MockCommandHandler as any, {});
      const queryHandler = factory.createQueryHandler(MockQueryHandler as any, {});

      // Act
      const commandResult = await commandHandler.handle("command-input");
      const queryResult = await queryHandler.handle("query-input");

      // Assert
      expect(commandResult).toBe("command-success");
      expect(queryResult).toBe("query-success");
    });

    it("should handle complex dependency injection scenarios", () => {
      // Arrange
      const factory = new HandlerFactory();
      const complexDependencies = {
        logger: { level: "debug" },
        database: { connection: "postgresql://..." },
        cache: { redis: "redis://..." },
        metrics: { enabled: true },
      };

      // Act
      const handler = factory.createCommandHandler(MockCommandHandler as any, complexDependencies);

      // Assert
      expect(handler).toBeDefined();
      expect(handler).toBeInstanceOf(MockCommandHandler);
    });
  });
});

// Mock Command Handler
class MockCommandHandler implements CommandHandler {
  constructor(private dependencies: Record<string, unknown>) {}

  handle(): Promise<string> {
    return Promise.resolve("command-success");
  }

  validateInput(): Promise<void> {
    return Promise.resolve();
  }
}

// Mock Query Handler
class MockQueryHandler implements QueryHandler {
  constructor(private dependencies: Record<string, unknown>) {}

  handle(): Promise<string> {
    return Promise.resolve("query-success");
  }

  validateQuery(): Promise<void> {
    return Promise.resolve();
  }
}

// Error-throwing Command Handler
class ErrorCommandHandler implements CommandHandler {
  constructor(private dependencies: Record<string, unknown>) {}

  handle(): Promise<never> {
    return Promise.reject(new Error("Command failed"));
  }

  validateInput(): Promise<void> {
    return Promise.resolve();
  }
}

// Non-Error throwing Handler
// This handler is specifically designed to test edge case behavior when non-Error objects are thrown
class NonErrorThrowingHandler implements CommandHandler {
  constructor(private dependencies: Record<string, unknown>) {}

  handle(): Promise<never> {
    // ESLint disable: This is intentionally rejecting with a string (not Error) to test
    // error handling wrapper behavior with non-Error objects. This tests that the
    // factory's error handling can gracefully handle cases where third-party code
    // or legacy systems reject promises with non-Error objects. This should NOT be done in production.
    // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
    return Promise.reject("String error");
  }

  validateInput(): Promise<void> {
    return Promise.resolve();
  }
}

// Slow Command Handler for timeout testing
class SlowCommandHandler implements CommandHandler {
  constructor(private dependencies: Record<string, unknown>) {}

  async handle(): Promise<string> {
    // Simulate slow operation
    await new Promise((resolve) => setTimeout(resolve, 200));
    return "slow-success";
  }

  validateInput(): Promise<void> {
    return Promise.resolve();
  }
}
