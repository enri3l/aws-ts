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
  const operation = error.metadata.operation as string;
  const clusterName = error.metadata.clusterName as string;
  const clusterInfo = clusterName ? ` '${clusterName}'` : "";

  switch (operation) {
    case "list-clusters": {
      return [
        "Failed to list ECS clusters. Here's how to resolve it:",
        "1. Check your AWS credentials: aws sts get-caller-identity",
        "2. Verify region setting in your AWS configuration",
        "3. Ensure you have ecs:ListClusters permission",
        "",
        "Try: aws ecs list-clusters --region <your-region>",
      ].join("\n");
    }
    case "describe-clusters": {
      return [
        `Failed to describe ECS cluster${clusterInfo}:`,
        "1. Verify the cluster name exists in your region",
        "2. Check you have ecs:DescribeClusters permission",
        "3. List available clusters: aws-ts ecs cluster list",
        "4. Ensure you're using the correct AWS region",
        "",
        `Try: aws ecs describe-clusters --clusters ${clusterName || "<cluster-name>"}`,
      ].join("\n");
    }
    case "create-cluster": {
      return [
        `Failed to create ECS cluster${clusterInfo}:`,
        "1. Verify cluster name is unique in your region",
        "2. Check cluster name follows AWS naming conventions (letters, numbers, hyphens, underscores)",
        "3. Ensure you have ecs:CreateCluster permission",
        "4. If using capacity providers, verify they exist in your account",
        "5. Check for service quotas on number of clusters",
        "",
        `Try: aws ecs create-cluster --cluster-name ${clusterName || "<unique-name>"}`,
      ].join("\n");
    }
    case "update-cluster": {
      return [
        `Failed to update ECS cluster${clusterInfo}:`,
        "1. Verify the cluster exists and is in ACTIVE state",
        "2. Check you have ecs:UpdateCluster permission",
        "3. Ensure capacity provider updates are valid",
        "4. Verify no conflicting updates are in progress",
        "",
        `Try: aws ecs describe-clusters --clusters ${clusterName || "<cluster-name>"} to check status`,
      ].join("\n");
    }
    case "delete-cluster": {
      return [
        `Failed to delete ECS cluster${clusterInfo}:`,
        `1. Ensure cluster has no active services: aws-ts ecs service list --cluster ${clusterName || "<cluster>"}`,
        `2. Verify all tasks are stopped: aws-ts ecs task list --cluster ${clusterName || "<cluster>"}`,
        "3. Use --force flag to delete cluster with running services (not recommended)",
        "4. Check you have ecs:DeleteCluster permission",
        "",
        "Note: Delete all services and tasks before deleting the cluster for clean removal",
      ].join("\n");
    }
    default: {
      const failureMessage = clusterInfo
        ? `ECS cluster operation failed for cluster${clusterInfo}:`
        : "ECS cluster operation failed:";
      return [
        failureMessage,
        "1. Verify cluster name and region are correct",
        "2. Check IAM permissions for ECS cluster operations",
        "3. List clusters to verify: aws-ts ecs cluster list",
        "4. Review cluster status and configuration",
      ].join("\n");
    }
  }
}

/**
 * Get guidance for service-related errors
 *
 * @param error - The service error
 * @returns User-friendly guidance message
 * @internal
 */
