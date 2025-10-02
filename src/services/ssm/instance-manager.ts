/**
 * @module ssm/instance-manager
 * Instance Manager service for SSM instance operations
 *
 * Provides a specialized service for AWS Systems Manager instance discovery
 * and management operations with support for filtering and pagination.
 */

import {
  paginateDescribeInstanceInformation,
  SSMClient,
  type InstanceInformation,
  type InstanceInformationStringFilter,
} from "@aws-sdk/client-ssm";
import { BaseAwsService, type BaseServiceOptions } from "../../lib/base-aws-service.js";
import { SSMInstanceError } from "../../lib/ssm/ssm-errors.js";
import type { AwsClientConfig } from "../credential-service.js";

/**
 * Configuration options for Instance Manager service
 *
 * @public
 */
export type InstanceManagerServiceOptions = BaseServiceOptions;

/**
 * Parameters for listing instances
 *
 * @public
 */
export interface ListInstancesParameters {
  filters?: InstanceInformationStringFilter[];
  maxResults?: number;
}

/**
 * Instance Manager service for SSM instance operations
 *
 * Provides a unified interface for instance discovery and management operations,
 * coordinating with credential management and providing error handling.
 *
 * @public
 */
export class InstanceManagerService extends BaseAwsService<SSMClient> {
  /**
   * Create a new Instance Manager service instance
   *
   * @param options - Configuration options for the service
   */
  constructor(options: InstanceManagerServiceOptions = {}) {
    super(SSMClient, options);
  }

  /**
   * List managed instances with optional filtering
   *
   * @param config - AWS client configuration
   * @param parameters - Instance listing parameters
   * @returns List of managed instances
   */
  async listInstances(
    config: AwsClientConfig,
    parameters: ListInstancesParameters = {},
  ): Promise<InstanceInformation[]> {
    const { filters, maxResults = 50 } = parameters;
    const spinner = this.createSpinner("Listing managed instances...");

    try {
      const client = await this.getClient(config);
      const paginatorConfig = { client };
      const input = {
        Filters: filters,
        MaxResults: maxResults,
      };

      const allInstances: InstanceInformation[] = [];
      const paginator = paginateDescribeInstanceInformation(paginatorConfig, input);

      for await (const page of paginator) {
        const instances = page.InstanceInformationList || [];
        for (const instance of instances) {
          allInstances.push(instance);
        }
      }

      const instanceCount = allInstances.length;
      const instancePlural = instanceCount === 1 ? "" : "s";
      spinner.succeed(`Found ${instanceCount} managed instance${instancePlural}`);
      return allInstances;
    } catch (error) {
      spinner.fail("Failed to list instances");
      throw new SSMInstanceError(
        `Failed to list managed instances: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        { filters },
        "list-instances",
        error,
      );
    }
  }

  /**
   * Describe a specific instance
   *
   * @param config - AWS client configuration
   * @param instanceId - ID of the instance to describe
   * @returns Instance information
   */
  async describeInstance(
    config: AwsClientConfig,
    instanceId: string,
  ): Promise<InstanceInformation | undefined> {
    const spinner = this.createSpinner(`Describing instance ${instanceId}...`);

    try {
      const client = await this.getClient(config);
      const paginatorConfig = { client };
      const input = {
        Filters: [
          {
            Key: "InstanceIds",
            Values: [instanceId],
          },
        ],
      };

      const paginator = paginateDescribeInstanceInformation(paginatorConfig, input);

      for await (const page of paginator) {
        const instances = page.InstanceInformationList || [];
        if (instances.length > 0) {
          spinner.succeed(`Found instance ${instanceId}`);
          return instances[0];
        }
      }

      spinner.fail("Instance not found");
      return undefined;
    } catch (error) {
      spinner.fail("Failed to describe instance");
      throw new SSMInstanceError(
        `Failed to describe instance ${instanceId}: ${error instanceof Error ? error.message : String(error)}`,
        instanceId,
        undefined,
        "describe-instance",
        error,
      );
    }
  }
}
