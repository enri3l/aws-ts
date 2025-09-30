/**
 * @module base-aws-service
 * Base AWS service class providing common functionality for all AWS service implementations
 *
 * Provides shared functionality for AWS SDK client management, credential integration,
 * progress indicators, and error handling. All AWS service classes should extend this
 * base class to ensure consistent patterns across the codebase.
 *
 * @remarks
 * This base class eliminates code duplication across service implementations by
 * centralizing common patterns like client caching, spinner creation, and credential
 * management. Services that extend this class only need to implement their specific
 * business logic.
 *
 * @example Basic service implementation
 * ```typescript
 * export class MyService extends BaseAwsService<MyServiceClient> {
 *   constructor(options: MyServiceOptions = {}) {
 *     super(MyServiceClient, options);
 *   }
 *
 *   async myOperation(config: AwsClientConfig = {}): Promise<Result> {
 *     const spinner = this.createSpinner("Performing operation...");
 *     try {
 *       const client = await this.getClient(config);
 *       const result = await retryWithBackoff(() => client.send(command));
 *       spinner.succeed("Operation completed");
 *       return result;
 *     } catch (error) {
 *       spinner.fail("Operation failed");
 *       throw error;
 *     }
 *   }
 * }
 * ```
 *
 * @public
 */

import ora from "ora";
import { CredentialService, type AwsClientConfig } from "../services/credential-service.js";

/**
 * Spinner interface for progress indicators
 *
 * @public
 */
export interface SpinnerInterface {
  /** Current spinner text */
  text: string;
  /** Mark operation as successful */
  succeed: (message?: string) => void;
  /** Mark operation as failed */
  fail: (message?: string) => void;
  /** Mark operation with warning */
  warn: (message?: string) => void;
  /** Update spinner text and state */
  update?: (options: { text: string; suffixText?: string }) => void;
}

/**
 * Base configuration options for AWS services
 *
 * @public
 */
export interface BaseServiceOptions {
  /**
   * Credential service configuration
   */
  credentialService?: {
    /** Default AWS region */
    defaultRegion?: string;
    /** Default AWS profile */
    defaultProfile?: string;
    /** Enable debug logging */
    enableDebugLogging?: boolean;
  };

  /**
   * Enable debug logging for service operations
   */
  enableDebugLogging?: boolean;

  /**
   * Enable progress indicators for long-running operations
   *
   * @remarks
   * Automatically disabled in test and CI environments
   */
  enableProgressIndicators?: boolean;

  /**
   * AWS client configuration overrides
   */
  clientConfig?: {
    /** AWS region override */
    region?: string;
    /** AWS profile override */
    profile?: string;
    /** Custom endpoint URL */
    endpoint?: string;
  };
}

/**
 * Base AWS service class providing common functionality
 *
 * @remarks
 * Provides centralized patterns for:
 * - AWS SDK client creation and caching
 * - Credential management integration
 * - Progress indicator management
 * - Configuration handling
 *
 * All services should extend this class to maintain consistency
 * and reduce code duplication across the codebase.
 *
 * @typeParam TClient - AWS SDK client type
 *
 * @public
 */
export abstract class BaseAwsService<TClient> {
  /** Credential service for AWS authentication */
  protected readonly credentialService: CredentialService;

  /** Service configuration options */
  protected readonly options: BaseServiceOptions;

  /** Cache for AWS SDK client instances */
  private clientCache = new Map<string, TClient>();

  /**
   * Create a new AWS service instance
   *
   * @param ClientConstructor - AWS SDK client constructor
   * @param options - Service configuration options
   *
   * @remarks
   * The ClientConstructor is used to create new client instances when needed.
   * Client instances are cached per region/profile combination to avoid
   * unnecessary recreation and improve performance.
   */
  constructor(
    protected readonly ClientConstructor: new (config: Record<string, unknown>) => TClient,
    options: BaseServiceOptions = {},
  ) {
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
   * Get or create an AWS SDK client instance
   *
   * @param config - Client configuration options
   * @returns Promise resolving to client instance
   *
   * @remarks
   * Clients are cached per region/profile combination. The cache key is
   * sanitized to prevent collisions from special characters. Cached clients
   * are reused for subsequent operations with the same configuration.
   *
   * @internal
   */
  protected async getClient(config: AwsClientConfig = {}): Promise<TClient> {
    const cacheKey = this.generateCacheKey(config);

    if (!this.clientCache.has(cacheKey)) {
      const clientConfig = {
        ...config,
        ...this.options.clientConfig,
      };

      const client = await this.credentialService.createClient(
        this.ClientConstructor,
        clientConfig,
      );
      this.clientCache.set(cacheKey, client);
    }

    return this.clientCache.get(cacheKey)!;
  }

  /**
   * Create a progress spinner for long-running operations
   *
   * @param text - Initial spinner text
   * @returns Spinner interface for controlling progress display
   *
   * @remarks
   * If progress indicators are disabled (test/CI environments), returns
   * a mock spinner that implements the same interface but does nothing.
   * This allows service code to remain unchanged regardless of environment.
   *
   * @example
   * ```typescript
   * const spinner = this.createSpinner("Loading data...");
   * try {
   *   const result = await operation();
   *   spinner.succeed("Data loaded successfully");
   * } catch (error) {
   *   spinner.fail("Failed to load data");
   * }
   * ```
   *
   * @internal
   */
  protected createSpinner(text: string): SpinnerInterface {
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
   * Generate cache key for client instance
   *
   * @param config - Client configuration
   * @returns Sanitized cache key
   *
   * @remarks
   * Cache keys are generated from region and profile, with special characters
   * replaced to prevent collisions. The format is `{region}::{profile}`.
   *
   * @internal
   */
  private generateCacheKey(config: AwsClientConfig): string {
    const region = this.sanitizeIdentifier(config.region || "default");
    const profile = this.sanitizeIdentifier(config.profile || "default");
    return `${region}::${profile}`;
  }

  /**
   * Sanitize identifier for cache key generation
   *
   * @param value - Identifier to sanitize
   * @returns Sanitized identifier with special characters replaced
   *
   * @remarks
   * Removes characters that could cause cache key collisions or issues.
   * Only alphanumeric characters, hyphens, and underscores are preserved.
   *
   * @internal
   */
  private sanitizeIdentifier(value: string): string {
    return value.replaceAll(/[^a-zA-Z0-9-_]/g, "_");
  }

  /**
   * Clear client caches
   *
   * @remarks
   * Useful for testing or when configuration changes require new client instances.
   * In production, clients are typically cached for the lifetime of the service.
   *
   * @public
   */
  clearClientCache(): void {
    this.clientCache.clear();

    if (this.options.enableDebugLogging) {
      console.debug("Cleared AWS client caches");
    }
  }
}
