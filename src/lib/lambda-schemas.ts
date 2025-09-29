/**
 * Lambda-specific Zod schemas for input validation
 *
 * Provides comprehensive validation schemas for Lambda commands
 * and operations with automatic TypeScript type generation.
 *
 */

import { z } from "zod";
import { AwsProfileSchema, AwsRegionSchema } from "./schemas.js";

/**
 * Lambda function name validation with AWS constraints
 *
 * @public
 */
export const LambdaFunctionNameSchema = z
  .string()
  .min(1, "Function name is required")
  .max(64, "Function name must be 64 characters or less")
  .regex(
    /^[a-zA-Z0-9-_]+$/,
    "Function name can only contain letters, numbers, hyphens, and underscores",
  );

/**
 * Lambda runtime validation for all supported runtimes
 *
 * @public
 */
export const LambdaRuntimeSchema = z.enum([
  "nodejs18.x",
  "nodejs20.x",
  "python3.9",
  "python3.10",
  "python3.11",
  "python3.12",
  "java8.al2",
  "java11",
  "java17",
  "java21",
  "dotnet6",
  "dotnet8",
  "go1.x",
  "ruby3.2",
  "provided.al2",
  "provided.al2023",
]);

/**
 * Memory size validation (128 MB to 10,240 MB in 1 MB increments)
 *
 * @public
 */
export const LambdaMemorySizeSchema = z
  .number()
  .int()
  .min(128, "Memory size must be at least 128 MB")
  .max(10_240, "Memory size cannot exceed 10,240 MB")
  .refine((value) => value % 1 === 0, "Memory size must be in 1 MB increments");

/**
 * Timeout validation (1 second to 15 minutes)
 *
 * @public
 */
export const LambdaTimeoutSchema = z
  .number()
  .int()
  .min(1, "Timeout must be at least 1 second")
  .max(900, "Timeout cannot exceed 900 seconds (15 minutes)");

/**
 * IAM role ARN validation
 *
 * @public
 */
export const LambdaRoleArnSchema = z
  .string()
  .min(1, "IAM role ARN is required")
  .regex(
    /^arn:aws:iam::\d{12}:role\/.+$/,
    "Role ARN must be in the format arn:aws:iam::account-id:role/role-name",
  );

/**
 * Lambda function handler validation
 *
 * @public
 */
export const LambdaHandlerSchema = z
  .string()
  .min(1, "Handler is required")
  .max(128, "Handler must be 128 characters or less")
  .regex(
    /^[a-zA-Z0-9._-]{1,64}\.[a-zA-Z0-9._-]{1,64}$/,
    "Handler must be in the format filename.method",
  );

/**
 * Function version validation
 *
 * @public
 */
export const LambdaVersionSchema = z.enum(["ALL", "$LATEST"]);

/**
 * Invocation type validation
 *
 * @public
 */
export const LambdaInvocationTypeSchema = z.enum(["Event", "RequestResponse", "DryRun"]);

/**
 * Log type validation
 *
 * @public
 */
export const LambdaLogTypeSchema = z.enum(["None", "Tail"]);

/**
 * Environment variables schema
 *
 * @public
 */
export const LambdaEnvironmentVariablesSchema = z
  .record(z.string(), z.string())
  .refine((environment) => {
    const totalSize = Object.entries(environment)
      .map(([key, value]) => key.length + value.length)
      .reduce((sum, size) => sum + size, 0);
    return totalSize <= 4096;
  }, "Total size of environment variables must not exceed 4 KB")
  .optional();

/**
 * VPC configuration schema
 *
 * @public
 */
export const LambdaVpcConfigSchema = z
  .object({
    subnetIds: z
      .array(z.string().regex(/^subnet-[a-f0-9]{8,17}$/, "Invalid subnet ID format"))
      .min(1, "At least one subnet ID is required")
      .max(16, "Maximum 16 subnet IDs allowed"),
    securityGroupIds: z
      .array(z.string().regex(/^sg-[a-f0-9]{8,17}$/, "Invalid security group ID format"))
      .min(1, "At least one security group ID is required")
      .max(5, "Maximum 5 security group IDs allowed"),
  })
  .optional();

