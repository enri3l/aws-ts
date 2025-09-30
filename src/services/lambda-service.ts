/**
 * Lambda service for function management and invocation
 *
 * Orchestrates AWS Lambda operations by providing a unified interface for
 * function lifecycle management, code deployment, configuration updates,
 * and invocation. Integrates with existing credential management for
 * AWS SDK client creation.
 *
 */

import {
  CreateAliasCommand,
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
  InvokeCommand,
  LambdaClient,
  PublishVersionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  paginateListFunctions,
  paginateListVersionsByFunction,
  type AliasConfiguration,
  type CreateFunctionRequest,
  type DeleteFunctionCommandOutput,
  type FunctionConfiguration,
  type GetFunctionRequest,
  type InvokeCommandOutput,
  type ListFunctionsRequest,
  type UpdateFunctionCodeRequest,
  type UpdateFunctionConfigurationRequest,
} from "@aws-sdk/client-lambda";
import { BaseAwsService, type BaseServiceOptions } from "../lib/base-aws-service.js";
import {
  CodeDeploymentError,
  FunctionError,
  InvocationError,
  LambdaConfigurationError,
} from "../lib/lambda-errors.js";
import { retryWithBackoff } from "../lib/retry.js";
import type { AwsClientConfig } from "./credential-service.js";

/**
 * Configuration options for Lambda service
 *
 * @public
 */
export type LambdaServiceOptions = BaseServiceOptions;

/**
 * Lambda function invocation parameters
 *
 * @public
 */
export interface LambdaInvokeParameters {
  functionName: string;
  invocationType?: "Event" | "RequestResponse" | "DryRun";
  logType?: "None" | "Tail";
  payload?: string;
  qualifier?: string;
  clientContext?: string;
}

/**
 * Lambda function creation parameters
 *
 * @public
 */
export interface LambdaCreateFunctionParameters {
  functionName: string;
  runtime: string;
  role: string;
  handler: string;
  code: {
    zipFile?: Uint8Array;
    s3Bucket?: string;
    s3Key?: string;
    s3ObjectVersion?: string;
  };
  description?: string;
  timeout?: number;
  memorySize?: number;
  environment?: {
    variables?: Record<string, string>;
  };
  vpcConfig?: {
    subnetIds: string[];
    securityGroupIds: string[];
  };
  deadLetterConfig?: {
    targetArn: string;
  };
  tracingConfig?: {
    mode: "Active" | "PassThrough";
  };
  tags?: Record<string, string>;
}

/**
 * Lambda function code update parameters
 *
 * @public
 */
export interface LambdaUpdateCodeParameters {
  functionName: string;
  zipFile?: Uint8Array;
  s3Bucket?: string;
  s3Key?: string;
  s3ObjectVersion?: string;
  publish?: boolean;
  dryRun?: boolean;
  revisionId?: string;
}

/**
 * Lambda function configuration update parameters
 *
 * @public
 */
export interface LambdaUpdateConfigurationParameters {
  functionName: string;
  role?: string | undefined;
  handler?: string | undefined;
  description?: string | undefined;
  timeout?: number | undefined;
  memorySize?: number | undefined;
  vpcConfig?:
    | {
        subnetIds: string[];
        securityGroupIds: string[];
      }
    | undefined;
  environment?:
    | {
        variables?: Record<string, string>;
      }
    | undefined;
  runtime?: string | undefined;
  deadLetterConfig?:
    | {
        targetArn?: string;
      }
    | undefined;
  layers?: string[] | undefined;
  kmsKeyArn?: string | undefined;
  tracingConfig?:
    | {
        mode: "Active" | "PassThrough";
      }
    | undefined;
  revisionId?: string | undefined;
}

/**
 * Lambda service for function management
 *
 * Provides a unified interface for all Lambda operations,
 * coordinating with credential management and providing error handling.
 *
 * @public
 */
export class LambdaService extends BaseAwsService<LambdaClient> {
  /**
   * Create a new Lambda service instance
   *
   * @param options - Configuration options for the service
   */
  constructor(options: LambdaServiceOptions = {}) {
    super(LambdaClient, options);
  }

