/**
 * WorkingHeader - Header toolbar for the changes review pane.
 *
 * Displays commit controls and actions:
 * - Commit message input (multiline textarea)
 * - Commit button with staged file count
 * - Pull/Push/Publish buttons
 * - Expand/Collapse all toggle
 * - Exit review mode button
 * - Error banner (dismissible)
 *
 * @example
 * ```tsx
 * <WorkingHeader
 *   commitMessage={message}
 *   onCommitMessageChange={setMessage}
 *   onCommit={handleCommit}
 *   canCommit={stagedCount > 0 && message.trim().length > 0}
 *   isCommitting={isCommitting}
 *   stagedCount={stagedCount}
 *   onPull={handlePull}
 *   onPush={handlePush}
 *   isPulling={isPulling}
 *   isPushing={isPushing}
 *   hasUpstream={hasUpstream}
 *   onExitReview={handleExit}
 *   error={error}
 *   onDismissError={handleDismissError}
 * />
 * ```
 */

import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils";
import {
  AlertCircle,
  ArrowDownAZ,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpFromLine,
  Clock,
  Eye,
  GitCommit,
  Send,
  X,
} from "lucide-react";

export interface ReviewWorkingPaneHeaderProps {
  // Title
  /** Total number of changed files (for title display) */
  totalFileCount: number;

  // Commit controls
  /** Current commit message */
  commitMessage: string;

  /** Callback when commit message changes */
  onCommitMessageChange: (message: string) => void;

  /** Callback to commit staged changes */
  onCommit: () => void;

  /** Whether commit is allowed (has staged files and message) */
  canCommit: boolean;

  /** Whether commit is in progress */
  isCommitting: boolean;

  /** Number of staged files (for button label) */
  stagedCount: number;

  // Pull/Push controls
  /** Callback to pull from remote */
  onPull?: () => void;

  /** Callback to push to remote */
  onPush?: () => void;

  /** Whether pull is in progress */
  isPulling?: boolean;

  /** Whether push is in progress */
  isPushing?: boolean;

  /** Whether upstream branch is configured */
  hasUpstream?: boolean;

  // Exit review
  /** Callback to exit review mode (optional) */
  onExitReview?: () => void;

  // Error handling
  /** Current error message (null if no error) */
  error?: string | null;

  /** Callback to dismiss the error */
  onDismissError?: () => void;

  // ---------------------------------------------------------------------------
  // Sort Order Props
  // ---------------------------------------------------------------------------

  /** Whether files are sorted by last edited (true) or folder structure (false) */
  sortByLastEdited?: boolean;

  /** Callback to toggle sort order */
  onToggleSortOrder?: () => void;

  // ---------------------------------------------------------------------------
  // Unseen Tracking Props (always active in Review Mode)
  // ---------------------------------------------------------------------------

  /** Count of unseen files (for badge display) */
  unseenCount?: number;

  /** Callback to mark all files as seen */
  onMarkAllSeen?: () => void;
}

/**
 * Header toolbar with commit controls and actions.
 */
