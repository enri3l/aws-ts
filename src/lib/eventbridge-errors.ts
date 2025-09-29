/**
 * EventBridge-specific error types for AWS EventBridge operations
 *
 * Extends the base error system with EventBridge-specific error handling
 * for rule management, target configuration, event routing, and event bus operations.
 *
 */

import { BaseError } from "./errors.js";

/**
 * Rule error for EventBridge rule operation failures
 *
 * Used when EventBridge rule operations fail, including rule creation,
 * updates, deletion, and state management.
 *
 * @public
 */
export class RuleError extends BaseError {
  /**
   * Create a new rule error
   *
   * @param message - User-friendly rule error message
   * @param ruleName - The EventBridge rule that encountered the error
   * @param operation - The rule operation that failed
   * @param eventBusName - The event bus associated with the rule
   * @param cause - The underlying error that caused the rule failure
   * @param metadata - Additional rule context
   */
  constructor(
    message: string,
    ruleName?: string,
    operation?: string,
    eventBusName?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "RULE_ERROR", {
      ruleName,
      operation,
      eventBusName,
      cause,
      ...metadata,
    });
  }
}

/**
 * Target error for EventBridge target configuration failures
 *
 * Used when target configuration operations fail, including target addition,
 * removal, and configuration validation.
 *
 * @public
 */
export class TargetError extends BaseError {
  /**
   * Create a new target error
   *
   * @param message - User-friendly target error message
   * @param ruleName - The rule associated with the target
   * @param targetId - The target ID that encountered the error
   * @param targetArn - The target ARN if relevant
   * @param operation - The target operation that failed
   * @param metadata - Additional target context
   */
  constructor(
    message: string,
    ruleName?: string,
    targetId?: string,
    targetArn?: string,
    operation?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "TARGET_ERROR", {
      ruleName,
      targetId,
      targetArn,
      operation,
      ...metadata,
    });
  }
}

/**
 * Event pattern error for EventBridge event pattern validation failures
 *
 * Used when event pattern validation fails, including JSON syntax errors,
 * invalid pattern structure, and pattern matching issues.
 *
 * @public
 */
export class EventPatternError extends BaseError {
  /**
   * Create a new event pattern error
   *
   * @param message - User-friendly event pattern error message
   * @param pattern - The event pattern that failed validation
   * @param operation - The pattern operation that failed
   * @param validationError - The specific validation error
   * @param metadata - Additional pattern context
   */
  constructor(
    message: string,
    pattern?: string,
    operation?: string,
    validationError?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "EVENT_PATTERN_ERROR", {
      pattern,
      operation,
      validationError,
      ...metadata,
    });
  }
}

/**
 * Schedule error for EventBridge schedule expression validation failures
 *
 * Used when schedule expression validation fails, including cron syntax errors,
 * rate expression issues, and invalid time specifications.
 *
 * @public
 */
export class ScheduleError extends BaseError {
  /**
   * Create a new schedule error
   *
   * @param message - User-friendly schedule error message
   * @param scheduleExpression - The schedule expression that failed validation
   * @param operation - The schedule operation that failed
   * @param validationError - The specific validation error
   * @param metadata - Additional schedule context
   */
  constructor(
    message: string,
    scheduleExpression?: string,
    operation?: string,
    validationError?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "SCHEDULE_ERROR", {
      scheduleExpression,
      operation,
      validationError,
      ...metadata,
    });
  }
}

/**
 * Event bus error for EventBridge event bus operation failures
 *
 * Used when event bus operations fail, including bus creation,
 * permissions, and cross-account access issues.
 *
 * @public
 */
export class EventBusError extends BaseError {
  /**
   * Create a new event bus error
   *
   * @param message - User-friendly event bus error message
   * @param eventBusName - The event bus that encountered the error
   * @param operation - The event bus operation that failed
   * @param cause - The underlying error that caused the event bus failure
   * @param metadata - Additional event bus context
   */
  constructor(
    message: string,
    eventBusName?: string,
    operation?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "EVENT_BUS_ERROR", {
      eventBusName,
      operation,
      cause,
      ...metadata,
    });
  }
}

/**
 * Permission error for EventBridge IAM and permission failures
 *
 * Used when EventBridge operations fail due to insufficient permissions,
 * invalid IAM roles, or resource access issues.
 *
 * @public
 */
