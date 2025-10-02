/**
 * @module ssm/ssm-guidance
 * User-friendly error resolution guidance for SSM operations
 *
 * Provides step-by-step resolution guidance for common SSM errors,
 * separated from error definitions to avoid circular imports.
 */

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
 * Get guidance for SSMSessionError
 *
 * @param error - The session error
 * @returns Formatted guidance message
 * @internal
 */
function getSessionErrorGuidance(error: ErrorLike): string {
  const operation = error.metadata.operation as string;
  const instanceId = error.metadata.instanceId as string;
  const instanceInfo = instanceId ? ` for instance '${instanceId}'` : "";

  switch (operation) {
    case "start-session": {
      return [
        `Failed to start SSM session${instanceInfo}:`,
        "1. Verify instance is running and SSM Agent is installed",
        "2. Check instance has SSM managed instance role (AmazonSSMManagedInstanceCore)",
        "3. Ensure security groups allow outbound HTTPS (port 443) to SSM endpoints",
        "4. Verify SSM Agent is connected: aws ssm describe-instance-information",
        "5. Check you have ssm:StartSession permission",
        "",
        "SSM Agent must be version 2.3.672.0 or later for Session Manager",
      ].join("\n");
    }
    case "terminate-session": {
      return [
        "Failed to terminate SSM session:",
        "1. Verify the session ID is correct and session exists",
        "2. Check you have ssm:TerminateSession permission",
        "3. Session may have already terminated or expired",
        "",
        "Try: aws ssm describe-sessions --state Active",
      ].join("\n");
    }
    case "describe-sessions": {
      return [
        "Failed to describe SSM sessions:",
        "1. Check you have ssm:DescribeSessions permission",
        "2. Verify the session state filter is valid (Active or History)",
        "3. Ensure you're using the correct AWS region",
        "",
        "Sessions are region-specific",
      ].join("\n");
    }
    default: {
      return [
        "Failed to perform SSM session operation:",
        "1. Check AWS credentials: aws sts get-caller-identity",
        "2. Verify region setting in your AWS configuration",
        "3. Ensure you have appropriate SSM permissions",
        "4. Check SSM Agent status on target instances",
        "",
        "Try: aws ssm describe-instance-information --region <your-region>",
      ].join("\n");
    }
  }
}

/**
 * Get guidance for SSMParameterError
 *
 * @param error - The parameter error
 * @returns Formatted guidance message
 * @internal
 */
function getParameterErrorGuidance(error: ErrorLike): string {
  const operation = error.metadata.operation as string;
  const parameterName = error.metadata.parameterName as string;
  const parameterInfo = parameterName ? ` '${parameterName}'` : "";

  switch (operation) {
    case "get-parameter": {
      return [
        `Failed to get parameter${parameterInfo}:`,
        "1. Verify the parameter name is correct and exists",
        "2. Check you have ssm:GetParameter permission",
        "3. For SecureString parameters, ensure you have kms:Decrypt permission",
        "4. Verify you're using the correct AWS region",
        "",
        "Parameter names are case-sensitive and must start with /",
      ].join("\n");
    }
    case "put-parameter": {
      return [
        `Failed to put parameter${parameterInfo}:`,
        "1. Check you have ssm:PutParameter permission",
        "2. Verify parameter name follows naming rules (starts with /, max 2048 chars)",
        "3. For SecureString, ensure you have kms:Encrypt permission",
        "4. Use --overwrite flag to update existing parameters",
        "5. Check parameter value size (4KB for Standard, 8KB for Advanced tier)",
        "",
        "Advanced tier parameters incur charges beyond free tier limits",
      ].join("\n");
    }
    case "delete-parameter": {
      return [
        `Failed to delete parameter${parameterInfo}:`,
        "1. Verify the parameter exists",
        "2. Check you have ssm:DeleteParameter permission",
        "3. Ensure no other services are actively using this parameter",
        "",
        "Deleted parameters cannot be recovered",
      ].join("\n");
    }
    case "list-parameters": {
      return [
        "Failed to list parameters:",
        "1. Check you have ssm:DescribeParameters permission",
        "2. Verify the path filter is valid (must start with /)",
        "3. Ensure you're using the correct AWS region",
        "",
        "Use --recursive to include parameters in nested paths",
      ].join("\n");
    }
    default: {
      return [
        "Failed to perform parameter operation:",
        "1. Check AWS credentials: aws sts get-caller-identity",
        "2. Verify region setting in your AWS configuration",
        "3. Ensure you have appropriate SSM Parameter Store permissions",
        "",
        "Try: aws ssm describe-parameters --region <your-region>",
      ].join("\n");
    }
  }
}

