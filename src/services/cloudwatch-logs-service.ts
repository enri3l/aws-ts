/**
 * CloudWatch Logs service for high-level log operations
 *
 * Orchestrates CloudWatch Logs operations by providing a unified interface for
 * log group management, real-time streaming, queries, and analytics. Integrates with
 * existing credential management for AWS SDK client creation.
 *
 */

import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  DescribeLogStreamsCommand,
  FilterLogEventsCommand,
  GetQueryResultsCommand,
  StartLiveTailCommand,
  StartQueryCommand,
  StopQueryCommand,
  type FilteredLogEvent,
  type GetQueryResultsCommandOutput,
  type LiveTailSessionLogEvent,
  type LiveTailSessionStart,
  type LiveTailSessionUpdate,
  type LogGroup,
  type LogStream,
  type QueryStatus,
  type ResultField,
  type StartLiveTailCommandOutput,
  type StartLiveTailResponseStream,
} from "@aws-sdk/client-cloudwatch-logs";
import ora from "ora";
import type {
  LogMetricDataPoint,
  LogMetricsResult,
  LogPattern,
  MetricSummary,
  PatternAnalysisResult,
  PatternAnomaly,
  PatternWithStats,
  TrendAnalysis,
} from "../lib/cloudwatch-logs-analytics-schemas.js";
import {
  CloudWatchLogsError,
  FilterError,
  LogGroupError,
  LogStreamError,
  QueryError,
  StreamingError,
} from "../lib/cloudwatch-logs-errors.js";
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
 * Configuration options for CloudWatch Logs service
 *
 * @public
 */
export interface CloudWatchLogsServiceOptions {
  /**
   * Credential service configuration
   */
  credentialService?: {
    defaultRegion?: string;
    defaultProfile?: string;
    enableDebugLogging?: boolean;
  };

  /**
   * Enable debug logging for CloudWatch Logs operations
   */
  enableDebugLogging?: boolean;

  /**
   * Enable progress indicators for long-running operations
   */
  enableProgressIndicators?: boolean;

  /**
   * CloudWatch Logs client configuration overrides
   */
  clientConfig?: {
    region?: string;
    profile?: string;
    endpoint?: string;
  };
}

/**
 * Log group description with enhanced metadata
 *
 * @public
 */
export interface LogGroupDescription {
  logGroupName: string;
  logGroupArn?: string;
  creationTime?: Date;
  retentionInDays?: number;
  metricFilterCount?: number;
  arn?: string;
  storedBytes?: number;
  logStreams?: LogStreamInfo[];
  kmsKeyId?: string;
  dataProtectionStatus?: string;
}

/**
 * Log stream information
 *
 * @public
 */
export interface LogStreamInfo {
  logStreamName: string;
  creationTime?: Date;
  firstEventTime?: Date;
  lastEventTime?: Date;
  lastIngestionTime?: Date;
  uploadSequenceToken?: string;
  arn?: string;
  storedBytes?: number;
}

/**
 * Log event with enhanced information
 *
 * @public
 */
export interface LogEvent {
  timestamp: number;
  message: string;
  logStreamName?: string;
  eventId?: string;
}

/**
 * Query execution parameters
 *
 * @public
 */
export interface QueryParameters {
  logGroupNames: string[];
  query: string;
  startTime: Date;
  endTime: Date;
  limit?: number;
  queryLanguage?: "CloudWatchLogsInsights" | "OpenSearchPPL" | "OpenSearchSQL";
}

/**
 * Query execution result
 *
 * @public
 */
export interface QueryResult {
  queryId: string;
  status: QueryStatus;
  results?: Array<Array<{ field?: string; value?: string }>>;
  statistics?: {
    recordsMatched?: number;
    recordsScanned?: number;
    bytesScanned?: number;
  };
  encryptionKey?: string;
}

/**
 * Filter events parameters
 *
 * @public
 */
export interface FilterEventsParameters {
  logGroupName: string;
  logStreamNames?: string[];
  filterPattern?: string;
  startTime?: Date;
  endTime?: Date;
  nextToken?: string;
  limit?: number;
  interleaved?: boolean;
}

/**
 * Filter events result
 *
 * @public
 */
export interface FilterEventsResult {
  events: LogEvent[];
  nextToken?: string;
  searchedLogStreams?: Array<{
    logStreamName?: string;
    searchedCompletely?: boolean;
  }>;
}

/**
 * Live tail parameters for real-time streaming
 *
 * @public
 */
export interface LiveTailParameters {
  logGroupIdentifiers: string[];
  logStreamNames?: string[];
  logStreamNamePrefixes?: string[];
  logEventFilterPattern?: string;
}

/**
 * Live tail session information
 *
 * @public
 */
export interface LiveTailSession {
  sessionId: string;
  logGroupIdentifiers: string[];
  logStreamNames?: string[];
  logEventFilterPattern?: string;
  startTime: Date;
}

/**
 * Paginated result for list operations
 *
 * @public
 */
export interface PaginatedResult<T> {
  items: T[];
  nextToken?: string;
  count: number;
}

/**
 * CloudWatch Logs service for high-level log operations
 *
 * Provides a unified interface for all CloudWatch Logs operations,
 * coordinating with credential management and providing error handling.
 *
 * @public
 */
export class CloudWatchLogsService {
  private readonly credentialService: CredentialService;
  private readonly options: CloudWatchLogsServiceOptions;
  private clientCache = new Map<string, CloudWatchLogsClient>();

