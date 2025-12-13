/**
 * Tests for commit display utilities.
 *
 * These tests verify the pure utility functions for formatting
 * commit data like relative times and text truncation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  formatRelativeTime,
  formatFullDate,
  truncateText,
  getFirstLine,
} from "@/components/panes/editor-v2/components/CommitGraph/commit/utils";

// =============================================================================
// formatRelativeTime
// =============================================================================

describe("formatRelativeTime", () => {
  const NOW = 1702400000000; // Fixed "now" for consistent tests

  it("should return 'just now' for very recent times", () => {
    // 10 seconds ago
    const timestamp = NOW / 1000 - 10;
    expect(formatRelativeTime(timestamp, NOW)).toBe("just now");
  });

  it("should return 'just now' for times less than 30 seconds", () => {
    const timestamp = NOW / 1000 - 29;
    expect(formatRelativeTime(timestamp, NOW)).toBe("just now");
  });

  it("should format seconds correctly", () => {
    const timestamp = NOW / 1000 - 45;
    expect(formatRelativeTime(timestamp, NOW)).toBe("45s ago");
  });

  it("should format minutes correctly", () => {
    const timestamp = NOW / 1000 - 60 * 5;
    expect(formatRelativeTime(timestamp, NOW)).toBe("5m ago");
  });

  it("should format hours correctly", () => {
    const timestamp = NOW / 1000 - 60 * 60 * 2;
    expect(formatRelativeTime(timestamp, NOW)).toBe("2h ago");
  });

  it("should format days correctly", () => {
    const timestamp = NOW / 1000 - 60 * 60 * 24 * 3;
    expect(formatRelativeTime(timestamp, NOW)).toBe("3d ago");
  });

  it("should format weeks correctly", () => {
    const timestamp = NOW / 1000 - 60 * 60 * 24 * 14;
    expect(formatRelativeTime(timestamp, NOW)).toBe("2w ago");
  });

  it("should format months correctly", () => {
    const timestamp = NOW / 1000 - 60 * 60 * 24 * 60;
    expect(formatRelativeTime(timestamp, NOW)).toBe("2mo ago");
  });

  it("should format years correctly", () => {
    const timestamp = NOW / 1000 - 60 * 60 * 24 * 400;
    expect(formatRelativeTime(timestamp, NOW)).toBe("1y ago");
  });

  it("should handle future timestamps", () => {
    const timestamp = NOW / 1000 + 1000;
    expect(formatRelativeTime(timestamp, NOW)).toBe("in the future");
  });

  it("should use Date.now() by default", () => {
    const now = Date.now();
    const timestamp = now / 1000 - 3600; // 1 hour ago
    const result = formatRelativeTime(timestamp);
    expect(result).toBe("1h ago");
  });
});

// =============================================================================
// formatFullDate
// =============================================================================

describe("formatFullDate", () => {
  it("should format a date correctly", () => {
    // Dec 12, 2023, 4:00 PM UTC
    const timestamp = 1702400000;
    const result = formatFullDate(timestamp);

    // The format depends on locale, but should contain expected parts
    expect(result).toContain("Dec");
    expect(result).toContain("12");
    expect(result).toContain("2023");
  });

  it("should handle different timestamps", () => {
    // Jan 1, 2024, 12:00 PM UTC
    const timestamp = 1704110400;
    const result = formatFullDate(timestamp);

    expect(result).toContain("Jan");
    expect(result).toContain("1");
    expect(result).toContain("2024");
  });
});

// =============================================================================
// truncateText
// =============================================================================

describe("truncateText", () => {
  it("should not truncate short text", () => {
    expect(truncateText("Hello", 10)).toBe("Hello");
  });

  it("should return exact text when at max length", () => {
    expect(truncateText("Hello", 5)).toBe("Hello");
  });

  it("should truncate long text with ellipsis", () => {
    expect(truncateText("Hello World", 8)).toBe("Hello W…");
  });

  it("should handle empty string", () => {
    expect(truncateText("", 10)).toBe("");
  });

  it("should handle max length of 1", () => {
    expect(truncateText("Hello", 1)).toBe("…");
  });
});

// =============================================================================
// getFirstLine
// =============================================================================

describe("getFirstLine", () => {
  it("should return the first line of multi-line text", () => {
    expect(getFirstLine("First line\nSecond line")).toBe("First line");
  });

  it("should return the whole text if no newline", () => {
    expect(getFirstLine("Single line")).toBe("Single line");
  });

  it("should handle empty string", () => {
    expect(getFirstLine("")).toBe("");
  });

  it("should handle text starting with newline", () => {
    expect(getFirstLine("\nSecond line")).toBe("");
  });

  it("should handle Windows-style line endings", () => {
    // \r\n - should stop at \n
    expect(getFirstLine("First\r\nSecond")).toBe("First\r");
  });

  it("should handle multiple newlines", () => {
    expect(getFirstLine("First\n\nThird")).toBe("First");
  });
});
