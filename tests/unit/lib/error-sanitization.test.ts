/**
 * Unit tests for error sanitization utilities for secure verbose output
 *
 * Tests secure error sanitization functionality to prevent sensitive data exposure
 * in verbose error output with comprehensive security validation and edge case coverage.
 */

import { describe, expect, it } from "vitest";
import {
  isSafeErrorProperty,
  sanitizeErrorForVerboseOutput,
} from "../../../src/lib/error-sanitization.js";

describe("Error Sanitization", () => {
  describe("sanitizeErrorForVerboseOutput", () => {
    describe("non-object input handling", () => {
      it("should handle string input", () => {
        const result = sanitizeErrorForVerboseOutput("Simple error string");

        expect(result).toEqual({ message: "Simple error string" });
      });

      it("should handle number input", () => {
        const result = sanitizeErrorForVerboseOutput(42);

        expect(result).toEqual({ message: "42" });
      });

      it("should handle boolean input", () => {
        const result = sanitizeErrorForVerboseOutput(true);

        expect(result).toEqual({ message: "true" });
      });

      it("should handle null input", () => {
        const result = sanitizeErrorForVerboseOutput(null);

        expect(result).toEqual({ message: "null" });
      });

      it("should handle undefined input", () => {
        const result = sanitizeErrorForVerboseOutput();

        expect(result).toEqual({ message: "undefined" });
      });

      it("should handle symbol input", () => {
        const sym = Symbol("test");
        const result = sanitizeErrorForVerboseOutput(sym);

        expect(result).toEqual({ message: "Symbol(test)" });
      });

      it("should handle BigInt input", () => {
        const result = sanitizeErrorForVerboseOutput(123n);

        expect(result).toEqual({ message: "123" });
      });
    });

    describe("basic error object handling", () => {
      it("should sanitize standard Error object", () => {
        const error = new Error("Test error message");
        error.name = "TestError";

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Test error message",
          name: "TestError",
        });
        // Stack may or may not be included depending on enumeration
        expect(typeof result.message).toBe("string");
      });

      it("should handle error without stack", () => {
        const error = { message: "Test message", name: "CustomError" };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Test message",
          name: "CustomError",
        });
      });

      it("should handle error with only message", () => {
        const error = { message: "Just a message" };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Just a message",
        });
      });

      it("should handle error without message", () => {
        const error = { name: "ErrorWithoutMessage", code: "ERR_NO_MSG" };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          name: "ErrorWithoutMessage",
          code: "ERR_NO_MSG",
        });
      });
    });

    describe("safe property inclusion", () => {
      it("should include all safe string properties", () => {
        const error = {
          message: "Error message",
          name: "ErrorName",
          code: "ERR_CODE",
          stack: "Stack trace",
          requestId: "req-123",
          syscall: "read",
          signal: "SIGTERM",
        };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Error message",
          name: "ErrorName",
          code: "ERR_CODE",
          stack: "Stack trace",
          requestId: "req-123",
          syscall: "read",
          signal: "SIGTERM",
        });
      });

      it("should include safe numeric properties", () => {
        const error = {
          message: "HTTP error",
          httpStatusCode: 404,
          statusCode: 500,
          errno: -2,
        };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "HTTP error",
          httpStatusCode: 404,
          statusCode: 500,
          errno: -2,
        });
      });

      it("should include field and value properties", () => {
        const error = {
          message: "Validation failed",
          field: "email",
          value: "invalid-email",
        };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Validation failed",
          field: "email",
          value: "invalid-email",
        });
      });

      it("should include expectedFormat and suggestions", () => {
        const error = {
          message: "Format error",
          expectedFormat: "YYYY-MM-DD",
          suggestions: ["Check date format", "Use ISO format"],
        };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Format error",
          expectedFormat: "YYYY-MM-DD",
          suggestions: ["Check date format", "Use ISO format"],
        });
      });

      it("should include config.region property", () => {
        const error = {
          message: "Region error",
          "config.region": "us-east-1",
        };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Region error",
          "config.region": "us-east-1",
        });
      });
    });

    describe("unsafe property filtering", () => {
      it("should filter out sensitive credential properties", () => {
        const error = {
          message: "Auth failed",
          accessToken: "secret-token-123",
          secretKey: "secret-key-456",
          // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- Test data for sanitization verification
          password: "user-password",
          credentials: { accessKey: "access-key" },
        };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Auth failed",
        });
        expect(result).not.toHaveProperty("accessToken");
        expect(result).not.toHaveProperty("secretKey");
        expect(result).not.toHaveProperty("password");
        expect(result).not.toHaveProperty("credentials");
      });

      it("should filter out internal implementation details", () => {
        const error = {
          message: "Internal error",
          _internal: "private data",
          __proto__: { dangerous: "data" },
          constructor: Function,
          prototype: {},
        };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Internal error",
        });
        expect(result).not.toHaveProperty("_internal");
        expect(result).not.toHaveProperty("__proto__");
        expect(result).not.toHaveProperty("constructor");
        expect(result).not.toHaveProperty("prototype");
      });

      it("should filter out function properties", () => {
        const error = {
          message: "Function error",
          callback: () => {},
          handler: function handler() {},
          toString: () => "custom toString",
        };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Function error",
        });
        expect(result).not.toHaveProperty("callback");
        expect(result).not.toHaveProperty("handler");
        // toString is not in the safe list, so it should be filtered
      });

      it("should filter out complex object properties not in safe list", () => {
        const error = {
          message: "Complex error",
          complexObject: { nested: { data: "value" } },
          arrayData: [1, 2, 3],
          metadata: { safe: "should be filtered" },
        };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Complex error",
        });
        expect(result).not.toHaveProperty("complexObject");
        expect(result).not.toHaveProperty("arrayData");
        expect(result).not.toHaveProperty("metadata");
      });
    });

    describe("type validation for safe properties", () => {
      it("should only include string values for string-type safe properties", () => {
        const error = {
          message: 123, // Should be string
          name: { object: "not string" }, // Should be string
          code: ["array", "not", "string"], // Should be string
          stack: undefined, // Should be string
        };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Error details not available",
        });
        expect(result).not.toHaveProperty("name");
        expect(result).not.toHaveProperty("code");
        expect(result).not.toHaveProperty("stack");
      });

      it("should only include number values for number-type safe properties", () => {
        const error = {
          message: "HTTP error",
          httpStatusCode: "404", // Should be number
          statusCode: { value: 500 }, // Should be number
          errno: ["not", "number"], // Should be number
        };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "HTTP error",
        });
        expect(result).not.toHaveProperty("httpStatusCode");
        expect(result).not.toHaveProperty("statusCode");
        expect(result).not.toHaveProperty("errno");
      });

      it("should handle mixed safe property types correctly", () => {
        const error = {
          message: "Mixed error",
          code: "ERR_MIXED", // String - should include
          httpStatusCode: 500, // Number - should include
          field: 123, // Should be string - should exclude
          errno: "not a number", // Should be number - should exclude
        };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Mixed error",
          code: "ERR_MIXED",
          httpStatusCode: 500,
        });
        expect(result).not.toHaveProperty("field");
        expect(result).not.toHaveProperty("errno");
      });
    });

    describe("special value and suggestion properties", () => {
      it("should include primitive values for value property", () => {
        const error1 = { message: "Error", value: "string value" };
        const error2 = { message: "Error", value: 42 };
        const error3 = { message: "Error", value: true };

        expect(sanitizeErrorForVerboseOutput(error1)).toEqual({
          message: "Error",
          value: "string value",
        });
        expect(sanitizeErrorForVerboseOutput(error2)).toEqual({
          message: "Error",
          value: 42,
        });
        expect(sanitizeErrorForVerboseOutput(error3)).toEqual({
          message: "Error",
          value: true,
        });
      });

      it("should include arrays for value and suggestions properties", () => {
        const error = {
          message: "Array error",
          value: ["item1", "item2"],
          suggestions: ["suggestion1", "suggestion2"],
        };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Array error",
          value: ["item1", "item2"],
          suggestions: ["suggestion1", "suggestion2"],
        });
      });

      it("should exclude objects for value property when not primitive or array", () => {
        const error = {
          message: "Object error",
          value: { nested: "object" },
          expectedFormat: { format: "object" },
        };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Object error",
        });
        expect(result).not.toHaveProperty("value");
        expect(result).not.toHaveProperty("expectedFormat");
      });
    });

    describe("property enumeration failures", () => {
      it("should handle objects with non-enumerable properties", () => {
        const error = {};
        Object.defineProperty(error, "message", {
          value: "Hidden message",
          enumerable: false,
        });
        Object.defineProperty(error, "code", {
          value: "HIDDEN_CODE",
          enumerable: true,
        });

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          code: "HIDDEN_CODE",
        });
        expect(result).not.toHaveProperty("message");
      });

      it("should handle property access that throws", () => {
        const error = {
          message: "Base message",
        };
        Object.defineProperty(error, "dangerousProperty", {
          get() {
            throw new Error("Property access failed");
          },
          enumerable: true,
        });

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Base message",
        });
        expect(result).not.toHaveProperty("dangerousProperty");
      });

      it("should handle objects with complex property descriptors", () => {
        const problematicError = { message: "Test message" };

        // Add a property with complex descriptor
        Object.defineProperty(problematicError, "complexProperty", {
          value: "complex value",
          enumerable: true,
          writable: false,
        });

        const result = sanitizeErrorForVerboseOutput(problematicError);

        expect(result).toEqual({
          message: "Test message",
        });
        expect(result).not.toHaveProperty("complexProperty");
      });
    });

    describe("fallback message handling", () => {
      it("should ensure message property exists when original has string message", () => {
        const error = {
          message: "Original message",
          unsafeProperty: "should be filtered",
        };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Original message",
        });
      });

      it("should provide fallback message when no safe properties exist", () => {
        const error = {
          unsafeProperty1: "filtered",
          unsafeProperty2: { filtered: "object" },
          dangerousFunction: () => {},
        };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Error details not available",
        });
      });

      it("should extract message from 'message' property even if other safe properties exist", () => {
        const error = {
          message: "Important message",
          code: 123, // Wrong type, should be filtered
          httpStatusCode: "wrong type", // Wrong type, should be filtered
        };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Important message",
        });
      });

      it("should handle error with non-string message property", () => {
        const error = {
          message: { nested: "not a string" },
          code: "VALID_CODE",
        };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          code: "VALID_CODE",
        });
        expect(result).not.toHaveProperty("message");
      });
    });

    describe("circular reference handling", () => {
      it("should handle circular references in error objects", () => {
        const error: any = {
          message: "Circular error",
          code: "CIRCULAR",
        };
        error.self = error;
        error.nested = { parent: error };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Circular error",
          code: "CIRCULAR",
        });
        expect(result).not.toHaveProperty("self");
        expect(result).not.toHaveProperty("nested");
      });

      it("should handle complex circular structures", () => {
        const object1: any = { message: "Object 1", name: "Error1" };
        const object2: any = { message: "Object 2", name: "Error2" };
        object1.ref = object2;
        object2.ref = object1;

        const result = sanitizeErrorForVerboseOutput(object1);

        expect(result).toEqual({
          message: "Object 1",
          name: "Error1",
        });
        expect(result).not.toHaveProperty("ref");
      });
    });

    describe("edge cases", () => {
      it("should handle empty objects", () => {
        const result = sanitizeErrorForVerboseOutput({});

        expect(result).toEqual({
          message: "Error details not available",
        });
      });

      it("should handle objects with only Symbol properties", () => {
        const sym = Symbol("hidden");
        const error = { [sym]: "symbol value" };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Error details not available",
        });
      });

      it("should handle frozen objects", () => {
        const error = Object.freeze({
          message: "Frozen error",
          code: "FROZEN",
        });

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Frozen error",
          code: "FROZEN",
        });
      });

      it("should handle sealed objects", () => {
        const error = Object.seal({
          message: "Sealed error",
          name: "SealedError",
        });

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Sealed error",
          name: "SealedError",
        });
      });

      it("should handle objects with numeric property names", () => {
        const error = {
          message: "Numeric props",
          "0": "zero",
          "1": "one",
          "123": "one-two-three",
        };

        const result = sanitizeErrorForVerboseOutput(error);

        expect(result).toEqual({
          message: "Numeric props",
        });
        expect(result).not.toHaveProperty("0");
        expect(result).not.toHaveProperty("1");
        expect(result).not.toHaveProperty("123");
      });
    });

    describe("real-world error scenarios", () => {
      it("should handle AWS SDK errors", () => {
        const awsError = {
          message: "Access denied",
          name: "AccessDenied",
          code: "AccessDenied",
          statusCode: 403,
          requestId: "req-12345",
          region: "us-east-1", // Not in safe list
          credentials: { accessKeyId: "secret" }, // Sensitive
        };

        const result = sanitizeErrorForVerboseOutput(awsError);

        expect(result).toEqual({
          message: "Access denied",
          name: "AccessDenied",
          code: "AccessDenied",
          statusCode: 403,
          requestId: "req-12345",
        });
        expect(result).not.toHaveProperty("region");
        expect(result).not.toHaveProperty("credentials");
      });

      it("should handle Node.js system errors", () => {
        const nodeError = {
          message: "ENOENT: no such file",
          name: "Error",
          errno: -2,
          code: "ENOENT",
          syscall: "open",
          path: "/sensitive/file/path", // Not in safe list
        };

        const result = sanitizeErrorForVerboseOutput(nodeError);

        expect(result).toEqual({
          message: "ENOENT: no such file",
          name: "Error",
          errno: -2,
          code: "ENOENT",
          syscall: "open",
        });
        expect(result).not.toHaveProperty("path");
      });

      it("should handle HTTP client errors", () => {
        const httpError = {
          message: "Request failed",
          name: "HTTPError",
          httpStatusCode: 500,
          statusCode: 500,
          headers: { authorization: "Bearer secret" }, // Sensitive
          config: { url: "https://api.example.com" }, // Not in safe list
        };

        const result = sanitizeErrorForVerboseOutput(httpError);

        expect(result).toEqual({
          message: "Request failed",
          name: "HTTPError",
          httpStatusCode: 500,
          statusCode: 500,
        });
        expect(result).not.toHaveProperty("headers");
        expect(result).not.toHaveProperty("config");
      });

      it("should handle validation errors with field information", () => {
        const validationError = {
          message: "Invalid email format",
          name: "ValidationError",
          field: "email",
          value: "invalid-email@", // Safe to include
          actualValue: "user@example.com", // Not in safe list - sensitive
        };

        const result = sanitizeErrorForVerboseOutput(validationError);

        expect(result).toEqual({
          message: "Invalid email format",
          name: "ValidationError",
          field: "email",
          value: "invalid-email@",
        });
        expect(result).not.toHaveProperty("actualValue");
      });
    });
  });

  describe("isSafeErrorProperty", () => {
    describe("safe property recognition", () => {
      const safeProperties = [
        "message",
        "stack",
        "name",
        "code",
        "requestId",
        "httpStatusCode",
        "statusCode",
        "errno",
        "syscall",
        "signal",
        "field",
        "value",
        "config.region",
        "expectedFormat",
        "suggestions",
      ];

      for (const property of safeProperties) {
        it(`should recognize '${property}' as safe`, () => {
          expect(isSafeErrorProperty(property)).toBe(true);
        });
      }
    });

    describe("unsafe property recognition", () => {
      const unsafeProperties = [
        "password",
        "secret",
        "token",
        "accessToken",
        "secretKey",
        "credentials",
        "authorization",
        "apiKey",
        "_internal",
        "__proto__",
        "constructor",
        "prototype",
        "path",
        "url",
        "headers",
        "config",
        "metadata",
        "data",
        "response",
        "request",
        "cause",
        "innerError",
        "details",
        "context",
        "environment",
        "system",
        "platform",
        "version",
        "userAgent",
        "cookies",
        "session",
        "jwt",
        "bearer",
        "oauth",
        "refresh",
        "private",
        "sensitive",
        "confidential",
        "classified",
        "hidden",
        "encrypted",
      ];

      for (const property of unsafeProperties) {
        it(`should recognize '${property}' as unsafe`, () => {
          expect(isSafeErrorProperty(property)).toBe(false);
        });
      }
    });

    describe("edge cases", () => {
      it("should handle empty string", () => {
        expect(isSafeErrorProperty("")).toBe(false);
      });

      it("should handle whitespace-only strings", () => {
        expect(isSafeErrorProperty(" ")).toBe(false);
        expect(isSafeErrorProperty("\t")).toBe(false);
        expect(isSafeErrorProperty("\n")).toBe(false);
      });

      it("should handle case sensitivity", () => {
        expect(isSafeErrorProperty("MESSAGE")).toBe(false);
        expect(isSafeErrorProperty("Message")).toBe(false);
        expect(isSafeErrorProperty("message")).toBe(true);
      });

      it("should handle special characters", () => {
        expect(isSafeErrorProperty("message!")).toBe(false);
        expect(isSafeErrorProperty("@message")).toBe(false);
        expect(isSafeErrorProperty("message.name")).toBe(false);
        expect(isSafeErrorProperty("config.region")).toBe(true); // This one is explicitly safe
      });

      it("should handle numeric strings", () => {
        expect(isSafeErrorProperty("123")).toBe(false);
        expect(isSafeErrorProperty("0")).toBe(false);
      });

      it("should handle very long property names", () => {
        const longProperty = "a".repeat(1000);
        expect(isSafeErrorProperty(longProperty)).toBe(false);
      });

      it("should handle Unicode characters", () => {
        expect(isSafeErrorProperty("message🚀")).toBe(false);
        expect(isSafeErrorProperty("消息")).toBe(false);
        expect(isSafeErrorProperty("сообщение")).toBe(false);
      });
    });

    describe("property name variations", () => {
      it("should handle common variations that should not be safe", () => {
        expect(isSafeErrorProperty("messagee")).toBe(false);
        expect(isSafeErrorProperty("messages")).toBe(false);
        expect(isSafeErrorProperty("error.message")).toBe(false);
        expect(isSafeErrorProperty("error_message")).toBe(false);
        expect(isSafeErrorProperty("errorMessage")).toBe(false);
      });

      it("should handle code variations", () => {
        expect(isSafeErrorProperty("errorCode")).toBe(false);
        expect(isSafeErrorProperty("error_code")).toBe(false);
        expect(isSafeErrorProperty("statuscode")).toBe(false);
        expect(isSafeErrorProperty("status_code")).toBe(false);
      });

      it("should only allow exact matches", () => {
        expect(isSafeErrorProperty("config.region.name")).toBe(false);
        expect(isSafeErrorProperty("config.regions")).toBe(false);
        expect(isSafeErrorProperty("config")).toBe(false);
        expect(isSafeErrorProperty("region")).toBe(false);
      });
    });
  });
});
