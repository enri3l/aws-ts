/**
 * Zod schemas for input validation with TypeScript type inference
 *
 * Provides input validation schemas for CLI commands, configuration,
 * and AWS service parameters with automatic TypeScript type generation.
 *
 */

import { z } from "zod";

/**
 * Base schema for AWS region validation
 *
 * @public
 */
export const AwsRegionSchema = z
  .string()
  .min(1, "AWS region is required")
  .regex(/^[a-z0-9-]+$/, "AWS region must contain only lowercase letters, numbers, and hyphens")
  .refine((region) => {
    const validRegions = [
      "us-east-1",
      "us-east-2",
      "us-west-1",
      "us-west-2",
      "eu-west-1",
      "eu-west-2",
      "eu-west-3",
      "eu-central-1",
      "eu-north-1",
      "ap-south-1",
      "ap-southeast-1",
      "ap-southeast-2",
      "ap-northeast-1",
      "ap-northeast-2",
      "ca-central-1",
      "sa-east-1",
      // Add more regions as needed
    ];
    return validRegions.includes(region);
  }, "Must be a valid AWS region");

/**
 * Schema for AWS profile name validation
 *
 * @public
 */
export const AwsProfileSchema = z
  .string()
  .min(1, "AWS profile name is required")
  .max(64, "AWS profile name must be 64 characters or less")
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "AWS profile name can only contain letters, numbers, dots, underscores, and hyphens",
  );

/**
 * Schema for table name validation (DynamoDB compatible)
 *
 * @public
 */
export const TableNameSchema = z
  .string()
  .min(3, "Table name must be at least 3 characters")
  .max(255, "Table name must be 255 characters or less")
  .regex(
    /^[a-zA-Z0-9._-]+$/,
    "Table name can only contain letters, numbers, dots, underscores, and hyphens",
  );

/**
 * Schema for output format validation
 *
 * @public
 */
export const OutputFormatSchema = z.enum(["table", "json", "jsonl", "csv"]).default("table");

/**
 * Common CLI configuration schema
 *
 * @public
 */
export const CliConfigSchema = z.object({
  /**
   * AWS region for operations
   */
  region: AwsRegionSchema.optional(),

  /**
   * AWS profile to use
   */
  profile: AwsProfileSchema.optional(),

  /**
   * Output format for command results
   */
  output: z.enum(["json", "jsonl", "csv", "tsv", "table"]).default("json"),

  /**
   * Enable verbose logging
   */
  verbose: z.boolean().default(false),

  /**
   * Disable colored output
   */
  noColor: z.boolean().default(false),

  /**
   * Maximum number of items to return
   */
  limit: z.number().int().min(1).max(10_000).optional(),
});

/**
 * DynamoDB table configuration schema
 *
 * @public
 */
export const DynamoTableConfigSchema = z
  .object({
    /**
     * Table name
     */
    tableName: TableNameSchema,

    /**
     * Partition key configuration
     */
    partitionKey: z.object({
      name: z.string().min(1, "Partition key name is required"),
      type: z.enum(["S", "N", "B"]).describe("S=String, N=Number, B=Binary"),
    }),

    /**
     * Sort key configuration (optional)
     */
    sortKey: z
      .object({
        name: z.string().min(1, "Sort key name is required"),
        type: z.enum(["S", "N", "B"]).describe("S=String, N=Number, B=Binary"),
      })
      .optional(),

    /**
     * Billing mode
     */
    billingMode: z.enum(["PROVISIONED", "PAY_PER_REQUEST"]).default("PAY_PER_REQUEST"),

    /**
     * Read capacity units (required for PROVISIONED billing)
     */
    readCapacityUnits: z.number().int().min(1).optional(),

    /**
     * Write capacity units (required for PROVISIONED billing)
     */
    writeCapacityUnits: z.number().int().min(1).optional(),
  })
  .refine(
    (data) => {
      if (data.billingMode === "PROVISIONED") {
        return data.readCapacityUnits !== undefined && data.writeCapacityUnits !== undefined;
      }
      return true;
    },
    {
      message: "Read and write capacity units are required for PROVISIONED billing mode",
      path: ["billingMode"],
    },
  );

/**
 * Command input base schema
 *
 * @public
 */
