/**
 * Retry utilities for network operations.
 *
 * Uses p-retry for battle-tested retry logic with exponential backoff,
 * combined with our domain-specific retryable error detection.
 *
 * @see tests/ipc/utils/retry.test.ts for test coverage of error patterns
 */

import pRetry, { AbortError } from "p-retry";

// ============================================================================
// Retryable Error Detection
// ============================================================================

/**
 * Common patterns that indicate transient/retryable network errors.
 *
 * These patterns are matched case-insensitively against error messages.
 * Add new patterns here when encountering new transient error types.
 *
 * NOTE: When adding patterns, also add corresponding test cases in
 *       tests/ipc/utils/retry.test.ts to maintain test coverage.
 */
const RETRYABLE_ERROR_PATTERNS = [
  // HTTP status codes
  "503", // Service unavailable
  "502", // Bad gateway
  "504", // Gateway timeout
  "429", // Too many requests (rate limited)

  // Connection errors
  "econnrefused", // Connection refused
  "econnreset", // Connection reset
  "etimedout", // Connection timed out
  "enotfound", // DNS lookup failed
  "enetunreach", // Network unreachable
  "ehostunreach", // Host unreachable
  "not connected", // Client not connected
  "connection closed", // Connection was closed

  // Generic network errors
  "network", // Generic network error
  "socket hang up", // Socket closed unexpectedly
  "timeout", // Generic timeout
  "connection timeout", // Connection timeout

  // WebSocket errors
  "unexpected server response", // WebSocket connection issues
  "closed before", // WebSocket closed before established
  "websocket was closed", // WebSocket closed error
] as const;

/**
 * Check if an error is retryable based on common network error patterns.
 *
 * @param error - The error to check
 * @returns true if the error appears to be a transient network issue
 */
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return RETRYABLE_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration for retry behavior.
 *
 * For context-specific retry logic, you can customize behavior per-call.
 * The default `isRetryableError` covers common network patterns, but you
 * can provide custom logic for specialized error handling.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;

  /**
   * Callback invoked on each failed attempt before retry.
   * Use for logging, metrics, or debugging.
   */
  onRetry?: (attempt: number, error: Error) => void;

  /**
   * Callback invoked when all retries are exhausted.
   * Use for alerting, metrics, or cleanup.
   * This is called before the final error is thrown.
   */
  onExhausted?: (error: Error, totalAttempts: number) => void;

  /** Callback to check if operation should be aborted early */
  shouldAbort?: () => boolean;
}

/**
 * Result of a retry operation
 */
export interface RetryResult<T> {
  success: boolean;
  value?: T;
  error?: Error;
  attempts: number;
}

// ============================================================================
// Retry Functions
// ============================================================================

/**
 * Execute an async operation with automatic retry on failure.
 *
 * Uses p-retry with exponential backoff and our domain-specific error detection.
 *
 * @param operation - The async operation to execute
 * @param config - Retry configuration options
 * @returns Promise resolving to the operation result or throwing after all retries exhausted
 *
 * @example
 * ```typescript
 * // Simple usage with defaults
 * const result = await withRetry(() => fetchData(url));
 *
 * // With custom configuration
 * const result = await withRetry(
 *   () => connectToServer(),
 *   {
 *     maxRetries: 5,
 *     onRetry: (attempt, error) => console.log(`Retry ${attempt}: ${error.message}`),
 *   }
 * );
 *
 * // With abort condition
 * const result = await withRetry(
 *   () => connectToVM(vmId),
 *   {
 *     shouldAbort: () => isSessionDisposed(vmId),
 *   }
 * );
 * ```
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = {},
): Promise<T> {
  const { maxRetries = 3, onRetry, onExhausted, shouldAbort } = config;
  let attemptCount = 0;

  try {
    return await pRetry(
      async () => {
        attemptCount++;

        // Check if we should abort before attempting
        if (shouldAbort?.()) {
          throw new AbortError("Operation aborted");
        }

        try {
          return await operation();
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error));

          // If not retryable, wrap in AbortError to stop retrying
          if (!isRetryableError(err)) {
            throw new AbortError(err.message);
          }

          throw err;
        }
      },
      {
        retries: maxRetries - 1, // p-retry counts retries, not total attempts
        onFailedAttempt: (error) => {
          onRetry?.(error.attemptNumber, error as unknown as Error);
        },
      },
    );
  } catch (error) {
    // Call onExhausted if all retries failed (not for abort or non-retryable)
    const err = error instanceof Error ? error : new Error(String(error));
    if (onExhausted && attemptCount >= maxRetries) {
      onExhausted(err, attemptCount);
    }
    throw error;
  }
}

/**
 * Execute an async operation with retry, returning a result object instead of throwing.
 *
 * Useful when you want to handle failures gracefully without try/catch.
 *
 * @param operation - The async operation to execute
 * @param config - Retry configuration options
 * @returns Promise resolving to a result object with success status
 */
export async function withRetrySafe<T>(
  operation: () => Promise<T>,
  config: RetryConfig = {},
): Promise<RetryResult<T>> {
  let attempts = 0;

  try {
    const value = await withRetry(operation, {
      ...config,
      onRetry: (attempt, error) => {
        attempts = attempt;
        config.onRetry?.(attempt, error);
      },
    });
    return { success: true, value, attempts: attempts || 1 };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
      attempts: attempts || 1,
    };
  }
}

// Re-export AbortError for consumers who need to abort programmatically
export { AbortError } from "p-retry";
