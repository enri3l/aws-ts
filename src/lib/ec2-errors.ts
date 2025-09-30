/**
 * EC2-specific error types for AWS EC2 operations
 *
 * Extends the base error system with EC2-specific error handling
 * for instance management, lifecycle operations, and configuration updates.
 *
 * @module ec2-errors
 */

import { BaseError } from "./errors.js";

/**
 * EC2 instance error for EC2 instance operation failures
 *
 * Used when EC2 instance operations fail, including instance lifecycle
 * operations, configuration updates, and status queries.
 *
 * @public
 */
export class EC2InstanceError extends BaseError {
  /**
   * Create a new EC2 instance error
   *
   * @param message - User-friendly error message
   * @param instanceId - The EC2 instance that encountered the error
   * @param operation - The instance operation that failed
   * @param cause - The underlying error that caused the failure
   * @param metadata - Additional instance context
   */
  constructor(
    message: string,
    instanceId?: string,
    operation?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "EC2_INSTANCE_ERROR", {
      instanceId,
      operation,
      cause,
      ...metadata,
    });
  }
}

/**
 * Instance state error for invalid state transition operations
 *
 * Used when attempting operations that are invalid for the current
 * instance state (e.g., stopping an already stopped instance).
 *
 * @public
 */
export class InstanceStateError extends BaseError {
  /**
   * Create a new instance state error
   *
   * @param message - User-friendly state error message
   * @param instanceId - The EC2 instance with invalid state
   * @param currentState - The current state of the instance
   * @param expectedState - The expected state for the operation
   * @param operation - The operation that failed
   * @param metadata - Additional state context
   */
  constructor(
    message: string,
    instanceId?: string,
    currentState?: string,
    expectedState?: string,
    operation?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "INSTANCE_STATE_ERROR", {
      instanceId,
      currentState,
      expectedState,
      operation,
      ...metadata,
    });
  }
}

/**
 * Instance operation error for batch operation failures
 *
 * Used when batch operations on multiple instances fail, including
 * partial failures where some instances succeed and others fail.
 *
 * @public
 */
export class InstanceOperationError extends BaseError {
  /**
   * Create a new instance operation error
   *
   * @param message - User-friendly operation error message
   * @param instanceIds - The EC2 instances involved in the operation
   * @param operation - The batch operation that failed
   * @param failedInstances - The instances that failed
   * @param successfulInstances - The instances that succeeded
   * @param metadata - Additional operation context
   */
  constructor(
    message: string,
    instanceIds?: string[],
    operation?: string,
    failedInstances?: string[],
    successfulInstances?: string[],
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "INSTANCE_OPERATION_ERROR", {
      instanceIds,
      operation,
      failedInstances,
      successfulInstances,
      ...metadata,
    });
  }
}

/**
 * Instance attribute error for attribute operation failures
 *
 * Used when instance attribute operations fail, including describe,
 * modify, and reset operations on instance attributes.
 *
 * @public
 */
export class InstanceAttributeError extends BaseError {
  /**
   * Create a new instance attribute error
   *
   * @param message - User-friendly attribute error message
   * @param instanceId - The EC2 instance with attribute issues
   * @param attribute - The attribute that caused the error
   * @param operation - The attribute operation that failed
   * @param metadata - Additional attribute context
   */
  constructor(
    message: string,
    instanceId?: string,
    attribute?: string,
    operation?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "INSTANCE_ATTRIBUTE_ERROR", {
      instanceId,
      attribute,
      operation,
      ...metadata,
    });
  }
}

/**
 * EC2 permission error for IAM and permission failures
 *
 * Used when EC2 operations fail due to insufficient permissions,
 * invalid IAM roles, or resource access issues.
 *
 * @public
 */
export class EC2PermissionError extends BaseError {
  /**
   * Create a new EC2 permission error
   *
   * @param message - User-friendly permission error message
   * @param instanceId - The EC2 instance that encountered permission issues
   * @param operation - The operation that failed due to permissions
   * @param requiredPermissions - The permissions that are required
   * @param metadata - Additional permission context
   */
  constructor(
    message: string,
    instanceId?: string,
    operation?: string,
    requiredPermissions?: string[],
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "EC2_PERMISSION_ERROR", {
      instanceId,
      operation,
      requiredPermissions,
      ...metadata,
    });
  }
}

/**
 * Instance monitoring error for CloudWatch monitoring operation failures
 *
 * Used when enabling or disabling detailed CloudWatch monitoring fails
 * for EC2 instances.
 *
 * @public
 */
