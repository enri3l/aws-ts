/**
 * @module ssm/parameter-store
 * Parameter Store service for SSM parameter operations
 *
 * Provides a specialized service for AWS Systems Manager Parameter Store operations
 * including get, put, delete, and list operations with support for hierarchical paths.
 */

import {
  DeleteParameterCommand,
  GetParameterCommand,
  GetParameterHistoryCommand,
  GetParametersCommand,
  paginateDescribeParameters,
  PutParameterCommand,
  SSMClient,
  type DeleteParameterCommandOutput,
  type GetParameterCommandOutput,
  type GetParameterHistoryCommandOutput,
  type GetParametersCommandOutput,
  type ParameterMetadata,
  type ParameterStringFilter,
  type PutParameterCommandOutput,
} from "@aws-sdk/client-ssm";
import { BaseAwsService, type BaseServiceOptions } from "../../lib/base-aws-service.js";
import { retryWithBackoff } from "../../lib/retry.js";
import { SSMParameterError } from "../../lib/ssm/ssm-errors.js";
import type { AwsClientConfig } from "../credential-service.js";

/**
 * Configuration options for Parameter Store service
 *
 * @public
 */
export type ParameterStoreServiceOptions = BaseServiceOptions;

/**
 * Parameters for getting a parameter
 *
 * @public
 */
export interface GetParameterParameters {
  name: string;
  withDecryption?: boolean;
}

/**
 * Parameters for getting multiple parameters
 *
 * @public
 */
export interface GetParametersParameters {
  names: string[];
  withDecryption?: boolean;
}

/**
 * Parameters for putting a parameter
 *
 * @public
 */
export interface PutParameterParameters {
  name: string;
  value: string;
  type?: "String" | "StringList" | "SecureString";
  description?: string;
  keyId?: string;
  overwrite?: boolean;
  tier?: "Standard" | "Advanced" | "Intelligent-Tiering";
}

/**
 * Parameters for listing parameters
 *
 * @public
 */
export interface ListParametersParameters {
  path?: string;
  recursive?: boolean;
  maxResults?: number;
}

/**
 * Parameters for getting parameter history
 *
 * @public
 */
export interface GetParameterHistoryParameters {
  name: string;
  withDecryption?: boolean;
  maxResults?: number;
  nextToken?: string;
}

/**
 * Parameter Store service for SSM parameter operations
 *
 * Provides a unified interface for Parameter Store operations,
 * coordinating with credential management and providing error handling.
 *
 * @public
 */
export class ParameterStoreService extends BaseAwsService<SSMClient> {
  /**
   * Create a new Parameter Store service instance
   *
   * @param options - Configuration options for the service
   */
  constructor(options: ParameterStoreServiceOptions = {}) {
    super(SSMClient, options);
  }

  /**
   * Get a parameter from Parameter Store
   *
   * @param config - AWS client configuration
   * @param parameters - Parameter retrieval parameters
   * @returns Parameter information including value
   */
  async getParameter(
    config: AwsClientConfig,
    parameters: GetParameterParameters,
  ): Promise<GetParameterCommandOutput> {
    const { name, withDecryption = false } = parameters;
    const spinner = this.createSpinner(`Getting parameter ${name}...`);

    try {
      const client = await this.getClient(config);
      const command = new GetParameterCommand({
        Name: name,
        WithDecryption: withDecryption,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying get parameter (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Retrieved parameter ${name}`);
      return response;
    } catch (error) {
      spinner.fail("Failed to get parameter");
      throw new SSMParameterError(
        `Failed to get parameter ${name}: ${error instanceof Error ? error.message : String(error)}`,
        name,
        "get-parameter",
        undefined,
        error,
      );
    }
  }

  /**
   * Get multiple parameters from Parameter Store
   *
   * @param config - AWS client configuration
   * @param parameters - Multiple parameter retrieval parameters
   * @returns Multiple parameters information
   */
  async getParameters(
    config: AwsClientConfig,
    parameters: GetParametersParameters,
  ): Promise<GetParametersCommandOutput> {
    const { names, withDecryption = false } = parameters;
    const spinner = this.createSpinner(`Getting ${names.length} parameter(s)...`);

    try {
      const client = await this.getClient(config);
      const command = new GetParametersCommand({
        Names: names,
        WithDecryption: withDecryption,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying get parameters (attempt ${attempt})...`;
        },
      });

      const foundCount = response.Parameters?.length || 0;
      const invalidCount = response.InvalidParameters?.length || 0;
      const notFoundMessage = invalidCount > 0 ? ` (${invalidCount} not found)` : "";
      spinner.succeed(`Retrieved ${foundCount} parameter(s)${notFoundMessage}`);
      return response;
    } catch (error) {
      spinner.fail("Failed to get parameters");
      throw new SSMParameterError(
        `Failed to get parameters: ${error instanceof Error ? error.message : String(error)}`,
        names.join(", "),
        "get-parameters",
        undefined,
        error,
      );
    }
  }

