/**
 * DynamoDB parameter builders for reducing cognitive complexity
 *
 * Provides builder pattern implementations for constructing DynamoDB operation
 * parameters, eliminating complex conditional spread operators and improving
 * code maintainability and testability.
 *
 * @file Centralized parameter building to reduce cognitive complexity in commands
 */

import type {
  GetItemParameters,
  PutItemParameters,
  QueryParameters,
  ScanParameters,
  UpdateItemParameters,
} from "../services/dynamodb-service.js";
import type {
  DynamoDBGetItem,
  DynamoDBPutItem,
  DynamoDBQuery,
  DynamoDBScan,
  DynamoDBUpdateItem,
} from "./dynamodb-schemas.js";

/**
 * Builder for DynamoDB query parameters
 *
 * Encapsulates the complex conditional logic for building QueryParameters
 * from parsed command line inputs and JSON values.
 *
 * @public
 */
export const QueryParameterBuilder = {
  /**
   * Build query parameters from input and parsed JSON values
   *
   * @param input - Validated DynamoDB query input
   * @param expressionAttributeNames - Parsed expression attribute names
   * @param expressionAttributeValues - Parsed expression attribute values
   * @param exclusiveStartKey - Parsed exclusive start key
   * @returns Query parameters for DynamoDB service
   */
  build(
    input: DynamoDBQuery,
    expressionAttributeNames: Record<string, string> | undefined,
    expressionAttributeValues: Record<string, unknown> | undefined,
    exclusiveStartKey: Record<string, unknown> | undefined,
  ): QueryParameters {
    const parameters: QueryParameters = {
      tableName: input.tableName,
      keyConditionExpression: input.keyConditionExpression,
      consistentRead: input.consistentRead,
      scanIndexForward: input.scanIndexForward,
    };

    if (input.filterExpression) {
      parameters.filterExpression = input.filterExpression;
    }
    if (input.projectionExpression) {
      parameters.projectionExpression = input.projectionExpression;
    }
    if (expressionAttributeNames) {
      parameters.expressionAttributeNames = expressionAttributeNames;
    }
    if (expressionAttributeValues) {
      parameters.expressionAttributeValues = expressionAttributeValues;
    }
    if (exclusiveStartKey) {
      parameters.exclusiveStartKey = exclusiveStartKey;
    }
    if (input.limit) {
      parameters.limit = input.limit;
    }

    return parameters;
  },
};

/**
 * Builder for DynamoDB scan parameters
 *
 * Encapsulates the complex conditional logic for building ScanParameters
 * from parsed command line inputs and JSON values.
 *
 * @public
 */
export const ScanParameterBuilder = {
  /**
   * Build scan parameters from input and parsed JSON values
   *
   * @param input - Validated DynamoDB scan input
   * @param expressionAttributeNames - Parsed expression attribute names
   * @param expressionAttributeValues - Parsed expression attribute values
   * @param exclusiveStartKey - Parsed exclusive start key
   * @returns Scan parameters for DynamoDB service
   */
  build(
    input: DynamoDBScan,
    expressionAttributeNames: Record<string, string> | undefined,
    expressionAttributeValues: Record<string, unknown> | undefined,
    exclusiveStartKey: Record<string, unknown> | undefined,
  ): ScanParameters {
    const parameters: ScanParameters = {
      tableName: input.tableName,
      consistentRead: input.consistentRead,
    };

    if (input.indexName) {
      parameters.indexName = input.indexName;
    }
    if (input.filterExpression) {
      parameters.filterExpression = input.filterExpression;
    }
    if (input.projectionExpression) {
      parameters.projectionExpression = input.projectionExpression;
    }
    if (expressionAttributeNames) {
      parameters.expressionAttributeNames = expressionAttributeNames;
    }
    if (expressionAttributeValues) {
      parameters.expressionAttributeValues = expressionAttributeValues;
    }
    if (exclusiveStartKey) {
      parameters.exclusiveStartKey = exclusiveStartKey;
    }
    if (input.limit) {
      parameters.limit = input.limit;
    }
    if (input.segment !== undefined) {
      parameters.segment = input.segment;
    }
    if (input.totalSegments) {
      parameters.totalSegments = input.totalSegments;
    }

    return parameters;
  },
};

