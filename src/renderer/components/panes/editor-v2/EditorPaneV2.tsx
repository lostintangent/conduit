/**
 * EditorPaneV2 - Main orchestrator for the Editor v2 system.
 *
 * This component ties together all the editor subsystems:
 * - FileTreePanel for file navigation
 * - EditorViewPanel for file editing
 * - TreeResizer for panel resizing
 * - PanelViewPortToggle for narrow viewport navigation
 *
 * It handles responsive layout switching between split and single modes,
 * persists user preferences, and manages editor mode (normal vs diff).
 *
 * @example
 * ```tsx
 * <EditorPaneV2
 *   pane={{ id: "editor-1", type: "editor", cwd: "/project" }}
 * />
 * ```
 */

import { useRef, useState, useCallback, useMemo, useEffect } from "react";
import type { EditorPane as EditorPaneType } from "@/types";
import type { FileNode, TreeViewMode, ViewMode } from "./types";
import {
  FileTreePanel,
  EditorViewPanel,
  TreeResizer,
  PanelViewPortToggle,
} from "./components";
import type { PanelView } from "./components";
import { useResponsiveLayout } from "./hooks";
import { useFileSystemV2 } from "@/hooks/useFileSystemV2";
import { useGitV2 } from "@/hooks/useGitV2";
import { registerEditorHandlers } from "@/commands/handlers";
import { cn } from "@/utils";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Detect language from file path for callbacks.
 */
function detectLanguage(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";

  const languageMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    css: "css",
    scss: "scss",
    html: "html",
    py: "python",
    go: "go",
    rs: "rust",
    java: "java",
    sh: "shell",
  };

  return languageMap[ext] ?? "plaintext";
}

// ============================================================================
// Types
// ============================================================================

/**
 * Callback payload when file changes (selection or content).
 */
export interface FileChangeData {
  filePath: string;
  language: string;
  content: string;
}

export interface EditorPaneV2Props {
  /** Editor pane configuration */
  pane: EditorPaneType;

  /**
   * Callback fired when the selected file changes.
   * Includes file path, detected language, and content.
   */
  onFileChange?: (fileData: FileChangeData) => void;

  /**
   * Callback fired when the file selection is cleared.
   */
  onClearFile?: () => void;

  /**
   * Callback fired when the working directory changes.
   */
  onCwdChange?: (cwd: string) => void;

  /**
   * Callback fired when a file is opened from the tree.
   */
  onFileOpen?: (node: FileNode) => void;

  /**
   * Callback fired when tree view mode changes.
   */
  onTreeModeChange?: (mode: "all" | "changes") => void;

  /**
   * Callback fired after a successful file save.
   */
  onSave?: () => void;
}

// ============================================================================
// Constants
// ============================================================================

/** Default tree panel width in pixels */
const DEFAULT_TREE_WIDTH = 220;

/** Minimum tree panel width in pixels */
const MIN_TREE_WIDTH = 150;

/** Maximum tree panel width in pixels */
const MAX_TREE_WIDTH = 500;

// ============================================================================
// Component
// ============================================================================

/**
 * Main editor pane orchestrator.
 *
 * Manages the layout, state, and coordination between the file tree
 * and editor panels.
 */
