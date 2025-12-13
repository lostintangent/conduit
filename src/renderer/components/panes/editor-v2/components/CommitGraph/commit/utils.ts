/**
 * Commit Display Utilities
 *
 * Helper functions for formatting and displaying commit data.
 * These are pure functions that can be easily tested.
 */

// =============================================================================
// Time Formatting
// =============================================================================

/**
 * Time unit definitions for relative time calculation.
 * Ordered from largest to smallest for efficient lookup.
 */
const TIME_UNITS: Array<{ name: string; seconds: number }> = [
  { name: "y", seconds: 365 * 24 * 60 * 60 },
  { name: "mo", seconds: 30 * 24 * 60 * 60 },
  { name: "w", seconds: 7 * 24 * 60 * 60 },
  { name: "d", seconds: 24 * 60 * 60 },
  { name: "h", seconds: 60 * 60 },
  { name: "m", seconds: 60 },
  { name: "s", seconds: 1 },
];

/**
 * Format a Unix timestamp as relative time (e.g., "2h ago", "3d ago").
 *
 * Uses compact format for space efficiency in the commit list.
 * Shows "just now" for very recent commits (< 30 seconds).
 *
 * @param timestamp - Unix timestamp in seconds (git timestamp format)
 * @param now - Current time in milliseconds (defaults to Date.now())
 * @returns Relative time string like "2h ago", "3d ago", "just now"
 *
 * @example
 * ```ts
 * formatRelativeTime(Date.now() / 1000 - 3600) // => "1h ago"
 * formatRelativeTime(Date.now() / 1000 - 86400 * 2) // => "2d ago"
 * formatRelativeTime(Date.now() / 1000 - 10) // => "just now"
 * ```
 */
export function formatRelativeTime(
  timestamp: number,
  now: number = Date.now(),
): string {
  // Convert git timestamp (seconds) to milliseconds for comparison
  const timestampMs = timestamp * 1000;
  const diffSeconds = Math.floor((now - timestampMs) / 1000);

  // Handle edge cases
  if (diffSeconds < 0) {
    return "in the future";
  }

  if (diffSeconds < 30) {
    return "just now";
  }

  // Find the appropriate time unit
  for (const unit of TIME_UNITS) {
    const value = Math.floor(diffSeconds / unit.seconds);
    if (value >= 1) {
      return `${value}${unit.name} ago`;
    }
  }

  return "just now";
}

/**
 * Format a full date for tooltip display.
 *
 * Shows complete date and time for when user hovers over relative time.
 *
 * @param timestamp - Unix timestamp in seconds
 * @returns Full date string like "Dec 12, 2025, 3:45 PM"
 */
export function formatFullDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// =============================================================================
// Text Formatting
// =============================================================================

/**
 * Truncate text with ellipsis if it exceeds max length.
 *
 * @param text - The text to truncate
 * @param maxLength - Maximum length before truncation
 * @returns Truncated text with "..." if needed
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 1) + "…";
}

/**
 * Extract the first line from a potentially multi-line string.
 *
 * @param text - The full text
 * @returns First line only
 */
export function getFirstLine(text: string): string {
  const newlineIndex = text.indexOf("\n");
  return newlineIndex >= 0 ? text.slice(0, newlineIndex) : text;
}
