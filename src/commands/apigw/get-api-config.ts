/**
 * API Gateway get API configuration command
 *
 * Retrieves configuration details for a specific API Gateway API
 * including stages, resources/routes, integrations, and authorizers.
 *
 */

import type { Integration as RestIntegration } from "@aws-sdk/client-api-gateway";
import type { Route, Integration as V2Integration } from "@aws-sdk/client-apigatewayv2";
import { Args, Flags } from "@oclif/core";
import { handleApiGwCommandError } from "../../lib/apigw-errors.js";
import type { ApiGwGetApiConfig } from "../../lib/apigw-schemas.js";
import { ApiGwGetApiConfigSchema, validateApiId } from "../../lib/apigw-schemas.js";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import {
  ApiGwService,
  type ApiConfiguration,
  type HttpApiDescription,
  type RestApiDescription,
  type WebSocketApiDescription,
} from "../../services/apigw-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * Configuration summary info structure
 * @internal
 */
interface SummaryInfo {
  count: number;
  details: string;
}

/**
 * API Gateway get API configuration command for configuration export
 *
 * Provides detailed configuration information including stages, resources/routes,
 * integrations, authorizers, and CORS settings with format options for export.
 *
 * @public
 */
export default class ApigwGetApiConfigCommand extends BaseCommand {
  static override readonly description = "Get configuration details for an API Gateway API";

  static override readonly examples = [
    {
      description: "Get complete API configuration with all components",
      command: "<%= config.bin %> <%= command.id %> abc123def4",
    },
    {
      description: "Get REST API configuration with type hint",
      command: "<%= config.bin %> <%= command.id %> abc123def4 --type rest",
    },
    {
      description: "Get HTTP API configuration excluding integrations",
      command:
        "<%= config.bin %> <%= command.id %> xyz789uvw1 --type http --no-include-integrations",
    },
    {
      description: "Get API configuration with JSON output for automation",
      command: "<%= config.bin %> <%= command.id %> def456ghi8 --format json",
    },
    {
      description: "Get minimal API configuration (stages only)",
      command:
        "<%= config.bin %> <%= command.id %> jkl012mno3 --no-include-resources --no-include-routes --no-include-integrations --no-include-authorizers",
    },
    {
      description: "Get WebSocket API configuration in specific region",
      command: "<%= config.bin %> <%= command.id %> mno456pqr7 --type websocket --region us-west-2",
    },
    {
      description: "Export API configuration for backup or migration",
      command: "<%= config.bin %> <%= command.id %> stu901vwx2 --format json > api-backup.json",
    },
  ];

  static override readonly args = {
    apiId: Args.string({
      name: "apiId",
      description: "API Gateway API ID to get configuration for",
      required: true,
    }),
  };

