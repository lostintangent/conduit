/**
 * FileTreePanel - Main file tree container with view mode toggle.
 *
 * This component orchestrates between two views:
 * - Files: Normal directory tree (FileTreeNormal)
 * - Changes: Git changes view (FileTreeChanges)
 *
 * Both views are kept mounted but hidden to preserve state when switching.
 * Uses GitBranchToolbar for branch comparison, git status, and operations.
 *
 * @example
 * ```tsx
 * <FileTreePanel
 *   cwd="/project"
 *   selectedFile={selectedFile}
 *   onFileSelect={(file) => openFile(file)}
 *   treeViewMode="files"
 *   onTreeViewModeChange={(mode) => setTreeViewMode(mode)}
 *   currentBranch="main"
 *   gitStatus={gitStatus}
 *   stagedCount={3}
 * />
 * ```
 */

import type { GitFileStatus } from "@/../../src/ipc/gitv2/types";
import type { GitV2API } from "@/api/GitV2API";
import type { FileSystemV2API } from "@/api/FileSystemV2API";
import type { FileNode, TreeViewMode } from "../../types";
import type {
  CommitFileSelectEvent,
  CommitViewEvent,
} from "../CommitGraph/types";
import { FileTreeToolbar } from "./FileTreeToolbar";
import { FileTreeNormal } from "./FileTreeNormal";
import { FileTreeChanges } from "./FileTreeChanges";
import { GitBranchToolbar } from "./GitBranchToolbar";
import { PanelResizer } from "./PanelResizer";
import { CommitGraphPanel } from "../CommitGraph";
import { usePanelHeight } from "../../hooks";
import { cn } from "@/utils";

export interface FileTreePanelProps {
  /** Editor pane ID (for scroll persistence) */
  paneId: string;

  /** Working directory (root of the tree) */
  cwd: string;

  /** FileSystem API instance (shared from parent) */
  fs: FileSystemV2API;

  /** Git API instance (shared from parent) */
  git: GitV2API;

  /** Currently selected file (null if none) */
  selectedFile: FileNode | null;

  /** Callback when a file is selected */
  onFileSelect: (file: FileNode) => void;

  /** Current view mode (files or changes) */
  treeViewMode: TreeViewMode;

  /** Callback when view mode changes */
  onTreeViewModeChange: (mode: TreeViewMode) => void;

  // ---------------------------------------------------------------------------
  // Git Branch Props
  // ---------------------------------------------------------------------------

  /** Current branch name (for display) */
  currentBranch?: string | null;

  /** Base branch name for display (e.g., "main") */
  baseBranch?: string | null;

  /** Whether we're comparing to a branch (not HEAD) - controls behavior */
  isComparingToBranch?: boolean;

  /** Git status map (relative paths to status) - source of truth from parent */
  gitStatus?: Map<string, GitFileStatus> | null;

  /** Number of changed files */
  changedFilesCount?: number;

  /** Callback to open branch picker */
  onOpenBranchPicker?: () => void;

  /** Whether changes review mode is active */
  isReviewModeActive?: boolean;

  // ---------------------------------------------------------------------------
  // Git Operations Props
  // ---------------------------------------------------------------------------

  /** Number of staged files */
  stagedCount?: number;

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

  /** Current commit message */
  commitMessage?: string;

  /** Callback when commit message changes */
  onCommitMessageChange?: (message: string) => void;

  /** Callback for commit action */
  onCommit?: () => void;

  /** Whether commit is in progress */
  isCommitting?: boolean;

  /** Callback for review changes action */
  onReviewChanges?: () => void;

  /** Callback when branch is switched */
  onBranchSwitch?: (newBranch: string) => void;

  // ---------------------------------------------------------------------------
  // Navigation Props
  // ---------------------------------------------------------------------------

  /** Whether navigation to parent directory is possible */
  canNavigateUp?: boolean;

  /** Callback when navigate up button is clicked */
  onNavigateUp?: () => void;

  /** Whether the tree panel is collapsed (for collapse toggle button state) */
  isTreeCollapsed?: boolean;

  /** Callback when collapse toggle is clicked */
  onToggleCollapse?: () => void;

  /** Whether to show the collapse button (only in split layout mode) */
  showCollapseButton?: boolean;

  /** Callback when "change to this directory" is clicked on a folder */
  onDirectoryChange?: (path: string) => void;

  // ---------------------------------------------------------------------------
  // Changes View Mode Props
  // ---------------------------------------------------------------------------

  /** Current view mode for changes list (flat or nested) */
  changesViewMode?: "flat" | "nested";

  /** Callback when changes view mode changes */
  onChangesViewModeChange?: (mode: "flat" | "nested") => void;

  // ---------------------------------------------------------------------------
  // Commit Graph Props
  // ---------------------------------------------------------------------------

  /** Callback when a file is selected in the commit graph */
  onCommitFileSelect?: (event: CommitFileSelectEvent) => void;

  /** Callback when "view all" is clicked on a commit */
  onViewCommit?: (event: CommitViewEvent) => void;
}

/**
 * Main file tree panel with view mode toggle.
 */
