/**
 * API Gateway service for high-level API discovery and configuration operations
 *
 * Orchestrates API Gateway operations by providing a unified interface for
 * API discovery, description, and configuration retrieval across REST, HTTP,
 * and WebSocket APIs. Integrates with existing credential management for
 * seamless AWS SDK dual-client creation.
 *
 */

import { APIGatewayClient } from "@aws-sdk/client-api-gateway";
import { ApiGatewayV2Client } from "@aws-sdk/client-apigatewayv2";
import ora from "ora";
import {
  ApiConfigurationError,
  ApiDiscoveryError,
  ApiGatewayError,
  ApiTypeDetectionError,
} from "../lib/apigw-errors.js";
import { detectApiType, type ApiType, type UnifiedApi } from "../lib/apigw-schemas.js";
import { ServiceError } from "../lib/errors.js";
import { CredentialService, type AwsClientConfig } from "./credential-service.js";

/**
 * Spinner interface for progress indicators
 * @internal
 */
interface SpinnerInterface {
  text: string;
  succeed: (message?: string) => void;
  fail: (message?: string) => void;
  warn: (message?: string) => void;
}

/**
 * Configuration options for API Gateway service
 *
 * @public
 */
export interface ApiGwServiceOptions {
  /**
   * Credential service configuration
   */
  credentialService?: {
    defaultRegion?: string;
    defaultProfile?: string;
    enableDebugLogging?: boolean;
  };

  /**
   * Enable debug logging for API Gateway operations
   */
  enableDebugLogging?: boolean;

  /**
   * Enable progress indicators for long-running operations
   */
  enableProgressIndicators?: boolean;

  /**
   * API Gateway client configuration overrides
   */
  clientConfig?: {
    region?: string;
    profile?: string;
    endpoint?: string;
  };
}

/**
 * API Gateway API description for REST APIs
 *
 * @public
 */
export interface RestApiDescription {
  id: string;
  name: string;
  description?: string | undefined;
  createdDate?: Date | undefined;
  version?: string | undefined;
  warnings?: string[] | undefined;
  binaryMediaTypes?: string[] | undefined;
  minimumCompressionSize?: number | undefined;
  apiKeySource?: string | undefined;
  endpointConfiguration?:
    | {
        types?: string[] | undefined;
        vpcEndpointIds?: string[] | undefined;
      }
    | undefined;
  policy?: string | undefined;
  tags?: Record<string, string> | undefined;
}

/**
 * API Gateway API description for HTTP APIs
 *
 * @public
 */
export interface HttpApiDescription {
  apiId: string;
  name: string;
  description?: string | undefined;
  createdDate?: Date | undefined;
  protocolType: "HTTP";
  apiEndpoint?: string | undefined;
  apiGatewayManaged?: boolean | undefined;
  version?: string | undefined;
  corsConfiguration?:
    | {
        allowCredentials?: boolean | undefined;
        allowHeaders?: string[] | undefined;
        allowMethods?: string[] | undefined;
        allowOrigins?: string[] | undefined;
        exposeHeaders?: string[] | undefined;
        maxAge?: number | undefined;
      }
    | undefined;
  routeSelectionExpression?: string | undefined;
  importInfo?: string[] | undefined;
  warnings?: string[] | undefined;
  tags?: Record<string, string> | undefined;
}

/**
 * API Gateway API description for WebSocket APIs
 *
 * @public
 */
export interface WebSocketApiDescription {
  apiId: string;
  name: string;
  description?: string | undefined;
  createdDate?: Date | undefined;
  protocolType: "WEBSOCKET";
  apiEndpoint?: string | undefined;
  version?: string | undefined;
  routeSelectionExpression?: string | undefined;
  apiKeySelectionExpression?: string | undefined;
  disableSchemaValidation?: boolean | undefined;
  disableExecuteApiEndpoint?: boolean | undefined;
  importInfo?: string[] | undefined;
  warnings?: string[] | undefined;
  tags?: Record<string, string> | undefined;
}

