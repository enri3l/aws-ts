/**
 * @module dynamodb/put-item
 * DynamoDB put item command
 *
 * Creates or replaces an item in a DynamoDB table with support for
 * condition expressions and return value options.
 *
 */

import { Args, Flags } from "@oclif/core";
import { PutItemParameterBuilder } from "../../lib/dynamodb-parameter-builders.js";
import type { DynamoDBPutItem } from "../../lib/dynamodb-schemas.js";
import { DynamoDBPutItemSchema } from "../../lib/dynamodb-schemas.js";
import { handleDynamoDBCommandError } from "../../lib/errors.js";
import { FormatterFactory } from "../../lib/formatters.js";
import { parseJsonInput, parseJsonStringInput } from "../../lib/parsing.js";
import { DynamoDBService } from "../../services/dynamodb-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * DynamoDB put item command for item creation/replacement
 *
 * Provides item creation and replacement capabilities with condition
 * expressions and return value support.
 *
 * @public
 */
export default class DynamoDBPutItemCommand extends BaseCommand {
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
      description: "Idempotent create - only create if doesn't exist (AWS recommended pattern)",
      command:
        '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123", "name": "John Doe"}\' --condition-expression \'attribute_not_exists(id)\'',
    },
    {
      description: "Idempotent upsert with version control",
      command:
        '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123", "name": "John Doe", "version": 1}\' --condition-expression \'attribute_not_exists(id) OR version < :newVersion\' --expression-attribute-values \'{":newVersion": 1}\'',
    },
    {
      description: "Put item with return values",
      command:
        '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123", "name": "John Doe"}\' --return-values ALL_OLD',
    },
    {
      description: "Conditional put with status check (idempotent pattern)",
      command:
        '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123", "status": "active"}\' --condition-expression \'attribute_not_exists(#status) OR #status <> :status\' --expression-attribute-names \'{"#status": "status"}\' --expression-attribute-values \'{":status": "active"}\'',
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
    ...BaseCommand.commonFlags,

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
      const itemObject = await parseJsonInput(args.item, "Item input");

      // Parse expression attributes if provided
      const expressionAttributeNames = flags["expression-attribute-names"]
        ? await parseJsonStringInput(
            flags["expression-attribute-names"],
            "Expression attribute names",
          )
        : undefined;

      const expressionAttributeValues = flags["expression-attribute-values"]
        ? await parseJsonInput(flags["expression-attribute-values"], "Expression attribute values")
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
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      // Prepare put item parameters
      const putItemParameters = PutItemParameterBuilder.build(
        input,
        itemObject,
        expressionAttributeNames,
        expressionAttributeValues,
      );

      // Execute put item operation
      const result = await dynamoService.putItem(putItemParameters, {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      });

      // Format output based on requested format
      if (input.returnValues === "NONE" || !result) {
        this.log(`Item successfully put to table '${input.tableName}'.`);
      } else {
        this.log(`Item successfully put to table '${input.tableName}'. Previous item:`);
        const formatter = FormatterFactory.create(input.format, (message) => this.log(message));
        formatter.display(result);
      }
    } catch (error) {
      const formattedError = handleDynamoDBCommandError(error, flags.verbose, "put item operation");
      this.error(formattedError, { exit: 1 });
    }
  }
}