export class EventBridgePermissionError extends BaseError {
  /**
   * Create a new EventBridge permission error
   *
   * @param message - User-friendly permission error message
   * @param operation - The operation that failed due to permissions
   * @param resource - The resource that couldn't be accessed
   * @param requiredPermissions - The permissions that are required
   * @param roleArn - The IAM role ARN if relevant
   * @param metadata - Additional permission context
   */
  constructor(
    message: string,
    operation?: string,
    resource?: string,
    requiredPermissions?: string[],
    roleArn?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "EVENTBRIDGE_PERMISSION_ERROR", {
      operation,
      resource,
      requiredPermissions,
      roleArn,
      ...metadata,
    });
  }
}

/**
 * Check if an error is an EventBridge-related error
 *
 * @param error - The error to check
 * @returns True if the error is EventBridge-related
 *
 * @public
 */
export function isEventBridgeError(
  error: unknown,
): error is
  | RuleError
  | TargetError
  | EventPatternError
  | ScheduleError
  | EventBusError
  | EventBridgePermissionError {
  return (
    error instanceof RuleError ||
    error instanceof TargetError ||
    error instanceof EventPatternError ||
    error instanceof ScheduleError ||
    error instanceof EventBusError ||
    error instanceof EventBridgePermissionError
  );
}

/**
 * Error-like interface for structural typing
 *
 * Allows guidance functions to work with any error object that has
 * the required code and metadata properties, avoiding circular imports.
 */
interface ErrorLike {
  code: string;
  metadata: Record<string, unknown>;
}

/**
 * Get guidance for RuleError
 *
 * @param error - The rule error
 * @returns Formatted guidance message
 * @internal
 */
function getRuleErrorGuidance(error: ErrorLike): string {
  const operation = error.metadata.operation as string;
  const ruleName = error.metadata.ruleName as string;
  const eventBusName = error.metadata.eventBusName as string;

  const ruleInfo = ruleName ? ` '${ruleName}'` : "";
  const busInfo =
    eventBusName && eventBusName !== "default" ? ` on event bus '${eventBusName}'` : "";

  switch (operation) {
    case "list-rules": {
      return [
        `Failed to list EventBridge rules${busInfo}:`,
        "1. Check your AWS credentials and permissions",
        "2. Verify you have events:ListRules permission",
        "3. Ensure the event bus name is correct",
        "4. Check the AWS region setting",
        "",
        "Try: aws events list-rules --event-bus-name default",
      ].join("\n");
    }
    case "describe-rule": {
      return [
        `Failed to describe EventBridge rule${ruleInfo}${busInfo}:`,
        "1. Verify the rule name exists and is spelled correctly",
        "2. Check you have events:DescribeRule permission",
        "3. Ensure you're using the correct event bus name",
        "4. Verify the AWS region is correct",
        "",
        `Try: aws events describe-rule --name ${ruleName || "<rule-name>"}`,
      ].join("\n");
    }
    case "put-rule": {
      return [
        `Failed to create/update EventBridge rule${ruleInfo}${busInfo}:`,
        "1. Verify the rule name follows naming conventions",
        "2. Check event pattern JSON syntax is valid",
        "3. Ensure schedule expression is correctly formatted",
        "4. Verify you have events:PutRule permission",
        "5. Check that either event pattern OR schedule expression is provided",
        "",
        "Rule names can contain letters, numbers, dots, hyphens, and underscores",
      ].join("\n");
    }
    case "delete-rule": {
      return [
        `Failed to delete EventBridge rule${ruleInfo}${busInfo}:`,
        "1. Verify the rule exists and name is correct",
        "2. Remove all targets from the rule first",
        "3. Check you have events:DeleteRule permission",
        "4. Use --force flag to delete rule with targets",
        "",
        "Rules with targets cannot be deleted unless forced",
      ].join("\n");
    }
    case "enable-rule":
    case "disable-rule": {
      const action = operation === "enable-rule" ? "enable" : "disable";
      return [
        `Failed to ${action} EventBridge rule${ruleInfo}${busInfo}:`,
        "1. Verify the rule exists and name is correct",
        `2. Check you have events:${action === "enable" ? "Enable" : "Disable"}Rule permission`,
        "3. Ensure the rule is in the correct state for this operation",
        "",
        `Rules can be toggled between ENABLED and DISABLED states`,
      ].join("\n");
    }
    default: {
      return [
        `EventBridge rule operation failed${ruleInfo}${busInfo}:`,
        "1. Check your AWS credentials and permissions",
        "2. Verify the rule name and event bus are correct",
        "3. Review the specific error message for more details",
        "",
        "Run with --verbose flag for detailed error information",
      ].join("\n");
    }
  }
}