  /**
   * Create a new CloudWatch Logs service instance
   *
   * @param options - Configuration options for the service
   */
  constructor(options: CloudWatchLogsServiceOptions = {}) {
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
   * Get CloudWatch Logs client with caching
   *
   * @param config - Client configuration options
   * @returns CloudWatch Logs client instance
   * @internal
   */
  private async getCloudWatchLogsClient(
    config: AwsClientConfig = {},
  ): Promise<CloudWatchLogsClient> {
    const cacheKey = `${config.region || "default"}-${config.profile || "default"}`;

    if (!this.clientCache.has(cacheKey)) {
      const clientConfig = {
        ...config,
        ...this.options.clientConfig,
      };

      const client = await this.credentialService.createClient(CloudWatchLogsClient, clientConfig);
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
   * List CloudWatch log groups
   *
   * @param config - Client configuration options
   * @param prefix - Log group name prefix filter
   * @param limit - Maximum number of log groups to return
   * @param nextToken - Pagination token for next page
   * @returns Promise resolving to paginated log groups
   * @throws When log group listing fails
   */
  async listLogGroups(
    config: AwsClientConfig = {},
    prefix?: string,
    limit?: number,
    nextToken?: string,
  ): Promise<PaginatedResult<LogGroupDescription>> {
    const spinner = this.createSpinner("Listing CloudWatch log groups...");

    try {
      const client = await this.getCloudWatchLogsClient(config);

      const command = new DescribeLogGroupsCommand({
        logGroupNamePrefix: prefix,
        limit,
        nextToken,
      });

      const response = await client.send(command);
      const logGroups = response.logGroups || [];

      const descriptions: LogGroupDescription[] = logGroups.map((group: LogGroup) => {
        const description: LogGroupDescription = {
          logGroupName: group.logGroupName!,
        };

        if (group.arn) description.logGroupArn = group.arn;
        if (group.creationTime) description.creationTime = new Date(group.creationTime);
        if (group.retentionInDays !== undefined)
          description.retentionInDays = group.retentionInDays;
        if (group.metricFilterCount !== undefined)
          description.metricFilterCount = group.metricFilterCount;
        if (group.arn) description.arn = group.arn;
        if (group.storedBytes !== undefined) description.storedBytes = group.storedBytes;
        if (group.kmsKeyId) description.kmsKeyId = group.kmsKeyId;
        if (group.dataProtectionStatus)
          description.dataProtectionStatus = group.dataProtectionStatus;

        return description;
      });

      spinner.succeed(`Found ${descriptions.length} log groups`);
      const result: PaginatedResult<LogGroupDescription> = {
        items: descriptions,
        count: descriptions.length,
      };

      if (response.nextToken) {
        result.nextToken = response.nextToken;
      }

      return result;
    } catch (error) {
      spinner.fail("Failed to list log groups");
      throw new LogGroupError(
        `Failed to list log groups: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        "list-groups",
        undefined,
        { prefix, error },
      );
    }
  }

  /**
   * Describe a specific CloudWatch log group
   *
   * @param logGroupName - Name of the log group to describe
   * @param config - Client configuration options
   * @param includeLogStreams - Whether to include log streams information
   * @returns Promise resolving to detailed log group description
   * @throws When log group description fails
   */
  async describeLogGroup(
    logGroupName: string,
    config: AwsClientConfig = {},
    includeLogStreams = false,
  ): Promise<LogGroupDescription> {
    const spinner = this.createSpinner(`Describing log group '${logGroupName}'...`);

    try {
      const client = await this.getCloudWatchLogsClient(config);

      // Get log group details
      const groupCommand = new DescribeLogGroupsCommand({
        logGroupNamePrefix: logGroupName,
        limit: 1,
      });

      const groupResponse = await client.send(groupCommand);
      const logGroup = groupResponse.logGroups?.find(
        (group) => group.logGroupName === logGroupName,
      );

      if (!logGroup) {
        throw new LogGroupError(
          `Log group '${logGroupName}' not found`,
          logGroupName,
          "describe-group",
        );
      }

      const description: LogGroupDescription = {
        logGroupName: logGroup.logGroupName!,
      };

      if (logGroup.arn) description.logGroupArn = logGroup.arn;
      if (logGroup.creationTime) description.creationTime = new Date(logGroup.creationTime);
      if (logGroup.retentionInDays !== undefined)
        description.retentionInDays = logGroup.retentionInDays;
      if (logGroup.metricFilterCount !== undefined)
        description.metricFilterCount = logGroup.metricFilterCount;
      if (logGroup.arn) description.arn = logGroup.arn;
      if (logGroup.storedBytes !== undefined) description.storedBytes = logGroup.storedBytes;
      if (logGroup.kmsKeyId) description.kmsKeyId = logGroup.kmsKeyId;
      if (logGroup.dataProtectionStatus)
        description.dataProtectionStatus = logGroup.dataProtectionStatus;

      // Optionally include log streams
      if (includeLogStreams) {
        const streamsCommand = new DescribeLogStreamsCommand({
          logGroupName,
          limit: 50, // Limit to first 50 streams
        });

        const streamsResponse = await client.send(streamsCommand);
        description.logStreams =
          streamsResponse.logStreams?.map((stream: LogStream) => {
            const streamInfo: LogStreamInfo = {
              logStreamName: stream.logStreamName!,
            };

            if (stream.creationTime) streamInfo.creationTime = new Date(stream.creationTime);
            // Note: firstEventTime and lastEventTime may not be available on LogStream type
            // if (stream.firstEventTime) streamInfo.firstEventTime = new Date(stream.firstEventTime);
            // if (stream.lastEventTime) streamInfo.lastEventTime = new Date(stream.lastEventTime);
            if (stream.lastIngestionTime)
              streamInfo.lastIngestionTime = new Date(stream.lastIngestionTime);
            if (stream.uploadSequenceToken)
              streamInfo.uploadSequenceToken = stream.uploadSequenceToken;
            if (stream.arn) streamInfo.arn = stream.arn;
            // Note: storedBytes field is deprecated and omitted

            return streamInfo;
          }) || [];
      }

      spinner.succeed(`Retrieved description for log group '${logGroupName}'`);
      return description;
    } catch (error) {
      spinner.fail(`Failed to describe log group '${logGroupName}'`);
      if (error instanceof LogGroupError) {
        throw error;
      }
      throw new LogGroupError(
        `Failed to describe log group '${logGroupName}': ${error instanceof Error ? error.message : String(error)}`,
        logGroupName,
        "describe-group",
        undefined,
        { error },
      );
    }
  }

  /**
   * Execute a CloudWatch Logs Insights query
   *
   * @param parameters - Query parameters including log groups and query string
   * @param config - Client configuration options
   * @returns Promise resolving to query execution result
   * @throws When query execution fails
   */
  async executeQuery(
    parameters: QueryParameters,
    config: AwsClientConfig = {},
  ): Promise<QueryResult> {
    const spinner = this.createSpinner("Executing CloudWatch Logs Insights query...");

    try {
      const client = await this.getCloudWatchLogsClient(config);
      const queryId = await this.startQuery(client, parameters);
      return await this.pollQueryForResults(client, queryId, parameters, spinner);
    } catch (error) {
      return this.handleQueryExecutionError(error, parameters, spinner);
    }
  }

  /**
   * Start a CloudWatch Logs Insights query
   *
   * @param client - CloudWatch Logs client
   * @param parameters - Query parameters
   * @returns Promise resolving to query ID
   * @throws When query start fails
   * @internal
   */
  private async startQuery(
    client: CloudWatchLogsClient,
    parameters: QueryParameters,
  ): Promise<string> {
    const startCommand = new StartQueryCommand({
      logGroupNames: parameters.logGroupNames,
      startTime: Math.floor(parameters.startTime.getTime() / 1000),
      endTime: Math.floor(parameters.endTime.getTime() / 1000),
      queryString: parameters.query,
      limit: parameters.limit,
    });

    const startResponse = await client.send(startCommand);
    return startResponse.queryId!;
  }

  /**
   * Poll query for results until completion
   *
   * @param client - CloudWatch Logs client
   * @param queryId - Query ID to poll
   * @param parameters - Query parameters for error handling
   * @param spinner - Progress spinner
   * @returns Promise resolving to query result
   * @throws When query fails or times out
   * @internal
   */
  private async pollQueryForResults(
    client: CloudWatchLogsClient,
    queryId: string,
    parameters: QueryParameters,
    spinner: SpinnerInterface,
  ): Promise<QueryResult> {
    let status: QueryStatus = "Running";
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes with 5-second intervals

    spinner.text = `Query started (${queryId}), waiting for results...`;

    while (status === "Running" && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait 5 seconds
      attempts++;

      const resultCommand = new GetQueryResultsCommand({ queryId });
      const resultResponse = await client.send(resultCommand);
      status = resultResponse.status!;

      if (status === "Complete") {
        return this.processQueryResults(queryId, resultResponse, spinner);
      }

      if (status === "Failed" || status === "Cancelled") {
        throw new QueryError(
          `Query failed with status: ${status}`,
          parameters.query,
          parameters.logGroupNames,
          parameters.queryLanguage,
          parameters.startTime,
          parameters.endTime,
        );
      }

      spinner.text = `Query running... (${attempts}/${maxAttempts})`;
    }

    return this.handleQueryTimeout(client, queryId, parameters);
  }

  /**
   * Process successful query results
   *
   * @param queryId - Query ID
   * @param resultResponse - Query result response
   * @param spinner - Progress spinner
   * @returns Processed query result
   * @internal
   */
  private processQueryResults(
    queryId: string,
    resultResponse: GetQueryResultsCommandOutput,
    spinner: SpinnerInterface,
  ): QueryResult {
    const result: QueryResult = {
      queryId,
      status: "Complete",
    };

    if (resultResponse.results) {
      result.results = resultResponse.results.map((row) =>
        row.map((field: ResultField) => {
          const resultField: { field?: string; value?: string } = {};
          if (field.field !== undefined) resultField.field = field.field;
          if (field.value !== undefined) resultField.value = field.value;
          return resultField;
        }),
      );
    }

    if (resultResponse.statistics) {
      const stats: {
        recordsMatched?: number;
        recordsScanned?: number;
        bytesScanned?: number;
      } = {};
      if (resultResponse.statistics.recordsMatched !== undefined)
        stats.recordsMatched = resultResponse.statistics.recordsMatched;
      if (resultResponse.statistics.recordsScanned !== undefined)
        stats.recordsScanned = resultResponse.statistics.recordsScanned;
      if (resultResponse.statistics.bytesScanned !== undefined)
        stats.bytesScanned = resultResponse.statistics.bytesScanned;
      result.statistics = stats;
    }

    if (resultResponse.encryptionKey) {
      result.encryptionKey = resultResponse.encryptionKey;
    }

    const resultCount = resultResponse.results?.length || 0;
    spinner.succeed(`Query completed: ${resultCount} results returned`);
    return result;
  }

  /**
   * Handle query timeout by stopping query and throwing error
   *
   * @param client - CloudWatch Logs client
   * @param queryId - Query ID to stop
   * @param parameters - Query parameters for error
   * @returns Never returns, always throws
   * @throws Query timeout error
   * @internal
   */
  private async handleQueryTimeout(
    client: CloudWatchLogsClient,
    queryId: string,
    parameters: QueryParameters,
  ): Promise<never> {
    try {
      await client.send(new StopQueryCommand({ queryId }));
    } catch {
      // Ignore stop query errors
    }
    throw new QueryError(
      "Query execution timed out",
      parameters.query,
      parameters.logGroupNames,
      parameters.queryLanguage,
      parameters.startTime,
      parameters.endTime,
    );
  }

  /**
   * Handle query execution errors
   *
   * @param error - The error that occurred
   * @param parameters - Query parameters for error context
   * @param spinner - Progress spinner to update
   * @throws Query error
   * @internal
   */
  private handleQueryExecutionError(
    error: unknown,
    parameters: QueryParameters,
    spinner: SpinnerInterface,
  ): never {
    spinner.fail("Query execution failed");
    if (error instanceof QueryError) {
      throw error;
    }
    throw new QueryError(
      `Failed to execute query: ${error instanceof Error ? error.message : String(error)}`,
      parameters.query,
      parameters.logGroupNames,
      parameters.queryLanguage,
      parameters.startTime,
      parameters.endTime,
      error,
    );
  }

  /**
   * Filter log events from a log group
   *
   * @param parameters - Filter parameters including log group and filter pattern
   * @param config - Client configuration options
   * @returns Promise resolving to filtered log events
   * @throws When filter operation fails
   */
  async filterLogEvents(
    parameters: FilterEventsParameters,
    config: AwsClientConfig = {},
  ): Promise<FilterEventsResult> {
    const spinner = this.createSpinner(
      `Filtering events from log group '${parameters.logGroupName}'...`,
    );

    try {
      const client = await this.getCloudWatchLogsClient(config);

      const command = new FilterLogEventsCommand({
        logGroupName: parameters.logGroupName,
        logStreamNames: parameters.logStreamNames,
        filterPattern: parameters.filterPattern,
        startTime: parameters.startTime
          ? Math.floor(parameters.startTime.getTime() / 1000)
          : undefined,
        endTime: parameters.endTime ? Math.floor(parameters.endTime.getTime() / 1000) : undefined,
        nextToken: parameters.nextToken,
        limit: parameters.limit,
        interleaved: parameters.interleaved,
      });

      const response = await client.send(command);

      const events: LogEvent[] = (response.events || []).map((event: FilteredLogEvent) => {
        const logEvent: LogEvent = {
          timestamp: event.timestamp!,
          message: event.message!,
        };

        if (event.logStreamName) logEvent.logStreamName = event.logStreamName;
        if (event.eventId) logEvent.eventId = event.eventId;

        return logEvent;
      });

      const result: FilterEventsResult = {
        events,
      };

      if (response.nextToken) {
        result.nextToken = response.nextToken;
      }

      if (response.searchedLogStreams) {
        result.searchedLogStreams = response.searchedLogStreams.map((stream) => {
          const searchedStream: { logStreamName?: string; searchedCompletely?: boolean } = {};
          if (stream.logStreamName !== undefined)
            searchedStream.logStreamName = stream.logStreamName;
          if (stream.searchedCompletely !== undefined)
            searchedStream.searchedCompletely = stream.searchedCompletely;
          return searchedStream;
        });
      }

      spinner.succeed(`Filtered ${events.length} events`);
      return result;
    } catch (error) {
      spinner.fail(`Failed to filter events from log group '${parameters.logGroupName}'`);
      throw new FilterError(
        `Failed to filter events: ${error instanceof Error ? error.message : String(error)}`,
        parameters.filterPattern,
        parameters.logGroupName,
        "filter-events",
        parameters.startTime,
        parameters.endTime,
        { error },
      );
    }
  }

  /**
   * Start a live tail session for real-time log streaming
   *
   * @param logGroupNames - Array of log group names to tail
   * @param config - Client configuration options
   * @param options - Live tail options including filters and time range
   * @param callbacks - Event handling callbacks
   * @returns Promise resolving when streaming is complete or interrupted
   * @throws When live tail session fails to start
   */
  async startLiveTail(
    logGroupNames: string[],
    config: AwsClientConfig = {},
    options: {
      filterPattern?: string;
      startTime?: Date;
      logStreamNames?: string[];
      logStreamNamePrefix?: string;
    } = {},
    callbacks: {
      outputFile?: string;
      noColor?: boolean;
      showTimestamp?: boolean;
      showLogStream?: boolean;
      verbose?: boolean;
      onEvent?: (event: LiveTailSessionLogEvent) => void;
      onError?: (error: Error) => void;
      onClose?: () => void;
    } = {},
  ): Promise<void> {
    const spinner = this.createSpinner("Starting live tail session...");

    try {
      const client = await this.getCloudWatchLogsClient(config);
      const response = await this.initializeLiveTailStream(client, logGroupNames, options);

      spinner.succeed("Live tail session started");
      if (response.responseStream) {
        await this.processLiveTailStream(response.responseStream, callbacks);
      } else {
        throw new Error("No response stream received from live tail session");
      }
    } catch (error) {
      this.handleLiveTailError(error, logGroupNames, callbacks, spinner);
    }
  }

  /**
   * Initialize live tail stream
   *
   * @param client - CloudWatch Logs client
   * @param logGroupNames - Log group names to tail
   * @param options - Live tail options
   * @returns Live tail response
   * @throws When stream initialization fails
   * @internal
   */
  private async initializeLiveTailStream(
    client: CloudWatchLogsClient,
    logGroupNames: string[],
    options: {
      filterPattern?: string;
      logStreamNames?: string[];
      logStreamNamePrefix?: string;
    },
  ): Promise<StartLiveTailCommandOutput> {
    const command = new StartLiveTailCommand({
      logGroupIdentifiers: logGroupNames,
      logStreamNames: options.logStreamNames,
      ...(options.logStreamNamePrefix && {
        logStreamNamePrefixes: [options.logStreamNamePrefix],
      }),
      logEventFilterPattern: options.filterPattern,
    });

    const response = await client.send(command);

    if (!response.responseStream) {
      throw new StreamingError(
        "Failed to establish live tail stream",
        "start-live-tail",
        logGroupNames,
      );
    }

    return response;
  }

  /**
   * Process live tail stream chunks
   *
   * @param responseStream - Live tail response stream
   * @param callbacks - Event callbacks
   * @returns Promise that resolves when stream ends
   * @throws When stream processing fails
   * @internal
   */
  private async processLiveTailStream(
    responseStream: AsyncIterable<StartLiveTailResponseStream>,
    callbacks: {
      verbose?: boolean;
      onEvent?: (event: LiveTailSessionLogEvent) => void;
      onError?: (error: Error) => void;
      onClose?: () => void;
    },
  ): Promise<void> {
    try {
      // Check if responseStream is async iterable
      if (Symbol.asyncIterator in responseStream) {
        for await (const chunk of responseStream as AsyncIterable<unknown>) {
          this.handleLiveTailChunk(
            chunk as {
              sessionStart?: LiveTailSessionStart;
              sessionUpdate?: LiveTailSessionUpdate;
              sessionStop?: unknown;
            },
            callbacks,
          );

          if (chunk && typeof chunk === "object" && "sessionStop" in chunk) {
            break;
          }
        }
      } else {
        throw new Error("Response stream is not async iterable");
      }
    } catch (streamError) {
      if (callbacks.onError) {
        callbacks.onError(
          streamError instanceof Error ? streamError : new Error(String(streamError)),
        );
      }
      throw streamError;
    } finally {
      if (callbacks.onClose) {
        callbacks.onClose();
      }
    }
  }

  /**
   * Handle individual live tail chunk
   *
   * @param chunk - Stream chunk to process
   * @param callbacks - Event callbacks
   * @internal
   */
  private handleLiveTailChunk(
    chunk: {
      sessionStart?: LiveTailSessionStart;
      sessionUpdate?: LiveTailSessionUpdate;
      sessionStop?: unknown;
    },
    callbacks: {
      verbose?: boolean;
      onEvent?: (event: LiveTailSessionLogEvent) => void;
    },
  ): void {
    if (chunk.sessionStart) {
      this.handleSessionStart(chunk.sessionStart, callbacks.verbose);
    } else if (chunk.sessionUpdate && "logEvents" in chunk.sessionUpdate) {
      this.handleSessionUpdate(chunk.sessionUpdate, callbacks);
    } else if ("sessionStop" in chunk && callbacks.verbose) {
      this.handleSessionStop(chunk.sessionStop);
    }
  }

  /**
   * Handle live tail session start
   *
   * @param sessionStart - Session start information
   * @param verbose - Whether to log verbose information
   * @internal
   */
  private handleSessionStart(sessionStart: LiveTailSessionStart, verbose?: boolean): void {
    if (verbose) {
      console.log(`Live tail session started: ${sessionStart.sessionId}`);
    }
  }

  /**
   * Handle live tail session update with log events
   *
   * @param sessionUpdate - Session update information
   * @param callbacks - Event callbacks
   * @internal
   */
  private handleSessionUpdate(
    sessionUpdate: LiveTailSessionUpdate,
    callbacks: {
      onEvent?: (event: LiveTailSessionLogEvent) => void;
    },
  ): void {
    const logEvents = "logEvents" in sessionUpdate ? sessionUpdate.logEvents : [];
    for (const event of (logEvents || []) as LiveTailSessionLogEvent[]) {
      if (callbacks.onEvent && event.timestamp && event.message) {
        callbacks.onEvent({
          timestamp: event.timestamp,
          message: event.message,
          logStreamName: event.logStreamName,
        });
      }
    }
  }

  /**
   * Handle live tail session stop
   *
   * @param sessionStop - Session stop information
   * @internal
   */
  private handleSessionStop(sessionStop: unknown): void {
    console.log(`Live tail session stopped: ${String(sessionStop)}`);
  }

  /**
   * Handle live tail errors
   *
   * @param error - The error that occurred
   * @param logGroupNames - Log group names for error context
   * @param callbacks - Event callbacks
   * @param spinner - Progress spinner
   * @throws Live tail error
   * @internal
   */
  private handleLiveTailError(
    error: unknown,
    logGroupNames: string[],
    callbacks: {
      onError?: (error: Error) => void;
    },
    spinner: SpinnerInterface,
  ): never {
    spinner.fail("Failed to start live tail session");
    if (callbacks.onError) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
    throw new StreamingError(
      `Failed to start live tail session: ${error instanceof Error ? error.message : String(error)}`,
      "start-live-tail",
      logGroupNames,
      undefined,
      undefined,
      error,
    );
  }

  /**
   * Follow specific log streams with pattern matching and auto-reconnect
   *
   * @param logGroupName - Log group name to follow
   * @param config - Client configuration options
   * @param streamOptions - Stream pattern and filtering options
   * @param callbacks - Event handling callbacks for streaming
   * @returns Promise resolving when following is complete or interrupted
   * @throws When stream following fails to start
   */
  async followLogStreams(
    logGroupName: string,
    config: AwsClientConfig = {},
    streamOptions: {
      streamPattern?: string;
      useRegex?: boolean;
      filterPattern?: string;
      startTime?: Date;
      followNewStreams?: boolean;
    } = {},
    callbacks: {
      exportFile?: string;
      maxReconnects?: number;
      reconnectDelay?: number;
      bufferSize?: number;
      flushInterval?: number;
      noColor?: boolean;
      showTimestamp?: boolean;
      showStreamName?: boolean;
      verbose?: boolean;
      onEvent?: (event: FilteredLogEvent, streamName: string) => void;
      onStreamConnect?: (streamName: string) => void;
      onStreamDisconnect?: (streamName: string, reason: string) => void;
      onReconnect?: (streamName: string, attempt: number) => void;
      onError?: (error: Error, streamName?: string) => void;
    } = {},
  ): Promise<void> {
    const spinner = this.createSpinner(`Following log streams in group '${logGroupName}'...`);

    try {
      const client = await this.getCloudWatchLogsClient(config);
      const targetStreams = await this.discoverAndFilterLogStreams(
        client,
        logGroupName,
        streamOptions,
      );

      spinner.succeed(`Found ${targetStreams.length} streams to follow`);
      await this.followMultipleStreams(
        logGroupName,
        targetStreams,
        config,
        streamOptions,
        callbacks,
      );
    } catch (error) {
      this.handleFollowStreamsError(error, logGroupName, callbacks, spinner);
    }
  }

  /**
   * Discover and filter log streams based on pattern
   *
   * @param client - CloudWatch Logs client
   * @param logGroupName - Log group name
   * @param streamOptions - Stream filtering options
   * @returns Promise resolving to filtered log streams
   * @throws When stream discovery fails
   * @internal
   */
  private async discoverAndFilterLogStreams(
    client: CloudWatchLogsClient,
    logGroupName: string,
    streamOptions: {
      streamPattern?: string;
      useRegex?: boolean;
    },
  ): Promise<LogStream[]> {
    const streamsCommand = new DescribeLogStreamsCommand({
      logGroupName,
      orderBy: "LastEventTime",
      descending: true,
      limit: 50,
    });

    const streamsResponse = await client.send(streamsCommand);
    let targetStreams = streamsResponse.logStreams || [];

    // Filter streams by pattern if provided
    if (streamOptions.streamPattern) {
      targetStreams = this.filterStreamsByPattern(targetStreams, streamOptions);
    }

    if (targetStreams.length === 0) {
      throw new LogStreamError(
        `No log streams found matching pattern '${streamOptions.streamPattern || "*"}'`,
        logGroupName,
        streamOptions.streamPattern,
        "follow-streams",
      );
    }

    return targetStreams;
  }

  /**
   * Filter log streams by pattern
   *
   * @param streams - Log streams to filter
   * @param streamOptions - Stream filtering options
   * @returns Filtered log streams
   * @internal
   */
  private filterStreamsByPattern(
    streams: LogStream[],
    streamOptions: {
      streamPattern?: string;
      useRegex?: boolean;
    },
  ): LogStream[] {
    if (!streamOptions.streamPattern) {
      return streams;
    }

    if (streamOptions.useRegex) {
      const regex = new RegExp(streamOptions.streamPattern);
      return streams.filter((stream) => stream.logStreamName && regex.test(stream.logStreamName));
    } else {
      // Use glob-like pattern matching (basic implementation)
      const pattern = streamOptions.streamPattern.replaceAll("*", ".*").replaceAll("?", ".");
      const regex = new RegExp(`^${pattern}$`);
      return streams.filter((stream) => stream.logStreamName && regex.test(stream.logStreamName));
    }
  }

  /**
   * Follow multiple streams concurrently
   *
   * @param logGroupName - Log group name
   * @param targetStreams - Streams to follow
   * @param config - Client configuration
   * @param streamOptions - Stream filtering options
   * @param callbacks - Event handling callbacks
   * @returns Promise resolving when all streams complete
   * @internal
   */
  private async followMultipleStreams(
    logGroupName: string,
    targetStreams: LogStream[],
    config: AwsClientConfig,
    streamOptions: {
      filterPattern?: string;
      startTime?: Date;
    },
    callbacks: {
      maxReconnects?: number;
      reconnectDelay?: number;
      onEvent?: (event: FilteredLogEvent, streamName: string) => void;
      onStreamConnect?: (streamName: string) => void;
      onStreamDisconnect?: (streamName: string, reason: string) => void;
      onReconnect?: (streamName: string, attempt: number) => void;
      onError?: (error: Error, streamName?: string) => void;
    },
  ): Promise<void> {
    // Start following each stream with FilterLogEvents
    const followPromises = targetStreams.map((stream) =>
      this.followSingleStream(
        logGroupName,
        stream.logStreamName ?? "",
        config,
        streamOptions,
        callbacks,
      ),
    );

    // Wait for all streams to complete or fail
    await Promise.allSettled(followPromises);
  }

  /**
   * Handle follow streams errors
   *
   * @param error - The error that occurred
   * @param logGroupName - Log group name for error context
   * @param callbacks - Event callbacks
   * @param spinner - Progress spinner
   * @throws Follow streams error
   * @internal
   */
  private handleFollowStreamsError(
    error: unknown,
    logGroupName: string,
    callbacks: {
      onError?: (error: Error, streamName?: string) => void;
    },
    spinner: SpinnerInterface,
  ): never {
    spinner.fail(`Failed to follow streams in log group '${logGroupName}'`);
    if (callbacks.onError) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
    throw new StreamingError(
      `Failed to follow log streams: ${error instanceof Error ? error.message : String(error)}`,
      "follow-streams",
      [logGroupName],
      undefined,
      undefined,
      error,
    );
  }

  /**
   * Follow a single log stream with reconnection logic
   *
   * @param logGroupName - Log group name
   * @param logStreamName - Log stream name to follow
   * @param config - Client configuration
   * @param streamOptions - Stream filtering options
   * @param callbacks - Event handling callbacks
   * @returns Promise resolving when stream following is complete
   * @internal
   */
  private async followSingleStream(
    logGroupName: string,
    logStreamName: string,
    config: AwsClientConfig,
    streamOptions: {
      filterPattern?: string;
      startTime?: Date;
    },
    callbacks: {
      maxReconnects?: number;
      reconnectDelay?: number;
      onEvent?: (event: FilteredLogEvent, streamName: string) => void;
      onStreamConnect?: (streamName: string) => void;
      onStreamDisconnect?: (streamName: string, reason: string) => void;
      onReconnect?: (streamName: string, attempt: number) => void;
      onError?: (error: Error, streamName?: string) => void;
    },
  ): Promise<void> {
    const maxReconnects = callbacks.maxReconnects || 5;
    const reconnectDelay = callbacks.reconnectDelay || 1000;

    this.notifyStreamConnection(callbacks, logStreamName);

    await this.executeStreamWithRetry(
      logGroupName,
      logStreamName,
      config,
      streamOptions,
      callbacks,
      maxReconnects,
      reconnectDelay,
    );
  }

  /**
   * Notify stream connection establishment
   *
   * @param callbacks - Event callbacks
   * @param logStreamName - Log stream name
   * @internal
   */
  private notifyStreamConnection(
    callbacks: {
      onStreamConnect?: (streamName: string) => void;
    },
    logStreamName: string,
  ): void {
    if (callbacks.onStreamConnect) {
      callbacks.onStreamConnect(logStreamName);
    }
  }

  /**
   * Execute stream with retry logic
   *
   * @param logGroupName - Log group name
   * @param logStreamName - Log stream name
   * @param config - Client configuration
   * @param streamOptions - Stream filtering options
   * @param callbacks - Event callbacks
   * @param maxReconnects - Maximum reconnection attempts
   * @param reconnectDelay - Base reconnection delay
   * @returns Promise resolving when stream completes or fails
   * @internal
   */
  private async executeStreamWithRetry(
    logGroupName: string,
    logStreamName: string,
    config: AwsClientConfig,
    streamOptions: {
      filterPattern?: string;
      startTime?: Date;
    },
    callbacks: {
      onEvent?: (event: FilteredLogEvent, streamName: string) => void;
      onStreamDisconnect?: (streamName: string, reason: string) => void;
      onReconnect?: (streamName: string, attempt: number) => void;
      onError?: (error: Error, streamName?: string) => void;
    },
    maxReconnects: number,
    reconnectDelay: number,
  ): Promise<void> {
    let reconnectAttempts = 0;

    while (reconnectAttempts <= maxReconnects) {
      try {
        await this.streamLogEvents(logGroupName, logStreamName, config, streamOptions, callbacks);
        break; // Normal completion
      } catch (error) {
        reconnectAttempts++;
        await this.handleStreamError(
          error,
          logStreamName,
          callbacks,
          reconnectAttempts,
          maxReconnects,
          reconnectDelay,
        );
      }
    }
  }

  /**
   * Handle stream error with reconnection logic
   *
   * @param error - The error that occurred
   * @param logStreamName - Log stream name
   * @param callbacks - Event callbacks
   * @param reconnectAttempts - Current reconnection attempt
   * @param maxReconnects - Maximum reconnection attempts
   * @param reconnectDelay - Base reconnection delay
   * @returns Promise resolving after handling
   * @throws When max reconnects exceeded
   * @internal
   */
  private async handleStreamError(
    error: unknown,
    logStreamName: string,
    callbacks: {
      onStreamDisconnect?: (streamName: string, reason: string) => void;
      onReconnect?: (streamName: string, attempt: number) => void;
      onError?: (error: Error, streamName?: string) => void;
    },
    reconnectAttempts: number,
    maxReconnects: number,
    reconnectDelay: number,
  ): Promise<void> {
    if (callbacks.onStreamDisconnect) {
      callbacks.onStreamDisconnect(
        logStreamName,
        error instanceof Error ? error.message : "Unknown error",
      );
    }

    if (reconnectAttempts <= maxReconnects) {
      if (callbacks.onReconnect) {
        callbacks.onReconnect(logStreamName, reconnectAttempts);
      }

      // Exponential backoff
      const delay = reconnectDelay * Math.pow(2, reconnectAttempts - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } else {
      if (callbacks.onError) {
        callbacks.onError(error instanceof Error ? error : new Error(String(error)), logStreamName);
      }
      throw error;
    }
  }

  /**
   * Stream log events from a specific log stream
   *
   * @param logGroupName - Log group name
   * @param logStreamName - Log stream name
   * @param config - Client configuration
   * @param streamOptions - Stream filtering options
   * @param callbacks - Event handling callbacks
   * @returns Promise resolving when streaming is complete
   * @internal
   */
  private async streamLogEvents(
    logGroupName: string,
    logStreamName: string,
    config: AwsClientConfig,
    streamOptions: {
      filterPattern?: string;
      startTime?: Date;
    },
    callbacks: {
      onEvent?: (event: FilteredLogEvent, streamName: string) => void;
    },
  ): Promise<void> {
    const client = await this.getCloudWatchLogsClient(config);
    let nextToken: string | undefined;
    let lastTimestamp = streamOptions.startTime
      ? streamOptions.startTime.getTime()
      : Date.now() - 300_000; // Default: last 5 minutes

    // Continuously poll for new events
    while (true) {
      try {
        const pollResult = await this.pollLogEvents(
          client,
          logGroupName,
          logStreamName,
          streamOptions,
          lastTimestamp,
          nextToken,
        );
        lastTimestamp = this.processLogEvents(
          pollResult.events,
          callbacks,
          logStreamName,
          lastTimestamp,
        );
        nextToken = pollResult.nextToken;

        // Handle polling delay if no events
        if (pollResult.events.length === 0 && !nextToken) {
          await this.handlePollingDelay();
          lastTimestamp = Date.now() - 10_000; // Look back 10 seconds for new events
        }
      } catch (error) {
        throw new StreamingError(
          `Failed to stream events from log stream '${logStreamName}': ${error instanceof Error ? error.message : String(error)}`,
          "stream-events",
          [logGroupName],
          logStreamName,
          undefined,
          error,
        );
      }
    }
  }

  /**
   * Poll for log events
   *
   * @param client - CloudWatch Logs client
   * @param logGroupName - Log group name
   * @param logStreamName - Log stream name
   * @param streamOptions - Stream filtering options
   * @param lastTimestamp - Last timestamp processed
   * @param nextToken - Pagination token
   * @returns Promise resolving to poll result
   * @internal
   */
  private async pollLogEvents(
    client: CloudWatchLogsClient,
    logGroupName: string,
    logStreamName: string,
    streamOptions: {
      filterPattern?: string;
    },
    lastTimestamp: number,
    nextToken: string | undefined,
  ): Promise<{ events: FilteredLogEvent[]; nextToken?: string }> {
    const filterCommand = new FilterLogEventsCommand({
      logGroupName,
      logStreamNames: [logStreamName],
      filterPattern: streamOptions.filterPattern,
      startTime: Math.floor(lastTimestamp / 1000),
      nextToken,
      limit: 100,
    });

    const response = await client.send(filterCommand);
    return {
      events: response.events || [],
      ...(response.nextToken !== undefined && { nextToken: response.nextToken }),
    };
  }

  /**
   * Process log events and invoke callbacks
   *
   * @param events - Log events to process
   * @param callbacks - Event callbacks
   * @param logStreamName - Log stream name
   * @param lastTimestamp - Current last timestamp
   * @returns Updated last timestamp
   * @internal
   */
  private processLogEvents(
    events: FilteredLogEvent[],
    callbacks: {
      onEvent?: (event: FilteredLogEvent, streamName: string) => void;
    },
    logStreamName: string,
    lastTimestamp: number,
  ): number {
    let updatedTimestamp = lastTimestamp;

    for (const event of events) {
      if (callbacks.onEvent && event.timestamp && event.message) {
        callbacks.onEvent(
          {
            timestamp: (event.timestamp ?? 0) * 1000, // Convert to milliseconds
            message: event.message,
            eventId: event.eventId,
          },
          logStreamName,
        );

        // Update last timestamp
        updatedTimestamp = Math.max(updatedTimestamp, (event.timestamp ?? 0) * 1000);
      }
    }

    return updatedTimestamp;
  }

  /**
   * Handle polling delay when no events available
   *
   * @returns Promise resolving after delay
   * @internal
   */
  private async handlePollingDelay(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
  }

  /**
   * Analyze log patterns in a log group over a specified time period
   *
   * @param logGroupName - Log group name to analyze
   * @param config - Client configuration options
   * @param options - Pattern analysis options
   * @returns Promise resolving to pattern analysis results
   * @throws When pattern analysis fails
   */
  async analyzeLogPatterns(
    logGroupName: string,
    config: AwsClientConfig = {},
    options: {
      startTime?: Date;
      endTime?: Date;
      maxPatterns?: number;
      minOccurrences?: number;
      sampleSize?: number;
    } = {},
  ): Promise<PatternAnalysisResult> {
    const spinner = this.createSpinner(`Analyzing log patterns in '${logGroupName}'...`);

    try {
      const endTime = options.endTime || new Date();
      const startTime = options.startTime || new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // Default: last 24 hours
      const maxPatterns = options.maxPatterns || 20;
      const minOccurrences = options.minOccurrences || 5;
      const sampleSize = options.sampleSize || 1000;

      // Get log samples for pattern analysis
      const filterResult = await this.filterLogEvents(
        {
          logGroupName,
          startTime,
          endTime,
          limit: sampleSize,
          interleaved: true,
        },
        config,
      );

      const logMessages = filterResult.events.map((event) => event.message);

      // Perform pattern analysis
      const patterns = this.extractLogPatterns(logMessages, maxPatterns, minOccurrences);

      // Calculate pattern statistics
      const totalEvents = logMessages.length;
      const patternStats = patterns.map((pattern) => ({
        ...pattern,
        percentage: (pattern.count / totalEvents) * 100,
        firstSeen: this.findFirstOccurrence(pattern.pattern, filterResult.events) || undefined,
        lastSeen: this.findLastOccurrence(pattern.pattern, filterResult.events) || undefined,
      }));

      // Detect anomalies (patterns with unusual frequency)
      const anomalies = this.detectPatternAnomalies(patternStats);

      const result: PatternAnalysisResult = {
        logGroupName,
        analysisTime: new Date(),
        timeRange: { startTime, endTime },
        totalEvents,
        sampleSize: logMessages.length,
        patterns: patternStats,
        anomalies,
        summary: {
          uniquePatterns: patternStats.length,
          topPattern: patternStats[0]?.pattern ?? undefined,
          coveragePercentage: patternStats.reduce((sum, p) => sum + p.percentage, 0),
          anomalyCount: anomalies.length,
        },
      };

      spinner.succeed(`Found ${patterns.length} patterns in ${totalEvents} log events`);
      return result;
    } catch (error) {
      spinner.fail(`Failed to analyze patterns in log group '${logGroupName}'`);
      throw new CloudWatchLogsError(
        `Pattern analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        "analyze-patterns",
        logGroupName,
        error,
      );
    }
  }

  /**
   * Extract metrics and analytics from log data
   *
   * @param logGroupName - Log group name to analyze
   * @param config - Client configuration options
   * @param options - Metrics extraction options
   * @returns Promise resolving to log metrics and analytics
   * @throws When metrics extraction fails
   */
  async extractLogMetrics(
    logGroupName: string,
    config: AwsClientConfig = {},
    options: {
      startTime?: Date;
      endTime?: Date;
      metricType?: "error-rate" | "performance" | "volume" | "custom";
      customQuery?: string;
      groupBy?: "hour" | "day" | "minute";
      errorPatterns?: string[];
      performanceFields?: string[];
    } = {},
  ): Promise<LogMetricsResult> {
    const spinner = this.createSpinner(`Extracting metrics from '${logGroupName}'...`);

    try {
      const endTime = options.endTime || new Date();
      const startTime = options.startTime || new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // Default: last 24 hours
      const metricType = options.metricType || "volume";
      const groupBy = options.groupBy || "hour";

      let queryString = "";
      let metricData: LogMetricDataPoint[] = [];

      switch (metricType) {
        case "error-rate": {
          queryString = this.buildErrorRateQuery(
            options.errorPatterns || ["ERROR", "error", "exception"],
            groupBy,
          );
          break;
        }
        case "performance": {
          queryString = this.buildPerformanceQuery(
            options.performanceFields || ["duration", "response_time", "latency"],
            groupBy,
          );
          break;
        }
        case "volume": {
          queryString = this.buildVolumeQuery(groupBy);
          break;
        }
        case "custom": {
          if (!options.customQuery) {
            throw new CloudWatchLogsError(
              "Custom query is required when metricType is 'custom'",
              "extract-metrics",
              logGroupName,
            );
          }
          queryString = options.customQuery;
          break;
        }
      }

      // Execute the metrics query
      const queryResult = await this.executeQuery(
        {
          logGroupNames: [logGroupName],
          query: queryString,
          startTime,
          endTime,
          limit: 1000,
        },
        config,
      );

      if (queryResult.results) {
        metricData = queryResult.results.map((row) => {
          const record: LogMetricDataPoint = {
            timestamp: new Date().toISOString(),
            value: 0,
          };

          for (const field of row) {
            if (field.field && field.value !== undefined) {
              const parsedValue = this.parseMetricValue(field.value ?? "");

              // Map known fields to LogMetricDataPoint properties
              if (field.field === "timestamp") {
                record.timestamp = String(parsedValue);
              } else if (field.field === "value") {
                record.value = Number(parsedValue) || 0;
              } else {
                // Use the index signature for other fields
                record[field.field] = parsedValue;
              }
            }
          }
          return record;
        });
      }

      // Calculate summary statistics
      const summary = this.calculateMetricSummary(metricData, metricType);

      // Generate trend analysis
      const trends = this.analyzeTrends(metricData, groupBy);

      const result: LogMetricsResult = {
        logGroupName,
        metricType,
        timeRange: { startTime, endTime },
        queryExecuted: queryString,
        dataPoints: metricData,
        summary,
        trends,
        ...(queryResult.statistics && { statistics: queryResult.statistics }),
        generatedAt: new Date(),
      };

      spinner.succeed(`Extracted ${metricData.length} data points for ${metricType} metrics`);
      return result;
    } catch (error) {
      spinner.fail(`Failed to extract metrics from log group '${logGroupName}'`);
      if (error instanceof CloudWatchLogsError) {
        throw error;
      }
      throw new CloudWatchLogsError(
        `Metrics extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        "extract-metrics",
        logGroupName,
        error,
      );
    }
  }

  /**
   * Extract patterns from log messages using frequency analysis
   * @param messages - Array of log messages to analyze
   * @param maxPatterns - Maximum number of patterns to return
   * @param minOccurrences - Minimum occurrences for a pattern to be included
   * @returns Array of log patterns sorted by frequency
   * @internal
   */
  private extractLogPatterns(
    messages: string[],
    maxPatterns: number,
    minOccurrences: number,
  ): LogPattern[] {
    const patternMap = new Map<string, number>();

    // Simple pattern extraction - group by message structure
    for (const message of messages) {
      // Normalize message by replacing variable parts (timestamps, IDs, etc.)
      const normalized = message
        .replaceAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, "[TIMESTAMP]")
        .replaceAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[UUID]")
        .replaceAll(/\b\d+\b/g, "[NUMBER]")
        .replaceAll(/\b[a-f0-9]{32,}\b/gi, "[HASH]")
        .replaceAll(/\b\w+@\w+\.\w+\b/g, "[EMAIL]")
        .replaceAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP]");

      const count = patternMap.get(normalized) || 0;
      patternMap.set(normalized, count + 1);
    }

    // Filter and sort patterns
    return [...patternMap.entries()]
      .filter(([, count]) => count >= minOccurrences)
      .toSorted(([, a], [, b]) => b - a)
      .slice(0, maxPatterns)
      .map(([pattern, count]) => ({
        pattern,
        count,
        examples: messages
          .filter((message) => this.normalizeForPattern(message) === pattern)
          .slice(0, 3),
      }));
  }

  /**
   * Normalize message for pattern matching
   * @param message - Message to normalize
   * @returns Normalized message with placeholders for timestamps, UUIDs, and numbers
   * @internal
   */
  private normalizeForPattern(message: string): string {
    return message
      .replaceAll(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, "[TIMESTAMP]")
      .replaceAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[UUID]")
      .replaceAll(/\b\d+\b/g, "[NUMBER]")
      .replaceAll(/\b[a-f0-9]{32,}\b/gi, "[HASH]")
      .replaceAll(/\b\w+@\w+\.\w+\b/g, "[EMAIL]")
      .replaceAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IP]");
  }

  /**
   * Find first occurrence of a pattern in events
   * @param pattern - Pattern to search for
   * @param events - Array of log events to search
   * @returns Date of first occurrence or undefined if not found
   * @internal
   */
  private findFirstOccurrence(pattern: string, events: LogEvent[]): Date | undefined {
    for (const event of events) {
      if (this.normalizeForPattern(event.message) === pattern) {
        return new Date(event.timestamp);
      }
    }
    return undefined;
  }

  /**
   * Find last occurrence of a pattern in events
   * @param pattern - Pattern to search for
   * @param events - Array of log events to search
   * @returns Date of last occurrence or undefined if not found
   * @internal
   */
  private findLastOccurrence(pattern: string, events: LogEvent[]): Date | undefined {
    for (let index = events.length - 1; index >= 0; index--) {
      const event = events[index];
      if (
        event?.message &&
        event?.timestamp &&
        this.normalizeForPattern(event.message) === pattern
      ) {
        return new Date(event.timestamp);
      }
    }
    return undefined;
  }

  /**
   * Detect pattern anomalies based on frequency analysis
   * @param patterns - Array of patterns with statistics
   * @returns Array of detected anomalies
   * @internal
   */
  private detectPatternAnomalies(patterns: PatternWithStats[]): PatternAnomaly[] {
    const anomalies: PatternAnomaly[] = [];
    const avgPercentage = patterns.reduce((sum, p) => sum + p.percentage, 0) / patterns.length;
    const threshold = avgPercentage * 3; // 3x average is considered anomalous

    for (const pattern of patterns) {
      if (pattern.percentage > threshold) {
        anomalies.push({
          pattern: pattern.pattern,
          count: pattern.count,
          percentage: pattern.percentage,
          anomalyType: "high-frequency",
          severity: pattern.percentage > threshold * 2 ? "high" : "medium",
          description: `Pattern occurs ${pattern.percentage.toFixed(1)}% of the time (${threshold.toFixed(1)}% above average)`,
        });
      }
    }

    return anomalies;
  }

  /**
   * Build error rate query string
   * @param errorPatterns - Array of error patterns to search for
   * @param groupBy - Time grouping for results
   * @returns CloudWatch Logs Insights query string
   * @internal
   */
  private buildErrorRateQuery(errorPatterns: string[], groupBy: string): string {
    const patterns = errorPatterns.map((p) => `@message like /${p}/`).join(" or ");
    const timeBucket = this.getTimeBucketForGroupBy(groupBy);

    return `
      fields @timestamp, @message
      | filter ${patterns}
      | stats count() as errors by bin(5${timeBucket}) as time_bucket
      | sort time_bucket
    `.trim();
  }

  /**
   * Get time bucket format for groupBy option
   * @param groupBy - Time grouping option (minute, hour, day)
   * @returns Time bucket format for CloudWatch Logs Insights
   * @internal
   */
  private getTimeBucketForGroupBy(groupBy: string): string {
    if (groupBy === "minute") {
      return "m";
    }
    if (groupBy === "hour") {
      return "h";
    }
    return "d";
  }

  /**
   * Get time format for groupBy option
   * @param groupBy - Time grouping option (minute, hour, day)
   * @returns Time format string for CloudWatch Logs Insights
   * @internal
   */
  private getTimeFormatForGroupBy(groupBy: string): string {
    if (groupBy === "minute") {
      return "5m";
    }
    if (groupBy === "hour") {
      return "1h";
    }
    return "1d";
  }

  /**
   * Build performance metrics query string
   * @param performanceFields - Array of performance field names to extract
   * @param groupBy - Time grouping for results
   * @returns CloudWatch Logs Insights query string
   * @internal
   */
  private buildPerformanceQuery(performanceFields: string[], groupBy: string): string {
    const timeFormat = this.getTimeFormatForGroupBy(groupBy);

    return `
      fields @timestamp, @message
      | filter @message like /duration|response_time|latency/
      | parse @message /(?<metric_name>duration|response_time|latency)[:s=]+(?<metric_value>d+.?d*)/
      | stats avg(metric_value) as avg_performance, max(metric_value) as max_performance, min(metric_value) as min_performance by bin(${timeFormat}) as time_bucket
      | sort time_bucket
    `.trim();
  }

  /**
   * Build volume metrics query string
   * @param groupBy - Time grouping for results
   * @returns CloudWatch Logs Insights query string
   * @internal
   */
  private buildVolumeQuery(groupBy: string): string {
    const timeFormat = this.getTimeFormatForGroupBy(groupBy);

    return `
      fields @timestamp
      | stats count() as log_volume by bin(${timeFormat}) as time_bucket
      | sort time_bucket
    `.trim();
  }

  /**
   * Parse metric value from string
   * @param value - String value to parse
   * @returns Parsed number or original string if not a valid number
   * @internal
   */
  private parseMetricValue(value: string): number | string {
    // Try to parse as number
    const numberValue = Number.parseFloat(value);
    return Number.isNaN(numberValue) ? value : numberValue;
  }

  /**
   * Calculate summary statistics for metrics
   * @param data - Array of metric data points
   * @param metricType - Type of metric being calculated
   * @returns Summary statistics for the metrics
   * @internal
   */
  private calculateMetricSummary(
    data: Record<string, unknown>[],
    metricType: string,
  ): MetricSummary {
    if (data.length === 0) {
      return {
        totalDataPoints: 0,
        timeSpan: "0h",
        averageValue: 0,
        minValue: 0,
        maxValue: 0,
        trend: "stable",
      };
    }

    // Extract numeric values based on metric type
    let values: number[] = [];
    const valueField = this.getValueFieldForMetricType(metricType);

    values = data.map((d) => {
      const value = d[valueField];
      return typeof value === "number" ? value : 0;
    });

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Simple trend calculation (compare first half vs second half)
    const midpoint = Math.floor(values.length / 2);
    const firstHalfAvg = values.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;
    const secondHalfAvg =
      values.slice(midpoint).reduce((a, b) => a + b, 0) / (values.length - midpoint);

    let trend: "increasing" | "decreasing" | "stable" = "stable";
    if (secondHalfAvg > firstHalfAvg * 1.1) trend = "increasing";
    else if (secondHalfAvg < firstHalfAvg * 0.9) trend = "decreasing";

    return {
      totalDataPoints: data.length,
      timeSpan: `${data.length}h`, // Simplified
      averageValue: avg,
      minValue: min,
      maxValue: max,
      trend,
    };
  }

  /**
   * Get value field name for metric type
   * @param metricType - Type of metric
   * @returns Field name to extract from data
   * @internal
   */
  private getValueFieldForMetricType(metricType: string): string {
    switch (metricType) {
      case "error-rate": {
        return "errors";
      }
      case "volume": {
        return "log_volume";
      }
      default: {
        return "avg_performance";
      }
    }
  }

  /**
   * Analyze trends in metric data
   * @param data - Array of metric data points
   * @param _groupBy - Time grouping (reserved for future use)
   * @returns Array of trend analysis results
   * @internal
   */
  private analyzeTrends(data: Record<string, unknown>[], _groupBy: string): TrendAnalysis[] {
    if (data.length < 2) return [];

    const trends: TrendAnalysis[] = [];

    // Simple trend analysis for volume
    if (data.every((d) => typeof d.log_volume === "number")) {
      const volumes = data.map((d) => d.log_volume as number);
      const lastVolume = volumes.at(-1);
      const firstVolume = volumes[0];

      if (lastVolume === undefined || firstVolume === undefined) {
        return trends;
      }

      const change = lastVolume - firstVolume;
      const changePercent = (change / firstVolume) * 100;

      let direction: "increasing" | "decreasing" | "stable";
      if (change > 0) {
        direction = "increasing";
      } else if (change < 0) {
        direction = "decreasing";
      } else {
        direction = "stable";
      }

      let changeDescription: string;
      if (change > 0) {
        changeDescription = "increased";
      } else if (change < 0) {
        changeDescription = "decreased";
      } else {
        changeDescription = "remained stable";
      }

      trends.push({
        metric: "log_volume",
        direction,
        magnitude: Math.abs(changePercent),
        confidence: volumes.length > 5 ? "high" : "medium",
        description: `Log volume ${changeDescription} by ${Math.abs(changePercent).toFixed(1)}%`,
      });
    }

    return trends;
  }

  /**
   * Clear client caches (useful for testing or configuration changes)
   *
   */
  clearClientCache(): void {
    this.clientCache.clear();

    if (this.options.enableDebugLogging) {
      console.debug("Cleared CloudWatch Logs client caches");
    }
  }
}
