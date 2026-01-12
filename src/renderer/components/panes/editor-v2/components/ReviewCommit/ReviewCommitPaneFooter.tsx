/**
 * ReviewCommitPaneFooter - Summary footer for the commit pane.
 *
 * Displays author, timestamp, and file count at the bottom of the commit pane.
 *
 * @example
 * ```tsx
 * <ReviewCommitPaneFooter
 *   fileCount={5}
 *   author="Jane Doe"
 *   timestamp={1704067200}
 * />
 * // Renders: "Jane Doe • 2 days ago • 5 files changed"
 * ```
 */

import { formatRelativeTime } from "../../utils";

export interface ReviewCommitPaneFooterProps {
  /** Number of files changed in the commit */
  fileCount: number;

  /** Author name */
  author?: string;

  /** Unix timestamp (seconds since epoch) */
  timestamp?: number;
}

/**
 * Summary footer showing author, timestamp, and file count.
 */
export function ReviewCommitPaneFooter({
  fileCount,
  author,
  timestamp,
}: ReviewCommitPaneFooterProps) {
  return (
    <div
      className="px-3 py-1.5 border-t border-border text-xs text-muted-foreground bg-muted/30"
      data-testid="commit-footer"
    >
      {author && <span className="text-green-500">{author}</span>}
      {author && timestamp !== undefined && " • "}
      {timestamp !== undefined && formatRelativeTime(timestamp)}
      {(author || timestamp !== undefined) && " • "}
      {fileCount} file{fileCount !== 1 ? "s" : ""} changed
    </div>
  );
}
