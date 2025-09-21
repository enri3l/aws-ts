/**
 * AWS credential service for SDK integration
 *
 * Provides AWS SDK client factory methods with proper credential management
 * using the AWS credential provider chain. Integrates with AWS CLI authentication
 * for seamless credential resolution.
 *
 */

import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";
import { AuthenticationError } from "../lib/auth-errors.js";
import { ServiceError } from "../lib/errors.js";

interface AwsCredentialIdentity {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  expiration?: Date;
}

interface CredentialProvider {
  (): Promise<AwsCredentialIdentity>;
}

interface ProviderOptions {
  profile?: string;
  timeout?: number;
  maxRetries?: number;
}

interface ClientConfiguration {
  region?: string;
  credentials?: AwsCredentialIdentity;
  endpoint?: string | undefined;
  [key: string]: unknown;
}

/**
 * Configuration options for credential service
 *
 * @public
 */
export interface CredentialServiceOptions {
  /**
   * Default AWS region for clients
   */
  defaultRegion?: string;

  /**
   * Default AWS profile to use
   */
  defaultProfile?: string;

  /**
   * Enable debug logging for credential operations
   */
  enableDebugLogging?: boolean;

  /**
   * Custom credential provider chain options
   */
  credentialProviderOptions?: {
    /**
     * Timeout for credential resolution in milliseconds
     */
    timeout?: number;

    /**
     * Maximum number of retry attempts
     */
    maxRetries?: number;
  };
}

/**
 * AWS client configuration for service operations
 *
 * @public
 */
export interface AwsClientConfig {
  /**
   * AWS region for the client
   */
  region?: string;

  /**
   * AWS profile to use for credentials
   */
  profile?: string;

  /**
   * Custom endpoint URL for testing
   */
  endpoint?: string;

  /**
   * Additional client configuration
   */
  clientConfig?: Record<string, unknown>;
}

/**
 * Caller identity information from AWS STS
 *
 * @public
 */
export interface CallerIdentity {
  /**
   * AWS user ID
   */
  userId: string;

  /**
   * AWS account ID
   */
  account: string;

  /**
   * AWS ARN of the caller
   */
  arn: string;

  /**
   * AWS profile used for the identity
   */
  profile?: string;
}

/**
 * AWS credential service for SDK integration
 *
 * Provides factory methods for creating AWS SDK clients with proper
 * credential management and integrates with AWS CLI authentication.
 *
 * @public
 */
export class CredentialService {
  private readonly options: Required<CredentialServiceOptions>;
  private readonly credentialCache = new Map<string, CredentialProvider>();

  /**
   * Create a new credential service instance
   *
   * @param options - Configuration options for the service
   */
  constructor(options: CredentialServiceOptions = {}) {
    this.options = {
      defaultRegion: options.defaultRegion ?? process.env.AWS_REGION ?? "us-east-1",
      defaultProfile: options.defaultProfile ?? process.env.AWS_PROFILE ?? "default",
      enableDebugLogging: options.enableDebugLogging ?? false,
      credentialProviderOptions: {
        timeout: options.credentialProviderOptions?.timeout ?? 30_000,
        maxRetries: options.credentialProviderOptions?.maxRetries ?? 3,
        ...options.credentialProviderOptions,
      },
    };
  }

  /**
   * Get AWS credentials for a specific profile
   *
   * @param profile - AWS profile name to get credentials for
   * @returns Promise resolving to AWS credentials
   * @throws \{AuthenticationError\} When credential resolution fails
   */
  async getCredentials(profile?: string): Promise<AwsCredentialIdentity> {
    // Use environment credentials when they exist and no explicit profile given
    const profileName =
      profile ?? (process.env.AWS_ACCESS_KEY_ID ? undefined : this.options.defaultProfile);
    const cacheKey = `credentials-${profileName ?? "env"}`;

    try {
      let credentialProvider = this.credentialCache.get(cacheKey);

      if (!credentialProvider) {
        const providerOptions: ProviderOptions = {};
        if (this.options.credentialProviderOptions.timeout !== undefined) {
          providerOptions.timeout = this.options.credentialProviderOptions.timeout;
        }
        if (this.options.credentialProviderOptions.maxRetries !== undefined) {
          providerOptions.maxRetries = this.options.credentialProviderOptions.maxRetries;
        }

        credentialProvider = profileName
          ? fromNodeProviderChain({ ...providerOptions, profile: profileName })
          : fromNodeProviderChain(providerOptions);

        this.credentialCache.set(cacheKey, credentialProvider);

        if (this.options.enableDebugLogging) {
          console.debug(`Created credential provider for profile: ${profileName}`);
        }
      }

      const credentials = await credentialProvider();

      if (this.options.enableDebugLogging) {
        console.debug(`Retrieved credentials for profile: ${profileName}`);
      }

      return credentials;
    } catch (error) {
      // Clear cache entry on error
      this.credentialCache.delete(cacheKey);

      throw new AuthenticationError(
        `Failed to get credentials for profile '${profileName}'`,
        "credential-resolution",
        profileName,
        error,
      );
    }
  }

  /**
   * Create an STS client with proper credentials
   *
   * @param config - Client configuration options
   * @returns Configured STS client
   * @throws \{ServiceError\} When client creation fails
   */
  async createStsClient(config: AwsClientConfig = {}): Promise<STSClient> {
    try {
      const credentials = await this.getCredentials(config.profile);

      const clientConfig = {
        region: config.region ?? this.options.defaultRegion,
        credentials,
        ...config.clientConfig,
        ...(config.endpoint && { endpoint: config.endpoint }),
      };

      return new STSClient(clientConfig);
    } catch (error) {
      throw new ServiceError(
        `Failed to create STS client: ${error instanceof Error ? error.message : String(error)}`,
        "STS",
        "client-creation",
        error,
      );
    }
  }