/**
 * API Gateway stage configuration
 *
 * @public
 */
export interface StageConfiguration {
  stageName: string;
  description?: string | undefined;
  deploymentId?: string | undefined;
  variables?: Record<string, string> | undefined;
  throttleSettings?:
    | {
        rateLimit?: number | undefined;
        burstLimit?: number | undefined;
      }
    | undefined;
  cachingEnabled?: boolean | undefined;
  cacheClusterEnabled?: boolean | undefined;
  cacheClusterSize?: string | undefined;
  cacheKeyParameters?: string[] | undefined;
  canarySettings?:
    | {
        percentTraffic?: number | undefined;
        deploymentId?: string | undefined;
        useStageCache?: boolean | undefined;
      }
    | undefined;
  accessLogSettings?:
    | {
        destinationArn?: string | undefined;
        format?: string | undefined;
      }
    | undefined;
  clientCertificateId?: string | undefined;
  tracingConfig?:
    | {
        tracingEnabled?: boolean | undefined;
      }
    | undefined;
  webAclArn?: string | undefined;
  lastUpdatedDate?: Date | undefined;
  createdDate?: Date | undefined;
  tags?: Record<string, string> | undefined;
}

/**
 * Unified API configuration response
 *
 * @public
 */
export interface ApiConfiguration {
  api: RestApiDescription | HttpApiDescription | WebSocketApiDescription;
  stages?: StageConfiguration[] | undefined;
  resources?: any[] | undefined; // REST API specific
  routes?: any[] | undefined; // HTTP/WebSocket API specific
  integrations?: any[] | undefined;
  authorizers?: any[] | undefined;
  models?: any[] | undefined; // REST API specific
  requestValidators?: any[] | undefined; // REST API specific
  corsConfiguration?: any | undefined;
  domainNames?: any[] | undefined;
}

/**
 * API listing parameters
 *
 * @public
 */
export interface ApiListingParameters {
  type?: ApiType | undefined;
  maxItems?: number | undefined;
  position?: string | undefined;
}

/**
 * Paginated API listing result
 *
 * @public
 */
export interface PaginatedApiResult {
  apis: UnifiedApi[];
  position?: string | undefined;
  hasMore: boolean;
}

/**
 * API Gateway service for high-level API operations
 *
 * Provides a unified interface for all API Gateway operations,
 * coordinating with credential management and providing comprehensive error handling.
 *
 * @public
 */
export class ApiGwService {
  private readonly credentialService: CredentialService;
  private readonly options: ApiGwServiceOptions;
  private restApiClientCache = new Map<string, APIGatewayClient>();
  private v2ApiClientCache = new Map<string, ApiGatewayV2Client>();

  /**
   * Create a new API Gateway service instance
   *
   * @param options - Configuration options for the service
   */
  constructor(options: ApiGwServiceOptions = {}) {
    this.options = {
      ...options,
      enableProgressIndicators:
        options.enableProgressIndicators ??
        (process.env.NODE_ENV !== "test" && !process.env.CI && !process.env.VITEST),
    };

    this.credentialService = new CredentialService({
      enableDebugLogging: options.enableDebugLogging ?? false,
      ...options.credentialService,
    });
  }

  /**
   * Get REST API Gateway client with caching
   *
   * @param config - Client configuration options
   * @returns REST API Gateway client instance
   * @internal
   */
  private async getRestApiClient(config: AwsClientConfig = {}): Promise<APIGatewayClient> {
    const cacheKey = `${config.region || "default"}-${config.profile || "default"}`;

    if (!this.restApiClientCache.has(cacheKey)) {
      const clientConfig = {
        ...config,
        ...this.options.clientConfig,
      };

      const client = await this.credentialService.createClient(APIGatewayClient, clientConfig);
      this.restApiClientCache.set(cacheKey, client);
    }

    return this.restApiClientCache.get(cacheKey)!;
  }