function getServiceErrorGuidance(error: ECSError): string {
  const operation = error.metadata.operation as string;
  const serviceName = error.metadata.serviceName as string;
  const clusterName = error.metadata.clusterName as string;
  const serviceInfo = serviceName ? ` '${serviceName}'` : "";
  const clusterInfo = clusterName ? ` in cluster '${clusterName}'` : "";

  switch (operation) {
    case "list-services": {
      return [
        `Failed to list ECS services${clusterInfo}:`,
        "1. Check your AWS credentials and region",
        "2. Verify cluster name if specified: aws-ts ecs cluster list",
        "3. Ensure you have ecs:ListServices permission",
        "4. If listing across clusters, check permissions for all clusters",
        "",
        `Try: aws ecs list-services --cluster ${clusterName || "<cluster-name>"}`,
      ].join("\n");
    }
    case "describe-services": {
      return [
        `Failed to describe ECS service${serviceInfo}${clusterInfo}:`,
        "1. Verify the service name and cluster are correct",
        "2. Check you have ecs:DescribeServices permission",
        "3. List services to verify: aws-ts ecs service list --cluster <cluster>",
        "4. Ensure you're using the correct AWS region",
        "",
        `Try: aws ecs describe-services --cluster ${clusterName || "<cluster>"} --services ${serviceName || "<service>"}`,
      ].join("\n");
    }
    case "create-service": {
      return [
        `Failed to create ECS service${serviceInfo}${clusterInfo}:`,
        "1. Verify task definition exists and is ACTIVE: aws-ts lambda describe-function <td>",
        "2. Check network configuration: VPC, subnets, and security groups must be valid",
        "3. Ensure cluster has sufficient capacity (EC2 instances or Fargate)",
        "4. Verify you have ecs:CreateService permission",
        "5. If using load balancer, check target group ARN and port mappings",
        "6. Review IAM role for task execution (taskRoleArn, executionRoleArn)",
        "",
        "Common issues:",
        "  - Subnet IDs must be in the same VPC as security groups",
        "  - Task definition must support Fargate if using FARGATE launch type",
        "  - Load balancer target group must be in the same VPC",
      ].join("\n");
    }
    case "update-service": {
      return [
        `Failed to update ECS service${serviceInfo}${clusterInfo}:`,
        "1. Verify service exists and is not currently updating",
        "2. Check new task definition is registered: aws ecs describe-task-definition",
        "3. Ensure task definition is compatible with current service configuration",
        "4. Verify you have ecs:UpdateService permission",
        "5. Wait for any in-progress deployments to complete",
        "",
        `Try: aws-ts ecs service describe ${serviceName || "<service>"} --cluster ${clusterName || "<cluster>"} to check status`,
      ].join("\n");
    }
    case "delete-service": {
      return [
        `Failed to delete ECS service${serviceInfo}${clusterInfo}:`,
        "1. Scale service to 0 desired count: aws-ts ecs service scale <service> --desired-count 0",
        "2. Wait for all tasks to stop (this may take a few minutes)",
        "3. Use --force flag to delete service with running tasks (not recommended)",
        "4. Check you have ecs:DeleteService permission",
        "5. Verify no active deployments are in progress",
        "",
        "Note: Service deletion requires desired count to be 0 unless using --force",
      ].join("\n");
    }
    case "scale-service": {
      return [
        `Failed to scale ECS service${serviceInfo}${clusterInfo}:`,
        "1. Verify service exists and cluster has sufficient capacity",
        "2. Check desired count is within service limits (0 to max)",
        "3. Ensure you have ecs:UpdateService permission",
        "4. If scaling up, verify cluster has available EC2 instances or Fargate capacity",
        "",
        "Note: Scaling is performed via UpdateService with desired count modification",
      ].join("\n");
    }
    case "restart-service": {
      return [
        `Failed to restart ECS service${serviceInfo}${clusterInfo}:`,
        "1. Verify service exists and is in ACTIVE state",
        "2. Check you have ecs:UpdateService permission",
        "3. Ensure no other updates are in progress",
        "4. Review service health checks and deployment configuration",
        "",
        "Note: Restart triggers force new deployment to replace all tasks",
      ].join("\n");
    }
    default: {
      if (error.message.includes("InvalidParameterException")) {
        return [
          `Invalid parameter in ECS service operation${serviceInfo}:`,
          "1. Review all service configuration parameters",
          "2. Check task definition ARN format: family:revision or full ARN",
          "3. Verify subnet IDs are valid and in the correct VPC",
          "4. Ensure security group IDs exist in your account",
          "5. Validate load balancer configuration if using ELB",
          "",
          "Common issues:",
          "  - Subnet and security group must be in the same VPC",
          "  - Container name/port must match task definition",
          "  - Network mode must support your launch type (awsvpc for Fargate)",
        ].join("\n");
      }
      return [
        `ECS service operation failed${serviceInfo}${clusterInfo}:`,
        "1. Verify service name and cluster are correct",
        "2. Check IAM permissions for ECS service operations",
        "3. Ensure service is in expected state",
        "4. Review service events for detailed error information",
        "",
        `Try: aws-ts ecs service describe ${serviceName || "<service>"} --cluster ${clusterName || "<cluster>"}`,
      ].join("\n");
    }
  }
}

/**
 * Get guidance for task-related errors
 *
 * @param error - The task error
 * @returns User-friendly guidance message
 * @internal
 */