  /**
   * Validate credentials by calling AWS STS GetCallerIdentity
   *
   * @param profile - AWS profile to validate credentials for
   * @returns Promise resolving to caller identity information
   * @throws \{AuthenticationError\} When credential validation fails
   */
  async validateCredentials(profile?: string): Promise<CallerIdentity> {
    // Use environment credentials when they exist and no explicit profile given
    const profileName =
      profile ?? (process.env.AWS_ACCESS_KEY_ID ? undefined : this.options.defaultProfile);

    try {
      // Only include profile in config if it's defined
      const clientConfig: AwsClientConfig = {};
      if (profileName) {
        clientConfig.profile = profileName;
      }
      const stsClient = await this.createStsClient(clientConfig);
      const command = new GetCallerIdentityCommand({});

      if (this.options.enableDebugLogging) {
        console.debug(`Validating credentials for profile: ${profileName}`);
      }

      const response = await stsClient.send(command);

      if (!response.UserId || !response.Account || !response.Arn) {
        throw new AuthenticationError(
          `Invalid caller identity response for profile '${profileName}'`,
          "credential-validation",
          profileName,
          { response },
        );
      }

      const identity: CallerIdentity = {
        userId: response.UserId,
        account: response.Account,
        arn: response.Arn,
        ...(profileName && { profile: profileName }),
      };

      if (this.options.enableDebugLogging) {
        console.debug(`Credentials validated for profile: ${profileName}`, {
          account: identity.account,
          arn: identity.arn,
        });
      }

      return identity;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      // In integration test environment, allow AWS SDK errors to propagate for test assertions
      if (process.env.AWS_INTEGRATION_TEST === "true" && error instanceof Error) {
        throw error;
      }

      throw new AuthenticationError(
        `Failed to validate credentials for profile '${profileName ?? "environment"}'`,
        "credential-validation",
        profileName,
        error,
      );
    }
  }

  /**
   * Check if credentials are available for a profile
   *
   * @param profile - AWS profile to check credentials for
   * @returns Promise resolving to true if credentials are available
   */
  async hasValidCredentials(profile?: string): Promise<boolean> {
    try {
      await this.validateCredentials(profile);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clear cached credentials for a profile
   *
   * @param profile - AWS profile to clear credentials for
   */
  clearCredentialCache(profile?: string): void {
    // Use environment credentials when they exist and no explicit profile given
    const profileName =
      profile ?? (process.env.AWS_ACCESS_KEY_ID ? undefined : this.options.defaultProfile);
    const cacheKey = `credentials-${profileName ?? "env"}`;

    this.credentialCache.delete(cacheKey);

    if (this.options.enableDebugLogging) {
      console.debug(`Cleared credential cache for profile: ${profileName}`);
    }
  }

  /**
   * Clear all cached credentials
   *
   */
  clearAllCredentialCaches(): void {
    this.credentialCache.clear();

    if (this.options.enableDebugLogging) {
      console.debug("Cleared all credential caches");
    }
  }

  /**
   * Get the current active profile name
   *
   * @returns The currently active AWS profile name
   */
  getActiveProfile(): string {
    return process.env.AWS_PROFILE ?? this.options.defaultProfile;
  }

  /**
   * Set the active profile for the current session
   *
   * @param profile - AWS profile name to set as active
   */
  setActiveProfile(profile: string): void {
    process.env.AWS_PROFILE = profile;

    if (this.options.enableDebugLogging) {
      console.debug(`Set active profile to: ${profile}`);
    }
  }

  /**
   * Create a generic AWS client with proper credentials
   *
   * @param ClientClass - AWS SDK client class constructor
   * @param config - Client configuration options
   * @returns Promise resolving to configured AWS client
   * @throws \{ServiceError\} When client creation fails
   *
   * @example
   * ```typescript
   * const credentialService = new CredentialService();
   * const dynamoClient = await credentialService.createClient(DynamoDBClient, {
   *   region: 'us-west-2',
   *   profile: 'my-profile'
   * });
   * ```
   */
  async createClient<T>(
    ClientClass: new (config: ClientConfiguration) => T,
    config: AwsClientConfig = {},
  ): Promise<T> {
    try {
      const credentials = await this.getCredentials(config.profile);

      const clientConfig = {
        region: config.region ?? this.options.defaultRegion,
        credentials,
        ...config.clientConfig,
        ...(config.endpoint && { endpoint: config.endpoint }),
      };

      return new ClientClass(clientConfig);
    } catch (error) {
      throw new ServiceError(
        `Failed to create AWS client: ${error instanceof Error ? error.message : String(error)}`,
        "AWS",
        "client-creation",
        error,
      );
    }
  }

  /**
   * Test credential provider chain resolution
   *
   * @param profile - AWS profile to test
   * @returns Promise resolving to credential provider chain information
   * @throws \{AuthenticationError\} When credential chain resolution fails
   */
  async testCredentialChain(profile?: string): Promise<{
    profile?: string;
    credentialsAvailable: boolean;
    providerUsed: string;
    identity?: CallerIdentity;
  }> {
    // Use environment credentials when they exist and no explicit profile given
    const profileName =
      profile ?? (process.env.AWS_ACCESS_KEY_ID ? undefined : this.options.defaultProfile);

    try {
      await this.getCredentials(profileName);
      const identity = await this.validateCredentials(profileName);

      return {
        ...(profileName && { profile: profileName }),
        credentialsAvailable: true,
        providerUsed: "node-provider-chain",
        identity,
      };
    } catch {
      return {
        ...(profileName && { profile: profileName }),
        credentialsAvailable: false,
        providerUsed: "unknown",
      };
    }
  }
}
