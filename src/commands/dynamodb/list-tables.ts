/**
 * @module list-tables
 * DynamoDB list tables command
 *
 * Lists all DynamoDB tables in the specified region with support for
 * multiple output formats and error handling.
 *
 */

import { Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import type { DynamoDBListTables } from "../../lib/dynamodb-schemas.js";
import { DynamoDBListTablesSchema } from "../../lib/dynamodb-schemas.js";
import { handleDynamoDBCommandError } from "../../lib/errors.js";
import { DynamoDBService } from "../../services/dynamodb-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * DynamoDB list tables command for discovering available tables
 *
 * Provides a list of all DynamoDB tables in the specified region
 * with support for multiple output formats and region/profile selection.
 *
 * @public
 */
export default class DynamoDBListTablesCommand extends BaseCommand {
  static override readonly description = "List all DynamoDB tables in the region";

  static override readonly examples = [
    {
      description: "List all tables in the current region",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "List tables with JSON output format",
      command: "<%= config.bin %> <%= command.id %> --format json",
    },
    {
      description: "List tables in a specific region",
      command: "<%= config.bin %> <%= command.id %> --region us-west-2",
    },
    {
      description: "List tables using a specific AWS profile",
      command: "<%= config.bin %> <%= command.id %> --profile production",
    },
    {
      description: "List tables with CSV output format for spreadsheet import",
      command: "<%= config.bin %> <%= command.id %> --format csv",
    },
    {
      description: "Verbose table listing with debug information",
      command: "<%= config.bin %> <%= command.id %> --verbose",
    },
  ];

  static override readonly flags = {
    region: Flags.string({
      char: "r",
      description: "AWS region to list tables from",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for table list",
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
   * Execute the DynamoDB list tables command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { flags } = await this.parse(DynamoDBListTablesCommand);

    try {
      // Validate input using Zod schema
      const input: DynamoDBListTables = DynamoDBListTablesSchema.parse({
        region: flags.region,
        profile: flags.profile,
        format: flags.format,
        verbose: flags.verbose,
      });

      // Create DynamoDB service instance
      const dynamoService = new DynamoDBService({
        enableDebugLogging: input.verbose,
        enableProgressIndicators: true,
        clientConfig: {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      // List tables from DynamoDB
      const tableNames = await dynamoService.listTables({
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      });

      // Format output based on requested format
      this.formatAndDisplayOutput(tableNames, input.format);
    } catch (error) {
      const formattedError = handleDynamoDBCommandError(
        error,
        flags.verbose,
        "list tables operation",
      );
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the table list output
   *
   * @param tableNames - Array of table names to display
   * @param format - Output format to use
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(tableNames: string[], format: string): void {
    if (tableNames.length === 0) {
      this.log("No DynamoDB tables found in the specified region.");
      return;
    }

    switch (format) {
      case "table": {
        this.log(`Found ${tableNames.length} DynamoDB tables:\n`);
        const tableData = tableNames.map((name, index) => ({
          "#": index + 1,
          "Table Name": name,
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
          tables: tableNames,
          count: tableNames.length,
        };
        this.log(JSON.stringify(output, undefined, 2));
        break;
      }

      case "jsonl": {
        for (const tableName of tableNames) {
          this.log(JSON.stringify({ tableName }));
        }
        break;
      }

      case "csv": {
        // Create CSV data with headers
        const csvData = [
          { "Table Name": "Table Name" }, // Header row
          ...tableNames.map((name) => ({ "Table Name": name })),
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
}
