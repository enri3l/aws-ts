/**
 * ECS-specific error types for AWS ECS operations
 *
 * Extends the base error system with ECS-specific error handling
 * for cluster management, service orchestration, and task operations.
 *
 */

import { BaseError } from "./errors.js";

/**
 * Cluster error for ECS cluster operation failures
 *
 * Used when cluster operations fail, including cluster creation,
 * configuration updates, and cluster state issues.
 *
 * @public
 */
export class ClusterError extends BaseError {
  /**
   * Create a new cluster error
   *
   * @param message - User-friendly cluster error message
   * @param clusterName - The cluster that encountered the error
   * @param operation - The cluster operation that failed
   * @param cause - The underlying error that caused the cluster failure
   * @param metadata - Additional cluster context
   */
  constructor(
    message: string,
    clusterName?: string,
    operation?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "CLUSTER_ERROR", {
      clusterName,
      operation,
      cause,
      ...metadata,
    });
  }
}

/**
 * Service error for ECS service operation failures
 *
 * Used when service operations fail, including service creation,
 * deployment issues, scaling problems, and configuration failures.
 *
 * @public
 */
export class ServiceError extends BaseError {
  /**
   * Create a new service error
   *
   * @param message - User-friendly service error message
   * @param serviceName - The service that encountered the error
   * @param clusterName - The cluster containing the service
   * @param operation - The service operation that failed
   * @param cause - The underlying error that caused the service failure
   * @param metadata - Additional service context
   */
  constructor(
    message: string,
    serviceName?: string,
    clusterName?: string,
    operation?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "SERVICE_ERROR", {
      serviceName,
      clusterName,
      operation,
      cause,
      ...metadata,
    });
  }
}

/**
 * Task error for ECS task operation failures
 *
 * Used when task operations fail, including task execution,
 * task definition issues, and container failures.
 *
 * @public
 */
export class TaskError extends BaseError {
  /**
   * Create a new task error
   *
   * @param message - User-friendly task error message
   * @param taskArn - The task that encountered the error
   * @param operation - The task operation that failed
   * @param cause - The underlying error that caused the task failure
   * @param metadata - Additional task context
   */
  constructor(
    message: string,
    taskArn?: string,
    operation?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "TASK_ERROR", {
      taskArn,
      operation,
      cause,
      ...metadata,
    });
  }
}

/**
 * Task definition error for ECS task definition failures
 *
 * Used when task definition operations fail, including registration,
 * validation, and revision management issues.
 *
 * @public
 */
export class TaskDefinitionError extends BaseError {
  /**
   * Create a new task definition error
   *
   * @param message - User-friendly task definition error message
   * @param taskDefinitionArn - The task definition that encountered the error
   * @param operation - The task definition operation that failed
   * @param cause - The underlying error that caused the task definition failure
   * @param metadata - Additional task definition context
   */
  constructor(
    message: string,
    taskDefinitionArn?: string,
    operation?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "TASK_DEFINITION_ERROR", {
      taskDefinitionArn,
      operation,
      cause,
      ...metadata,
    });
  }
}

/**
 * Deployment error for ECS deployment operation failures
 *
 * Used when deployment operations fail, including rolling deployments,
 * rollback operations, and deployment validation issues.
 *
 * @public
 */
export class DeploymentError extends BaseError {
  /**
   * Create a new deployment error
   *
   * @param message - User-friendly deployment error message
   * @param serviceName - The service being deployed
   * @param clusterName - The cluster containing the service
   * @param deploymentId - The deployment that failed
   * @param operation - The deployment operation that failed
   * @param metadata - Additional deployment context
   */
  constructor(
    message: string,
    serviceName?: string,
    clusterName?: string,
    deploymentId?: string,
    operation?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "DEPLOYMENT_ERROR", {
      serviceName,
      clusterName,
      deploymentId,
      operation,
      ...metadata,
    });
  }
}

/**
 * Capacity provider error for ECS capacity provider failures
 *
 * Used when capacity provider operations fail, including capacity provider
 * configuration, auto scaling, and resource allocation issues.
 *
 * @public
 */
export class CapacityProviderError extends BaseError {
  /**
   * Create a new capacity provider error
   *
   * @param message - User-friendly capacity provider error message
   * @param capacityProvider - The capacity provider that encountered the error
   * @param operation - The capacity provider operation that failed
   * @param cause - The underlying error that caused the capacity provider failure
   * @param metadata - Additional capacity provider context
   */
  constructor(
    message: string,
    capacityProvider?: string,
    operation?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "CAPACITY_PROVIDER_ERROR", {
      capacityProvider,
      operation,
      cause,
      ...metadata,
    });
  }
}

