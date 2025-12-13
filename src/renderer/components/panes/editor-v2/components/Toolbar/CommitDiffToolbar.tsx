/**
 * CommitDiffToolbar - Toolbar for historical commit diff viewing.
 *
 * A simplified toolbar for viewing historical file diffs from commits.
 * Shows file path, commit info, and read-only indicator.
 *
 * Unlike EditorToolbar, this has no edit actions (save/undo/redo)
 * since historical diffs are read-only.
 */

import { ChevronLeft, Eye } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface CommitDiffToolbarProps {
  /** Display path (relative to cwd, shown in toolbar) */
  displayPath: string;

  /** Full file path (for tooltip) */
  filePath?: string;

  /** Short commit ID (e.g., "abc123") */
  commitShortId: string;

  /** Handler for back button click */
  onBack?: () => void;
}

/**
 * Toolbar for historical commit diff viewing.
 * Shows file path, commit info, and read-only indicator.
 */
export function CommitDiffToolbar({
  displayPath,
  filePath,
  commitShortId,
  onBack,
}: CommitDiffToolbarProps) {
  // Common button class matching v1
  const buttonClass =
    "p-1 rounded hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 bg-elevated text-[13px] border-b shrink-0"
      data-testid="commit-diff-toolbar"
    >
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

      {/* File path with tooltip */}
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="truncate text-foreground min-w-0 flex-1"
            data-testid="file-path"
          >
            {displayPath}
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[400px] break-all">
          {filePath || displayPath}
        </TooltipContent>
      </Tooltip>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Commit badge */}
      <span
        className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono"
        data-testid="commit-badge"
      >
        {commitShortId}
      </span>

      {/* Read-only indicator */}
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex items-center gap-1 text-xs text-muted-foreground"
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
  );
}
