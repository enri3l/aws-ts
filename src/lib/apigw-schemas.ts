/**
 * API Gateway-specific Zod schemas for input validation
 *
 * Provides validation schemas for API Gateway commands
 * and operations with automatic TypeScript type generation.
 *
 */

import { z } from "zod";
import { AwsProfileSchema, AwsRegionSchema } from "./schemas.js";

/**
 * Schema for API Gateway API ID validation
 *
 * @public
 */
export const ApiIdSchema = z
  .string()
  .min(1, "API ID is required")
  .max(128, "API ID must be 128 characters or less")
  .regex(/^[a-zA-Z0-9]+$/, "API ID must contain only alphanumeric characters");

/**
 * Schema for API Gateway API types
 *
 * @public
 */
export const ApiTypeSchema = z
  .enum(["rest", "http", "websocket"])
  .describe("rest=REST API, http=HTTP API, websocket=WebSocket API");

/**
 * Schema for API Gateway API name validation
 *
 * @public
 */
export const ApiNameSchema = z
  .string()
  .min(1, "API name is required")
  .max(128, "API name must be 128 characters or less")
  .regex(
    /^[a-zA-Z0-9.\-_]+$/,
    "API name can only contain letters, numbers, dots, hyphens, and underscores",
  );

/**
 * Schema for API Gateway stage names
 *
 * @public
 */
export const StageNameSchema = z
  .string()
  .min(1, "Stage name is required")
  .max(128, "Stage name must be 128 characters or less")
  .regex(
    /^[a-zA-Z0-9\-_.]+$/,
    "Stage name can only contain letters, numbers, hyphens, underscores, and dots",
  );

/**
 * Schema for API Gateway protocol types
 *
 * @public
 */
export const ProtocolTypeSchema = z
  .enum(["HTTP", "WEBSOCKET"])
  .describe("HTTP=HTTP API, WEBSOCKET=WebSocket API");

/**
 * Schema for API Gateway endpoint types
 *
 * @public
 */
export const EndpointTypeSchema = z
  .enum(["EDGE", "REGIONAL", "PRIVATE"])
  .describe("EDGE=Edge-optimized, REGIONAL=Regional, PRIVATE=Private");

/**
 * Common API Gateway configuration schema
 *
 * @public
 */
export const ApiGwConfigSchema = z.object({
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

  /**
   * Maximum number of items to return
   */
  maxItems: z.number().int().min(1).max(1000).optional(),
});

/**
 * API Gateway list APIs command schema
 *
 * @public
 */
export const ApiGwListApisSchema = ApiGwConfigSchema.pick({
  region: true,
  profile: true,
  format: true,
  verbose: true,
  maxItems: true,
}).extend({
  /**
   * Filter APIs by type
   */
  type: ApiTypeSchema.optional(),

  /**
   * Position token for pagination
   */
  position: z.string().optional(),
});

/**
 * API Gateway describe API command schema
 *
 * @public
 */
export const ApiGwDescribeApiSchema = ApiGwConfigSchema.pick({
  region: true,
  profile: true,
  format: true,
  verbose: true,
}).extend({
  /**
   * API ID to describe
   */
  apiId: ApiIdSchema,

  /**
   * API type hint for optimal client selection
   */
  type: ApiTypeSchema.optional(),

  /**
   * Include additional metadata (stages, resources, etc.)
   */
  includeMetadata: z.boolean().default(false),
});

/**
 * API Gateway get API configuration command schema
 *
 * @public
 */
export const ApiGwGetApiConfigSchema = ApiGwConfigSchema.pick({
  region: true,
  profile: true,
  format: true,
  verbose: true,
}).extend({
  /**
   * API ID to get configuration for
   */
  apiId: ApiIdSchema,

  /**
   * API type hint for optimal client selection
   */
  type: ApiTypeSchema.optional(),

  /**
   * Include stage configurations
   */
  includeStages: z.boolean().default(true),

  /**
   * Include resource and method configurations (REST APIs only)
   */
  includeResources: z.boolean().default(true),

  /**
   * Include route configurations (HTTP/WebSocket APIs only)
   */
  includeRoutes: z.boolean().default(true),

  /**
   * Include integration configurations
   */
  includeIntegrations: z.boolean().default(true),

  /**
   * Include authorizer configurations
   */
  includeAuthorizers: z.boolean().default(true),

  /**
   * Include CORS configuration
   */
  includeCors: z.boolean().default(true),
});

/**
 * Schema for API Gateway stage configuration
 *
 * @public
 */
export const StageConfigSchema = z.object({
  /**
   * Stage name
   */
  stageName: StageNameSchema,

  /**
   * Stage description
   */
  description: z.string().optional(),

  /**
   * Deployment ID
   */
  deploymentId: z.string().optional(),

  /**
   * Stage variables
   */
  variables: z.record(z.string(), z.string()).optional(),

  /**
   * Throttling settings
   */
  throttleSettings: z
    .object({
      rateLimit: z.number().optional(),
      burstLimit: z.number().optional(),
    })
    .optional(),

  /**
   * Caching enabled
   */
  cachingEnabled: z.boolean().optional(),
});

/**
 * Schema for unified API response (for list operations)
 *
 * @public
 */
