/**
 * @module s3-schemas
 * S3-specific Zod schemas for input validation
 *
 * Provides validation schemas for S3 object commands and operations
 * with automatic TypeScript type generation following AWS S3 naming
 * and validation rules.
 */

import { z } from "zod";
import { AwsProfileSchema, AwsRegionSchema } from "./schemas.js";

/**
 * Schema for S3 bucket names following AWS naming rules
 *
 * AWS S3 bucket naming requirements:
 * - 3-63 characters
 * - Lowercase letters, numbers, hyphens, and periods
 * - Must start and end with lowercase letter or number
 * - Cannot contain consecutive periods
 * - Cannot have period adjacent to hyphen
 * - Cannot be formatted as IP address
 *
 * @public
 */
export const S3BucketNameSchema = z
  .string()
  .min(3, "Bucket name must be at least 3 characters")
  .max(63, "Bucket name must not exceed 63 characters")
  .regex(
    /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/,
    "Bucket name must start and end with lowercase letter or number",
  )
  .regex(/^(?!.*\.\.)/, "Bucket name cannot contain consecutive periods")
  .regex(/^(?!.*\.-|-\.)/, "Bucket name cannot have period adjacent to hyphen")
  .regex(
    /^(?!\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$)/,
    "Bucket name cannot be formatted as IP address",
  );

/**
 * Schema for S3 object keys
 *
 * AWS S3 object key requirements:
 * - 1-1024 characters
 * - Can contain any UTF-8 characters (URL encoded)
 * - Best practice: avoid leading slashes
 *
 * @public
 */
export const S3ObjectKeySchema = z
  .string()
  .min(1, "Object key cannot be empty")
  .max(1024, "Object key must not exceed 1024 characters")
  .refine((key) => !key.startsWith("/"), {
    message: "Object key should not start with /",
  });

/**
 * Schema for S3 storage classes
 *
 * @public
 */
export const S3StorageClassSchema = z.enum([
  "STANDARD",
  "REDUCED_REDUNDANCY",
  "STANDARD_IA",
  "ONEZONE_IA",
  "INTELLIGENT_TIERING",
  "GLACIER",
  "DEEP_ARCHIVE",
  "GLACIER_IR",
  "SNOW",
  "EXPRESS_ONEZONE",
]);

/**
 * Schema for S3 ACL permissions
 *
 * @public
 */
export const S3ACLSchema = z.enum([
  "private",
  "public-read",
  "public-read-write",
  "authenticated-read",
  "aws-exec-read",
  "bucket-owner-read",
  "bucket-owner-full-control",
]);

/**
 * Schema for S3 server-side encryption
 *
 * @public
 */
export const S3ServerSideEncryptionSchema = z.enum(["AES256", "aws:kms", "aws:kms:dsse"]);

/**
 * Common S3 configuration schema
 *
 * @public
 */
export const S3ConfigSchema = z.object({
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
  format: z.enum(["table", "json", "jsonl", "csv"]).default("table"),

  /**
   * Enable verbose output
   */
  verbose: z.boolean().default(false),
});

/**
 * Schema for S3 list objects operation parameters
 *
 * @public
 */
export const S3ListObjectsSchema = S3ConfigSchema.extend({
  /**
   * S3 bucket name
   */
  bucketName: S3BucketNameSchema,

  /**
   * Object key prefix for filtering
   */
  prefix: S3ObjectKeySchema.optional(),

  /**
   * Delimiter for grouping keys (typically '/')
   */
  delimiter: z.string().max(1).optional(),

  /**
   * Maximum number of objects to return per page
   */
  maxKeys: z.number().int().min(1).max(1000).default(1000),

  /**
   * Start listing after this key (pagination)
   */
  startAfter: S3ObjectKeySchema.optional(),
});

/**
 * Schema for S3 head object operation parameters
 *
 * @public
 */
export const S3HeadObjectSchema = S3ConfigSchema.extend({
  /**
   * S3 bucket name
   */
  bucketName: S3BucketNameSchema,

  /**
   * Object key
   */
  key: S3ObjectKeySchema,

  /**
   * Version ID for versioned objects
   */
  versionId: z.string().optional(),
});

