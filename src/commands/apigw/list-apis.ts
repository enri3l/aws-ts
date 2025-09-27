/**
 * API Gateway list APIs command
 *
 * Lists all API Gateway APIs across REST, HTTP, and WebSocket types
 * with support for multiple output formats and comprehensive error handling.
 *
 */

import { Command, Flags } from "@oclif/core";
import { handleApiGwCommandError } from "../../lib/apigw-errors.js";
import type { ApiGwListApis } from "../../lib/apigw-schemas.js";
import { ApiGwListApisSchema } from "../../lib/apigw-schemas.js";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { ApiGwService } from "../../services/apigw-service.js";

/**
 * API Gateway list APIs command for discovering available APIs
 *
 * Provides a unified list of all API Gateway APIs (REST, HTTP, WebSocket)
 * with support for multiple output formats and filtering options.
 *
 * @public
 */
export default class ApigwListApisCommand extends Command {
  static override readonly description =
    "List all API Gateway APIs across REST, HTTP, and WebSocket types";

  static override readonly examples = [
    {
      description: "List all APIs in the current region",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "List only REST APIs with JSON output",
      command: "<%= config.bin %> <%= command.id %> --type rest --format json",
    },
    {
      description: "List APIs in a specific region",
      command: "<%= config.bin %> <%= command.id %> --region us-west-2",
    },
    {
      description: "List APIs using a specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> --profile production",
    },
    {
      description: "List first 10 APIs with CSV output for spreadsheet import",
      command: "<%= config.bin %> <%= command.id %> --max-items 10 --format csv",
    },
    {
      description: "List only HTTP APIs with verbose debug information",
      command: "<%= config.bin %> <%= command.id %> --type http --verbose",
    },
    {
      description: "List only WebSocket APIs",
      command: "<%= config.bin %> <%= command.id %> --type websocket",
    },
  ];

  static override readonly flags = {
    region: Flags.string({
      char: "r",
      description: "AWS region to list APIs from",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for API list",
      options: ["table", "json", "jsonl", "csv"],
      default: "table",
    }),

    type: Flags.string({
      description: "Filter APIs by type",
      options: ["rest", "http", "websocket"],
      helpValue: "TYPE",
    }),

    "max-items": Flags.integer({
      description: "Maximum number of APIs to return",
      min: 1,
      max: 1000,
      helpValue: "NUMBER",
    }),

    verbose: Flags.boolean({
      char: "v",
      description: "Enable verbose output with debug information",
      default: false,
    }),
  };

  /**
   * Execute the API Gateway list APIs command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(ApigwListApisCommand);

    try {
      // Validate input using Zod schema
      const input: ApiGwListApis = ApiGwListApisSchema.parse({
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
        type: flags.type,
        maxItems: flags["max-items"],
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

      // List APIs from API Gateway
      const result = await apiGwService.listApis(
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
        {
          ...(input.type && { type: input.type }),
          ...(input.maxItems && { maxItems: input.maxItems }),
        },
      );

      // Format output based on requested format
      this.formatAndDisplayOutput(result.apis, input.format, input.type);
    } catch (error) {
      const formattedError = handleApiGwCommandError(error, flags.verbose, "list APIs operation");
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the API list output
   *
   * @param apis - Array of unified APIs to display
   * @param format - Output format to use
   * @param typeFilter - Optional type filter for display context
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    apis: Array<{
      id: string;
      name: string;
      type: string;
      description?: string | undefined;
      endpoint?: string | undefined;
      createdDate?: Date | undefined;
    }>,
    format: string,
    typeFilter?: string,
  ): void {
    if (apis.length === 0) {
      const typeText = typeFilter ? ` ${typeFilter.toUpperCase()}` : "";
      this.log(`No${typeText} API Gateway APIs found in the specified region.`);
      return;
    }

    const typeText = typeFilter ? ` ${typeFilter.toUpperCase()}` : "";

    switch (format) {
      case "table": {
        this.log(`Found ${apis.length}${typeText} API Gateway APIs:\n`);
        const tableData = apis.map((api, index) => ({
          "#": index + 1,
          "API ID": api.id,
          Name: api.name,
          Type: api.type.toUpperCase(),
          Description: api.description || "-",
          Endpoint: api.endpoint ? this.truncateUrl(api.endpoint) : "-",
          Created: api.createdDate ? api.createdDate.toISOString().split("T")[0] : "-",
        }));

        // Use DataProcessor for consistent table formatting
        const processor = new DataProcessor({ format: DataFormat.CSV });
        const output = processor.formatOutput(
          tableData.map((item, index) => ({ data: item, index })),
        );
        this.log(output);
        break;
      }

      case "json": {
        const output = {
          apis: apis.map((api) => ({
            id: api.id,
            name: api.name,
            type: api.type,
            description: api.description,
            endpoint: api.endpoint,
            createdDate: api.createdDate?.toISOString(),
          })),
          count: apis.length,
          ...(typeFilter && { typeFilter }),
        };
        this.log(JSON.stringify(output, undefined, 2));
        break;
      }

      case "jsonl": {
        for (const api of apis) {
          this.log(
            JSON.stringify({
              id: api.id,
              name: api.name,
              type: api.type,
              description: api.description,
              endpoint: api.endpoint,
              createdDate: api.createdDate?.toISOString(),
            }),
          );
        }
        break;
      }

      case "csv": {
        // Create CSV data with headers
        const csvData = [
          {
            "API ID": "API ID",
            Name: "Name",
            Type: "Type",
            Description: "Description",
            Endpoint: "Endpoint",
            "Created Date": "Created Date",
          }, // Header row
          ...apis.map((api) => ({
            "API ID": api.id,
            Name: api.name,
            Type: api.type.toUpperCase(),
            Description: api.description || "",
            Endpoint: api.endpoint || "",
            "Created Date": api.createdDate?.toISOString() || "",
          })),
        ];

        const processor = new DataProcessor({ format: DataFormat.CSV });
        const output = processor.formatOutput(
          csvData.map((item, index) => ({ data: item, index })),
        );
        this.log(output);
        break;
      }

      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }

  /**
   * Truncate URL for better table display
   *
   * @param url - URL to truncate
   * @returns Truncated URL
   * @internal
   */
  private truncateUrl(url: string): string {
    if (url.length <= 50) {
      return url;
    }

    return `${url.slice(0, 47)}...`;
  }
}
