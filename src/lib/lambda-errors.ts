/**
 * @module lambda-errors
 * Lambda-specific error types for AWS Lambda operations
 *
 * Extends the base error system with Lambda-specific error handling
 * for function management, code deployment, configuration updates, and invocation.
 *
 */

import { BaseError } from "./errors.js";

/**
 * Function error for Lambda function operation failures
 *
 * Used when Lambda function operations fail, including function creation,
 * configuration updates, code deployment, and invocation failures.
 *
 * @public
 */
export class FunctionError extends BaseError {
  /**
   * Create a new function error
   *
   * @param message - User-friendly function error message
   * @param functionName - The Lambda function that encountered the error
   * @param operation - The function operation that failed
   * @param cause - The underlying error that caused the function failure
   * @param metadata - Additional function context
   */
  constructor(
    message: string,
    functionName?: string,
    operation?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "FUNCTION_ERROR", {
      functionName,
      operation,
      cause,
      ...metadata,
    });
  }
}

/**
 * Invocation error for Lambda function invocation failures
 *
 * Used when function invocation fails, including payload issues,
 * timeout errors, and execution failures.
 *
 * @public
 */
export class InvocationError extends BaseError {
  /**
   * Create a new invocation error
   *
   * @param message - User-friendly invocation error message
   * @param functionName - The Lambda function that failed to invoke
   * @param invocationType - The type of invocation that failed
   * @param statusCode - The HTTP status code from the invocation
   * @param errorType - The Lambda error type if available
   * @param metadata - Additional invocation context
   */
  constructor(
    message: string,
    functionName?: string,
    invocationType?: string,
    statusCode?: number,
    errorType?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "INVOCATION_ERROR", {
      functionName,
      invocationType,
      statusCode,
      errorType,
      ...metadata,
    });
  }
}

/**
 * Code deployment error for Lambda function code update failures
 *
 * Used when function code deployment fails, including ZIP file issues,
 * S3 object access problems, and code size violations.
 *
 * @public
 */
export class CodeDeploymentError extends BaseError {
  /**
   * Create a new code deployment error
   *
   * @param message - User-friendly code deployment error message
   * @param functionName - The Lambda function that failed deployment
   * @param deploymentType - The type of deployment that failed (ZIP, S3)
   * @param codeSize - The size of the deployment package if relevant
   * @param metadata - Additional deployment context
   */
  constructor(
    message: string,
    functionName?: string,
    deploymentType?: string,
    codeSize?: number,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "CODE_DEPLOYMENT_ERROR", {
      functionName,
      deploymentType,
      codeSize,
      ...metadata,
    });
  }
}

/**
 * Permission error for Lambda IAM and permission failures
 *
 * Used when Lambda operations fail due to insufficient permissions,
 * invalid IAM roles, or resource access issues.
 *
 * @public
 */
export class PermissionError extends BaseError {
  /**
   * Create a new permission error
   *
   * @param message - User-friendly permission error message
   * @param functionName - The Lambda function that encountered permission issues
   * @param operation - The operation that failed due to permissions
   * @param requiredPermissions - The permissions that are required
   * @param roleArn - The IAM role ARN if relevant
   * @param metadata - Additional permission context
   */
  constructor(
    message: string,
    functionName?: string,
    operation?: string,
    requiredPermissions?: string[],
    roleArn?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "PERMISSION_ERROR", {
      functionName,
      operation,
      requiredPermissions,
      roleArn,
      ...metadata,
    });
  }
}

/**
 * Configuration error for Lambda function configuration failures
 *
 * Used when function configuration operations fail, including
 * invalid settings, resource limits, and VPC configuration issues.
 *
 * @public
 */
export class ConfigurationError extends BaseError {
  /**
   * Create a new configuration error
   *
   * @param message - User-friendly configuration error message
   * @param functionName - The Lambda function with configuration issues
   * @param configType - The type of configuration that failed
   * @param invalidValue - The invalid configuration value
   * @param validRange - The valid range or options for the configuration
   * @param metadata - Additional configuration context
   */
  constructor(
    message: string,
    functionName?: string,
    configType?: string,
    invalidValue?: string | number,
    validRange?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "CONFIGURATION_ERROR", {
      functionName,
      configType,
      invalidValue,
      validRange,
      ...metadata,
    });
  }
}

