/**
 * Tests for time formatting utilities.
 */

import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "@/components/panes/editor-v2/utils/timeFormat";

describe("formatRelativeTime", () => {
  const now = 1700000000000; // Fixed "now" timestamp for testing

  describe("seconds", () => {
    it("should format 0 seconds", () => {
      expect(formatRelativeTime(now, now)).toBe("0s");
    });

    it("should format seconds under a minute", () => {
      expect(formatRelativeTime(now - 5000, now)).toBe("5s");
      expect(formatRelativeTime(now - 30000, now)).toBe("30s");
      expect(formatRelativeTime(now - 59000, now)).toBe("59s");
    });
  });

  describe("minutes", () => {
    it("should format minutes under an hour", () => {
      expect(formatRelativeTime(now - 60000, now)).toBe("1m");
      expect(formatRelativeTime(now - 120000, now)).toBe("2m");
      expect(formatRelativeTime(now - 3540000, now)).toBe("59m");
    });
  });

  describe("hours", () => {
    it("should format hours under a day", () => {
      expect(formatRelativeTime(now - 3600000, now)).toBe("1h");
      expect(formatRelativeTime(now - 7200000, now)).toBe("2h");
      expect(formatRelativeTime(now - 82800000, now)).toBe("23h");
    });
  });

  describe("days", () => {
    it("should format days", () => {
      expect(formatRelativeTime(now - 86400000, now)).toBe("1d");
      expect(formatRelativeTime(now - 172800000, now)).toBe("2d");
      expect(formatRelativeTime(now - 604800000, now)).toBe("7d");
    });
  });

  describe("edge cases", () => {
    it("should handle future timestamps by showing 0s", () => {
      expect(formatRelativeTime(now + 5000, now)).toBe("0s");
    });

    it("should use Date.now() by default", () => {
      const recentTimestamp = Date.now() - 5000;
      const result = formatRelativeTime(recentTimestamp);
      // Should be approximately "5s" (might vary slightly due to test execution time)
      expect(result).toMatch(/^\d+s$/);
    });
  });
});