  /**
   * List all Lambda functions using AWS SDK v3 native pagination
   *
   * @param config - Client configuration options
   * @param params - List functions parameters
   * @returns Promise resolving to array of function configurations
   * @throws When function listing fails
   *
   * @remarks
   * Uses AWS SDK v3's built-in async iterator pagination pattern for efficient
   * memory usage and automatic token handling. Fetches all pages unless MaxItems
   * is specified.
   */
  async listFunctions(
    config: AwsClientConfig = {},
    parameters: Partial<ListFunctionsRequest> = {},
  ): Promise<FunctionConfiguration[]> {
    const spinner = this.createSpinner("Listing Lambda functions...");

    try {
      const client = await this.getClient(config);
      const allFunctions: FunctionConfiguration[] = [];
      let pageCount = 0;

      // Use AWS SDK v3 native paginator with async iterator
      const paginatorConfig = parameters.MaxItems
        ? { client, pageSize: parameters.MaxItems }
        : { client };
      const paginator = paginateListFunctions(paginatorConfig, parameters);

      for await (const page of paginator) {
        pageCount++;
        const functions = page.Functions || [];
        allFunctions.push(...functions);

        spinner.text = `Loading Lambda functions... (${allFunctions.length} so far, ${pageCount} page${pageCount === 1 ? "" : "s"})`;

        // Stop if we've reached MaxItems limit
        if (parameters.MaxItems && allFunctions.length >= parameters.MaxItems) {
          break;
        }
      }

      const functionPlural = allFunctions.length === 1 ? "" : "s";
      spinner.succeed(`Found ${allFunctions.length} Lambda function${functionPlural}`);
      return allFunctions;
    } catch (error) {
      spinner.fail("Failed to list functions");
      throw new FunctionError(
        `Failed to list Lambda functions: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        "list-functions",
        error,
      );
    }
  }

  /**
   * Get detailed information about a Lambda function
   *
   * @param functionName - Name or ARN of the Lambda function
   * @param config - Client configuration options
   * @param params - Additional get function parameters
   * @returns Promise resolving to function configuration and code details
   * @throws When function retrieval fails
   */
  async getFunction(
    functionName: string,
    config: AwsClientConfig = {},
    parameters: Partial<GetFunctionRequest> = {},
  ): Promise<{
    configuration?: FunctionConfiguration;
    code?: { repositoryType?: string; location?: string };
    tags?: Record<string, string>;
  }> {
    const spinner = this.createSpinner(`Getting function '${functionName}'...`);

    try {
      const client = await this.getClient(config);
      const command = new GetFunctionCommand({
        FunctionName: functionName,
        ...parameters,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying get function (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Retrieved function '${functionName}'`);
      return {
        ...(response.Configuration && { configuration: response.Configuration }),
        ...(response.Code && {
          code: {
            ...(response.Code.RepositoryType && { repositoryType: response.Code.RepositoryType }),
            ...(response.Code.Location && { location: response.Code.Location }),
          },
        }),
        ...(response.Tags && { tags: response.Tags }),
      };
    } catch (error) {
      spinner.fail(`Failed to get function '${functionName}'`);
      throw new FunctionError(
        `Failed to get function '${functionName}': ${error instanceof Error ? error.message : String(error)}`,
        functionName,
        "get-function",
        error,
      );
    }
  }

