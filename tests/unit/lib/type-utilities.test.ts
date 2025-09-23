/**
 * Unit tests for type utilities for safe value conversion and type handling
 *
 * Tests type-safe utilities for converting unknown values to strings, handling
 * metadata safely, and ensuring TypeScript compliance with comprehensive type coverage.
 */

import { describe, expect, it } from "vitest";
import {
  isSafePrimitive,
  toSafeString,
  type SanitizedError,
} from "../../../src/lib/type-utilities.js";

// Test helper functions for function handling tests
function namedFunction() {
  return "test";
}

const anonymousFunction = function () {
  return "test";
};

const arrowFunction = () => "test";

describe("Type Utilities", () => {
  describe("toSafeString", () => {
    describe("null and undefined handling", () => {
      it("should convert null to 'Unknown'", () => {
        expect(toSafeString(null)).toBe("Unknown");
      });

      it("should convert undefined to 'Unknown'", () => {
        expect(toSafeString()).toBe("Unknown");
      });
    });

    describe("string handling", () => {
      it("should return string values unchanged", () => {
        expect(toSafeString("hello")).toBe("hello");
        expect(toSafeString("")).toBe("");
        expect(toSafeString(" ")).toBe(" ");
      });

      it("should handle special characters in strings", () => {
        expect(toSafeString("hello\nworld")).toBe("hello\nworld");
        expect(toSafeString("hello\tworld")).toBe("hello\tworld");
        expect(toSafeString('hello"world')).toBe('hello"world');
        expect(toSafeString("hello'world")).toBe("hello'world");
        expect(toSafeString(String.raw`hello\world`)).toBe(String.raw`hello\world`);
      });

      it("should handle Unicode characters", () => {
        expect(toSafeString("🚀")).toBe("🚀");
        expect(toSafeString("你好")).toBe("你好");
        expect(toSafeString("Привет")).toBe("Привет");
        expect(toSafeString("🎉🔥💯")).toBe("🎉🔥💯");
      });

      it("should handle very long strings", () => {
        const longString = "a".repeat(10_000);
        expect(toSafeString(longString)).toBe(longString);
      });

      it("should handle empty and whitespace strings", () => {
        expect(toSafeString("")).toBe("");
        expect(toSafeString(" ")).toBe(" ");
        expect(toSafeString("\t")).toBe("\t");
        expect(toSafeString("\n")).toBe("\n");
        expect(toSafeString("\r\n")).toBe("\r\n");
      });
    });

    describe("number handling", () => {
      it("should convert integer numbers to strings", () => {
        expect(toSafeString(0)).toBe("0");
        expect(toSafeString(42)).toBe("42");
        expect(toSafeString(-123)).toBe("-123");
      });

      it("should convert float numbers to strings", () => {
        expect(toSafeString(3.14)).toBe("3.14");
        expect(toSafeString(-2.5)).toBe("-2.5");
        expect(toSafeString(0.1)).toBe("0.1");
      });

      it("should handle special number values", () => {
        expect(toSafeString(Infinity)).toBe("Infinity");
        expect(toSafeString(-Infinity)).toBe("-Infinity");
        expect(toSafeString(Number.NaN)).toBe("NaN");
      });

      it("should handle very large and small numbers", () => {
        expect(toSafeString(Number.MAX_SAFE_INTEGER)).toBe(String(Number.MAX_SAFE_INTEGER));
        expect(toSafeString(Number.MIN_SAFE_INTEGER)).toBe(String(Number.MIN_SAFE_INTEGER));
        expect(toSafeString(Number.MAX_VALUE)).toBe(String(Number.MAX_VALUE));
        expect(toSafeString(Number.MIN_VALUE)).toBe(String(Number.MIN_VALUE));
      });

      it("should handle scientific notation", () => {
        expect(toSafeString(1e10)).toBe("10000000000");
        expect(toSafeString(1e-10)).toBe("1e-10");
        expect(toSafeString(1.23e5)).toBe("123000");
      });
    });

    describe("boolean handling", () => {
      it("should convert true to 'true'", () => {
        expect(toSafeString(true)).toBe("true");
      });

      it("should convert false to 'false'", () => {
        expect(toSafeString(false)).toBe("false");
      });
    });

    describe("object handling", () => {
      it("should stringify simple objects", () => {
        const object = { name: "Alice", age: 30 };
        expect(toSafeString(object)).toBe('{"name":"Alice","age":30}');
      });

      it("should stringify nested objects", () => {
        const object = { user: { name: "Bob", settings: { theme: "dark" } } };
        expect(toSafeString(object)).toBe('{"user":{"name":"Bob","settings":{"theme":"dark"}}}');
      });

      it("should stringify arrays", () => {
        expect(toSafeString([1, 2, 3])).toBe("[1,2,3]");
        expect(toSafeString(["a", "b", "c"])).toBe('["a","b","c"]');
        expect(toSafeString([])).toBe("[]");
      });

      it("should stringify objects with mixed data types", () => {
        const object = {
          string: "text",
          number: 42,
          boolean: true,
          null: null,
          array: [1, 2, 3],
        };
        expect(toSafeString(object)).toBe(
          '{"string":"text","number":42,"boolean":true,"null":null,"array":[1,2,3]}',
        );
      });

      it("should handle empty objects", () => {
        expect(toSafeString({})).toBe("{}");
      });

      it("should handle objects with special property names", () => {
        const object = {
          "special-key": "value1",
          "key with spaces": "value2",
          "🚀": "emoji key",
        };
        expect(toSafeString(object)).toBe(
          '{"special-key":"value1","key with spaces":"value2","🚀":"emoji key"}',
        );
      });
    });

    describe("array handling", () => {
      it("should stringify simple arrays", () => {
        expect(toSafeString([1, 2, 3])).toBe("[1,2,3]");
        expect(toSafeString(["a", "b", "c"])).toBe('["a","b","c"]');
      });

      it("should stringify nested arrays", () => {
        expect(
          toSafeString([
            [1, 2],
            [3, 4],
          ]),
        ).toBe("[[1,2],[3,4]]");
      });

      it("should stringify arrays with mixed types", () => {
        expect(toSafeString([1, "text", true, null])).toBe('[1,"text",true,null]');
      });

      it("should stringify sparse arrays", () => {
        const sparse = Array.from({ length: 3 });
        sparse[1] = "middle";
        expect(toSafeString(sparse)).toBe('[null,"middle",null]');
      });

      it("should handle very long arrays", () => {
        const longArray = Array.from({ length: 1000 }, (_, index) => index);
        const result = toSafeString(longArray);
        expect(result).toContain("[0,1,2");
        expect(result).toContain("999]");
      });
    });

    describe("function handling", () => {
      it("should convert named functions to string", () => {
        expect(toSafeString(namedFunction)).toBe(namedFunction.toString());
      });

      it("should convert anonymous functions to string", () => {
        expect(toSafeString(anonymousFunction)).toBe(anonymousFunction.toString());
      });

      it("should convert arrow functions to string", () => {
        expect(toSafeString(arrowFunction)).toBe(arrowFunction.toString());
      });

      it("should convert built-in functions to string", () => {
        expect(toSafeString(Math.max)).toBe(Math.max.toString());
        expect(toSafeString(console.log)).toBe(console.log.toString());
      });

      it("should convert class constructors to string", () => {
        class TestClass {}
        expect(toSafeString(TestClass)).toBe(TestClass.toString());
      });
    });

    describe("symbol handling", () => {
      it("should convert symbols to string", () => {
        const sym1 = Symbol();
        expect(toSafeString(sym1)).toBe(sym1.toString());
      });

      it("should convert symbols with descriptions to string", () => {
        const sym2 = Symbol("test description");
        expect(toSafeString(sym2)).toBe("Symbol(test description)");
      });

      it("should convert well-known symbols to string", () => {
        expect(toSafeString(Symbol.iterator)).toBe("Symbol(Symbol.iterator)");
        expect(toSafeString(Symbol.toStringTag)).toBe("Symbol(Symbol.toStringTag)");
      });

      it("should convert global symbols to string", () => {
        const globalSym = Symbol.for("global");
        expect(toSafeString(globalSym)).toBe("Symbol(global)");
      });
    });

    describe("BigInt handling", () => {
      it("should convert small BigInt values to string", () => {
        expect(toSafeString(42n)).toBe("42");
        expect(toSafeString(BigInt(-123))).toBe("-123");
        expect(toSafeString(0n)).toBe("0");
      });

      it("should convert large BigInt values to string", () => {
        const largeBigInt = 123_456_789_012_345_678_901_234_567_890n;
        expect(toSafeString(largeBigInt)).toBe("123456789012345678901234567890");
      });

      it("should handle BigInt from number conversion", () => {
        expect(toSafeString(BigInt(Number.MAX_SAFE_INTEGER))).toBe(String(Number.MAX_SAFE_INTEGER));
      });

      it("should handle hexadecimal BigInt", () => {
        // ESLint disable: Prettier formats hex literals to lowercase while unicorn/number-literal-case
        // requires uppercase. This creates a formatting conflict. Disabling rule for this test case
        // to maintain consistency with Prettier's formatting preferences.
        // eslint-disable-next-line unicorn/number-literal-case
        expect(toSafeString(0x1f_ff_ff_ff_ff_ff_ffn)).toBe("9007199254740991");
      });
    });

    describe("circular reference handling", () => {
      it("should handle circular object references", () => {
        const object: any = { name: "test" };
        object.self = object;

        const result = toSafeString(object);
        expect(result).toBe("[Object]");
      });

      it("should handle circular array references", () => {
        const array: any[] = [1, 2, 3];
        array.push(array);

        const result = toSafeString(array);
        expect(result).toBe("[Object]");
      });

      it("should handle complex circular structures", () => {
        const object1: any = { name: "obj1" };
        const object2: any = { name: "obj2" };
        object1.ref = object2;
        object2.ref = object1;

        const result = toSafeString(object1);
        expect(result).toBe("[Object]");
      });

      it("should handle self-referencing objects with getters", () => {
        const object: any = {
          name: "test",
          get self() {
            return this;
          },
        };

        const result = toSafeString(object);
        expect(result).toBe("[Object]");
      });
    });

    describe("JSON.stringify failures", () => {
      it("should handle objects with toJSON that throws", () => {
        const object = {
          name: "test",
          toJSON() {
            throw new Error("toJSON failed");
          },
        };

        const result = toSafeString(object);
        expect(result).toBe("[Object]");
      });

      it("should handle objects with non-serializable properties", () => {
        const object = {
          func: () => {},
          symbol: Symbol("test"),
          undefined: undefined,
        };

        // Note: JSON.stringify normally excludes these, but if it throws for some reason
        const result = toSafeString(object);
        expect(typeof result).toBe("string");
      });

      it("should handle getters that throw during serialization", () => {
        const object = {
          name: "test",
          get problematic() {
            throw new Error("Getter failed");
          },
        };

        const result = toSafeString(object);
        expect(result).toBe("[Object]");
      });

      it("should handle objects with recursive getters", () => {
        const object: any = {
          name: "test",
          get recursive() {
            // eslint-disable-next-line unicorn/no-accessor-recursion
            return this.recursive;
          },
        };

        const result = toSafeString(object);
        expect(result).toBe("[Object]");
      });
    });

    describe("edge cases", () => {
      it("should handle Date objects", () => {
        const date = new Date("2023-01-01T00:00:00.000Z");
        expect(toSafeString(date)).toBe('"2023-01-01T00:00:00.000Z"');
      });

      it("should handle RegExp objects", () => {
        const regex = /test/gi;
        expect(toSafeString(regex)).toBe('"/test/gi"');
      });

      it("should handle Error objects", () => {
        const error = new Error("Test error");
        const result = toSafeString(error);
        expect(result).toContain("Test error");
      });

      it("should handle Map objects", () => {
        const map = new Map([["key", "value"]]);
        expect(toSafeString(map)).toBe("{}");
      });

      it("should handle Set objects", () => {
        const set = new Set([1, 2, 3]);
        expect(toSafeString(set)).toBe("{}");
      });

      it("should handle WeakMap objects", () => {
        const weakMap = new WeakMap();
        expect(toSafeString(weakMap)).toBe("{}");
      });

      it("should handle WeakSet objects", () => {
        const weakSet = new WeakSet();
        expect(toSafeString(weakSet)).toBe("{}");
      });

      it("should handle typed arrays", () => {
        const uint8Array = new Uint8Array([1, 2, 3]);
        const result = toSafeString(uint8Array);
        expect(result).toContain("1");
        expect(result).toContain("2");
        expect(result).toContain("3");
      });

      it("should handle ArrayBuffer", () => {
        const buffer = new ArrayBuffer(8);
        expect(toSafeString(buffer)).toBe("{}");
      });

      it("should handle Promise objects", () => {
        const promise = Promise.resolve("test");
        expect(toSafeString(promise)).toBe("{}");
      });

      it("should handle proxy objects", () => {
        const target = { name: "test" };
        const proxy = new Proxy(target, {});
        expect(toSafeString(proxy)).toBe('{"name":"test"}');
      });
    });

    describe("string conversion fallback", () => {
      it("should use String() for values that can't be JSON stringified", () => {
        // Create a mock object that will cause String() to be called
        const object = {
          toString() {
            return "custom toString";
          },
          toJSON() {
            throw new Error("JSON failed");
          },
        };

        const result = toSafeString(object);
        expect(result).toBe("[Object]");
      });

      it("should handle String() conversion failures", () => {
        // This is hard to trigger in practice, but we test the fallback
        const problematicValue = {
          toString() {
            throw new Error("toString failed");
          },
          valueOf() {
            throw new Error("valueOf failed");
          },
        };

        const result = toSafeString(problematicValue);
        expect(result).toBe("Unknown");
      });
    });
  });

  describe("isSafePrimitive", () => {
    describe("primitive type recognition", () => {
      it("should recognize strings as safe primitives", () => {
        expect(isSafePrimitive("hello")).toBe(true);
        expect(isSafePrimitive("")).toBe(true);
        expect(isSafePrimitive(" ")).toBe(true);
        expect(isSafePrimitive("123")).toBe(true);
      });

      it("should recognize numbers as safe primitives", () => {
        expect(isSafePrimitive(0)).toBe(true);
        expect(isSafePrimitive(42)).toBe(true);
        expect(isSafePrimitive(-123)).toBe(true);
        expect(isSafePrimitive(3.14)).toBe(true);
        expect(isSafePrimitive(Infinity)).toBe(true);
        expect(isSafePrimitive(-Infinity)).toBe(true);
        expect(isSafePrimitive(Number.NaN)).toBe(true);
      });

      it("should recognize booleans as safe primitives", () => {
        expect(isSafePrimitive(true)).toBe(true);
        expect(isSafePrimitive(false)).toBe(true);
      });
    });

    describe("non-primitive type recognition", () => {
      it("should not recognize null as safe primitive", () => {
        expect(isSafePrimitive(null)).toBe(false);
      });

      it("should not recognize undefined as safe primitive", () => {
        expect(isSafePrimitive()).toBe(false);
      });

      it("should not recognize objects as safe primitives", () => {
        expect(isSafePrimitive({})).toBe(false);
        expect(isSafePrimitive({ name: "test" })).toBe(false);
        expect(isSafePrimitive(new Date())).toBe(false);
        expect(isSafePrimitive(new Error("test error"))).toBe(false);
      });

      it("should not recognize arrays as safe primitives", () => {
        expect(isSafePrimitive([])).toBe(false);
        expect(isSafePrimitive([1, 2, 3])).toBe(false);
        expect(isSafePrimitive(["a", "b", "c"])).toBe(false);
      });

      it("should not recognize functions as safe primitives", () => {
        expect(isSafePrimitive(() => {})).toBe(false);
        expect(isSafePrimitive(function () {})).toBe(false);
        expect(isSafePrimitive(Math.max)).toBe(false);
      });

      it("should not recognize symbols as safe primitives", () => {
        expect(isSafePrimitive(Symbol())).toBe(false);
        expect(isSafePrimitive(Symbol("test"))).toBe(false);
        expect(isSafePrimitive(Symbol.iterator)).toBe(false);
      });

      it("should not recognize BigInt as safe primitives", () => {
        expect(isSafePrimitive(42n)).toBe(false);
        expect(isSafePrimitive(123_456_789_012_345_678_901_234_567_890n)).toBe(false);
      });
    });

    describe("type guard behavior", () => {
      it("should work as TypeScript type guard", () => {
        const value: unknown = "test string";

        if (isSafePrimitive(value)) {
          // TypeScript should know this is string | number | boolean
          expect(typeof value).toBe("string");
          // This line should compile without TypeScript errors
          const length = value.toString().length;
          expect(length).toBeGreaterThan(0);
        }
      });

      it("should narrow union types correctly", () => {
        const values: (string | number | boolean | object | null)[] = [
          "string",
          42,
          true,
          {},
          null,
        ];

        const safePrimitives = values.filter((value) => isSafePrimitive(value));
        expect(safePrimitives).toEqual(["string", 42, true]);
      });

      it("should handle mixed type arrays", () => {
        const mixedArray: unknown[] = [
          "text",
          123,
          true,
          false,
          null,
          undefined,
          {},
          [],
          () => {},
          Symbol("test"),
          42n,
        ];

        const primitives = mixedArray.filter((value) => isSafePrimitive(value));
        expect(primitives).toEqual(["text", 123, true, false]);
      });
    });

    describe("edge cases", () => {
      it("should handle boxed primitives", () => {
        // eslint-disable-next-line unicorn/new-for-builtins, sonarjs/no-primitive-wrappers
        expect(isSafePrimitive(new String("test"))).toBe(false);

        // eslint-disable-next-line unicorn/new-for-builtins, sonarjs/no-primitive-wrappers
        expect(isSafePrimitive(new Number(42))).toBe(false);

        // eslint-disable-next-line unicorn/new-for-builtins, sonarjs/no-primitive-wrappers
        expect(isSafePrimitive(new Boolean(true))).toBe(false);
      });

      it("should handle special number values", () => {
        expect(isSafePrimitive(Number.MAX_SAFE_INTEGER)).toBe(true);
        expect(isSafePrimitive(Number.MIN_SAFE_INTEGER)).toBe(true);
        expect(isSafePrimitive(Number.POSITIVE_INFINITY)).toBe(true);
        expect(isSafePrimitive(Number.NEGATIVE_INFINITY)).toBe(true);
        expect(isSafePrimitive(Number.NaN)).toBe(true);
      });

      it("should handle empty and special strings", () => {
        expect(isSafePrimitive("")).toBe(true);
        expect(isSafePrimitive(" ")).toBe(true);
        expect(isSafePrimitive("\n")).toBe(true);
        expect(isSafePrimitive("\t")).toBe(true);
        expect(isSafePrimitive("🚀")).toBe(true);
        expect(isSafePrimitive("null")).toBe(true); // The string "null", not null
        expect(isSafePrimitive("undefined")).toBe(true); // The string "undefined"
      });
    });
  });

  describe("SanitizedError interface", () => {
    it("should define correct interface structure", () => {
      // This test ensures the interface is properly exported and structured
      const sanitizedError: SanitizedError = {
        message: "Test message",
        name: "TestError",
        code: "TEST_CODE",
        stack: "Stack trace",
        requestId: "req-123",
        httpStatusCode: 404,
        statusCode: 500,
        errno: -2,
        syscall: "read",
        signal: "SIGTERM",
      };

      expect(sanitizedError.message).toBe("Test message");
      expect(sanitizedError.name).toBe("TestError");
      expect(sanitizedError.code).toBe("TEST_CODE");
      expect(sanitizedError.httpStatusCode).toBe(404);
    });

    it("should allow readonly properties", () => {
      const sanitizedError: SanitizedError = {
        message: "Readonly test",
      };

      // This should not compile if we try to modify readonly properties
      // sanitizedError.message = "Modified"; // Would cause TypeScript error

      expect(sanitizedError.message).toBe("Readonly test");
    });

    it("should allow optional properties", () => {
      const minimalError: SanitizedError = {
        message: "Minimal error",
      };

      expect(minimalError.message).toBe("Minimal error");
      expect(minimalError.name).toBeUndefined();
      expect(minimalError.code).toBeUndefined();
    });
  });
});