/**
 * Check if an error is an ECS-related error
 *
 * @param error - The error to check
 * @returns True if the error is ECS-related
 *
 * @public
 */
export function isECSError(
  error: unknown,
): error is
  | ClusterError
  | ServiceError
  | TaskError
  | TaskDefinitionError
  | DeploymentError
  | CapacityProviderError {
  return (
    error instanceof ClusterError ||
    error instanceof ServiceError ||
    error instanceof TaskError ||
    error instanceof TaskDefinitionError ||
    error instanceof DeploymentError ||
    error instanceof CapacityProviderError
  );
}

/**
 * Get user-friendly guidance for ECS errors
 *
 * @param error - The error to provide guidance for
 * @returns User-friendly guidance message
 *
 * @public
 */
/**
 * Union type for all ECS error classes
 */
type ECSError =
  | ClusterError
  | ServiceError
  | TaskError
  | TaskDefinitionError
  | DeploymentError
  | CapacityProviderError;

/**
 * Get user-friendly error guidance for ECS-related errors
 *
 * @param error - The error object to analyze
 * @returns Human-readable error guidance with troubleshooting steps
 */
export function getECSErrorGuidance(error: unknown): string {
  if (isECSError(error)) {
    return getCustomECSErrorGuidance(error);
  }

  if (error instanceof Error) {
    return getAwsSdkErrorGuidance(error);
  }

  return "Unknown ECS error. Check AWS credentials, IAM permissions, and resource configuration. Verify resources exist in the correct region.";
}

/**
 * Get guidance for custom ECS error types
 *
 * @param error - The custom ECS error
 * @returns User-friendly guidance message
 * @internal
 */
function getCustomECSErrorGuidance(error: ECSError): string {
  switch (error.code) {
    case "CLUSTER_ERROR": {
      return getClusterErrorGuidance(error);
    }
    case "SERVICE_ERROR": {
      return getServiceErrorGuidance(error);
    }
    case "TASK_ERROR": {
      return getTaskErrorGuidance(error);
    }
    case "TASK_DEFINITION_ERROR": {
      return getTaskDefinitionErrorGuidance(error);
    }
    case "DEPLOYMENT_ERROR": {
      return getDeploymentErrorGuidance(error);
    }
    case "CAPACITY_PROVIDER_ERROR": {
      return "Check capacity provider configuration and auto scaling settings. Verify EC2 instances or Fargate capacity is available in the region.";
    }
    default: {
      return "Check your AWS credentials, IAM permissions, and ECS resource configuration. Verify resources exist in the correct region.";
    }
  }
}

/**
 * Get guidance for cluster-related errors
 *
 * @param error - The cluster error
 * @returns User-friendly guidance message
 * @internal
 */
function getClusterErrorGuidance(error: ECSError): string {
  if (error.metadata.operation === "create-cluster") {
    return "Verify cluster name is unique and follows AWS naming conventions. Check that you have sufficient IAM permissions for cluster creation.";
  }
  if (error.metadata.operation === "delete-cluster") {
    return "Ensure cluster has no active services or tasks. Use --force flag to delete cluster with running services. Check cluster status before deletion.";
  }
  if (error.metadata.operation === "describe-clusters") {
    return "Verify the cluster name exists in the specified region. Use 'aws-ts ecs cluster list' to see available clusters.";
  }
  return "Check cluster name is correct and exists in the specified region. Verify IAM permissions for cluster operations.";
}

/**
 * Get guidance for service-related errors
 *
 * @param error - The service error
 * @returns User-friendly guidance message
 * @internal
 */
function getServiceErrorGuidance(error: ECSError): string {
  if (error.metadata.operation === "create-service") {
    return "Verify task definition exists and is active. Check network configuration for VPC subnets and security groups. Ensure cluster has sufficient capacity.";
  }
  if (error.metadata.operation === "update-service") {
    return "Check that the service exists and is not already updating. Verify new task definition is registered and compatible with current deployment.";
  }
  if (error.metadata.operation === "delete-service") {
    return "Scale service to 0 desired count before deletion, or use --force flag. Check for active deployments before deleting service.";
  }
  if (error.message.includes("InvalidParameterException")) {
    return "Review service configuration parameters. Check task definition ARN format, subnet IDs, and security group configurations.";
  }
  return "Verify service name and cluster are correct. Check service status and ensure no conflicting operations are in progress.";
}

