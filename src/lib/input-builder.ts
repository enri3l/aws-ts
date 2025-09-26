/**
 * Input building utilities for DynamoDB commands
 *
 * Provides centralized parameter parsing and validation to reduce
 * cognitive complexity in command run() methods.
 *
 * @file Centralized input building with validation
 */

import { parseJsonInput, parseJsonStringInput } from "./parsing.js";

/**
 * Base interface for command input
 */
export interface BaseCommandInput {
  region?: string;
  profile?: string;
  format: string;
  verbose: boolean;
}

/**
 * Builder for DynamoDB command inputs
 *
 * Handles parameter parsing, validation, and input object construction
 * to simplify command run() methods.
 *
 * @remarks
 * This builder implements the Single Responsibility Principle by extracting
 * input parsing complexity from DynamoDB command run() methods. It provides
 * consistent JSON parsing, optional parameter handling, and type-safe
 * configuration building across all DynamoDB commands, reducing cognitive
 * complexity and ensuring uniform input validation.
 */
export const DynamoDBInputBuilder = {
  /**
   * Build input for commands that require JSON key parsing
   *
   * @param arguments_ - Command arguments containing table name and JSON key string
   * @param flags - Command flags including optional expression attributes and AWS config
   * @returns Promise resolving to parsed input with validated key object and optional attributes
   */
  async buildWithKey(
    arguments_: { tableName: string; key: string },
    flags: Record<string, unknown>,
  ): Promise<{
    tableName: string;
    key: Record<string, unknown>;
    expressionAttributeNames?: Record<string, string>;
    expressionAttributeValues?: Record<string, unknown>;
    region?: string;
    profile?: string;
    format: string;
    verbose: boolean;
  }> {
    // Parse key input
    const key = await parseJsonInput(arguments_.key, "Key input");

    // Parse optional expression attributes
    const expressionAttributeNames = flags["expression-attribute-names"]
      ? await parseJsonStringInput(
          flags["expression-attribute-names"] as string,
          "Expression attribute names",
        )
      : undefined;

    const expressionAttributeValues = flags["expression-attribute-values"]
      ? await parseJsonInput(
          flags["expression-attribute-values"] as string,
          "Expression attribute values",
        )
      : undefined;

    return {
      tableName: arguments_.tableName,
      key,
      ...(expressionAttributeNames && { expressionAttributeNames }),
      ...(expressionAttributeValues && { expressionAttributeValues }),
      ...(flags.region ? { region: flags.region as string } : {}),
      ...(flags.profile ? { profile: flags.profile as string } : {}),
      format: flags.format as string,
      verbose: flags.verbose as boolean,
    };
  },

  /**
   * Build input for commands that require JSON item parsing
   *
   * @param arguments_ - Command arguments containing table name and JSON item string
   * @param flags - Command flags including optional expression attributes and AWS config
   * @returns Promise resolving to parsed input with validated item object and optional attributes
   */
  async buildWithItem(
    arguments_: { tableName: string; item: string },
    flags: Record<string, unknown>,
  ): Promise<{
    tableName: string;
    item: Record<string, unknown>;
    expressionAttributeNames?: Record<string, string>;
    expressionAttributeValues?: Record<string, unknown>;
    region?: string;
    profile?: string;
    format: string;
    verbose: boolean;
  }> {
    // Parse item input
    const item = await parseJsonInput(arguments_.item, "Item input");

    // Parse optional expression attributes
    const expressionAttributeNames = flags["expression-attribute-names"]
      ? await parseJsonStringInput(
          flags["expression-attribute-names"] as string,
          "Expression attribute names",
        )
      : undefined;

    const expressionAttributeValues = flags["expression-attribute-values"]
      ? await parseJsonInput(
          flags["expression-attribute-values"] as string,
          "Expression attribute values",
        )
      : undefined;

    return {
      tableName: arguments_.tableName,
      item,
      ...(expressionAttributeNames && { expressionAttributeNames }),
      ...(expressionAttributeValues && { expressionAttributeValues }),
      ...(flags.region ? { region: flags.region as string } : {}),
      ...(flags.profile ? { profile: flags.profile as string } : {}),
      format: flags.format as string,
      verbose: flags.verbose as boolean,
    };
  },

  /**
   * Build standard configuration for AWS client
   *
   * @param input - Input object containing optional AWS region and profile settings
   * @returns AWS client configuration object with only defined properties
   */
  buildClientConfig(input: { region?: string; profile?: string }): {
    region?: string;
    profile?: string;
  } {
    return {
      ...(input.region && { region: input.region }),
      ...(input.profile && { profile: input.profile }),
    };
  },
};
