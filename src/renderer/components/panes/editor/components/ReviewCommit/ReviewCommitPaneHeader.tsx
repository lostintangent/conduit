/**
 * ReviewCommitPaneHeader - Header displaying commit metadata.
 *
 * Shows commit ID and subject in a compact header.
 * Author, timestamp, and file count are shown in the footer.
 * Used by CommitChangesPane and other historical commit views.
 *
 * @example
 * ```tsx
 * <ReviewCommitPaneHeader
 *   shortId="abc1234"
 *   subject="Fix bug in authentication"
 *   onClose={handleClose}
 * />
 * ```
 */

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowLeft, GitCommit } from "lucide-react";

export interface ReviewCommitPaneHeaderProps {
  /** Short commit hash (7 characters) */
  shortId: string;

  /** Commit subject (first line of message) */
  subject: string;

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
  onClose,
  className,
}: ReviewCommitPaneHeaderProps) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 border-b border-border bg-elevated text-[13px] ${className ?? ""}`}
      data-testid="commit-header"
    >
      {/* Back button (first, on left) */}
      {onClose && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
              data-testid="back-button"
              aria-label="Exit commit view"
            >
              <ArrowLeft size={14} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Exit commit view</TooltipContent>
        </Tooltip>
      )}

      {/* Commit icon */}
      <GitCommit className="w-4 h-4 text-muted-foreground flex-shrink-0" />

      {/* Commit info - single line with hash and subject */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Short hash */}
        <span className="font-mono text-xs text-muted-foreground shrink-0">
          {shortId}
        </span>
        {/* Subject */}
        <span className="truncate text-sm">{subject}</span>
      </div>
    </div>
  );
}