/**
 * Concurrency error for Lambda concurrency limit failures
 *
 * Used when Lambda operations fail due to concurrency limits,
 * reserved concurrency configuration, or account limits.
 *
 * @public
 */
export class ConcurrencyError extends BaseError {
  /**
   * Create a new concurrency error
   *
   * @param message - User-friendly concurrency error message
   * @param functionName - The Lambda function with concurrency issues
   * @param currentConcurrency - The current concurrency level
   * @param limit - The concurrency limit that was exceeded
   * @param limitType - The type of limit (account, function, reserved)
   * @param metadata - Additional concurrency context
   */
  constructor(
    message: string,
    functionName?: string,
    currentConcurrency?: number,
    limit?: number,
    limitType?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "CONCURRENCY_ERROR", {
      functionName,
      currentConcurrency,
      limit,
      limitType,
      ...metadata,
    });
  }
}

/**
 * Check if an error is a Lambda-related error
 *
 * @param error - The error to check
 * @returns True if the error is Lambda-related
 *
 * @public
 */
export function isLambdaError(
  error: unknown,
): error is
  | FunctionError
  | InvocationError
  | CodeDeploymentError
  | PermissionError
  | ConfigurationError
  | ConcurrencyError {
  return (
    error instanceof FunctionError ||
    error instanceof InvocationError ||
    error instanceof CodeDeploymentError ||
    error instanceof PermissionError ||
    error instanceof ConfigurationError ||
    error instanceof ConcurrencyError
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
 * Get guidance for FunctionError
 *
 * @param error - The function error
 * @returns Formatted guidance message
 * @internal
 */
function getFunctionErrorGuidance(error: ErrorLike): string {
  const operation = error.metadata.operation as string;
  const functionName = error.metadata.functionName as string;
  const functionInfo = functionName ? ` for function '${functionName}'` : "";

  switch (operation) {
    case "list-functions": {
      return [
        "Failed to list Lambda functions. Here's how to resolve it:",
        "1. Check your AWS credentials: aws sts get-caller-identity",
        "2. Verify region setting in your AWS configuration",
        "3. Ensure you have lambda:ListFunctions permission",
        "",
        "Try: aws lambda list-functions --region <your-region>",
      ].join("\n");
    }
    case "get-function": {
      return [
        `Failed to get Lambda function${functionInfo}:`,
        "1. Verify the function name is correct and exists",
        "2. Check you have lambda:GetFunction permission",
        "3. Ensure you're using the correct AWS region",
        "4. For versioned functions, verify the qualifier is valid",
        "",
        `Try: aws lambda get-function --function-name ${functionName || "<function-name>"}`,
      ].join("\n");
    }
    case "create-function": {
      return [
        `Failed to create Lambda function${functionInfo}:`,
        "1. Verify the IAM role ARN exists and has lambda:InvokeFunction permission",
        "2. Check the function name doesn't already exist",
        "3. Ensure your code package is valid (ZIP format, size limits)",
        "4. Verify runtime and handler are correctly specified",
        "",
        "Function names must be unique within your AWS account and region",
      ].join("\n");
    }
    case "delete-function": {
      return [
        `Failed to delete Lambda function${functionInfo}:`,
        "1. Verify the function exists and you have lambda:DeleteFunction permission",
        "2. Check if the function has aliases or event source mappings",
        "3. Ensure no other resources are referencing the function",
        "",
        "You may need to delete aliases and event sources first",
      ].join("\n");
    }
    default: {
      return [
        `Lambda function operation failed${functionInfo}:`,
        "1. Check your AWS credentials and permissions",
        "2. Verify the function name and region are correct",
        "3. Review the specific error message for more details",
        "",
        "Run with --verbose flag for detailed error information",
      ].join("\n");
    }
  }
}

/**
 * Get guidance for InvocationError
 *
 * @param error - The invocation error
 * @returns Formatted guidance message
 * @internal
 */
function getInvocationErrorGuidance(error: ErrorLike): string {
  const functionName = error.metadata.functionName as string;
  const invocationType = error.metadata.invocationType as string;
  const statusCode = error.metadata.statusCode as number;
  const errorType = error.metadata.errorType as string;

  const invocationInfo = invocationType ? ` (${invocationType})` : "";
  const functionInfo = functionName ? ` for function '${functionName}'` : "";

  if (statusCode === 429) {
    return [
      `Lambda function invocation throttled${functionInfo}:`,
      "1. Your function is hitting concurrency limits",
      "2. Wait and retry with exponential backoff",
      "3. Consider increasing reserved concurrency for the function",
      "4. Check if other functions are consuming account concurrency",
      "",
      "Default account concurrency limit is 1000 concurrent executions",
    ].join("\n");
  }

  if (statusCode === 413) {
    return [
      `Lambda invocation payload too large${functionInfo}:`,
      "1. Synchronous payload limit: 6 MB",
      "2. Asynchronous payload limit: 256 KB",
      "3. Reduce your payload size or split into smaller chunks",
      "4. Consider using S3 for large data and pass S3 references",
      "",
      "Use asynchronous invocation for fire-and-forget scenarios",
    ].join("\n");
  }

  if (errorType === "Task timed out") {
    return [
      `Lambda function timed out${functionInfo}:`,
      "1. Increase the function timeout setting (max 15 minutes)",
      "2. Optimize your function code for better performance",
      "3. Check for infinite loops or blocking operations",
      "4. Consider breaking work into smaller, parallel functions",
      "",
      "Default timeout is 3 seconds, maximum is 900 seconds (15 minutes)",
    ].join("\n");
  }

  return [
    `Lambda function invocation failed${functionInfo}${invocationInfo}:`,
    "1. Check the function logs in CloudWatch for error details",
    "2. Verify your payload format matches function expectations",
    "3. Ensure the function has sufficient memory and timeout",
    "4. Check IAM permissions for the function's execution role",
    "",
    `Try: aws logs filter-log-events --log-group-name /aws/lambda/${functionName || "<function-name>"}`,
  ].join("\n");
}

/**
 * Get guidance for CodeDeploymentError
 *
 * @param error - The code deployment error
 * @returns Formatted guidance message
 * @internal
 */
function getCodeDeploymentErrorGuidance(error: ErrorLike): string {
  const functionName = error.metadata.functionName as string;
  const deploymentType = error.metadata.deploymentType as string;
  const codeSize = error.metadata.codeSize as number;

  const functionInfo = functionName ? ` for function '${functionName}'` : "";
  const sizeInfo = codeSize ? ` (${Math.round(codeSize / 1024 / 1024)} MB)` : "";

  if (deploymentType === "ZIP" && codeSize && codeSize > 50 * 1024 * 1024) {
    return [
      `Lambda code package too large${functionInfo}${sizeInfo}:`,
      "1. Direct upload limit: 50 MB",
      "2. Upload to S3 and use S3 deployment for packages > 50 MB",
      "3. Remove unnecessary files and dependencies",
      "4. Use webpack or similar tools to bundle and minimize code",
      "",
      "S3 deployment supports packages up to 250 MB (unzipped)",
    ].join("\n");
  }

  if (deploymentType === "S3") {
    return [
      `S3 code deployment failed${functionInfo}:`,
      "1. Verify the S3 bucket and key exist and are accessible",
      "2. Check IAM permissions for S3 access",
      "3. Ensure the Lambda service has permission to access your S3 bucket",
      "4. Verify the object version if specified",
      "",
      "Lambda needs s3:GetObject permission on your deployment bucket",
    ].join("\n");
  }

  return [
    `Lambda code deployment failed${functionInfo}:`,
    "1. Verify your deployment package is valid ZIP format",
    "2. Check file permissions and structure in the package",
    "3. Ensure handler file and function exist in the package",
    "4. Review size limits: 50 MB direct, 250 MB via S3",
    "",
    "Test your package locally before deployment",
  ].join("\n");
}

/**
 * Get guidance for PermissionError
 *
 * @param error - The permission error
 * @returns Formatted guidance message
 * @internal
 */
function getPermissionErrorGuidance(error: ErrorLike): string {
  const operation = error.metadata.operation as string;
  const functionName = error.metadata.functionName as string;
  const roleArn = error.metadata.roleArn as string;
  const requiredPermissions = error.metadata.requiredPermissions as string[];

  const functionInfo = functionName ? ` for function '${functionName}'` : "";
  const permissionsList = requiredPermissions ? requiredPermissions.join(", ") : "";

  if (operation === "create-function" || operation === "update-function-configuration") {
    return [
      `Insufficient permissions for Lambda operation${functionInfo}:`,
      "1. Verify your IAM user/role has required Lambda permissions",
      "2. Check the function execution role has proper trust policy",
      "3. Ensure execution role has necessary service permissions",
      "4. Verify VPC permissions if using VPC configuration",
      "",
      roleArn ? `Execution role: ${roleArn}` : "",
      permissionsList ? `Required permissions: ${permissionsList}` : "",
      "",
      "Execution role must trust lambda.amazonaws.com service",
    ].join("\n");
  }

  return [
    `Permission denied for Lambda operation${functionInfo}:`,
    "1. Check your IAM permissions for Lambda operations",
    "2. Verify you have access to the specific function/resource",
    "3. Ensure your credentials are valid and not expired",
    "4. Contact your AWS administrator if needed",
    "",
    permissionsList ? `Required permissions: ${permissionsList}` : "",
    "",
    "Run 'aws sts get-caller-identity' to verify your AWS identity",
  ].join("\n");
}

/**
 * Get guidance for ConfigurationError
 *
 * @param error - The configuration error
 * @returns Formatted guidance message
 * @internal
 */
function getConfigurationErrorGuidance(error: ErrorLike): string {
  const configType = error.metadata.configType as string;
  const invalidValue = error.metadata.invalidValue as string | number | undefined;
  const validRange = error.metadata.validRange as string;
  const functionName = error.metadata.functionName as string;

  const functionInfo = functionName ? ` for function '${functionName}'` : "";
  const valueInfo = invalidValue === undefined ? "" : ` (provided: ${invalidValue})`;
  const rangeInfo = validRange ? ` Valid range: ${validRange}` : "";

  switch (configType) {
    case "memory": {
      return [
        `Invalid memory configuration${functionInfo}${valueInfo}:`,
        "1. Memory must be between 128 MB and 10,240 MB",
        "2. Memory must be in 1 MB increments",
        "3. Higher memory also increases CPU allocation",
        "",
        rangeInfo,
        "",
        "More memory can improve performance but increases cost",
      ].join("\n");
    }
    case "timeout": {
      return [
        `Invalid timeout configuration${functionInfo}${valueInfo}:`,
        "1. Timeout must be between 1 second and 900 seconds (15 minutes)",
        "2. Consider your function's actual execution time",
        "3. Balance between performance and cost",
        "",
        rangeInfo,
        "",
        "Longer timeouts increase potential cost for stuck functions",
      ].join("\n");
    }
    case "environment": {
      return [
        `Invalid environment variable configuration${functionInfo}:`,
        "1. Total size of all environment variables must not exceed 4 KB",
        "2. Variable names must be valid identifiers",
        "3. Avoid sensitive data in environment variables",
        "",
        "Use AWS Secrets Manager or Parameter Store for sensitive data",
      ].join("\n");
    }
    case "vpc": {
      return [
        `Invalid VPC configuration${functionInfo}:`,
        "1. Verify subnet IDs exist and are in the same VPC",
        "2. Check security group IDs are valid and accessible",
        "3. Ensure subnets have route to NAT Gateway for internet access",
        "4. Verify ENI permissions for the execution role",
        "",
        "VPC functions need ec2:CreateNetworkInterface permissions",
      ].join("\n");
    }
    default: {
      return [
        `Invalid Lambda configuration${functionInfo}${valueInfo}:`,
        "1. Review the AWS Lambda limits and constraints",
        "2. Check the AWS Lambda documentation for valid values",
        "3. Verify your configuration matches AWS requirements",
        "",
        rangeInfo,
        "",
        "Use AWS CLI help for parameter details: aws lambda help",
      ].join("\n");
    }
  }
}

/**
 * Get guidance for ConcurrencyError
 *
 * @param error - The concurrency error
 * @returns Formatted guidance message
 * @internal
 */
function getConcurrencyErrorGuidance(error: ErrorLike): string {
  const functionName = error.metadata.functionName as string;
  const currentConcurrency = error.metadata.currentConcurrency as number;
  const limit = error.metadata.limit as number;
  const limitType = error.metadata.limitType as string;

  const functionInfo = functionName ? ` for function '${functionName}'` : "";
  const concurrencyInfo = currentConcurrency ? ` (current: ${currentConcurrency})` : "";
  const limitInfo = limit ? ` (limit: ${limit})` : "";

  switch (limitType) {
    case "account": {
      return [
        `Account concurrency limit exceeded${concurrencyInfo}${limitInfo}:`,
        "1. Wait for current executions to complete",
        "2. Request a limit increase through AWS Support",
        "3. Optimize functions to reduce execution time",
        "4. Consider using reserved concurrency for critical functions",
        "",
        "Default account limit is 1000 concurrent executions",
      ].join("\n");
    }
    case "function": {
      return [
        `Function concurrency limit exceeded${functionInfo}${concurrencyInfo}${limitInfo}:`,
        "1. Increase reserved concurrency for this function",
        "2. Optimize function code to reduce execution time",
        "3. Implement exponential backoff for retries",
        "4. Consider breaking work into smaller functions",
        "",
        "Reserved concurrency guarantees capacity but reduces available pool",
      ].join("\n");
    }
    case "reserved": {
      return [
        `Reserved concurrency limit exceeded${functionInfo}${concurrencyInfo}${limitInfo}:`,
        "1. Increase the reserved concurrency setting",
        "2. Review if reserved concurrency is necessary",
        "3. Monitor function metrics to right-size concurrency",
        "",
        "Reserved concurrency reserves capacity from the account pool",
      ].join("\n");
    }
    default: {
      return [
        `Concurrency limit exceeded${functionInfo}${concurrencyInfo}${limitInfo}:`,
        "1. Monitor CloudWatch metrics for concurrent executions",
        "2. Implement retry logic with exponential backoff",
        "3. Consider provisioned concurrency for predictable workloads",
        "4. Optimize function performance to reduce execution time",
        "",
        "Use CloudWatch to monitor Duration and ConcurrentExecutions metrics",
      ].join("\n");
    }
  }
}

/**
 * Get generic guidance for unknown errors
 *
 * @returns Generic guidance message
 * @internal
 */
function getGenericLambdaErrorGuidance(): string {
  return [
    "Lambda operation encountered an error:",
    "1. Check CloudWatch Logs for detailed error information",
    "2. Verify your AWS credentials and permissions",
    "3. Ensure function name and region are correct",
    "4. Review AWS Lambda service limits and quotas",
    "",
    "Use --verbose flag for detailed debugging information",
  ].join("\n");
}

/**
 * Get user-friendly resolution guidance for Lambda errors
 *
 * @param error - The Lambda error to get guidance for
 * @returns Resolution guidance message
 *
 * @public
 */
export function getLambdaErrorGuidance(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const typedError = error as ErrorLike;
    switch (typedError.code) {
      case "FUNCTION_ERROR": {
        return getFunctionErrorGuidance(typedError);
      }
      case "INVOCATION_ERROR": {
        return getInvocationErrorGuidance(typedError);
      }
      case "CODE_DEPLOYMENT_ERROR": {
        return getCodeDeploymentErrorGuidance(typedError);
      }
      case "PERMISSION_ERROR": {
        return getPermissionErrorGuidance(typedError);
      }
      case "CONFIGURATION_ERROR": {
        return getConfigurationErrorGuidance(typedError);
      }
      case "CONCURRENCY_ERROR": {
        return getConcurrencyErrorGuidance(typedError);
      }
    }
  }
  return getGenericLambdaErrorGuidance();
}

/**
 * Format Lambda command errors with standardized messages and guidance
 *
 * @param error - The error that occurred
 * @param verbose - Whether to include verbose error details
 * @param context - Optional context for the operation that failed
 * @returns Formatted error message with guidance
 *
 * @public
 *
 * @remarks
 * This function provides centralized error formatting for all Lambda commands,
 * ensuring consistent error messages and user guidance across the CLI.
 * It handles both Lambda-specific errors and generic errors, enriching them
 * with actionable resolution guidance.
 */
export function formatLambdaError(error: unknown, verbose = false, context?: string): string {
  const guidance = getLambdaErrorGuidance(error);
  const contextPrefix = context ? `${context}: ` : "";

  if (error instanceof Error) {
    let message = `${contextPrefix}${error.message}`;

    if (verbose && error.stack) {
      message += `\n\nStack trace:\n${error.stack}`;
    }

    return `${message}\n\n${guidance}`;
  }

  return `${contextPrefix}An unknown error occurred\n\n${guidance}`;
}