function getTaskErrorGuidance(error: ECSError): string {
  const operation = error.metadata.operation as string;
  const taskArn = error.metadata.taskArn as string;
  const taskInfo = taskArn ? ` '${taskArn}'` : "";

  switch (operation) {
    case "list-tasks": {
      return [
        "Failed to list ECS tasks:",
        "1. Check your AWS credentials and region",
        "2. Verify cluster name if specified",
        "3. Ensure you have ecs:ListTasks permission",
        "4. Check filter parameters (service name, launch type, etc.)",
        "",
        "Try: aws ecs list-tasks --cluster <cluster-name>",
      ].join("\n");
    }
    case "describe-tasks": {
      return [
        `Failed to describe ECS task${taskInfo}:`,
        "1. Verify task ARN format: arn:aws:ecs:region:account:task/cluster/task-id",
        "2. Check you have ecs:DescribeTasks permission",
        "3. Ensure task exists: aws-ts ecs task list --cluster <cluster>",
        "4. Verify you're using the correct AWS region and cluster",
        "",
        "Try: aws ecs describe-tasks --cluster <cluster> --tasks <task-arn>",
      ].join("\n");
    }
    case "run-task": {
      return [
        "Failed to run ECS task:",
        "1. Verify task definition is registered and ACTIVE",
        "2. Check network configuration: VPC, subnets, security groups",
        "3. Ensure cluster has available capacity (EC2 or Fargate)",
        "4. Verify you have ecs:RunTask permission",
        "5. If using Fargate, check platform version compatibility",
        "6. Review IAM execution role (executionRoleArn) for ECR/CloudWatch access",
        "",
        "Common issues:",
        "  - Task definition must exist: aws ecs describe-task-definition --task-definition <name>",
        "  - Subnet must have available IP addresses",
        "  - Security group must allow required traffic",
        "  - Fargate requires awsvpc network mode",
      ].join("\n");
    }
    case "stop-task": {
      return [
        `Failed to stop ECS task${taskInfo}:`,
        "1. Verify task ARN is correct and task is running",
        "2. Check you have ecs:StopTask permission",
        "3. List running tasks: aws-ts ecs task list --cluster <cluster>",
        "4. Ensure task is not already stopped or stopping",
        "",
        "Note: Tasks can take a few moments to stop gracefully",
        "Try: aws ecs stop-task --cluster <cluster> --task <task-arn>",
      ].join("\n");
    }
    case "exec-task": {
      return [
        `Failed to execute command in ECS task${taskInfo}:`,
        "1. Verify ECS Exec is enabled on the task",
        "2. Ensure container has required SSM agent (Amazon Linux 2 or later)",
        "3. Check task role has ssmmessages:* permissions",
        "4. Verify execute-command is enabled: aws-ts ecs task describe <task>",
        "5. Ensure Session Manager plugin is installed locally",
        "",
        "Enable ECS Exec:",
        "  - Update service with --enable-execute-command flag",
        "  - Or run task with --enable-execute-command flag",
        "  - Task role needs: ssmmessages:CreateControlChannel, ssmmessages:CreateDataChannel, ssmmessages:OpenControlChannel, ssmmessages:OpenDataChannel",
      ].join("\n");
    }
    case "logs-task": {
      return [
        `Failed to stream logs for ECS task${taskInfo}:`,
        "1. Verify task has CloudWatch Logs configured in task definition",
        "2. Check you have logs:GetLogEvents permission",
        "3. Ensure log group and stream exist in CloudWatch",
        "4. Verify task execution role has logs:CreateLogStream permission",
        "",
        "Task definition must include:",
        '  logConfiguration: { logDriver: "awslogs", options: { "awslogs-group": "...", "awslogs-region": "...", "awslogs-stream-prefix": "..." } }',
      ].join("\n");
    }
    case "events-task": {
      return [
        `Failed to retrieve events for ECS task${taskInfo}:`,
        "1. Verify task ARN is correct",
        "2. Check you have ecs:DescribeTasks permission",
        "3. Task events are included in DescribeTasks response",
        "",
        "Note: Task events provide deployment and state change history",
      ].join("\n");
    }
    case "wait-task": {
      return [
        `Failed to wait for ECS task${taskInfo}:`,
        "1. Verify task ARN is correct and task exists",
        "2. Check you have ecs:DescribeTasks permission",
        "3. Ensure timeout is reasonable for operation",
        "4. Review task status and events for failure reasons",
        "",
        "Common wait conditions: tasks-running, tasks-stopped",
      ].join("\n");
    }
    default: {
      return [
        `ECS task operation failed${taskInfo}:`,
        "1. Verify task ARN format and cluster",
        "2. Check IAM permissions for ECS task operations",
        "3. List tasks to verify: aws-ts ecs task list",
        "4. Review task status and events",
        "",
        "Try: aws ecs describe-tasks --cluster <cluster> --tasks <task-arn>",
      ].join("\n");
    }
  }
}

