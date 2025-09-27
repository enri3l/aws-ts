/**
 * API Gateway-specific error types for AWS CLI operations
 *
 * Extends the base error system with API Gateway-specific error handling
 * for API discovery, configuration retrieval, and management operations.
 *
 */

import { BaseError } from "./errors.js";

/**
 * API Gateway error for general API Gateway operation failures
 *
 * Used when API Gateway operations fail, including service errors,
 * configuration issues, and API-level failures.
 *
 * @public
 */
export class ApiGatewayError extends BaseError {
  /**
   * Create a new API Gateway error
   *
   * @param message - User-friendly API Gateway error message
   * @param operation - The API Gateway operation that failed
   * @param apiId - The API ID involved in the operation
   * @param cause - The underlying error that caused the API Gateway failure
   * @param metadata - Additional API Gateway context
   */
  constructor(
    message: string,
    operation?: string,
    apiId?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "APIGW_ERROR", {
      operation,
      apiId,
      cause,
      ...metadata,
    });
  }
}

/**
 * API error for API Gateway API-specific failures
 *
 * Used when API operations fail, including API not found,
 * API status issues, and type detection failures.
 *
 * @public
 */
export class ApiError extends BaseError {
  /**
   * Create a new API error
   *
   * @param message - User-friendly API error message
   * @param apiId - The API that encountered the error
   * @param operation - The API operation that failed
   * @param apiType - The API type (rest, http, websocket)
   * @param metadata - Additional API context
   */
  constructor(
    message: string,
    apiId?: string,
    operation?: string,
    apiType?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "API_ERROR", {
      apiId,
      operation,
      apiType,
      ...metadata,
    });
  }
}

/**
 * API discovery error for API Gateway API listing and discovery failures
 *
 * Used when API discovery operations fail, including cross-service
 * API enumeration, type detection, and pagination issues.
 *
 * @public
 */
export class ApiDiscoveryError extends BaseError {
  /**
   * Create a new API discovery error
   *
   * @param message - User-friendly API discovery error message
   * @param operation - The discovery operation that failed
   * @param apiType - The API type being discovered (if specific)
   * @param cause - The underlying error that caused the discovery failure
   * @param metadata - Additional discovery context
   */
  constructor(
    message: string,
    operation?: string,
    apiType?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "API_DISCOVERY_ERROR", {
      operation,
      apiType,
      cause,
      ...metadata,
    });
  }
}

/**
 * API configuration error for API Gateway configuration retrieval failures
 *
 * Used when API configuration operations fail, including stage configurations,
 * resource/route configurations, and integration details.
 *
 * @public
 */
export class ApiConfigurationError extends BaseError {
  /**
   * Create a new API configuration error
   *
   * @param message - User-friendly API configuration error message
   * @param apiId - The API for which configuration retrieval failed
   * @param configType - The type of configuration that failed (stages, resources, routes, etc.)
   * @param operation - The configuration operation that failed
   * @param cause - The underlying error that caused the configuration failure
   * @param metadata - Additional configuration context
   */
  constructor(
    message: string,
    apiId?: string,
    configType?: string,
    operation?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "API_CONFIGURATION_ERROR", {
      apiId,
      configType,
      operation,
      cause,
      ...metadata,
    });
  }
}

/**
 * API type detection error for API Gateway type identification failures
 *
 * Used when API type detection fails, including cases where API metadata
 * is insufficient or ambiguous for determining the correct API type.
 *
 * @public
 */
export class ApiTypeDetectionError extends BaseError {
  /**
   * Create a new API type detection error
   *
   * @param message - User-friendly API type detection error message
   * @param apiId - The API for which type detection failed
   * @param availableMetadata - The metadata that was available for type detection
   * @param suggestedType - A suggested API type based on heuristics (if any)
   * @param metadata - Additional type detection context
   */
  constructor(
    message: string,
    apiId?: string,
    availableMetadata?: Record<string, unknown>,
    suggestedType?: string,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "API_TYPE_DETECTION_ERROR", {
      apiId,
      availableMetadata,
      suggestedType,
      ...metadata,
    });
  }
}

/**
 * Client selection error for API Gateway client management failures
 *
 * Used when dual-client management fails, including client creation,
 * client caching, and client selection based on API type.
 *
 * @public
 */
export class ClientSelectionError extends BaseError {
  /**
   * Create a new client selection error
   *
   * @param message - User-friendly client selection error message
   * @param operation - The operation that required client selection
   * @param apiType - The API type for which client selection failed
   * @param requestedClient - The client type that was requested
   * @param cause - The underlying error that caused the client selection failure
   * @param metadata - Additional client selection context
   */
  constructor(
    message: string,
    operation?: string,
    apiType?: string,
    requestedClient?: string,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "CLIENT_SELECTION_ERROR", {
      operation,
      apiType,
      requestedClient,
      cause,
      ...metadata,
    });
  }
}

/**
 * Pagination error for API Gateway pagination failures
 *
 * Used when paginated operations fail, including position token issues,
 * limit validation, and cross-service pagination coordination.
 *
 * @public
 */
export class PaginationError extends BaseError {
  /**
   * Create a new pagination error
   *
   * @param message - User-friendly pagination error message
   * @param operation - The paginated operation that failed
   * @param positionToken - The position token that caused the error (if applicable)
   * @param pageSize - The requested page size
   * @param cause - The underlying error that caused the pagination failure
   * @param metadata - Additional pagination context
   */
  constructor(
    message: string,
    operation?: string,
    positionToken?: string,
    pageSize?: number,
    cause?: unknown,
    metadata: Record<string, unknown> = {},
  ) {
    super(message, "PAGINATION_ERROR", {
      operation,
      positionToken,
      pageSize,
      cause,
      ...metadata,
    });
  }
}

