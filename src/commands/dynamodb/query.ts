/**
 * @module dynamodb/query
 * DynamoDB query table command
 *
 * Performs efficient queries on a DynamoDB table using key conditions
 * with support for filtering, projection, and pagination.
 *
 */

import { Args, Flags } from "@oclif/core";
import { QueryParameterBuilder } from "../../lib/dynamodb-parameter-builders.js";
import type { DynamoDBQuery } from "../../lib/dynamodb-schemas.js";
import { DynamoDBQuerySchema } from "../../lib/dynamodb-schemas.js";
import { handleDynamoDBCommandError } from "../../lib/errors.js";
import { FormatterFactory } from "../../lib/formatters.js";
import { parseOptionalJson, parseRequiredJson } from "../../lib/parsing.js";
import { DynamoDBService } from "../../services/dynamodb-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * DynamoDB query command for table querying
 *
 * Provides querying capabilities using key condition expressions
 * with filtering, projection, and pagination support.
 *
 * @public
 */
export default class DynamoDBQueryCommand extends BaseCommand {
  static override readonly description = "Query a DynamoDB table using key conditions";

  static override readonly examples = [
    {
      description: "Query by partition key",
      command:
        "<%= config.bin %> <%= command.id %> my-table --key-condition-expression 'pk = :pk' --expression-attribute-values '{\":pk\": \"USER#123\"}'",
    },
    {
      description: "Query with partition key and sort key condition",
      command:
        '<%= config.bin %> <%= command.id %> my-table --key-condition-expression \'pk = :pk AND sk BEGINS_WITH :sk\' --expression-attribute-values \'{":pk": "USER#123", ":sk": "ORDER#"}\'',
    },
    {
      description: "Query with filter expression",
      command:
        '<%= config.bin %> <%= command.id %> my-table --key-condition-expression \'pk = :pk\' --filter-expression \'#status = :status\' --expression-attribute-names \'{"#status": "status"}\' --expression-attribute-values \'{":pk": "USER#123", ":status": "ACTIVE"}\'',
    },
    {
      description: "Query with projection expression",
      command:
        "<%= config.bin %> <%= command.id %> my-table --key-condition-expression 'pk = :pk' --projection-expression 'id, #name, email' --expression-attribute-names '{\"#name\": \"name\"}' --expression-attribute-values '{\":pk\": \"USER#123\"}'",
    },
    {
      description: "Query in reverse order",
      command:
        "<%= config.bin %> <%= command.id %> my-table --key-condition-expression 'pk = :pk' --expression-attribute-values '{\":pk\": \"USER#123\"}' --no-scan-index-forward",
    },
    {
      description: "Query with pagination using limit",
      command:
        "<%= config.bin %> <%= command.id %> my-table --key-condition-expression 'pk = :pk' --expression-attribute-values '{\":pk\": \"USER#123\"}' --limit 10",
    },
  ];

  static override readonly args = {
    tableName: Args.string({
      name: "tableName",
      description: "Name of the DynamoDB table to query",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "key-condition-expression": Flags.string({
      description: "Key condition expression (required for queries)",
      helpValue: "EXPRESSION",
      required: true,
    }),

    "filter-expression": Flags.string({
      description: "Filter expression to apply after query",
      helpValue: "EXPRESSION",
    }),

    "projection-expression": Flags.string({
      description: "Projection expression to select specific attributes",
      helpValue: "EXPRESSION",
    }),

    "expression-attribute-names": Flags.string({
      description: "Expression attribute names (JSON object)",
      helpValue: "JSON",
    }),

    "expression-attribute-values": Flags.string({
      description: "Expression attribute values (JSON object)",
      helpValue: "JSON",
      required: true,
    }),

    "exclusive-start-key": Flags.string({
      description: "Exclusive start key for pagination (JSON object)",
      helpValue: "JSON",
    }),

    limit: Flags.integer({
      char: "l",
      description: "Maximum number of items to return",
      min: 1,
      max: 10_000,
    }),

    "consistent-read": Flags.boolean({
      description: "Use consistent read for the operation",
      default: false,
    }),

    "scan-index-forward": Flags.boolean({
      description: "Scan index forward (ascending sort order)",
      default: true,
      allowNo: true,
    }),
  };

  /**
   * Execute the DynamoDB query command
   *
   * @returns Promise resolving when command execution is complete
   * @throws When validation fails or AWS operation encounters an error
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(DynamoDBQueryCommand);

    try {
      // Parse JSON inputs safely
      const expressionAttributeNames = parseOptionalJson(flags["expression-attribute-names"]);
      const expressionAttributeValues = parseRequiredJson(flags["expression-attribute-values"]);
      const exclusiveStartKey = parseOptionalJson(flags["exclusive-start-key"]);

      // Validate input using Zod schema
      const input: DynamoDBQuery = DynamoDBQuerySchema.parse({
        tableName: args.tableName,
        keyConditionExpression: flags["key-condition-expression"],
        filterExpression: flags["filter-expression"],
        projectionExpression: flags["projection-expression"],
        expressionAttributeNames,
        expressionAttributeValues,
        exclusiveStartKey: flags["exclusive-start-key"],
        limit: flags.limit,
        consistentRead: flags["consistent-read"],
        scanIndexForward: flags["scan-index-forward"],
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

      // Prepare query parameters
      const queryParameters = QueryParameterBuilder.build(
        input,
        expressionAttributeNames as Record<string, string> | undefined,
        expressionAttributeValues,
        exclusiveStartKey,
      );

      // Execute query operation
      const result = await dynamoService.query(queryParameters, {
        ...(input.region && { region: input.region }),
        ...(input.profile && { profile: input.profile }),
      });

      // Format output based on requested format
      if (result.items.length === 0) {
        this.log(`No items found in table '${input.tableName}' matching the query conditions.`);
      } else {
        const formatter = FormatterFactory.create(input.format, (message) => this.log(message));
        formatter.display(result);
      }
    } catch (error) {
      const formattedError = handleDynamoDBCommandError(error, flags.verbose, "query operation");
      this.error(formattedError, { exit: 1 });
    }
  }
}
