/**
 * Time formatting utilities for editor.
 */

/**
 * Format a Unix timestamp as a compact relative time string.
 *
 * Output format: "2s", "5m", "3h", "7d", "2w", "3mo", "1y"
 *
 * @param timestamp - Unix timestamp in seconds
 * @param now - Current time in ms for testing (defaults to Date.now())
 * @returns Formatted relative time string
 *
 * @example
 * formatRelativeTime(Math.floor(Date.now() / 1000) - 3600) // => "1h"
 */
export function formatRelativeTime(timestamp: number, now?: number): string {
  const nowMs = now ?? Date.now();
  const timestampMs = timestamp * 1000;
  const diffMs = nowMs - timestampMs;
  const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));

  // Seconds
  if (diffSeconds < 60) {
    return `${diffSeconds}s`;
  }

  // Minutes
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  // Hours
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  // Days (up to 2 weeks)
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 14) {
    return `${diffDays}d`;
  }

  // Weeks (up to ~2 months)
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 8) {
    return `${diffWeeks}w`;
  }

  // Months (up to 1 year)
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) {
    return `${diffMonths}mo`;
  }

  // Years
  const diffYears = Math.floor(diffDays / 365);
  return `${diffYears}y`;
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