/**
 * Get guidance for task definition-related errors
 *
 * @param error - The task definition error
 * @returns User-friendly guidance message
 * @internal
 */
function getTaskDefinitionErrorGuidance(error: ECSError): string {
  const taskDefinitionArn = error.metadata.taskDefinitionArn as string;
  const tdInfo = taskDefinitionArn ? ` '${taskDefinitionArn}'` : "";

  if (error.message.includes("ClientException")) {
    return [
      `Invalid task definition${tdInfo}:`,
      "1. Review task definition JSON format and required fields",
      "2. Check container definitions are valid (name, image, memory, CPU)",
      "3. Verify CPU and memory allocations are within limits",
      "4. Ensure IAM role ARNs are valid (taskRoleArn, executionRoleArn)",
      "5. Validate port mappings and network mode compatibility",
      "",
      "Required fields for Fargate:",
      "  - requiresCompatibilities: ['FARGATE']",
      "  - networkMode: 'awsvpc'",
      "  - cpu and memory at task level (not just container level)",
      "  - executionRoleArn for ECR/CloudWatch access",
    ].join("\n");
  }

  return [
    `Task definition operation failed${tdInfo}:`,
    "1. Verify task definition family name and revision number",
    "2. Check task definition is registered: aws ecs describe-task-definition",
    "3. Ensure task definition is in ACTIVE status",
    "4. Verify you're using the correct AWS region",
    "",
    "Task definition format: family:revision or full ARN",
  ].join("\n");
}

/**
 * Get guidance for deployment-related errors
 *
 * @param error - The deployment error
 * @returns User-friendly guidance message
 * @internal
 */
function getDeploymentErrorGuidance(error: ECSError): string {
  const operation = error.metadata.operation as string;
  const serviceName = error.metadata.serviceName as string;
  const clusterName = error.metadata.clusterName as string;
  const deploymentId = error.metadata.deploymentId as string;
  const serviceInfo = serviceName ? ` for service '${serviceName}'` : "";
  const clusterInfo = clusterName ? ` in cluster '${clusterName}'` : "";

  switch (operation) {
    case "deploy": {
      return [
        `ECS deployment failed${serviceInfo}${clusterInfo}:`,
        "1. Check task definition compatibility with service configuration",
        "2. Monitor deployment events: aws-ts ecs service describe <service>",
        "3. Verify health check configuration and targets",
        "4. Ensure cluster has sufficient capacity for new tasks",
        "5. Review CloudWatch logs for container startup errors",
        "",
        "Common deployment failures:",
        "  - Container image not found or no ECR pull permissions",
        "  - Container fails health checks or exits immediately",
        "  - Insufficient CPU/memory in cluster",
        "  - Load balancer target group health checks failing",
        "  - Task execution role missing required permissions",
        "",
        "Troubleshooting:",
        "  1. Check service events for failure reasons",
        "  2. Review CloudWatch logs for container errors",
        "  3. Verify task definition can run: aws-ts ecs task run",
        "  4. Test container locally if possible",
      ].join("\n");
    }
    case "rollback": {
      return [
        `ECS deployment rollback failed${serviceInfo}${clusterInfo}:`,
        "1. Verify previous deployment exists and is eligible for rollback",
        "2. Check service deployment history: aws-ts ecs service describe <service>",
        "3. Ensure previous task definition is still active",
        "4. Verify you have ecs:UpdateService permission",
        "",
        "Note: Rollback updates service to use previous task definition",
        `Try: aws ecs update-service --cluster ${clusterName || "<cluster>"} --service ${serviceName || "<service>"} --task-definition <previous-td>`,
      ].join("\n");
    }
    case "stop-deployment": {
      const deploymentMessage = deploymentId
        ? `Failed to stop deployment '${deploymentId}':`
        : "Failed to stop deployment:";
      return [
        deploymentMessage,
        "1. Verify deployment ID is correct",
        "2. Check deployment is in progress (not already completed)",
        "3. Ensure you have ecs:UpdateService permission",
        "",
        "Note: Stopping deployment reverts to previous stable deployment",
      ].join("\n");
    }
    default: {
      return [
        `ECS deployment operation failed${serviceInfo}${clusterInfo}:`,
        "1. Monitor deployment status via service events",
        "2. Check CloudWatch logs for detailed error information",
        "3. Verify health check configuration for load balancers",
        "4. Review task definition and service configuration",
        "5. Ensure deployment configuration (min/max healthy percent) is appropriate",
        "",
        `Try: aws-ts ecs service describe ${serviceName || "<service>"} --cluster ${clusterName || "<cluster>"}`,
      ].join("\n");
    }
  }
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
