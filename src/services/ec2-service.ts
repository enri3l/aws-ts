/**
 * EC2 service for instance management and lifecycle operations
 *
 * Orchestrates AWS EC2 operations by providing a unified interface for
 * instance lifecycle management, configuration updates, and monitoring.
 * Integrates with existing credential management for AWS SDK client creation.
 *
 * @module ec2-service
 */

import {
  DescribeInstanceAttributeCommand,
  EC2Client,
  GetConsoleOutputCommand,
  ModifyInstanceAttributeCommand,
  MonitorInstancesCommand,
  RebootInstancesCommand,
  ResetInstanceAttributeCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  TerminateInstancesCommand,
  UnmonitorInstancesCommand,
  paginateDescribeInstanceStatus,
  paginateDescribeInstances,
  waitUntilInstanceRunning,
  waitUntilInstanceStopped,
  waitUntilInstanceTerminated,
  type DescribeInstanceAttributeCommandOutput,
  type DescribeInstancesCommandInput,
  type Filter,
  type GetConsoleOutputCommandOutput,
  type Instance,
  type InstanceMonitoring,
  type InstanceStateChange,
  type InstanceStatus,
  type ModifyInstanceAttributeCommandOutput,
  type RebootInstancesCommandOutput,
  type ResetInstanceAttributeCommandOutput,
} from "@aws-sdk/client-ec2";
import { BaseAwsService, type BaseServiceOptions } from "../lib/base-aws-service.js";
import {
  EC2InstanceError,
  InstanceAttributeError,
  InstanceMonitoringError,
  InstanceOperationError,
} from "../lib/ec2-errors.js";
import { retryWithBackoff } from "../lib/retry.js";
import type { AwsClientConfig } from "./credential-service.js";

/**
 * Configuration options for EC2 service
 *
 * @public
 */
export type EC2ServiceOptions = BaseServiceOptions;

/**
 * Parameters for describing EC2 instances
 *
 * @public
 */
export interface DescribeInstancesParameters {
  instanceIds?: string[] | undefined;
  filters?: Filter[] | undefined;
  maxResults?: number | undefined;
  nextToken?: string | undefined;
}

/**
 * Parameters for describing instance status
 *
 * @public
 */
export interface DescribeInstanceStatusParameters {
  instanceIds?: string[] | undefined;
  includeAllInstances?: boolean | undefined;
  filters?: Filter[] | undefined;
  maxResults?: number | undefined;
  nextToken?: string | undefined;
}

/**
 * Parameters for instance lifecycle operations
 *
 * @public
 */
export interface InstanceLifecycleParameters {
  instanceIds: string[];
  wait?: boolean | undefined;
}

/**
 * Parameters for stop instances operation
 *
 * @public
 */
export interface StopInstancesParameters extends InstanceLifecycleParameters {
  force?: boolean | undefined;
}

/**
 * Parameters for get console output operation
 *
 * @public
 */
export interface GetConsoleOutputParameters {
  instanceId: string;
  latest?: boolean | undefined;
}

/**
 * Parameters for describe instance attribute operation
 *
 * @public
 */
export interface DescribeInstanceAttributeParameters {
  instanceId: string;
  attribute: string;
}

/**
 * Parameters for modify instance attribute operation
 *
 * @public
 */
export interface ModifyInstanceAttributeParameters {
  instanceId: string;
  attribute: string;
  value?: string | undefined;
}

/**
 * Parameters for reset instance attribute operation
 *
 * @public
 */
export interface ResetInstanceAttributeParameters {
  instanceId: string;
  attribute: "kernel" | "ramdisk" | "sourceDestCheck";
}

/**
 * EC2 service for instance management
 *
 * Provides a unified interface for all EC2 instance operations,
 * coordinating with credential management and providing error handling.
 *
 * @public
 */
