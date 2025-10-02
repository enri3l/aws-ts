/**
 * @module ssm/parameter-schemas
 * Parameter Store Zod schemas for parameter operations
 *
 * Provides validation schemas for SSM Parameter Store operations
 * with hierarchical path support and type validation.
 */

import { z } from "zod";
import { AwsProfileSchema, AwsRegionSchema } from "../schemas.js";

/**
 * Parameter name validation with hierarchical path constraints
 *
 * @public
 */
export const ParameterNameSchema = z
  .string()
  .min(1, "Parameter name is required")
  .max(2048, "Parameter name must be 2048 characters or less")
  .regex(
    /^\/[a-zA-Z0-9/_.-]+$/,
    "Parameter name must start with / and contain only alphanumeric characters, slashes, underscores, hyphens, and dots",
  )
  .refine((name) => !name.includes("//"), {
    message: "Parameter name cannot contain consecutive slashes",
  })
  .refine((name) => name.split("/").length <= 16, {
    message: "Parameter hierarchy depth must not exceed 15 levels",
  });

/**
 * Parameter value validation with size constraints
 *
 * @public
 */
export const ParameterValueSchema = z
  .string()
  .refine((value) => Buffer.byteLength(value, "utf8") <= 4096, {
    message: "Parameter value must be 4096 bytes or less for Standard tier",
  });

/**
 * Parameter type validation
 *
 * @public
 */
export const ParameterTypeSchema = z.enum(["String", "StringList", "SecureString"]);

/**
 * Parameter tier validation
 *
 * @public
 */
export const ParameterTierSchema = z.enum(["Standard", "Advanced", "Intelligent-Tiering"]);

/**
 * Get parameter input validation
 *
 * @public
 */
export const GetParameterInputSchema = z.object({
  name: ParameterNameSchema,
  withDecryption: z.boolean().default(false),
  region: AwsRegionSchema,
  profile: AwsProfileSchema,
  format: z.enum(["table", "json", "jsonl", "csv"]).default("table"),
  verbose: z.boolean().optional(),
});

/**
 * Get parameter input type
 *
 * @public
 */
export type GetParameterInput = z.infer<typeof GetParameterInputSchema>;

/**
 * Put parameter input validation
 *
 * @public
 */
export const PutParameterInputSchema = z.object({
  name: ParameterNameSchema,
  value: ParameterValueSchema,
  type: ParameterTypeSchema.default("String"),
  description: z.string().max(1024, "Description must be 1024 characters or less").optional(),
  keyId: z.string().optional(),
  overwrite: z.boolean().default(false),
  tier: ParameterTierSchema.default("Standard"),
  region: AwsRegionSchema,
  profile: AwsProfileSchema,
  verbose: z.boolean().optional(),
});

/**
 * Put parameter input type
 *
 * @public
 */
export type PutParameterInput = z.infer<typeof PutParameterInputSchema>;

/**
 * Delete parameter input validation
 *
 * @public
 */
export const DeleteParameterInputSchema = z.object({
  name: ParameterNameSchema,
  region: AwsRegionSchema,
  profile: AwsProfileSchema,
  verbose: z.boolean().optional(),
});

/**
 * Delete parameter input type
 *
 * @public
 */
export type DeleteParameterInput = z.infer<typeof DeleteParameterInputSchema>;

/**
 * List parameters input validation
 *
 * @public
 */
export const ListParametersInputSchema = z.object({
  path: z.string().regex(/^\//, "Path must start with /").optional(),
  recursive: z.boolean().default(false),
  maxResults: z.number().int().min(1).max(50).optional(),
  nextToken: z.string().optional(),
  region: AwsRegionSchema,
  profile: AwsProfileSchema,
  format: z.enum(["table", "json", "jsonl", "csv"]).default("table"),
  verbose: z.boolean().optional(),
});

/**
 * List parameters input type
 *
 * @public
 */
export type ListParametersInput = z.infer<typeof ListParametersInputSchema>;

/**
 * Get parameter history input validation
 *
 * @public
 */
export const GetParameterHistoryInputSchema = z.object({
  name: ParameterNameSchema,
  withDecryption: z.boolean().default(false),
  maxResults: z.number().int().min(1).max(50).optional(),
  nextToken: z.string().optional(),
  region: AwsRegionSchema,
  profile: AwsProfileSchema,
  format: z.enum(["table", "json", "jsonl", "csv"]).default("table"),
  verbose: z.boolean().optional(),
});

/**
 * Get parameter history input type
 *
 * @public
 */
export type GetParameterHistoryInput = z.infer<typeof GetParameterHistoryInputSchema>;
