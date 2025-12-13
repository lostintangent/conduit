/**
 * CommitReviewHeader - Header component for commit review pane.
 *
 * Displays commit metadata in a compact header:
 * - Back button for navigation
 * - Commit subject (first line of message)
 * - Author, date, and short hash
 * - Change statistics (files, +/-)
 *
 * Designed to be visually consistent with other editor toolbars.
 *
 * @example
 * ```tsx
 * <CommitReviewHeader
 *   subject="Fix authentication bug"
 *   shortId="abc123f"
 *   author="John Doe"
 *   timestamp={1699574400}
 *   stats={{ filesChanged: 3, additions: 45, deletions: 12 }}
 *   onBack={() => exitCommitReview()}
 * />
 * ```
 */

import { ChevronLeft, Eye, GitCommit, User, Calendar } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface CommitReviewHeaderProps {
  /** Commit subject (first line of message) */
  subject: string;

  /** Short commit ID for display */
  shortId: string;

  /** Full commit ID (for tooltip) */
  fullId?: string;

  /** Author name */
  author: string;

  /** Commit timestamp (Unix epoch seconds) */
  timestamp: number;

  /** Change statistics */
  stats: {
    filesChanged: number;
    additions: number;
    deletions: number;
  };

  /** Handler for back button click */
  onBack?: () => void;
}

/**
 * Format a Unix timestamp to a relative date string.
 */
function formatRelativeDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return "today";
  } else if (diffDays === 1) {
    return "yesterday";
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7);
    return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  } else if (diffDays < 365) {
    const months = Math.floor(diffDays / 30);
    return `${months} month${months > 1 ? "s" : ""} ago`;
  } else {
    const years = Math.floor(diffDays / 365);
    return `${years} year${years > 1 ? "s" : ""} ago`;
  }
}

/**
 * Format a Unix timestamp to a full date string.
 */
function formatFullDate(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Header for the commit review pane showing commit metadata.
 */
export function CommitReviewHeader({
  subject,
  shortId,
  fullId,
  author,
  timestamp,
  stats,
  onBack,
}: CommitReviewHeaderProps) {
  const buttonClass =
    "p-1 rounded hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <div
      className="flex flex-col bg-elevated border-b shrink-0"
      data-testid="commit-review-header"
    >
      {/* Top row: back button, subject, read-only badge */}
      <div className="flex items-center gap-2 px-3 py-1.5 text-[13px]">
        {/* Back button */}
        {onBack && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onBack}
                className={buttonClass}
                aria-label="Go back"
                data-testid="back-button"
              >
                <ChevronLeft size={14} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Go back</TooltipContent>
          </Tooltip>
        )}

        {/* Commit subject */}
        <span
          className="truncate font-medium text-foreground flex-1 min-w-0"
          data-testid="commit-subject"
        >
          {subject}
        </span>

        {/* Read-only indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="flex items-center gap-1 text-xs text-muted-foreground shrink-0"
              data-testid="read-only-indicator"
            >
              <Eye size={12} />
              <span>Read-only</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Historical commit view (read-only)
          </TooltipContent>
        </Tooltip>
      </div>

      {/* Bottom row: metadata */}
      <div className="flex items-center gap-4 px-3 py-1 text-xs text-muted-foreground border-t border-border/50">
        {/* Commit hash */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="flex items-center gap-1 font-mono shrink-0"
              data-testid="commit-hash"
            >
              <GitCommit size={12} />
              {shortId}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{fullId || shortId}</TooltipContent>
        </Tooltip>

        {/* Author */}
        <span
          className="flex items-center gap-1 truncate"
          data-testid="commit-author"
        >
          <User size={12} className="shrink-0" />
          <span className="truncate">{author}</span>
        </span>

        {/* Date */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className="flex items-center gap-1 shrink-0"
              data-testid="commit-date"
            >
              <Calendar size={12} />
              {formatRelativeDate(timestamp)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {formatFullDate(timestamp)}
          </TooltipContent>
        </Tooltip>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Stats */}
        <span
          className="flex items-center gap-2 shrink-0"
          data-testid="commit-stats"
        >
          <span>
            {stats.filesChanged} file{stats.filesChanged !== 1 ? "s" : ""}
          </span>
          <span className="text-green-500">+{stats.additions}</span>
          <span className="text-red-500">-{stats.deletions}</span>
        </span>
      </div>
    </div>
  );
}
