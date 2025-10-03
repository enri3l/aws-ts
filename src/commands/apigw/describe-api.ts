/**
 * @module apigw/describe-api
 * API Gateway describe API command
 *
 * Retrieves detailed information about a specific API Gateway API
 * with automatic type detection and metadata display.
 *
 */

import { Args, Flags } from "@oclif/core";
import { handleApiGwCommandError } from "../../lib/apigw-errors.js";
import type { ApiGwDescribeApi } from "../../lib/apigw-schemas.js";
import { ApiGwDescribeApiSchema, validateApiId } from "../../lib/apigw-schemas.js";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import {
  ApiGwService,
  type ApiDescription,
  type HttpApiDescription,
  type RestApiDescription,
  type WebSocketApiDescription,
} from "../../services/apigw-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * API Gateway describe API command for detailed API information
 *
 * Provides information about a specific API including
 * metadata, configuration, and deployment details with automatic type detection.
 *
 * @public
 */
export default class ApigwDescribeApiCommand extends BaseCommand {
  static override readonly description =
    "Get detailed information about a specific API Gateway API";

  static override readonly examples = [
    {
      description: "Describe an API with automatic type detection",
      command: "<%= config.bin %> <%= command.id %> abc123def4",
    },
    {
      description: "Describe a REST API with type hint for faster lookup",
      command: "<%= config.bin %> <%= command.id %> abc123def4 --type rest",
    },
    {
      description: "Describe an HTTP API with JSON output",
      command: "<%= config.bin %> <%= command.id %> xyz789uvw1 --type http --format json",
    },
    {
      description: "Describe a WebSocket API in a specific region",
      command: "<%= config.bin %> <%= command.id %> mno456pqr7 --type websocket --region us-west-2",
    },
    {
      description: "Describe API with additional metadata included",
      command: "<%= config.bin %> <%= command.id %> def456ghi8 --include-metadata",
    },
    {
      description: "Describe API using a specific AWS profile with verbose output",
      command: "<%= config.bin %> <%= command.id %> jkl012mno3 --profile production --verbose",
    },
  ];

