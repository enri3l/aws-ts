/**
 * CQRS Handler Factory Pattern for CLI command processing
 *
 * Provides a centralized factory for creating command handlers and query handlers
 * with consistent error handling, validation, and logging integration.
 * Supports dependency injection for testability and modular architecture.
 *
 */

/**
 * Base interface for all handlers
 *
 * Defines the common contract that all command and query handlers must implement
 * for consistent processing and error handling across the CLI application.
 *
 * @public
 */
export interface BaseHandler<TInput = unknown, TOutput = unknown> {
  /**
   * Execute the handler with the provided input
   *
   * @param input - The input data for handler execution
   * @returns Promise resolving to the handler output
   * @throws \{ValidationError\} When input validation fails
   * @throws \{ServiceError\} When AWS service operations fail
   * @throws \{ConfigurationError\} When configuration is invalid
   */
  handle(input: TInput): Promise<TOutput>;
}

/**
 * Command handler interface for write operations
 *
 * Command handlers are responsible for operations that modify state,
 * such as creating, updating, or deleting AWS resources.
 *
 * @public
 */
export interface CommandHandler<TInput = unknown, TOutput = unknown>
  extends BaseHandler<TInput, TOutput> {
  /**
   * Validate command input before execution
   *
   * @param input - The command input to validate
   * @throws \{ValidationError\} When validation fails
   */
  validateInput(input: TInput): Promise<void>;
}

/**
 * Query handler interface for read operations
 *
 * Query handlers are responsible for operations that read state,
 * such as listing, describing, or analyzing AWS resources.
 *
 * @public
 */
export interface QueryHandler<TInput = unknown, TOutput = unknown>
  extends BaseHandler<TInput, TOutput> {
  /**
   * Validate query parameters before execution
   *
   * @param input - The query parameters to validate
   * @throws \{ValidationError\} When validation fails
   */
  validateQuery(input: TInput): Promise<void>;
}

/**
 * Handler factory configuration options
 *
 * @public
 */
export interface HandlerFactoryOptions {
  /**
   * Enable debug logging for handler operations
   */
  enableDebugLogging?: boolean;

  /**
   * Maximum retry attempts for recoverable operations
   */
  maxRetries?: number;

  /**
   * Base timeout for handler operations in milliseconds
   */
  timeoutMs?: number;
}

/**
 * Handler factory for creating CQRS handlers with consistent configuration
 *
 * Provides a centralized factory pattern for creating command and query handlers
 * with shared configuration, error handling, and logging capabilities.
 *
 * @public
 */
export class HandlerFactory {
  private readonly options: Required<HandlerFactoryOptions>;

  /**
   * Create a new handler factory instance
   *
   * @param options - Factory configuration options
   */
  constructor(options: HandlerFactoryOptions = {}) {
    this.options = {
      enableDebugLogging: options.enableDebugLogging ?? false,
      maxRetries: options.maxRetries ?? 3,
      timeoutMs: options.timeoutMs ?? 30_000,
    };
  }

  /**
   * Create a command handler with factory configuration
   *
   * @param handlerClass - The command handler class to instantiate
   * @param dependencies - Dependencies to inject into the handler
   * @returns Configured command handler instance
   *
   * @example
   * ```typescript
   * const factory = new HandlerFactory({ enableDebugLogging: true });
   * const createTableHandler = factory.createCommandHandler(CreateTableHandler, {
   *   dynamoClient: new DynamoDBClient({}),
   *   logger: new Logger()
   * });
   * ```
   */
  createCommandHandler<THandler extends CommandHandler>(
    handlerClass: new (dependencies: Record<string, unknown>) => THandler,
    dependencies: Record<string, unknown> = {},
  ): THandler {
    return this.createHandler(handlerClass, dependencies);
  }

  /**
   * Create a query handler with factory configuration
   *
   * @param handlerClass - The query handler class to instantiate
   * @param dependencies - Dependencies to inject into the handler
   * @returns Configured query handler instance
   *
   * @example
   * ```typescript
   * const factory = new HandlerFactory({ maxRetries: 5 });
   * const listTablesHandler = factory.createQueryHandler(ListTablesHandler, {
   *   dynamoClient: new DynamoDBClient({}),
   *   logger: new Logger()
   * });
   * ```
   */
  createQueryHandler<THandler extends QueryHandler>(
    handlerClass: new (dependencies: Record<string, unknown>) => THandler,
    dependencies: Record<string, unknown> = {},
  ): THandler {
    return this.createHandler(handlerClass, dependencies);
  }

  /**
   * Generic handler creation method
   *
   * @param handlerClass - The handler class to instantiate
   * @param dependencies - Dependencies to inject into the handler
   * @returns Configured handler instance
   * @internal
   */
  private createHandler<THandler extends BaseHandler>(
    handlerClass: new (dependencies: Record<string, unknown>) => THandler,
    dependencies: Record<string, unknown> = {},
  ): THandler {
    const handler = new handlerClass({
      ...dependencies,
      factoryOptions: this.options,
    });

    return this.wrapWithErrorHandling(handler);
  }

  /**
   * Wrap handlers with consistent error handling and retry logic
   *
   * @param handler - The handler to wrap
   * @returns Handler with enhanced error handling
   * @internal
   */
  private wrapWithErrorHandling<THandler extends BaseHandler>(handler: THandler): THandler {
    const originalHandle = handler.handle.bind(handler);

    handler.handle = async (input: unknown) => {
      const startTime = Date.now();

      try {
        if (this.options.enableDebugLogging) {
          console.debug(`Executing handler: ${handler.constructor.name}`, { input });
        }

        const result = await Promise.race([originalHandle(input), this.createTimeoutPromise()]);

        if (this.options.enableDebugLogging) {
          const duration = Date.now() - startTime;
          console.debug(`Handler completed: ${handler.constructor.name}`, {
            duration,
            success: true,
          });
        }

        return result;
      } catch (error) {
        if (this.options.enableDebugLogging) {
          const duration = Date.now() - startTime;
          console.debug(`Handler failed: ${handler.constructor.name}`, {
            duration,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        throw error;
      }
    };

    return handler;
  }

  /**
   * Create a timeout promise for handler operations
   *
   * @returns Promise that rejects after the configured timeout
   * @internal
   */
  private createTimeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Handler operation timed out after ${this.options.timeoutMs}ms`));
      }, this.options.timeoutMs);
    });
  }
}
