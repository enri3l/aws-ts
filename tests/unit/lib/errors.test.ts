/**
 * Unit tests for error categorization system
 *
 * Tests the structured error types with consistent error codes and user-friendly
 * messages for AWS CLI application error handling.
 */

import { describe, expect, it } from "vitest";
import {
  BaseError,
  ConfigurationError,
  formatError,
  isBaseError,
  ServiceError,
  ValidationError,
} from "../../../src/lib/errors.js";

describe("Error System", () => {
  describe("BaseError", () => {
    it("should create base error with required properties", () => {
      const error = new (class TestError extends BaseError {
        constructor() {
          super("Test message", "TEST_CODE");
        }
      })();

      expect(error.message).toBe("Test message");
      expect(error.code).toBe("TEST_CODE");
      expect(error.metadata).toEqual({});
      expect(error.name).toBe("TestError");
    });

    it("should create base error with metadata", () => {
      const metadata = { key: "value", number: 42 };
      const error = new (class TestError extends BaseError {
        constructor() {
          super("Test message", "TEST_CODE", metadata);
        }
      })();

      expect(error.metadata).toEqual(metadata);
    });

    it("should maintain proper prototype chain", () => {
      const error = new (class TestError extends BaseError {
        constructor() {
          super("Test message", "TEST_CODE");
        }
      })();

      expect(error instanceof BaseError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it("should set correct error name from constructor", () => {
      class CustomTestError extends BaseError {
        constructor() {
          super("Test message", "TEST_CODE");
        }
      }

      const error = new CustomTestError();
      expect(error.name).toBe("CustomTestError");
    });
  });

  describe("ValidationError", () => {
    it("should create validation error with minimal parameters", () => {
      const error = new ValidationError("Invalid input");

      expect(error.message).toBe("Invalid input");
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.metadata.field).toBeUndefined();
      expect(error.metadata.value).toBeUndefined();
    });

    it("should create validation error with field and value", () => {
      const error = new ValidationError("Email is required", "email", "");

      expect(error.message).toBe("Email is required");
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.metadata.field).toBe("email");
      expect(error.metadata.value).toBe("");
    });

    it("should create validation error with additional metadata", () => {
      const additionalMetadata = { format: "email", pattern: String.raw`\w+@\w+` };
      const error = new ValidationError(
        "Invalid email format",
        "email",
        "invalid-email",
        additionalMetadata,
      );

      expect(error.metadata.field).toBe("email");
      expect(error.metadata.value).toBe("invalid-email");
      expect(error.metadata.format).toBe("email");
      expect(error.metadata.pattern).toEqual(String.raw`\w+@\w+`);
    });

    it("should extend BaseError correctly", () => {
      const error = new ValidationError("Test validation error");

      expect(error instanceof ValidationError).toBe(true);
      expect(error instanceof BaseError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });

    it("should handle complex value types", () => {
      const complexValue = { nested: { data: [1, 2, 3] } };
      const error = new ValidationError("Invalid object", "config", complexValue);

      expect(error.metadata.value).toEqual(complexValue);
    });
  });

  describe("ServiceError", () => {
    it("should create service error with minimal parameters", () => {
      const error = new ServiceError("Service unavailable");

      expect(error.message).toBe("Service unavailable");
      expect(error.code).toBe("SERVICE_ERROR");
      expect(error.metadata.service).toBeUndefined();
      expect(error.metadata.operation).toBeUndefined();
      expect(error.metadata.awsError).toBeUndefined();
    });

    it("should create service error with service and operation", () => {
      const error = new ServiceError("DynamoDB operation failed", "dynamodb", "putItem");

      expect(error.message).toBe("DynamoDB operation failed");
      expect(error.metadata.service).toBe("dynamodb");
      expect(error.metadata.operation).toBe("putItem");
    });

    it("should create service error with AWS error details", () => {
      const awsError = {
        name: "ValidationException",
        message: "The provided key element does not match the schema",
        statusCode: 400,
      };

      const error = new ServiceError("DynamoDB validation error", "dynamodb", "putItem", awsError);

      expect(error.metadata.awsError).toEqual(awsError);
    });

    it("should create service error with additional metadata", () => {
      const metadata = { region: "us-east-1", retryCount: 3 };
      const error = new ServiceError("Service timeout", "s3", "getObject", undefined, metadata);

      expect(error.metadata.region).toBe("us-east-1");
      expect(error.metadata.retryCount).toBe(3);
    });

    it("should extend BaseError correctly", () => {
      const error = new ServiceError("Test service error");

      expect(error instanceof ServiceError).toBe(true);
      expect(error instanceof BaseError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("ConfigurationError", () => {
    it("should create configuration error with minimal parameters", () => {
      const error = new ConfigurationError("Invalid configuration");

      expect(error.message).toBe("Invalid configuration");
      expect(error.code).toBe("CONFIGURATION_ERROR");
      expect(error.metadata.configKey).toBeUndefined();
      expect(error.metadata.expectedValue).toBeUndefined();
      expect(error.metadata.actualValue).toBeUndefined();
    });

    it("should create configuration error with config key", () => {
      const error = new ConfigurationError("Region not configured", "region");

      expect(error.message).toBe("Region not configured");
      expect(error.metadata.configKey).toBe("region");
    });

    it("should create configuration error with expected and actual values", () => {
      const error = new ConfigurationError(
        "Invalid region format",
        "region",
        "us-east-1",
        "invalid-region",
      );

      expect(error.metadata.configKey).toBe("region");
      expect(error.metadata.expectedValue).toBe("us-east-1");
      expect(error.metadata.actualValue).toBe("invalid-region");
    });

    it("should create configuration error with additional metadata", () => {
      const metadata = { configFile: "~/.aws/config", lineNumber: 5 };
      const error = new ConfigurationError(
        "Syntax error in config",
        "profile.default",
        undefined,
        undefined,
        metadata,
      );

      expect(error.metadata.configFile).toBe("~/.aws/config");
      expect(error.metadata.lineNumber).toBe(5);
    });

    it("should extend BaseError correctly", () => {
      const error = new ConfigurationError("Test configuration error");

      expect(error instanceof ConfigurationError).toBe(true);
      expect(error instanceof BaseError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("isBaseError", () => {
    it("should return true for BaseError instances", () => {
      const error = new ValidationError("Test error");
      expect(isBaseError(error)).toBe(true);
    });

    it("should return true for all custom error types", () => {
      const validationError = new ValidationError("Validation failed");
      const serviceError = new ServiceError("Service failed");
      const configError = new ConfigurationError("Config failed");

      expect(isBaseError(validationError)).toBe(true);
      expect(isBaseError(serviceError)).toBe(true);
      expect(isBaseError(configError)).toBe(true);
    });

    it("should return false for standard Error instances", () => {
      const error = new Error("Standard error");
      expect(isBaseError(error)).toBe(false);
    });

    it("should return false for non-error objects", () => {
      expect(isBaseError("string")).toBe(false);
      expect(isBaseError(123)).toBe(false);
      expect(isBaseError({})).toBe(false);
      expect(isBaseError()).toBe(false);
    });

    it("should return false for objects that look like errors", () => {
      const fakeError = {
        message: "Fake error",
        code: "FAKE_ERROR",
        metadata: {},
      };

      expect(isBaseError(fakeError)).toBe(false);
    });
  });

  describe("formatError", () => {
    it("should format BaseError with code and message", () => {
      const error = new ValidationError("Input validation failed");
      const formatted = formatError(error);

      expect(formatted).toBe("VALIDATION_ERROR: Input validation failed");
    });

    it("should format BaseError without metadata by default", () => {
      const error = new ValidationError("Input failed", "email", "invalid@");
      const formatted = formatError(error);

      expect(formatted).toBe("VALIDATION_ERROR: Input failed");
      expect(formatted).not.toContain("email");
      expect(formatted).not.toContain("Details");
    });

    it("should format BaseError with metadata when requested", () => {
      const error = new ValidationError("Input failed", "email", "invalid@");
      const formatted = formatError(error, true);

      expect(formatted).toContain("VALIDATION_ERROR: Input failed");
      expect(formatted).toContain("Details:");
      expect(formatted).toContain("email");
      expect(formatted).toContain("invalid@");
    });

    it("should format BaseError with empty metadata gracefully", () => {
      const error = new (class TestError extends BaseError {
        constructor() {
          super("Test error", "TEST_CODE", {});
        }
      })();

      const formatted = formatError(error, true);
      expect(formatted).toBe("TEST_CODE: Test error");
    });

    it("should format BaseError with complex metadata", () => {
      const metadata = {
        field: "config.region",
        value: undefined,
        expectedFormat: /^[a-z0-9-]+$/,
        suggestions: ["us-east-1", "eu-west-1"],
      };

      const error = new ValidationError("Invalid region", undefined, undefined, metadata);
      const formatted = formatError(error, true);

      expect(formatted).toContain("VALIDATION_ERROR: Invalid region");
      expect(formatted).toContain("Details:");
      expect(formatted).toContain("config.region");
      expect(formatted).toContain("suggestions");
    });

    it("should format standard Error instances", () => {
      const error = new Error("Standard error message");
      const formatted = formatError(error);

      expect(formatted).toBe("Standard error message");
    });

    it("should format standard Error instances ignoring metadata flag", () => {
      const error = new Error("Standard error message");
      const formatted = formatError(error, true);

      expect(formatted).toBe("Standard error message");
    });

    it("should format non-Error values as strings", () => {
      expect(formatError("string error")).toBe("string error");
      expect(formatError(123)).toBe("123");
      expect(formatError(true)).toBe("true");
    });

    it("should format null and undefined", () => {
      expect(formatError()).toBe("undefined");
    });

    it("should format objects as strings", () => {
      const object = { message: "Error object" };
      const formatted = formatError(object);

      expect(formatted).toBe("[object Object]");
    });

    it("should handle circular references in metadata", () => {
      const circular: any = { name: "test" };
      circular.self = circular;

      const error = new ValidationError("Circular test", "field", "value", { circular });

      // Should throw when formatting circular references
      expect(() => formatError(error, true)).toThrow();
    });
  });

  describe("Error Inheritance and instanceof", () => {
    it("should work correctly with instanceof checks", () => {
      const validationError = new ValidationError("Test");
      const serviceError = new ServiceError("Test");
      const configError = new ConfigurationError("Test");

      // Specific type checks
      expect(validationError instanceof ValidationError).toBe(true);
      expect(serviceError instanceof ServiceError).toBe(true);
      expect(configError instanceof ConfigurationError).toBe(true);

      // Base type checks
      expect(validationError instanceof BaseError).toBe(true);
      expect(serviceError instanceof BaseError).toBe(true);
      expect(configError instanceof BaseError).toBe(true);

      // Native Error checks
      expect(validationError instanceof Error).toBe(true);
      expect(serviceError instanceof Error).toBe(true);
      expect(configError instanceof Error).toBe(true);

      // Cross-type checks should be false
      expect(validationError instanceof ServiceError).toBe(false);
      expect(serviceError instanceof ConfigurationError).toBe(false);
      expect(configError instanceof ValidationError).toBe(false);
    });

    it("should maintain error properties through inheritance", () => {
      const error = new ValidationError("Test validation", "field", "value");

      expect(error.message).toBe("Test validation");
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.name).toBe("ValidationError");
      expect(error.stack).toBeDefined();
    });
  });

  describe("Error Integration Scenarios", () => {
    it("should work with try-catch blocks", () => {
      let caughtError: unknown;

      try {
        throw new ServiceError("AWS service failed", "dynamodb", "scan");
      } catch (error) {
        caughtError = error;
      }

      expect(isBaseError(caughtError)).toBe(true);
      if (isBaseError(caughtError)) {
        expect(caughtError.code).toBe("SERVICE_ERROR");
        expect(caughtError.metadata.service).toBe("dynamodb");
      }
    });

    it("should work with Promise rejections", async () => {
      const promise = Promise.reject(new ValidationError("Async validation failed"));

      await expect(promise).rejects.toThrow(ValidationError);
      await expect(promise).rejects.toThrow("Async validation failed");
    });

    it("should work with error propagation", () => {
      function wrapError() {
        try {
          throwErrorHelper();
        } catch (error) {
          if (isBaseError(error)) {
            throw new ServiceError(
              `Service unavailable due to configuration: ${error.message}`,
              "dynamodb",
              "initialize",
              error,
            );
          }
          throw error;
        }
      }

      expect(() => wrapError()).toThrow(ServiceError);
      expect(() => wrapError()).toThrow("Service unavailable due to configuration");
    });
  });
});

// Helper function moved to outer scope to satisfy linting rules
function throwErrorHelper(): never {
  throw new ConfigurationError("Config not found", "aws.region");
}
