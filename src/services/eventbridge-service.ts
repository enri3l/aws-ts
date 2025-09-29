/**
 * EventBridge service for rule and target management
 *
 * Orchestrates Amazon EventBridge operations by providing a unified interface for
 * rule lifecycle management, target configuration, event bus operations,
 * and event routing. Integrates with existing credential management for
 * AWS SDK client creation.
 *
 */

import {
  DeleteRuleCommand,
  DescribeRuleCommand,
  DisableRuleCommand,
  EnableRuleCommand,
  EventBridgeClient,
  ListRulesCommand,
  ListTargetsByRuleCommand,
  PutRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
  type DeleteRuleRequest,
  type DescribeRuleRequest,
  type DisableRuleRequest,
  type EnableRuleRequest,
  type ListRulesRequest,
  type ListRulesResponse,
  type ListTargetsByRuleRequest,
  type PutRuleRequest,
  type PutTargetsRequest,
  type PutTargetsResponse,
  type RemoveTargetsRequest,
  type RemoveTargetsResponse,
  type Rule,
  type Target,
} from "@aws-sdk/client-eventbridge";
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
 * Configuration options for EventBridge service
 *
 * @public
 */
export interface EventBridgeServiceOptions {
  /**
   * Credential service configuration
   */
  credentialService?: {
    defaultRegion?: string;
    defaultProfile?: string;
    enableDebugLogging?: boolean;
  };

  /**
   * Enable debug logging for EventBridge operations
   */
  enableDebugLogging?: boolean;

  /**
   * Enable progress indicators for long-running operations
   */
  enableProgressIndicators?: boolean;

  /**
   * EventBridge client configuration overrides
   */
  clientConfig?: {
    region?: string;
    profile?: string;
    endpoint?: string;
  };
}

/**
 * EventBridge rule creation/update parameters
 *
 * @public
 */
export interface EventBridgePutRuleParameters {
  name: string;
  eventBusName?: string;
  description?: string;
  eventPattern?: string;
  scheduleExpression?: string;
  state?: "ENABLED" | "DISABLED";
  roleArn?: string;
  tags?: Array<{ key: string; value: string }>;
}

/**
 * EventBridge rule deletion parameters
 *
 * @public
 */
export interface EventBridgeDeleteRuleParameters {
  name: string;
  eventBusName?: string;
  force?: boolean;
}

/**
 * EventBridge target configuration
 *
 * @public
 */
export interface EventBridgeTargetParameters {
  id: string;
  arn: string;
  roleArn?: string;
  input?: string;
  inputPath?: string;
  inputTransformer?: {
    inputPathsMap?: Record<string, string>;
    inputTemplate: string;
  };
  kinesisParameters?: {
    partitionKeyPath: string;
  };
  runCommandParameters?: {
    runCommandTargets: Array<{
      key: string;
      values: string[];
    }>;
  };
  ecsParameters?: {
    taskDefinitionArn: string;
    taskCount?: number;
    launchType?: "EC2" | "FARGATE" | "EXTERNAL";
    platformVersion?: string;
    group?: string;
    capacityProviderStrategy?: Array<{
      capacityProvider: string;
      weight?: number;
      base?: number;
    }>;
    enableEcsManagedTags?: boolean;
    enableExecuteCommand?: boolean;
    placementConstraints?: Array<{
      type?: "distinctInstance" | "memberOf";
      expression?: string;
    }>;
    placementStrategy?: Array<{
      type?: "random" | "spread" | "binpack";
      field?: string;
    }>;
    propagateTags?: "TASK_DEFINITION" | "SERVICE";
    referenceId?: string;
    tags?: Array<{ key: string; value: string }>;
  };
  batchParameters?: {
    jobDefinition: string;
    jobName: string;
    arrayProperties?: {
      size: number;
    };
    retryStrategy?: {
      attempts: number;
    };
  };
  sqsParameters?: {
    messageGroupId?: string;
  };
  httpParameters?: {
    pathParameterValues?: Record<string, string>;
    headerParameters?: Record<string, string>;
    queryStringParameters?: Record<string, string>;
  };
  redshiftDataParameters?: {
    database: string;
    dbUser?: string;
    sql: string;
    statementName?: string;
    withEvent?: boolean;
    secretManagerArn?: string;
  };
  sageMakerPipelineParameters?: {
    pipelineParameterList?: Array<{
      name: string;
      value: string;
    }>;
  };
  deadLetterConfig?: {
    arn?: string;
  };
  retryPolicy?: {
    maximumRetryAttempts?: number;
    maximumEventAge?: number;
  };
}