/**
 * Schema for S3 get object operation parameters
 *
 * @public
 */
export const S3GetObjectSchema = S3ConfigSchema.extend({
  /**
   * S3 bucket name
   */
  bucketName: S3BucketNameSchema,

  /**
   * Object key
   */
  key: S3ObjectKeySchema,

  /**
   * Local output file path
   */
  outputPath: z.string().optional(),

  /**
   * Version ID for versioned objects
   */
  versionId: z.string().optional(),

  /**
   * Byte range to download (e.g., "bytes=0-1023")
   */
  range: z
    .string()
    .regex(/^bytes=\d+-\d+$/)
    .optional(),
});

/**
 * Schema for S3 put object operation parameters
 *
 * @public
 */
export const S3PutObjectSchema = S3ConfigSchema.extend({
  /**
   * S3 bucket name
   */
  bucketName: S3BucketNameSchema,

  /**
   * Object key
   */
  key: S3ObjectKeySchema,

  /**
   * Local input file path
   */
  filePath: z.string().min(1, "File path required"),

  /**
   * Content-Type (MIME type)
   */
  contentType: z.string().optional(),

  /**
   * Custom metadata
   */
  metadata: z.record(z.string(), z.string()).optional(),

  /**
   * Storage class
   */
  storageClass: S3StorageClassSchema.optional(),

  /**
   * Access control list
   */
  acl: S3ACLSchema.optional(),

  /**
   * Server-side encryption
   */
  serverSideEncryption: S3ServerSideEncryptionSchema.optional(),

  /**
   * KMS key ID for encryption
   */
  sseKmsKeyId: z.string().optional(),
});

/**
 * Schema for S3 delete object operation parameters
 *
 * @public
 */
export const S3DeleteObjectSchema = S3ConfigSchema.extend({
  /**
   * S3 bucket name
   */
  bucketName: S3BucketNameSchema,

  /**
   * Object key
   */
  key: S3ObjectKeySchema,

  /**
   * Version ID for versioned objects
   */
  versionId: z.string().optional(),
});

/**
 * Schema for S3 copy object operation parameters
 *
 * @public
 */
export const S3CopyObjectSchema = S3ConfigSchema.extend({
  /**
   * Source bucket name
   */
  sourceBucket: S3BucketNameSchema,

  /**
   * Source object key
   */
  sourceKey: S3ObjectKeySchema,

  /**
   * Destination bucket name
   */
  destBucket: S3BucketNameSchema,

  /**
   * Destination object key
   */
  destKey: S3ObjectKeySchema,

  /**
   * Source version ID for versioned objects
   */
  sourceVersionId: z.string().optional(),

  /**
   * Metadata directive (COPY or REPLACE)
   */
  metadataDirective: z.enum(["COPY", "REPLACE"]).optional(),

  /**
   * Storage class for destination
   */
  storageClass: S3StorageClassSchema.optional(),

  /**
   * ACL for destination
   */
  acl: S3ACLSchema.optional(),
});

// Type exports for TypeScript
export type S3BucketName = z.infer<typeof S3BucketNameSchema>;
export type S3ObjectKey = z.infer<typeof S3ObjectKeySchema>;
export type S3StorageClass = z.infer<typeof S3StorageClassSchema>;
export type S3ACL = z.infer<typeof S3ACLSchema>;
export type S3ServerSideEncryption = z.infer<typeof S3ServerSideEncryptionSchema>;
export type S3Config = z.infer<typeof S3ConfigSchema>;
export type S3ListObjectsInput = z.infer<typeof S3ListObjectsSchema>;
export type S3HeadObjectInput = z.infer<typeof S3HeadObjectSchema>;
export type S3GetObjectInput = z.infer<typeof S3GetObjectSchema>;
export type S3PutObjectInput = z.infer<typeof S3PutObjectSchema>;
export type S3DeleteObjectInput = z.infer<typeof S3DeleteObjectSchema>;
export type S3CopyObjectInput = z.infer<typeof S3CopyObjectSchema>;
