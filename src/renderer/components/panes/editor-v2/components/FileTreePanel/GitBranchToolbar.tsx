/**
 * GitBranchToolbar - Git branch and operations toolbar.
 *
 * A compact toolbar that provides:
 * - Branch comparison toggle (compare to base branch)
 * - Branch label display (baseBranch → currentBranch)
 * - Git status summary with animated badges
 * - Filter toggle for showing only changed files
 * - Pull/Push operations (when available)
 * - Review changes action
 * - Commit UI (message input + button)
 *
 * The toolbar has two rows:
 * 1. Branch info: comparison toggle, branch label, status summary, actions
 * 2. Commit row: message input and commit button (visible when filter active)
 *
 * @example
 * ```tsx
 * <GitBranchToolbar
 *   currentBranch="feature-branch"
 *   baseBranch="main"
 *   showOnlyChangedFiles={treeViewMode === "changes"}
 *   changedFilesCount={5}
 *   gitStatus={gitStatus}
 *   onFilterToggle={() => toggleTreeViewMode()}
 *   onOpenBranchPicker={() => openBranchSelector()}
 * />
 * ```
 */

import { useRef, useState, useCallback } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  GitCommitVertical,
  GitCompare,
  Send,
  SquareArrowOutUpRight,
  List,
  FolderTree,
} from "lucide-react";
import { FillingIcon } from "@/components/ui/filling-icon";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GitFileStatus } from "@/../../src/ipc/gitv2/types";
import { GitStatusSummary } from "./GitStatusSummary";

// ============================================================================
// Types
// ============================================================================

export interface GitBranchToolbarProps {
  /** Current branch name (null if no git repo) */
  currentBranch: string | null;

  /** Base branch for comparison (null = compare to HEAD) */
  baseBranch: string | null;

  /** Whether to show only changed files */
  showOnlyChangedFiles: boolean;

  /** Whether changes review mode is active */
  isReviewModeActive?: boolean;

  /** Number of changed files */
  changedFilesCount?: number;

  /** Git status map (relative paths to status) */
  gitStatus?: Map<string, GitFileStatus> | null;

  /** Callback to toggle filter (files/changes mode) */
  onFilterToggle: () => void;

  /** Callback to open branch picker */
  onOpenBranchPicker?: () => void;

  // ---------------------------------------------------------------------------
  // Pull/Push Props
  // ---------------------------------------------------------------------------

  /** Callback for pull action */
  onPull?: () => void;

  /** Callback for push action */
  onPush?: () => void;

  /** Whether pull is in progress */
  isPulling?: boolean;

  /** Whether push is in progress */
  isPushing?: boolean;

  /** Whether the branch has an upstream configured */
  hasUpstream?: boolean;

  // ---------------------------------------------------------------------------
  // Commit Props
  // ---------------------------------------------------------------------------

  /** Current commit message */
  commitMessage?: string;

  /** Callback when commit message changes */
  onCommitMessageChange?: (message: string) => void;

  /** Callback for commit action */
  onCommit?: () => void;

  /** Whether there are staged files */
  hasStagedFiles?: boolean;

  /** Whether commit is in progress */
  isCommitting?: boolean;

  // ---------------------------------------------------------------------------
  // Review Props
  // ---------------------------------------------------------------------------

  /** Callback for review changes action */
  onReviewChanges?: () => void;

  // ---------------------------------------------------------------------------
  // Changes View Mode Props
  // ---------------------------------------------------------------------------

  /** Current changes view mode (flat or nested) */
  changesViewMode?: "flat" | "nested";

