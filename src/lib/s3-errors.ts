/**
 * @module s3-errors
 * S3-specific error types and error handling utilities
 *
 * Provides S3-specific error classes extending BaseError hierarchy
 * with comprehensive error guidance and formatting functions following
 * established patterns from DynamoDB and Lambda error systems.
 */

import { BaseError } from "./errors.js";

/**
 * Base S3 error class for all S3-related errors
 *
 * Provides S3-specific context including bucket name, object key,
 * and operation information.
 *
 * @public
 */
export class S3Error extends BaseError {
  /**
   * Create a new S3 error
   *
   * @param message - Human-readable error message
   * @param bucketName - S3 bucket name (optional)
   * @param objectKey - S3 object key (optional)
   * @param operation - S3 operation that failed (optional)
   * @param cause - Underlying error cause (optional)
   * @param metadata - Additional error context
   */
  constructor(
    message: string,
    bucketName?: string,
    objectKey?: string,
    operation?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "S3_ERROR", {
      bucketName,
      objectKey,
      operation,
      cause,
      ...metadata,
    });
  }
}

/**
 * S3 bucket-level error
 *
 * Used for errors related to bucket operations (access denied,
 * bucket not found, region mismatch, etc.)
 *
 * @public
 */
export class S3BucketError extends S3Error {
  /**
   * Create a new S3 bucket error
   *
   * @param message - Human-readable error message
   * @param bucketName - S3 bucket name
   * @param operation - S3 operation that failed (optional)
   * @param cause - Underlying error cause (optional)
   * @param metadata - Additional error context
   */
  constructor(
    message: string,
    bucketName: string,
    operation?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, bucketName, undefined, operation, cause, {
      ...metadata,
      code: "S3_BUCKET_ERROR",
    });
  }
}

/**
 * S3 object-level error
 *
 * Used for errors related to object operations (object not found,
 * invalid key, metadata issues, etc.)
 *
 * @public
 */
export class S3ObjectError extends S3Error {
  /**
   * Create a new S3 object error
   *
   * @param message - Human-readable error message
   * @param bucketName - S3 bucket name
   * @param objectKey - S3 object key
   * @param operation - S3 operation that failed (optional)
   * @param cause - Underlying error cause (optional)
   * @param metadata - Additional error context
   */
  constructor(
    message: string,
    bucketName: string,
    objectKey: string,
    operation?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, bucketName, objectKey, operation, cause, {
      ...metadata,
      code: "S3_OBJECT_ERROR",
    });
  }
}

/**
 * S3 transfer error
 *
 * Used for errors during upload/download operations (interrupted streams,
 * checksum mismatches, size violations, etc.)
 *
 * @public
 */
export class S3TransferError extends S3Error {
  /**
   * Create a new S3 transfer error
   *
   * @param message - Human-readable error message
   * @param bucketName - S3 bucket name
   * @param objectKey - S3 object key
   * @param transferType - Type of transfer (upload or download)
   * @param bytesTransferred - Number of bytes transferred before failure
   * @param totalBytes - Total number of bytes to transfer
   * @param cause - Underlying error cause (optional)
   */
  constructor(
    message: string,
    bucketName: string,
    objectKey: string,
    transferType: "upload" | "download",
    bytesTransferred: number,
    totalBytes: number,
    cause?: unknown,
  ) {
    super(message, bucketName, objectKey, `${transferType}-object`, cause, {
      transferType,
      bytesTransferred,
      totalBytes,
      percentComplete: totalBytes > 0 ? Math.round((bytesTransferred / totalBytes) * 100) : 0,
      code: "S3_TRANSFER_ERROR",
    });
  }
}

/**
 * S3 permission error
 *
 * Used for IAM permission issues specific to S3 operations
 *
 * @public
 */
export class S3PermissionError extends S3Error {
  /**
   * Create a new S3 permission error
   *
   * @param message - Human-readable error message
   * @param bucketName - S3 bucket name
   * @param objectKey - S3 object key (optional)
   * @param requiredPermissions - List of required S3 permissions
   * @param operation - S3 operation that failed (optional)
   * @param cause - Underlying error cause (optional)
   */
  constructor(
    message: string,
    bucketName: string,
    objectKey: string | undefined,
    requiredPermissions: string[],
    operation?: string,
    cause?: unknown,
  ) {
    super(message, bucketName, objectKey, operation, cause, {
      requiredPermissions,
      code: "S3_PERMISSION_ERROR",
    });
  }
}

/**
 * Type guard to check if an error is an S3 error
 *
 * @param error - The error to check
 * @returns True if the error is an S3 error type
 *
 * @public
 */
export function isS3Error(error: unknown): error is S3Error | S3BucketError | S3ObjectError {
  return (
    error instanceof S3Error ||
    error instanceof S3BucketError ||
    error instanceof S3ObjectError ||
    error instanceof S3TransferError ||
    error instanceof S3PermissionError
  );
}

