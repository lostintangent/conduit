/**
 * FileTreePanel - Main file tree container with view mode toggle.
 *
 * This component orchestrates between two views:
 * - Files: Normal directory tree (FileTreeNormal)
 * - Changes: Git changes view (FileTreeChanges)
 *
 * Both views are kept mounted but hidden to preserve state when switching.
 * When in changes mode, a GitOperationsToolbar is shown for commit operations.
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
 *   stagedCount={3}
 *   hasUncommittedChanges={true}
 * />
 * ```
 */

import { Files, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FileNode, TreeViewMode } from "../../types";
import { FileTreeToolbar } from "./FileTreeToolbar";
import { FileTreeNormal } from "./FileTreeNormal";
import { FileTreeChanges } from "./FileTreeChanges";
import { GitOperationsToolbar } from "../GitOperationsToolbar";
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

  /** Git ref for branch comparison (optional) */
  baseBranch?: string;

  /** Callback when base branch changes */
  onBaseBranchChange?: (branch: string | null) => void;

  /** Current branch name (for display) */
  currentBranch?: string | null;

  /** Number of staged files */
  stagedCount?: number;

  /** Whether there are any uncommitted changes */
  hasUncommittedChanges?: boolean;

  /** Callback fired after successful commit */
  onCommitSuccess?: () => void;

  // ---------------------------------------------------------------------------
  // Navigation Props (Phase 4)
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
  baseBranch,
  onBaseBranchChange,
  currentBranch,
  stagedCount = 0,
  hasUncommittedChanges = false,
  onCommitSuccess,
  canNavigateUp = false,
  onNavigateUp,
  isTreeCollapsed = false,
  onToggleCollapse,
  showCollapseButton = false,
}: FileTreePanelProps) {
  // Handle navigate up - only call if handler is provided
  const handleNavigateUp = () => {
    onNavigateUp?.();
  };

  return (
    <div className="flex flex-col h-full" data-testid="file-tree-panel">
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

      {/* Header with view mode toggle */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border">
        <Button
          variant={treeViewMode === "files" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2 gap-1"
          onClick={() => onTreeViewModeChange("files")}
          title="File Explorer"
          data-testid="files-mode-button"
        >
          <Files className="h-4 w-4" />
          <span className="text-xs">Files</span>
        </Button>

        <Button
          variant={treeViewMode === "changes" ? "secondary" : "ghost"}
          size="sm"
          className="h-7 px-2 gap-1"
          onClick={() => onTreeViewModeChange("changes")}
          title="Source Control"
          data-testid="changes-mode-button"
        >
          <GitBranch className="h-4 w-4" />
          <span className="text-xs">Changes</span>
        </Button>

        {/* Branch comparison indicator */}
        {baseBranch && (
          <span className="ml-auto text-xs text-muted-foreground truncate">
            vs {baseBranch}
          </span>
        )}
      </div>

      {/* Git Operations Toolbar - shown only in changes mode */}
      {treeViewMode === "changes" && onBaseBranchChange && (
        <GitOperationsToolbar
          cwd={cwd}
          currentBranch={currentBranch ?? null}
          baseBranch={baseBranch ?? null}
          onBaseBranchChange={onBaseBranchChange}
          stagedCount={stagedCount}
          hasUncommittedChanges={hasUncommittedChanges}
          onCommitSuccess={onCommitSuccess}
        />
      )}

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
            baseBranch={baseBranch}
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
          />
        </div>
      </div>
    </div>
  );
}