  /**
   * Put a parameter to Parameter Store
   *
   * @param config - AWS client configuration
   * @param parameters - Parameter storage parameters
   * @returns Parameter storage result
   */
  async putParameter(
    config: AwsClientConfig,
    parameters: PutParameterParameters,
  ): Promise<PutParameterCommandOutput> {
    const {
      name,
      value,
      type = "String",
      description,
      keyId,
      overwrite = false,
      tier = "Standard",
    } = parameters;
    const action = overwrite ? "Updating" : "Creating";
    const spinner = this.createSpinner(`${action} parameter ${name}...`);

    try {
      const client = await this.getClient(config);
      const command = new PutParameterCommand({
        Name: name,
        Value: value,
        Type: type,
        Description: description,
        KeyId: keyId,
        Overwrite: overwrite,
        Tier: tier,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying put parameter (attempt ${attempt})...`;
        },
      });

      const actionPast = overwrite ? "Updated" : "Created";
      spinner.succeed(`${actionPast} parameter ${name} (version ${response.Version})`);
      return response;
    } catch (error) {
      spinner.fail("Failed to put parameter");
      throw new SSMParameterError(
        `Failed to put parameter ${name}: ${error instanceof Error ? error.message : String(error)}`,
        name,
        "put-parameter",
        tier,
        error,
      );
    }
  }

  /**
   * Delete a parameter from Parameter Store
   *
   * @param config - AWS client configuration
   * @param name - Name of the parameter to delete
   * @returns Parameter deletion result
   */
  async deleteParameter(
    config: AwsClientConfig,
    name: string,
  ): Promise<DeleteParameterCommandOutput> {
    const spinner = this.createSpinner(`Deleting parameter ${name}...`);

    try {
      const client = await this.getClient(config);
      const command = new DeleteParameterCommand({
        Name: name,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying delete parameter (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Deleted parameter ${name}`);
      return response;
    } catch (error) {
      spinner.fail("Failed to delete parameter");
      throw new SSMParameterError(
        `Failed to delete parameter ${name}: ${error instanceof Error ? error.message : String(error)}`,
        name,
        "delete-parameter",
        undefined,
        error,
      );
    }
  }

  /**
   * List parameters from Parameter Store
   *
   * @param config - AWS client configuration
   * @param parameters - Parameter listing parameters
   * @returns List of parameter metadata
   */
  async listParameters(
    config: AwsClientConfig,
    parameters: ListParametersParameters = {},
  ): Promise<ParameterMetadata[]> {
    const { path, recursive = false, maxResults = 50 } = parameters;
    const pathDisplay = path || "all parameters";
    const spinner = this.createSpinner(`Listing ${pathDisplay}...`);

    try {
      const client = await this.getClient(config);
      const filters: ParameterStringFilter[] = [];

      if (path) {
        filters.push({
          Key: recursive ? "Path" : "Name",
          Option: recursive ? "Recursive" : "Equals",
          Values: [path],
        });
      }

      const paginatorConfig = { client };
      const input = {
        ParameterFilters: filters.length > 0 ? filters : undefined,
        MaxResults: maxResults,
      };

      const allParameters: ParameterMetadata[] = [];
      const paginator = paginateDescribeParameters(paginatorConfig, input);

      for await (const page of paginator) {
        const parameters = page.Parameters || [];
        for (const parameter of parameters) {
          allParameters.push(parameter);
        }
      }

      const parameterCount = allParameters.length;
      const parameterPlural = parameterCount === 1 ? "" : "s";
      spinner.succeed(`Found ${parameterCount} parameter${parameterPlural}`);
      return allParameters;
    } catch (error) {
      spinner.fail("Failed to list parameters");
      throw new SSMParameterError(
        `Failed to list parameters: ${error instanceof Error ? error.message : String(error)}`,
        path,
        "list-parameters",
        undefined,
        error,
      );
    }
  }

  /**
   * Get parameter history from Parameter Store
   *
   * @param config - AWS client configuration
   * @param parameters - Parameter history retrieval parameters
   * @returns Parameter history information
   */
  async getParameterHistory(
    config: AwsClientConfig,
    parameters: GetParameterHistoryParameters,
  ): Promise<GetParameterHistoryCommandOutput> {
    const { name, withDecryption = false, maxResults, nextToken } = parameters;
    const spinner = this.createSpinner(`Getting parameter history for ${name}...`);

    try {
      const client = await this.getClient(config);
      const command = new GetParameterHistoryCommand({
        Name: name,
        WithDecryption: withDecryption,
        MaxResults: maxResults,
        NextToken: nextToken,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying get parameter history (attempt ${attempt})...`;
        },
      });

      const historyCount = response.Parameters?.length || 0;
      const historyPlural = historyCount === 1 ? "" : "s";
      spinner.succeed(`Found ${historyCount} version${historyPlural} for ${name}`);
      return response;
    } catch (error) {
      spinner.fail("Failed to get parameter history");
      throw new SSMParameterError(
        `Failed to get parameter history for ${name}: ${error instanceof Error ? error.message : String(error)}`,
        name,
        "get-parameter-history",
        undefined,
        error,
      );
    }
  }
}
