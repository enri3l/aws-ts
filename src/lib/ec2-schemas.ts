/**
 * EC2-specific Zod schemas for input validation
 *
 * Provides validation schemas for EC2 commands and operations
 * with automatic TypeScript type generation.
 *
 * @module ec2-schemas
 */

import { z } from "zod";
import { AwsProfileSchema, AwsRegionSchema, OutputFormatSchema } from "./schemas.js";

/**
 * EC2 instance ID validation with AWS format constraints
 *
 * @remarks
 * Instance IDs follow the format: i-[8-17 hexadecimal characters]
 * Example: i-1234567890abcdef0
 *
 * @public
 */
export const EC2InstanceIdSchema = z
  .string()
  .regex(/^i-[a-f0-9]{8,17}$/, "Invalid EC2 instance ID format (expected i-xxxxxxxxx)");

/**
 * EC2 instance state validation for lifecycle states
 *
 * @public
 */
export const EC2InstanceStateSchema = z.enum([
  "pending",
  "running",
  "shutting-down",
  "terminated",
  "stopping",
  "stopped",
]);

/**
 * EC2 instance type validation
 *
 * @remarks
 * Instance types follow the format: family.size (e.g., t2.micro, m5.large)
 *
 * @public
 */
export const EC2InstanceTypeSchema = z
  .string()
  .regex(
    /^[a-z0-9]+\.[a-z0-9]+$/,
    "Invalid instance type format (expected family.size, e.g., t2.micro)",
  );

/**
 * EC2 instance attribute name validation
 *
 * @public
 */
export const EC2InstanceAttributeSchema = z.enum([
  "instanceType",
  "kernel",
  "ramdisk",
  "userData",
  "disableApiTermination",
  "instanceInitiatedShutdownBehavior",
  "rootDeviceName",
  "blockDeviceMapping",
  "productCodes",
  "sourceDestCheck",
  "groupSet",
  "ebsOptimized",
  "sriovNetSupport",
  "enaSupport",
]);

/**
 * Schema for EC2 filter specification
 *
 * @remarks
 * Filters use AWS filter syntax: Name=filter-name,Values=value1,value2
 *
 * @public
 */
export const EC2FilterSchema = z.object({
  Name: z.string().min(1, "Filter name is required"),
  Values: z.array(z.string()).min(1, "At least one filter value is required"),
});

/**
 * Schema for instance IDs array parameter
 *
 * @public
 */
export const EC2InstanceIdsSchema = z
  .array(EC2InstanceIdSchema)
  .min(1, "At least one instance ID is required")
  .max(100, "Maximum 100 instance IDs allowed per request");

/**
 * Schema for describe-instances command input
 *
 * @public
 */
export const EC2DescribeInstancesInputSchema = z.object({
  region: AwsRegionSchema.optional(),
  profile: AwsProfileSchema.optional(),
  instanceIds: z.array(EC2InstanceIdSchema).optional(),
  filters: z.array(EC2FilterSchema).optional(),
  maxResults: z.number().int().min(5).max(1000).optional(),
  nextToken: z.string().optional(),
  format: OutputFormatSchema,
  verbose: z.boolean().default(false),
});

/**
 * Inferred TypeScript type for describe-instances input
 *
 * @public
 */
export type EC2DescribeInstancesInput = z.infer<typeof EC2DescribeInstancesInputSchema>;

/**
 * Schema for describe-instance-status command input
 *
 * @public
 */
export const EC2DescribeInstanceStatusInputSchema = z.object({
  region: AwsRegionSchema.optional(),
  profile: AwsProfileSchema.optional(),
  instanceIds: z.array(EC2InstanceIdSchema).optional(),
  includeAllInstances: z.boolean().default(false),
  filters: z.array(EC2FilterSchema).optional(),
  maxResults: z.number().int().min(5).max(1000).optional(),
  nextToken: z.string().optional(),
  format: OutputFormatSchema,
  verbose: z.boolean().default(false),
});

/**
 * Inferred TypeScript type for describe-instance-status input
 *
 * @public
 */
export type EC2DescribeInstanceStatusInput = z.infer<typeof EC2DescribeInstanceStatusInputSchema>;

/**
 * Schema for get-console-output command input
 *
 * @public
 */
export const EC2GetConsoleOutputInputSchema = z.object({
  region: AwsRegionSchema.optional(),
  profile: AwsProfileSchema.optional(),
  instanceId: EC2InstanceIdSchema,
  latest: z.boolean().default(false),
  format: OutputFormatSchema,
  verbose: z.boolean().default(false),
});

/**
 * Inferred TypeScript type for get-console-output input
 *
 * @public
 */
export type EC2GetConsoleOutputInput = z.infer<typeof EC2GetConsoleOutputInputSchema>;

/**
 * Schema for start-instances command input
 *
 * @public
 */
export const EC2StartInstancesInputSchema = z.object({
  region: AwsRegionSchema.optional(),
  profile: AwsProfileSchema.optional(),
  instanceIds: EC2InstanceIdsSchema,
  wait: z.boolean().default(false),
  format: OutputFormatSchema,
  verbose: z.boolean().default(false),
});

/**
 * Inferred TypeScript type for start-instances input
 *
 * @public
 */
export type EC2StartInstancesInput = z.infer<typeof EC2StartInstancesInputSchema>;

/**
 * Schema for stop-instances command input
 *
 * @public
 */
export const EC2StopInstancesInputSchema = z.object({
  region: AwsRegionSchema.optional(),
  profile: AwsProfileSchema.optional(),
  instanceIds: EC2InstanceIdsSchema,
  force: z.boolean().default(false),
  wait: z.boolean().default(false),
  format: OutputFormatSchema,
  verbose: z.boolean().default(false),
});