  /**
   * Get HTTP/WebSocket API Gateway client with caching
   *
   * @param config - Client configuration options
   * @returns V2 API Gateway client instance
   * @internal
   */
  private async getV2ApiClient(config: AwsClientConfig = {}): Promise<ApiGatewayV2Client> {
    const cacheKey = `v2-${config.region || "default"}-${config.profile || "default"}`;

    if (!this.v2ApiClientCache.has(cacheKey)) {
      const clientConfig = {
        ...config,
        ...this.options.clientConfig,
      };

      const client = await this.credentialService.createClient(ApiGatewayV2Client, clientConfig);
      this.v2ApiClientCache.set(cacheKey, client);
    }

    return this.v2ApiClientCache.get(cacheKey)!;
  }

  /**
   * Create a progress spinner if enabled
   *
   * @param text - Initial spinner text
   * @returns Spinner instance or mock object
   * @internal
   */
  private createSpinner(text: string): SpinnerInterface {
    return (this.options.enableProgressIndicators ?? true)
      ? ora(text).start()
      : {
          text,
          succeed: () => {},
          fail: () => {},
          warn: () => {},
        };
  }

  /**
   * List REST APIs
   *
   * @param config - Client configuration options
   * @param params - Listing parameters
   * @returns Promise resolving to REST APIs
   * @internal
   */
  private async listRestApis(
    config: AwsClientConfig = {},
    parameters: ApiListingParameters = {},
  ): Promise<UnifiedApi[]> {
    try {
      const client = await this.getRestApiClient(config);
      const { GetRestApisCommand } = await import("@aws-sdk/client-api-gateway");

      const command = new GetRestApisCommand({
        limit: parameters.maxItems,
        position: parameters.position,
      });

      const response = await client.send(command);
      const restApis = response.items || [];

      return restApis.map(
        (api): UnifiedApi => ({
          id: api.id!,
          name: api.name!,
          type: "rest" as const,
          description: api.description,
          endpoint: `https://${api.id}.execute-api.${config.region || "us-east-1"}.amazonaws.com`,
          endpointType: api.endpointConfiguration?.types?.[0],
          createdDate: api.createdDate,
          version: api.version,
          apiKeySource: api.apiKeySource,
        }),
      );
    } catch (error) {
      throw new ApiDiscoveryError(
        `Failed to list REST APIs: ${error instanceof Error ? error.message : String(error)}`,
        "list-rest-apis",
        "rest",
        error,
      );
    }
  }

  /**
   * List HTTP APIs
   *
   * @param config - Client configuration options
   * @param params - Listing parameters
   * @returns Promise resolving to HTTP APIs
   * @internal
   */
  private async listHttpApis(
    config: AwsClientConfig = {},
    parameters: ApiListingParameters = {},
  ): Promise<UnifiedApi[]> {
    try {
      const client = await this.getV2ApiClient(config);
      const { GetApisCommand } = await import("@aws-sdk/client-apigatewayv2");

      const command = new GetApisCommand({
        MaxResults: parameters.maxItems?.toString(),
        NextToken: parameters.position,
      });

      const response = await client.send(command);
      const apis = response.Items || [];

      return apis
        .filter((api) => api.ProtocolType === "HTTP")
        .map(
          (api): UnifiedApi => ({
            id: api.ApiId!,
            name: api.Name!,
            type: "http" as const,
            description: api.Description,
            endpoint: api.ApiEndpoint,
            protocolType: api.ProtocolType as "HTTP",
            createdDate: api.CreatedDate,
            version: api.Version,
          }),
        );
    } catch (error) {
      throw new ApiDiscoveryError(
        `Failed to list HTTP APIs: ${error instanceof Error ? error.message : String(error)}`,
        "list-http-apis",
        "http",
        error,
      );
    }
  }

