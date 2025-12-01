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
import type { FileNode, TreeViewMode } from "../../types";
import { FileTreeToolbar } from "./FileTreeToolbar";
import { FileTreeNormal } from "./FileTreeNormal";
import { FileTreeChanges } from "./FileTreeChanges";
import { GitBranchToolbar } from "./GitBranchToolbar";
import { cn } from "@/utils";

// ============================================================================
// Types
// ============================================================================

export interface FileTreePanelProps {
  /** Working directory (root of the tree) */
  cwd: string;

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

  /** Git ref for branch comparison (optional) */
  baseBranch?: string | null;

  /** Git status map (relative paths to status) */
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
}

// ============================================================================
// Component
// ============================================================================

/**
 * Main file tree panel with view mode toggle.
 */
export function FileTreePanel({
  cwd,
  selectedFile,
  onFileSelect,
  treeViewMode,
  onTreeViewModeChange,
  // Git Branch Props
  currentBranch,
  baseBranch,
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
}: FileTreePanelProps) {
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

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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
        showOnlyChangedFiles={treeViewMode === "changes"}
        isReviewModeActive={isReviewModeActive}
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
            cwd={cwd}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
            baseBranch={baseBranch ?? undefined}
            onDirectoryChange={onDirectoryChange}
          />
        </div>

        {/* Changes view */}
        <div
          className={cn(
            "absolute inset-0",
            treeViewMode === "changes" ? "block" : "hidden",
          )}
        >
          <FileTreeChanges
            cwd={cwd}
            selectedFile={selectedFile}
            onFileSelect={onFileSelect}
            viewMode={changesViewMode}
          />
        </div>
      </div>
    </div>
  );
}
