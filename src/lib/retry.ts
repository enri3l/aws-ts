/**
 * @module retry
 * Retry logic abstraction with exponential backoff
 *
 * Provides configurable retry strategies for AWS SDK operations
 * with exponential backoff and jitter to handle transient failures.
 *
 * This module implements retry patterns following AWS SDK v3 best practices:
 * - Exponential backoff with full jitter
 * - Configurable max attempts and base delays
 * - Support for custom retry conditions
 * - Automatic handling of throttling errors
 *
 * @public
 */

/**
 * Retry configuration options
 *
 * @public
 */
export interface RetryConfig {
  /**
   * Maximum number of retry attempts (default: 3)
   */
  maxAttempts?: number;

  /**
   * Base delay in milliseconds for exponential backoff (default: 100)
   */
  baseDelayMs?: number;

  /**
   * Maximum delay in milliseconds between retries (default: 20000)
   */
  maxDelayMs?: number;

  /**
   * Custom function to determine if an error should be retried.
   * By default, retries on throttling and transient AWS errors.
   */
  shouldRetry?: (error: unknown, attempt: number) => boolean;

  /**
   * Callback invoked before each retry attempt
   */
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void;
}

/**
 * Default retry configuration
 * @internal
 */
const DEFAULT_CONFIG: Required<Omit<RetryConfig, "onRetry">> = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 20_000,
  shouldRetry: isRetryableError,
};

/**
 * Determines if an error is retryable
 *
 * @param error - The error to check
 * @param attempt - Current attempt number (1-indexed)
 * @returns True if the error should be retried
 *
 * @public
 */
export function isRetryableError(error: unknown, attempt: number): boolean {
  if (attempt >= DEFAULT_CONFIG.maxAttempts) {
    return false;
  }

  // Handle AWS SDK errors
  if (error && typeof error === "object" && "name" in error) {
    const errorName = (error as { name: string }).name;

    // Throttling errors
    if (
      errorName === "ThrottlingException" ||
      errorName === "TooManyRequestsException" ||
      errorName === "ProvisionedThroughputExceededException" ||
      errorName === "RequestLimitExceeded"
    ) {
      return true;
    }

    // Transient errors
    if (
      errorName === "RequestTimeout" ||
      errorName === "ServiceUnavailable" ||
      errorName === "InternalServerError" ||
      errorName === "NetworkingError"
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and full jitter
 *
 * Implements the "Full Jitter" strategy recommended by AWS:
 * delay = random_between(0, min(maxDelay, baseDelay * 2^attempt))
 *
 * @param attempt - Current attempt number (0-indexed)
 * @param baseDelayMs - Base delay in milliseconds
 * @param maxDelayMs - Maximum delay in milliseconds
 * @returns Delay in milliseconds
 *
 * @internal
 */
function calculateDelayWithJitter(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
  // Full jitter: random value between 0 and cappedDelay
  // eslint-disable-next-line sonarjs/pseudo-random -- Math.random() is safe for backoff jitter (not cryptographic)
  return Math.floor(Math.random() * cappedDelay);
}

/**
 * Sleep for the specified duration
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after the delay
 *
 * @internal
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute a function with automatic retry on failure
 *
 * Implements exponential backoff with full jitter following AWS best practices.
 * Automatically retries on throttling and transient errors.
 *
 * @param fn - Async function to execute
 * @param config - Retry configuration options
 * @returns Promise resolving to the function's return value
 * @throws The last error if all retry attempts fail
 *
 * @public
 *
 * @example
 * ```typescript
 * import { retryWithBackoff } from './retry';
 *
 * const result = await retryWithBackoff(
 *   async () => await lambdaClient.send(command),
 *   { maxAttempts: 5, baseDelayMs: 200 }
 * );
 * ```
 *
 * @example
 * ```typescript
 * // Custom retry condition
 * const result = await retryWithBackoff(
 *   async () => await someOperation(),
 *   {
 *     shouldRetry: (error) => error.code === 'CUSTOM_ERROR',
 *     onRetry: (error, attempt, delay) => {
 *       console.log(`Retry attempt ${attempt} after ${delay}ms`);
 *     }
 *   }
 * );
 * ```
 */
export async function retryWithBackoff<T>(
  function_: () => Promise<T>,
  config: RetryConfig = {},
): Promise<T> {
  const maxAttempts = config.maxAttempts ?? DEFAULT_CONFIG.maxAttempts;
  const baseDelayMs = config.baseDelayMs ?? DEFAULT_CONFIG.baseDelayMs;
  const maxDelayMs = config.maxDelayMs ?? DEFAULT_CONFIG.maxDelayMs;
  const shouldRetry = config.shouldRetry ?? DEFAULT_CONFIG.shouldRetry;

  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await function_();
    } catch (error) {
      lastError = error;

      // Check if we should retry
      if (!shouldRetry(error, attempt + 1)) {
        throw error;
      }

      // Don't delay after the last attempt
      if (attempt < maxAttempts - 1) {
        const delayMs = calculateDelayWithJitter(attempt, baseDelayMs, maxDelayMs);

        // Invoke onRetry callback if provided
        if (config.onRetry) {
          config.onRetry(error, attempt + 1, delayMs);
        }

        await sleep(delayMs);
      }
    }
  }

  // All attempts failed, throw the last error
  throw lastError;
}

/**
 * Create a retry wrapper for a specific service
 *
 * Returns a configured retry function with service-specific defaults.
 *
 * @param serviceConfig - Service-specific retry configuration
 * @returns Configured retry function
 *
 * @public
 *
 * @example
 * ```typescript
 * // Create a retry wrapper for Lambda with custom config
 * const retryLambda = createRetryWrapper({
 *   maxAttempts: 5,
 *   baseDelayMs: 200,
 *   onRetry: (error, attempt) => {
 *     console.log(`Lambda retry attempt ${attempt}`);
 *   }
 * });
 *
 * const result = await retryLambda(() => client.send(command));
 * ```
 */
export function createRetryWrapper(
  serviceConfig: RetryConfig,
): <T>(function_: () => Promise<T>) => Promise<T> {
  return <T>(function_: () => Promise<T>) => retryWithBackoff(function_, serviceConfig);
}
