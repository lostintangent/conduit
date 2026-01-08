/**
 * Tests for time formatting utilities.
 *
 * All timestamps are Unix seconds. The optional `now` param is in milliseconds
 * (matching Date.now()) for test convenience.
 */

import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "@/components/panes/editor-v2/utils/timeFormat";

describe("formatRelativeTime", () => {
  const nowMs = 1700000000000; // Fixed "now" in ms for testing
  const nowSec = nowMs / 1000; // Same instant in seconds

  describe("seconds", () => {
    it("should format 0 seconds", () => {
      expect(formatRelativeTime(nowSec, nowMs)).toBe("0s");
    });

    it("should format seconds under a minute", () => {
      expect(formatRelativeTime(nowSec - 5, nowMs)).toBe("5s");
      expect(formatRelativeTime(nowSec - 30, nowMs)).toBe("30s");
      expect(formatRelativeTime(nowSec - 59, nowMs)).toBe("59s");
    });
  });

  describe("minutes", () => {
    it("should format minutes under an hour", () => {
      expect(formatRelativeTime(nowSec - 60, nowMs)).toBe("1m");
      expect(formatRelativeTime(nowSec - 120, nowMs)).toBe("2m");
      expect(formatRelativeTime(nowSec - 3540, nowMs)).toBe("59m");
    });
  });

  describe("hours", () => {
    it("should format hours under a day", () => {
      expect(formatRelativeTime(nowSec - 3600, nowMs)).toBe("1h");
      expect(formatRelativeTime(nowSec - 7200, nowMs)).toBe("2h");
      expect(formatRelativeTime(nowSec - 82800, nowMs)).toBe("23h");
    });
  });

  describe("days", () => {
    it("should format days", () => {
      expect(formatRelativeTime(nowSec - 86400, nowMs)).toBe("1d");
      expect(formatRelativeTime(nowSec - 172800, nowMs)).toBe("2d");
      expect(formatRelativeTime(nowSec - 604800, nowMs)).toBe("7d");
    });
  });

  describe("edge cases", () => {
    it("should handle future timestamps by showing 0s", () => {
      expect(formatRelativeTime(nowSec + 5, nowMs)).toBe("0s");
    });

    it("should use Date.now() by default", () => {
      const recentTimestamp = Math.floor(Date.now() / 1000) - 5;
      const result = formatRelativeTime(recentTimestamp);
      // Should be approximately "5s" (might vary slightly due to test execution time)
      expect(result).toMatch(/^\d+s$/);
    });
  });
});
