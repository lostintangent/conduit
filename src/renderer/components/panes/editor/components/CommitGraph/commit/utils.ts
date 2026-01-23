/**
 * Commit Display Utilities
 *
 * Helper functions for formatting and displaying commit data.
 * These are pure functions that can be easily tested.
 *
 * Note: Time formatting (formatRelativeTime, formatFullDate) has been
 * consolidated into the shared utils at editor/utils/timeFormat.ts.
 */

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
