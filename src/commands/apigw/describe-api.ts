/**
 * API Gateway describe API command
 *
 * Retrieves detailed information about a specific API Gateway API
 * with automatic type detection and comprehensive metadata display.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { handleApiGwCommandError } from "../../lib/apigw-errors.js";
import type { ApiGwDescribeApi } from "../../lib/apigw-schemas.js";
import { ApiGwDescribeApiSchema, validateApiId } from "../../lib/apigw-schemas.js";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { ApiGwService } from "../../services/apigw-service.js";

/**
 * API Gateway describe API command for detailed API information
 *
 * Provides comprehensive information about a specific API including
 * metadata, configuration, and deployment details with automatic type detection.
 *
 * @public
 */
export default class ApigwDescribeApiCommand extends Command {
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
    type: Flags.string({
      description: "API type hint for faster lookup (rest, http, websocket)",
      options: ["rest", "http", "websocket"],
      helpValue: "TYPE",
    }),

    "include-metadata": Flags.boolean({
      description: "Include additional metadata (stages, resources, etc.)",
      default: false,
    }),

    region: Flags.string({
      char: "r",
      description: "AWS region containing the API",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for API description",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the API Gateway describe API command
   *
   * @returns Promise resolving when command execution is complete
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
  private formatAndDisplayOutput(api: any, format: string, includeMetadata: boolean): void {
    const apiType = this.detectApiTypeFromDescription(api);

    switch (format) {
      case "table": {
        this.displayTableFormat(api, apiType, includeMetadata);
        break;
      }

      case "json": {
        this.log(JSON.stringify(api, this.jsonReplacer, 2));
        break;
      }

      case "jsonl": {
        this.log(JSON.stringify(api, this.jsonReplacer));
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
  private displayTableFormat(api: any, apiType: string, includeMetadata: boolean): void {
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
      if (apiType === "rest" && api.endpointConfiguration) {
        this.log(""); // Empty line
        this.displayEndpointConfiguration(api.endpointConfiguration);
      }

      // CORS configuration (HTTP APIs)
      if (apiType === "http" && api.corsConfiguration) {
        this.log(""); // Empty line
        this.displayCorsConfiguration(api.corsConfiguration);
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
  private displayCsvFormat(api: any, apiType: string): void {
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
  private extractBasicInfo(api: any, apiType: string): Record<string, string> {
    const info: Record<string, string> = {
      "API ID": api.id || api.apiId || "-",
      Name: api.name || "-",
      Type: apiType.toUpperCase(),
      Description: api.description || "-",
      Created: api.createdDate ? new Date(api.createdDate).toISOString() : "-",
      Version: api.version || "-",
    };

    // Add type-specific fields
    if (apiType === "rest") {
      if (api.endpointConfiguration?.types?.length > 0) {
        info["Endpoint Type"] = api.endpointConfiguration.types.join(", ");
      }
      if (api.apiKeySource) {
        info["API Key Source"] = api.apiKeySource;
      }
    } else {
      if (api.protocolType) {
        info["Protocol"] = api.protocolType;
      }
      if (api.apiEndpoint) {
        info["Endpoint"] = api.apiEndpoint;
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
  private extractConfigurationInfo(api: any, apiType: string): Record<string, string> {
    const config: Record<string, string> = {};

    if (apiType === "rest") {
      if (api.minimumCompressionSize !== undefined) {
        config["Minimum Compression Size"] = String(api.minimumCompressionSize);
      }
      if (api.binaryMediaTypes?.length > 0) {
        config["Binary Media Types"] = api.binaryMediaTypes.join(", ");
      }
      if (api.warnings?.length > 0) {
        config["Warnings"] = api.warnings.join("; ");
      }
    } else {
      if (api.apiGatewayManaged !== undefined) {
        config["API Gateway Managed"] = String(api.apiGatewayManaged);
      }
      if (api.routeSelectionExpression) {
        config["Route Selection"] = api.routeSelectionExpression;
      }
      if (apiType === "websocket") {
        if (api.apiKeySelectionExpression) {
          config["API Key Selection"] = api.apiKeySelectionExpression;
        }
        if (api.disableSchemaValidation !== undefined) {
          config["Schema Validation"] = api.disableSchemaValidation ? "Disabled" : "Enabled";
        }
      }
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
  private displayEndpointConfiguration(endpointConfig: any): void {
    this.log("Endpoint Configuration:");
    if (endpointConfig.types?.length > 0) {
      this.log(`  Types: ${endpointConfig.types.join(", ")}`);
    }
    if (endpointConfig.vpcEndpointIds?.length > 0) {
      this.log(`  VPC Endpoints: ${endpointConfig.vpcEndpointIds.join(", ")}`);
    }
  }

  /**
   * Display CORS configuration
   *
   * @param corsConfig - CORS configuration
   * @internal
   */
  private displayCorsConfiguration(corsConfig: any): void {
    this.log("CORS Configuration:");
    if (corsConfig.allowCredentials !== undefined) {
      this.log(`  Allow Credentials: ${corsConfig.allowCredentials}`);
    }
    if (corsConfig.allowMethods?.length > 0) {
      this.log(`  Allow Methods: ${corsConfig.allowMethods.join(", ")}`);
    }
    if (corsConfig.allowOrigins?.length > 0) {
      this.log(`  Allow Origins: ${corsConfig.allowOrigins.join(", ")}`);
    }
    if (corsConfig.allowHeaders?.length > 0) {
      this.log(`  Allow Headers: ${corsConfig.allowHeaders.join(", ")}`);
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
  private detectApiTypeFromDescription(api: any): string {
    if (api.protocolType === "HTTP") return "http";
    if (api.protocolType === "WEBSOCKET") return "websocket";
    if (api.id && !api.protocolType) return "rest";
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
  private jsonReplacer(key: string, value: any): any {
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value;
  }
}
