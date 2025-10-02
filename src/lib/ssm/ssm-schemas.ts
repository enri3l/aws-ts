/**
 * @module ssm-schemas
 * Core SSM Zod schemas for input validation
 *
 * Provides common validation schemas for AWS Systems Manager operations
 * with automatic TypeScript type generation and AWS naming constraints.
 */

import { z } from "zod";

/**
 * EC2 instance ID validation with AWS format constraints
 *
 * @public
 */
export const InstanceIdSchema = z
  .string()
  .min(1, "Instance ID is required")
  .regex(
    /^(i-[a-f0-9]{8,17}|mi-[a-f0-9]{16})$/,
    "Invalid instance ID format. Expected: i-{8-17 hex chars} or mi-{16 hex chars}",
  );

/**
 * SSM session ID validation
 *
 * @public
 */
export const SessionIdSchema = z
  .string()
  .min(1, "Session ID is required")
  .regex(/^[a-zA-Z0-9-]+$/, "Session ID contains invalid characters");

/**
 * SSM document name validation with AWS constraints
 *
 * @public
 */
export const DocumentNameSchema = z
  .string()
  .min(1, "Document name is required")
  .max(128, "Document name must be 128 characters or less")
  .regex(
    /^[a-zA-Z0-9_.-]+$/,
    "Document name can only contain alphanumeric characters, hyphens, underscores, and dots",
  );

/**
 * Session reason validation for audit trails
 *
 * @public
 */
export const SessionReasonSchema = z
  .string()
  .max(256, "Session reason must be 256 characters or less")
  .optional();

/**
 * SSM session state filter validation
 *
 * @public
 */
export const SessionStateSchema = z.enum(["Active", "History"]);

/**
 * Port number validation (1-65535)
 *
 * @public
 */
export const PortNumberSchema = z
  .number()
  .int("Port must be an integer")
  .min(1, "Port must be at least 1")
  .max(65_535, "Port must be at most 65535");

/**
 * Tag filter validation for SSM resources
 *
 * @public
 */
export const TagFilterSchema = z.object({
  Key: z.string().min(1, "Tag key is required"),
  Values: z.array(z.string()).min(1, "At least one tag value is required"),
});

/**
 * Instance filter validation for SSM queries
 *
 * @public
 */
export const InstanceFilterSchema = z.object({
  key: z.string().min(1, "Filter key is required"),
  values: z.array(z.string()).min(1, "At least one filter value is required"),
});
