/**
 * ReviewCommitPaneHeader - Header displaying commit metadata.
 *
 * Shows commit ID, subject, author, and timestamp in a compact header.
 * Used by CommitChangesPane and other historical commit views.
 *
 * @example
 * ```tsx
 * <ReviewCommitPaneHeader
 *   shortId="abc1234"
 *   subject="Fix bug in authentication"
 *   author="Jane Doe"
 *   timestamp={1704067200}
 *   fileCount={5}
 *   onClose={handleClose}
 * />
 * ```
 */

import { GitCommit } from "lucide-react";
import { formatRelativeTime } from "../../utils";

export interface ReviewCommitPaneHeaderProps {
  /** Short commit hash (7 characters) */
  shortId: string;

  /** Commit subject (first line of message) */
  subject: string;

  /** Author name */
  author: string;

  /** Unix timestamp (seconds since epoch) */
  timestamp: number;

  /** Number of files changed */
  fileCount?: number;

  /** Optional close button callback */
  onClose?: () => void;

  /** Optional additional class name */
  className?: string;
}

/**
 * Compact header showing commit information.
 */
export function ReviewCommitPaneHeader({
  shortId,
  subject,
  author,
  timestamp,
  fileCount,
  onClose,
  className,
}: ReviewCommitPaneHeaderProps) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 border-b border-border bg-elevated ${className ?? ""}`}
      data-testid="commit-header"
    >
      {/* Commit icon */}
      <GitCommit className="w-4 h-4 text-muted-foreground flex-shrink-0" />

      {/* Commit info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {/* Short hash */}
          <span className="font-mono text-xs text-muted-foreground">
            {shortId}
          </span>
          {/* Subject */}
          <span className="truncate text-sm">{subject}</span>
        </div>
        {/* Author and timestamp */}
        <div className="text-xs text-muted-foreground">
          {author} • {formatRelativeTime(timestamp)}
        </div>
      </div>

      {/* File count */}
      {fileCount !== undefined && (
        <span className="text-xs text-muted-foreground flex-shrink-0">
          {fileCount} file{fileCount !== 1 ? "s" : ""}
        </span>
      )}

      {/* Close button */}
      {onClose && (
        <button
          onClick={onClose}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
          data-testid="close-button"
        >
          Close
        </button>
      )}
    </div>
  );
}