/**
 * Get user-friendly guidance for S3 errors
 *
 * Provides actionable resolution steps based on error type and context.
 * Follows the Lambda error guidance pattern.
 *
 * @param error - The error to generate guidance for
 * @returns Formatted guidance message with resolution steps
 *
 * @public
 */
export function getS3ErrorGuidance(error: unknown): string {
  if (!isS3Error(error)) {
    return "Unknown S3 error. Check AWS credentials and bucket configuration.";
  }

  const bucketName = error.metadata.bucketName as string | undefined;
  const objectKey = error.metadata.objectKey as string | undefined;

  switch (error.code) {
    case "S3_BUCKET_ERROR": {
      if (error.message.includes("NoSuchBucket")) {
        return [
          `Bucket '${bucketName}' does not exist or is not accessible:`,
          "1. Verify the bucket name is correct (case-sensitive)",
          "2. Check you're using the correct AWS region",
          "3. Ensure you have s3:ListBucket permission",
          "4. S3 bucket names are globally unique across all AWS accounts",
          "",
          "Try listing accessible buckets to verify the name",
        ].join("\n");
      }
      if (error.message.includes("AccessDenied") || error.message.includes("Access Denied")) {
        return [
          `Access denied to bucket '${bucketName}':`,
          "1. Check IAM permissions (s3:ListBucket, s3:GetObject, s3:PutObject)",
          "2. Verify bucket policy allows your AWS principal",
          "3. Check for bucket ACLs that might restrict access",
          "4. Ensure you're authenticated with correct AWS profile",
          "",
          "Required permissions vary by operation - check AWS S3 documentation",
        ].join("\n");
      }
      break;
    }

    case "S3_OBJECT_ERROR": {
      if (error.message.includes("NoSuchKey")) {
        const prefixSuggestion = objectKey?.split("/")[0] || "";
        return [
          `Object '${objectKey}' not found in bucket '${bucketName}':`,
          "1. Verify the object key is correct (S3 keys are case-sensitive)",
          "2. Check if object was deleted or moved",
          "3. Ensure you're using the correct bucket",
          "4. List bucket contents to find the correct key",
          "",
          prefixSuggestion
            ? `Try: aws-ts s3 list-objects ${bucketName} --prefix ${prefixSuggestion}`
            : `Try: aws-ts s3 list-objects ${bucketName}`,
        ].join("\n");
      }
      break;
    }

    case "S3_TRANSFER_ERROR": {
      const transferType = error.metadata.transferType as string;
      return [
        `S3 ${transferType} was interrupted:`,
        "1. Check network connectivity",
        "2. Verify sufficient disk space (for downloads)",
        "3. Ensure IAM permissions are correct",
        "4. Consider using multipart upload/download for large files",
        "5. Retry the operation with --verbose for more details",
        "",
        "For large files, the CLI automatically uses multipart operations",
      ].join("\n");
    }

    case "S3_PERMISSION_ERROR": {
      const requiredPerms = error.metadata.requiredPermissions as string[];
      return [
        `Insufficient permissions for S3 operation on '${bucketName}/${objectKey || "*"}':`,
        "Required permissions:",
        ...requiredPerms.map((p) => `  - ${p}`),
        "",
        "Resolution steps:",
        "1. Add required permissions to your IAM policy",
        "2. Check bucket policy for additional restrictions",
        "3. Verify object ACLs if accessing specific objects",
        "4. Ensure you're using the correct AWS profile",
        "",
        "Run 'aws sts get-caller-identity' to verify your AWS identity",
      ].join("\n");
    }
  }

  const bucketInfo = bucketName ? ` on bucket '${bucketName}'` : "";
  return [
    `S3 operation failed${bucketInfo}:`,
    "1. Check AWS credentials and region configuration",
    "2. Verify IAM permissions for S3 operations",
    "3. Ensure bucket and object names are correct",
    "4. Review AWS S3 service quotas and limits",
    "",
    "Use --verbose flag for detailed error information",
  ].join("\n");
}

/**
 * Format S3 error for user display
 *
 * Formats S3 errors with appropriate detail level and guidance.
 * Follows the Lambda error formatting pattern.
 *
 * @param error - The error to format
 * @param verbose - Whether to include verbose error details
 * @param context - Optional context for the operation that failed
 * @returns Formatted error message with guidance
 *
 * @public
 */
export function formatS3Error(error: unknown, verbose = false, context?: string): string {
  const guidance = getS3ErrorGuidance(error);
  const contextPrefix = context ? `${context}: ` : "";

  if (error instanceof Error) {
    let message = `${contextPrefix}${error.message}`;

    if (verbose && error.stack) {
      message += `\n\nStack trace:\n${error.stack}`;
    }

    if (isS3Error(error) && verbose && error.metadata) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { cause, ...displayMetadata } = error.metadata;
      message += `\n\nContext:\n${JSON.stringify(displayMetadata, undefined, 2)}`;
    }

    return `${message}\n\n${guidance}`;
  }

  return `${contextPrefix}An unknown error occurred\n\n${guidance}`;
}