  /** Callback when changes view mode changes */
  onChangesViewModeChange?: (mode: "flat" | "nested") => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Git branch and operations toolbar.
 *
 * Provides branch comparison, status summary, and git operations
 * in a compact two-row layout.
 */
export function GitBranchToolbar({
  currentBranch,
  baseBranch,
  showOnlyChangedFiles,
  isReviewModeActive = false,
  changedFilesCount = 0,
  gitStatus = null,
  onFilterToggle,
  onOpenBranchPicker,
  onPull,
  onPush,
  isPulling = false,
  isPushing = false,
  hasUpstream = true,
  commitMessage = "",
  onCommitMessageChange,
  onCommit,
  hasStagedFiles = false,
  isCommitting = false,
  onReviewChanges,
  changesViewMode = "flat",
  onChangesViewModeChange,
}: GitBranchToolbarProps) {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const commitInputRef = useRef<HTMLInputElement>(null);
  const [isStatusHovered, setIsStatusHovered] = useState(false);

  // ---------------------------------------------------------------------------
  // Computed Values
  // ---------------------------------------------------------------------------

  /**
   * Any git operation is running - operations are mutually exclusive.
   */
  const isGitOperationRunning = isPulling || isPushing || isCommitting;

  /**
   * Whether branch comparison is active (comparing to a specific branch).
   */
  const isComparingBranch = baseBranch !== null && baseBranch !== "HEAD";

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle commit button click.
   * Focuses input if no message, otherwise commits.
   */
  const handleCommitClick = useCallback(() => {
    if (!commitMessage.trim()) {
      commitInputRef.current?.focus();
      return;
    }
    onCommit?.();
  }, [commitMessage, onCommit]);

  // ---------------------------------------------------------------------------
  // Early Return
  // ---------------------------------------------------------------------------

  // Don't render if no git repo
  if (!currentBranch) {
    return null;
  }

  // ---------------------------------------------------------------------------
  // Branch Label
  // ---------------------------------------------------------------------------

  const branchLabel = isComparingBranch ? (
    <div className="flex items-center gap-1.5 overflow-hidden">
      <span title={baseBranch ?? ""}>{baseBranch}</span>
      <ArrowRight className="w-3 h-3 flex-shrink-0" />
      <span className="truncate" title={currentBranch}>
        {currentBranch}
      </span>
    </div>
  ) : (
    <span className="truncate" title={currentBranch}>
      {currentBranch}
    </span>
  );

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  const toggleButtonClass = "[&_svg]:size-3.5";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex flex-col" data-testid="git-branch-toolbar">
      {/* First row: Branch info and actions */}
      <div className="px-3 py-1.5 text-xs flex items-center gap-2 min-h-[32px]">
        {/* Branch comparison toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Toggle
              pressed={isComparingBranch}
              onPressedChange={() => onOpenBranchPicker?.()}
              size="sm"
              className={toggleButtonClass}
              data-testid="branch-compare-toggle"
            >
              <GitCompare />
            </Toggle>
          </TooltipTrigger>
          <TooltipContent>
            {isComparingBranch
              ? `Comparing ${baseBranch} → ${currentBranch}`
              : "Comparing against HEAD"}
          </TooltipContent>
        </Tooltip>

        {/* Branch label + view mode toggle (grouped together) */}
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <div className="truncate">{branchLabel}</div>

          {/* Changes view mode toggle (only shown when in changes view) */}
          {showOnlyChangedFiles && onChangesViewModeChange && (
            <>
              <Separator orientation="vertical" className="h-4 flex-shrink-0" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Toggle
                    pressed={false}
                    onPressedChange={() =>
                      onChangesViewModeChange(
                        changesViewMode === "flat" ? "nested" : "flat",
                      )
                    }
                    size="sm"
                    className={`${toggleButtonClass} flex-shrink-0`}
                    data-testid="changes-view-mode-toggle"
                  >
                    {changesViewMode === "flat" ? <FolderTree /> : <List />}
                  </Toggle>
                </TooltipTrigger>
                <TooltipContent>
                  {changesViewMode === "flat"
                    ? "Switch to tree view"
                    : "Switch to flat view"}
                </TooltipContent>
              </Tooltip>
            </>
          )}
        </div>

        {/* Status summary and actions (shown when there are changes) */}
        {changedFilesCount > 0 && (
          <div className="flex items-center">
            {/* Filter toggle with status summary */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle
                  pressed={showOnlyChangedFiles}
                  onPressedChange={() => onFilterToggle()}
                  onMouseEnter={() => setIsStatusHovered(true)}
                  onMouseLeave={() => setIsStatusHovered(false)}
                  size="sm"
                  className={`text-xs px-2 pr-3 py-0.5 h-auto text-foreground hover:text-foreground ${
                    showOnlyChangedFiles
                      ? "border border-border bg-primary/10"
                      : ""
                  }`}
                  data-testid="filter-toggle"
                >
                  <GitStatusSummary
                    gitStatus={gitStatus}
                    changedFilesCount={changedFilesCount}
                    isExpanded={showOnlyChangedFiles || isReviewModeActive}
                    isHovered={isStatusHovered}
                  />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>
                {showOnlyChangedFiles
                  ? "Showing only changed files - Click to show all files"
                  : `Show only ${changedFilesCount} changed ${changedFilesCount === 1 ? "file" : "files"}`}
              </TooltipContent>
            </Tooltip>

            {/* Pull/Push/Review actions - animated slide in when filter active */}
            {!isReviewModeActive &&
              (onPull || onPush) &&
              (baseBranch === null || baseBranch === "HEAD") && (
                <div
                  className="flex items-center overflow-hidden"
                  style={{
                    maxWidth: showOnlyChangedFiles ? "200px" : "0px",
                    opacity: showOnlyChangedFiles ? 1 : 0,
                    transition: showOnlyChangedFiles
                      ? "max-width 300ms ease-out, opacity 300ms ease-out"
                      : "max-width 150ms ease-out, opacity 150ms ease-out",
                    willChange: "max-width, opacity",
                  }}
                >
                  {/* Separator */}
                  <div
                    className="overflow-hidden"
                    style={{
                      width: showOnlyChangedFiles ? "auto" : 0,
                      marginLeft: showOnlyChangedFiles ? "0.5rem" : 0,
                      marginRight: showOnlyChangedFiles ? "0.5rem" : 0,
                      transition: showOnlyChangedFiles
                        ? "width 300ms ease-out, margin 300ms ease-out"
                        : "width 150ms ease-out, margin 150ms ease-out",
                    }}
                  >
                    <Separator orientation="vertical" className="h-4" />
                  </div>

                  {/* Action buttons */}
                  <div
                    className="flex items-center gap-0.5"
                    style={{
                      transform: showOnlyChangedFiles
                        ? "translateX(0) translateZ(0)"
                        : "translateX(-8px) translateZ(0)",
                      transition: showOnlyChangedFiles
                        ? "transform 300ms ease-out"
                        : "transform 150ms ease-out",
                      willChange: "transform",
                    }}
                  >
                    {/* Pull button */}
                    {onPull && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Toggle
                            pressed={false}
                            onPressedChange={onPull}
                            disabled={isGitOperationRunning || !hasUpstream}
                            size="sm"
                            className={toggleButtonClass}
                            data-testid="pull-button"
                          >
                            <FillingIcon
                              icon={ArrowDownToLine}
                              isAnimating={isPulling}
                            />
                          </Toggle>
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

                    {/* Push button (with upstream) */}
                    {onPush && hasUpstream && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Toggle
                            pressed={false}
                            onPressedChange={onPush}
                            disabled={isGitOperationRunning}
                            size="sm"
                            className={toggleButtonClass}
                            data-testid="push-button"
                          >
                            <FillingIcon
                              icon={ArrowUpFromLine}
                              isAnimating={isPushing}
                            />
                          </Toggle>
                        </TooltipTrigger>
                        <TooltipContent>
                          {isPushing ? "Pushing..." : "Push to remote"}
                        </TooltipContent>
                      </Tooltip>
                    )}

                    {/* Publish button (no upstream) */}
                    {onPush && !hasUpstream && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Toggle
                            pressed={false}
                            onPressedChange={onPush}
                            disabled={isGitOperationRunning}
                            size="sm"
                            className={toggleButtonClass}
                            data-testid="publish-button"
                          >
                            <FillingIcon icon={Send} isAnimating={isPushing} />
                          </Toggle>
                        </TooltipTrigger>
                        <TooltipContent>
                          {isPushing ? "Publishing..." : "Publish branch"}
                        </TooltipContent>
                      </Tooltip>
                    )}

                    {/* Review changes button */}
                    {onReviewChanges && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Toggle
                            pressed={false}
                            onPressedChange={onReviewChanges}
                            size="sm"
                            className={toggleButtonClass}
                            data-testid="review-button"
                          >
                            <SquareArrowOutUpRight />
                          </Toggle>
                        </TooltipTrigger>
                        <TooltipContent>
                          Review all changes in detail
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>
              )}
          </div>
        )}
      </div>

      {/* Second row: Commit message input and button */}
      {!isReviewModeActive &&
        showOnlyChangedFiles &&
        onCommit &&
        onCommitMessageChange &&
        (baseBranch === null || baseBranch === "HEAD") && (
          <div
            className="px-3 pb-1.5 flex items-center gap-2"
            data-testid="commit-row"
          >
            <Input
              ref={commitInputRef}
              type="text"
              placeholder="Commit message"
              value={commitMessage}
              onChange={(e) => onCommitMessageChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleCommitClick();
                }
              }}
              disabled={isGitOperationRunning}
              className="flex-1 h-7 text-xs"
              data-testid="commit-message-input"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Toggle
                  pressed={false}
                  onPressedChange={handleCommitClick}
                  disabled={!hasStagedFiles || isGitOperationRunning}
                  size="sm"
                  className={toggleButtonClass}
                  data-testid="commit-button"
                >
                  <FillingIcon
                    icon={GitCommitVertical}
                    isAnimating={isCommitting}
                  />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent>
                {isCommitting
                  ? "Committing..."
                  : !hasStagedFiles
                    ? "No staged files to commit"
                    : "Commit staged changes"}
              </TooltipContent>
            </Tooltip>
          </div>
        )}
    </div>
  );
}