/**
 * Get guidance for task-related errors
 *
 * @param error - The task error
 * @returns User-friendly guidance message
 * @internal
 */
function getTaskErrorGuidance(error: ECSError): string {
  if (error.metadata.operation === "run-task") {
    return "Verify task definition is registered and active. Check network configuration and ensure cluster has available capacity for the task.";
  }
  if (error.metadata.operation === "stop-task") {
    return "Verify task ARN is correct and task is currently running. Check that you have permissions to stop the task.";
  }
  if (error.metadata.operation === "describe-tasks") {
    return "Verify task ARN format is correct. Use 'aws-ts ecs task list' to see available tasks in the cluster.";
  }
  return "Check task ARN format and verify the task exists. Ensure proper IAM permissions for task operations.";
}

/**
 * Get guidance for task definition-related errors
 *
 * @param error - The task definition error
 * @returns User-friendly guidance message
 * @internal
 */
function getTaskDefinitionErrorGuidance(error: ECSError): string {
  if (error.message.includes("ClientException")) {
    return "Review task definition JSON format and required fields. Check container definitions, CPU/memory allocations, and IAM role ARNs.";
  }
  return "Verify task definition family name and revision number. Check task definition is registered and active in the region.";
}

/**
 * Get guidance for deployment-related errors
 *
 * @param error - The deployment error
 * @returns User-friendly guidance message
 * @internal
 */
function getDeploymentErrorGuidance(error: ECSError): string {
  if (error.metadata.operation === "deploy") {
    return "Check task definition compatibility and service configuration. Monitor deployment events for detailed failure reasons.";
  }
  if (error.metadata.operation === "rollback") {
    return "Verify previous deployment exists and is eligible for rollback. Check service deployment history before attempting rollback.";
  }
  return "Monitor deployment status and check CloudWatch logs for detailed error information. Verify health check configuration.";
}

/**
 * Get guidance for AWS SDK error messages
 *
 * @param error - The generic Error object
 * @returns User-friendly guidance message
 * @internal
 */
function getAwsSdkErrorGuidance(error: Error): string {
  if (error.message.includes("ClusterNotFoundException")) {
    return "Cluster not found. Verify cluster name and region. Use 'aws-ts ecs cluster list' to see available clusters.";
  }
  if (error.message.includes("ServiceNotFoundException")) {
    return "Service not found. Verify service name and cluster. Use 'aws-ts ecs service list' to see available services.";
  }
  if (error.message.includes("TaskDefinitionNotFoundException")) {
    return "Task definition not found. Verify task definition family and revision number. Check task definition is registered.";
  }
  if (error.message.includes("InvalidParameterException")) {
    return "Invalid parameter provided. Review command arguments and ensure all required parameters are correctly formatted.";
  }
  if (error.message.includes("AccessDeniedException")) {
    return "Insufficient permissions. Verify IAM user/role has required ECS permissions. Check resource-based policies.";
  }
  if (error.message.includes("ThrottlingException")) {
    return "API rate limit exceeded. Implement exponential backoff and reduce request frequency. Consider using pagination for list operations.";
  }
  if (error.message.includes("ResourceInUseException")) {
    return "Resource is currently in use. Wait for ongoing operations to complete before retrying. Check resource status.";
  }
  if (error.message.includes("LimitExceededException")) {
    return "Service limit exceeded. Review AWS service quotas for ECS resources. Request limit increase if needed.";
  }
  return "Unknown ECS error. Check AWS credentials, IAM permissions, and resource configuration. Verify resources exist in the correct region.";
}

/**
 * Format ECS errors with user-friendly guidance
 *
 * Centralized error formatting function that provides consistent
 * error messaging across all ECS commands with contextual guidance
 * and optional verbose stack trace output.
 *
 * @param error - The error to format
 * @param operation - The ECS operation that failed (e.g., "list ECS services")
 * @param verbose - Whether to include verbose error details
 * @returns Formatted error message with guidance
 * @public
 */
export function formatECSError(error: unknown, operation: string, verbose: boolean): string {
  const guidance = getECSErrorGuidance(error);
  const errorMessage = error instanceof Error ? error.message : String(error);

  let formattedMessage = `Failed to ${operation}: ${errorMessage}`;

  if (guidance) {
    formattedMessage += `\n\nGuidance: ${guidance}`;
  }

  if (verbose && error instanceof Error && error.stack) {
    formattedMessage += `\n\nStack trace:\n${error.stack}`;
  }

  return formattedMessage;
}
