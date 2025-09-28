/**
 * Lambda service for comprehensive function management and invocation
 *
 * Orchestrates AWS Lambda operations by providing a unified interface for
 * function lifecycle management, code deployment, configuration updates,
 * and invocation. Integrates with existing credential management for
 * seamless AWS SDK client creation.
 *
 */

import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionCommand,
  GetFunctionConfigurationCommand,
  InvokeCommand,
  LambdaClient,
  ListFunctionsCommand,
  ListVersionsByFunctionCommand,
  PublishVersionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  type CreateFunctionRequest,
  type FunctionConfiguration,
  type GetFunctionRequest,
  type InvocationRequest,
  type InvocationResponse,
  type ListFunctionsRequest,
  type UpdateFunctionCodeRequest,
  type UpdateFunctionConfigurationRequest,
} from "@aws-sdk/client-lambda";
import ora from "ora";
import { ServiceError } from "../lib/errors.js";
import { CredentialService, type AwsClientConfig } from "./credential-service.js";

/**
 * Spinner interface for progress indicators
 * @internal
 */
interface SpinnerInterface {
  text: string;
  succeed: (message?: string) => void;
  fail: (message?: string) => void;
  warn: (message?: string) => void;
}

/**
 * Configuration options for Lambda service
 *
 * @public
 */
export interface LambdaServiceOptions {
  /**
   * Credential service configuration
   */
  credentialService?: {
    defaultRegion?: string;
    defaultProfile?: string;
    enableDebugLogging?: boolean;
  };

  /**
   * Enable debug logging for Lambda operations
   */
  enableDebugLogging?: boolean;

  /**
   * Enable progress indicators for long-running operations
   */
  enableProgressIndicators?: boolean;

  /**
   * Lambda client configuration overrides
   */
  clientConfig?: {
    region?: string;
    profile?: string;
    endpoint?: string;
  };
}

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
  role?: string;
  handler?: string;
  description?: string;
  timeout?: number;
  memorySize?: number;
  vpcConfig?: {
    subnetIds: string[];
    securityGroupIds: string[];
  };
  environment?: {
    variables?: Record<string, string>;
  };
  runtime?: string;
  deadLetterConfig?: {
    targetArn?: string;
  };
  kmsKeyArn?: string;
  tracingConfig?: {
    mode: "Active" | "PassThrough";
  };
  revisionId?: string;
}

/**
 * Lambda service for comprehensive function management
 *
 * Provides a unified interface for all Lambda operations,
 * coordinating with credential management and providing comprehensive error handling.
 *
 * @public
 */
export class LambdaService {
  private readonly credentialService: CredentialService;
  private readonly options: LambdaServiceOptions;
  private clientCache = new Map<string, LambdaClient>();

  /**
   * Create a new Lambda service instance
   *
   * @param options - Configuration options for the service
   */
  constructor(options: LambdaServiceOptions = {}) {
    this.options = {
      ...options,
      enableProgressIndicators:
        options.enableProgressIndicators ??
        (process.env.NODE_ENV !== "test" && !process.env.CI && !process.env.VITEST),
    };

    this.credentialService = new CredentialService({
      enableDebugLogging: options.enableDebugLogging ?? false,
      ...options.credentialService,
    });
  }

  /**
   * Get Lambda client with caching
   *
   * @param config - Client configuration options
   * @returns Lambda client instance
   * @internal
   */
  private async getLambdaClient(config: AwsClientConfig = {}): Promise<LambdaClient> {
    const cacheKey = `${config.region || "default"}-${config.profile || "default"}`;

    if (!this.clientCache.has(cacheKey)) {
      const clientConfig = {
        ...config,
        ...this.options.clientConfig,
      };

      const client = await this.credentialService.createClient(LambdaClient, clientConfig);
      this.clientCache.set(cacheKey, client);
    }

    return this.clientCache.get(cacheKey)!;
  }

  /**
   * Create a progress spinner if enabled
   *
   * @param text - Initial spinner text
   * @returns Spinner instance or mock object
   * @internal
   */
  private createSpinner(text: string): SpinnerInterface {
    return (this.options.enableProgressIndicators ?? true)
      ? ora(text).start()
      : {
          text,
          succeed: () => {},
          fail: () => {},
          warn: () => {},
        };
  }