  /**
   * List WebSocket APIs
   *
   * @param config - Client configuration options
   * @param params - Listing parameters
   * @returns Promise resolving to WebSocket APIs
   * @internal
   */
  private async listWebSocketApis(
    config: AwsClientConfig = {},
    parameters: ApiListingParameters = {},
  ): Promise<UnifiedApi[]> {
    try {
      const client = await this.getV2ApiClient(config);
      const { GetApisCommand } = await import("@aws-sdk/client-apigatewayv2");

      const command = new GetApisCommand({
        MaxResults: parameters.maxItems?.toString(),
        NextToken: parameters.position,
      });

      const response = await client.send(command);
      const apis = response.Items || [];

      return apis
        .filter((api) => api.ProtocolType === "WEBSOCKET")
        .map(
          (api): UnifiedApi => ({
            id: api.ApiId!,
            name: api.Name!,
            type: "websocket" as const,
            description: api.Description,
            endpoint: api.ApiEndpoint,
            protocolType: api.ProtocolType as "WEBSOCKET",
            createdDate: api.CreatedDate,
            version: api.Version,
          }),
        );
    } catch (error) {
      throw new ApiDiscoveryError(
        `Failed to list WebSocket APIs: ${error instanceof Error ? error.message : String(error)}`,
        "list-websocket-apis",
        "websocket",
        error,
      );
    }
  }

  /**
   * List all API Gateway APIs across REST, HTTP, and WebSocket types
   *
   * @param config - Client configuration options
   * @param params - Listing parameters
   * @returns Promise resolving to unified API list
   * @throws When API listing fails
   */
  async listApis(
    config: AwsClientConfig = {},
    parameters: ApiListingParameters = {},
  ): Promise<PaginatedApiResult> {
    const spinner = this.createSpinner("Discovering API Gateway APIs...");

    try {
      let apis: UnifiedApi[] = [];

      if (!parameters.type || parameters.type === "rest") {
        const restApis = await this.listRestApis(config, parameters);
        apis = [...apis, ...restApis];
      }

      if (!parameters.type || parameters.type === "http") {
        const httpApis = await this.listHttpApis(config, parameters);
        apis = [...apis, ...httpApis];
      }

      if (!parameters.type || parameters.type === "websocket") {
        const webSocketApis = await this.listWebSocketApis(config, parameters);
        apis = [...apis, ...webSocketApis];
      }

      // Sort by creation date (newest first) and then by name
      apis.sort((a, b) => {
        if (a.createdDate && b.createdDate) {
          return b.createdDate.getTime() - a.createdDate.getTime();
        }
        return a.name.localeCompare(b.name);
      });

      // Apply global limit if specified
      if (parameters.maxItems && apis.length > parameters.maxItems) {
        apis = apis.slice(0, parameters.maxItems);
      }

      spinner.succeed(`Found ${apis.length} API Gateway APIs`);

      return {
        apis,
        hasMore: false, // For now, we don't support cross-service pagination
      };
    } catch (error) {
      spinner.fail("Failed to list APIs");

      if (error instanceof ApiDiscoveryError) {
        throw error;
      }

      throw new ServiceError(
        `Failed to list API Gateway APIs: ${error instanceof Error ? error.message : String(error)}`,
        "APIGateway",
        "list-apis",
        error,
      );
    }
  }

