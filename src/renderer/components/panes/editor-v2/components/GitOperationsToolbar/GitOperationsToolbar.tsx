/**
 * GitOperationsToolbar - Compact toolbar for git operations.
 *
 * Provides quick access to:
 * - Branch selection (compare to base branch)
 * - Commit UI (message input + button)
 * - Git operation status and error feedback
 *
 * Designed to appear in the file tree header when viewing changes.
 * Uses the useGitOperations hook for state management.
 *
 * Note: Pull/push operations are not yet available in the GitV2 API.
 * These will be added when the IPC layer is extended to support them.
 *
 * @example
 * ```tsx
 * <GitOperationsToolbar
 *   cwd="/project"
 *   currentBranch="feature-branch"
 *   baseBranch={baseBranch}
 *   onBaseBranchChange={setBaseBranch}
 *   stagedCount={3}
 * />
 * ```
 */

import { useState, useCallback } from "react";
import { GitCommit, AlertCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGitOperations } from "../../hooks";
import { BranchSelector } from "../BranchSelector";
import { cn } from "@/utils";

// ============================================================================
// Types
// ============================================================================

export interface GitOperationsToolbarProps {
  /** Working directory for git operations */
  cwd: string;

  /** Current branch name (display only) */
  currentBranch: string | null;

  /** Base branch for comparison (null = compare to HEAD) */
  baseBranch: string | null;

  /** Callback when base branch changes */
  onBaseBranchChange: (branch: string | null) => void;

  /** Number of staged files (enables commit button) */
  stagedCount: number;

  /** Whether there are any uncommitted changes (staged or unstaged) */
  hasUncommittedChanges: boolean;

  /** Callback fired after successful commit */
  onCommitSuccess?: () => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Compact git operations toolbar.
 */
export function GitOperationsToolbar({
  cwd,
  currentBranch,
  baseBranch,
  onBaseBranchChange,
  stagedCount,
  hasUncommittedChanges,
  onCommitSuccess,
}: GitOperationsToolbarProps) {
  const [state, operations] = useGitOperations(cwd);
  const [commitMessage, setCommitMessage] = useState("");

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle commit action.
   */
  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim() || stagedCount === 0) return;

    try {
      const result = await operations.commit(commitMessage.trim());
      if (result) {
        setCommitMessage("");
        onCommitSuccess?.();
      }
    } catch {
      // Error is already set in state by useGitOperations
    }
  }, [commitMessage, stagedCount, operations, onCommitSuccess]);

  /**
   * Handle Enter key in commit input.
   */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleCommit();
      }
    },
    [handleCommit],
  );

  /**
   * Dismiss error message.
   */
  const handleDismissError = useCallback(() => {
    operations.clearError();
  }, [operations]);

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------

  const canCommit =
    commitMessage.trim().length > 0 && stagedCount > 0 && !state.isCommitting;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="flex flex-col border-b border-border bg-muted/30"
      data-testid="git-operations-toolbar"
    >
      {/* Error Banner */}
      {state.error && (
        <div
          className={cn(
            "flex items-center gap-2 px-2 py-1.5",
            "bg-destructive/10 text-destructive text-xs",
            "border-b border-destructive/20",
          )}
          data-testid="git-error-banner"
        >
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1 truncate">{state.error}</span>
          <button
            className="p-0.5 hover:bg-destructive/20 rounded transition-colors"
            onClick={handleDismissError}
            title="Dismiss"
            data-testid="dismiss-error"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Toolbar Row */}
      <div className="flex items-center gap-2 px-2 py-1.5">
        {/* Branch Selector */}
        <BranchSelector
          cwd={cwd}
          baseBranch={baseBranch}
          onBaseBranchChange={onBaseBranchChange}
        />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Current Branch Display */}
        {currentBranch && (
          <span
            className="text-xs text-muted-foreground truncate max-w-[100px]"
            title={`Current branch: ${currentBranch}`}
          >
            on {currentBranch}
          </span>
        )}
      </div>

      {/* Commit Row - Only show when there are changes */}
      {hasUncommittedChanges && (
        <div
          className="flex items-center gap-2 px-2 py-1.5 border-t border-border/50"
          data-testid="commit-row"
        >
          {/* Commit Message Input */}
          <input
            type="text"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Commit message..."
            disabled={state.isCommitting}
            className={cn(
              "flex-1 min-w-0 px-2 py-1 text-sm rounded-md",
              "bg-background border border-input",
              "focus:outline-none focus:ring-1 focus:ring-ring",
              "placeholder:text-muted-foreground",
              "disabled:opacity-50",
            )}
            data-testid="commit-message-input"
          />

          {/* Commit Button */}
          <Button
            variant="default"
            size="sm"
            onClick={handleCommit}
            disabled={!canCommit}
            className="h-7 px-3 flex-shrink-0"
            data-testid="commit-button"
          >
            <GitCommit className="w-3.5 h-3.5 mr-1.5" />
            {state.isCommitting ? (
              "..."
            ) : (
              <>
                Commit
                {stagedCount > 0 && (
                  <span className="ml-1 text-xs opacity-70">
                    ({stagedCount})
                  </span>
                )}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
