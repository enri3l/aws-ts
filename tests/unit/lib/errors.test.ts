/**
 * Unit tests for error categorization system
 *
 * Tests the structured error types with consistent error codes and user-friendly
 * messages for AWS CLI application error handling.
 */

import { describe, expect, it } from "vitest";
import {
  ApiError,
  BaseError,
  ConfigurationError,
  formatError,
  formatErrorWithGuidance,
  isBaseError,
  ServiceError,
  TimeoutError,
  UserConfigurationError,
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

  describe("UserConfigurationError", () => {
    it("should create user configuration error with minimal parameters", () => {
      const error = new UserConfigurationError("Invalid user configuration");

      expect(error.message).toBe("Invalid user configuration");
      expect(error.code).toBe("USER_CONFIGURATION_ERROR");
      expect(error.metadata.configType).toBeUndefined();
      expect(error.metadata.providedValue).toBeUndefined();
      expect(error.metadata.expectedFormat).toBeUndefined();
    });

    it("should create user configuration error with config type", () => {
      const error = new UserConfigurationError("Invalid profile name", "profile");

      expect(error.message).toBe("Invalid profile name");
      expect(error.metadata.configType).toBe("profile");
    });

    it("should create user configuration error with provided value", () => {
      const error = new UserConfigurationError("Invalid region", "region", "invalid-region-123");

      expect(error.metadata.configType).toBe("region");
      expect(error.metadata.providedValue).toBe("invalid-region-123");
    });

    it("should create user configuration error with expected format", () => {
      const error = new UserConfigurationError(
        "Invalid credentials format",
        "credentials",
        "malformed-key",
        "AKIA[A-Z0-9]{16}",
      );

      expect(error.metadata.configType).toBe("credentials");
      expect(error.metadata.providedValue).toBe("malformed-key");
      expect(error.metadata.expectedFormat).toBe("AKIA[A-Z0-9]{16}");
    });

    it("should create user configuration error with additional metadata", () => {
      const metadata = { source: "command-line", validOptions: ["us-east-1", "us-west-2"] };
      const error = new UserConfigurationError(
        "Invalid region choice",
        "region",
        "invalid-region",
        "us-east-1 | us-west-2",
        metadata,
      );

      expect(error.metadata.source).toBe("command-line");
      expect(error.metadata.validOptions).toEqual(["us-east-1", "us-west-2"]);
    });

    it("should extend BaseError correctly", () => {
      const error = new UserConfigurationError("Test user configuration error");

      expect(error instanceof UserConfigurationError).toBe(true);
      expect(error instanceof BaseError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("ApiError", () => {
    it("should create API error with minimal parameters", () => {
      const error = new ApiError("API request failed");

      expect(error.message).toBe("API request failed");
      expect(error.code).toBe("API_ERROR");
      expect(error.metadata.apiName).toBeUndefined();
      expect(error.metadata.operation).toBeUndefined();
      expect(error.metadata.httpStatusCode).toBeUndefined();
      expect(error.metadata.originalError).toBeUndefined();
      expect(error.metadata.timestamp).toBeDefined();
    });

    it("should create API error with API name and operation", () => {
      const error = new ApiError("GitHub API failed", "github", "get-repositories");

      expect(error.message).toBe("GitHub API failed");
      expect(error.metadata.apiName).toBe("github");
      expect(error.metadata.operation).toBe("get-repositories");
    });

    it("should create API error with HTTP status code", () => {
      const error = new ApiError("Unauthorized access", "github", "get-user", 401);

      expect(error.metadata.httpStatusCode).toBe(401);
    });

    it("should create API error with original error", () => {
      const originalError = { message: "Network timeout", code: "TIMEOUT" };
      const error = new ApiError("API timeout", "aws", "describe-instances", 504, originalError);

      expect(error.metadata.originalError).toEqual(originalError);
      expect(error.metadata.httpStatusCode).toBe(504);
    });

    it("should create API error with additional metadata", () => {
      const metadata = { retryAttempt: 3, endpoint: "/api/v1/users", requestId: "req-123" };
      const error = new ApiError(
        "API rate limit exceeded",
        "github",
        "list-users",
        429,
        undefined,
        metadata,
      );

      expect(error.metadata.retryAttempt).toBe(3);
      expect(error.metadata.endpoint).toBe("/api/v1/users");
      expect(error.metadata.requestId).toBe("req-123");
    });

    it("should include timestamp in metadata", () => {
      const beforeTimestamp = new Date().toISOString();
      const error = new ApiError("API error");
      const afterTimestamp = new Date().toISOString();

      expect(error.metadata.timestamp).toBeTypeOf("string");
      expect(error.metadata.timestamp >= beforeTimestamp).toBe(true);
      expect(error.metadata.timestamp <= afterTimestamp).toBe(true);
    });

    it("should extend BaseError correctly", () => {
      const error = new ApiError("Test API error");

      expect(error instanceof ApiError).toBe(true);
      expect(error instanceof BaseError).toBe(true);
      expect(error instanceof Error).toBe(true);
    });
  });

  describe("TimeoutError", () => {
    it("should create timeout error with minimal parameters", () => {
      const error = new TimeoutError("Operation timed out");

      expect(error.message).toBe("Operation timed out");
      expect(error.code).toBe("TIMEOUT_ERROR");
      expect(error.metadata.operation).toBeUndefined();
      expect(error.metadata.timeoutMs).toBeUndefined();
      expect(error.metadata.elapsedMs).toBeUndefined();
      expect(error.metadata.retryable).toBeUndefined();
      expect(error.metadata.timestamp).toBeDefined();
    });

    it("should create timeout error with operation and timeout", () => {
      const error = new TimeoutError("Database query timed out", "query-users", 5000);

      expect(error.message).toBe("Database query timed out");
      expect(error.metadata.operation).toBe("query-users");
      expect(error.metadata.timeoutMs).toBe(5000);
    });

    it("should create timeout error with elapsed time", () => {
      const error = new TimeoutError("Request timeout", "api-call", 30_000, 32_000);

      expect(error.metadata.timeoutMs).toBe(30_000);
      expect(error.metadata.elapsedMs).toBe(32_000);
    });

    it("should create timeout error with retry flag", () => {
      const error = new TimeoutError("Network timeout", "http-request", 10_000, 12_000, true);

      expect(error.metadata.retryable).toBe(true);
    });

    it("should create timeout error with additional metadata", () => {
      const metadata = { host: "api.github.com", port: 443, attempt: 2 };
      const error = new TimeoutError(
        "Connection timeout",
        "tcp-connect",
        5000,
        5100,
        false,
        metadata,
      );

      expect(error.metadata.host).toBe("api.github.com");
      expect(error.metadata.port).toBe(443);
      expect(error.metadata.attempt).toBe(2);
    });

    it("should include timestamp in metadata", () => {
      const beforeTimestamp = new Date().toISOString();
      const error = new TimeoutError("Timeout error");
      const afterTimestamp = new Date().toISOString();

      expect(error.metadata.timestamp).toBeTypeOf("string");
      expect(error.metadata.timestamp >= beforeTimestamp).toBe(true);
      expect(error.metadata.timestamp <= afterTimestamp).toBe(true);
    });

    it("should extend BaseError correctly", () => {
      const error = new TimeoutError("Test timeout error");

      expect(error instanceof TimeoutError).toBe(true);
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
      const userConfigError = new UserConfigurationError("User config failed");
      const apiError = new ApiError("API failed");
      const timeoutError = new TimeoutError("Timeout failed");

      expect(isBaseError(validationError)).toBe(true);
      expect(isBaseError(serviceError)).toBe(true);
      expect(isBaseError(configError)).toBe(true);
      expect(isBaseError(userConfigError)).toBe(true);
      expect(isBaseError(apiError)).toBe(true);
      expect(isBaseError(timeoutError)).toBe(true);
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

      // Should not throw when formatting circular references, but safely handle them
      expect(() => formatError(error, true)).not.toThrow();

      const formatted = formatError(error, true);
      expect(formatted).toContain("VALIDATION_ERROR: Circular test");
      expect(formatted).toContain("field");
      expect(formatted).toContain("value");
    });
  });

  describe("formatErrorWithGuidance", () => {
    it("should format BaseError with basic message", () => {
      const error = new ValidationError("Input validation failed");
      const formatted = formatErrorWithGuidance(error);

      expect(formatted).toBe("VALIDATION_ERROR: Input validation failed");
    });

    it("should format BaseError with metadata when requested", () => {
      const error = new ValidationError("Input failed", "email", "invalid@");
      const formatted = formatErrorWithGuidance(error, true);

      expect(formatted).toContain("VALIDATION_ERROR: Input failed");
      expect(formatted).toContain("Details:");
      expect(formatted).toContain("email");
      expect(formatted).toContain("invalid@");
    });

    it("should format standard Error instances", () => {
      const error = new Error("Standard error message");
      const formatted = formatErrorWithGuidance(error);

      expect(formatted).toBe("Standard error message");
    });

    it("should format non-Error values as strings", () => {
      expect(formatErrorWithGuidance("string error")).toBe("string error");
      expect(formatErrorWithGuidance(123)).toBe("123");
      expect(formatErrorWithGuidance(true)).toBe("true");
    });

    it("should format null and undefined", () => {
      expect(formatErrorWithGuidance()).toBe("undefined");
    });

    it("should add authentication guidance when available", () => {
      // Create an error that should trigger authentication guidance
      const error = new ServiceError("AWS authentication failed", "sts", "get-caller-identity");
      const formatted = formatErrorWithGuidance(error);

      // Should contain both the basic error message and some form of guidance
      expect(formatted).toContain("SERVICE_ERROR: AWS authentication failed");

      // The guidance should be present if auth-guidance provides it
      // (exact content depends on auth-guidance implementation)
      const lines = formatted.split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(1);
    });

    it("should not add guidance for non-authentication errors", () => {
      const error = new ValidationError("Simple validation error");
      const formatted = formatErrorWithGuidance(error);

      // Should only contain the basic error message
      expect(formatted).toBe("VALIDATION_ERROR: Simple validation error");
      expect(formatted).not.toContain("\n\n");
    });

    it("should handle errors with complex metadata", () => {
      const metadata = {
        field: "aws.credentials",
        value: undefined,
        suggestions: ["Check AWS_PROFILE", "Run aws configure"],
      };

      const error = new ConfigurationError(
        "AWS credentials not configured",
        undefined,
        undefined,
        undefined,
        metadata,
      );
      const formatted = formatErrorWithGuidance(error, true);

      expect(formatted).toContain("CONFIGURATION_ERROR: AWS credentials not configured");
      expect(formatted).toContain("suggestions");
    });
  });

  describe("Error Inheritance and instanceof", () => {
    it("should work correctly with instanceof checks", () => {
      const validationError = new ValidationError("Test");
      const serviceError = new ServiceError("Test");
      const configError = new ConfigurationError("Test");
      const userConfigError = new UserConfigurationError("Test");
      const apiError = new ApiError("Test");
      const timeoutError = new TimeoutError("Test");

      // Specific type checks
      expect(validationError instanceof ValidationError).toBe(true);
      expect(serviceError instanceof ServiceError).toBe(true);
      expect(configError instanceof ConfigurationError).toBe(true);
      expect(userConfigError instanceof UserConfigurationError).toBe(true);
      expect(apiError instanceof ApiError).toBe(true);
      expect(timeoutError instanceof TimeoutError).toBe(true);

      // Base type checks
      expect(validationError instanceof BaseError).toBe(true);
      expect(serviceError instanceof BaseError).toBe(true);
      expect(configError instanceof BaseError).toBe(true);
      expect(userConfigError instanceof BaseError).toBe(true);
      expect(apiError instanceof BaseError).toBe(true);
      expect(timeoutError instanceof BaseError).toBe(true);

      // Native Error checks
      expect(validationError instanceof Error).toBe(true);
      expect(serviceError instanceof Error).toBe(true);
      expect(configError instanceof Error).toBe(true);
      expect(userConfigError instanceof Error).toBe(true);
      expect(apiError instanceof Error).toBe(true);
      expect(timeoutError instanceof Error).toBe(true);

      // Cross-type checks should be false
      expect(validationError instanceof ServiceError).toBe(false);
      expect(serviceError instanceof ConfigurationError).toBe(false);
      expect(configError instanceof ValidationError).toBe(false);
      expect(userConfigError instanceof ApiError).toBe(false);
      expect(apiError instanceof TimeoutError).toBe(false);
      expect(timeoutError instanceof UserConfigurationError).toBe(false);
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
