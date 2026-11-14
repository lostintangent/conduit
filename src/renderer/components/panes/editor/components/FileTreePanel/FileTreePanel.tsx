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

import type { GitFileStatus } from "@features/git/model";
import type { FileSystemV2API } from "@features/files/client/FileSystemV2API";
import type { GitV2API } from "@features/git/client/GitV2API";
import { cn } from "@/utils";
import { forwardRef, memo } from "react";
import { useGitSync, usePanelHeight } from "../../hooks";
import type { FileNode, TreeViewMode } from "../../types";
import { CommitGraphPanel } from "../CommitGraph";
import type {
  CommitFileSelectEvent,
  CommitViewEvent,
} from "../CommitGraph/types";
import { FileTreeChanges } from "./FileTreeChanges";
import { FileTreeNormal, type FileTreeNormalHandle } from "./FileTreeNormal";
import { FileTreeToolbar } from "./FileTreeToolbar";
import { GitBranchToolbar } from "./GitBranchToolbar";
import { PanelResizer } from "./PanelResizer";

/**
 * Handle type for imperative methods exposed by FileTreePanel.
 * Re-exports the same interface as FileTreeNormal for convenience.
 */
export type FileTreePanelHandle = FileTreeNormalHandle;

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

  /**
   * Selected map key for changes mode (null for files mode).
   * Identifies which entry is selected for partially staged files.
   */
  selectedMapKey?: string | null;

  /**
   * Callback when a file is selected.
   * @param file - The file node
   * @param mapKey - The map key (for changes mode) or null (for files mode)
   */
  onFileSelect: (file: FileNode, mapKey: string | null) => void;

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
  gitStatus: Map<string, GitFileStatus> | null;

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

  /** Current commit message */
  commitMessage?: string;

  /** Callback when commit message changes */
  onCommitMessageChange?: (message: string) => void;

  /** Callback for commit action */
  onCommit?: () => void;

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
  // Follow Mode Props
  // ---------------------------------------------------------------------------

  /** Check if a file is unseen (Follow mode) - returns true if file has unacknowledged changes */
  isFileUnseen?: (path: string) => boolean;

  /** Callback when a file/folder is renamed - used to preserve seen status */
  onPathRename?: (oldPath: string, newPath: string) => void;

  /** Mark a file as seen (unseen tracking) */
  markSeen?: (path: string) => void;

  // ---------------------------------------------------------------------------
  // Dirty File Props
  // ---------------------------------------------------------------------------

  /** Check if a file has unsaved changes - used to prevent staging dirty files */
  isFileDirty?: (filePath: string) => boolean;

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
 *
 * Memoized to prevent unnecessary re-renders when parent state changes
 * but props remain the same (e.g., file selection in editor).
 */
export const FileTreePanel = memo(
  forwardRef<FileTreePanelHandle, FileTreePanelProps>(function FileTreePanel(
    {
      paneId,
      cwd,
      fs,
      git,
      selectedFile,
      selectedMapKey,
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
      commitMessage = "",
      onCommitMessageChange,
      onCommit,
      onReviewChanges,
      onBranchSwitch,
      // Navigation Props
      canNavigateUp = false,
      onNavigateUp,
      onToggleCollapse,
      showCollapseButton = false,
      onDirectoryChange,
      // Changes View Mode Props
      changesViewMode = "nested",
      onChangesViewModeChange,
      // Follow Mode Props
      isFileUnseen,
      onPathRename,
      markSeen,
      // Dirty File Props
      isFileDirty,
      // Commit Graph Props
      onCommitFileSelect,
      onViewCommit,
    },
    ref,
  ) {
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

    const gitSync = useGitSync(git);

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
          onPull={gitSync.pull}
          onPush={gitSync.push}
          isPulling={gitSync.isPulling}
          isPushing={gitSync.isPushing}
          hasUpstream={gitSync.hasUpstream}
          commitMessage={commitMessage}
          onCommitMessageChange={onCommitMessageChange}
          onCommit={onCommit}
          hasStagedFiles={stagedCount > 0}
          isCommitting={gitSync.isCommitting}
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
              ref={ref}
              paneId={paneId}
              cwd={cwd}
              fs={fs}
              selectedFile={selectedFile}
              onFileSelect={onFileSelect}
              onDirectoryChange={onDirectoryChange}
              gitStatus={gitStatus}
              onPathRename={onPathRename}
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
                fs={fs}
                git={git}
                selectedFile={selectedFile}
                selectedMapKey={selectedMapKey}
                onFileSelect={onFileSelect}
                viewMode={changesViewMode}
                gitStatus={gitStatus}
                isComparingToBranch={isComparingToBranch}
                baseBranchName={baseBranch}
                isFileUnseen={isFileUnseen}
                isFileDirty={isFileDirty}
                onPathRename={onPathRename}
                markSeen={markSeen}
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
  }),
);