  static override readonly args = {
    apiId: Args.string({
      name: "apiId",
      description: "API Gateway API ID to describe",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    type: Flags.string({
      description: "API type hint for faster lookup (rest, http, websocket)",
      options: ["rest", "http", "websocket"],
      helpValue: "TYPE",
    }),

    "include-metadata": Flags.boolean({
      description: "Include additional metadata (stages, resources, etc.)",
      default: false,
    }),
  };

  /**
   * Execute the API Gateway describe API command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ApigwDescribeApiCommand);

    try {
      // Validate API ID format
      const apiId = validateApiId(args.apiId);

      // Validate input using Zod schema
      const input: ApiGwDescribeApi = ApiGwDescribeApiSchema.parse({
        apiId,
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
        type: flags.type,
        includeMetadata: flags["include-metadata"],
      });

      // Create API Gateway service instance
      const apiGwService = new ApiGwService({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      // Describe the API
      const apiDescription = await apiGwService.describeApi(
        input.apiId,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        input.type,
      );

      // Format output based on requested format
      this.formatAndDisplayOutput(apiDescription, input.format, input.includeMetadata);
    } catch (error) {
      const formattedError = handleApiGwCommandError(
        error,
        flags.verbose,
        `describe API '${args.apiId}'`,
      );
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the API description output
   *
   * @param api - API description to display
   * @param format - Output format to use
   * @param includeMetadata - Whether to include additional metadata
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    api: ApiDescription,
    format: string,
    includeMetadata: boolean,
  ): void {
    const apiType = this.detectApiTypeFromDescription(api);

    switch (format) {
      case "table": {
        this.displayTableFormat(api, apiType, includeMetadata);
        break;
      }

      case "json": {
        this.log(JSON.stringify(api, this.jsonReplacer.bind(this), 2));
        break;
      }

      case "jsonl": {
        this.log(JSON.stringify(api, this.jsonReplacer.bind(this)));
        break;
      }

      case "csv": {
        this.displayCsvFormat(api, apiType);
        break;
      }

      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }

  /**
   * Display API description in table format
   *
   * @param api - API description
   * @param apiType - Detected API type
   * @param includeMetadata - Whether to include additional metadata
   * @internal
   */
  private displayTableFormat(api: ApiDescription, apiType: string, includeMetadata: boolean): void {
    this.log(`\nAPI Gateway ${apiType.toUpperCase()} API Details:\n`);

    // Basic information
    const basicInfo = this.extractBasicInfo(api, apiType);
    this.displayKeyValueTable("Basic Information", basicInfo);

    // Configuration details
    if (includeMetadata) {
      const configInfo = this.extractConfigurationInfo(api, apiType);
      if (Object.keys(configInfo).length > 0) {
        this.log(""); // Empty line
        this.displayKeyValueTable("Configuration", configInfo);
      }

      // Endpoint configuration (REST APIs)
      const restApiEndpointConfig =
        apiType === "rest" ? (api as RestApiDescription).endpointConfiguration : undefined;
      if (restApiEndpointConfig) {
        this.log(""); // Empty line
        this.displayEndpointConfiguration(restApiEndpointConfig);
      }

      // CORS configuration (HTTP APIs)
      const httpApiCorsConfig =
        apiType === "http" ? (api as HttpApiDescription).corsConfiguration : undefined;
      if (httpApiCorsConfig) {
        this.log(""); // Empty line
        this.displayCorsConfiguration(httpApiCorsConfig);
      }
    }
  }

  /**
   * Display API description in CSV format
   *
   * @param api - API description
   * @param apiType - Detected API type
   * @internal
   */
  private displayCsvFormat(api: ApiDescription, apiType: string): void {
    const basicInfo = this.extractBasicInfo(api, apiType);

    const csvData = [
      { Property: "Property", Value: "Value" }, // Header row
      ...Object.entries(basicInfo).map(([key, value]) => ({
        Property: key,
        Value: String(value),
      })),
    ];

    const processor = new DataProcessor({ format: DataFormat.CSV });
    const output = processor.formatOutput(csvData.map((item, index) => ({ data: item, index })));
    this.log(output);
  }

  /**
   * Extract basic API information
   *
   * @param api - API description
   * @param apiType - API type
   * @returns Basic information object
   * @internal
   */
  private extractBasicInfo(api: ApiDescription, apiType: string): Record<string, string> {
    // Use type-safe API ID extraction
    const apiId =
      apiType === "rest"
        ? (api as RestApiDescription).id
        : (api as HttpApiDescription | WebSocketApiDescription).apiId;

    const info: Record<string, string> = {
      "API ID": apiId || "-",
      Name: api.name || "-",
      Type: apiType.toUpperCase(),
      Description: api.description || "-",
      Created: api.createdDate ? new Date(api.createdDate).toISOString() : "-",
      Version: api.version || "-",
    };

    // Add type-specific fields
    if (apiType === "rest") {
      const restApi = api as RestApiDescription;
      if ((restApi.endpointConfiguration?.types?.length ?? 0) > 0) {
        info["Endpoint Type"] = restApi.endpointConfiguration!.types!.join(", ");
      }
      if (restApi.apiKeySource) {
        info["API Key Source"] = restApi.apiKeySource;
      }
    } else {
      const v2Api = api as HttpApiDescription | WebSocketApiDescription;
      if (v2Api.protocolType) {
        info["Protocol"] = v2Api.protocolType;
      }
      if (v2Api.apiEndpoint) {
        info["Endpoint"] = v2Api.apiEndpoint;
      }
    }

    return info;
  }

  /**
   * Extract configuration information
   *
   * @param api - API description
   * @param apiType - API type
   * @returns Configuration information object
   * @internal
   */
  private extractConfigurationInfo(api: ApiDescription, apiType: string): Record<string, string> {
    switch (apiType) {
      case "rest": {
        return this.extractRestApiConfiguration(api as RestApiDescription);
      }
      case "http": {
        return this.extractHttpApiConfiguration(api as HttpApiDescription);
      }
      case "websocket": {
        return this.extractWebSocketApiConfiguration(api as WebSocketApiDescription);
      }
      default: {
        return {};
      }
    }
  }

  /**
   * Extract REST API specific configuration
   *
   * @param restApi - REST API description
   * @returns Configuration information object
   * @internal
   */
  private extractRestApiConfiguration(restApi: RestApiDescription): Record<string, string> {
    const config: Record<string, string> = {};

    if (restApi.minimumCompressionSize !== undefined) {
      config["Minimum Compression Size"] = String(restApi.minimumCompressionSize);
    }
    if ((restApi.binaryMediaTypes?.length ?? 0) > 0) {
      config["Binary Media Types"] = restApi.binaryMediaTypes!.join(", ");
    }
    if ((restApi.warnings?.length ?? 0) > 0) {
      config["Warnings"] = restApi.warnings!.join("; ");
    }

    return config;
  }

  /**
   * Extract HTTP API specific configuration
   *
   * @param httpApi - HTTP API description
   * @returns Configuration information object
   * @internal
   */
  private extractHttpApiConfiguration(httpApi: HttpApiDescription): Record<string, string> {
    const config: Record<string, string> = {};

    if (httpApi.apiGatewayManaged !== undefined) {
      config["API Gateway Managed"] = String(httpApi.apiGatewayManaged);
    }
    if (httpApi.routeSelectionExpression) {
      config["Route Selection"] = httpApi.routeSelectionExpression;
    }

    return config;
  }

  /**
   * Extract WebSocket API specific configuration
   *
   * @param wsApi - WebSocket API description
   * @returns Configuration information object
   * @internal
   */
  private extractWebSocketApiConfiguration(wsApi: WebSocketApiDescription): Record<string, string> {
    const config: Record<string, string> = {};

    // Note: apiGatewayManaged property doesn't exist on WebSocketApiDescription
    // if (wsApi.apiGatewayManaged !== undefined) {
    //   config["API Gateway Managed"] = String(wsApi.apiGatewayManaged);
    // }
    if (wsApi.routeSelectionExpression) {
      config["Route Selection"] = wsApi.routeSelectionExpression;
    }
    if (wsApi.apiKeySelectionExpression) {
      config["API Key Selection"] = wsApi.apiKeySelectionExpression;
    }
    if (wsApi.disableSchemaValidation !== undefined) {
      config["Schema Validation"] = wsApi.disableSchemaValidation ? "Disabled" : "Enabled";
    }

    return config;
  }

  /**
   * Display key-value table
   *
   * @param title - Table title
   * @param data - Key-value data
   * @internal
   */
  private displayKeyValueTable(title: string, data: Record<string, string>): void {
    this.log(`${title}:`);
    const maxKeyLength = Math.max(...Object.keys(data).map((key) => key.length));

    for (const [key, value] of Object.entries(data)) {
      this.log(`  ${key.padEnd(maxKeyLength)} : ${value}`);
    }
  }

  /**
   * Display endpoint configuration
   *
   * @param endpointConfig - Endpoint configuration
   * @internal
   */
  private displayEndpointConfiguration(
    endpointConfig: NonNullable<RestApiDescription["endpointConfiguration"]>,
  ): void {
    this.log("Endpoint Configuration:");
    if ((endpointConfig.types?.length ?? 0) > 0) {
      this.log(`  Types: ${endpointConfig.types!.join(", ")}`);
    }
    if ((endpointConfig.vpcEndpointIds?.length ?? 0) > 0) {
      this.log(`  VPC Endpoints: ${endpointConfig.vpcEndpointIds!.join(", ")}`);
    }
  }

  /**
   * Display CORS configuration
   *
   * @param corsConfig - CORS configuration
   * @internal
   */
  private displayCorsConfiguration(
    corsConfig: NonNullable<HttpApiDescription["corsConfiguration"]>,
  ): void {
    this.log("CORS Configuration:");
    if (corsConfig.allowCredentials !== undefined) {
      this.log(`  Allow Credentials: ${corsConfig.allowCredentials}`);
    }
    if ((corsConfig.allowMethods?.length ?? 0) > 0) {
      this.log(`  Allow Methods: ${corsConfig.allowMethods!.join(", ")}`);
    }
    if ((corsConfig.allowOrigins?.length ?? 0) > 0) {
      this.log(`  Allow Origins: ${corsConfig.allowOrigins!.join(", ")}`);
    }
    if ((corsConfig.allowHeaders?.length ?? 0) > 0) {
      this.log(`  Allow Headers: ${corsConfig.allowHeaders!.join(", ")}`);
    }
    if (corsConfig.maxAge !== undefined) {
      this.log(`  Max Age: ${corsConfig.maxAge} seconds`);
    }
  }

  /**
   * Detect API type from description object
   *
   * @param api - API description
   * @returns Detected API type
   * @internal
   */
  private detectApiTypeFromDescription(api: ApiDescription): string {
    if ("protocolType" in api && api.protocolType === "HTTP") return "http";
    if ("protocolType" in api && api.protocolType === "WEBSOCKET") return "websocket";
    if ("id" in api && !("protocolType" in api)) return "rest";
    return "unknown";
  }

  /**
   * JSON replacer for handling Date objects
   *
   * @param key - Object key
   * @param value - Object value
   * @returns Processed value
   * @internal
   */
  private jsonReplacer(key: string, value: unknown): unknown {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }
}