export const CommandInputSchema = z.object({
  /**
   * Inherited CLI configuration
   */
  config: CliConfigSchema,

  /**
   * Command-specific flags
   */
  flags: z.record(z.string(), z.unknown()).default({}),

  /**
   * Command arguments
   */
  args: z.array(z.string()).default([]),
});

/**
 * File input schema for data processing
 *
 * @public
 */
export const FileInputSchema = z.object({
  /**
   * Input file path
   */
  inputFile: z.string().min(1, "Input file path is required"),

  /**
   * Input file format
   */
  inputFormat: z.enum(["json", "jsonl", "csv", "tsv"]).optional(),

  /**
   * Output file path (optional, defaults to stdout)
   */
  outputFile: z.string().optional(),

  /**
   * Field delimiter for CSV/TSV files
   */
  delimiter: z.string().length(1, "Delimiter must be a single character").optional(),

  /**
   * Skip header row in CSV files
   */
  skipHeader: z.boolean().default(false),
});

/**
 * Pagination schema for list operations
 *
 * @public
 */
export const PaginationSchema = z.object({
  /**
   * Maximum number of items per page
   */
  pageSize: z.number().int().min(1).max(1000).default(50),

  /**
   * Token for next page (from previous response)
   */
  nextToken: z.string().optional(),

  /**
   * Maximum total items to retrieve across all pages
   */
  maxItems: z.number().int().min(1).optional(),
});

/**
 * Environment validation schema
 *
 * @public
 */
export const EnvironmentSchema = z.object({
  /**
   * Node.js environment
   */
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),

  /**
   * Log level override
   */
  LOG_LEVEL: z.enum(["DEBUG", "INFO", "WARN", "ERROR", "SILENT"]).optional(),

  /**
   * AWS region override
   */
  AWS_REGION: AwsRegionSchema.optional(),

  /**
   * AWS profile override
   */
  AWS_PROFILE: AwsProfileSchema.optional(),

  /**
   * DynamoDB endpoint override (for local testing)
   */
  DYNAMODB_ENDPOINT: z
    .string()
    .regex(/^https?:\/\/.+/, "Must be a valid URL")
    .optional(),

  /**
   * Disable colored output
   */
  NO_COLOR: z
    .string()
    .optional()
    .transform((value) => value === "true" || value === "1"),
});

/**
 * Inferred TypeScript types from schemas
 */

export type AwsRegion = z.infer<typeof AwsRegionSchema>;
export type AwsProfile = z.infer<typeof AwsProfileSchema>;
export type TableName = z.infer<typeof TableNameSchema>;
export type CliConfig = z.infer<typeof CliConfigSchema>;
export type DynamoTableConfig = z.infer<typeof DynamoTableConfigSchema>;
export type CommandInput = z.infer<typeof CommandInputSchema>;
export type FileInput = z.infer<typeof FileInputSchema>;
export type Pagination = z.infer<typeof PaginationSchema>;
export type Environment = z.infer<typeof EnvironmentSchema>;

/**
 * Validation helper functions
 */

/**
 * Validate and parse environment variables
 *
 * @param environment - Process environment object
 * @returns Parsed and validated environment configuration
 * @throws When environment validation fails
 *
 * @public
 */
export function validateEnvironment(
  environment: Record<string, string | undefined> = process.env,
): Environment {
  return EnvironmentSchema.parse(environment);
}

/**
 * Validate CLI configuration with detailed error messages
 *
 * @param config - Configuration object to validate
 * @returns Validated configuration
 * @throws When configuration validation fails
 *
 * @public
 */
export function validateCliConfig(config: unknown): CliConfig {
  const result = CliConfigSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new Error(`Configuration validation failed: ${errors}`);
  }

  return result.data;
}

/**
 * Create a custom validation schema for command-specific input
 *
 * @param commandSchema - Command-specific schema to merge with base
 * @returns Combined validation schema
 *
 * @public
 */
export function createCommandSchema<T extends z.ZodRawShape>(commandSchema: T) {
  return CommandInputSchema.extend({
    command: z.object(commandSchema),
  });
}

/**
 * Safe parse with user-friendly error formatting
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validation result with formatted errors
 *
 * @public
 */
export function safeParseWithErrors<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  });

  return { success: false, errors };
}
