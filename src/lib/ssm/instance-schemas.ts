/**
 * @module ssm/instance-schemas
 * Instance Manager Zod schemas for instance operations
 *
 * Provides validation schemas for SSM managed instance discovery
 * and targeting operations.
 */

import { z } from "zod";
import { AwsProfileSchema, AwsRegionSchema } from "../schemas.js";
import { InstanceFilterSchema, InstanceIdSchema } from "./ssm-schemas.js";

/**
 * Platform type filter validation
 *
 * @public
 */
export const PlatformTypeSchema = z.enum(["Windows", "Linux", "MacOS"]);

/**
 * Ping status filter validation
 *
 * @public
 */
export const PingStatusSchema = z.enum(["Online", "ConnectionLost", "Inactive"]);

/**
 * List instances input validation
 *
 * @public
 */
export const ListInstancesInputSchema = z.object({
  filters: z.array(InstanceFilterSchema).optional(),
  platformType: PlatformTypeSchema.optional(),
  pingStatus: PingStatusSchema.optional(),
  maxResults: z.number().int().min(1).max(50).optional(),
  nextToken: z.string().optional(),
  region: AwsRegionSchema,
  profile: AwsProfileSchema,
  format: z.enum(["table", "json", "jsonl", "csv"]).default("table"),
  verbose: z.boolean().optional(),
});

/**
 * List instances input type
 *
 * @public
 */
export type ListInstancesInput = z.infer<typeof ListInstancesInputSchema>;

/**
 * Describe instance input validation
 *
 * @public
 */
export const DescribeInstanceInputSchema = z.object({
  instanceId: InstanceIdSchema,
  region: AwsRegionSchema,
  profile: AwsProfileSchema,
  format: z.enum(["table", "json", "jsonl", "csv"]).default("table"),
  verbose: z.boolean().optional(),
});

/**
 * Describe instance input type
 *
 * @public
 */
export type DescribeInstanceInput = z.infer<typeof DescribeInstanceInputSchema>;