export class EC2Service extends BaseAwsService<EC2Client> {
  /**
   * Create a new EC2 service instance
   *
   * @param options - Configuration options for the service
   */
  constructor(options: EC2ServiceOptions = {}) {
    super(EC2Client, options);
  }

  /**
   * Describe EC2 instances using AWS SDK v3 native pagination
   *
   * @param config - Client configuration options
   * @param params - Describe instances parameters
   * @returns Promise resolving to array of instances
   * @throws When instance description fails
   *
   * @remarks
   * Uses AWS SDK v3's built-in async iterator pagination pattern for efficient
   * memory usage and automatic token handling. Fetches all pages unless maxResults
   * is specified.
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity -- AWS SDK pagination pattern requires nested loops and conditionals
  async describeInstances(
    config: AwsClientConfig = {},
    parameters: DescribeInstancesParameters = {},
  ): Promise<Instance[]> {
    const spinner = this.createSpinner("Describing EC2 instances...");

    try {
      const client = await this.getClient(config);
      const allInstances: Instance[] = [];
      let pageCount = 0;

      const input: DescribeInstancesCommandInput = {
        ...(parameters.instanceIds && { InstanceIds: parameters.instanceIds }),
        ...(parameters.filters && { Filters: parameters.filters }),
        ...(parameters.maxResults && { MaxResults: parameters.maxResults }),
        ...(parameters.nextToken && { NextToken: parameters.nextToken }),
      };

      const paginatorConfig = parameters.maxResults
        ? { client, pageSize: parameters.maxResults }
        : { client };
      const paginator = paginateDescribeInstances(paginatorConfig, input);

      for await (const page of paginator) {
        pageCount++;
        const reservations = page.Reservations || [];

        for (const reservation of reservations) {
          const instances = reservation.Instances || [];
          allInstances.push(...instances);
        }

        spinner.text = `Loading EC2 instances... (${allInstances.length} so far, ${pageCount} page${pageCount === 1 ? "" : "s"})`;

        if (parameters.maxResults && allInstances.length >= parameters.maxResults) {
          break;
        }
      }

      const instancePlural = allInstances.length === 1 ? "" : "s";
      spinner.succeed(`Found ${allInstances.length} EC2 instance${instancePlural}`);
      return allInstances;
    } catch (error) {
      spinner.fail("Failed to describe instances");
      throw new EC2InstanceError(
        `Failed to describe EC2 instances: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        "describe-instances",
        error,
      );
    }
  }

  /**
   * Describe EC2 instance status using AWS SDK v3 native pagination
   *
   * @param config - Client configuration options
   * @param params - Describe instance status parameters
   * @returns Promise resolving to array of instance statuses
   * @throws When status description fails
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity -- AWS SDK pagination pattern requires nested loops and conditionals
  async describeInstanceStatus(
    config: AwsClientConfig = {},
    parameters: DescribeInstanceStatusParameters = {},
  ): Promise<InstanceStatus[]> {
    const spinner = this.createSpinner("Describing EC2 instance status...");

    try {
      const client = await this.getClient(config);
      const allStatuses: InstanceStatus[] = [];
      let pageCount = 0;

      const input = {
        ...(parameters.instanceIds && { InstanceIds: parameters.instanceIds }),
        ...(parameters.includeAllInstances !== undefined && {
          IncludeAllInstances: parameters.includeAllInstances,
        }),
        ...(parameters.filters && { Filters: parameters.filters }),
        ...(parameters.maxResults && { MaxResults: parameters.maxResults }),
        ...(parameters.nextToken && { NextToken: parameters.nextToken }),
      };

      const paginatorConfig = parameters.maxResults
        ? { client, pageSize: parameters.maxResults }
        : { client };
      const paginator = paginateDescribeInstanceStatus(paginatorConfig, input);

      for await (const page of paginator) {
        pageCount++;
        const statuses = page.InstanceStatuses || [];
        allStatuses.push(...statuses);

        spinner.text = `Loading instance statuses... (${allStatuses.length} so far, ${pageCount} page${pageCount === 1 ? "" : "s"})`;

        if (parameters.maxResults && allStatuses.length >= parameters.maxResults) {
          break;
        }
      }

      const statusPlural = allStatuses.length === 1 ? "" : "es";
      spinner.succeed(`Found ${allStatuses.length} instance status${statusPlural}`);
      return allStatuses;
    } catch (error) {
      spinner.fail("Failed to describe instance status");
      throw new EC2InstanceError(
        `Failed to describe instance status: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        "describe-instance-status",
        error,
      );
    }
  }

  /**
   * Get console output for an EC2 instance
   *
   * @param config - Client configuration options
   * @param params - Console output parameters
   * @returns Promise resolving to console output
   * @throws When console output retrieval fails
   */
  async getConsoleOutput(
    config: AwsClientConfig = {},
    parameters: GetConsoleOutputParameters,
  ): Promise<GetConsoleOutputCommandOutput> {
    const spinner = this.createSpinner(
      `Getting console output for instance '${parameters.instanceId}'...`,
    );

    try {
      const client = await this.getClient(config);
      const command = new GetConsoleOutputCommand({
        InstanceId: parameters.instanceId,
        ...(parameters.latest !== undefined && { Latest: parameters.latest }),
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (_error, attempt) => {
          spinner.text = `Retrying get console output (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Retrieved console output for instance '${parameters.instanceId}'`);
      return response;
    } catch (error) {
      spinner.fail(`Failed to get console output for instance '${parameters.instanceId}'`);
      throw new EC2InstanceError(
        `Failed to get console output: ${error instanceof Error ? error.message : String(error)}`,
        parameters.instanceId,
        "get-console-output",
        error,
      );
    }
  }

  /**
   * Start EC2 instances with optional wait for running state
   *
   * @param config - Client configuration options
   * @param params - Start instances parameters
   * @returns Promise resolving to array of instance state changes
   * @throws When instance start fails
   */
  async startInstances(
    config: AwsClientConfig = {},
    parameters: InstanceLifecycleParameters,
  ): Promise<InstanceStateChange[]> {
    const spinner = this.createSpinner(`Starting ${parameters.instanceIds.length} instance(s)...`);

    try {
      const client = await this.getClient(config);

      // Batch instance IDs (AWS allows up to 100 per request)
      const batches = this.chunkArray(parameters.instanceIds, 100);
      const allResults: InstanceStateChange[] = [];

      for (const batch of batches) {
        const command = new StartInstancesCommand({ InstanceIds: batch });
        const result = await retryWithBackoff(() => client.send(command));
        allResults.push(...(result.StartingInstances || []));
        spinner.text = `Started ${allResults.length}/${parameters.instanceIds.length} instance(s)`;
      }

      if (parameters.wait) {
        spinner.text = "Waiting for instances to reach running state...";
        await Promise.all(
          parameters.instanceIds.map((id) =>
            waitUntilInstanceRunning({ client, maxWaitTime: 300 }, { InstanceIds: [id] }),
          ),
        );
      }

      spinner.succeed(`Started ${allResults.length} instance(s)`);
      return allResults;
    } catch (error) {
      spinner.fail("Failed to start instances");
      throw new InstanceOperationError(
        `Failed to start instances: ${error instanceof Error ? error.message : String(error)}`,
        parameters.instanceIds,
        "start",
        undefined,
        undefined,
        { error },
      );
    }
  }

  /**
   * Stop EC2 instances with optional wait for stopped state
   *
   * @param config - Client configuration options
   * @param params - Stop instances parameters
   * @returns Promise resolving to array of instance state changes
   * @throws When instance stop fails
   */
  async stopInstances(
    config: AwsClientConfig = {},
    parameters: StopInstancesParameters,
  ): Promise<InstanceStateChange[]> {
    const spinner = this.createSpinner(`Stopping ${parameters.instanceIds.length} instance(s)...`);

    try {
      const client = await this.getClient(config);

      // Batch instance IDs (AWS allows up to 100 per request)
      const batches = this.chunkArray(parameters.instanceIds, 100);
      const allResults: InstanceStateChange[] = [];

      for (const batch of batches) {
        const command = new StopInstancesCommand({
          InstanceIds: batch,
          ...(parameters.force && { Force: parameters.force }),
        });
        const result = await retryWithBackoff(() => client.send(command));
        allResults.push(...(result.StoppingInstances || []));
        spinner.text = `Stopped ${allResults.length}/${parameters.instanceIds.length} instance(s)`;
      }

      if (parameters.wait) {
        spinner.text = "Waiting for instances to reach stopped state...";
        await Promise.all(
          parameters.instanceIds.map((id) =>
            waitUntilInstanceStopped({ client, maxWaitTime: 300 }, { InstanceIds: [id] }),
          ),
        );
      }

      spinner.succeed(`Stopped ${allResults.length} instance(s)`);
      return allResults;
    } catch (error) {
      spinner.fail("Failed to stop instances");
      throw new InstanceOperationError(
        `Failed to stop instances: ${error instanceof Error ? error.message : String(error)}`,
        parameters.instanceIds,
        "stop",
        undefined,
        undefined,
        { error },
      );
    }
  }

  /**
   * Reboot EC2 instances
   *
   * @param config - Client configuration options
   * @param params - Reboot instances parameters
   * @returns Promise resolving to reboot command output
   * @throws When instance reboot fails
   */
  async rebootInstances(
    config: AwsClientConfig = {},
    parameters: InstanceLifecycleParameters,
  ): Promise<RebootInstancesCommandOutput> {
    const spinner = this.createSpinner(`Rebooting ${parameters.instanceIds.length} instance(s)...`);

    try {
      const client = await this.getClient(config);

      // Batch instance IDs (AWS allows up to 100 per request)
      const batches = this.chunkArray(parameters.instanceIds, 100);

      for (const batch of batches) {
        const command = new RebootInstancesCommand({ InstanceIds: batch });
        await retryWithBackoff(() => client.send(command));
      }

      spinner.succeed(`Rebooted ${parameters.instanceIds.length} instance(s)`);
      return { $metadata: {} };
    } catch (error) {
      spinner.fail("Failed to reboot instances");
      throw new InstanceOperationError(
        `Failed to reboot instances: ${error instanceof Error ? error.message : String(error)}`,
        parameters.instanceIds,
        "reboot",
        undefined,
        undefined,
        { error },
      );
    }
  }

  /**
   * Terminate EC2 instances with optional wait for terminated state
   *
   * @param config - Client configuration options
   * @param params - Terminate instances parameters
   * @returns Promise resolving to array of instance state changes
   * @throws When instance termination fails
   */
  async terminateInstances(
    config: AwsClientConfig = {},
    parameters: InstanceLifecycleParameters,
  ): Promise<InstanceStateChange[]> {
    const spinner = this.createSpinner(
      `Terminating ${parameters.instanceIds.length} instance(s)...`,
    );

    try {
      const client = await this.getClient(config);

      // Batch instance IDs (AWS allows up to 100 per request)
      const batches = this.chunkArray(parameters.instanceIds, 100);
      const allResults: InstanceStateChange[] = [];

      for (const batch of batches) {
        const command = new TerminateInstancesCommand({ InstanceIds: batch });
        const result = await retryWithBackoff(() => client.send(command));
        allResults.push(...(result.TerminatingInstances || []));
        spinner.text = `Terminated ${allResults.length}/${parameters.instanceIds.length} instance(s)`;
      }

      if (parameters.wait) {
        spinner.text = "Waiting for instances to reach terminated state...";
        await Promise.all(
          parameters.instanceIds.map((id) =>
            waitUntilInstanceTerminated({ client, maxWaitTime: 300 }, { InstanceIds: [id] }),
          ),
        );
      }

      spinner.succeed(`Terminated ${allResults.length} instance(s)`);
      return allResults;
    } catch (error) {
      spinner.fail("Failed to terminate instances");
      throw new InstanceOperationError(
        `Failed to terminate instances: ${error instanceof Error ? error.message : String(error)}`,
        parameters.instanceIds,
        "terminate",
        undefined,
        undefined,
        { error },
      );
    }
  }

  /**
   * Enable detailed CloudWatch monitoring for EC2 instances
   *
   * @param config - Client configuration options
   * @param params - Monitor instances parameters
   * @returns Promise resolving to array of instance monitoring changes
   * @throws When monitoring enable fails
   */
  async monitorInstances(
    config: AwsClientConfig = {},
    parameters: InstanceLifecycleParameters,
  ): Promise<InstanceMonitoring[]> {
    const spinner = this.createSpinner(
      `Enabling monitoring for ${parameters.instanceIds.length} instance(s)...`,
    );

    try {
      const client = await this.getClient(config);

      // Batch instance IDs (AWS allows up to 100 per request)
      const batches = this.chunkArray(parameters.instanceIds, 100);
      const allResults: InstanceMonitoring[] = [];

      for (const batch of batches) {
        const command = new MonitorInstancesCommand({ InstanceIds: batch });
        const result = await retryWithBackoff(() => client.send(command));
        allResults.push(...(result.InstanceMonitorings || []));
      }

      spinner.succeed(`Enabled monitoring for ${allResults.length} instance(s)`);
      return allResults;
    } catch (error) {
      spinner.fail("Failed to enable monitoring");
      throw new InstanceMonitoringError(
        `Failed to enable monitoring: ${error instanceof Error ? error.message : String(error)}`,
        parameters.instanceIds,
        "enable",
        { error },
      );
    }
  }

  /**
   * Disable detailed CloudWatch monitoring for EC2 instances
   *
   * @param config - Client configuration options
   * @param params - Unmonitor instances parameters
   * @returns Promise resolving to array of instance monitoring changes
   * @throws When monitoring disable fails
   */
  async unmonitorInstances(
    config: AwsClientConfig = {},
    parameters: InstanceLifecycleParameters,
  ): Promise<InstanceMonitoring[]> {
    const spinner = this.createSpinner(
      `Disabling monitoring for ${parameters.instanceIds.length} instance(s)...`,
    );

    try {
      const client = await this.getClient(config);

      // Batch instance IDs (AWS allows up to 100 per request)
      const batches = this.chunkArray(parameters.instanceIds, 100);
      const allResults: InstanceMonitoring[] = [];

      for (const batch of batches) {
        const command = new UnmonitorInstancesCommand({ InstanceIds: batch });
        const result = await retryWithBackoff(() => client.send(command));
        allResults.push(...(result.InstanceMonitorings || []));
      }

      spinner.succeed(`Disabled monitoring for ${allResults.length} instance(s)`);
      return allResults;
    } catch (error) {
      spinner.fail("Failed to disable monitoring");
      throw new InstanceMonitoringError(
        `Failed to disable monitoring: ${error instanceof Error ? error.message : String(error)}`,
        parameters.instanceIds,
        "disable",
        { error },
      );
    }
  }

  /**
   * Describe a specific attribute of an EC2 instance
   *
   * @param config - Client configuration options
   * @param params - Describe attribute parameters
   * @returns Promise resolving to instance attribute
   * @throws When attribute description fails
   */
  async describeInstanceAttribute(
    config: AwsClientConfig = {},
    parameters: DescribeInstanceAttributeParameters,
  ): Promise<DescribeInstanceAttributeCommandOutput> {
    const spinner = this.createSpinner(
      `Describing attribute '${parameters.attribute}' for instance '${parameters.instanceId}'...`,
    );

    try {
      const client = await this.getClient(config);
      const command = new DescribeInstanceAttributeCommand({
        InstanceId: parameters.instanceId,
        Attribute: parameters.attribute as never,
      });

      const response = await retryWithBackoff(() => client.send(command));

      spinner.succeed(
        `Retrieved attribute '${parameters.attribute}' for instance '${parameters.instanceId}'`,
      );
      return response;
    } catch (error) {
      spinner.fail(
        `Failed to describe attribute '${parameters.attribute}' for instance '${parameters.instanceId}'`,
      );
      throw new InstanceAttributeError(
        `Failed to describe instance attribute: ${error instanceof Error ? error.message : String(error)}`,
        parameters.instanceId,
        parameters.attribute,
        "describe",
        { error },
      );
    }
  }

  /**
   * Modify a specific attribute of an EC2 instance
   *
   * @param config - Client configuration options
   * @param params - Modify attribute parameters
   * @returns Promise resolving to modification result
   * @throws When attribute modification fails
   */
  async modifyInstanceAttribute(
    config: AwsClientConfig = {},
    parameters: ModifyInstanceAttributeParameters,
  ): Promise<ModifyInstanceAttributeCommandOutput> {
    const spinner = this.createSpinner(
      `Modifying attribute '${parameters.attribute}' for instance '${parameters.instanceId}'...`,
    );

    try {
      const client = await this.getClient(config);
      const command = new ModifyInstanceAttributeCommand({
        InstanceId: parameters.instanceId,
        Attribute: parameters.attribute as never,
        ...(parameters.value && { Value: parameters.value }),
      });

      const response = await retryWithBackoff(() => client.send(command));

      spinner.succeed(
        `Modified attribute '${parameters.attribute}' for instance '${parameters.instanceId}'`,
      );
      return response;
    } catch (error) {
      spinner.fail(
        `Failed to modify attribute '${parameters.attribute}' for instance '${parameters.instanceId}'`,
      );
      throw new InstanceAttributeError(
        `Failed to modify instance attribute: ${error instanceof Error ? error.message : String(error)}`,
        parameters.instanceId,
        parameters.attribute,
        "modify",
        { error },
      );
    }
  }

  /**
   * Reset a specific attribute of an EC2 instance to its default value
   *
   * @param config - Client configuration options
   * @param params - Reset attribute parameters
   * @returns Promise resolving to reset result
   * @throws When attribute reset fails
   */
  async resetInstanceAttribute(
    config: AwsClientConfig = {},
    parameters: ResetInstanceAttributeParameters,
  ): Promise<ResetInstanceAttributeCommandOutput> {
    const spinner = this.createSpinner(
      `Resetting attribute '${parameters.attribute}' for instance '${parameters.instanceId}'...`,
    );

    try {
      const client = await this.getClient(config);
      const command = new ResetInstanceAttributeCommand({
        InstanceId: parameters.instanceId,
        Attribute: parameters.attribute,
      });

      const response = await retryWithBackoff(() => client.send(command));

      spinner.succeed(
        `Reset attribute '${parameters.attribute}' for instance '${parameters.instanceId}'`,
      );
      return response;
    } catch (error) {
      spinner.fail(
        `Failed to reset attribute '${parameters.attribute}' for instance '${parameters.instanceId}'`,
      );
      throw new InstanceAttributeError(
        `Failed to reset instance attribute: ${error instanceof Error ? error.message : String(error)}`,
        parameters.instanceId,
        parameters.attribute,
        "reset",
        { error },
      );
    }
  }

  /**
   * Chunk array into smaller batches
   *
   * @param array - Array to chunk
   * @param size - Size of each chunk
   * @returns Array of chunked arrays
   *
   * @internal
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let index = 0; index < array.length; index += size) {
      chunks.push(array.slice(index, index + size));
    }
    return chunks;
  }
}
