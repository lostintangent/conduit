/**
 * GitBranchToolbar - Git branch and operations toolbar.
 *
 * A compact toolbar that provides:
 * - Branch selector/display with comparison mode (baseBranch → currentBranch)
 * - Base branch comparison toggle (always visible)
 * - View mode toggle (tree/flat - only in changes mode)
 * - Review changes action (only in changes mode)
 * - Git status summary with filter toggle
 * - Commit UI with Pull/Push operations (only in changes mode)
 *
 * Layout:
 * - Row 1: [Branch] | [Compare][ViewMode][Review] | [StatusBadge]
 * - Row 2: [Commit input] [Commit][Pull][Push] (only in changes mode)
 *
 * Responsive behavior:
 * - At narrow widths (<280px), action buttons collapse into an overflow menu
 * - Pull/Push in commit row also collapse to overflow menu
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

import { useRef, useState, useCallback, useEffect } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  BookOpen,
  GitCommitVertical,
  GitCompare,
  Send,
  List,
  FolderTree,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FillingIcon } from "@/components/ui/filling-icon";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GitFileStatus } from "@features/git/model";
import type { GitV2API } from "@features/git/client/GitV2API";
import { GitStatusSummary } from "./GitStatusSummary";
import { BranchSwitcher } from "./BranchSwitcher";

/** Width threshold for collapsing action buttons into overflow menu */
const COMPACT_MODE_BREAKPOINT = 280;

export interface GitBranchToolbarProps {
  /** Current branch name (null if no git repo) */
  currentBranch: string | null;

  /** Base branch for comparison (null = compare to HEAD) */
  baseBranch: string | null;

  /** Git API instance for branch switching */
  git?: GitV2API;

  /** Whether to show only changed files */
  showOnlyChangedFiles: boolean;

  /** Whether changes review mode is active */
  isReviewModeActive?: boolean;