  /**
   * List all Lambda functions
   *
   * @param config - Client configuration options
   * @param params - List functions parameters
   * @returns Promise resolving to array of function configurations
   * @throws When function listing fails
   */
  async listFunctions(
    config: AwsClientConfig = {},
    params: Partial<ListFunctionsRequest> = {},
  ): Promise<FunctionConfiguration[]> {
    const spinner = this.createSpinner("Listing Lambda functions...");

    try {
      const client = await this.getLambdaClient(config);
      const command = new ListFunctionsCommand(params);

      const response = await client.send(command);
      const functions = response.Functions || [];

      spinner.succeed(`Found ${functions.length} Lambda functions`);
      return functions;
    } catch (error) {
      spinner.fail("Failed to list functions");
      throw new ServiceError(
        `Failed to list Lambda functions: ${error instanceof Error ? error.message : String(error)}`,
        "Lambda",
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
    params: Partial<GetFunctionRequest> = {},
  ): Promise<{
    configuration?: FunctionConfiguration;
    code?: { repositoryType?: string; location?: string };
    tags?: Record<string, string>;
  }> {
    const spinner = this.createSpinner(`Getting function '${functionName}'...`);

    try {
      const client = await this.getLambdaClient(config);
      const command = new GetFunctionCommand({
        FunctionName: functionName,
        ...params,
      });

      const response = await client.send(command);

      spinner.succeed(`Retrieved function '${functionName}'`);
      return {
        configuration: response.Configuration,
        code: response.Code,
        tags: response.Tags,
      };
    } catch (error) {
      spinner.fail(`Failed to get function '${functionName}'`);
      throw new ServiceError(
        `Failed to get function '${functionName}': ${error instanceof Error ? error.message : String(error)}`,
        "Lambda",
        "get-function",
        error,
        { functionName },
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
      const client = await this.getLambdaClient(config);
      const command = new GetFunctionConfigurationCommand({
        FunctionName: functionName,
        ...(qualifier && { Qualifier: qualifier }),
      });

      const response = await client.send(command);

      spinner.succeed(`Retrieved configuration for function '${functionName}'`);
      return response;
    } catch (error) {
      spinner.fail(`Failed to get configuration for function '${functionName}'`);
      throw new ServiceError(
        `Failed to get function configuration '${functionName}': ${error instanceof Error ? error.message : String(error)}`,
        "Lambda",
        "get-function-configuration",
        error,
        { functionName, qualifier },
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
  ): Promise<InvocationResponse> {
    const spinner = this.createSpinner(`Invoking function '${parameters.functionName}'...`);

    try {
      const client = await this.getLambdaClient(config);
      const command = new InvokeCommand({
        FunctionName: parameters.functionName,
        InvocationType: parameters.invocationType || "RequestResponse",
        LogType: parameters.logType || "None",
        ...(parameters.payload && { Payload: new TextEncoder().encode(parameters.payload) }),
        ...(parameters.qualifier && { Qualifier: parameters.qualifier }),
        ...(parameters.clientContext && { ClientContext: parameters.clientContext }),
      } as InvocationRequest);

      const response = await client.send(command);

      const invocationType = parameters.invocationType || "RequestResponse";
      if (invocationType === "RequestResponse") {
        spinner.succeed(`Function '${parameters.functionName}' invoked successfully`);
      } else {
        spinner.succeed(`Function '${parameters.functionName}' invoked asynchronously`);
      }

      return response;
    } catch (error) {
      spinner.fail(`Failed to invoke function '${parameters.functionName}'`);
      throw new ServiceError(
        `Failed to invoke function '${parameters.functionName}': ${error instanceof Error ? error.message : String(error)}`,
        "Lambda",
        "invoke",
        error,
        { functionName: parameters.functionName, invocationType: parameters.invocationType },
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
      const client = await this.getLambdaClient(config);
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

      const response = await client.send(command);

      spinner.succeed(`Function '${parameters.functionName}' created successfully`);
      return response;
    } catch (error) {
      spinner.fail(`Failed to create function '${parameters.functionName}'`);
      throw new ServiceError(
        `Failed to create function '${parameters.functionName}': ${error instanceof Error ? error.message : String(error)}`,
        "Lambda",
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
    const spinner = this.createSpinner(`Updating code for function '${parameters.functionName}'...`);

    try {
      const client = await this.getLambdaClient(config);
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

      const response = await client.send(command);

      spinner.succeed(`Code updated for function '${parameters.functionName}'`);
      return response;
    } catch (error) {
      spinner.fail(`Failed to update code for function '${parameters.functionName}'`);
      throw new ServiceError(
        `Failed to update function code '${parameters.functionName}': ${error instanceof Error ? error.message : String(error)}`,
        "Lambda",
        "update-function-code",
        error,
        { functionName: parameters.functionName },
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
    const spinner = this.createSpinner(`Updating configuration for function '${parameters.functionName}'...`);

    try {
      const client = await this.getLambdaClient(config);
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
        KMSKeyArn: parameters.kmsKeyArn,
        TracingConfig: parameters.tracingConfig,
        RevisionId: parameters.revisionId,
      } as UpdateFunctionConfigurationRequest);

      const response = await client.send(command);

      spinner.succeed(`Configuration updated for function '${parameters.functionName}'`);
      return response;
    } catch (error) {
      spinner.fail(`Failed to update configuration for function '${parameters.functionName}'`);
      throw new ServiceError(
        `Failed to update function configuration '${parameters.functionName}': ${error instanceof Error ? error.message : String(error)}`,
        "Lambda",
        "update-function-configuration",
        error,
        { functionName: parameters.functionName },
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
  ): Promise<void> {
    const spinner = this.createSpinner(`Deleting function '${functionName}'...`);

    try {
      const client = await this.getLambdaClient(config);
      const command = new DeleteFunctionCommand({
        FunctionName: functionName,
        ...(qualifier && { Qualifier: qualifier }),
      });

      await client.send(command);

      spinner.succeed(`Function '${functionName}' deleted successfully`);
    } catch (error) {
      spinner.fail(`Failed to delete function '${functionName}'`);
      throw new ServiceError(
        `Failed to delete function '${functionName}': ${error instanceof Error ? error.message : String(error)}`,
        "Lambda",
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
      const client = await this.getLambdaClient(config);
      const command = new PublishVersionCommand({
        FunctionName: functionName,
        ...(description && { Description: description }),
        ...(revisionId && { RevisionId: revisionId }),
      });

      const response = await client.send(command);

      spinner.succeed(`Version published for function '${functionName}': ${response.Version}`);
      return response;
    } catch (error) {
      spinner.fail(`Failed to publish version for function '${functionName}'`);
      throw new ServiceError(
        `Failed to publish version for function '${functionName}': ${error instanceof Error ? error.message : String(error)}`,
        "Lambda",
        "publish-version",
        error,
        { functionName },
      );
    }
  }

  /**
   * List all versions of a Lambda function
   *
   * @param functionName - Name or ARN of the Lambda function
   * @param config - Client configuration options
   * @param marker - Pagination marker
   * @param maxItems - Maximum number of versions to return
   * @returns Promise resolving to array of function version configurations
   * @throws When version listing fails
   */
  async listVersionsByFunction(
    functionName: string,
    config: AwsClientConfig = {},
    marker?: string,
    maxItems?: number,
  ): Promise<FunctionConfiguration[]> {
    const spinner = this.createSpinner(`Listing versions for function '${functionName}'...`);

    try {
      const client = await this.getLambdaClient(config);
      const command = new ListVersionsByFunctionCommand({
        FunctionName: functionName,
        ...(marker && { Marker: marker }),
        ...(maxItems && { MaxItems: maxItems }),
      });

      const response = await client.send(command);
      const versions = response.Versions || [];

      spinner.succeed(`Found ${versions.length} versions for function '${functionName}'`);
      return versions;
    } catch (error) {
      spinner.fail(`Failed to list versions for function '${functionName}'`);
      throw new ServiceError(
        `Failed to list versions for function '${functionName}': ${error instanceof Error ? error.message : String(error)}`,
        "Lambda",
        "list-versions-by-function",
        error,
        { functionName },
      );
    }
  }

  /**
   * Clear client caches (useful for testing or configuration changes)
   *
   */
  clearClientCache(): void {
    this.clientCache.clear();

    if (this.options.enableDebugLogging) {
      console.debug("Cleared Lambda client caches");
    }
  }
}