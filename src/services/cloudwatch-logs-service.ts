/**
 * CloudWatch Logs service for high-level log operations
 *
 * Orchestrates CloudWatch Logs operations by providing a unified interface for
 * log group management, real-time streaming, queries, and analytics. Integrates with
 * existing credential management for seamless AWS SDK client creation.
 *
 */

import {
  CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  DescribeLogStreamsCommand,
  FilterLogEventsCommand,
  StartQueryCommand,
  GetQueryResultsCommand,
  StopQueryCommand,
  StartLiveTailCommand,
  type LogGroup,
  type LogStream,
  type FilteredLogEvent,
  type QueryInfo,
  type QueryStatus,
  type StartLiveTailResponseStream,
} from "@aws-sdk/client-cloudwatch-logs";
import ora from "ora";
import { ServiceError } from "../lib/errors.js";
import {
  CloudWatchLogsError,
  LogGroupError,
  LogStreamError,
  StreamingError,
  QueryError,
  FilterError,
} from "../lib/cloudwatch-logs-errors.js";
import type {
  LogPattern,
  PatternWithStats,
  PatternAnomaly,
  PatternAnalysisResult,
  MetricSummary,
  TrendAnalysis,
  LogMetricsResult,
} from "../lib/cloudwatch-logs-analytics-schemas.js";
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
 * coordinating with credential management and providing comprehensive error handling.
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
  private async getCloudWatchLogsClient(config: AwsClientConfig = {}): Promise<CloudWatchLogsClient> {
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
        if (group.retentionInDays !== undefined) description.retentionInDays = group.retentionInDays;
        if (group.metricFilterCount !== undefined) description.metricFilterCount = group.metricFilterCount;
        if (group.arn) description.arn = group.arn;
        if (group.storedBytes !== undefined) description.storedBytes = group.storedBytes;
        if (group.kmsKeyId) description.kmsKeyId = group.kmsKeyId;
        if (group.dataProtectionStatus) description.dataProtectionStatus = group.dataProtectionStatus;

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
      const logGroup = groupResponse.logGroups?.find(group => group.logGroupName === logGroupName);

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
      if (logGroup.retentionInDays !== undefined) description.retentionInDays = logGroup.retentionInDays;
      if (logGroup.metricFilterCount !== undefined) description.metricFilterCount = logGroup.metricFilterCount;
      if (logGroup.arn) description.arn = logGroup.arn;
      if (logGroup.storedBytes !== undefined) description.storedBytes = logGroup.storedBytes;
      if (logGroup.kmsKeyId) description.kmsKeyId = logGroup.kmsKeyId;
      if (logGroup.dataProtectionStatus) description.dataProtectionStatus = logGroup.dataProtectionStatus;

      // Optionally include log streams
      if (includeLogStreams) {
        const streamsCommand = new DescribeLogStreamsCommand({
          logGroupName,
          limit: 50, // Limit to first 50 streams
        });

        const streamsResponse = await client.send(streamsCommand);
        description.logStreams = streamsResponse.logStreams?.map((stream: LogStream) => {
          const streamInfo: LogStreamInfo = {
            logStreamName: stream.logStreamName!,
          };

          if (stream.creationTime) streamInfo.creationTime = new Date(stream.creationTime);
          // Note: firstEventTime and lastEventTime may not be available on LogStream type
          // if (stream.firstEventTime) streamInfo.firstEventTime = new Date(stream.firstEventTime);
          // if (stream.lastEventTime) streamInfo.lastEventTime = new Date(stream.lastEventTime);
          if (stream.lastIngestionTime) streamInfo.lastIngestionTime = new Date(stream.lastIngestionTime);
          if (stream.uploadSequenceToken) streamInfo.uploadSequenceToken = stream.uploadSequenceToken;
          if (stream.arn) streamInfo.arn = stream.arn;
          if (stream.storedBytes !== undefined) streamInfo.storedBytes = stream.storedBytes;

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
  async executeQuery(parameters: QueryParameters, config: AwsClientConfig = {}): Promise<QueryResult> {
    const spinner = this.createSpinner("Executing CloudWatch Logs Insights query...");

    try {
      const client = await this.getCloudWatchLogsClient(config);

      // Start the query
      const startCommand = new StartQueryCommand({
        logGroupNames: parameters.logGroupNames,
        startTime: Math.floor(parameters.startTime.getTime() / 1000),
        endTime: Math.floor(parameters.endTime.getTime() / 1000),
        queryString: parameters.query,
        limit: parameters.limit,
      });

      const startResponse = await client.send(startCommand);
      const queryId = startResponse.queryId!;

      // Poll for results
      let status: QueryStatus = "Running";
      let attempts = 0;
      const maxAttempts = 120; // 10 minutes with 5-second intervals

      spinner.text = `Query started (${queryId}), waiting for results...`;

      while (status === "Running" && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        attempts++;

        const resultCommand = new GetQueryResultsCommand({ queryId });
        const resultResponse = await client.send(resultCommand);

        status = resultResponse.status!;

        if (status === "Complete") {
          const result: QueryResult = {
            queryId,
            status,
          };

          if (resultResponse.results) {
            result.results = resultResponse.results.map(row =>
              row.map(field => {
                const resultField: { field?: string; value?: string } = {};
                if (field.field !== undefined) resultField.field = field.field;
                if (field.value !== undefined) resultField.value = field.value;
                return resultField;
              })
            );
          }

          if (resultResponse.statistics) {
            const stats: { recordsMatched?: number; recordsScanned?: number; bytesScanned?: number } = {};
            if (resultResponse.statistics.recordsMatched !== undefined) stats.recordsMatched = resultResponse.statistics.recordsMatched;
            if (resultResponse.statistics.recordsScanned !== undefined) stats.recordsScanned = resultResponse.statistics.recordsScanned;
            if (resultResponse.statistics.bytesScanned !== undefined) stats.bytesScanned = resultResponse.statistics.bytesScanned;
            result.statistics = stats;
          }

          if (resultResponse.encryptionKey) {
            result.encryptionKey = resultResponse.encryptionKey;
          }

          const resultCount = resultResponse.results?.length || 0;
          spinner.succeed(`Query completed: ${resultCount} results returned`);
          return result;
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

      // Timeout - stop the query
      if (status === "Running") {
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

      throw new QueryError(
        `Unexpected query status: ${status}`,
        parameters.query,
        parameters.logGroupNames,
        parameters.queryLanguage,
        parameters.startTime,
        parameters.endTime,
      );
    } catch (error) {
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
    const spinner = this.createSpinner(`Filtering events from log group '${parameters.logGroupName}'...`);

    try {
      const client = await this.getCloudWatchLogsClient(config);

      const command = new FilterLogEventsCommand({
        logGroupName: parameters.logGroupName,
        logStreamNames: parameters.logStreamNames,
        filterPattern: parameters.filterPattern,
        startTime: parameters.startTime ? Math.floor(parameters.startTime.getTime() / 1000) : undefined,
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
        result.searchedLogStreams = response.searchedLogStreams.map(stream => {
          const searchedStream: { logStreamName?: string; searchedCompletely?: boolean } = {};
          if (stream.logStreamName !== undefined) searchedStream.logStreamName = stream.logStreamName;
          if (stream.searchedCompletely !== undefined) searchedStream.searchedCompletely = stream.searchedCompletely;
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
      onEvent?: (event: any) => void;
      onError?: (error: Error) => void;
      onClose?: () => void;
    } = {},
  ): Promise<void> {
    const spinner = this.createSpinner("Starting live tail session...");

    try {
      const client = await this.getCloudWatchLogsClient(config);

      const command = new StartLiveTailCommand({
        logGroupIdentifiers: logGroupNames,
        logStreamNames: options.logStreamNames,
        ...(options.logStreamNamePrefix && { logStreamNamePrefixes: [options.logStreamNamePrefix] }),
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

      spinner.succeed("Live tail session started");

      // Process the stream
      try {
        for await (const chunk of response.responseStream) {
          if (chunk.sessionStart) {
            if (callbacks.verbose) {
              console.log(`Live tail session started: ${chunk.sessionStart.sessionId}`);
            }
          } else if (chunk.sessionUpdate?.logEvents) {
            for (const event of chunk.sessionUpdate.logEvents) {
              if (callbacks.onEvent) {
                callbacks.onEvent({
                  timestamp: event.timestamp,
                  message: event.message,
                  logStreamName: event.logStreamName,
                });
              }
            }
          } else if (chunk.sessionStop) {
            if (callbacks.verbose) {
              console.log(`Live tail session stopped: ${chunk.sessionStop.reason}`);
            }
            break;
          }
        }
      } catch (streamError) {
        if (callbacks.onError) {
          callbacks.onError(streamError instanceof Error ? streamError : new Error(String(streamError)));
        }
        throw streamError;
      } finally {
        if (callbacks.onClose) {
          callbacks.onClose();
        }
      }
    } catch (error) {
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
      onEvent?: (event: any, streamName: string) => void;
      onStreamConnect?: (streamName: string) => void;
      onStreamDisconnect?: (streamName: string, reason: string) => void;
      onReconnect?: (streamName: string, attempt: number) => void;
      onError?: (error: Error, streamName?: string) => void;
    } = {},
  ): Promise<void> {
    const spinner = this.createSpinner(`Following log streams in group '${logGroupName}'...`);

    try {
      const client = await this.getCloudWatchLogsClient(config);

      // First, get available log streams
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
        if (streamOptions.useRegex) {
          const regex = new RegExp(streamOptions.streamPattern);
          targetStreams = targetStreams.filter(stream =>
            stream.logStreamName && regex.test(stream.logStreamName)
          );
        } else {
          // Use glob-like pattern matching (basic implementation)
          const pattern = streamOptions.streamPattern
            .replace(/\*/g, ".*")
            .replace(/\?/g, ".");
          const regex = new RegExp(`^${pattern}$`);
          targetStreams = targetStreams.filter(stream =>
            stream.logStreamName && regex.test(stream.logStreamName)
          );
        }
      }

      if (targetStreams.length === 0) {
        throw new LogStreamError(
          `No log streams found matching pattern '${streamOptions.streamPattern || "*"}'`,
          logGroupName,
          streamOptions.streamPattern,
          "follow-streams",
        );
      }

      spinner.succeed(`Found ${targetStreams.length} streams to follow`);

      // Start following each stream with FilterLogEvents
      const followPromises = targetStreams.map(stream =>
        this.followSingleStream(
          logGroupName,
          stream.logStreamName!,
          config,
          streamOptions,
          callbacks
        )
      );

      // Wait for all streams to complete or fail
      await Promise.allSettled(followPromises);

    } catch (error) {
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
      onEvent?: (event: any, streamName: string) => void;
      onStreamConnect?: (streamName: string) => void;
      onStreamDisconnect?: (streamName: string, reason: string) => void;
      onReconnect?: (streamName: string, attempt: number) => void;
      onError?: (error: Error, streamName?: string) => void;
    }
  ): Promise<void> {
    let reconnectAttempts = 0;
    const maxReconnects = callbacks.maxReconnects || 5;
    const reconnectDelay = callbacks.reconnectDelay || 1000;

    if (callbacks.onStreamConnect) {
      callbacks.onStreamConnect(logStreamName);
    }

    while (reconnectAttempts <= maxReconnects) {
      try {
        await this.streamLogEvents(logGroupName, logStreamName, config, streamOptions, callbacks);
        break; // Normal completion
      } catch (error) {
        reconnectAttempts++;

        if (callbacks.onStreamDisconnect) {
          callbacks.onStreamDisconnect(logStreamName, error instanceof Error ? error.message : "Unknown error");
        }

        if (reconnectAttempts <= maxReconnects) {
          if (callbacks.onReconnect) {
            callbacks.onReconnect(logStreamName, reconnectAttempts);
          }

          // Exponential backoff
          const delay = reconnectDelay * Math.pow(2, reconnectAttempts - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          if (callbacks.onError) {
            callbacks.onError(error instanceof Error ? error : new Error(String(error)), logStreamName);
          }
          throw error;
        }
      }
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
      onEvent?: (event: any, streamName: string) => void;
    }
  ): Promise<void> {
    const client = await this.getCloudWatchLogsClient(config);
    let nextToken: string | undefined;
    let lastTimestamp = streamOptions.startTime ? streamOptions.startTime.getTime() : Date.now() - 300000; // Default: last 5 minutes

    // Continuously poll for new events
    while (true) {
      try {
        const filterCommand = new FilterLogEventsCommand({
          logGroupName,
          logStreamNames: [logStreamName],
          filterPattern: streamOptions.filterPattern,
          startTime: Math.floor(lastTimestamp / 1000),
          nextToken,
          limit: 100,
        });

        const response = await client.send(filterCommand);
        const events = response.events || [];

        for (const event of events) {
          if (callbacks.onEvent && event.timestamp && event.message) {
            callbacks.onEvent({
              timestamp: event.timestamp * 1000, // Convert to milliseconds
              message: event.message,
              eventId: event.eventId,
            }, logStreamName);

            // Update last timestamp
            lastTimestamp = Math.max(lastTimestamp, event.timestamp * 1000);
          }
        }

        nextToken = response.nextToken;

        // If no more events and no nextToken, wait before next poll
        if (events.length === 0 && !nextToken) {
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
          lastTimestamp = Date.now() - 10000; // Look back 10 seconds for new events
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
      const filterResult = await this.filterLogEvents({
        logGroupName,
        startTime,
        endTime,
        limit: sampleSize,
        interleaved: true,
      }, config);

      const logMessages = filterResult.events.map(event => event.message);

      // Perform pattern analysis
      const patterns = this.extractLogPatterns(logMessages, maxPatterns, minOccurrences);

      // Calculate pattern statistics
      const totalEvents = logMessages.length;
      const patternStats = patterns.map(pattern => ({
        ...pattern,
        percentage: (pattern.count / totalEvents) * 100,
        firstSeen: this.findFirstOccurrence(pattern.pattern, filterResult.events),
        lastSeen: this.findLastOccurrence(pattern.pattern, filterResult.events),
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
          uniquePatterns: patterns.length,
          topPattern: patterns[0]?.pattern || null,
          coveragePercentage: patterns.reduce((sum, p) => sum + p.percentage, 0),
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
      metricType?: 'error-rate' | 'performance' | 'volume' | 'custom';
      customQuery?: string;
      groupBy?: 'hour' | 'day' | 'minute';
      errorPatterns?: string[];
      performanceFields?: string[];
    } = {},
  ): Promise<LogMetricsResult> {
    const spinner = this.createSpinner(`Extracting metrics from '${logGroupName}'...`);

    try {
      const endTime = options.endTime || new Date();
      const startTime = options.startTime || new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // Default: last 24 hours
      const metricType = options.metricType || 'volume';
      const groupBy = options.groupBy || 'hour';

      let queryString = "";
      let metricData: any[] = [];

      switch (metricType) {
        case 'error-rate':
          queryString = this.buildErrorRateQuery(options.errorPatterns || ['ERROR', 'error', 'exception'], groupBy);
          break;
        case 'performance':
          queryString = this.buildPerformanceQuery(options.performanceFields || ['duration', 'response_time', 'latency'], groupBy);
          break;
        case 'volume':
          queryString = this.buildVolumeQuery(groupBy);
          break;
        case 'custom':
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

      // Execute the metrics query
      const queryResult = await this.executeQuery({
        logGroupNames: [logGroupName],
        query: queryString,
        startTime,
        endTime,
        limit: 1000,
      }, config);

      if (queryResult.results) {
        metricData = queryResult.results.map(row => {
          const record: any = {};
          row.forEach(field => {
            if (field.field && field.value !== undefined) {
              record[field.field] = this.parseMetricValue(field.value);
            }
          });
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
        statistics: queryResult.statistics,
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
   * @internal
   */
  private extractLogPatterns(messages: string[], maxPatterns: number, minOccurrences: number): LogPattern[] {
    const patternMap = new Map<string, number>();

    // Simple pattern extraction - group by message structure
    messages.forEach(message => {
      // Normalize message by replacing variable parts (timestamps, IDs, etc.)
      const normalized = message
        .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '[TIMESTAMP]')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[UUID]')
        .replace(/\b\d+\b/g, '[NUMBER]')
        .replace(/\b[a-f0-9]{32,}\b/gi, '[HASH]')
        .replace(/\b\w+@\w+\.\w+\b/g, '[EMAIL]')
        .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]');

      const count = patternMap.get(normalized) || 0;
      patternMap.set(normalized, count + 1);
    });

    // Filter and sort patterns
    return Array.from(patternMap.entries())
      .filter(([, count]) => count >= minOccurrences)
      .sort(([, a], [, b]) => b - a)
      .slice(0, maxPatterns)
      .map(([pattern, count]) => ({
        pattern,
        count,
        examples: messages.filter(msg => this.normalizeForPattern(msg) === pattern).slice(0, 3),
      }));
  }

  /**
   * Normalize message for pattern matching
   * @internal
   */
  private normalizeForPattern(message: string): string {
    return message
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '[TIMESTAMP]')
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[UUID]')
      .replace(/\b\d+\b/g, '[NUMBER]')
      .replace(/\b[a-f0-9]{32,}\b/gi, '[HASH]')
      .replace(/\b\w+@\w+\.\w+\b/g, '[EMAIL]')
      .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]');
  }

  /**
   * Find first occurrence of a pattern in events
   * @internal
   */
  private findFirstOccurrence(pattern: string, events: LogEvent[]): Date | null {
    for (const event of events) {
      if (this.normalizeForPattern(event.message) === pattern) {
        return new Date(event.timestamp);
      }
    }
    return null;
  }

  /**
   * Find last occurrence of a pattern in events
   * @internal
   */
  private findLastOccurrence(pattern: string, events: LogEvent[]): Date | null {
    for (let i = events.length - 1; i >= 0; i--) {
      if (this.normalizeForPattern(events[i].message) === pattern) {
        return new Date(events[i].timestamp);
      }
    }
    return null;
  }

  /**
   * Detect pattern anomalies based on frequency analysis
   * @internal
   */
  private detectPatternAnomalies(patterns: PatternWithStats[]): PatternAnomaly[] {
    const anomalies: PatternAnomaly[] = [];
    const avgPercentage = patterns.reduce((sum, p) => sum + p.percentage, 0) / patterns.length;
    const threshold = avgPercentage * 3; // 3x average is considered anomalous

    patterns.forEach(pattern => {
      if (pattern.percentage > threshold) {
        anomalies.push({
          pattern: pattern.pattern,
          count: pattern.count,
          percentage: pattern.percentage,
          anomalyType: 'high-frequency',
          severity: pattern.percentage > threshold * 2 ? 'high' : 'medium',
          description: `Pattern occurs ${pattern.percentage.toFixed(1)}% of the time (${threshold.toFixed(1)}% above average)`,
        });
      }
    });

    return anomalies;
  }

  /**
   * Build error rate query string
   * @internal
   */
  private buildErrorRateQuery(errorPatterns: string[], groupBy: string): string {
    const timeFormat = groupBy === 'minute' ? '%Y-%m-%d %H:%M' :
                     groupBy === 'hour' ? '%Y-%m-%d %H:00' : '%Y-%m-%d';
    const patterns = errorPatterns.map(p => `@message like /${p}/`).join(' or ');

    return `
      fields @timestamp, @message
      | filter ${patterns}
      | stats count() as errors by bin(5${groupBy === 'minute' ? 'm' : groupBy === 'hour' ? 'h' : 'd'}) as time_bucket
      | sort time_bucket
    `.trim();
  }

  /**
   * Build performance metrics query string
   * @internal
   */
  private buildPerformanceQuery(performanceFields: string[], groupBy: string): string {
    const timeFormat = groupBy === 'minute' ? '5m' : groupBy === 'hour' ? '1h' : '1d';

    return `
      fields @timestamp, @message
      | filter @message like /duration|response_time|latency/
      | parse @message /(?<metric_name>duration|response_time|latency)[:\s=]+(?<metric_value>\d+\.?\d*)/
      | stats avg(metric_value) as avg_performance, max(metric_value) as max_performance, min(metric_value) as min_performance by bin(${timeFormat}) as time_bucket
      | sort time_bucket
    `.trim();
  }

  /**
   * Build volume metrics query string
   * @internal
   */
  private buildVolumeQuery(groupBy: string): string {
    const timeFormat = groupBy === 'minute' ? '5m' : groupBy === 'hour' ? '1h' : '1d';

    return `
      fields @timestamp
      | stats count() as log_volume by bin(${timeFormat}) as time_bucket
      | sort time_bucket
    `.trim();
  }

  /**
   * Parse metric value from string
   * @internal
   */
  private parseMetricValue(value: string): number | string {
    // Try to parse as number
    const numValue = parseFloat(value);
    return isNaN(numValue) ? value : numValue;
  }

  /**
   * Calculate summary statistics for metrics
   * @internal
   */
  private calculateMetricSummary(data: any[], metricType: string): MetricSummary {
    if (data.length === 0) {
      return {
        totalDataPoints: 0,
        timeSpan: '0h',
        averageValue: 0,
        minValue: 0,
        maxValue: 0,
        trend: 'stable',
      };
    }

    // Extract numeric values based on metric type
    let values: number[] = [];
    const valueField = metricType === 'error-rate' ? 'errors' :
                      metricType === 'volume' ? 'log_volume' : 'avg_performance';

    values = data.map(d => typeof d[valueField] === 'number' ? d[valueField] : 0);

    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Simple trend calculation (compare first half vs second half)
    const midpoint = Math.floor(values.length / 2);
    const firstHalfAvg = values.slice(0, midpoint).reduce((a, b) => a + b, 0) / midpoint;
    const secondHalfAvg = values.slice(midpoint).reduce((a, b) => a + b, 0) / (values.length - midpoint);

    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (secondHalfAvg > firstHalfAvg * 1.1) trend = 'increasing';
    else if (secondHalfAvg < firstHalfAvg * 0.9) trend = 'decreasing';

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
   * Analyze trends in metric data
   * @internal
   */
  private analyzeTrends(data: any[], groupBy: string): TrendAnalysis[] {
    if (data.length < 2) return [];

    const trends: TrendAnalysis[] = [];

    // Simple trend analysis for volume
    if (data.every(d => typeof d.log_volume === 'number')) {
      const volumes = data.map(d => d.log_volume);
      const change = volumes[volumes.length - 1] - volumes[0];
      const changePercent = (change / volumes[0]) * 100;

      trends.push({
        metric: 'log_volume',
        direction: change > 0 ? 'increasing' : change < 0 ? 'decreasing' : 'stable',
        magnitude: Math.abs(changePercent),
        confidence: volumes.length > 5 ? 'high' : 'medium',
        description: `Log volume ${change > 0 ? 'increased' : change < 0 ? 'decreased' : 'remained stable'} by ${Math.abs(changePercent).toFixed(1)}%`,
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