  /**
   * Get configuration details for a Lambda function
   *
   * @param functionName - Name or ARN of the Lambda function
   * @param config - Client configuration options
   * @param qualifier - Function version or alias
   * @returns Promise resolving to function configuration
   * @throws When configuration retrieval fails
   */
  async getFunctionConfiguration(
    functionName: string,
    config: AwsClientConfig = {},
    qualifier?: string,
  ): Promise<FunctionConfiguration> {
    const spinner = this.createSpinner(`Getting configuration for function '${functionName}'...`);

    try {
      const client = await this.getClient(config);
      const command = new GetFunctionConfigurationCommand({
        FunctionName: functionName,
        ...(qualifier && { Qualifier: qualifier }),
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying get function configuration (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Retrieved configuration for function '${functionName}'`);
      return response;
    } catch (error) {
      spinner.fail(`Failed to get configuration for function '${functionName}'`);
      throw new FunctionError(
        `Failed to get function configuration '${functionName}': ${error instanceof Error ? error.message : String(error)}`,
        functionName,
        "get-function-configuration",
        error,
      );
    }
  }

  /**
   * Invoke a Lambda function
   *
   * @param parameters - Function invocation parameters
   * @param config - Client configuration options
   * @returns Promise resolving to invocation response
   * @throws When function invocation fails
   */
  async invoke(
    parameters: LambdaInvokeParameters,
    config: AwsClientConfig = {},
  ): Promise<InvokeCommandOutput> {
    const spinner = this.createSpinner(`Invoking function '${parameters.functionName}'...`);

    try {
      const client = await this.getClient(config);
      const command = new InvokeCommand({
        FunctionName: parameters.functionName,
        InvocationType: parameters.invocationType || "RequestResponse",
        LogType: parameters.logType || "None",
        ...(parameters.payload && { Payload: new TextEncoder().encode(parameters.payload) }),
        ...(parameters.qualifier && { Qualifier: parameters.qualifier }),
        ...(parameters.clientContext && { ClientContext: parameters.clientContext }),
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying invoke (attempt ${attempt})...`;
        },
      });

      const invocationType = parameters.invocationType || "RequestResponse";
      if (invocationType === "RequestResponse") {
        spinner.succeed(`Function '${parameters.functionName}' invoked successfully`);
      } else {
        spinner.succeed(`Function '${parameters.functionName}' invoked asynchronously`);
      }

      return response;
    } catch (error) {
      spinner.fail(`Failed to invoke function '${parameters.functionName}'`);
      throw new InvocationError(
        `Failed to invoke function '${parameters.functionName}': ${error instanceof Error ? error.message : String(error)}`,
        parameters.functionName,
        parameters.invocationType,
        undefined,
        undefined,
        { cause: error },
      );
    }
  }

