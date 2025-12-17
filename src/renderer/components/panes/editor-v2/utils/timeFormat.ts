/**
 * Time formatting utilities for editor-v2.
 */

/**
 * Format a timestamp as a relative time string (e.g., "2s", "1m", "3h").
 *
 * Uses compact format without "ago" suffix for space efficiency.
 * Shows:
 * - Seconds for < 1 minute (e.g., "5s")
 * - Minutes for < 1 hour (e.g., "12m")
 * - Hours for < 24 hours (e.g., "3h")
 * - Days for >= 24 hours (e.g., "2d")
 *
 * @param timestamp - Milliseconds since epoch
 * @param now - Current time (default: Date.now()) - useful for testing
 * @returns Formatted relative time string
 */
export function formatRelativeTime(
  timestamp: number,
  now: number = Date.now(),
): string {
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 60) {
    return `${Math.max(0, diffSeconds)}s`;
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes}m`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}h`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}
