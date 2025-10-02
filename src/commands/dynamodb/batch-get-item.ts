/**
 * @module dynamodb/batch-get-item
 * DynamoDB batch get item command
 *
 * Retrieves multiple items efficiently from one or more DynamoDB tables
 * with automatic batching and retry handling.
 *
 */

import {
  BatchGetCommand,
  type BatchGetCommandInput,
  type BatchGetCommandOutput,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import { Args, Flags } from "@oclif/core";
import type { DynamoDBBatchGetItem } from "../../lib/dynamodb-schemas.js";
import { DynamoDBBatchGetItemSchema } from "../../lib/dynamodb-schemas.js";
import { handleDynamoDBCommandError } from "../../lib/errors.js";
import { FormatterFactory } from "../../lib/formatters.js";
import { parseJsonInput } from "../../lib/parsing.js";
import { DynamoDBService } from "../../services/dynamodb-service.js";
import { BaseCommand } from "../base-command.js";

/**
 * DynamoDB batch get item command for multi-item retrieval
 *
 * Provides batch retrieval capabilities for multiple items
 * across one or more tables with automatic retry handling.
 *
 * @public
 */
export default class DynamoDBBatchGetItemCommand extends BaseCommand {
  static override readonly description = "Get multiple items from DynamoDB tables in batch";

  static override readonly examples = [
    {
      description: "Batch get items using JSON request specification",
      command:
        '<%= config.bin %> <%= command.id %> \'{"my-table": {"Keys": [{"id": "user1"}, {"id": "user2"}]}}\'',
    },
    {
      description: "Batch get items from file",
      command: "<%= config.bin %> <%= command.id %> file://batch-request.json",
    },
    {
      description: "Batch get with projection expression",
      command:
        '<%= config.bin %> <%= command.id %> \'{"my-table": {"Keys": [{"id": "user1"}], "ProjectionExpression": "id, #name, email", "ExpressionAttributeNames": {"#name": "name"}}}\'',
    },
    {
      description: "Batch get with consistent reads",
      command:
        '<%= config.bin %> <%= command.id %> \'{"my-table": {"Keys": [{"id": "user1"}], "ConsistentRead": true}}\' --consistent-read',
    },
  ];

  static override readonly args = {
    requestItems: Args.string({
      name: "requestItems",
      description: "Request items specification as JSON string or file path (file://request.json)",
      required: true,
    }),
  };

  static override readonly flags = {
    ...BaseCommand.commonFlags,

    "consistent-read": Flags.boolean({
      description: "Use consistent reads for all tables (can be overridden per table)",
      default: false,
    }),
  };

  /**
   * Execute the DynamoDB batch get item command
   *
   * @returns Promise resolving when command execution is complete
   */
  async run(): Promise<void> {
    const { args, flags } = await this.parse(DynamoDBBatchGetItemCommand);

    try {
      // Parse request items input (JSON string or file path)
      const requestItemsObject = (await parseJsonInput(
        args.requestItems,
        "Request items input",
      )) as NonNullable<BatchGetCommandInput["RequestItems"]>;

      // Validate input using Zod schema
      const input: DynamoDBBatchGetItem = DynamoDBBatchGetItemSchema.parse({
        requestItems: args.requestItems,
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

      // Execute batch get operation
      const result = await this.executeBatchGetItem(
        dynamoService,
        requestItemsObject,
        input.consistentRead,
        {
          ...(input.region && { region: input.region }),
          ...(input.profile && { profile: input.profile }),
        },
      );

      // Format output based on requested format
      const formatter = FormatterFactory.create(input.format, (message) => this.log(message));
      formatter.display(result);
    } catch (error) {
      if (error instanceof SyntaxError && error.message.includes("JSON")) {
        this.error(`Invalid JSON in request items parameter: ${error.message}`, { exit: 1 });
      }

      if (error instanceof Error && error.message.includes("ENOENT")) {
        this.error("Request items file not found. Ensure the file path is correct.", { exit: 1 });
      }

      const formattedError = handleDynamoDBCommandError(
        error,
        flags.verbose,
        "batch get item operation",
      );
      this.error(formattedError, { exit: 1 });
    }
  }

  /**
   * Execute batch get item operation with retry handling
   *
   * @param dynamoService - DynamoDB service instance
   * @param requestItems - Request items specification
   * @param consistentRead - Whether to use consistent reads
   * @param config - AWS client configuration with optional region and profile settings
   * @returns Promise resolving to batch get results
   * @throws Error When AWS operation fails or document client cannot be created
   * @internal
   */
  private async executeBatchGetItem(
    dynamoService: DynamoDBService,
    requestItems: NonNullable<BatchGetCommandInput["RequestItems"]>,
    consistentRead: boolean,
    config: { region?: string; profile?: string },
  ): Promise<{
    responses: Record<string, Record<string, unknown>[]>;
    unprocessedKeys: Record<string, unknown>;
  }> {
    // Get document client for batch operations
    const documentClient = await dynamoService.getDocumentClient(config);

    // Prepare request items with consistent read if needed
    const preparedRequestItems = this.prepareRequestItems(requestItems, consistentRead);

    // Execute with simple retry logic
    const allResponses: Record<string, Record<string, unknown>[]> = {};
    let currentRequestItems = { ...preparedRequestItems };
    const maxRetries = 3;

    for (
      let attempt = 0;
      attempt <= maxRetries && Object.keys(currentRequestItems).length > 0;
      attempt++
    ) {
      const response = await this.executeSingleBatchGet(documentClient, currentRequestItems);

      this.mergeResponses(allResponses, response.Responses);

      currentRequestItems = response.UnprocessedKeys || {};

      if (Object.keys(currentRequestItems).length > 0 && attempt < maxRetries) {
        await this.waitWithBackoff(attempt + 1);
      }
    }

    return {
      responses: allResponses,
      unprocessedKeys: currentRequestItems,
    };
  }

  /**
   * Prepare request items with consistent read setting
   *
   * @param requestItems - Original request items
   * @param consistentRead - Whether to enable consistent read
   * @returns Prepared request items
   * @internal
   */
  private prepareRequestItems(
    requestItems: NonNullable<BatchGetCommandInput["RequestItems"]>,
    consistentRead: boolean,
  ): NonNullable<BatchGetCommandInput["RequestItems"]> {
    if (!consistentRead) {
      return requestItems;
    }

    const prepared = { ...requestItems };
    for (const tableName in prepared) {
      const tableRequest = prepared[tableName] as Record<string, unknown>;
      if (!tableRequest.ConsistentRead) {
        tableRequest.ConsistentRead = true;
      }
    }
    return prepared;
  }

  /**
   * Execute a single batch get operation
   *
   * @param documentClient - DynamoDB document client
   * @param requestItems - Items to retrieve
   * @returns Batch get response
   * @internal
   */
  private async executeSingleBatchGet(
    documentClient: DynamoDBDocumentClient,
    requestItems: NonNullable<BatchGetCommandInput["RequestItems"]>,
  ): Promise<BatchGetCommandOutput> {
    const command = new BatchGetCommand({ RequestItems: requestItems });
    return await documentClient.send(command);
  }

  /**
   * Merge responses from multiple batch operations
   *
   * @param allResponses - Accumulated responses
   * @param newResponses - New responses to merge
   * @internal
   */
  private mergeResponses(
    allResponses: Record<string, Record<string, unknown>[]>,
    newResponses?: Record<string, Record<string, unknown>[]>,
  ): void {
    if (!newResponses) return;

    for (const [tableName, items] of Object.entries(newResponses)) {
      if (!allResponses[tableName]) {
        allResponses[tableName] = [];
      }
      allResponses[tableName].push(...items);
    }
  }

  /**
   * Wait with exponential backoff
   *
   * @param attempt - Current attempt number
   * @internal
   */
  private async waitWithBackoff(attempt: number): Promise<void> {
    const delay = Math.pow(2, attempt) * 100;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