  /** Callback when branch is switched */
  onBranchSwitch?: (newBranch: string) => void;

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

/**
 * Git branch and operations toolbar.
 *
 * Provides branch comparison, status summary, and git operations
 * in a compact two-row layout.
 */
export function GitBranchToolbar({
  currentBranch,
  baseBranch,
  git,
  showOnlyChangedFiles,
  isReviewModeActive = false,
  onBranchSwitch,
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
  changesViewMode = "nested",
  onChangesViewModeChange,
}: GitBranchToolbarProps) {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const commitInputRef = useRef<HTMLInputElement>(null);
  const [toolbarEl, setToolbarEl] = useState<HTMLDivElement | null>(null);
  const [isStatusHovered, setIsStatusHovered] = useState(false);
  const [isCompactMode, setIsCompactMode] = useState(false);

  /**
   * Any git operation is running - operations are mutually exclusive.
   */
  const isGitOperationRunning = isPulling || isPushing || isCommitting;

  /**
   * Track toolbar width to determine if we need compact mode.
   * At narrow widths, action buttons collapse into an overflow menu.
   * Uses callback ref pattern so observer is set up when element mounts,
   * even if component initially returned early due to no currentBranch.
   */
  useEffect(() => {
    if (!toolbarEl) return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setIsCompactMode(width < COMPACT_MODE_BREAKPOINT);
    });

    observer.observe(toolbarEl);
    return () => observer.disconnect();
  }, [toolbarEl]);

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
  // Branch Label / Switcher
  // ---------------------------------------------------------------------------

  // When comparing branches, show both with an arrow
  // When not comparing, show BranchSwitcher (if git available) or static label
  const branchDisplay = isComparingBranch ? (
    <div className="flex items-center gap-1.5 overflow-hidden">
      <span title={baseBranch ?? ""}>{baseBranch}</span>
      <ArrowRight className="w-3 h-3 flex-shrink-0" />
      <span className="truncate" title={currentBranch}>
        {currentBranch}
      </span>
    </div>
  ) : git ? (
    <BranchSwitcher
      git={git}
      currentBranch={currentBranch}
      onBranchSwitch={onBranchSwitch}
    />
  ) : (
    <span className="truncate" title={currentBranch}>
      {currentBranch}
    </span>
  );

  // ---------------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------------

  const toggleButtonClass = "[&_svg]:size-3.5";

  return (
    <div
      ref={setToolbarEl}
      className="flex flex-col"
      data-testid="git-branch-toolbar"
    >
      {/* First row: Branch info and actions */}
      <div className="px-3 py-1.5 text-xs flex items-center gap-2 min-h-[32px]">
        {/* Branch label/switcher */}
        <div className="flex flex-1 items-center gap-2 min-w-0">
          <div className="min-w-0">{branchDisplay}</div>

          {/* Action buttons - base branch always visible, others only in changes mode */}
          {onOpenBranchPicker && (
            <>
              <Separator orientation="vertical" className="h-4 flex-shrink-0" />

              {/* Inline buttons - visible at wider widths (>=280px) */}
              {!isCompactMode && (
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  {/* Base branch comparison toggle - always visible */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Toggle
                        pressed={isComparingBranch}
                        onPressedChange={() => onOpenBranchPicker()}
                        size="sm"
                        className={toggleButtonClass}
                        data-testid="branch-compare-toggle"
                      >
                        <GitCompare />
                      </Toggle>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      {isComparingBranch
                        ? `Comparing ${baseBranch} → ${currentBranch}`
                        : "Select base branch to compare"}
                    </TooltipContent>
                  </Tooltip>

                  {/* Changes view mode toggle - only in changes mode */}
                  {showOnlyChangedFiles && onChangesViewModeChange && (
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
                          className={toggleButtonClass}
                          data-testid="changes-view-mode-toggle"
                        >
                          {changesViewMode === "flat" ? (
                            <FolderTree />
                          ) : (
                            <List />
                          )}
                        </Toggle>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {changesViewMode === "flat"
                          ? "Switch to tree view"
                          : "Switch to flat view"}
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {/* Review changes button - only in changes mode */}
                  {showOnlyChangedFiles &&
                    !isReviewModeActive &&
                    onReviewChanges &&
                    changedFilesCount > 0 &&
                    (baseBranch === null || baseBranch === "HEAD") && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Toggle
                            pressed={false}
                            onPressedChange={onReviewChanges}
                            size="sm"
                            className={toggleButtonClass}
                            data-testid="review-button"
                          >
                            <BookOpen />
                          </Toggle>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          Review all changes in detail
                        </TooltipContent>
                      </Tooltip>
                    )}
                </div>
              )}

              {/* Overflow menu - visible at narrow widths (<280px) */}
              {isCompactMode && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Toggle
                      pressed={false}
                      size="sm"
                      className={toggleButtonClass}
                      data-testid="view-options-overflow-menu"
                      aria-label="More options"
                    >
                      <MoreVertical />
                    </Toggle>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    {/* Base branch option - always visible */}
                    <DropdownMenuItem onClick={() => onOpenBranchPicker()}>
                      <GitCompare className="w-4 h-4 mr-2" />
                      {isComparingBranch
                        ? "Change base branch"
                        : "Select base branch"}
                    </DropdownMenuItem>

                    {/* View mode option - only in changes mode */}
                    {showOnlyChangedFiles && onChangesViewModeChange && (
                      <DropdownMenuItem
                        onClick={() =>
                          onChangesViewModeChange(
                            changesViewMode === "flat" ? "nested" : "flat",
                          )
                        }
                      >
                        {changesViewMode === "flat" ? (
                          <FolderTree className="w-4 h-4 mr-2" />
                        ) : (
                          <List className="w-4 h-4 mr-2" />
                        )}
                        {changesViewMode === "flat" ? "Tree view" : "Flat view"}
                      </DropdownMenuItem>
                    )}

                    {/* Review option - only in changes mode */}
                    {showOnlyChangedFiles &&
                      !isReviewModeActive &&
                      onReviewChanges &&
                      changedFilesCount > 0 &&
                      (baseBranch === null || baseBranch === "HEAD") && (
                        <DropdownMenuItem onClick={onReviewChanges}>
                          <BookOpen className="w-4 h-4 mr-2" />
                          Review changes
                        </DropdownMenuItem>
                      )}

                    {/* Separator before git sync actions */}
                    {showOnlyChangedFiles && (onPull || onPush) && (
                      <DropdownMenuSeparator />
                    )}

                    {/* Pull option - only in changes mode */}
                    {showOnlyChangedFiles && onPull && (
                      <DropdownMenuItem
                        onClick={onPull}
                        disabled={isGitOperationRunning || !hasUpstream}
                      >
                        <ArrowDownToLine className="w-4 h-4 mr-2" />
                        {!hasUpstream
                          ? "Pull (no upstream)"
                          : isPulling
                            ? "Pulling..."
                            : "Pull"}
                      </DropdownMenuItem>
                    )}

                    {/* Push option (with upstream) - only in changes mode */}
                    {showOnlyChangedFiles && onPush && hasUpstream && (
                      <DropdownMenuItem
                        onClick={onPush}
                        disabled={isGitOperationRunning}
                      >
                        <ArrowUpFromLine className="w-4 h-4 mr-2" />
                        {isPushing ? "Pushing..." : "Push"}
                      </DropdownMenuItem>
                    )}

                    {/* Publish option (no upstream) - only in changes mode */}
                    {showOnlyChangedFiles && onPush && !hasUpstream && (
                      <DropdownMenuItem
                        onClick={onPush}
                        disabled={isGitOperationRunning}
                      >
                        <Send className="w-4 h-4 mr-2" />
                        {isPushing ? "Publishing..." : "Publish branch"}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </>
          )}
        </div>

        {/* Status summary and actions */}
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
            <TooltipContent side="bottom">
              {showOnlyChangedFiles
                ? "Showing only changed files - Click to show all files"
                : changedFilesCount > 0
                  ? `Show only ${changedFilesCount} changed ${changedFilesCount === 1 ? "file" : "files"}`
                  : "No changed files"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Second row: Commit message input and git action buttons */}
      {!isReviewModeActive &&
        showOnlyChangedFiles &&
        onCommit &&
        onCommitMessageChange &&
        (baseBranch === null || baseBranch === "HEAD") && (
          <div
            className="px-3 pb-1.5 flex items-center gap-1"
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
              className="flex-1 h-7 text-xs min-w-0"
              data-testid="commit-message-input"
            />

            {/* Git action buttons */}
            <div className="flex items-center gap-0.5 flex-shrink-0">
              {/* Commit button - always visible */}
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
                <TooltipContent side="bottom">
                  {isCommitting
                    ? "Committing..."
                    : !hasStagedFiles
                      ? "No staged files to commit"
                      : "Commit staged changes"}
                </TooltipContent>
              </Tooltip>

              {/* Pull/Push buttons - visible at wider widths (>=280px) */}
              {(onPull || onPush) && !isCompactMode && (
                <div className="flex items-center gap-0.5">
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
                      <TooltipContent side="bottom">
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
                      <TooltipContent side="bottom">
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
                      <TooltipContent side="bottom">
                        {isPushing ? "Publishing..." : "Publish branch"}
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
}