  /**
   * Create a new Lambda function
   *
   * @param parameters - Function creation parameters
   * @param config - Client configuration options
   * @returns Promise resolving to created function configuration
   * @throws When function creation fails
   */
  async createFunction(
    parameters: LambdaCreateFunctionParameters,
    config: AwsClientConfig = {},
  ): Promise<FunctionConfiguration> {
    const spinner = this.createSpinner(`Creating function '${parameters.functionName}'...`);

    try {
      const client = await this.getClient(config);
      const command = new CreateFunctionCommand({
        FunctionName: parameters.functionName,
        Runtime: parameters.runtime,
        Role: parameters.role,
        Handler: parameters.handler,
        Code: parameters.code,
        Description: parameters.description,
        Timeout: parameters.timeout,
        MemorySize: parameters.memorySize,
        Environment: parameters.environment,
        VpcConfig: parameters.vpcConfig,
        DeadLetterConfig: parameters.deadLetterConfig,
        TracingConfig: parameters.tracingConfig,
        Tags: parameters.tags,
      } as CreateFunctionRequest);

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying create function (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Function '${parameters.functionName}' created successfully`);
      return response;
    } catch (error) {
      spinner.fail(`Failed to create function '${parameters.functionName}'`);
      throw new FunctionError(
        `Failed to create function '${parameters.functionName}': ${error instanceof Error ? error.message : String(error)}`,
        parameters.functionName,
        "create-function",
        error,
        { functionName: parameters.functionName },
      );
    }
  }

  /**
   * Update Lambda function code
   *
   * @param parameters - Code update parameters
   * @param config - Client configuration options
   * @returns Promise resolving to updated function configuration
   * @throws When code update fails
   */
  async updateFunctionCode(
    parameters: LambdaUpdateCodeParameters,
    config: AwsClientConfig = {},
  ): Promise<FunctionConfiguration> {
    const spinner = this.createSpinner(
      `Updating code for function '${parameters.functionName}'...`,
    );

    try {
      const client = await this.getClient(config);
      const command = new UpdateFunctionCodeCommand({
        FunctionName: parameters.functionName,
        ZipFile: parameters.zipFile,
        S3Bucket: parameters.s3Bucket,
        S3Key: parameters.s3Key,
        S3ObjectVersion: parameters.s3ObjectVersion,
        Publish: parameters.publish,
        DryRun: parameters.dryRun,
        RevisionId: parameters.revisionId,
      } as UpdateFunctionCodeRequest);

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt, _delay) => {
          spinner.text = `Retrying update function code (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Code updated for function '${parameters.functionName}'`);
      return response;
    } catch (error) {
      spinner.fail(`Failed to update code for function '${parameters.functionName}'`);
      throw new CodeDeploymentError(
        `Failed to update function code '${parameters.functionName}': ${error instanceof Error ? error.message : String(error)}`,
        parameters.functionName,
        parameters.s3Bucket ? "S3" : "ZIP",
        undefined,
        { cause: error },
      );
    }
  }

  /**
   * Update Lambda function configuration
   *
   * @param parameters - Configuration update parameters
   * @param config - Client configuration options
   * @returns Promise resolving to updated function configuration
   * @throws When configuration update fails
   */
  async updateFunctionConfiguration(
    parameters: LambdaUpdateConfigurationParameters,
    config: AwsClientConfig = {},
  ): Promise<FunctionConfiguration> {
    const spinner = this.createSpinner(
      `Updating configuration for function '${parameters.functionName}'...`,
    );

    try {
      const client = await this.getClient(config);
      const command = new UpdateFunctionConfigurationCommand({
        FunctionName: parameters.functionName,
        Role: parameters.role,
        Handler: parameters.handler,
        Description: parameters.description,
        Timeout: parameters.timeout,
        MemorySize: parameters.memorySize,
        VpcConfig: parameters.vpcConfig,
        Environment: parameters.environment,
        Runtime: parameters.runtime,
        DeadLetterConfig: parameters.deadLetterConfig,
        Layers: parameters.layers,
        KMSKeyArn: parameters.kmsKeyArn,
        TracingConfig: parameters.tracingConfig,
        RevisionId: parameters.revisionId,
      } as UpdateFunctionConfigurationRequest);

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt, _delay) => {
          spinner.text = `Retrying update function configuration (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Configuration updated for function '${parameters.functionName}'`);
      return response;
    } catch (error) {
      spinner.fail(`Failed to update configuration for function '${parameters.functionName}'`);
      throw new LambdaConfigurationError(
        `Failed to update function configuration '${parameters.functionName}': ${error instanceof Error ? error.message : String(error)}`,
        parameters.functionName,
        "general",
        undefined,
        undefined,
        { cause: error },
      );
    }
  }

  /**
   * Delete a Lambda function
   *
   * @param functionName - Name or ARN of the Lambda function
   * @param config - Client configuration options
   * @param qualifier - Function version to delete (optional)
   * @returns Promise that resolves when function is deleted
   * @throws When function deletion fails
   */
  async deleteFunction(
    functionName: string,
    config: AwsClientConfig = {},
    qualifier?: string,
  ): Promise<DeleteFunctionCommandOutput> {
    const spinner = this.createSpinner(`Deleting function '${functionName}'...`);

    try {
      const client = await this.getClient(config);
      const command = new DeleteFunctionCommand({
        FunctionName: functionName,
        ...(qualifier && { Qualifier: qualifier }),
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt, _delay) => {
          spinner.text = `Retrying delete function (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Function '${functionName}' deleted successfully`);
      return response;
    } catch (error) {
      spinner.fail(`Failed to delete function '${functionName}'`);
      throw new FunctionError(
        `Failed to delete function '${functionName}': ${error instanceof Error ? error.message : String(error)}`,
        functionName,
        "delete-function",
        error,
        { functionName, qualifier },
      );
    }
  }

  /**
   * Publish a new version of a Lambda function
   *
   * @param functionName - Name or ARN of the Lambda function
   * @param config - Client configuration options
   * @param description - Description for the new version
   * @param revisionId - Revision ID for concurrency control
   * @returns Promise resolving to published version configuration
   * @throws When version publishing fails
   */
  async publishVersion(
    functionName: string,
    config: AwsClientConfig = {},
    description?: string,
    revisionId?: string,
  ): Promise<FunctionConfiguration> {
    const spinner = this.createSpinner(`Publishing version for function '${functionName}'...`);

    try {
      const client = await this.getClient(config);
      const command = new PublishVersionCommand({
        FunctionName: functionName,
        ...(description && { Description: description }),
        ...(revisionId && { RevisionId: revisionId }),
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt, _delay) => {
          spinner.text = `Retrying publish version (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Version published for function '${functionName}': ${response.Version}`);
      return response;
    } catch (error) {
      spinner.fail(`Failed to publish version for function '${functionName}'`);
      throw new FunctionError(
        `Failed to publish version for function '${functionName}': ${error instanceof Error ? error.message : String(error)}`,
        functionName,
        "publish-version",
        error,
        { functionName },
      );
    }
  }

  /**
   * List all versions of a Lambda function using AWS SDK v3 native pagination
   *
   * @param functionName - Name or ARN of the Lambda function
   * @param config - Client configuration options
   * @param marker - Pagination marker (optional, for backwards compatibility)
   * @param maxItems - Maximum number of versions to return
   * @returns Promise resolving to array of function version configurations
   * @throws When version listing fails
   *
   * @remarks
   * Uses AWS SDK v3's built-in async iterator pagination pattern. Fetches all
   * pages unless maxItems is specified.
   */
  async listVersionsByFunction(
    functionName: string,
    config: AwsClientConfig = {},
    marker?: string,
    maxItems?: number,
  ): Promise<FunctionConfiguration[]> {
    const spinner = this.createSpinner(`Listing versions for function '${functionName}'...`);

    try {
      const client = await this.getClient(config);
      const allVersions: FunctionConfiguration[] = [];
      let _pageCount = 0;

      // Use AWS SDK v3 native paginator with async iterator
      const paginatorConfig = maxItems ? { client, pageSize: maxItems } : { client };
      const paginator = paginateListVersionsByFunction(paginatorConfig, {
        FunctionName: functionName,
        ...(marker && { Marker: marker }),
        ...(maxItems && { MaxItems: maxItems }),
      });

      for await (const page of paginator) {
        _pageCount++;
        const versions = page.Versions || [];
        allVersions.push(...versions);

        spinner.text = `Loading versions for '${functionName}'... (${allVersions.length} so far)`;

        // Stop if we've reached maxItems limit
        if (maxItems && allVersions.length >= maxItems) {
          break;
        }
      }

      spinner.succeed(`Found ${allVersions.length} versions for function '${functionName}'`);
      return allVersions;
    } catch (error) {
      spinner.fail(`Failed to list versions for function '${functionName}'`);
      throw new FunctionError(
        `Failed to list versions for function '${functionName}': ${error instanceof Error ? error.message : String(error)}`,
        functionName,
        "list-versions-by-function",
        error,
        { functionName },
      );
    }
  }

  /**
   * Create an alias for a Lambda function version
   *
   * @param parameters - Alias creation parameters
   * @param config - Client configuration options
   * @returns Promise resolving to alias configuration
   * @throws When alias creation fails
   */
  async createAlias(
    parameters: {
      functionName: string;
      name: string;
      functionVersion: string;
      description?: string;
      routingConfig?: Record<string, unknown>;
    },
    config: AwsClientConfig = {},
  ): Promise<AliasConfiguration> {
    const spinner = this.createSpinner(
      `Creating alias '${parameters.name}' for function '${parameters.functionName}'...`,
    );

    try {
      const client = await this.getClient(config);
      const command = new CreateAliasCommand({
        FunctionName: parameters.functionName,
        Name: parameters.name,
        FunctionVersion: parameters.functionVersion,
        ...(parameters.description && { Description: parameters.description }),
        ...(parameters.routingConfig && { RoutingConfig: parameters.routingConfig }),
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt, _delay) => {
          spinner.text = `Retrying create alias (attempt ${attempt})...`;
        },
      });

      spinner.succeed(
        `Alias '${parameters.name}' created for function '${parameters.functionName}'`,
      );
      return response;
    } catch (error) {
      spinner.fail(
        `Failed to create alias '${parameters.name}' for function '${parameters.functionName}'`,
      );
      throw new FunctionError(
        `Failed to create alias: ${error instanceof Error ? error.message : String(error)}`,
        parameters.functionName,
        "create-alias",
        error,
        { functionName: parameters.functionName, aliasName: parameters.name },
      );
    }
  }
}