  /**
   * Describe an API Gateway API with automatic type detection
   *
   * @param apiId - API ID to describe
   * @param config - Client configuration options
   * @param apiTypeHint - Optional API type hint for optimization
   * @returns Promise resolving to API description
   * @throws When API description fails
   */
  async describeApi(
    apiId: string,
    config: AwsClientConfig = {},
    apiTypeHint?: ApiType,
  ): Promise<RestApiDescription | HttpApiDescription | WebSocketApiDescription> {
    const spinner = this.createSpinner(`Describing API '${apiId}'...`);

    try {
      // Try the hinted type first, if provided
      if (apiTypeHint) {
        try {
          return await this.describeApiByType(apiId, apiTypeHint, config);
        } catch {
          // If hint fails, fall through to auto-detection
          if (this.options.enableDebugLogging) {
            console.debug(
              `API type hint '${apiTypeHint}' failed for ${apiId}, attempting auto-detection`,
            );
          }
        }
      }

      // Try REST API first (most common)
      try {
        const result = await this.describeApiByType(apiId, "rest", config);
        spinner.succeed(`Described REST API '${apiId}'`);
        return result;
      } catch (restError) {
        // Try HTTP API
        try {
          const result = await this.describeApiByType(apiId, "http", config);
          spinner.succeed(`Described HTTP API '${apiId}'`);
          return result;
        } catch (httpError) {
          // Try WebSocket API
          try {
            const result = await this.describeApiByType(apiId, "websocket", config);
            spinner.succeed(`Described WebSocket API '${apiId}'`);
            return result;
          } catch (wsError) {
            spinner.fail(`Failed to describe API '${apiId}'`);
            throw new ApiTypeDetectionError(
              `Unable to determine API type for '${apiId}'. API may not exist or you may lack permissions.`,
              apiId,
              { restError, httpError, wsError },
            );
          }
        }
      }
    } catch (error) {
      spinner.fail(`Failed to describe API '${apiId}'`);

      if (error instanceof ApiTypeDetectionError) {
        throw error;
      }

      throw new ApiGatewayError(
        `Failed to describe API '${apiId}': ${error instanceof Error ? error.message : String(error)}`,
        "describe-api",
        apiId,
        error,
      );
    }
  }

  /**
   * Describe an API by specific type
   *
   * @param apiId - API ID to describe
   * @param apiType - Specific API type
   * @param config - Client configuration options
   * @returns Promise resolving to typed API description
   * @internal
   */
  private async describeApiByType(
    apiId: string,
    apiType: ApiType,
    config: AwsClientConfig = {},
  ): Promise<RestApiDescription | HttpApiDescription | WebSocketApiDescription> {
    switch (apiType) {
      case "rest": {
        const client = await this.getRestApiClient(config);
        const { GetRestApiCommand } = await import("@aws-sdk/client-api-gateway");

        const response = await client.send(new GetRestApiCommand({ restApiId: apiId }));

        return {
          id: response.id!,
          name: response.name!,
          description: response.description,
          createdDate: response.createdDate,
          version: response.version,
          warnings: response.warnings,
          binaryMediaTypes: response.binaryMediaTypes,
          minimumCompressionSize: response.minimumCompressionSize,
          apiKeySource: response.apiKeySource,
          endpointConfiguration: response.endpointConfiguration,
          policy: response.policy,
          tags: response.tags,
        };
      }

      case "http": {
        const client = await this.getV2ApiClient(config);
        const { GetApiCommand } = await import("@aws-sdk/client-apigatewayv2");

        const response = await client.send(new GetApiCommand({ ApiId: apiId }));

        return {
          apiId: response.ApiId!,
          name: response.Name!,
          description: response.Description,
          createdDate: response.CreatedDate,
          protocolType: "HTTP",
          apiEndpoint: response.ApiEndpoint,
          apiGatewayManaged: response.ApiGatewayManaged,
          version: response.Version,
          corsConfiguration: response.CorsConfiguration
            ? {
                allowCredentials: response.CorsConfiguration.AllowCredentials,
                allowHeaders: response.CorsConfiguration.AllowHeaders,
                allowMethods: response.CorsConfiguration.AllowMethods,
                allowOrigins: response.CorsConfiguration.AllowOrigins,
                exposeHeaders: response.CorsConfiguration.ExposeHeaders,
                maxAge: response.CorsConfiguration.MaxAge,
              }
            : undefined,
          routeSelectionExpression: response.RouteSelectionExpression,
          importInfo: response.ImportInfo,
          warnings: response.Warnings,
          tags: response.Tags,
        };
      }

      case "websocket": {
        const client = await this.getV2ApiClient(config);
        const { GetApiCommand } = await import("@aws-sdk/client-apigatewayv2");

        const response = await client.send(new GetApiCommand({ ApiId: apiId }));

        return {
          apiId: response.ApiId!,
          name: response.Name!,
          description: response.Description,
          createdDate: response.CreatedDate,
          protocolType: "WEBSOCKET",
          apiEndpoint: response.ApiEndpoint,
          version: response.Version,
          routeSelectionExpression: response.RouteSelectionExpression,
          apiKeySelectionExpression: response.ApiKeySelectionExpression,
          disableSchemaValidation: response.DisableSchemaValidation,
          disableExecuteApiEndpoint: response.DisableExecuteApiEndpoint,
          importInfo: response.ImportInfo,
          warnings: response.Warnings,
          tags: response.Tags,
        };
      }

      default: {
        throw new ApiTypeDetectionError(`Unsupported API type: ${apiType}`, apiId, {
          requestedType: apiType,
        });
      }
    }
  }

