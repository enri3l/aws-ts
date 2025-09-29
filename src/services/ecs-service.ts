/**
 * ECS service for container orchestration and management
 *
 * Orchestrates AWS ECS operations by providing a unified interface for
 * cluster management, service orchestration, and task lifecycle operations.
 * Integrates with existing credential management for AWS SDK client creation.
 *
 */

import {
  CreateClusterCommand,
  CreateServiceCommand,
  DeleteClusterCommand,
  DeleteServiceCommand,
  DescribeClustersCommand,
  DescribeServicesCommand,
  DescribeTasksCommand,
  ECSClient,
  ListClustersCommand,
  ListServicesCommand,
  ListTasksCommand,
  RunTaskCommand,
  StopTaskCommand,
  UpdateClusterCommand,
  UpdateServiceCommand,
  type Cluster,
  type Container,
  type CreateClusterRequest,
  type CreateServiceRequest,
  type ExecuteCommandConfiguration,
  type ExecuteCommandLogConfiguration,
  type NetworkBinding,
  type NetworkInterface,
  type RunTaskCommandInput,
  type Service,
  type Task,
  type UpdateClusterRequest,
  type UpdateServiceRequest,
} from "@aws-sdk/client-ecs";
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
 * Configuration options for ECS service
 *
 * @public
 */
export interface ECSServiceOptions {
  /**
   * Credential service configuration
   */
  credentialService?: {
    defaultRegion?: string;
    defaultProfile?: string;
    enableDebugLogging?: boolean;
  };

  /**
   * Enable debug logging for ECS operations
   */
  enableDebugLogging?: boolean;

  /**
   * Enable progress indicators for long-running operations
   */
  enableProgressIndicators?: boolean;

  /**
   * ECS client configuration overrides
   */
  clientConfig?: {
    region?: string;
    profile?: string;
    endpoint?: string;
  };
}

/**
 * ECS cluster description
 *
 * @public
 */
export interface ClusterDescription {
  clusterName: string;
  clusterArn: string;
  status: string;
  runningTasksCount: number;
  pendingTasksCount: number;
  activeServicesCount: number;
  registeredContainerInstancesCount: number;
  capacityProviders?: string[];
  defaultCapacityProviderStrategy?: Array<{
    capacityProvider: string;
    weight?: number;
    base?: number;
  }>;
  statistics?: Array<{
    name: string;
    value: string;
  }>;
  attachments?: Array<{
    id: string;
    type: string;
    status: string;
    details?: Array<{
      name: string;
      value: string;
    }>;
  }>;
  settings?: Array<{
    name: string;
    value: string;
  }>;
  configuration?: {
    executeCommandConfiguration?: {
      kmsKeyId?: string;
      logging?: string;
      logConfiguration?: {
        cloudWatchLogGroupName?: string;
        cloudWatchEncryptionEnabled?: boolean;
        s3BucketName?: string;
        s3EncryptionEnabled?: boolean;
        s3KeyPrefix?: string;
      };
    };
  };
  tags?: Array<{
    key: string;
    value: string;
  }>;
}

/**
 * ECS service description
 *
 * @public
 */
export interface ServiceDescription {
  serviceName: string;
  serviceArn: string;
  clusterArn: string;
  status: string;
  taskDefinition: string;
  desiredCount: number;
  runningCount: number;
  pendingCount: number;
  launchType?: string;
  capacityProviderStrategy?: Array<{
    capacityProvider: string;
    weight?: number;
    base?: number;
  }>;
  platformVersion?: string;
  networkConfiguration?: {
    awsvpcConfiguration?: {
      subnets: string[];
      securityGroups?: string[];
      assignPublicIp?: string;
    };
  };
  loadBalancers?: Array<{
    targetGroupArn?: string;
    loadBalancerName?: string;
    containerName: string;
    containerPort: number;
  }>;
  serviceRegistries?: Array<{
    registryArn: string;
    port?: number;
    containerName?: string;
    containerPort?: number;
  }>;
  deployments?: Array<{
    id: string;
    status: string;
    taskDefinition: string;
    desiredCount: number;
    pendingCount: number;
    runningCount: number;
    failedTasks: number;
    createdAt?: Date;
    updatedAt?: Date;
  }>;
  events?: Array<{
    id: string;
    createdAt?: Date;
    message: string;
  }>;
  tags?: Array<{
    key: string;
    value: string;
  }>;
}

/**
 * ECS task description
 *
 * @public
 */
export interface TaskDescription {
  taskArn: string;
  taskDefinitionArn: string;
  clusterArn: string;
  lastStatus: string;
  desiredStatus: string;
  healthStatus?: string;
  cpu?: string;
  memory?: string;
  launchType?: string;
  capacityProviderName?: string;
  availabilityZone?: string;
  connectivity?: string;
  connectivityAt?: Date;
  createdAt?: Date;
  startedAt?: Date;
  startedBy?: string;
  stoppedAt?: Date;
  stoppedReason?: string;
  group?: string;
  platformVersion?: string;
  containers?: Array<{
    containerArn: string;
    name: string;
    image: string;
    lastStatus: string;
    exitCode?: number;
    reason?: string;
    healthStatus?: string;
    networkBindings?: Array<{
      bindIP?: string;
      containerPort?: number;
      hostPort?: number;
      protocol?: string;
    }>;
    networkInterfaces?: Array<{
      attachmentId?: string;
      privateIpv4Address?: string;
      ipv6Address?: string;
    }>;
  }>;
  tags?: Array<{
    key: string;
    value: string;
  }>;
}

/**
 * ECS run task result
 *
 * @public
 */
export interface RunTaskResult {
  tasks: TaskDescription[];
  failures?: Array<{
    arn: string;
    reason: string;
    detail?: string;
  }>;
}