/**
 * Get guidance for SSMInstanceError
 *
 * @param error - The instance error
 * @returns Formatted guidance message
 * @internal
 */
function getInstanceErrorGuidance(error: ErrorLike): string {
  const operation = error.metadata.operation as string;
  const instanceId = error.metadata.instanceId as string;
  const instanceInfo = instanceId ? ` '${instanceId}'` : "";

  switch (operation) {
    case "list-instances": {
      return [
        "Failed to list managed instances:",
        "1. Check you have ssm:DescribeInstanceInformation permission",
        "2. Verify instances have SSM Agent installed and running",
        "3. Ensure instances have IAM role with AmazonSSMManagedInstanceCore policy",
        "4. Check network connectivity (outbound HTTPS to SSM endpoints)",
        "",
        "Instances must have SSM Agent 2.3.672.0 or later",
      ].join("\n");
    }
    case "describe-instance": {
      return [
        `Failed to describe instance${instanceInfo}:`,
        "1. Verify the instance ID is correct",
        "2. Check instance has SSM Agent installed and reporting",
        "3. Ensure you have ssm:DescribeInstanceInformation permission",
        "4. Verify you're using the correct AWS region",
        "",
        "Instance must be registered with SSM to appear in results",
      ].join("\n");
    }
    default: {
      return [
        "Failed to perform instance operation:",
        "1. Check AWS credentials: aws sts get-caller-identity",
        "2. Verify instances have SSM Agent installed and running",
        "3. Ensure instances have appropriate IAM role",
        "4. Check security groups allow outbound HTTPS (port 443)",
        "",
        "Try: aws ssm describe-instance-information --region <your-region>",
      ].join("\n");
    }
  }
}

/**
 * Get guidance for SSMDocumentError
 *
 * @param error - The document error
 * @returns Formatted guidance message
 * @internal
 */
function getDocumentErrorGuidance(error: ErrorLike): string {
  const operation = error.metadata.operation as string;
  const documentName = error.metadata.documentName as string;
  const documentInfo = documentName ? ` '${documentName}'` : "";

  switch (operation) {
    case "list-documents": {
      return [
        "Failed to list SSM documents:",
        "1. Check you have ssm:ListDocuments permission",
        "2. Verify document filters are valid",
        "3. Ensure you're using the correct AWS region",
        "",
        "Use owner filter to see AWS-managed or custom documents",
      ].join("\n");
    }
    case "describe-document": {
      return [
        `Failed to describe document${documentInfo}:`,
        "1. Verify the document name is correct and exists",
        "2. Check you have ssm:DescribeDocument permission",
        "3. Ensure document version is valid if specified",
        "4. Verify you're using the correct AWS region",
        "",
        "Document names are case-sensitive",
      ].join("\n");
    }
    default: {
      return [
        "Failed to perform document operation:",
        "1. Check AWS credentials: aws sts get-caller-identity",
        "2. Verify region setting in your AWS configuration",
        "3. Ensure you have appropriate SSM document permissions",
        "",
        "Try: aws ssm list-documents --region <your-region>",
      ].join("\n");
    }
  }
}

/**
 * Get guidance for SSMConnectionError
 *
 * @param error - The connection error
 * @returns Formatted guidance message
 * @internal
 */
function getConnectionErrorGuidance(error: ErrorLike): string {
  const connectionType = error.metadata.connectionType as string;
  const instanceId = error.metadata.instanceId as string;
  const port = error.metadata.port as number;

  switch (connectionType) {
    case "ssh": {
      return [
        `Failed to establish SSH connection to ${instanceId || "instance"}:`,
        "1. Verify session-manager-plugin is installed and in PATH",
        "2. Check SSH key permissions (must be 400 or 600)",
        "3. Ensure instance has SSH enabled and sshd running",
        "4. Verify AWS credentials are valid and not expired",
        "5. Check ProxyCommand in ~/.ssh/config is correctly configured",
        "",
        "Install plugin: https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html",
      ].join("\n");
    }
    case "port-forward": {
      const portMessage = port ? `on port ${port}` : "";
      const portSuffix = portMessage ? ` ${portMessage}` : "";
      return [
        `Failed to establish port forwarding${portSuffix}:`,
        "1. Verify session-manager-plugin is installed and in PATH",
        "2. Check local port is available (not in use by another process)",
        "3. Ensure remote port is accessible from the instance",
        "4. Verify AWS credentials are valid and not expired",
        "5. Check you have ssm:StartSession permission",
        "",
        port
          ? `Try: lsof -i :${port} to check if port is in use`
          : "Try: lsof -i :PORT to check if port is in use",
      ].join("\n");
    }
    case "remote-port-forward": {
      return [
        "Failed to establish remote port forwarding:",
        "1. Verify session-manager-plugin is installed and in PATH",
        "2. Check target host is accessible from the instance",
        "3. Ensure remote port is not firewalled on target host",
        "4. Verify DNS resolution works from the instance perspective",
        "5. Check you have ssm:StartSession permission",
        "",
        "Remote host is resolved from the instance, not your local machine",
      ].join("\n");
    }
    default: {
      return [
        "Failed to establish SSM connection:",
        "1. Verify session-manager-plugin is installed: session-manager-plugin --version",
        "2. Check AWS credentials: aws sts get-caller-identity",
        "3. Ensure SSM Agent is running on target instance",
        "4. Verify network connectivity and security group rules",
        "",
        "Session Manager requires plugin version 1.2.0 or later",
      ].join("\n");
    }
  }
}