  /**
   * Get comprehensive API configuration
   *
   * @param apiId - API ID to get configuration for
   * @param config - Client configuration options
   * @param options - Configuration retrieval options
   * @returns Promise resolving to API configuration
   * @throws When configuration retrieval fails
   */
  async getApiConfiguration(
    apiId: string,
    config: AwsClientConfig = {},
    options: {
      apiTypeHint?: ApiType | undefined;
      includeStages?: boolean | undefined;
      includeResources?: boolean | undefined;
      includeRoutes?: boolean | undefined;
      includeIntegrations?: boolean | undefined;
      includeAuthorizers?: boolean | undefined;
      includeCors?: boolean | undefined;
    } = {},
  ): Promise<ApiConfiguration> {
    const spinner = this.createSpinner(`Retrieving configuration for API '${apiId}'...`);

    try {
      // First, describe the API to determine its type
      const api = await this.describeApi(apiId, config, options.apiTypeHint);
      const apiType = detectApiType(api);

      const configuration: ApiConfiguration = { api };

      // Get stages (available for all API types)
      if (options.includeStages !== false) {
        try {
          configuration.stages = await this.getApiStages(apiId, apiType, config);
        } catch (error) {
          if (this.options.enableDebugLogging) {
            console.debug(`Failed to retrieve stages for API ${apiId}:`, error);
          }
        }
      }

      // Get additional configuration based on API type
      switch (apiType) {
        case "rest": {
          if (options.includeResources !== false) {
            try {
              configuration.resources = await this.getRestApiResources(apiId, config);
            } catch (error) {
              if (this.options.enableDebugLogging) {
                console.debug(`Failed to retrieve resources for REST API ${apiId}:`, error);
              }
            }
          }
          break;
        }

        case "http":
        case "websocket": {
          if (options.includeRoutes !== false) {
            try {
              configuration.routes = await this.getV2ApiRoutes(apiId, config);
            } catch (error) {
              if (this.options.enableDebugLogging) {
                console.debug(`Failed to retrieve routes for ${apiType} API ${apiId}:`, error);
              }
            }
          }

          if (options.includeIntegrations !== false) {
            try {
              configuration.integrations = await this.getV2ApiIntegrations(apiId, config);
            } catch (error) {
              if (this.options.enableDebugLogging) {
                console.debug(
                  `Failed to retrieve integrations for ${apiType} API ${apiId}:`,
                  error,
                );
              }
            }
          }
          break;
        }
      }

      spinner.succeed(`Retrieved configuration for ${apiType.toUpperCase()} API '${apiId}'`);
      return configuration;
    } catch (error) {
      spinner.fail(`Failed to retrieve API configuration for '${apiId}'`);

      throw new ApiConfigurationError(
        `Failed to retrieve API configuration for '${apiId}': ${error instanceof Error ? error.message : String(error)}`,
        apiId,
        "full-configuration",
        "get-api-config",
        error,
      );
    }
  }