export function EditorPaneV2({
  pane,
  onFileChange,
  onClearFile,
  onCwdChange: _onCwdChange, // Reserved for future cwd change support
  onFileOpen,
  onTreeModeChange,
  onSave,
}: EditorPaneV2Props) {
  const { cwd, filePath: initialFilePath, treeMode } = pane;

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const treePanelRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  // Tree panel width
  const [treeWidth, setTreeWidth] = useState(DEFAULT_TREE_WIDTH);

  // Tree view mode (files or changes)
  // Prefer pane config if provided
  const [treeViewMode, setTreeViewMode] = useState<TreeViewMode>(() => {
    if (treeMode === "changes") return "changes";
    if (treeMode === "all") return "files";
    return "files";
  });

  // Tree collapsed state (only applies in split layout)
  const [isTreeCollapsed, setIsTreeCollapsed] = useState(false);

  // Selected file state - initialized from pane config if provided
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(() => {
    if (initialFilePath) {
      const name = initialFilePath.split("/").pop() ?? "";
      return { path: initialFilePath, name, type: "file" };
    }
    return null;
  });

  // View mode for editor panel
  const [viewMode, setViewMode] = useState<ViewMode>({ type: "editor" });

  // Base branch for comparison (null = compare against HEAD)
  const [baseBranch, setBaseBranch] = useState<string | null>(
    pane.agentBaseBranch ?? null,
  );

  // Panel view state (for single-column layout mode)
  const [panelView, setPanelView] = useState<PanelView>("tree");

  // ---------------------------------------------------------------------------
  // Hooks
  // ---------------------------------------------------------------------------

  // Responsive layout detection
  const layout = useResponsiveLayout(containerRef);

  // Git API for checking file status
  const git = useGitV2(cwd);

  // Git status state - tracks which files have changes
  const [gitChangedFiles, setGitChangedFiles] = useState<Set<string>>(
    () => new Set(),
  );

  // Current branch name
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);

  // Staged count and change detection for git toolbar
  const [stagedCount, setStagedCount] = useState(0);
  const [hasUncommittedChanges, setHasUncommittedChanges] = useState(false);

  // Helper to update git status state
  const updateGitStatusState = useCallback(
    (status: { files: Map<string, { staged?: boolean }> } | null) => {
      if (!status?.files) {
        setGitChangedFiles(new Set());
        setStagedCount(0);
        setHasUncommittedChanges(false);
        return;
      }

      setGitChangedFiles(new Set(status.files.keys()));

      // Count staged files
      let staged = 0;
      for (const fileStatus of status.files.values()) {
        if (fileStatus.staged) {
          staged++;
        }
      }
      setStagedCount(staged);
      setHasUncommittedChanges(status.files.size > 0);
    },
    [],
  );

  // Load git status and subscribe to changes
  useEffect(() => {
    let cancelled = false;

    // Load initial status
    git
      .getStatus()
      .then((status) => {
        if (!cancelled) {
          updateGitStatusState(status);
        }
      })
      .catch((error) => {
        // Log error but don't crash - git status is non-critical
        console.error("[EditorPaneV2] Failed to load git status:", error);
      });

    // Load current branch
    git
      .getCurrentBranch()
      .then((branch) => {
        if (!cancelled) {
          setCurrentBranch(branch);
        }
      })
      .catch((error) => {
        console.error("[EditorPaneV2] Failed to load current branch:", error);
      });

    // Subscribe to status changes
    const statusCleanup = git.onStatusChanged((event) => {
      if (!cancelled) {
        updateGitStatusState(event.status);
      }
    });

    // Subscribe to branch changes
    const branchCleanup = git.onBranchChanged((event) => {
      if (!cancelled) {
        setCurrentBranch(event.currentBranch);
      }
    });

    return () => {
      cancelled = true;
      statusCleanup();
      branchCleanup();
    };
  }, [git, updateGitStatusState]);

  // Track if auto-open has been attempted (ref to avoid re-triggering effect)
  const autoOpenAttemptedRef = useRef(false);

  // Auto-open most recently modified file on mount (dirty files first, then committed)
  useEffect(() => {
    // Only attempt once per component instance
    if (autoOpenAttemptedRef.current) {
      return;
    }
    autoOpenAttemptedRef.current = true;

    // Don't auto-open if a file is already selected
    if (selectedFile || initialFilePath) {
      return;
    }

    let cancelled = false;

    const autoOpenFile = async () => {
      try {
        // Try dirty files first (most recently modified uncommitted changes)
        let relativePath = await git.getMostRecentDirtyFile();

        // Fall back to recently committed files
        if (!relativePath) {
          relativePath = await git.getMostRecentCommittedFile(10);
        }

        if (!relativePath || cancelled) {
          return;
        }

        // Convert relative path to absolute path
        const fullPath = cwd.endsWith("/")
          ? `${cwd}${relativePath}`
          : `${cwd}/${relativePath}`;
        const name = relativePath.split("/").pop() ?? relativePath;

        // Create file node and select it
        const fileNode: FileNode = {
          path: fullPath,
          name,
          type: "file",
        };

        setSelectedFile(fileNode);
      } catch (error) {
        // Silently fail - not critical if auto-open doesn't work
        console.debug("[EditorPaneV2] Auto-open failed:", error);
      }
    };

    autoOpenFile();

    return () => {
      cancelled = true;
    };
  }, [selectedFile, initialFilePath, cwd, git]);

  // Generate stable editor ID from pane ID
  const editorId = useMemo(() => `editor-${pane.id}`, [pane.id]);

  // FileSystem API for reading file content (for callbacks)
  const fs = useFileSystemV2(cwd);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle file selection from tree.
   */
  const handleFileSelect = useCallback(
    async (file: FileNode) => {
      // Track previous selection for onClearFile
      const hadPreviousFile = selectedFile !== null;

      setSelectedFile(file);

      // In single layout, switch to editor view when file is selected
      if (layout === "single") {
        setPanelView("editor");
      }

      // Set initial view mode based on git status - files with changes open in diff
      if (gitChangedFiles.has(file.path)) {
        setViewMode({
          type: "diff",
          filePath: file.path,
          baseBranch: baseBranch ?? undefined,
        });
      } else {
        setViewMode({ type: "editor" });
      }

      // Notify parent of file open
      onFileOpen?.(file);

      // Load file content and notify parent
      if (onFileChange && file.type === "file") {
        try {
          const content = await fs.readTextFile(file.path);
          onFileChange({
            filePath: file.path,
            language: detectLanguage(file.path),
            content,
          });
        } catch (error) {
          console.error(
            "[EditorPaneV2] Failed to read file for callback:",
            error,
          );
        }
      }

      // If we had a previous file and now have a different one, that's not a "clear"
      // onClearFile is for when selection is explicitly cleared (not just changed)
      void hadPreviousFile; // Acknowledge unused variable
    },
    [
      layout,
      fs,
      onFileChange,
      onFileOpen,
      selectedFile,
      gitChangedFiles,
      baseBranch,
    ],
  );

  /**
   * Handle tree view mode change (files/changes).
   */
  const handleTreeViewModeChange = useCallback(
    (mode: TreeViewMode) => {
      setTreeViewMode(mode);

      // Notify parent - map internal mode to external format
      onTreeModeChange?.(mode === "changes" ? "changes" : "all");
    },
    [onTreeModeChange],
  );

  /**
   * Handle tree width resize.
   */
  const handleTreeResize = useCallback((width: number) => {
    setTreeWidth(width);
  }, []);

  /**
   * Handle view mode change (editor/diff/changesReview).
   */
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  /**
   * Handle base branch change for comparison mode.
   */
  const handleBaseBranchChange = useCallback((branch: string | null) => {
    setBaseBranch(branch);
  }, []);

  /**
   * Handle panel view toggle (for single-column layout).
   */
  const handlePanelViewChange = useCallback((view: PanelView) => {
    setPanelView(view);
  }, []);

  /**
   * Toggle tree panel collapsed state.
   * Only effective in split layout mode.
   */
  const handleToggleTree = useCallback(() => {
    setIsTreeCollapsed((prev) => !prev);
  }, []);

  /**
   * Focus the tree panel and ensure it's visible.
   * Expands the tree if collapsed, then focuses the first focusable element.
   */
  const handleFocusTree = useCallback(() => {
    // Ensure tree is visible first
    if (isTreeCollapsed) {
      setIsTreeCollapsed(false);
    }

    // Focus the tree panel container (allows keyboard navigation)
    // Use requestAnimationFrame to ensure DOM has updated after expansion
    requestAnimationFrame(() => {
      const treePanel = treePanelRef.current;
      if (treePanel) {
        // Try to focus the first focusable element within the tree
        const focusable = treePanel.querySelector<HTMLElement>(
          'button, [tabindex]:not([tabindex="-1"]), input',
        );
        if (focusable) {
          focusable.focus();
        } else {
          // Fall back to focusing the panel itself
          treePanel.focus();
        }
      }
    });
  }, [isTreeCollapsed]);

  // ---------------------------------------------------------------------------
  // Command Registration
  // ---------------------------------------------------------------------------

  /**
   * Register editor command handlers with the command system.
   * This allows keyboard shortcuts (Cmd+B, Cmd+Shift+E) to control this pane.
   */
  useEffect(() => {
    const cleanup = registerEditorHandlers(pane.id, {
      toggleSidebar: handleToggleTree,
      focusSidebar: handleFocusTree,
    });

    return cleanup;
  }, [pane.id, handleToggleTree, handleFocusTree]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Determine visibility for each panel
  // In single layout: show based on panelView toggle
  // In split layout: tree can be collapsed via keyboard shortcut
  const showTree =
    layout === "single" ? panelView === "tree" : !isTreeCollapsed;
  const showEditor = layout === "split" || panelView === "editor";

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full overflow-hidden"
      data-testid="editor-pane-v2"
    >
      {/* File Tree Panel
       * IMPORTANT: We use CSS visibility (display: none + width: 0) instead of
       * conditional rendering to preserve the tree's scroll position, expanded
       * folders, and other DOM state when collapsed.
       */}
      <div
        ref={treePanelRef}
        className={cn(
          "flex-shrink-0 h-full overflow-hidden transition-[width] duration-150",
          !showTree && "hidden",
        )}
        style={{
          width: showTree ? (layout === "split" ? treeWidth : "100%") : 0,
        }}
        data-testid="tree-container"
        data-collapsed={!showTree}
        tabIndex={-1}
      >
        <FileTreePanel
          cwd={cwd}
          selectedFile={selectedFile}
          onFileSelect={handleFileSelect}
          treeViewMode={treeViewMode}
          onTreeViewModeChange={handleTreeViewModeChange}
          baseBranch={baseBranch ?? undefined}
          onBaseBranchChange={handleBaseBranchChange}
          currentBranch={currentBranch}
          stagedCount={stagedCount}
          hasUncommittedChanges={hasUncommittedChanges}
        />
      </div>

      {/* Tree Resizer (split mode only, hidden when tree is collapsed) */}
      {layout === "split" && showTree && (
        <TreeResizer
          currentWidth={treeWidth}
          onResize={handleTreeResize}
          minWidth={MIN_TREE_WIDTH}
          maxWidth={MAX_TREE_WIDTH}
        />
      )}

      {/* Editor View Panel */}
      <div
        className={cn(
          "flex-1 min-w-0 h-full overflow-hidden",
          layout === "single" && !showEditor && "hidden",
        )}
        data-testid="editor-container"
      >
        <EditorViewPanel
          editorId={editorId}
          cwd={cwd}
          selectedFile={selectedFile}
          viewMode={viewMode}
          onViewModeChange={handleViewModeChange}
          baseBranch={baseBranch ?? undefined}
          onSave={onSave}
        />
      </div>

      {/* Panel View Toggle (single-column layout only) */}
      {layout === "single" && (
        <PanelViewPortToggle
          activeView={panelView}
          onViewChange={handlePanelViewChange}
        />
      )}
    </div>
  );
}