  static override readonly flags = {
    type: Flags.string({
      description: "API type hint for faster lookup (rest, http, websocket)",
      options: ["rest", "http", "websocket"],
      helpValue: "TYPE",
    }),

    "include-stages": Flags.boolean({
      description: "Include stage configurations",
      default: true,
      allowNo: true,
    }),

    "include-resources": Flags.boolean({
      description: "Include resource configurations (REST APIs only)",
      default: true,
      allowNo: true,
    }),

    "include-routes": Flags.boolean({
      description: "Include route configurations (HTTP/WebSocket APIs only)",
      default: true,
      allowNo: true,
    }),

    "include-integrations": Flags.boolean({
      description: "Include integration configurations",
      default: true,
      allowNo: true,
    }),

    "include-authorizers": Flags.boolean({
      description: "Include authorizer configurations",
      default: true,
      allowNo: true,
    }),

    "include-cors": Flags.boolean({
      description: "Include CORS configuration",
      default: true,
      allowNo: true,
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
      description: "Output format for API configuration",
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
   * Execute the API Gateway get API configuration command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(ApigwGetApiConfigCommand);

    try {
      // Validate API ID format
      const apiId = validateApiId(args.apiId);

      // Validate input using Zod schema
      const input: ApiGwGetApiConfig = ApiGwGetApiConfigSchema.parse({
        apiId,
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
        type: flags.type,
        includeStages: flags["include-stages"],
        includeResources: flags["include-resources"],
        includeRoutes: flags["include-routes"],
        includeIntegrations: flags["include-integrations"],
        includeAuthorizers: flags["include-authorizers"],
        includeCors: flags["include-cors"],
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

      // Get comprehensive API configuration
      const apiConfiguration = await apiGwService.getApiConfiguration(
        input.apiId,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          ...(input.type && { apiTypeHint: input.type }),
          includeStages: input.includeStages,
          includeResources: input.includeResources,
          includeRoutes: input.includeRoutes,
          includeIntegrations: input.includeIntegrations,
          includeAuthorizers: input.includeAuthorizers,
          includeCors: input.includeCors,
        },
      );

      // Format output based on requested format
      this.formatAndDisplayOutput(apiConfiguration, input.format);
    } catch (error) {
      const formattedError = handleApiGwCommandError(
        error,
        flags.verbose,
        `get API configuration for '${args.apiId}'`,
      );
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the API configuration output
   *
   * @param config - API configuration to display
   * @param format - Output format to use
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(config: ApiConfiguration, format: string): void {
    const apiType = this.detectApiTypeFromConfiguration(config);

    switch (format) {
      case "table": {
        this.displayTableFormat(config, apiType);
        break;
      }

      case "json": {
        this.log(JSON.stringify(config, this.jsonReplacer.bind(this), 2));
        break;
      }

      case "jsonl": {
        this.log(JSON.stringify(config, this.jsonReplacer.bind(this)));
        break;
      }

      case "csv": {
        this.displayCsvFormat(config, apiType);
        break;
      }

      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }

  /**
   * Display API configuration in table format
   *
   * @param config - API configuration
   * @param apiType - Detected API type
   * @internal
   */
  private displayTableFormat(config: ApiConfiguration, apiType: string): void {
    const api = config.api;

    this.log(`\nAPI Gateway ${apiType.toUpperCase()} API Configuration:\n`);

    // API Overview
    this.displayApiOverview(api, apiType);

    // Stages
    if ((config.stages?.length ?? 0) > 0) {
      this.log("\n"); // Empty line
      this.displayStages(config.stages!);
    }

    // Resources (REST APIs)
    if ((config.resources?.length ?? 0) > 0) {
      this.log("\n"); // Empty line
      this.displayResources(config.resources!);
    }

    // Routes (HTTP/WebSocket APIs)
    if ((config.routes?.length ?? 0) > 0) {
      this.log("\n"); // Empty line
      this.displayRoutes(config.routes!);
    }

    // Integrations
    if ((config.integrations?.length ?? 0) > 0) {
      this.log("\n"); // Empty line
      this.displayIntegrations(config.integrations!);
    }

    // Summary
    this.log("\n"); // Empty line
    this.displayConfigurationSummary(config, apiType);
  }

  /**
   * Display API configuration in CSV format
   *
   * @param config - API configuration
   * @param apiType - Detected API type
   * @internal
   */
  private displayCsvFormat(config: ApiConfiguration, apiType: string): void {
    const summary = this.buildConfigurationSummary(config, apiType);

    const csvData = [
      { Component: "Component", Count: "Count", Details: "Details" }, // Header row
      ...Object.entries(summary).map(([component, info]: [string, SummaryInfo]) => ({
        Component: component,
        Count: String(info.count || 0),
        Details: info.details || "-",
      })),
    ];

    const processor = new DataProcessor({ format: DataFormat.CSV });
    const output = processor.formatOutput(csvData.map((item, index) => ({ data: item, index })));
    this.log(output);
  }

  /**
   * Display API overview section
   *
   * @param api - API information
   * @param apiType - API type
   * @internal
   */
  private displayApiOverview(api: ApiConfiguration["api"], apiType: string): void {
    this.log("API Overview:");
    // Use type-safe API ID extraction
    const apiId =
      apiType === "rest"
        ? (api as RestApiDescription).id
        : (api as HttpApiDescription | WebSocketApiDescription).apiId;
    this.log(`  ID: ${apiId}`);
    this.log(`  Name: ${api.name || "-"}`);
    this.log(`  Type: ${apiType.toUpperCase()}`);
    this.log(`  Description: ${api.description || "-"}`);
    this.log(`  Created: ${api.createdDate ? new Date(api.createdDate).toISOString() : "-"}`);

    if (apiType === "rest") {
      const restApi = api as RestApiDescription;
      if ((restApi.endpointConfiguration?.types?.length ?? 0) > 0) {
        this.log(`  Endpoint Type: ${restApi.endpointConfiguration!.types!.join(", ")}`);
      }
    } else {
      const v2Api = api as HttpApiDescription | WebSocketApiDescription;
      if (v2Api.apiEndpoint) {
        this.log(`  Endpoint: ${v2Api.apiEndpoint}`);
      }
      if (v2Api.protocolType) {
        this.log(`  Protocol: ${v2Api.protocolType}`);
      }
    }
  }

  /**
   * Display stages section
   *
   * @param stages - Stage configurations
   * @internal
   */
  private displayStages(stages: NonNullable<ApiConfiguration["stages"]>): void {
    this.log(`Stages (${stages.length}):`);

    if (stages.length === 0) {
      this.log("  No stages configured");
      return;
    }

    for (const [index, stage] of stages.entries()) {
      this.log(`  ${index + 1}. ${stage.stageName}`);
      if (stage.description) {
        this.log(`     Description: ${stage.description}`);
      }
      if (stage.deploymentId) {
        this.log(`     Deployment: ${stage.deploymentId}`);
      }
      if (stage.throttleSettings) {
        this.log(
          `     Throttling: ${stage.throttleSettings.rateLimit || "N/A"} req/sec, ${stage.throttleSettings.burstLimit || "N/A"} burst`,
        );
      }
    }
  }

  /**
   * Display resources section (REST APIs)
   *
   * @param resources - Resource configurations
   * @internal
   */
  private displayResources(resources: NonNullable<ApiConfiguration["resources"]>): void {
    this.log(`Resources (${resources.length}):`);

    if (resources.length === 0) {
      this.log("  No resources configured");
      return;
    }

    for (const [index, resource] of resources.entries()) {
      this.log(`  ${index + 1}. ${resource.path || resource.pathPart || "/"}`);
      if (resource.resourceMethods) {
        const methods = Object.keys(resource.resourceMethods).join(", ");
        this.log(`     Methods: ${methods}`);
      }
      if (resource.id) {
        this.log(`     ID: ${resource.id}`);
      }
    }
  }

  /**
   * Display routes section (HTTP/WebSocket APIs)
   *
   * @param routes - Route configurations
   * @internal
   */
  private displayRoutes(routes: NonNullable<ApiConfiguration["routes"]>): void {
    this.log(`Routes (${routes.length}):`);

    if (routes.length === 0) {
      this.log("  No routes configured");
      return;
    }

    for (const [index, route] of routes.entries()) {
      this.log(`  ${index + 1}. ${route.RouteKey || "-"}`);
      if (route.Target) {
        this.log(`     Target: ${route.Target}`);
      }
      if (route.RouteId) {
        this.log(`     ID: ${route.RouteId}`);
      }
    }
  }

  /**
   * Display integrations section
   *
   * @param integrations - Integration configurations
   * @internal
   */
  private displayIntegrations(integrations: NonNullable<ApiConfiguration["integrations"]>): void {
    this.log(`Integrations (${integrations.length}):`);

    if (integrations.length === 0) {
      this.log("  No integrations configured");
      return;
    }

    for (const [index, integration] of integrations.entries()) {
      // Determine integration type - REST APIs use "type", V2 APIs use "IntegrationType"
      const integrationType =
        (integration as RestIntegration).type ?? (integration as V2Integration).IntegrationType;
      this.log(`  ${index + 1}. ${integrationType || "Unknown"}`);

      // Determine integration URI - REST APIs use "uri", V2 APIs use "IntegrationUri"
      const integrationUri =
        (integration as RestIntegration).uri ?? (integration as V2Integration).IntegrationUri;
      if (integrationUri) {
        this.log(`     URI: ${integrationUri}`);
      }

      // Determine integration method - REST APIs use "httpMethod", V2 APIs use "IntegrationMethod"
      const integrationMethod =
        (integration as RestIntegration).httpMethod ??
        (integration as V2Integration).IntegrationMethod;
      if (integrationMethod) {
        this.log(`     Method: ${integrationMethod}`);
      }
    }
  }

  /**
   * Display configuration summary
   *
   * @param config - API configuration
   * @param apiType - API type
   * @internal
   */
  private displayConfigurationSummary(config: ApiConfiguration, apiType: string): void {
    const summary = this.buildConfigurationSummary(config, apiType);

    this.log("Configuration Summary:");
    for (const [component, info] of Object.entries(summary)) {
      this.log(`  ${component}: ${info.count} configured`);
    }
  }

  /**
   * Build configuration summary object
   *
   * @param config - API configuration
   * @param apiType - API type
   * @returns Summary object
   * @internal
   */
  private buildConfigurationSummary(
    config: ApiConfiguration,
    apiType: string,
  ): Record<string, SummaryInfo> {
    const summary: Record<string, SummaryInfo> = {
      Stages: {
        count: config.stages?.length || 0,
        details: config.stages?.map((s) => s.stageName).join(", ") || "-",
      },
    };

    if (apiType === "rest") {
      summary["Resources"] = {
        count: config.resources?.length || 0,
        details:
          config.resources
            ?.map((r) => r.path || r.pathPart || "/")
            .slice(0, 3)
            .join(", ") || "-",
      };
    } else {
      summary["Routes"] = {
        count: config.routes?.length || 0,
        details:
          config.routes
            ?.map((r: Route) => r.RouteKey)
            .filter((key): key is string => key != undefined)
            .slice(0, 3)
            .join(", ") || "-",
      };
    }

    summary["Integrations"] = {
      count: config.integrations?.length || 0,
      details:
        config.integrations
          ?.map(
            (integration: RestIntegration | V2Integration) =>
              (integration as RestIntegration).type ??
              (integration as V2Integration).IntegrationType,
          )
          .filter((type) => type !== undefined)
          .slice(0, 3)
          .join(", ") || "-",
    };

    return summary;
  }

  /**
   * Detect API type from configuration object
   *
   * @param config - API configuration
   * @returns Detected API type
   * @internal
   */
  private detectApiTypeFromConfiguration(config: ApiConfiguration): string {
    const api = config.api;
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
