/**
 * DynamoDB put item command
 *
 * Creates or replaces an item in a DynamoDB table with support for
 * condition expressions and return value options.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { DataProcessor } from "../../lib/data-processing.js";
import type { DynamoDBPutItem } from "../../lib/dynamodb-schemas.js";
import { DynamoDBPutItemSchema } from "../../lib/dynamodb-schemas.js";
import { formatErrorWithGuidance } from "../../lib/errors.js";
import type { PutItemParameters } from "../../services/dynamodb-service.js";
import { DynamoDBService } from "../../services/dynamodb-service.js";

/**
 * DynamoDB put item command for item creation/replacement
 *
 * Provides item creation and replacement capabilities with condition
 * expressions and return value support.
 *
 * @public
 */
export default class DynamoDBPutItemCommand extends Command {
  static override readonly description = "Put (create/replace) an item in a DynamoDB table";

  static override readonly examples = [
    {
      description: "Put a simple item",
      command:
        '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123", "name": "John Doe", "email": "john@example.com"}\'',
    },
    {
      description: "Put an item from a JSON file",
      command: "<%= config.bin %> <%= command.id %> my-table file://item.json",
    },
    {
      description: "Put item only if it doesn't exist",
      command:
        '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123", "name": "John Doe"}\' --condition-expression \'attribute_not_exists(id)\'',
    },
    {
      description: "Put item with return values",
      command:
        '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123", "name": "John Doe"}\' --return-values ALL_OLD',
    },
    {
      description: "Put item with expression attribute names",
      command:
        '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123", "status": "active"}\' --condition-expression \'attribute_not_exists(#status) OR #status <> :status\' --expression-attribute-names \'{"#status": "status"}\' --expression-attribute-values \'{":status": "inactive"}\'',
    },
  ];

  static override readonly args = {
    tableName: Args.string({
      name: "tableName",
      description: "Name of the DynamoDB table to put item to",
      required: true,
    }),
    item: Args.string({
      name: "item",
      description: "Item data as JSON string or file path (file://item.json)",
      required: true,
    }),
  };

  static override readonly flags = {
    "condition-expression": Flags.string({
      description: "Condition expression for conditional put",
      helpValue: "EXPRESSION",
    }),

    "expression-attribute-names": Flags.string({
      description: "Expression attribute names (JSON object)",
      helpValue: "JSON",
    }),

    "expression-attribute-values": Flags.string({
      description: "Expression attribute values (JSON object)",
      helpValue: "JSON",
    }),

    "return-values": Flags.string({
      description: "Return values option",
      options: ["NONE", "ALL_OLD"],
      default: "NONE",
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
      description: "Output format for the result",
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
   * Execute the DynamoDB put item command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(DynamoDBPutItemCommand);

    try {
      // Parse item input (JSON string or file path)
      let itemObject: Record<string, unknown>;
      if (args.item.startsWith("file://")) {
        const filePath = args.item.replace("file://", "");
        const fs = await import("node:fs/promises");
        const fileContent = await fs.readFile(filePath, "utf8");
        itemObject = JSON.parse(fileContent);
      } else {
        itemObject = JSON.parse(args.item);
      }

      // Parse expression attributes if provided
      const expressionAttributeNames = flags["expression-attribute-names"]
        ? JSON.parse(flags["expression-attribute-names"])
        : undefined;

      const expressionAttributeValues = flags["expression-attribute-values"]
        ? JSON.parse(flags["expression-attribute-values"])
        : undefined;

      // Validate input using Zod schema
      const input: DynamoDBPutItem = DynamoDBPutItemSchema.parse({
        tableName: args.tableName,
        item: args.item,
        conditionExpression: flags["condition-expression"],
        expressionAttributeNames,
        expressionAttributeValues,
        returnValues: flags["return-values"],
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

      // Prepare put item parameters
      const putItemParameters: PutItemParameters = {
        tableName: input.tableName,
        item: itemObject,
        conditionExpression: input.conditionExpression,
        expressionAttributeNames,
        expressionAttributeValues,
        returnValues: input.returnValues,
      };

      // Execute put item operation
      const result = await dynamoService.putItem(putItemParameters, {
        region: input.region,
        profile: input.profile,
      });

      // Format output based on requested format
      await this.formatAndDisplayOutput(result, input.format, input.tableName, input.returnValues);
    } catch (error) {
      if (error instanceof SyntaxError && error.message.includes("JSON")) {
        this.error(`Invalid JSON in parameter: ${error.message}`, { exit: 1 });
      }

      if (error instanceof Error && error.message.includes("ENOENT")) {
        this.error("Item file not found. Ensure the file path is correct.", { exit: 1 });
      }

      const formattedError = formatErrorWithGuidance(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the put item result
   *
   * @param result - Put item result (previous item if returnValues was set)
   * @param format - Output format to use
   * @param tableName - Name of the table
   * @param returnValues - Return values option used
   * @returns Promise resolving when output is complete
   * @internal
   */
  private async formatAndDisplayOutput(
    result: Record<string, unknown> | undefined,
    format: string,
    tableName: string,
    returnValues: string,
  ): Promise<void> {
    if (returnValues === "NONE" || !result) {
      this.log(`Item successfully put to table '${tableName}'.`);
      return;
    }

    this.log(`Item successfully put to table '${tableName}'. Previous item:`);

    switch (format) {
      case "table": {
        // Convert item to key-value pairs for table display
        const itemData = Object.entries(result).map(([key, value]) => ({
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
        this.log(JSON.stringify(result, null, 2));
        break;
      }

      case "jsonl": {
        this.log(JSON.stringify(result));
        break;
      }

      case "csv": {
        const processor = new DataProcessor({ format: "csv" });
        const output = processor.formatOutput([result]);
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