  /**
   * Get API stages
   *
   * @param apiId - API ID
   * @param apiType - API type
   * @param config - Client configuration
   * @returns Promise resolving to stage configurations
   * @internal
   */
  private async getApiStages(
    apiId: string,
    apiType: ApiType,
    config: AwsClientConfig = {},
  ): Promise<StageConfiguration[]> {
    switch (apiType) {
      case "rest": {
        const client = await this.getRestApiClient(config);
        const { GetStagesCommand } = await import("@aws-sdk/client-api-gateway");

        const response = await client.send(new GetStagesCommand({ restApiId: apiId }));

        return (response.item || []).map(
          (stage): StageConfiguration => ({
            stageName: stage.stageName!,
            description: stage.description,
            deploymentId: stage.deploymentId,
            variables: stage.variables,
            cachingEnabled: stage.cacheClusterEnabled,
            cacheClusterEnabled: stage.cacheClusterEnabled,
            cacheClusterSize: stage.cacheClusterSize,
            lastUpdatedDate: stage.lastUpdatedDate,
            createdDate: stage.createdDate,
          }),
        );
      }

      case "http":
      case "websocket": {
        const client = await this.getV2ApiClient(config);
        const { GetStagesCommand } = await import("@aws-sdk/client-apigatewayv2");

        const response = await client.send(new GetStagesCommand({ ApiId: apiId }));

        return (response.Items || []).map(
          (stage): StageConfiguration => ({
            stageName: stage.StageName!,
            description: stage.Description,
            deploymentId: stage.DeploymentId,
            variables: stage.StageVariables,
            accessLogSettings: stage.AccessLogSettings
              ? {
                  destinationArn: stage.AccessLogSettings.DestinationArn,
                  format: stage.AccessLogSettings.Format,
                }
              : undefined,
            lastUpdatedDate: stage.LastUpdatedDate,
            createdDate: stage.CreatedDate,
          }),
        );
      }

      default: {
        throw new ApiConfigurationError(
          `Unsupported API type for stage retrieval: ${apiType}`,
          apiId,
          "stages",
          "get-stages",
        );
      }
    }
  }

  /**
   * Get REST API resources
   *
   * @param apiId - REST API ID
   * @param config - Client configuration
   * @returns Promise resolving to resources
   * @internal
   */
  private async getRestApiResources(apiId: string, config: AwsClientConfig = {}): Promise<any[]> {
    const client = await this.getRestApiClient(config);
    const { GetResourcesCommand } = await import("@aws-sdk/client-api-gateway");

    const response = await client.send(new GetResourcesCommand({ restApiId: apiId }));
    return response.items || [];
  }

  /**
   * Get V2 API routes
   *
   * @param apiId - API ID
   * @param config - Client configuration
   * @returns Promise resolving to routes
   * @internal
   */
  private async getV2ApiRoutes(apiId: string, config: AwsClientConfig = {}): Promise<any[]> {
    const client = await this.getV2ApiClient(config);
    const { GetRoutesCommand } = await import("@aws-sdk/client-apigatewayv2");

    const response = await client.send(new GetRoutesCommand({ ApiId: apiId }));
    return response.Items || [];
  }

  /**
   * Get V2 API integrations
   *
   * @param apiId - API ID
   * @param config - Client configuration
   * @returns Promise resolving to integrations
   * @internal
   */
  private async getV2ApiIntegrations(apiId: string, config: AwsClientConfig = {}): Promise<any[]> {
    const client = await this.getV2ApiClient(config);
    const { GetIntegrationsCommand } = await import("@aws-sdk/client-apigatewayv2");

    const response = await client.send(new GetIntegrationsCommand({ ApiId: apiId }));
    return response.Items || [];
  }
}