/**
 * Check if an error is an API Gateway-related error
 *
 * @param error - The error to check
 * @returns True if the error is API Gateway-related
 *
 * @public
 */
export function isApiGatewayError(
  error: unknown,
): error is
  | ApiGatewayError
  | ApiError
  | ApiDiscoveryError
  | ApiConfigurationError
  | ApiTypeDetectionError
  | ClientSelectionError
  | PaginationError {
  return (
    error instanceof ApiGatewayError ||
    error instanceof ApiError ||
    error instanceof ApiDiscoveryError ||
    error instanceof ApiConfigurationError ||
    error instanceof ApiTypeDetectionError ||
    error instanceof ClientSelectionError ||
    error instanceof PaginationError
  );
}

/**
 * Get user-friendly guidance for API Gateway errors
 *
 * @param error - The error to provide guidance for
 * @returns User-friendly guidance message
 *
 * @public
 */
export function getApiGatewayErrorGuidance(error: unknown): string {
  if (isApiGatewayError(error)) {
    switch (error.code) {
      case "API_ERROR": {
        if (error.metadata.operation === "describe-api") {
          return "Verify the API ID is correct and the API exists in the specified region. Use 'aws-ts apigw list-apis' to see available APIs.";
        }
        if (error.message.includes("NotFoundException")) {
          return "The specified API was not found. Check the API ID and ensure it exists in the correct region.";
        }
        return "Check API ID, permissions, and ensure the API exists in the correct region with proper access rights.";
      }

      case "API_DISCOVERY_ERROR": {
        if (error.metadata.cause && String(error.metadata.cause).includes("AccessDenied")) {
          return "Insufficient permissions to list APIs. Ensure your AWS credentials have the necessary API Gateway permissions (apigateway:GET).";
        }
        return "Check your AWS credentials and API Gateway permissions. Verify you have access to list APIs in the specified region.";
      }

      case "API_CONFIGURATION_ERROR": {
        if (error.metadata.configType === "stages") {
          return "Failed to retrieve stage configuration. Verify the API has deployed stages and you have permissions to access stage details.";
        }
        if (error.metadata.configType === "resources") {
          return "Failed to retrieve resource configuration. This operation is only available for REST APIs. For HTTP/WebSocket APIs, use route configuration instead.";
        }
        if (error.metadata.configType === "routes") {
          return "Failed to retrieve route configuration. This operation is only available for HTTP and WebSocket APIs.";
        }
        return "Check API type compatibility and ensure you have permissions to access the requested configuration details.";
      }

      case "API_TYPE_DETECTION_ERROR": {
        if (error.metadata.suggestedType) {
          return `Unable to automatically detect API type. Try specifying --type ${error.metadata.suggestedType} explicitly, or use 'aws-ts apigw list-apis' to see API types.`;
        }
        return "Unable to detect API type from metadata. Specify the API type explicitly using the --type flag (rest, http, or websocket).";
      }

      case "CLIENT_SELECTION_ERROR": {
        return "Failed to create or select the appropriate AWS SDK client. Check your AWS credentials and region configuration.";
      }

      case "PAGINATION_ERROR": {
        if (error.metadata.positionToken) {
          return "Invalid pagination token. Start over without the position token or use a more recent token from a previous request.";
        }
        return "Pagination failed. Try reducing the page size using --max-items or restart the operation without pagination tokens.";
      }

      default: {
        return "Check your AWS credentials, API Gateway permissions, and region configuration. Verify the API exists and is accessible.";
      }
    }
  }

  return "Unknown API Gateway error. Check AWS credentials and API Gateway configuration.";
}

/**
 * Handle common API Gateway command errors with standardized messages
 *
 * @param error - The error that occurred
 * @param verbose - Whether to include verbose error details
 * @param context - Optional context for the operation that failed
 * @returns Formatted error message
 *
 * @public
 */
export function handleApiGwCommandError(error: unknown, verbose = false, context?: string): string {
  // Handle AWS SDK errors specifically
  if (error && typeof error === "object" && "name" in error) {
    switch ((error as { name: string }).name) {
      case "NotFoundException": {
        const apiContext = context ? ` for ${context}` : "";
        return `API not found${apiContext}. Verify the API ID and ensure it exists in the specified region.`;
      }
      case "UnauthorizedException":
      case "AccessDeniedException": {
        return "Access denied. Check your AWS credentials and API Gateway permissions.";
      }
      case "ThrottlingException": {
        return "Request throttled by API Gateway. Wait a moment and try again, or reduce request frequency.";
      }
      case "TooManyRequestsException": {
        return "Rate limit exceeded. Implement exponential backoff and retry, or reduce request frequency.";
      }
      case "BadRequestException": {
        return "Invalid request parameters. Check your command arguments and API ID format.";
      }
    }
  }

  // Handle JSON parsing errors
  if (error instanceof SyntaxError && error.message.includes("JSON")) {
    return `Invalid JSON in parameter: ${error.message}`;
  }

  // Handle file not found errors
  if (error instanceof Error && error.message.includes("ENOENT")) {
    const fileContext = context ? ` for ${context}` : "";
    return `File not found${fileContext}. Ensure the file path is correct.`;
  }

  // Handle validation errors
  if (error instanceof Error && error.message.includes("validation failed")) {
    return `Command validation failed: ${error.message}`;
  }

  // Handle all other errors with guidance
  const guidance = getApiGatewayErrorGuidance(error);
  const errorMessage = error instanceof Error ? error.message : String(error);

  if (verbose && isApiGatewayError(error)) {
    const metadata = JSON.stringify(error.metadata, undefined, 2);
    return `${errorMessage}\n\nDetails: ${metadata}\n\nGuidance: ${guidance}`;
  }

  return `${errorMessage}\n\n${guidance}`;
}