/**
 * Get user-friendly resolution guidance for SSM errors
 *
 * @param error - The SSM error to get guidance for
 * @returns Resolution guidance message
 *
 * @public
 */
export function getSSMErrorGuidance(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const typedError = error as ErrorLike;
    switch (typedError.code) {
      case "SSM_SESSION_ERROR": {
        return getSessionErrorGuidance(typedError);
      }
      case "SSM_PARAMETER_ERROR": {
        return getParameterErrorGuidance(typedError);
      }
      case "SSM_INSTANCE_ERROR": {
        return getInstanceErrorGuidance(typedError);
      }
      case "SSM_DOCUMENT_ERROR": {
        return getDocumentErrorGuidance(typedError);
      }
      case "SSM_CONNECTION_ERROR": {
        return getConnectionErrorGuidance(typedError);
      }
    }
  }

  // Check for AWS SDK SSM-specific errors
  if (error && typeof error === "object" && "name" in error) {
    const awsError = error as { name: string; message?: string };
    switch (awsError.name) {
      case "ParameterNotFound": {
        return [
          "Parameter does not exist:",
          "1. Verify the parameter name is correct (case-sensitive)",
          "2. Check you're using the correct AWS region",
          "3. List parameters to see available parameters: aws ssm describe-parameters",
          "",
          "Parameter names must start with / and follow hierarchical path format",
        ].join("\n");
      }
      case "ParameterAlreadyExists": {
        return [
          "Parameter already exists:",
          "1. Use --overwrite flag to update the existing parameter",
          "2. Or choose a different parameter name",
          "3. Use get-parameter to view current value before overwriting",
          "",
          "Overwriting parameters creates a new version",
        ].join("\n");
      }
      case "TargetNotConnected": {
        return [
          "Instance is not connected to SSM:",
          "1. Verify SSM Agent is installed and running on the instance",
          "2. Check instance has IAM role with AmazonSSMManagedInstanceCore policy",
          "3. Ensure security groups allow outbound HTTPS (port 443) to SSM endpoints",
          "4. Verify instance can reach SSM service endpoints",
          "",
          "Run: systemctl status amazon-ssm-agent (Linux) or Get-Service AmazonSSMAgent (Windows)",
        ].join("\n");
      }
      case "InvalidInstanceId": {
        return [
          "Invalid instance ID:",
          "1. Verify instance ID format (i-xxxxxxxxxxxxxxxxx or mi-xxxxxxxxxxxxxxxx)",
          "2. Check instance exists in your AWS account",
          "3. Ensure you're using the correct AWS region",
          "",
          "Instance IDs are region-specific",
        ].join("\n");
      }
      case "InvalidDocument": {
        return [
          "Invalid or non-existent document:",
          "1. Verify document name is correct (case-sensitive)",
          "2. Check document exists: aws ssm describe-document --name DOCUMENT_NAME",
          "3. Ensure document is compatible with target instance platform",
          "",
          "AWS-managed documents start with AWS- or SSM- prefix",
        ].join("\n");
      }
      default: {
        return [
          "SSM operation failed:",
          "1. Check AWS credentials: aws sts get-caller-identity",
          "2. Verify IAM permissions for SSM operations",
          "3. Ensure SSM service is available in your region",
          "4. Check CloudTrail logs for detailed error information",
          "",
          "Try: aws ssm describe-instance-information to verify SSM connectivity",
        ].join("\n");
      }
    }
  }

  return [
    "An unexpected error occurred during SSM operation:",
    "1. Verify your AWS credentials are valid",
    "2. Check you have appropriate SSM permissions",
    "3. Ensure you're using the correct AWS region",
    "4. Try the operation again with --verbose flag for more details",
    "",
    "For persistent issues, check AWS Service Health Dashboard",
  ].join("\n");
}