/**
 * Get guidance for TargetError
 *
 * @param error - The target error
 * @returns Formatted guidance message
 * @internal
 */
function getTargetErrorGuidance(error: ErrorLike): string {
  const operation = error.metadata.operation as string;
  const ruleName = error.metadata.ruleName as string;
  const targetId = error.metadata.targetId as string;
  const targetArn = error.metadata.targetArn as string;

  const ruleInfo = ruleName ? ` for rule '${ruleName}'` : "";
  const targetInfo = targetId ? ` (ID: ${targetId})` : "";

  switch (operation) {
    case "list-targets-by-rule": {
      return [
        `Failed to list targets${ruleInfo}:`,
        "1. Verify the rule name exists and is correct",
        "2. Check you have events:ListTargetsByRule permission",
        "3. Ensure the event bus name is correct",
        "",
        `Try: aws events list-targets-by-rule --rule ${ruleName || "<rule-name>"}`,
      ].join("\n");
    }
    case "put-targets": {
      return [
        `Failed to add/update targets${ruleInfo}:`,
        "1. Verify all target ARNs are valid and accessible",
        "2. Check IAM permissions for EventBridge to invoke targets",
        "3. Ensure target IDs are unique within the rule",
        "4. Verify input transformation syntax if used",
        "5. Check that required role ARN is provided for some target types",
        "",
        "Lambda, SNS, and SQS targets may require resource-based policies",
      ].join("\n");
    }
    case "remove-targets": {
      return [
        `Failed to remove targets${ruleInfo}:`,
        "1. Verify the target IDs exist for the specified rule",
        "2. Check you have events:RemoveTargets permission",
        "3. Ensure target IDs are spelled correctly",
        "",
        "Use list-targets-by-rule to verify existing target IDs",
      ].join("\n");
    }
    default: {
      return [
        `EventBridge target operation failed${ruleInfo}${targetInfo}:`,
        "1. Verify target ARN is valid and accessible",
        "2. Check IAM permissions for EventBridge service",
        "3. Ensure target configuration is correct",
        "",
        targetArn ? `Target ARN: ${targetArn}` : "",
        "",
        "Different target types have different configuration requirements",
      ].join("\n");
    }
  }
}

/**
 * Get guidance for EventPatternError
 *
 * @param error - The event pattern error
 * @returns Formatted guidance message
 * @internal
 */
function getEventPatternErrorGuidance(error: ErrorLike): string {
  const pattern = error.metadata.pattern as string;
  const validationError = error.metadata.validationError as string;

  return [
    "Invalid event pattern format:",
    pattern ? `Pattern: ${pattern}` : "",
    "1. Event patterns must be valid JSON objects",
    '2. Use arrays for multiple values: {"source": ["app1", "app2"]}',
    '3. Use exists filters: {"detail": {"state": [{"exists": true}]}}',
    '4. Use numeric filters: {"detail": {"price": [{"numeric": [">", 100]}]}}',
    "5. Avoid null values and empty objects",
    "",
    validationError ? `Validation error: ${validationError}` : "",
    "",
    "See AWS EventBridge User Guide for event pattern examples",
    "Test patterns using aws events test-event-pattern",
  ].join("\n");
}

/**
 * Get guidance for ScheduleError
 *
 * @param error - The schedule error
 * @returns Formatted guidance message
 * @internal
 */
function getScheduleErrorGuidance(error: ErrorLike): string {
  const scheduleExpression = error.metadata.scheduleExpression as string;
  const validationError = error.metadata.validationError as string;

  return [
    "Invalid schedule expression format:",
    "1. Rate expressions: rate(5 minutes), rate(1 hour), rate(7 days)",
    "2. Cron expressions: cron(0 12 * * ? *) for daily at noon UTC",
    "3. Use singular for rate(1 minute), plural for rate(2 minutes)",
    "4. Minimum rate is 1 minute",
    "5. Cron format: cron(minutes hours day-of-month month day-of-week year)",
    "",
    scheduleExpression ? `Expression: ${scheduleExpression}` : "",
    validationError ? `Validation error: ${validationError}` : "",
    "",
    "All times are in UTC",
    "Use ? in day-of-month OR day-of-week field (not both)",
  ].join("\n");
}

/**
 * Get guidance for EventBusError
 *
 * @param error - The event bus error
 * @returns Formatted guidance message
 * @internal
 */