/**
 * Dead letter queue configuration schema
 *
 * @public
 */
export const LambdaDeadLetterConfigSchema = z
  .object({
    targetArn: z
      .string()
      .regex(
        /^arn:aws:(sqs|sns):[a-z0-9-]+:\d{12}:.+$/,
        "Target ARN must be a valid SQS queue or SNS topic ARN",
      ),
  })
  .optional();

/**
 * Tracing configuration schema
 *
 * @public
 */
export const LambdaTracingConfigSchema = z
  .object({
    mode: z.enum(["Active", "PassThrough"]),
  })
  .optional();

/**
 * Code configuration schema for function creation
 *
 * @public
 */
export const LambdaCodeSchema = z
  .object({
    zipFile: z.string().optional(),
    s3Bucket: z.string().optional(),
    s3Key: z.string().optional(),
    s3ObjectVersion: z.string().optional(),
  })
  .refine(
    (code) => !!(code.zipFile || (code.s3Bucket && code.s3Key)),
    "Either zipFile or S3 location (bucket and key) must be provided",
  );

/**
 * Tags schema for Lambda functions
 *
 * @public
 */
export const LambdaTagsSchema = z
  .record(z.string(), z.string())
  .refine((tags) => Object.keys(tags).length <= 50, "Maximum 50 tags allowed per Lambda function")
  .optional();

/**
 * Common Lambda configuration schema
 *
 * @public
 */
export const LambdaConfigSchema = z.object({
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
  format: z.enum(["json", "jsonl", "csv", "table"]).default("table"),

  /**
   * Enable verbose logging
   */
  verbose: z.boolean().default(false),
});

/**
 * Lambda list functions schema
 *
 * @public
 */
export const LambdaListFunctionsSchema = LambdaConfigSchema.extend({
  /**
   * Function version to list
   */
  functionVersion: LambdaVersionSchema.default("$LATEST"),

  /**
   * Pagination marker for next page of results
   */
  marker: z.string().optional(),

  /**
   * Maximum number of functions to return
   */
  maxItems: z.number().int().min(1).max(10_000).optional(),

  /**
   * Master region for global functions
   */
  masterRegion: z.string().optional(),
});

/**
 * Lambda describe function schema
 *
 * @public
 */
export const LambdaDescribeFunctionSchema = LambdaConfigSchema.extend({
  /**
   * Function name or ARN
   */
  functionName: LambdaFunctionNameSchema,

  /**
   * Function version or alias
   */
  qualifier: z.string().optional(),
});

/**
 * Lambda get function configuration schema
 *
 * @public
 */
export const LambdaGetFunctionConfigurationSchema = LambdaConfigSchema.extend({
  /**
   * Function name or ARN
   */
  functionName: LambdaFunctionNameSchema,

  /**
   * Function version or alias
   */
  qualifier: z.string().optional(),
});

/**
 * Lambda invoke schema
 *
 * @public
 */
export const LambdaInvokeSchema = LambdaConfigSchema.extend({
  /**
   * Function name or ARN
   */
  functionName: LambdaFunctionNameSchema,

  /**
   * Invocation type
   */
  invocationType: LambdaInvocationTypeSchema.default("RequestResponse"),

  /**
   * Log type for synchronous invocations
   */
  logType: LambdaLogTypeSchema.default("None"),

  /**
   * Client context information
   */
  clientContext: z.string().optional(),

  /**
   * JSON payload for the function
   */
  payload: z.string().optional(),

  /**
   * Function version or alias
   */
  qualifier: z.string().optional(),
});

/**
 * Lambda create function schema
 *
 * @public
 */