/**
 * Builder for DynamoDB update item parameters
 *
 * Encapsulates the complex conditional logic for building UpdateItemParameters
 * from parsed command line inputs and JSON values.
 *
 * @public
 */
export const UpdateItemParameterBuilder = {
  /**
   * Build update item parameters from input and parsed JSON values
   *
   * @param input - Validated DynamoDB update item input
   * @param keyObject - Parsed key object
   * @param expressionAttributeNames - Parsed expression attribute names
   * @param expressionAttributeValues - Parsed expression attribute values
   * @returns Update item parameters for DynamoDB service
   */
  build(
    input: DynamoDBUpdateItem,
    keyObject: Record<string, unknown>,
    expressionAttributeNames: Record<string, string> | undefined,
    expressionAttributeValues: Record<string, unknown> | undefined,
  ): UpdateItemParameters {
    const parameters: UpdateItemParameters = {
      tableName: input.tableName,
      key: keyObject,
      updateExpression: input.updateExpression,
      returnValues: input.returnValues,
    };

    if (input.conditionExpression) {
      parameters.conditionExpression = input.conditionExpression;
    }
    if (expressionAttributeNames) {
      parameters.expressionAttributeNames = expressionAttributeNames;
    }
    if (expressionAttributeValues) {
      parameters.expressionAttributeValues = expressionAttributeValues;
    }

    return parameters;
  },
};

/**
 * Builder for DynamoDB get item parameters
 *
 * Encapsulates the complex conditional logic for building GetItemParameters
 * from parsed command line inputs and JSON values.
 *
 * @public
 */
export const GetItemParameterBuilder = {
  /**
   * Build get item parameters from input and parsed JSON values
   *
   * @param input - Validated DynamoDB get item input
   * @param keyObject - Parsed key object
   * @param expressionAttributeNames - Parsed expression attribute names
   * @returns Get item parameters for DynamoDB service
   */
  build(
    input: DynamoDBGetItem,
    keyObject: Record<string, unknown>,
    expressionAttributeNames: Record<string, string> | undefined,
  ): GetItemParameters {
    const parameters: GetItemParameters = {
      tableName: input.tableName,
      key: keyObject,
      consistentRead: input.consistentRead,
    };

    if (input.projectionExpression) {
      parameters.projectionExpression = input.projectionExpression;
    }
    if (expressionAttributeNames) {
      parameters.expressionAttributeNames = expressionAttributeNames;
    }

    return parameters;
  },
};

/**
 * Builder for DynamoDB put item parameters
 *
 * Encapsulates the complex conditional logic for building PutItemParameters
 * from parsed command line inputs and JSON values.
 *
 * @public
 */
export const PutItemParameterBuilder = {
  /**
   * Build put item parameters from input and parsed JSON values
   *
   * @param input - Validated DynamoDB put item input
   * @param itemObject - Parsed item object
   * @param expressionAttributeNames - Parsed expression attribute names
   * @param expressionAttributeValues - Parsed expression attribute values
   * @returns Put item parameters for DynamoDB service
   */
  build(
    input: DynamoDBPutItem,
    itemObject: Record<string, unknown>,
    expressionAttributeNames: Record<string, string> | undefined,
    expressionAttributeValues: Record<string, unknown> | undefined,
  ): PutItemParameters {
    const parameters: PutItemParameters = {
      tableName: input.tableName,
      item: itemObject,
      returnValues: input.returnValues,
    };

    if (input.conditionExpression) {
      parameters.conditionExpression = input.conditionExpression;
    }
    if (expressionAttributeNames) {
      parameters.expressionAttributeNames = expressionAttributeNames;
    }
    if (expressionAttributeValues) {
      parameters.expressionAttributeValues = expressionAttributeValues;
    }

    return parameters;
  },
};