function getEventBusErrorGuidance(error: ErrorLike): string {
  const operation = error.metadata.operation as string;
  const eventBusName = error.metadata.eventBusName as string;

  const busInfo = eventBusName ? ` '${eventBusName}'` : "";

  switch (operation) {
    case "create-event-bus": {
      return [
        `Failed to create event bus${busInfo}:`,
        "1. Verify the event bus name follows naming conventions",
        "2. Check you have events:CreateEventBus permission",
        "3. Ensure the name doesn't conflict with existing buses",
        "4. Event bus names can contain letters, numbers, dots, hyphens, underscores",
        "",
        "Custom event buses are useful for organizing different application events",
      ].join("\n");
    }
    case "delete-event-bus": {
      return [
        `Failed to delete event bus${busInfo}:`,
        "1. Remove all rules from the event bus first",
        "2. Check you have events:DeleteEventBus permission",
        "3. Cannot delete the default event bus",
        "",
        "Default event bus cannot be deleted",
      ].join("\n");
    }
    default: {
      return [
        `Event bus operation failed${busInfo}:`,
        "1. Verify the event bus name is correct",
        "2. Check your AWS credentials and permissions",
        "3. Ensure the event bus exists in the correct region",
        "",
        "Use 'default' for the default event bus",
      ].join("\n");
    }
  }
}

/**
 * Get guidance for EventBridgePermissionError
 *
 * @param error - The permission error
 * @returns Formatted guidance message
 * @internal
 */
function getEventBridgePermissionErrorGuidance(error: ErrorLike): string {
  const operation = error.metadata.operation as string;
  const resource = error.metadata.resource as string;
  const requiredPermissions = error.metadata.requiredPermissions as string[];
  const roleArn = error.metadata.roleArn as string;

  const resourceInfo = resource ? ` for resource '${resource}'` : "";
  const permissionsList = requiredPermissions ? requiredPermissions.join(", ") : "";

  if (operation === "put-targets") {
    return [
      `Insufficient permissions for target configuration${resourceInfo}:`,
      "1. EventBridge needs permission to invoke the target service",
      "2. For Lambda: Add resource-based policy allowing events.amazonaws.com",
      "3. For SQS/SNS: Configure queue/topic policy for EventBridge",
      "4. For other services: Provide IAM role with necessary permissions",
      "",
      roleArn ? `Role ARN: ${roleArn}` : "",
      permissionsList ? `Required permissions: ${permissionsList}` : "",
      "",
      "Use aws events put-permission for cross-account access",
    ].join("\n");
  }

  return [
    `Permission denied for EventBridge operation${resourceInfo}:`,
    "1. Check your IAM permissions for EventBridge operations",
    "2. Verify you have access to the specific event bus/rule",
    "3. Ensure your credentials are valid and not expired",
    "4. For cross-account operations, check resource policies",
    "",
    permissionsList ? `Required permissions: ${permissionsList}` : "",
    "",
    "Run 'aws sts get-caller-identity' to verify your AWS identity",
  ].join("\n");
}

/**
 * Get generic guidance for unknown errors
 *
 * @returns Generic guidance message
 * @internal
 */
function getGenericEventBridgeErrorGuidance(): string {
  return [
    "EventBridge operation encountered an error:",
    "1. Check your AWS credentials and permissions",
    "2. Verify event bus names and rule names are correct",
    "3. Ensure you're using the correct AWS region",
    "4. Review EventBridge service limits and quotas",
    "",
    "Use --verbose flag for detailed debugging information",
    "Check CloudWatch Events console for visual rule management",
  ].join("\n");
}

/**
 * Get user-friendly resolution guidance for EventBridge errors
 *
 * @param error - The EventBridge error to get guidance for
 * @returns Resolution guidance message
 *
 * @public
 */
export function getEventBridgeErrorGuidance(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const typedError = error as ErrorLike;
    switch (typedError.code) {
      case "RULE_ERROR": {
        return getRuleErrorGuidance(typedError);
      }
      case "TARGET_ERROR": {
        return getTargetErrorGuidance(typedError);
      }
      case "EVENT_PATTERN_ERROR": {
        return getEventPatternErrorGuidance(typedError);
      }
      case "SCHEDULE_ERROR": {
        return getScheduleErrorGuidance(typedError);
      }
      case "EVENT_BUS_ERROR": {
        return getEventBusErrorGuidance(typedError);
      }
      case "EVENTBRIDGE_PERMISSION_ERROR": {
        return getEventBridgePermissionErrorGuidance(typedError);
      }
    }
  }
  return getGenericEventBridgeErrorGuidance();
}
