/**
 * @module ssm/ssm-service
 * SSM service for Systems Manager operations
 *
 * Orchestrates AWS Systems Manager operations by providing a unified interface for
 * session management, parameter store, instance discovery, and document operations.
 * Integrates with existing credential management for AWS SDK client creation.
 */

import {
  DescribeSessionsCommand,
  SSMClient,
  StartSessionCommand,
  TerminateSessionCommand,
  type DescribeSessionsCommandOutput,
  type SessionFilter,
  type StartSessionCommandOutput,
  type TerminateSessionCommandOutput,
} from "@aws-sdk/client-ssm";
import { BaseAwsService, type BaseServiceOptions } from "../../lib/base-aws-service.js";
import { retryWithBackoff } from "../../lib/retry.js";
import { SSMSessionError } from "../../lib/ssm/ssm-errors.js";
import type { AwsClientConfig } from "../credential-service.js";

/**
 * Configuration options for SSM service
 *
 * @public
 */
export type SSMServiceOptions = BaseServiceOptions;

/**
 * Parameters for starting an SSM session
 *
 * @public
 */
export interface SSMStartSessionParameters {
  instanceId: string;
  documentName?: string;
  reason?: string;
}

/**
 * Parameters for describing SSM sessions
 *
 * @public
 */
export interface SSMDescribeSessionsParameters {
  state?: "Active" | "History";
  maxResults?: number;
  nextToken?: string;
  filters?: SessionFilter[];
}

/**
 * SSM service for Systems Manager operations
 *
 * Provides a unified interface for all SSM operations,
 * coordinating with credential management and providing error handling.
 *
 * @public
 */
export class SSMService extends BaseAwsService<SSMClient> {
  /**
   * Create a new SSM service instance
   *
   * @param options - Configuration options for the service
   */
  constructor(options: SSMServiceOptions = {}) {
    super(SSMClient, options);
  }

  /**
   * Start an SSM Session Manager session
   *
   * @param config - AWS client configuration
   * @param parameters - Session start parameters
   * @returns Session information including session ID and stream URL
   */
  async startSession(
    config: AwsClientConfig,
    parameters: SSMStartSessionParameters,
  ): Promise<StartSessionCommandOutput> {
    const { instanceId, documentName = "SSM-SessionManagerRunShell", reason } = parameters;
    const spinner = this.createSpinner(`Starting Session Manager session on ${instanceId}...`);

    try {
      const client = await this.getClient(config);
      const command = new StartSessionCommand({
        Target: instanceId,
        DocumentName: documentName,
        Reason: reason,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying session start (attempt ${attempt})...`;
        },
      });

      spinner.succeed(`Session started: ${response.SessionId}`);
      return response;
    } catch (error) {
      spinner.fail("Failed to start session");
      throw new SSMSessionError(
        `Failed to start SSM session on ${instanceId}: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        instanceId,
        "start-session",
        error,
      );
    }
  }

  /**
   * Terminate an active SSM session
   *
   * @param config - AWS client configuration
   * @param sessionId - ID of the session to terminate
   * @returns Session termination result
   */
  async terminateSession(
    config: AwsClientConfig,
    sessionId: string,
  ): Promise<TerminateSessionCommandOutput> {
    const spinner = this.createSpinner(`Terminating session ${sessionId}...`);

    try {
      const client = await this.getClient(config);
      const command = new TerminateSessionCommand({
        SessionId: sessionId,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying session termination (attempt ${attempt})...`;
        },
      });

      spinner.succeed("Session terminated successfully");
      return response;
    } catch (error) {
      spinner.fail("Failed to terminate session");
      throw new SSMSessionError(
        `Failed to terminate SSM session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
        sessionId,
        undefined,
        "terminate-session",
        error,
      );
    }
  }

  /**
   * Describe SSM sessions
   *
   * @param config - AWS client configuration
   * @param parameters - Session description parameters
   * @returns Session information list
   */
  async describeSessions(
    config: AwsClientConfig,
    parameters: SSMDescribeSessionsParameters = {},
  ): Promise<DescribeSessionsCommandOutput> {
    const { state = "Active", maxResults, nextToken, filters } = parameters;
    const spinner = this.createSpinner(`Describing ${state.toLowerCase()} sessions...`);

    try {
      const client = await this.getClient(config);
      const command = new DescribeSessionsCommand({
        State: state,
        MaxResults: maxResults,
        NextToken: nextToken,
        Filters: filters,
      });

      const response = await retryWithBackoff(() => client.send(command), {
        maxAttempts: 3,
        onRetry: (error, attempt) => {
          spinner.text = `Retrying describe sessions (attempt ${attempt})...`;
        },
      });

      const sessionCount = response.Sessions?.length || 0;
      const sessionPlural = sessionCount === 1 ? "" : "s";
      spinner.succeed(`Found ${sessionCount} session${sessionPlural}`);
      return response;
    } catch (error) {
      spinner.fail("Failed to describe sessions");
      throw new SSMSessionError(
        `Failed to describe SSM sessions: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        undefined,
        "describe-sessions",
        error,
      );
    }
  }
}
