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
  PutParameterCommand,
  SSMClient,
  type DeleteParameterCommandOutput,
  type GetParameterCommandOutput,
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
}