export function FileTreePanel({
  paneId,
  cwd,
  fs,
  git,
  selectedFile,
  onFileSelect,
  treeViewMode,
  onTreeViewModeChange,
  // Git Branch Props
  currentBranch,
  baseBranch,
  isComparingToBranch = false,
  gitStatus,
  changedFilesCount = 0,
  onOpenBranchPicker,
  isReviewModeActive = false,
  // Git Operations Props
  stagedCount = 0,
  onPull,
  onPush,
  isPulling = false,
  isPushing = false,
  hasUpstream = true,
  commitMessage = "",
  onCommitMessageChange,
  onCommit,
  isCommitting = false,
  onReviewChanges,
  onBranchSwitch,
  // Navigation Props
  canNavigateUp = false,
  onNavigateUp,
  isTreeCollapsed = false,
  onToggleCollapse,
  showCollapseButton = false,
  onDirectoryChange,
  // Changes View Mode Props
  changesViewMode = "flat",
  onChangesViewModeChange,
  // Commit Graph Props
  onCommitFileSelect,
  onViewCommit,
}: FileTreePanelProps) {
  // ---------------------------------------------------------------------------
  // Commit Graph Height State
  // ---------------------------------------------------------------------------

  const {
    height: commitGraphHeight,
    setHeight: setCommitGraphHeight,
    minHeight: minCommitGraphHeight,
    maxHeight: maxCommitGraphHeight,
  } = usePanelHeight({
    storageKey: "commit-graph-height",
    defaultHeight: 200,
    minHeight: 100,
    maxHeight: 600,
  });
  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle navigate up - only call if handler is provided.
   */
  const handleNavigateUp = () => {
    onNavigateUp?.();
  };

  /**
   * Handle filter toggle - switches between files and changes view.
   */
  const handleFilterToggle = () => {
    onTreeViewModeChange(treeViewMode === "changes" ? "files" : "changes");
  };

  return (
    <div
      className="flex flex-col h-full bg-background"
      data-testid="file-tree-panel"
    >
      {/* Navigation Toolbar */}
      {onNavigateUp && (
        <FileTreeToolbar
          cwd={cwd}
          canNavigateUp={canNavigateUp}
          onNavigateUp={handleNavigateUp}
          isCollapsed={isTreeCollapsed}
          onToggleCollapse={onToggleCollapse}
          showCollapseButton={showCollapseButton}
        />
      )}

      {/* Git Branch Toolbar */}
      <GitBranchToolbar
        currentBranch={currentBranch ?? null}
        baseBranch={baseBranch ?? null}
        git={git}
        showOnlyChangedFiles={treeViewMode === "changes"}
        isReviewModeActive={isReviewModeActive}
        onBranchSwitch={onBranchSwitch}
        changedFilesCount={changedFilesCount}
        gitStatus={gitStatus}
        onFilterToggle={handleFilterToggle}
        onOpenBranchPicker={onOpenBranchPicker}
        onPull={onPull}
        onPush={onPush}
        isPulling={isPulling}
        isPushing={isPushing}
        hasUpstream={hasUpstream}
        commitMessage={commitMessage}
        onCommitMessageChange={onCommitMessageChange}
        onCommit={onCommit}
        hasStagedFiles={stagedCount > 0}
        isCommitting={isCommitting}
        onReviewChanges={onReviewChanges}
        changesViewMode={changesViewMode}
        onChangesViewModeChange={onChangesViewModeChange}
      />

      {/* Tree content - both mounted, visibility toggled */}
      <div className="flex-1 min-h-0 relative">
        {/* Files view */}
        <div
          className={cn(
            "absolute inset-0",
            treeViewMode === "files" ? "block" : "hidden",
          )}
        >
          <FileTreeNormal
            paneId={paneId}
            cwd={cwd}
            fs={fs}
            git={git}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
            onDirectoryChange={onDirectoryChange}
            gitStatus={gitStatus}
          />
        </div>

        {/* Changes view - includes file list and commit graph */}
        <div
          className={cn(
            "absolute inset-0 flex flex-col",
            treeViewMode === "changes" ? "flex" : "hidden",
          )}
        >
          {/* File changes list - takes remaining space */}
          <div className="flex-1 min-h-0 overflow-auto">
            <FileTreeChanges
              paneId={paneId}
              cwd={cwd}
              git={git}
              selectedFile={selectedFile}
              onFileSelect={onFileSelect}
              viewMode={changesViewMode}
              gitStatus={gitStatus}
              isComparingToBranch={isComparingToBranch}
              baseBranchName={baseBranch}
            />
          </div>

          {/* Resizer between file list and commit graph */}
          <PanelResizer
            onResize={setCommitGraphHeight}
            minHeight={minCommitGraphHeight}
            maxHeight={maxCommitGraphHeight}
          />

          {/* Commit history graph - fixed height at bottom */}
          <div
            className="shrink-0 overflow-hidden"
            style={{ height: commitGraphHeight }}
          >
            <CommitGraphPanel
              git={git}
              onFileSelect={onCommitFileSelect}
              onViewCommit={onViewCommit}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