export const LambdaCreateFunctionSchema = LambdaConfigSchema.extend({
  /**
   * Function name
   */
  functionName: LambdaFunctionNameSchema,

  /**
   * Runtime environment
   */
  runtime: LambdaRuntimeSchema,

  /**
   * IAM role ARN
   */
  role: LambdaRoleArnSchema,

  /**
   * Function handler
   */
  handler: LambdaHandlerSchema,

  /**
   * Function code configuration
   */
  code: LambdaCodeSchema,

  /**
   * Function description
   */
  description: z.string().max(256, "Description must be 256 characters or less").optional(),

  /**
   * Function timeout in seconds
   */
  timeout: LambdaTimeoutSchema.optional(),

  /**
   * Memory size in MB
   */
  memorySize: LambdaMemorySizeSchema.optional(),

  /**
   * Environment variables
   */
  environment: z
    .object({
      variables: LambdaEnvironmentVariablesSchema,
    })
    .optional(),

  /**
   * VPC configuration
   */
  vpcConfig: LambdaVpcConfigSchema,

  /**
   * Dead letter queue configuration
   */
  deadLetterConfig: LambdaDeadLetterConfigSchema,

  /**
   * X-Ray tracing configuration
   */
  tracingConfig: LambdaTracingConfigSchema,

  /**
   * Function tags
   */
  tags: LambdaTagsSchema,

  /**
   * Whether to publish the function version
   */
  publish: z.boolean().default(false),

  /**
   * KMS key ARN for encryption
   */
  kmsKeyArn: z.string().optional(),

  /**
   * Function layers
   */
  layers: z.array(z.string()).max(5, "Maximum 5 layers allowed").optional(),

  /**
   * Reserved concurrency limit
   */
  reservedConcurrencyLimit: z.number().int().min(0).optional(),
});

/**
 * Lambda update function code schema
 *
 * @public
 */
export const LambdaUpdateFunctionCodeSchema = LambdaConfigSchema.extend({
  /**
   * Function name or ARN
   */
  functionName: LambdaFunctionNameSchema,

  /**
   * Base64-encoded zip file content
   */
  zipFile: z.string().optional(),

  /**
   * S3 bucket name
   */
  s3Bucket: z.string().optional(),

  /**
   * S3 object key
   */
  s3Key: z.string().optional(),

  /**
   * S3 object version
   */
  s3ObjectVersion: z.string().optional(),

  /**
   * Whether to publish a new version
   */
  publish: z.boolean().default(false),

  /**
   * Perform a dry run
   */
  dryRun: z.boolean().default(false),

  /**
   * Revision ID for concurrency control
   */
  revisionId: z.string().optional(),
}).refine(
  (data) => !!(data.zipFile || (data.s3Bucket && data.s3Key)),
  "Either zipFile or S3 location (bucket and key) must be provided",
);

/**
 * Lambda update function configuration schema
 *
 * @public
 */
export const LambdaUpdateFunctionConfigurationSchema = LambdaConfigSchema.extend({
  /**
   * Function name or ARN
   */
  functionName: LambdaFunctionNameSchema,

  /**
   * IAM role ARN
   */
  role: LambdaRoleArnSchema.optional(),

  /**
   * Function handler
   */
  handler: LambdaHandlerSchema.optional().or(z.undefined()),

  /**
   * Function description
   */
  description: z
    .string()
    .max(256, "Description must be 256 characters or less")
    .optional()
    .or(z.undefined()),

  /**
   * Function timeout in seconds
   */
  timeout: LambdaTimeoutSchema.optional().or(z.undefined()),

  /**
   * Memory size in MB
   */
  memorySize: LambdaMemorySizeSchema.optional(),

  /**
   * VPC configuration
   */
  vpcConfig: LambdaVpcConfigSchema,

  /**
   * Environment variables
   */
  environment: z
    .object({
      variables: LambdaEnvironmentVariablesSchema,
    })
    .optional(),

  /**
   * Runtime environment
   */
  runtime: LambdaRuntimeSchema.optional(),

  /**
   * Dead letter queue configuration
   */
  deadLetterConfig: LambdaDeadLetterConfigSchema,

  /**
   * KMS key ARN for encryption
   */
  kmsKeyArn: z.string().optional(),

  /**
   * X-Ray tracing configuration
   */
  tracingConfig: LambdaTracingConfigSchema,

  /**
   * Revision ID for concurrency control
   */
  revisionId: z.string().optional(),

  /**
   * Function layers
   */
  layers: z.array(z.string()).max(5, "Maximum 5 layers allowed").optional(),
});