/**
 * EventBridge targets management parameters
 *
 * @public
 */
export interface EventBridgePutTargetsParameters {
  rule: string;
  eventBusName?: string;
  targets: EventBridgeTargetParameters[];
}

/**
 * EventBridge targets removal parameters
 *
 * @public
 */
export interface EventBridgeRemoveTargetsParameters {
  rule: string;
  eventBusName?: string;
  ids: string[];
  force?: boolean;
}

/**
 * EventBridge paginated list result
 *
 * @public
 */
export interface EventBridgePaginatedResult<T> {
  items: T[];
  nextToken?: string;
}

/**
 * EventBridge service for rule and target management
 *
 * Provides a unified interface for all EventBridge operations,
 * coordinating with credential management and providing error handling.
 *
 * @public
 */
export class EventBridgeService {
  private readonly credentialService: CredentialService;
  private readonly options: EventBridgeServiceOptions;
  private clientCache = new Map<string, EventBridgeClient>();

  /**
   * Create a new EventBridge service instance
   *
   * @param options - Configuration options for the service
   */
  constructor(options: EventBridgeServiceOptions = {}) {
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
   * Get EventBridge client with caching
   *
   * @param config - Client configuration options
   * @returns EventBridge client instance
   * @internal
   */
  private async getEventBridgeClient(config: AwsClientConfig = {}): Promise<EventBridgeClient> {
    const cacheKey = `${config.region || "default"}-${config.profile || "default"}`;

    if (!this.clientCache.has(cacheKey)) {
      const clientConfig = {
        ...config,
        ...this.options.clientConfig,
      };

      const client = await this.credentialService.createClient(EventBridgeClient, clientConfig);
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
   * List EventBridge rules
   *
   * @param config - Client configuration options
   * @param params - List rules parameters
   * @returns Promise resolving to paginated list of rules
   * @throws When rule listing fails
   */
  async listRules(
    config: AwsClientConfig = {},
    parameters: Partial<ListRulesRequest> = {},
  ): Promise<EventBridgePaginatedResult<Rule>> {
    const eventBusName = parameters.EventBusName || "default";
    const spinner = this.createSpinner(
      `Listing EventBridge rules on event bus '${eventBusName}'...`,
    );

    try {
      const client = await this.getEventBridgeClient(config);
      const command = new ListRulesCommand({
        EventBusName: eventBusName,
        ...parameters,
      });

      const response: ListRulesResponse = await client.send(command);
      const rules = response.Rules || [];

      spinner.succeed(`Found ${rules.length} EventBridge rules on event bus '${eventBusName}'`);
      return {
        items: rules,
        ...(response.NextToken && { nextToken: response.NextToken }),
      };
    } catch (error) {
      spinner.fail("Failed to list rules");
      throw new ServiceError(
        `Failed to list EventBridge rules: ${error instanceof Error ? error.message : String(error)}`,
        "EventBridge",
        "list-rules",
        error,
      );
    }
  }

  /**
   * Describe an EventBridge rule
   *
   * @param ruleName - Name of the rule to describe
   * @param config - Client configuration options
   * @param eventBusName - Name of the event bus (defaults to "default")
   * @returns Promise resolving to rule details
   * @throws When rule description fails
   */
  async describeRule(
    ruleName: string,
    config: AwsClientConfig = {},
    eventBusName = "default",
  ): Promise<Rule> {
    const spinner = this.createSpinner(
      `Describing rule '${ruleName}' on event bus '${eventBusName}'...`,
    );

    try {
      const client = await this.getEventBridgeClient(config);
      const command = new DescribeRuleCommand({
        Name: ruleName,
        EventBusName: eventBusName,
      } as DescribeRuleRequest);

      const response = await client.send(command);

      spinner.succeed(`Retrieved details for rule '${ruleName}'`);
      return response;
    } catch (error) {
      spinner.fail(`Failed to describe rule '${ruleName}'`);
      throw new ServiceError(
        `Failed to describe rule '${ruleName}': ${error instanceof Error ? error.message : String(error)}`,
        "EventBridge",
        "describe-rule",
        error,
        { ruleName, eventBusName },
      );
    }
  }

  /**
   * Create or update an EventBridge rule
   *
   * @param parameters - Rule creation/update parameters
   * @param config - Client configuration options
   * @returns Promise resolving to rule ARN
   * @throws When rule creation/update fails
   */
  async putRule(
    parameters: EventBridgePutRuleParameters,
    config: AwsClientConfig = {},
  ): Promise<{ ruleArn?: string }> {
    const eventBusName = parameters.eventBusName || "default";
    const spinner = this.createSpinner(
      `Creating/updating rule '${parameters.name}' on event bus '${eventBusName}'...`,
    );

    try {
      const client = await this.getEventBridgeClient(config);
      const command = new PutRuleCommand({
        Name: parameters.name,
        EventBusName: eventBusName,
        Description: parameters.description,
        EventPattern: parameters.eventPattern,
        ScheduleExpression: parameters.scheduleExpression,
        State: parameters.state || "ENABLED",
        RoleArn: parameters.roleArn,
        Tags: parameters.tags,
      } as PutRuleRequest);

      const response = await client.send(command);

      spinner.succeed(`Rule '${parameters.name}' created/updated successfully`);
      return { ...(response.RuleArn && { ruleArn: response.RuleArn }) };
    } catch (error) {
      spinner.fail(`Failed to create/update rule '${parameters.name}'`);
      throw new ServiceError(
        `Failed to put rule '${parameters.name}': ${error instanceof Error ? error.message : String(error)}`,
        "EventBridge",
        "put-rule",
        error,
        { ruleName: parameters.name, eventBusName },
      );
    }
  }

  /**
   * Delete an EventBridge rule
   *
   * @param parameters - Rule deletion parameters
   * @param config - Client configuration options
   * @returns Promise that resolves when rule is deleted
   * @throws When rule deletion fails
   */
  async deleteRule(
    parameters: EventBridgeDeleteRuleParameters,
    config: AwsClientConfig = {},
  ): Promise<void> {
    const eventBusName = parameters.eventBusName || "default";
    const spinner = this.createSpinner(
      `Deleting rule '${parameters.name}' from event bus '${eventBusName}'...`,
    );

    try {
      const client = await this.getEventBridgeClient(config);
      const command = new DeleteRuleCommand({
        Name: parameters.name,
        EventBusName: eventBusName,
        Force: parameters.force,
      } as DeleteRuleRequest);

      await client.send(command);

      spinner.succeed(`Rule '${parameters.name}' deleted successfully`);
    } catch (error) {
      spinner.fail(`Failed to delete rule '${parameters.name}'`);
      throw new ServiceError(
        `Failed to delete rule '${parameters.name}': ${error instanceof Error ? error.message : String(error)}`,
        "EventBridge",
        "delete-rule",
        error,
        { ruleName: parameters.name, eventBusName },
      );
    }
  }

  /**
   * Enable an EventBridge rule
   *
   * @param ruleName - Name of the rule to enable
   * @param config - Client configuration options
   * @param eventBusName - Name of the event bus (defaults to "default")
   * @returns Promise that resolves when rule is enabled
   * @throws When rule enabling fails
   */
  async enableRule(
    ruleName: string,
    config: AwsClientConfig = {},
    eventBusName = "default",
  ): Promise<void> {
    const spinner = this.createSpinner(
      `Enabling rule '${ruleName}' on event bus '${eventBusName}'...`,
    );

    try {
      const client = await this.getEventBridgeClient(config);
      const command = new EnableRuleCommand({
        Name: ruleName,
        EventBusName: eventBusName,
      } as EnableRuleRequest);

      await client.send(command);

      spinner.succeed(`Rule '${ruleName}' enabled successfully`);
    } catch (error) {
      spinner.fail(`Failed to enable rule '${ruleName}'`);
      throw new ServiceError(
        `Failed to enable rule '${ruleName}': ${error instanceof Error ? error.message : String(error)}`,
        "EventBridge",
        "enable-rule",
        error,
        { ruleName, eventBusName },
      );
    }
  }

  /**
   * Disable an EventBridge rule
   *
   * @param ruleName - Name of the rule to disable
   * @param config - Client configuration options
   * @param eventBusName - Name of the event bus (defaults to "default")
   * @returns Promise that resolves when rule is disabled
   * @throws When rule disabling fails
   */
  async disableRule(
    ruleName: string,
    config: AwsClientConfig = {},
    eventBusName = "default",
  ): Promise<void> {
    const spinner = this.createSpinner(
      `Disabling rule '${ruleName}' on event bus '${eventBusName}'...`,
    );

    try {
      const client = await this.getEventBridgeClient(config);
      const command = new DisableRuleCommand({
        Name: ruleName,
        EventBusName: eventBusName,
      } as DisableRuleRequest);

      await client.send(command);

      spinner.succeed(`Rule '${ruleName}' disabled successfully`);
    } catch (error) {
      spinner.fail(`Failed to disable rule '${ruleName}'`);
      throw new ServiceError(
        `Failed to disable rule '${ruleName}': ${error instanceof Error ? error.message : String(error)}`,
        "EventBridge",
        "disable-rule",
        error,
        { ruleName, eventBusName },
      );
    }
  }

  /**
   * List targets for an EventBridge rule
   *
   * @param ruleName - Name of the rule
   * @param config - Client configuration options
   * @param eventBusName - Name of the event bus (defaults to "default")
   * @param nextToken - Pagination token
   * @param limit - Maximum number of targets to return
   * @returns Promise resolving to paginated list of targets
   * @throws When target listing fails
   */
  async listTargetsByRule(
    ruleName: string,
    config: AwsClientConfig = {},
    eventBusName = "default",
    nextToken?: string,
    limit?: number,
  ): Promise<EventBridgePaginatedResult<Target>> {
    const spinner = this.createSpinner(
      `Listing targets for rule '${ruleName}' on event bus '${eventBusName}'...`,
    );

    try {
      const client = await this.getEventBridgeClient(config);
      const command = new ListTargetsByRuleCommand({
        Rule: ruleName,
        EventBusName: eventBusName,
        NextToken: nextToken,
        Limit: limit,
      } as ListTargetsByRuleRequest);

      const response = await client.send(command);
      const targets = response.Targets || [];

      spinner.succeed(`Found ${targets.length} targets for rule '${ruleName}'`);
      return {
        items: targets,
        ...(response.NextToken && { nextToken: response.NextToken }),
      };
    } catch (error) {
      spinner.fail(`Failed to list targets for rule '${ruleName}'`);
      throw new ServiceError(
        `Failed to list targets for rule '${ruleName}': ${error instanceof Error ? error.message : String(error)}`,
        "EventBridge",
        "list-targets-by-rule",
        error,
        { ruleName, eventBusName },
      );
    }
  }

  /**
   * Add or update targets for an EventBridge rule
   *
   * @param parameters - Targets configuration parameters
   * @param config - Client configuration options
   * @returns Promise resolving to operation result
   * @throws When target configuration fails
   */
  async putTargets(
    parameters: EventBridgePutTargetsParameters,
    config: AwsClientConfig = {},
  ): Promise<PutTargetsResponse> {
    const eventBusName = parameters.eventBusName || "default";
    const spinner = this.createSpinner(
      `Adding/updating ${parameters.targets.length} targets for rule '${parameters.rule}' on event bus '${eventBusName}'...`,
    );

    try {
      const client = await this.getEventBridgeClient(config);
      const command = new PutTargetsCommand({
        Rule: parameters.rule,
        EventBusName: eventBusName,
        Targets: parameters.targets.map((target) => ({
          Id: target.id,
          Arn: target.arn,
          ...(target.roleArn && { RoleArn: target.roleArn }),
          ...(target.input && { Input: target.input }),
          ...(target.inputPath && { InputPath: target.inputPath }),
          ...(target.inputTransformer && {
            InputTransformer: {
              InputTemplate: target.inputTransformer.inputTemplate,
              ...(target.inputTransformer.inputPathsMap && {
                InputPathsMap: target.inputTransformer.inputPathsMap,
              }),
            },
          }),
          ...(target.kinesisParameters && {
            KinesisParameters: { PartitionKeyPath: target.kinesisParameters.partitionKeyPath },
          }),
          ...(target.runCommandParameters && {
            RunCommandParameters: {
              RunCommandTargets: target.runCommandParameters.runCommandTargets.map((rct) => ({
                Key: rct.key,
                Values: rct.values,
              })),
            },
          }),
        })),
      } as PutTargetsRequest);

      const response = await client.send(command);

      const successCount =
        (response.FailedEntryCount || 0) === 0
          ? parameters.targets.length
          : parameters.targets.length - (response.FailedEntryCount || 0);

      if (response.FailedEntryCount && response.FailedEntryCount > 0) {
        spinner.warn(
          `${successCount}/${parameters.targets.length} targets configured successfully`,
        );
      } else {
        spinner.succeed(`All ${parameters.targets.length} targets configured successfully`);
      }

      return response;
    } catch (error) {
      spinner.fail(`Failed to configure targets for rule '${parameters.rule}'`);
      throw new ServiceError(
        `Failed to put targets for rule '${parameters.rule}': ${error instanceof Error ? error.message : String(error)}`,
        "EventBridge",
        "put-targets",
        error,
        { ruleName: parameters.rule, eventBusName, targetCount: parameters.targets.length },
      );
    }
  }

  /**
   * Remove targets from an EventBridge rule
   *
   * @param parameters - Target removal parameters
   * @param config - Client configuration options
   * @returns Promise resolving to operation result
   * @throws When target removal fails
   */
  async removeTargets(
    parameters: EventBridgeRemoveTargetsParameters,
    config: AwsClientConfig = {},
  ): Promise<RemoveTargetsResponse> {
    const eventBusName = parameters.eventBusName || "default";
    const spinner = this.createSpinner(
      `Removing ${parameters.ids.length} targets from rule '${parameters.rule}' on event bus '${eventBusName}'...`,
    );

    try {
      const client = await this.getEventBridgeClient(config);
      const command = new RemoveTargetsCommand({
        Rule: parameters.rule,
        EventBusName: eventBusName,
        Ids: parameters.ids,
        Force: parameters.force,
      } as RemoveTargetsRequest);

      const response = await client.send(command);

      const successCount =
        (response.FailedEntryCount || 0) === 0
          ? parameters.ids.length
          : parameters.ids.length - (response.FailedEntryCount || 0);

      if (response.FailedEntryCount && response.FailedEntryCount > 0) {
        spinner.warn(`${successCount}/${parameters.ids.length} targets removed successfully`);
      } else {
        spinner.succeed(`All ${parameters.ids.length} targets removed successfully`);
      }

      return response;
    } catch (error) {
      spinner.fail(`Failed to remove targets from rule '${parameters.rule}'`);
      throw new ServiceError(
        `Failed to remove targets from rule '${parameters.rule}': ${error instanceof Error ? error.message : String(error)}`,
        "EventBridge",
        "remove-targets",
        error,
        { ruleName: parameters.rule, eventBusName, targetIds: parameters.ids },
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
      console.debug("Cleared EventBridge client caches");
    }
  }
}