export function ReviewWorkingPaneHeader({
  totalFileCount,
  commitMessage,
  onCommitMessageChange,
  onCommit,
  canCommit,
  isCommitting,
  stagedCount,
  onPull,
  onPush,
  isPulling = false,
  isPushing = false,
  hasUpstream = true,
  onExitReview,
  error,
  onDismissError,
  // Sort order props
  sortByLastEdited = false,
  onToggleSortOrder,
  // Unseen tracking props
  unseenCount = 0,
  onMarkAllSeen,
}: ReviewWorkingPaneHeaderProps) {
  return (
    <div className="flex-shrink-0" data-testid="changes-review-toolbar">
      {/* Error Banner */}
      {error && (
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2",
            "bg-destructive/10 text-destructive text-sm",
            "border-b border-destructive/20",
          )}
          data-testid="error-banner"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          {onDismissError && (
            <button
              className="p-1 hover:bg-destructive/20 rounded transition-colors"
              onClick={onDismissError}
              title="Dismiss"
              data-testid="dismiss-error"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Title bar - styled to match FileTreeToolbar and EditorToolbar */}
      <div
        className="flex items-center justify-between px-3 py-1.5 bg-elevated text-[13px] border-b border-border"
        data-testid="review-title-bar"
      >
        <div className="flex items-center gap-2">
          {onExitReview && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onExitReview}
                  className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
                  data-testid="exit-review-button"
                >
                  <ArrowLeft size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Exit review mode</TooltipContent>
            </Tooltip>
          )}
          <span className="truncate" data-testid="review-title">
            Review Changes ({totalFileCount})
          </span>
          {/* Unseen count badge (always visible when there are unseen files) */}
          {unseenCount > 0 && (
            <span
              className="text-yellow-500 text-xs font-medium"
              data-testid="unseen-count-badge"
            >
              • {unseenCount} new
            </span>
          )}
          {/* Sort order toggle and mark all seen - next to title with pipe separator */}
          {(onToggleSortOrder || (onMarkAllSeen && unseenCount > 0)) && (
            <>
              <span className="text-muted-foreground">|</span>
              <div className="flex items-center gap-1">
                {onToggleSortOrder && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={onToggleSortOrder}
                        className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
                        data-testid="sort-order-toggle"
                      >
                        {/* Show icon of the state we're switching TO */}
                        {sortByLastEdited ? (
                          <ArrowDownAZ size={14} />
                        ) : (
                          <Clock size={14} />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {sortByLastEdited
                        ? "Switch to alphabetical"
                        : "Switch to last edited"}
                    </TooltipContent>
                  </Tooltip>
                )}
                {onMarkAllSeen && unseenCount > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={onMarkAllSeen}
                        className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
                        data-testid="mark-all-seen-button"
                      >
                        <Eye size={14} />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Mark all as seen</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Main Toolbar - Single row layout like v1 */}
      <div className="px-3 py-2 bg-muted/30 border-b border-border">
        <div className="flex items-center gap-2">
          {/* Commit message input (single line) */}
          <input
            type="text"
            value={commitMessage}
            onChange={(e) => onCommitMessageChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canCommit) {
                  onCommit();
                }
              }
            }}
            placeholder="Commit message"
            className={cn(
              "flex-1 h-8 px-3 text-sm rounded-md",
              "bg-background border border-input",
              "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
              "placeholder:text-muted-foreground",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
            disabled={isCommitting}
            data-testid="commit-message-input"
          />

          {/* Commit button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onCommit}
                disabled={!canCommit || isCommitting}
                className={cn(
                  "px-3 py-1.5 rounded text-sm",
                  "bg-primary/10 hover:bg-primary/20",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "transition-colors flex items-center gap-2",
                )}
                data-testid="commit-button"
              >
                <GitCommit
                  className={cn("w-4 h-4", isCommitting && "animate-pulse")}
                />
                <span>Commit</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {isCommitting
                ? "Committing..."
                : stagedCount === 0
                  ? "No staged files to commit"
                  : !commitMessage.trim()
                    ? "Enter a commit message"
                    : `Commit ${stagedCount} staged file${stagedCount !== 1 ? "s" : ""}`}
            </TooltipContent>
          </Tooltip>

          {/* Pull/Push buttons */}
          {(onPull || onPush) && (
            <>
              <Separator orientation="vertical" className="h-6" />

              <div className="flex items-center gap-1">
                {/* Pull button */}
                {onPull && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={onPull}
                        disabled={isPulling || isPushing || !hasUpstream}
                        className="p-1.5 rounded hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        data-testid="pull-button"
                      >
                        <ArrowDownToLine
                          className={cn(
                            "w-4 h-4",
                            isPulling && "animate-pulse",
                          )}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {!hasUpstream
                        ? "No upstream branch configured"
                        : isPulling
                          ? "Pulling..."
                          : "Pull from remote"}
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Push button (when upstream exists) */}
                {onPush && hasUpstream && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={onPush}
                        disabled={isPulling || isPushing}
                        className="p-1.5 rounded hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        data-testid="push-button"
                      >
                        <ArrowUpFromLine
                          className={cn(
                            "w-4 h-4",
                            isPushing && "animate-pulse",
                          )}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isPushing ? "Pushing..." : "Push to remote"}
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Publish button (when no upstream) */}
                {onPush && !hasUpstream && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={onPush}
                        disabled={isPulling || isPushing}
                        className="p-1.5 rounded hover:bg-primary/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        data-testid="publish-button"
                      >
                        <Send
                          className={cn(
                            "w-4 h-4",
                            isPushing && "animate-pulse",
                          )}
                        />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {isPushing ? "Publishing..." : "Publish branch"}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