/**
 * Lambda delete function schema
 *
 * @public
 */
export const LambdaDeleteFunctionSchema = LambdaConfigSchema.extend({
  /**
   * Function name or ARN
   */
  functionName: LambdaFunctionNameSchema,

  /**
   * Function version to delete
   */
  qualifier: z.string().optional(),
});

/**
 * Lambda publish version schema
 *
 * @public
 */
export const LambdaPublishVersionSchema = LambdaConfigSchema.extend({
  /**
   * Function name or ARN
   */
  functionName: LambdaFunctionNameSchema,

  /**
   * Version description
   */
  description: z.string().max(256, "Description must be 256 characters or less").optional(),

  /**
   * Revision ID for concurrency control
   */
  revisionId: z.string().optional(),
});

/**
 * Lambda list versions schema
 *
 * @public
 */
export const LambdaListVersionsSchema = LambdaConfigSchema.extend({
  /**
   * Function name or ARN
   */
  functionName: LambdaFunctionNameSchema,

  /**
   * Pagination marker
   */
  marker: z.string().optional(),

  /**
   * Maximum number of versions to return
   */
  maxItems: z.number().int().min(1).max(10_000).optional(),
});

/**
 * Lambda create alias schema
 *
 * @public
 */
export const LambdaCreateAliasSchema = LambdaConfigSchema.extend({
  /**
   * Function name or ARN
   */
  functionName: LambdaFunctionNameSchema,

  /**
   * Alias name
   */
  name: z
    .string()
    .min(1, "Alias name is required")
    .max(128, "Alias name must be 128 characters or less")
    .regex(
      /^[a-zA-Z0-9-_]+$/,
      "Alias name can only contain letters, numbers, hyphens, and underscores",
    ),

  /**
   * Function version to point to
   */
  functionVersion: z.string().min(1, "Function version is required"),

  /**
   * Alias description
   */
  description: z.string().max(256, "Description must be 256 characters or less").optional(),

  /**
   * Routing configuration for traffic shifting
   */
  routingConfig: z
    .object({
      additionalVersionWeights: z.record(z.string(), z.number().min(0).max(1)).optional(),
    })
    .optional(),
});

// Type exports for TypeScript inference
export type LambdaListFunctions = z.infer<typeof LambdaListFunctionsSchema>;
export type LambdaDescribeFunction = z.infer<typeof LambdaDescribeFunctionSchema>;
export type LambdaGetFunctionConfiguration = z.infer<typeof LambdaGetFunctionConfigurationSchema>;
export type LambdaInvoke = z.infer<typeof LambdaInvokeSchema>;
export type LambdaCreateFunction = z.infer<typeof LambdaCreateFunctionSchema>;
export type LambdaUpdateFunctionCode = z.infer<typeof LambdaUpdateFunctionCodeSchema>;
export type LambdaUpdateFunctionConfiguration = z.infer<
  typeof LambdaUpdateFunctionConfigurationSchema
>;
export type LambdaDeleteFunction = z.infer<typeof LambdaDeleteFunctionSchema>;
export type LambdaPublishVersion = z.infer<typeof LambdaPublishVersionSchema>;
export type LambdaListVersions = z.infer<typeof LambdaListVersionsSchema>;
export type LambdaCreateAlias = z.infer<typeof LambdaCreateAliasSchema>;
