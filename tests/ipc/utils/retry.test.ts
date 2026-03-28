import { describe, expect, it, vi } from "vitest";
import {
  calculateBackoffWithJitter,
  isRetryableError,
  withRetry,
  withRetrySafe,
} from "../../../src/ipc/utils/retry";

describe("retry utility", () => {
  describe("isRetryableError", () => {
    it.each([
      // HTTP status codes
      ["503 Service Unavailable", true],
      ["502 Bad Gateway", true],
      ["504 Gateway Timeout", true],
      ["429 Too Many Requests", true],

      // Connection errors
      ["ECONNREFUSED", true],
      ["ECONNRESET", true],
      ["ETIMEDOUT", true],
      ["ENOTFOUND", true],
      ["Not connected to server", true],
      ["Connection closed unexpectedly", true],

      // Generic network errors
      ["Network error occurred", true],
      ["socket hang up", true],
      ["Connection timeout", true],

      // WebSocket errors
      ["Unexpected server response: 503", true],
      ["WebSocket was closed before", true],

      // Non-retryable errors
      ["Authentication failed", false],
      ["Invalid credentials", false],
      ["Permission denied", false],
      ["File not found", false],
      ["400 Bad Request", false],
      ["401 Unauthorized", false],
      ["403 Forbidden", false],
      ["404 Not Found", false],
    ])("should return %s for error: %s", (errorMessage, expected) => {
      expect(isRetryableError(new Error(errorMessage))).toBe(expected);
    });

    it("should be case insensitive", () => {
      expect(isRetryableError(new Error("NETWORK ERROR"))).toBe(true);
      expect(isRetryableError(new Error("Socket Hang Up"))).toBe(true);
    });
  });

  // Integration tests for our wrapper behavior (not testing p-retry internals)
  describe("withRetry integration", () => {
    it("should fail immediately on non-retryable errors (our isRetryableError logic)", async () => {
      const operation = vi
        .fn()
        .mockRejectedValue(new Error("Authentication failed"));

      await expect(withRetry(operation)).rejects.toThrow(
        "Authentication failed",
      );

      // Should not retry - this tests OUR logic, not p-retry
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should abort when shouldAbort returns true (our wrapper feature)", async () => {
      const operation = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

      let checkCount = 0;
      const shouldAbort = vi.fn().mockImplementation(() => {
        checkCount++;
        return checkCount > 1; // Abort before second attempt
      });

      await expect(
        withRetry(operation, { maxRetries: 5, shouldAbort }),
      ).rejects.toThrow("Operation aborted");

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it("should call onExhausted when all retries fail", async () => {
      const operation = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
      const onExhausted = vi.fn();

      await expect(
        withRetry(operation, { maxRetries: 2, onExhausted }),
      ).rejects.toThrow("ECONNREFUSED");

      expect(onExhausted).toHaveBeenCalledTimes(1);
      expect(onExhausted).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("ECONNREFUSED"),
        }),
        2, // total attempts
      );
    });

    it("should NOT call onExhausted for non-retryable errors", async () => {
      const operation = vi
        .fn()
        .mockRejectedValue(new Error("Authentication failed"));
      const onExhausted = vi.fn();

      await expect(
        withRetry(operation, { maxRetries: 3, onExhausted }),
      ).rejects.toThrow("Authentication failed");

      // Non-retryable errors abort immediately, not exhaustion
      expect(onExhausted).not.toHaveBeenCalled();
    });
  });

  describe("withRetrySafe", () => {
    it("should return result object instead of throwing", async () => {
      const operation = vi
        .fn()
        .mockRejectedValue(new Error("Authentication failed"));

      const result = await withRetrySafe(operation);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Authentication failed");
    });
  });

  describe("calculateBackoffWithJitter", () => {
    it("should return approximately initial delay for first attempt", () => {
      const delays: number[] = [];
      // Run multiple times due to jitter randomness
      for (let i = 0; i < 100; i++) {
        delays.push(calculateBackoffWithJitter(1, { initialDelayMs: 1000 }));
      }

      // All delays should be close to 1000ms (within jitter range of ±10%)
      const min = Math.min(...delays);
      const max = Math.max(...delays);
      expect(min).toBeGreaterThanOrEqual(900); // 1000 - 10%
      expect(max).toBeLessThanOrEqual(1100); // 1000 + 10%
    });

    it("should increase delay exponentially", () => {
      // Use no jitter for predictable testing
      const delay1 = calculateBackoffWithJitter(1, {
        initialDelayMs: 1000,
        multiplier: 2,
        jitterFactor: 0,
      });
      const delay2 = calculateBackoffWithJitter(2, {
        initialDelayMs: 1000,
        multiplier: 2,
        jitterFactor: 0,
      });
      const delay3 = calculateBackoffWithJitter(3, {
        initialDelayMs: 1000,
        multiplier: 2,
        jitterFactor: 0,
      });

      expect(delay1).toBe(1000);
      expect(delay2).toBe(2000);
      expect(delay3).toBe(4000);
    });

    it("should cap delay at maxDelayMs", () => {
      const delay = calculateBackoffWithJitter(10, {
        initialDelayMs: 1000,
        maxDelayMs: 5000,
        multiplier: 2,
        jitterFactor: 0,
      });

      expect(delay).toBe(5000);
    });

    it("should apply jitter to prevent thundering herd", () => {
      const delays = new Set<number>();

      // Generate many delays for the same attempt
      for (let i = 0; i < 50; i++) {
        delays.add(
          Math.round(
            calculateBackoffWithJitter(3, {
              initialDelayMs: 1000,
              multiplier: 1.5,
              jitterFactor: 0.2,
            }),
          ),
        );
      }

      // With jitter, we should get varied results
      expect(delays.size).toBeGreaterThan(10);
    });

    it("should use sensible defaults", () => {
      const delay = calculateBackoffWithJitter(1);

      // Default initialDelayMs is 1000, jitterFactor is 0.2 (±10%)
      expect(delay).toBeGreaterThanOrEqual(900);
      expect(delay).toBeLessThanOrEqual(1100);
    });
  });
});
