/**
 * DynamoDB update item command
 *
 * Updates an existing item in a DynamoDB table using update expressions
 * with support for condition expressions and return value options.
 *
 */

import { Args, Command, Flags } from "@oclif/core";
import { DataProcessor } from "../../lib/data-processing.js";
import type { DynamoDBUpdateItem } from "../../lib/dynamodb-schemas.js";
import { DynamoDBUpdateItemSchema } from "../../lib/dynamodb-schemas.js";
import { formatErrorWithGuidance } from "../../lib/errors.js";
import type { UpdateItemParameters } from "../../services/dynamodb-service.js";
import { DynamoDBService } from "../../services/dynamodb-service.js";

/**
 * DynamoDB update item command for item updates
 *
 * Provides item update capabilities using update expressions with condition
 * expressions and comprehensive return value support.
 *
 * @public
 */
export default class DynamoDBUpdateItemCommand extends Command {
  static override readonly description = "Update an existing item in a DynamoDB table";

  static override readonly examples = [
    {
      description: "Update item attributes",
      command:
        '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123"}\' --update-expression \'SET #name = :name, email = :email\' --expression-attribute-names \'{"#name": "name"}\' --expression-attribute-values \'{":name": "Jane Doe", ":email": "jane@example.com"}\'',
    },
    {
      description: "Increment a numeric attribute",
      command:
        '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123"}\' --update-expression \'SET #count = #count + :inc\' --expression-attribute-names \'{"#count": "count"}\' --expression-attribute-values \'{":inc": 1}\'',
    },
    {
      description: "Add items to a list",
      command:
        '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123"}\' --update-expression \'SET tags = list_append(tags, :vals)\' --expression-attribute-values \'{":vals": ["new-tag"]}\'',
    },
    {
      description: "Remove attributes",
      command:
        "<%= config.bin %> <%= command.id %> my-table '{\"id\": \"user123\"}' --update-expression 'REMOVE old_attribute, deprecated_field'",
    },
    {
      description: "Conditional update",
      command:
        '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123"}\' --update-expression \'SET #status = :status\' --condition-expression \'#status = :current\' --expression-attribute-names \'{"#status": "status"}\' --expression-attribute-values \'{":status": "inactive", ":current": "active"}\'',
    },
    {
      description: "Update with return values",
      command:
        '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123"}\' --update-expression \'SET #count = #count + :inc\' --expression-attribute-names \'{"#count": "count"}\' --expression-attribute-values \'{":inc": 1}\' --return-values ALL_NEW',
    },
  ];

  static override readonly args = {
    tableName: Args.string({
      name: "tableName",
      description: "Name of the DynamoDB table to update item in",
      required: true,
    }),
    key: Args.string({
      name: "key",
      description: "Primary key of the item to update (JSON object or file path)",
      required: true,
    }),
  };

  static override readonly flags = {
    "update-expression": Flags.string({
      description: "Update expression (required for updates)",
      helpValue: "EXPRESSION",
      required: true,
    }),

    "condition-expression": Flags.string({
      description: "Condition expression for conditional update",
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
      options: ["NONE", "ALL_OLD", "UPDATED_OLD", "ALL_NEW", "UPDATED_NEW"],
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
   * Execute the DynamoDB update item command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(DynamoDBUpdateItemCommand);

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

      // Parse expression attributes if provided
      const expressionAttributeNames = flags["expression-attribute-names"]
        ? JSON.parse(flags["expression-attribute-names"])
        : undefined;

      const expressionAttributeValues = flags["expression-attribute-values"]
        ? JSON.parse(flags["expression-attribute-values"])
        : undefined;

      // Validate input using Zod schema
      const input: DynamoDBUpdateItem = DynamoDBUpdateItemSchema.parse({
        tableName: args.tableName,
        key: args.key,
        updateExpression: flags["update-expression"],
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

      // Prepare update item parameters
      const updateItemParameters: UpdateItemParameters = {
        tableName: input.tableName,
        key: keyObject,
        updateExpression: input.updateExpression,
        conditionExpression: input.conditionExpression,
        expressionAttributeNames,
        expressionAttributeValues,
        returnValues: input.returnValues,
      };

      // Execute update item operation
      const result = await dynamoService.updateItem(updateItemParameters, {
        region: input.region,
        profile: input.profile,
      });

      // Format output based on requested format
      await this.formatAndDisplayOutput(
        result,
        input.format,
        input.tableName,
        input.returnValues,
        keyObject,
      );
    } catch (error) {
      if (error instanceof SyntaxError && error.message.includes("JSON")) {
        this.error(`Invalid JSON in parameter: ${error.message}`, { exit: 1 });
      }

      if (error instanceof Error && error.message.includes("ENOENT")) {
        this.error("Key file not found. Ensure the file path is correct.", { exit: 1 });
      }

      const formattedError = formatErrorWithGuidance(error, flags.verbose);
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Format and display the update item result
   *
   * @param result - Update item result (attributes if returnValues was set)
   * @param format - Output format to use
   * @param tableName - Name of the table
   * @param returnValues - Return values option used
   * @param key - Primary key that was updated
   * @returns Promise resolving when output is complete
   * @internal
   */
  private async formatAndDisplayOutput(
    result: Record<string, unknown> | undefined,
    format: string,
    tableName: string,
    returnValues: string,
    key: Record<string, unknown>,
  ): Promise<void> {
    if (returnValues === "NONE" || !result) {
      this.log(`Item successfully updated in table '${tableName}' with key:`);
      this.log(JSON.stringify(key, null, 2));
      return;
    }

    const resultLabel = this.getResultLabel(returnValues);
    this.log(`Item successfully updated in table '${tableName}'. ${resultLabel}:`);

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
   * Get appropriate label for the return values type
   *
   * @param returnValues - Return values option
   * @returns Human-readable label
   * @internal
   */
  private getResultLabel(returnValues: string): string {
    switch (returnValues) {
      case "ALL_OLD": {
        return "Previous item";
      }
      case "UPDATED_OLD": {
        return "Previous values of updated attributes";
      }
      case "ALL_NEW": {
        return "Updated item";
      }
      case "UPDATED_NEW": {
        return "New values of updated attributes";
      }
      default: {
        return "Result";
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
