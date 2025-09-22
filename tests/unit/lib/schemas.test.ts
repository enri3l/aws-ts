/**
 * Unit tests for Zod validation schemas
 *
 * Tests comprehensive input validation schemas for CLI commands, configuration,
 * and AWS service parameters with TypeScript type inference.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AwsProfileSchema,
  AwsRegionSchema,
  CliConfigSchema,
  createCommandSchema,
  DynamoTableConfigSchema,
  EnvironmentSchema,
  PaginationSchema,
  safeParseWithErrors,
  TableNameSchema,
  validateCliConfig,
  validateEnvironment,
  type AwsRegion,
  type CliConfig,
  type TableName,
} from "../../../src/lib/schemas.js";

describe("Validation Schemas", () => {
  describe("AwsRegionSchema", () => {
    it("should validate common AWS regions", () => {
      const validRegions = [
        "us-east-1",
        "us-east-2",
        "us-west-1",
        "us-west-2",
        "eu-west-1",
        "eu-west-2",
        "eu-central-1",
        "ap-southeast-1",
        "ap-northeast-1",
      ];

      for (const region of validRegions) {
        expect(() => AwsRegionSchema.parse(region)).not.toThrow();
        expect(AwsRegionSchema.parse(region)).toBe(region);
      }
    });

    it("should reject invalid region formats", () => {
      const invalidRegions = [
        "",
        "US-EAST-1",
        "us_east_1",
        "us-east",
        "1-us-east",
        "us-east-1-invalid",
        "invalid-region-name",
      ];

      for (const region of invalidRegions) {
        expect(() => AwsRegionSchema.parse(region)).toThrow();
      }
    });

    it("should reject non-string inputs", () => {
      const invalidInputs = [undefined, 123, {}, [], true];

      for (const input of invalidInputs) {
        expect(() => AwsRegionSchema.parse(input)).toThrow();
      }
    });

    it("should provide clear error messages", () => {
      expect(() => AwsRegionSchema.parse("")).toThrow("AWS region is required");
      expect(() => AwsRegionSchema.parse("INVALID")).toThrow("lowercase letters");
    });
  });

  describe("AwsProfileSchema", () => {
    it("should validate correct AWS profile names", () => {
      const validProfiles = ["default", "dev", "production", "my-profile", "profile_123"];

      for (const profile of validProfiles) {
        expect(() => AwsProfileSchema.parse(profile)).not.toThrow();
        expect(AwsProfileSchema.parse(profile)).toBe(profile);
      }
    });

    it("should reject invalid profile formats", () => {
      const invalidProfiles = ["", "profile with spaces", "profile@name", "profile#name"];

      for (const profile of invalidProfiles) {
        expect(() => AwsProfileSchema.parse(profile)).toThrow();
      }
    });

    it("should reject non-string inputs", () => {
      const invalidInputs = [123, undefined, {}, []];

      for (const input of invalidInputs) {
        expect(() => AwsProfileSchema.parse(input)).toThrow();
      }
    });
  });

  describe("TableNameSchema", () => {
    it("should validate correct DynamoDB table names", () => {
      const validTableNames = [
        "MyTable",
        "users-table",
        "Table123",
        "my_table",
        "Table.Name",
        "a".repeat(255), // max length
      ];

      for (const tableName of validTableNames) {
        expect(() => TableNameSchema.parse(tableName)).not.toThrow();
        expect(TableNameSchema.parse(tableName)).toBe(tableName);
      }
    });

    it("should reject invalid table names", () => {
      const invalidTableNames = [
        "",
        "ab", // too short
        "a".repeat(256), // too long
        "table name", // space
        "table@name", // invalid character
        "table#name", // invalid character
      ];

      for (const tableName of invalidTableNames) {
        expect(() => TableNameSchema.parse(tableName)).toThrow();
      }
    });
  });

  describe("CliConfigSchema", () => {
    it("should validate basic CLI config", () => {
      const input = {};
      const result = CliConfigSchema.parse(input);

      expect(result.output).toBe("json"); // default
      expect(result.verbose).toBe(false); // default
    });

    it("should validate CLI config with all fields", () => {
      const input = {
        region: "us-east-1",
        profile: "dev",
        output: "table",
        verbose: true,
        noColor: true,
      };

      const result = CliConfigSchema.parse(input);
      expect(result.region).toBe("us-east-1");
      expect(result.profile).toBe("dev");
      expect(result.output).toBe("table");
      expect(result.verbose).toBe(true);
    });
  });

  describe("PaginationSchema", () => {
    it("should validate pagination with pageSize only", () => {
      const input = { pageSize: 10 };
      const result = PaginationSchema.parse(input);

      expect(result.pageSize).toBe(10);
      expect(result.nextToken).toBeUndefined();
    });

    it("should validate pagination with pageSize and nextToken", () => {
      const input = { pageSize: 25, nextToken: "token123" };
      const result = PaginationSchema.parse(input);

      expect(result.pageSize).toBe(25);
      expect(result.nextToken).toBe("token123");
    });

    it("should use default pageSize when not provided", () => {
      const input = {};
      const result = PaginationSchema.parse(input);

      expect(result.pageSize).toBe(50);
      expect(result.nextToken).toBeUndefined();
    });

    it("should reject invalid pageSize values", () => {
      const invalidInputs = [
        { pageSize: 0 },
        { pageSize: -1 },
        { pageSize: "10" },
        { pageSize: 1001 }, // over max
      ];

      for (const input of invalidInputs) {
        expect(() => PaginationSchema.parse(input)).toThrow();
      }
    });

    it("should reject invalid nextToken types", () => {
      const invalidInputs = [{ nextToken: 123 }, { nextToken: {} }, { nextToken: [] }];

      for (const input of invalidInputs) {
        expect(() => PaginationSchema.parse(input)).toThrow();
      }
    });
  });

  describe("EnvironmentSchema", () => {
    it("should validate environment variables", () => {
      const input = {
        NODE_ENV: "development",
        AWS_REGION: "us-east-1",
        LOG_LEVEL: "DEBUG",
      };

      const result = EnvironmentSchema.parse(input);
      expect(result.NODE_ENV).toBe("development");
      expect(result.AWS_REGION).toBe("us-east-1");
      expect(result.LOG_LEVEL).toBe("DEBUG");
    });

    it("should use default values for missing environment variables", () => {
      const input = {};
      const result = EnvironmentSchema.parse(input);

      expect(result.NODE_ENV).toBe("production"); // default is production, not development
      expect(result.LOG_LEVEL).toBeUndefined(); // LOG_LEVEL is optional with no default
    });
  });

  describe("Utility Functions", () => {
    it("should validate environment with validateEnvironment", () => {
      const environment = {
        NODE_ENV: "production",
        AWS_REGION: "us-east-1",
        LOG_LEVEL: "ERROR",
      };

      const result = validateEnvironment(environment);
      expect(result.NODE_ENV).toBe("production");
      expect(result.AWS_REGION).toBe("us-east-1");
      expect(result.LOG_LEVEL).toBe("ERROR");
    });

    it("should validate CLI config with validateCliConfig", () => {
      const config = {
        region: "eu-west-1",
        profile: "production",
        output: "json",
        verbose: false,
      };

      const result = validateCliConfig(config);
      expect(result.region).toBe("eu-west-1");
      expect(result.profile).toBe("production");
      expect(result.output).toBe("json");
      expect(result.verbose).toBe(false);
    });

    it("should create command schema with createCommandSchema", () => {
      const commandSchema = createCommandSchema({
        tableName: TableNameSchema,
        region: AwsRegionSchema.optional(),
      });

      const input = {
        config: {},
        command: { tableName: "MyTable", region: "us-east-1" },
      };
      const result = commandSchema.parse(input);

      expect(result.command.tableName).toBe("MyTable");
      expect(result.command.region).toBe("us-east-1");
    });

    it("should safely parse with safeParseWithErrors", () => {
      const result = safeParseWithErrors(AwsRegionSchema, "us-east-1");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe("us-east-1");
      }
    });

    it("should handle errors with safeParseWithErrors", () => {
      const result = safeParseWithErrors(AwsRegionSchema, "INVALID");
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.errors).toBeDefined();
        expect(result.errors.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Type Inference", () => {
    it("should infer correct TypeScript types", () => {
      // This test verifies that the TypeScript types are correctly inferred
      const region: AwsRegion = "us-east-1";
      const tableName: TableName = "MyTable";

      expect(region).toBe("us-east-1");
      expect(tableName).toBe("MyTable");
    });

    it("should work with complex type inference", () => {
      const config: CliConfig = {
        output: "json",
        verbose: false,
        noColor: false,
      };

      expect(config.output).toBe("json");
      expect(config.verbose).toBe(false);
    });
  });

  describe("Schema Composition", () => {
    it("should work with schema composition in complex objects", () => {
      const complexInput = {
        tableConfig: DynamoTableConfigSchema.parse({
          tableName: "MyTable",
          partitionKey: { name: "id", type: "S" },
          billingMode: "PAY_PER_REQUEST",
        }),
        pagination: PaginationSchema.parse({ pageSize: 50 }),
        region: AwsRegionSchema.parse("us-east-1"),
      };

      expect(complexInput.tableConfig.tableName).toBe("MyTable");
      expect(complexInput.pagination.pageSize).toBe(50);
      expect(complexInput.region).toBe("us-east-1");
    });
  });

  describe("Error Messages", () => {
    it("should provide clear validation error messages", () => {
      try {
        AwsRegionSchema.parse("INVALID-REGION");
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
        if (error instanceof z.ZodError) {
          expect(error.issues[0].message).toContain("lowercase letters");
        }
      }
    });

    it("should provide path information for nested validation errors", () => {
      try {
        DynamoTableConfigSchema.parse({
          tableName: "MyTable",
          partitionKey: { name: "", type: "S" }, // invalid empty name
          billingMode: "PAY_PER_REQUEST",
        });
      } catch (error) {
        expect(error).toBeInstanceOf(z.ZodError);
        if (error instanceof z.ZodError) {
          expect(error.issues.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
