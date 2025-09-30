/**
 * @module update-item
 * DynamoDB update item command
 *
 * Updates an existing item in a DynamoDB table using update expressions
 * with support for condition expressions and return value options.
 *
 */

import { Args, Flags } from "@oclif/core";
import { UpdateItemParameterBuilder } from "../../lib/dynamodb-parameter-builders.js";
import type { DynamoDBUpdateItem } from "../../lib/dynamodb-schemas.js";
import { DynamoDBUpdateItemSchema } from "../../lib/dynamodb-schemas.js";
import { handleDynamoDBCommandError } from "../../lib/errors.js";
import { FormatterFactory } from "../../lib/formatters.js";
import { parseJsonInput, parseJsonStringInput } from "../../lib/parsing.js";
import { DynamoDBService } from "../../services/dynamodb-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * DynamoDB update item command for item updates
 *
 * Provides item update capabilities using update expressions with condition
 * expressions and return value support.
 *
 * @public
 */
export default class DynamoDBUpdateItemCommand extends BaseCommand {
  static override readonly description = "Update an existing item in a DynamoDB table";

  static override readonly examples = [
    {
      description: "Update item attributes",
      command:
        '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123"}\' --update-expression \'SET #name = :name, email = :email\' --expression-attribute-names \'{"#name": "name"}\' --expression-attribute-values \'{":name": "Jane Doe", ":email": "jane@example.com"}\'',
    },
    {
      description: "Idempotent increment with existence check",
      command:
        '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123"}\' --update-expression \'SET #count = if_not_exists(#count, :zero) + :inc\' --expression-attribute-names \'{"#count": "count"}\' --expression-attribute-values \'{":inc": 1, ":zero": 0}\'',
    },
    {
      description: "Optimistic locking with version control (AWS recommended)",
      command:
        '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123"}\' --update-expression \'SET version = version + :inc, #name = :name\' --condition-expression \'version = :current\' --expression-attribute-names \'{"#name": "name"}\' --expression-attribute-values \'{":inc": 1, ":name": "Jane", ":current": 5}\'',
    },
    {
      description: "Idempotent list append",
      command:
        "<%= config.bin %> <%= command.id %> my-table '{\"id\": \"user123\"}' --update-expression 'SET tags = if_not_exists(tags, :empty_list)' --expression-attribute-values '{\":empty_list\": []}'",
    },
    {
      description: "Conditional update with existence check (idempotent pattern)",
      command:
        '<%= config.bin %> <%= command.id %> my-table \'{"id": "user123"}\' --update-expression \'SET #status = :status\' --condition-expression \'attribute_exists(id) AND #status = :current\' --expression-attribute-names \'{"#status": "status"}\' --expression-attribute-values \'{":status": "inactive", ":current": "active"}\'',
    },
    {
      description: "Update with return values showing changes",
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
      const keyObject = await parseJsonInput(args.key, "Key input");

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
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      });

      // Prepare update item parameters
      const updateItemParameters = UpdateItemParameterBuilder.build(
        input,
        keyObject,
        expressionAttributeNames,
        expressionAttributeValues,
      );

      // Execute update item operation
      const result = await dynamoService.updateItem(updateItemParameters, {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      });

      // Format output based on requested format
      if (input.returnValues === "NONE" || !result) {
        this.log(`Item successfully updated in table '${input.tableName}' with key:`);
        this.log(JSON.stringify(keyObject, undefined, 2));
      } else {
        const resultLabel = this.getResultLabel(input.returnValues);
        this.log(`Item successfully updated in table '${input.tableName}'. ${resultLabel}:`);
        const formatter = FormatterFactory.create(input.format, (message) => this.log(message));
        formatter.display({ items: [result] });
      }
    } catch (error) {
      const formattedError = handleDynamoDBCommandError(
        error,
        flags.verbose,
        "update item operation",
      );
      this.error(formattedError, { exit: 1 });
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
}
