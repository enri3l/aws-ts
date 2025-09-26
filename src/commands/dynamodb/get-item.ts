/**
 * DynamoDB get item command
 *
 * Retrieves a single item from a DynamoDB table by its primary key
 * with support for projection and consistent reads.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { DataProcessor } from "../../lib/data-processing.js";
import type { DynamoDBGetItem } from "../../lib/dynamodb-schemas.js";
import { DynamoDBGetItemSchema } from "../../lib/dynamodb-schemas.js";
import { formatErrorWithGuidance } from "../../lib/errors.js";
import type { GetItemParameters } from "../../services/dynamodb-service.js";
import { DynamoDBService } from "../../services/dynamodb-service.js";

/**
 * DynamoDB get item command for single item retrieval
 *
 * Provides item retrieval by primary key with projection expression
 * support and consistent read options.
 *
 * @public
 */
export default class DynamoDBGetItemCommand extends Command {
  static override readonly description = "Get a single item from a DynamoDB table by primary key";

  static override readonly examples = [
    {
      description: "Get an item by partition key",
      command: '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123"}\'',
    },
    {
      description: "Get an item with partition and sort key",
      command: '<%= config.bin %> <%= command.id %> my-table \'{"pk": "USER", "sk": "user123"}\'',
    },
    {
      description: "Get specific attributes using projection expression",
      command:
        '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123"}\' --projection-expression \'#name, email, #status\' --expression-attribute-names \'{"#name": "name", "#status": "status"}\'',
    },
    {
      description: "Get item with consistent read",
      command:
        '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123"}\' --consistent-read',
    },
    {
      description: "Get item with JSON output",
      command: '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123"}\' --format json',
    },
    {
      description: "Get item using file input for complex keys",
      command: "<%= config.bin %> <%= command.id %> my-table file://key.json",
    },
  ];

  static override readonly args = {
    tableName: Args.string({
      name: "tableName",
      description: "Name of the DynamoDB table to get item from",
      required: true,
    }),
    key: Args.string({
      name: "key",
      description: "Primary key of the item (JSON object or file path)",
      required: true,
    }),
  };

  static override readonly flags = {
    "projection-expression": Flags.string({
      description: "Projection expression to select specific attributes",
      helpValue: "EXPRESSION",
    }),

    "expression-attribute-names": Flags.string({
      description: "Expression attribute names (JSON object)",
      helpValue: "JSON",
    }),

    "consistent-read": Flags.boolean({
      description: "Use consistent read for the operation",
      default: false,
    }),

    region: Flags.string({
      char: "r",
      description: "AWS region containing the table",
      helpValue: "REGION",
    }),

    profile: Flags.string({
      char: "p",
      description: "AWS profile to use for authentication",
      helpValue: "PROFILE_NAME",
    }),

    format: Flags.string({
      char: "f",
      description: "Output format for the item",
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
   * Execute the DynamoDB get item command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(DynamoDBGetItemCommand);

    try {
      // Parse key input (JSON string or file path)
      let keyObject: Record<string, unknown>;
      if (args.key.startsWith("file://")) {
        const filePath = args.key.replace("file://", "");
        const fs = await import("node:fs/promises");
        const fileContent = await fs.readFile(filePath, "utf8");
        keyObject = JSON.parse(fileContent);
      } else {
        keyObject = JSON.parse(args.key);
      }

      // Parse expression attribute names if provided
      const expressionAttributeNames = flags["expression-attribute-names"]
        ? JSON.parse(flags["expression-attribute-names"])
        : undefined;

      // Validate input using Zod schema
      const input: DynamoDBGetItem = DynamoDBGetItemSchema.parse({
        tableName: args.tableName,
        key: args.key,
        projectionExpression: flags["projection-expression"],
        expressionAttributeNames,
        consistentRead: flags["consistent-read"],
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
          region: input.region,
          profile: input.profile,
        },
      });

      // Prepare get item parameters
      const getItemParameters: GetItemParameters = {
        tableName: input.tableName,
        key: keyObject,
        projectionExpression: input.projectionExpression,
        expressionAttributeNames,
        consistentRead: input.consistentRead,
      };

      // Execute get item operation
      const item = await dynamoService.getItem(getItemParameters, {
        region: input.region,
        profile: input.profile,
      });

      // Format output based on requested format
      await this.formatAndDisplayOutput(item, input.format, input.tableName, keyObject);
    } catch (error) {
      if (error instanceof SyntaxError && error.message.includes("JSON")) {
        this.error(`Invalid JSON in key parameter: ${error.message}`, { exit: 1 });
      }

      if (error instanceof Error && error.message.includes("ENOENT")) {
        this.error("Key file not found. Ensure the file path is correct.", { exit: 1 });
      }

      const formattedError = formatErrorWithGuidance(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the get item result
   *
   * @param item - Retrieved item (or undefined if not found)
   * @param format - Output format to use
   * @param tableName - Name of the table
   * @param key - Primary key that was queried
   * @returns Promise resolving when output is complete
   * @internal
   */
  private async formatAndDisplayOutput(
    item: Record<string, unknown> | undefined,
    format: string,
    tableName: string,
    key: Record<string, unknown>,
  ): Promise<void> {
    if (!item) {
      this.log(`Item not found in table '${tableName}' with key:`);
      this.log(JSON.stringify(key, null, 2));
      return;
    }

    switch (format) {
      case "table": {
        this.log(`\n=== Item from table: ${tableName} ===\n`);

        // Convert item to key-value pairs for table display
        const itemData = Object.entries(item).map(([key, value]) => ({
          Attribute: key,
          Value: this.formatValue(value),
          Type: this.getValueType(value),
        }));

        const processor = new DataProcessor({ format: "table" });
        const output = processor.formatOutput(itemData);
        this.log(output);
        break;
      }

      case "json": {
        this.log(JSON.stringify(item, null, 2));
        break;
      }

      case "jsonl": {
        this.log(JSON.stringify(item));
        break;
      }

      case "csv": {
        // For CSV format, treat the item as a single row
        const processor = new DataProcessor({ format: "csv" });
        const output = processor.formatOutput([item]);
        this.log(output);
        break;
      }

      default: {
        throw new Error(`Unsupported output format: ${format}`);
      }
    }
  }

  /**
   * Format a value for display in table format
   *
   * @param value - Value to format
   * @returns Formatted string representation
   * @internal
   */
  private formatValue(value: unknown): string {
    if (value === null || value === undefined) {
      return "null";
    }

    if (typeof value === "string") {
      return value.length > 100 ? `${value.slice(0, 97)}...` : value;
    }

    if (typeof value === "object") {
      const jsonString = JSON.stringify(value);
      return jsonString.length > 100 ? `${jsonString.slice(0, 97)}...` : jsonString;
    }

    return String(value);
  }

  /**
   * Get the type of a value for display
   *
   * @param value - Value to get type for
   * @returns Type description
   * @internal
   */
  private getValueType(value: unknown): string {
    if (value === null || value === undefined) {
      return "null";
    }

    if (Array.isArray(value)) {
      return `array[${value.length}]`;
    }

    if (typeof value === "object") {
      return "object";
    }

    return typeof value;
  }
}