export const UnifiedApiSchema = z.object({
  /**
   * API ID
   */
  id: ApiIdSchema,

  /**
   * API name
   */
  name: ApiNameSchema,

  /**
   * API type
   */
  type: ApiTypeSchema,

  /**
   * API description
   */
  description: z.string().optional(),

  /**
   * API endpoint URL
   */
  endpoint: z.url().optional(),

  /**
   * Protocol type (for HTTP/WebSocket APIs)
   */
  protocolType: ProtocolTypeSchema.optional(),

  /**
   * Endpoint type
   */
  endpointType: EndpointTypeSchema.optional(),

  /**
   * Creation date
   */
  createdDate: z.date().optional(),

  /**
   * API version
   */
  version: z.string().optional(),

  /**
   * API status
   */
  apiKeySource: z.string().optional(),

  /**
   * Default stage name
   */
  defaultStageName: z.string().optional(),
});

/**
 * Schema for API pagination parameters
 *
 * @public
 */
export const ApiPaginationSchema = z.object({
  /**
   * Position token for next page
   */
  position: z.string().optional(),

  /**
   * Maximum items per page
   */
  limit: z.number().int().min(1).max(500).default(25),
});

/**
 * Schema for API filtering parameters
 *
 * @public
 */
export const ApiFilterSchema = z.object({
  /**
   * Filter by API type
   */
  type: ApiTypeSchema.optional(),

  /**
   * Filter by API name pattern
   */
  namePattern: z.string().optional(),

  /**
   * Filter by endpoint type
   */
  endpointType: EndpointTypeSchema.optional(),

  /**
   * Filter by protocol type
   */
  protocolType: ProtocolTypeSchema.optional(),
});

/**
 * Schema for error responses from API Gateway operations
 *
 * @public
 */
export const ApiGwErrorSchema = z.object({
  /**
   * Error code
   */
  code: z.string(),

  /**
   * Error message
   */
  message: z.string(),

  /**
   * API ID that caused the error (if applicable)
   */
  apiId: ApiIdSchema.optional(),

  /**
   * Operation that failed
   */
  operation: z.string().optional(),

  /**
   * Additional error details
   */
  details: z.record(z.string(), z.unknown()).optional(),
});

// Type exports for TypeScript inference
export type ApiGwListApis = z.infer<typeof ApiGwListApisSchema>;
export type ApiGwDescribeApi = z.infer<typeof ApiGwDescribeApiSchema>;
export type ApiGwGetApiConfig = z.infer<typeof ApiGwGetApiConfigSchema>;
export type ApiGwConfig = z.infer<typeof ApiGwConfigSchema>;
export type ApiId = z.infer<typeof ApiIdSchema>;
export type ApiType = z.infer<typeof ApiTypeSchema>;
export type ApiName = z.infer<typeof ApiNameSchema>;
export type StageName = z.infer<typeof StageNameSchema>;
export type ProtocolType = z.infer<typeof ProtocolTypeSchema>;
export type EndpointType = z.infer<typeof EndpointTypeSchema>;
export type StageConfig = z.infer<typeof StageConfigSchema>;
export type UnifiedApi = z.infer<typeof UnifiedApiSchema>;
export type ApiPagination = z.infer<typeof ApiPaginationSchema>;
export type ApiFilter = z.infer<typeof ApiFilterSchema>;
export type ApiGwError = z.infer<typeof ApiGwErrorSchema>;

/**
 * Validation helper functions for API Gateway operations
 */

/**
 * Validate API ID format and constraints
 *
 * @param apiId - API ID to validate
 * @returns Validated API ID
 * @throws When API ID validation fails
 *
 * @public
 */
export function validateApiId(apiId: string): ApiId {
  const result = ApiIdSchema.safeParse(apiId);

  if (!result.success) {
    const errors = result.error.issues.map((issue) => issue.message).join("; ");
    throw new Error(`Invalid API ID: ${errors}`);
  }

  return result.data;
}

/**
 * Validate and normalize API type
 *
 * @param apiType - API type to validate
 * @returns Validated API type
 * @throws When API type validation fails
 *
 * @public
 */
export function validateApiType(apiType: string): ApiType {
  const normalizedType = apiType.toLowerCase();
  const result = ApiTypeSchema.safeParse(normalizedType);

  if (!result.success) {
    throw new Error(`Invalid API type: ${apiType}. Must be one of: rest, http, websocket`);
  }

  return result.data;
}

/**
 * Create command-specific validation for API Gateway operations
 *
 * @param commandFlags - Command flags to validate
 * @param schema - Specific schema to use for validation
 * @returns Validated command input
 * @throws When validation fails
 *
 * @public
 */
export function validateApiGwCommand<T>(commandFlags: unknown, schema: z.ZodSchema<T>): T {
  const result = schema.safeParse(commandFlags);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
        return `${path}${issue.message}`;
      })
      .join("; ");
    throw new Error(`Command validation failed: ${errors}`);
  }

  return result.data;
}

/**
 * Determine API type from API metadata for proper client selection
 *
 * @param apiMetadata - API metadata from AWS responses
 * @returns Detected API type
 * @throws When API type cannot be determined
 *
 * @public
 */
export function detectApiType(apiMetadata: {
  protocolType?: string | undefined;
  apiGatewayManaged?: boolean | undefined;
  endpointConfiguration?: { types?: string[] | undefined } | undefined;
}): ApiType {
  // HTTP APIs have protocolType field
  if (apiMetadata.protocolType === "HTTP") {
    return "http";
  }

  // WebSocket APIs have protocolType field set to WEBSOCKET
  if (apiMetadata.protocolType === "WEBSOCKET") {
    return "websocket";
  }

  // REST APIs don't have protocolType but have endpointConfiguration
  if (apiMetadata.endpointConfiguration || !apiMetadata.protocolType) {
    return "rest";
  }

  throw new Error(`Unable to determine API type from metadata: ${JSON.stringify(apiMetadata)}`);
}
