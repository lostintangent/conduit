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
} from "@/components/panes/editor/utils";

// =============================================================================
// formatRelativeTime
// =============================================================================

describe("formatRelativeTime", () => {
  const NOW = 1702400000000; // Fixed "now" for consistent tests (ms)

  it("should format seconds correctly", () => {
    const timestamp = NOW / 1000 - 10;
    expect(formatRelativeTime(timestamp, NOW)).toBe("10s");
  });

  it("should format seconds at boundary", () => {
    const timestamp = NOW / 1000 - 59;
    expect(formatRelativeTime(timestamp, NOW)).toBe("59s");
  });

  it("should format minutes correctly", () => {
    const timestamp = NOW / 1000 - 60 * 5;
    expect(formatRelativeTime(timestamp, NOW)).toBe("5m");
  });

  it("should format hours correctly", () => {
    const timestamp = NOW / 1000 - 60 * 60 * 2;
    expect(formatRelativeTime(timestamp, NOW)).toBe("2h");
  });

  it("should format days correctly", () => {
    const timestamp = NOW / 1000 - 60 * 60 * 24 * 3;
    expect(formatRelativeTime(timestamp, NOW)).toBe("3d");
  });

  it("should format weeks correctly", () => {
    const timestamp = NOW / 1000 - 60 * 60 * 24 * 14;
    expect(formatRelativeTime(timestamp, NOW)).toBe("2w");
  });

  it("should format months correctly", () => {
    const timestamp = NOW / 1000 - 60 * 60 * 24 * 60;
    expect(formatRelativeTime(timestamp, NOW)).toBe("2mo");
  });

  it("should format years correctly", () => {
    const timestamp = NOW / 1000 - 60 * 60 * 24 * 400;
    expect(formatRelativeTime(timestamp, NOW)).toBe("1y");
  });

  it("should handle future timestamps as 0s", () => {
    const timestamp = NOW / 1000 + 1000;
    expect(formatRelativeTime(timestamp, NOW)).toBe("0s");
  });

  it("should use Date.now() by default", () => {
    const now = Date.now();
    const timestamp = Math.floor(now / 1000) - 3600; // 1 hour ago
    const result = formatRelativeTime(timestamp);
    expect(result).toBe("1h");
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
