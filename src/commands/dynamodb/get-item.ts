/**
 * @module dynamodb/get-item
 * DynamoDB get item command
 *
 * Retrieves a single item from a DynamoDB table by its primary key
 * with support for projection and consistent reads.
 *
 */

import { Args, Flags } from "@oclif/core";
import { DataFormat, DataProcessor } from "../../lib/data-processing.js";
import { GetItemParameterBuilder } from "../../lib/dynamodb-parameter-builders.js";
import type { DynamoDBGetItem } from "../../lib/dynamodb-schemas.js";
import { DynamoDBGetItemSchema } from "../../lib/dynamodb-schemas.js";
import { handleDynamoDBCommandError } from "../../lib/errors.js";
import { parseJsonInput, parseJsonStringInput } from "../../lib/parsing.js";
import { DynamoDBService } from "../../services/dynamodb-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * DynamoDB get item command for single item retrieval
 *
 * Provides item retrieval by primary key with projection expression
 * support and consistent read options.
 *
 * @public
 */
export default class DynamoDBGetItemCommand extends BaseCommand {
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
    ...BaseCommand.commonFlags,

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
  };

  /**
   * Execute the DynamoDB get item command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(DynamoDBGetItemCommand);

    try {
      // Parse key input (JSON string or file path)
      const keyObject = await parseJsonInput(args.key, "Key input");

      // Parse expression attribute names if provided
      const expressionAttributeNames = flags["expression-attribute-names"]
        ? await parseJsonStringInput(
            flags["expression-attribute-names"],
            "Expression attribute names",
          )
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
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      // Prepare get item parameters
      const getItemParameters = GetItemParameterBuilder.build(
        input,
        keyObject,
        expressionAttributeNames,
      );

      // Execute get item operation
      const item = await dynamoService.getItem(getItemParameters, {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      });

      // Format output based on requested format
      this.formatAndDisplayOutput(item, input.format, input.tableName, keyObject);
    } catch (error) {
      const formattedError = handleDynamoDBCommandError(error, flags.verbose, "get item operation");
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
   * @throws Error When unsupported output format is specified
   * @internal
   */
  private formatAndDisplayOutput(
    item: Record<string, unknown> | undefined,
    format: string,
    tableName: string,
    key: Record<string, unknown>,
  ): void {
    if (!item) {
      this.log(`Item not found in table '${tableName}' with key:`);
      this.log(JSON.stringify(key, undefined, 2));
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

        const processor = new DataProcessor({ format: DataFormat.CSV });
        const output = processor.formatOutput(
          itemData.map((item, index) => ({ data: item, index })),
        );
        this.log(output);
        break;
      }

      case "json": {
        this.log(JSON.stringify(item, undefined, 2));
        break;
      }

      case "jsonl": {
        this.log(JSON.stringify(item));
        break;
      }

      case "csv": {
        // For CSV format, treat the item as a single row
        const processor = new DataProcessor({ format: DataFormat.CSV });
        const output = processor.formatOutput([item].map((item, index) => ({ data: item, index })));
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
    if (value === undefined || value === null) {
      return "undefined";
    }

    let stringValue: string;
    if (typeof value === "object") {
      stringValue = JSON.stringify(value);
    } else if (typeof value === "string") {
      stringValue = value;
    } else {
      // Safe for primitives: number, boolean, bigint, symbol
      stringValue = String(value as string | number | boolean | bigint | symbol);
    }

    return stringValue.length > 100 ? `${stringValue.slice(0, 97)}...` : stringValue;
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