export class InstanceMonitoringError extends BaseError {
  /**
   * Create a new instance monitoring error
   *
   * @param message - User-friendly monitoring error message
   * @param instanceIds - The EC2 instances involved in the monitoring operation
   * @param operation - The monitoring operation that failed (enable/disable)
   * @param metadata - Additional monitoring context
   */
  constructor(
    message: string,
    instanceIds?: string[],
    operation?: "enable" | "disable",
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "INSTANCE_MONITORING_ERROR", {
      instanceIds,
      operation,
      ...metadata,
    });
  }
}

/**
 * Get user-friendly error guidance for EC2 errors
 *
 * Provides contextual guidance based on the error type to help users
 * resolve EC2-related issues quickly.
 *
 * @param error - The error to provide guidance for
 * @returns Formatted error guidance string
 *
 * @public
 */
export function getEC2ErrorGuidance(error: unknown): string {
  if (!(error instanceof BaseError)) {
    return "An unexpected error occurred. Please try again or contact support.";
  }

  const guidance: string[] = [error.message, ""];

  switch (error.code) {
    case "INSTANCE_STATE_ERROR": {
      guidance.push(
        "Resolution steps:",
        "1. Check current instance state using describe-instances",
        "2. Verify the instance is in the correct state for this operation",
        "3. Valid state transitions:",
        "   - Start: stopped → running",
        "   - Stop: running → stopped",
        "   - Reboot: running → running",
        "   - Terminate: any state → terminated",
        "4. Wait for ongoing state transitions to complete",
      );
      break;
    }

    case "EC2_PERMISSION_ERROR": {
      guidance.push(
        "Resolution steps:",
        "1. Verify your IAM user/role has the required EC2 permissions",
        "2. Check your current identity: aws sts get-caller-identity",
        "3. Required permissions may include:",
        "   - ec2:DescribeInstances",
        "   - ec2:DescribeInstanceStatus",
        "   - ec2:StartInstances",
        "   - ec2:StopInstances",
        "   - ec2:RebootInstances",
        "   - ec2:TerminateInstances",
        "4. Contact your AWS administrator if permissions are restricted",
      );
      break;
    }

    case "INSTANCE_OPERATION_ERROR": {
      guidance.push(
        "Resolution steps:",
        "1. Review the partial failure details above",
        "2. Retry the operation for failed instances only",
        "3. Check instance states before retrying",
        "4. Verify network connectivity to AWS API",
        "5. Consider implementing exponential backoff for retries",
      );
      break;
    }

    case "INSTANCE_ATTRIBUTE_ERROR": {
      guidance.push(
        "Resolution steps:",
        "1. Verify the attribute name is valid for the instance type",
        "2. Check if the attribute is modifiable for this instance",
        "3. Some attributes can only be modified when instance is stopped",
        "4. Refer to AWS documentation for attribute compatibility",
      );
      break;
    }

    case "INSTANCE_MONITORING_ERROR": {
      guidance.push(
        "Resolution steps:",
        "1. Verify instances are in a valid state for monitoring changes",
        "2. Check IAM permissions for CloudWatch monitoring",
        "3. Note: Detailed monitoring incurs additional costs",
        "4. Basic monitoring is enabled by default at no extra charge",
      );
      break;
    }

    case "EC2_INSTANCE_ERROR": {
      guidance.push(
        "Resolution steps:",
        "1. Verify the instance ID is correct and exists in the region",
        "2. Check if the instance has been terminated",
        "3. Ensure you're using the correct AWS region",
        "4. Review CloudWatch Logs for additional error details",
      );
      break;
    }

    default: {
      guidance.push(
        "General troubleshooting:",
        "1. Verify your AWS credentials are valid",
        "2. Check your network connectivity to AWS",
        "3. Ensure you're using the correct region",
        "4. Review the error details with --verbose flag",
      );
    }
  }

  return guidance.join("\n");
}

/**
 * Format EC2 error for command-line display
 *
 * Formats errors with appropriate guidance for CLI output,
 * including optional verbose details.
 *
 * @param error - The error to format
 * @param verbose - Whether to include verbose error details
 * @returns Formatted error message with guidance
 *
 * @public
 */
export function formatEC2Error(error: unknown, verbose = false): string {
  const guidance = getEC2ErrorGuidance(error);

  if (verbose && error instanceof Error) {
    return `${guidance}\n\nVerbose Error Details:\n${error.stack || error.message}`;
  }

  return guidance;
}