/**
 * Inferred TypeScript type for stop-instances input
 *
 * @public
 */
export type EC2StopInstancesInput = z.infer<typeof EC2StopInstancesInputSchema>;

/**
 * Schema for reboot-instances command input
 *
 * @public
 */
export const EC2RebootInstancesInputSchema = z.object({
  region: AwsRegionSchema.optional(),
  profile: AwsProfileSchema.optional(),
  instanceIds: EC2InstanceIdsSchema,
  format: OutputFormatSchema,
  verbose: z.boolean().default(false),
});

/**
 * Inferred TypeScript type for reboot-instances input
 *
 * @public
 */
export type EC2RebootInstancesInput = z.infer<typeof EC2RebootInstancesInputSchema>;

/**
 * Schema for terminate-instances command input
 *
 * @public
 */
export const EC2TerminateInstancesInputSchema = z.object({
  region: AwsRegionSchema.optional(),
  profile: AwsProfileSchema.optional(),
  instanceIds: EC2InstanceIdsSchema,
  wait: z.boolean().default(false),
  format: OutputFormatSchema,
  verbose: z.boolean().default(false),
});

/**
 * Inferred TypeScript type for terminate-instances input
 *
 * @public
 */
export type EC2TerminateInstancesInput = z.infer<typeof EC2TerminateInstancesInputSchema>;

/**
 * Schema for monitor-instances command input
 *
 * @public
 */
export const EC2MonitorInstancesInputSchema = z.object({
  region: AwsRegionSchema.optional(),
  profile: AwsProfileSchema.optional(),
  instanceIds: EC2InstanceIdsSchema,
  format: OutputFormatSchema,
  verbose: z.boolean().default(false),
});

/**
 * Inferred TypeScript type for monitor-instances input
 *
 * @public
 */
export type EC2MonitorInstancesInput = z.infer<typeof EC2MonitorInstancesInputSchema>;

/**
 * Schema for unmonitor-instances command input
 *
 * @public
 */
export const EC2UnmonitorInstancesInputSchema = z.object({
  region: AwsRegionSchema.optional(),
  profile: AwsProfileSchema.optional(),
  instanceIds: EC2InstanceIdsSchema,
  format: OutputFormatSchema,
  verbose: z.boolean().default(false),
});

/**
 * Inferred TypeScript type for unmonitor-instances input
 *
 * @public
 */
export type EC2UnmonitorInstancesInput = z.infer<typeof EC2UnmonitorInstancesInputSchema>;

/**
 * Schema for describe-instance-attribute command input
 *
 * @public
 */
export const EC2DescribeInstanceAttributeInputSchema = z.object({
  region: AwsRegionSchema.optional(),
  profile: AwsProfileSchema.optional(),
  instanceId: EC2InstanceIdSchema,
  attribute: EC2InstanceAttributeSchema,
  format: OutputFormatSchema,
  verbose: z.boolean().default(false),
});

/**
 * Inferred TypeScript type for describe-instance-attribute input
 *
 * @public
 */
export type EC2DescribeInstanceAttributeInput = z.infer<
  typeof EC2DescribeInstanceAttributeInputSchema
>;

/**
 * Schema for modify-instance-attribute command input
 *
 * @public
 */
export const EC2ModifyInstanceAttributeInputSchema = z.object({
  region: AwsRegionSchema.optional(),
  profile: AwsProfileSchema.optional(),
  instanceId: EC2InstanceIdSchema,
  attribute: EC2InstanceAttributeSchema,
  value: z.string().optional(),
  format: OutputFormatSchema,
  verbose: z.boolean().default(false),
});

/**
 * Inferred TypeScript type for modify-instance-attribute input
 *
 * @public
 */
export type EC2ModifyInstanceAttributeInput = z.infer<typeof EC2ModifyInstanceAttributeInputSchema>;

/**
 * Schema for reset-instance-attribute command input
 *
 * @public
 */
export const EC2ResetInstanceAttributeInputSchema = z.object({
  region: AwsRegionSchema.optional(),
  profile: AwsProfileSchema.optional(),
  instanceId: EC2InstanceIdSchema,
  attribute: z.enum(["kernel", "ramdisk", "sourceDestCheck"]),
  format: OutputFormatSchema,
  verbose: z.boolean().default(false),
});

/**
 * Inferred TypeScript type for reset-instance-attribute input
 *
 * @public
 */
export type EC2ResetInstanceAttributeInput = z.infer<typeof EC2ResetInstanceAttributeInputSchema>;

/**
 * Parse AWS filter string into EC2FilterSchema format
 *
 * @param filterString - Filter string in format "Name=name,Values=val1,val2"
 * @returns Parsed filter object
 * @throws Error if filter format is invalid or missing required Name/Values
 *
 * @remarks
 * Supports AWS CLI filter syntax for EC2 operations
 *
 * @example
 * ```typescript
 * parseFilterString("Name=instance-state-name,Values=running,stopped")
 * // Returns: { Name: "instance-state-name", Values: ["running", "stopped"] }
 * ```
 *
 * @public
 */
export function parseFilterString(filterString: string): z.infer<typeof EC2FilterSchema> {
  const parts = filterString.split(",");
  const filter: { Name?: string; Values: string[] } = { Values: [] };

  for (const part of parts) {
    if (part.startsWith("Name=")) {
      filter.Name = part.slice(5);
    } else if (part.startsWith("Values=")) {
      filter.Values = part.slice(7).split(",");
    }
  }

  if (!filter.Name || filter.Values.length === 0) {
    throw new Error('Invalid filter format. Expected: "Name=filter-name,Values=value1,value2"');
  }

  return EC2FilterSchema.parse(filter);
}