/**
 * ECS service for container orchestration and management
 *
 * Provides a unified interface for all ECS operations,
 * coordinating with credential management and providing error handling.
 *
 * @public
 */
export class ECSService {
  private readonly credentialService: CredentialService;
  private readonly options: ECSServiceOptions;
  private clientCache = new Map<string, ECSClient>();

  /**
   * Create a new ECS service instance
   *
   * @param options - Configuration options for the service
   */
  constructor(options: ECSServiceOptions = {}) {
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
   * Get ECS client with caching
   *
   * @param config - Client configuration options
   * @returns ECS client instance
   * @internal
   */
  private async getECSClient(config: AwsClientConfig = {}): Promise<ECSClient> {
    const cacheKey = `${config.region || "default"}-${config.profile || "default"}`;

    if (!this.clientCache.has(cacheKey)) {
      const clientConfig = {
        ...config,
        ...this.options.clientConfig,
      };

      const client = await this.credentialService.createClient(ECSClient, clientConfig);
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
   * List all ECS clusters
   *
   * Retrieves a list of all ECS cluster names in the configured region.
   * Returns cluster names only, without detailed metadata.
   *
   * @param config - Client configuration options
   * @returns Promise resolving to array of cluster names
   * @throws ServiceError - When cluster listing fails due to credentials, permissions, or API errors
   *
   * @example
   * ```typescript
   * const ecsService = new ECSService();
   * const clusters = await ecsService.listClusters();
   * console.log(clusters); // ['production', 'staging', 'development']
   * ```
   *
   * @example With custom region
   * ```typescript
   * const clusters = await ecsService.listClusters(\{ region: 'us-west-2' \});
   * ```
   *
   * @public
   */
  async listClusters(config: AwsClientConfig = {}): Promise<string[]> {
    const spinner = this.createSpinner("Listing ECS clusters...");

    try {
      const client = await this.getECSClient(config);
      const command = new ListClustersCommand({});

      const response = await client.send(command);
      const clusters = response.clusterArns || [];

      const clusterNames = clusters.map((arn) => arn.split("/").pop() || arn);

      spinner.succeed(`Found ${clusters.length} ECS clusters`);
      return clusterNames;
    } catch (error) {
      spinner.fail("Failed to list clusters");
      throw new ServiceError(
        `Failed to list ECS clusters: ${error instanceof Error ? error.message : String(error)}`,
        "ECS",
        "list-clusters",
        error,
      );
    }
  }

  /**
   * Describe ECS clusters
   *
   * Retrieves detailed information about one or more ECS clusters including
   * status, capacity, running tasks, and configuration settings.
   *
   * @param clusterNames - Names of clusters to describe
   * @param config - Client configuration options
   * @returns Promise resolving to array of cluster descriptions
   * @throws ServiceError - When cluster description fails
   *
   * @example
   * ```typescript
   * const ecsService = new ECSService();
   * const clusters = await ecsService.describeClusters(['production', 'staging']);
   * clusters.forEach(cluster => \{
   *   console.log(`$\{cluster.clusterName\}: $\{cluster.status\}`);
   *   console.log(`Running tasks: $\{cluster.runningTasksCount\}`);
   * \});
   * ```
   *
   * @public
   */
  async describeClusters(
    clusterNames: string[],
    config: AwsClientConfig = {},
  ): Promise<ClusterDescription[]> {
    const spinner = this.createSpinner(`Describing ${clusterNames.length} ECS clusters...`);

    try {
      const client = await this.getECSClient(config);
      const command = new DescribeClustersCommand({
        clusters: clusterNames,
        include: ["ATTACHMENTS", "CONFIGURATIONS", "SETTINGS", "STATISTICS", "TAGS"],
      });

      const response = await client.send(command);
      const clusters = response.clusters || [];

      const descriptions: ClusterDescription[] = clusters.map((cluster: Cluster) =>
        this.buildClusterDescription(cluster),
      );

      spinner.succeed(`Retrieved descriptions for ${descriptions.length} clusters`);
      return descriptions;
    } catch (error) {
      spinner.fail(`Failed to describe clusters`);
      throw new ServiceError(
        `Failed to describe ECS clusters: ${error instanceof Error ? error.message : String(error)}`,
        "ECS",
        "describe-clusters",
        error,
        { clusterNames },
      );
    }
  }

  /**
   * Create a new ECS cluster
   *
   * @param params - Cluster creation parameters
   * @param config - Client configuration options
   * @returns Promise resolving to cluster description
   * @throws When cluster creation fails
   */
  async createCluster(
    parameters: CreateClusterRequest,
    config: AwsClientConfig = {},
  ): Promise<ClusterDescription> {
    const spinner = this.createSpinner(`Creating ECS cluster '${parameters.clusterName}'...`);

    try {
      const client = await this.getECSClient(config);
      const command = new CreateClusterCommand(parameters);

      const response = await client.send(command);
      const cluster = response.cluster!;

      const description: ClusterDescription = {
        clusterName: cluster.clusterName!,
        clusterArn: cluster.clusterArn!,
        status: cluster.status!,
        runningTasksCount: cluster.runningTasksCount || 0,
        pendingTasksCount: cluster.pendingTasksCount || 0,
        activeServicesCount: cluster.activeServicesCount || 0,
        registeredContainerInstancesCount: cluster.registeredContainerInstancesCount || 0,
      };

      spinner.succeed(`Created ECS cluster '${parameters.clusterName}'`);
      return description;
    } catch (error) {
      spinner.fail(`Failed to create cluster '${parameters.clusterName}'`);
      throw new ServiceError(
        `Failed to create ECS cluster '${parameters.clusterName}': ${error instanceof Error ? error.message : String(error)}`,
        "ECS",
        "create-cluster",
        error,
        { clusterName: parameters.clusterName },
      );
    }
  }

  /**
   * Update an ECS cluster configuration
   *
   * @param params - Cluster update parameters
   * @param config - Client configuration options
   * @returns Promise resolving to updated cluster description
   * @throws When cluster update fails
   */
  async updateCluster(
    parameters: UpdateClusterRequest,
    config: AwsClientConfig = {},
  ): Promise<ClusterDescription> {
    const spinner = this.createSpinner(`Updating ECS cluster '${parameters.cluster}'...`);

    try {
      const client = await this.getECSClient(config);
      const command = new UpdateClusterCommand(parameters);

      const response = await client.send(command);
      const cluster = response.cluster!;

      const description: ClusterDescription = {
        clusterName: cluster.clusterName!,
        clusterArn: cluster.clusterArn!,
        status: cluster.status!,
        runningTasksCount: cluster.runningTasksCount || 0,
        pendingTasksCount: cluster.pendingTasksCount || 0,
        activeServicesCount: cluster.activeServicesCount || 0,
        registeredContainerInstancesCount: cluster.registeredContainerInstancesCount || 0,
      };

      spinner.succeed(`Updated ECS cluster '${parameters.cluster}'`);
      return description;
    } catch (error) {
      spinner.fail(`Failed to update cluster '${parameters.cluster}'`);
      throw new ServiceError(
        `Failed to update ECS cluster '${parameters.cluster}': ${error instanceof Error ? error.message : String(error)}`,
        "ECS",
        "update-cluster",
        error,
        { clusterName: parameters.cluster },
      );
    }
  }

  /**
   * Delete an ECS cluster
   *
   * @param clusterName - Name of cluster to delete
   * @param config - Client configuration options
   * @throws When cluster deletion fails
   */
  async deleteCluster(clusterName: string, config: AwsClientConfig = {}): Promise<void> {
    const spinner = this.createSpinner(`Deleting ECS cluster '${clusterName}'...`);

    try {
      const client = await this.getECSClient(config);
      const command = new DeleteClusterCommand({ cluster: clusterName });

      await client.send(command);

      spinner.succeed(`Deleted ECS cluster '${clusterName}'`);
    } catch (error) {
      spinner.fail(`Failed to delete cluster '${clusterName}'`);
      throw new ServiceError(
        `Failed to delete ECS cluster '${clusterName}': ${error instanceof Error ? error.message : String(error)}`,
        "ECS",
        "delete-cluster",
        error,
        { clusterName },
      );
    }
  }

  /**
   * List ECS services in a cluster
   *
   * Retrieves a list of service ARNs, optionally filtered by cluster,
   * launch type, or scheduling strategy.
   *
   * @param options - List options including cluster, launchType, schedulingStrategy, and maxResults
   * @param config - Client configuration options
   * @returns Promise resolving to array of service ARNs
   * @throws ServiceError - When service listing fails
   *
   * @example List all services in a cluster
   * ```typescript
   * const ecsService = new ECSService();
   * const services = await ecsService.listServices(\{ cluster: 'production' \});
   * console.log(services); // ['arn:aws:ecs:...']
   * ```
   *
   * @example Filter by launch type
   * ```typescript
   * const fargateServices = await ecsService.listServices(\{
   *   cluster: 'production',
   *   launchType: 'FARGATE'
   * \});
   * ```
   *
   * @public
   */
  async listServices(
    options: {
      cluster?: string;
      launchType?: "EC2" | "FARGATE" | "EXTERNAL";
      schedulingStrategy?: "REPLICA" | "DAEMON";
      maxResults?: number;
    } = {},
    config: AwsClientConfig = {},
  ): Promise<string[]> {
    const spinner = this.createSpinner(
      options.cluster
        ? `Listing services in cluster '${options.cluster}'...`
        : "Listing ECS services...",
    );

    try {
      const client = await this.getECSClient(config);
      const command = new ListServicesCommand({
        ...(options.cluster && { cluster: options.cluster }),
        ...(options.launchType && { launchType: options.launchType }),
        ...(options.schedulingStrategy && { schedulingStrategy: options.schedulingStrategy }),
        ...(options.maxResults && { maxResults: options.maxResults }),
      });

      const response = await client.send(command);
      const services = response.serviceArns || [];

      spinner.succeed(`Found ${services.length} ECS services`);
      return services;
    } catch (error) {
      spinner.fail("Failed to list services");
      throw new ServiceError(
        `Failed to list ECS services: ${error instanceof Error ? error.message : String(error)}`,
        "ECS",
        "list-services",
        error,
        { clusterName: options.cluster },
      );
    }
  }

  /**
   * Describe ECS services
   *
   * @param serviceNames - Names of services to describe
   * @param options - Options including cluster and include settings
   * @param config - Client configuration options
   * @returns Promise resolving to array of service descriptions
   * @throws When service description fails
   */
  async describeServices(
    serviceNames: string[],
    options: { cluster?: string; include?: "TAGS"[] } = {},
    config: AwsClientConfig = {},
  ): Promise<ServiceDescription[]> {
    const spinner = this.createSpinner(`Describing ${serviceNames.length} ECS services...`);

    try {
      const client = await this.getECSClient(config);
      const command = new DescribeServicesCommand({
        services: serviceNames,
        ...(options.cluster && { cluster: options.cluster }),
        ...(options.include && { include: options.include }),
      });

      const response = await client.send(command);
      const services = response.services || [];

      const descriptions: ServiceDescription[] = services.map((service: Service) => ({
        serviceName: service.serviceName!,
        serviceArn: service.serviceArn!,
        clusterArn: service.clusterArn!,
        status: service.status!,
        taskDefinition: service.taskDefinition!,
        desiredCount: service.desiredCount || 0,
        runningCount: service.runningCount || 0,
        pendingCount: service.pendingCount || 0,
        ...(service.launchType && { launchType: service.launchType }),
        ...(service.capacityProviderStrategy && {
          capacityProviderStrategy: service.capacityProviderStrategy.map((strategy) => ({
            capacityProvider: strategy.capacityProvider!,
            ...(strategy.weight !== undefined && { weight: strategy.weight }),
            ...(strategy.base !== undefined && { base: strategy.base }),
          })),
        }),
        ...(service.platformVersion && { platformVersion: service.platformVersion }),
        ...(service.networkConfiguration && {
          networkConfiguration: {
            ...(service.networkConfiguration.awsvpcConfiguration && {
              awsvpcConfiguration: {
                subnets: service.networkConfiguration.awsvpcConfiguration.subnets || [],
                ...(service.networkConfiguration.awsvpcConfiguration.securityGroups && {
                  securityGroups: service.networkConfiguration.awsvpcConfiguration.securityGroups,
                }),
                ...(service.networkConfiguration.awsvpcConfiguration.assignPublicIp && {
                  assignPublicIp: service.networkConfiguration.awsvpcConfiguration.assignPublicIp,
                }),
              },
            }),
          },
        }),
        ...(service.loadBalancers && {
          loadBalancers: service.loadBalancers.map((lb) => ({
            ...(lb.targetGroupArn && { targetGroupArn: lb.targetGroupArn }),
            ...(lb.loadBalancerName && { loadBalancerName: lb.loadBalancerName }),
            containerName: lb.containerName!,
            containerPort: lb.containerPort!,
          })),
        }),
        ...(service.serviceRegistries && {
          serviceRegistries: service.serviceRegistries.map((registry) => ({
            registryArn: registry.registryArn!,
            ...(registry.port !== undefined && { port: registry.port }),
            ...(registry.containerName && { containerName: registry.containerName }),
            ...(registry.containerPort !== undefined && { containerPort: registry.containerPort }),
          })),
        }),
        ...(service.deployments && {
          deployments: service.deployments.map((deployment) => ({
            id: deployment.id!,
            status: deployment.status!,
            taskDefinition: deployment.taskDefinition!,
            desiredCount: deployment.desiredCount || 0,
            pendingCount: deployment.pendingCount || 0,
            runningCount: deployment.runningCount || 0,
            failedTasks: deployment.failedTasks || 0,
            ...(deployment.createdAt && { createdAt: deployment.createdAt }),
            ...(deployment.updatedAt && { updatedAt: deployment.updatedAt }),
          })),
        }),
        ...(service.events && {
          events: service.events.map((event) => ({
            id: event.id!,
            ...(event.createdAt && { createdAt: event.createdAt }),
            message: event.message!,
          })),
        }),
        ...(service.tags && {
          tags: service.tags.map((tag) => ({
            key: tag.key!,
            value: tag.value!,
          })),
        }),
      }));

      spinner.succeed(`Retrieved descriptions for ${descriptions.length} services`);
      return descriptions;
    } catch (error) {
      spinner.fail("Failed to describe services");
      throw new ServiceError(
        `Failed to describe ECS services: ${error instanceof Error ? error.message : String(error)}`,
        "ECS",
        "describe-services",
        error,
        { serviceNames, clusterName: options.cluster },
      );
    }
  }

  /**
   * Create a new ECS service
   *
   * @param params - Service creation parameters
   * @param config - Client configuration options
   * @returns Promise resolving to service description
   * @throws When service creation fails
   */
  async createService(
    parameters: CreateServiceRequest,
    config: AwsClientConfig = {},
  ): Promise<ServiceDescription> {
    const spinner = this.createSpinner(`Creating ECS service '${parameters.serviceName}'...`);

    try {
      const client = await this.getECSClient(config);
      const command = new CreateServiceCommand(parameters);

      const response = await client.send(command);
      const service = response.service!;

      const description: ServiceDescription = {
        serviceName: service.serviceName!,
        serviceArn: service.serviceArn!,
        clusterArn: service.clusterArn!,
        status: service.status!,
        taskDefinition: service.taskDefinition!,
        desiredCount: service.desiredCount || 0,
        runningCount: service.runningCount || 0,
        pendingCount: service.pendingCount || 0,
      };

      spinner.succeed(`Created ECS service '${parameters.serviceName}'`);
      return description;
    } catch (error) {
      spinner.fail(`Failed to create service '${parameters.serviceName}'`);
      throw new ServiceError(
        `Failed to create ECS service '${parameters.serviceName}': ${error instanceof Error ? error.message : String(error)}`,
        "ECS",
        "create-service",
        error,
        { serviceName: parameters.serviceName, clusterName: parameters.cluster },
      );
    }
  }

  /**
   * Update an ECS service
   *
   * @param params - Service update parameters
   * @param config - Client configuration options
   * @returns Promise resolving to updated service description
   * @throws When service update fails
   */
  async updateService(
    parameters: UpdateServiceRequest,
    config: AwsClientConfig = {},
  ): Promise<ServiceDescription> {
    const spinner = this.createSpinner(`Updating ECS service '${parameters.service}'...`);

    try {
      const client = await this.getECSClient(config);
      const command = new UpdateServiceCommand(parameters);

      const response = await client.send(command);
      const service = response.service!;

      const description: ServiceDescription = {
        serviceName: service.serviceName!,
        serviceArn: service.serviceArn!,
        clusterArn: service.clusterArn!,
        status: service.status!,
        taskDefinition: service.taskDefinition!,
        desiredCount: service.desiredCount || 0,
        runningCount: service.runningCount || 0,
        pendingCount: service.pendingCount || 0,
      };

      spinner.succeed(`Updated ECS service '${parameters.service}'`);
      return description;
    } catch (error) {
      spinner.fail(`Failed to update service '${parameters.service}'`);
      throw new ServiceError(
        `Failed to update ECS service '${parameters.service}': ${error instanceof Error ? error.message : String(error)}`,
        "ECS",
        "update-service",
        error,
        { serviceName: parameters.service, clusterName: parameters.cluster },
      );
    }
  }

  /**
   * Delete an ECS service
   *
   * @param serviceName - Name of service to delete
   * @param options - Deletion options including cluster and force flag
   * @param config - Client configuration options
   * @throws When service deletion fails
   */
  async deleteService(
    serviceName: string,
    options: { cluster?: string; force?: boolean } = {},
    config: AwsClientConfig = {},
  ): Promise<void> {
    const spinner = this.createSpinner(`Deleting ECS service '${serviceName}'...`);

    try {
      const client = await this.getECSClient(config);
      const command = new DeleteServiceCommand({
        service: serviceName,
        ...(options.cluster && { cluster: options.cluster }),
        ...(options.force !== undefined && { force: options.force }),
      });

      await client.send(command);

      spinner.succeed(`Deleted ECS service '${serviceName}'`);
    } catch (error) {
      spinner.fail(`Failed to delete service '${serviceName}'`);
      throw new ServiceError(
        `Failed to delete ECS service '${serviceName}': ${error instanceof Error ? error.message : String(error)}`,
        "ECS",
        "delete-service",
        error,
        { serviceName, clusterName: options.cluster },
      );
    }
  }

  /**
   * List ECS tasks in a cluster
   *
   * @param options - List options including cluster, service, status filters, and pagination
   * @param config - Client configuration options
   * @returns Promise resolving to array of task ARNs
   * @throws When task listing fails
   */
  async listTasks(
    options: {
      cluster?: string;
      serviceName?: string;
      family?: string;
      containerInstance?: string;
      desiredStatus?: "RUNNING" | "PENDING" | "STOPPED";
      launchType?: "EC2" | "FARGATE" | "EXTERNAL";
      startedBy?: string;
      maxResults?: number;
    } = {},
    config: AwsClientConfig = {},
  ): Promise<string[]> {
    const spinnerMessage = this.buildListTasksSpinnerMessage(options);
    const spinner = this.createSpinner(spinnerMessage);

    try {
      const client = await this.getECSClient(config);
      const command = new ListTasksCommand({
        ...(options.cluster && { cluster: options.cluster }),
        ...(options.serviceName && { serviceName: options.serviceName }),
        ...(options.family && { family: options.family }),
        ...(options.containerInstance && { containerInstance: options.containerInstance }),
        ...(options.desiredStatus && { desiredStatus: options.desiredStatus }),
        ...(options.launchType && { launchType: options.launchType }),
        ...(options.startedBy && { startedBy: options.startedBy }),
        ...(options.maxResults && { maxResults: options.maxResults }),
      });

      const response = await client.send(command);
      const tasks = response.taskArns || [];

      spinner.succeed(`Found ${tasks.length} ECS tasks`);
      return tasks;
    } catch (error) {
      spinner.fail("Failed to list tasks");
      throw new ServiceError(
        `Failed to list ECS tasks: ${error instanceof Error ? error.message : String(error)}`,
        "ECS",
        "list-tasks",
        error,
        { clusterName: options.cluster, serviceName: options.serviceName },
      );
    }
  }

  /**
   * Describe ECS tasks
   *
   * @param taskArns - ARNs of tasks to describe
   * @param options - Options including cluster and include settings
   * @param config - Client configuration options
   * @returns Promise resolving to array of task descriptions
   * @throws When task description fails
   */
  async describeTasks(
    taskArns: string[],
    options: { cluster?: string; include?: "TAGS"[] } = {},
    config: AwsClientConfig = {},
  ): Promise<TaskDescription[]> {
    const spinner = this.createSpinner(`Describing ${taskArns.length} ECS tasks...`);

    try {
      const client = await this.getECSClient(config);
      const command = new DescribeTasksCommand({
        tasks: taskArns,
        ...(options.cluster && { cluster: options.cluster }),
        ...(options.include && { include: options.include }),
      });

      const response = await client.send(command);
      const tasks = response.tasks || [];

      const descriptions: TaskDescription[] = tasks.map((task: Task) =>
        this.buildTaskDescription(task),
      );

      spinner.succeed(`Retrieved descriptions for ${descriptions.length} tasks`);
      return descriptions;
    } catch (error) {
      spinner.fail("Failed to describe tasks");
      throw new ServiceError(
        `Failed to describe ECS tasks: ${error instanceof Error ? error.message : String(error)}`,
        "ECS",
        "describe-tasks",
        error,
        { taskArns, clusterName: options.cluster },
      );
    }
  }

  /**
   * Run a new ECS task
   *
   * @param params - Task run parameters
   * @param config - Client configuration options
   * @returns Promise resolving to run task result
   * @throws When task run fails
   */
  async runTask(
    parameters: RunTaskCommandInput,
    config: AwsClientConfig = {},
  ): Promise<RunTaskResult> {
    const spinner = this.createSpinner(
      `Running ECS task with definition '${parameters.taskDefinition}'...`,
    );

    try {
      const client = await this.getECSClient(config);
      const command = new RunTaskCommand(parameters);

      const response = await client.send(command);

      const result: RunTaskResult = {
        tasks: (response.tasks || []).map((task: Task) => ({
          taskArn: task.taskArn!,
          taskDefinitionArn: task.taskDefinitionArn!,
          clusterArn: task.clusterArn!,
          lastStatus: task.lastStatus!,
          desiredStatus: task.desiredStatus!,
        })),
        ...(response.failures &&
          response.failures.length > 0 && {
            failures: response.failures.map((failure) => ({
              arn: failure.arn!,
              reason: failure.reason!,
              ...(failure.detail && { detail: failure.detail }),
            })),
          }),
      };

      const taskCount = result.tasks.length;
      const failureCount = result.failures?.length || 0;

      if (failureCount > 0) {
        spinner.warn(`Started ${taskCount} tasks with ${failureCount} failures`);
      } else {
        spinner.succeed(`Successfully started ${taskCount} ECS tasks`);
      }

      return result;
    } catch (error) {
      spinner.fail(`Failed to run task with definition '${parameters.taskDefinition}'`);
      throw new ServiceError(
        `Failed to run ECS task: ${error instanceof Error ? error.message : String(error)}`,
        "ECS",
        "run-task",
        error,
        { taskDefinition: parameters.taskDefinition, clusterName: parameters.cluster },
      );
    }
  }

  /**
   * Stop an ECS task
   *
   * @param taskArn - ARN of task to stop
   * @param options - Stop options including cluster and reason
   * @param config - Client configuration options
   * @returns Promise resolving to task description of stopped task
   * @throws When task stop fails
   */
  async stopTask(
    taskArn: string,
    options: { cluster?: string; reason?: string } = {},
    config: AwsClientConfig = {},
  ): Promise<TaskDescription> {
    const spinner = this.createSpinner(`Stopping ECS task '${taskArn.split("/").pop()}'...`);

    try {
      const client = await this.getECSClient(config);
      const command = new StopTaskCommand({
        task: taskArn,
        ...(options.cluster && { cluster: options.cluster }),
        ...(options.reason && { reason: options.reason }),
      });

      const response = await client.send(command);
      const task = response.task!;

      const description: TaskDescription = this.buildTaskDescription(task);

      spinner.succeed(`Stopped ECS task '${taskArn.split("/").pop()}'`);
      return description;
    } catch (error) {
      spinner.fail(`Failed to stop task '${taskArn.split("/").pop()}'`);
      throw new ServiceError(
        `Failed to stop ECS task: ${error instanceof Error ? error.message : String(error)}`,
        "ECS",
        "stop-task",
        error,
        { taskArn, clusterName: options.cluster },
      );
    }
  }

  /**
   * Build a TaskDescription from an AWS SDK Task object
   *
   * @param task - The AWS SDK Task object
   * @returns A TaskDescription object
   * @internal
   */
  private buildTaskDescription(task: Task): TaskDescription {
    const baseTask: TaskDescription = {
      taskArn: task.taskArn!,
      taskDefinitionArn: task.taskDefinitionArn!,
      clusterArn: task.clusterArn!,
      lastStatus: task.lastStatus!,
      desiredStatus: task.desiredStatus!,
    };

    return {
      ...baseTask,
      ...this.mapTaskOptionalFields(task),
      ...this.mapTaskContainers(task),
      ...this.mapTaskTags(task),
    };
  }

  /**
   * Map optional task fields that are conditionally included
   *
   * @param task - The AWS SDK Task object
   * @returns Partial TaskDescription with optional fields
   * @internal
   */
  private mapTaskOptionalFields(task: Task): Partial<TaskDescription> {
    const optional: Partial<TaskDescription> = {};

    if (task.healthStatus) optional.healthStatus = task.healthStatus;
    if (task.cpu) optional.cpu = task.cpu;
    if (task.memory) optional.memory = task.memory;
    if (task.launchType) optional.launchType = task.launchType;
    if (task.capacityProviderName) optional.capacityProviderName = task.capacityProviderName;
    if (task.availabilityZone) optional.availabilityZone = task.availabilityZone;
    if (task.connectivity) optional.connectivity = task.connectivity;
    if (task.connectivityAt) optional.connectivityAt = task.connectivityAt;
    if (task.createdAt) optional.createdAt = task.createdAt;
    if (task.startedAt) optional.startedAt = task.startedAt;
    if (task.startedBy) optional.startedBy = task.startedBy;
    if (task.stoppedAt) optional.stoppedAt = task.stoppedAt;
    if (task.stoppedReason) optional.stoppedReason = task.stoppedReason;
    if (task.group) optional.group = task.group;
    if (task.platformVersion) optional.platformVersion = task.platformVersion;

    return optional;
  }

  /**
   * Map task containers with their nested properties
   *
   * @param task - The AWS SDK Task object
   * @returns Partial TaskDescription with containers
   * @internal
   */
  private mapTaskContainers(task: Task): Partial<TaskDescription> {
    if (!task.containers) return {};

    return {
      containers: task.containers.map((container) => this.buildContainerDescription(container)),
    };
  }

  /**
   * Build a container description from AWS SDK Container object
   *
   * @param container - The AWS SDK Container object
   * @returns Container description object
   * @internal
   */
  private buildContainerDescription(container: Container): {
    containerArn: string;
    name: string;
    image: string;
    lastStatus: string;
    exitCode?: number;
    reason?: string;
    healthStatus?: string;
    networkBindings?: Array<{
      bindIP?: string;
      containerPort?: number;
      hostPort?: number;
      protocol?: string;
    }>;
    networkInterfaces?: Array<{
      attachmentId?: string;
      privateIpv4Address?: string;
      ipv6Address?: string;
    }>;
  } {
    const result: {
      containerArn: string;
      name: string;
      image: string;
      lastStatus: string;
      exitCode?: number;
      reason?: string;
      healthStatus?: string;
      networkBindings?: Array<{
        bindIP?: string;
        containerPort?: number;
        hostPort?: number;
        protocol?: string;
      }>;
      networkInterfaces?: Array<{
        attachmentId?: string;
        privateIpv4Address?: string;
        ipv6Address?: string;
      }>;
    } = {
      containerArn: container.containerArn!,
      name: container.name!,
      image: container.image!,
      lastStatus: container.lastStatus!,
    };

    if (container.exitCode !== undefined) result.exitCode = container.exitCode;
    if (container.reason) result.reason = container.reason;
    if (container.healthStatus) result.healthStatus = container.healthStatus;

    if (container.networkBindings) {
      result.networkBindings = this.mapNetworkBindings(container.networkBindings);
    }

    if (container.networkInterfaces) {
      result.networkInterfaces = this.mapNetworkInterfaces(container.networkInterfaces);
    }

    return result;
  }

  /**
   * Map network bindings for a container
   *
   * @param bindings - Array of network bindings
   * @returns Mapped network bindings
   * @internal
   */
  private mapNetworkBindings(bindings: NetworkBinding[]): Array<{
    bindIP?: string;
    containerPort?: number;
    hostPort?: number;
    protocol?: string;
  }> {
    return bindings.map((binding) => {
      const result: {
        bindIP?: string;
        containerPort?: number;
        hostPort?: number;
        protocol?: string;
      } = {};
      if (binding.bindIP) result.bindIP = binding.bindIP;
      if (binding.containerPort !== undefined) result.containerPort = binding.containerPort;
      if (binding.hostPort !== undefined) result.hostPort = binding.hostPort;
      if (binding.protocol) result.protocol = binding.protocol;
      return result;
    });
  }

  /**
   * Map network interfaces for a container
   *
   * @param interfaces - Array of network interfaces
   * @returns Mapped network interfaces
   * @internal
   */
  private mapNetworkInterfaces(interfaces: NetworkInterface[]): Array<{
    attachmentId?: string;
    privateIpv4Address?: string;
    ipv6Address?: string;
  }> {
    return interfaces.map((iface) => {
      const result: {
        attachmentId?: string;
        privateIpv4Address?: string;
        ipv6Address?: string;
      } = {};
      if (iface.attachmentId) result.attachmentId = iface.attachmentId;
      if (iface.privateIpv4Address) result.privateIpv4Address = iface.privateIpv4Address;
      if (iface.ipv6Address) result.ipv6Address = iface.ipv6Address;
      return result;
    });
  }

  /**
   * Map task tags
   *
   * @param task - The AWS SDK Task object
   * @returns Partial TaskDescription with tags
   * @internal
   */
  private mapTaskTags(task: Task): Partial<TaskDescription> {
    if (!task.tags) return {};

    return {
      tags: task.tags.map((tag) => ({
        key: tag.key!,
        value: tag.value!,
      })),
    };
  }

  /**
   * Build a ClusterDescription from an AWS SDK Cluster object
   *
   * @param cluster - The AWS SDK Cluster object
   * @returns A ClusterDescription object
   * @internal
   */
  private buildClusterDescription(cluster: Cluster): ClusterDescription {
    const baseCluster: ClusterDescription = {
      clusterName: cluster.clusterName!,
      clusterArn: cluster.clusterArn!,
      status: cluster.status!,
      runningTasksCount: cluster.runningTasksCount || 0,
      pendingTasksCount: cluster.pendingTasksCount || 0,
      activeServicesCount: cluster.activeServicesCount || 0,
      registeredContainerInstancesCount: cluster.registeredContainerInstancesCount || 0,
    };

    return {
      ...baseCluster,
      ...this.mapClusterOptionalFields(cluster),
      ...this.mapClusterStatistics(cluster),
      ...this.mapClusterAttachments(cluster),
      ...this.mapClusterSettings(cluster),
      ...this.mapClusterConfiguration(cluster),
      ...this.mapClusterTags(cluster),
    };
  }

  /**
   * Map optional cluster fields
   *
   * @param cluster - The AWS SDK Cluster object
   * @returns Partial ClusterDescription with optional fields
   * @internal
   */
  private mapClusterOptionalFields(cluster: Cluster): Partial<ClusterDescription> {
    const optional: Partial<ClusterDescription> = {};

    if (cluster.capacityProviders) {
      optional.capacityProviders = cluster.capacityProviders;
    }

    if (cluster.defaultCapacityProviderStrategy) {
      optional.defaultCapacityProviderStrategy = cluster.defaultCapacityProviderStrategy.map(
        (strategy) => {
          const mappedStrategy: {
            capacityProvider: string;
            weight?: number;
            base?: number;
          } = {
            capacityProvider: strategy.capacityProvider!,
          };
          if (strategy.weight !== undefined) mappedStrategy.weight = strategy.weight;
          if (strategy.base !== undefined) mappedStrategy.base = strategy.base;
          return mappedStrategy;
        },
      );
    }

    return optional;
  }

  /**
   * Map cluster statistics
   *
   * @param cluster - The AWS SDK Cluster object
   * @returns Partial ClusterDescription with statistics
   * @internal
   */
  private mapClusterStatistics(cluster: Cluster): Partial<ClusterDescription> {
    if (!cluster.statistics) return {};

    return {
      statistics: cluster.statistics.map((stat) => ({
        name: stat.name!,
        value: stat.value!,
      })),
    };
  }

  /**
   * Map cluster attachments
   *
   * @param cluster - The AWS SDK Cluster object
   * @returns Partial ClusterDescription with attachments
   * @internal
   */
  private mapClusterAttachments(cluster: Cluster): Partial<ClusterDescription> {
    if (!cluster.attachments) return {};

    return {
      attachments: cluster.attachments.map((attachment) => {
        const mappedAttachment: {
          id: string;
          type: string;
          status: string;
          details?: { name: string; value: string }[];
        } = {
          id: attachment.id!,
          type: attachment.type!,
          status: attachment.status!,
        };

        if (attachment.details) {
          mappedAttachment.details = attachment.details.map((detail) => ({
            name: detail.name!,
            value: detail.value!,
          }));
        }

        return mappedAttachment;
      }),
    };
  }

  /**
   * Map cluster settings
   *
   * @param cluster - The AWS SDK Cluster object
   * @returns Partial ClusterDescription with settings
   * @internal
   */
  private mapClusterSettings(cluster: Cluster): Partial<ClusterDescription> {
    if (!cluster.settings) return {};

    return {
      settings: cluster.settings.map((setting) => ({
        name: setting.name!,
        value: setting.value!,
      })),
    };
  }

  /**
   * Map cluster configuration
   *
   * @param cluster - The AWS SDK Cluster object
   * @returns Partial ClusterDescription with configuration
   * @internal
   */
  private mapClusterConfiguration(cluster: Cluster): Partial<ClusterDescription> {
    if (!cluster.configuration) return {};

    const configuration: ClusterDescription["configuration"] = {};

    if (cluster.configuration.executeCommandConfiguration) {
      configuration.executeCommandConfiguration = this.mapExecuteCommandConfiguration(
        cluster.configuration.executeCommandConfiguration,
      );
    }

    return { configuration };
  }

  /**
   * Map execute command configuration
   *
   * @param config - The execute command configuration
   * @returns Mapped execute command configuration
   * @internal
   */
  private mapExecuteCommandConfiguration(config: ExecuteCommandConfiguration): {
    kmsKeyId?: string;
    logging?: string;
    logConfiguration?: {
      cloudWatchLogGroupName?: string;
      cloudWatchEncryptionEnabled?: boolean;
      s3BucketName?: string;
      s3KeyPrefix?: string;
      s3EncryptionEnabled?: boolean;
    };
  } {
    const execConfig: {
      kmsKeyId?: string;
      logging?: string;
      logConfiguration?: {
        cloudWatchLogGroupName?: string;
        cloudWatchEncryptionEnabled?: boolean;
        s3BucketName?: string;
        s3KeyPrefix?: string;
        s3EncryptionEnabled?: boolean;
      };
    } = {};

    if (config.kmsKeyId) execConfig.kmsKeyId = config.kmsKeyId;
    if (config.logging) execConfig.logging = config.logging;

    if (config.logConfiguration) {
      execConfig.logConfiguration = this.mapLogConfiguration(config.logConfiguration);
    }

    return execConfig;
  }

  /**
   * Map log configuration
   *
   * @param logConfig - The log configuration
   * @returns Mapped log configuration
   * @internal
   */
  private mapLogConfiguration(logConfig: ExecuteCommandLogConfiguration): {
    cloudWatchLogGroupName?: string;
    cloudWatchEncryptionEnabled?: boolean;
    s3BucketName?: string;
    s3KeyPrefix?: string;
    s3EncryptionEnabled?: boolean;
  } {
    const mappedLogConfig: {
      cloudWatchLogGroupName?: string;
      cloudWatchEncryptionEnabled?: boolean;
      s3BucketName?: string;
      s3KeyPrefix?: string;
      s3EncryptionEnabled?: boolean;
    } = {};

    if (logConfig.cloudWatchLogGroupName) {
      mappedLogConfig.cloudWatchLogGroupName = logConfig.cloudWatchLogGroupName;
    }
    if (logConfig.cloudWatchEncryptionEnabled !== undefined) {
      mappedLogConfig.cloudWatchEncryptionEnabled = logConfig.cloudWatchEncryptionEnabled;
    }
    if (logConfig.s3BucketName) {
      mappedLogConfig.s3BucketName = logConfig.s3BucketName;
    }
    if (logConfig.s3KeyPrefix) {
      mappedLogConfig.s3KeyPrefix = logConfig.s3KeyPrefix;
    }
    if (logConfig.s3EncryptionEnabled !== undefined) {
      mappedLogConfig.s3EncryptionEnabled = logConfig.s3EncryptionEnabled;
    }

    return mappedLogConfig;
  }

  /**
   * Map cluster tags
   *
   * @param cluster - The AWS SDK Cluster object
   * @returns Partial ClusterDescription with tags
   * @internal
   */
  private mapClusterTags(cluster: Cluster): Partial<ClusterDescription> {
    if (!cluster.tags) return {};

    return {
      tags: cluster.tags.map((tag) => ({
        key: tag.key!,
        value: tag.value!,
      })),
    };
  }

  /**
   * Build spinner message for list tasks operation
   *
   * @param options - List tasks options
   * @returns Formatted spinner message
   * @internal
   */
  private buildListTasksSpinnerMessage(options: {
    cluster?: string;
    serviceName?: string;
    family?: string;
    launchType?: string;
    desiredStatus?: string;
    maxResults?: number;
  }): string {
    if (!options.cluster) {
      return "Listing ECS tasks...";
    }

    let message = `Listing tasks in cluster '${options.cluster}'`;

    if (options.serviceName) {
      message += ` for service '${options.serviceName}'`;
    }

    return `${message}...`;
  }

  /**
   * Clear client caches (useful for testing or configuration changes)
   *
   */
  clearClientCache(): void {
    this.clientCache.clear();

    if (this.options.enableDebugLogging) {
      console.debug("Cleared ECS client caches");
    }
  }
}
