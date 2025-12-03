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
import type { GitFileStatus } from "@/../../src/ipc/gitv2/types";
import {
  FileTreePanel,
  EditorViewPanel,
  TreeResizer,
  PanelViewPortToggle,
} from "./components";
import type { PanelView } from "./components";
import { useResponsiveLayout, useEditorTheme } from "./hooks";
import { useFileSystemV2 } from "@/hooks/useFileSystemV2";
import { useGitV2 } from "@/hooks/useGitV2";
import { registerEditorHandlers } from "@/commands/handlers";
import { cn } from "@/utils";
import { detectLanguage } from "./utils/languageDetection";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Compute the parent directory of a given path.
 * Returns null if already at filesystem root.
 */
function getParentDirectory(path: string): string | null {
  // Normalize: remove trailing slash
  const normalized = path.endsWith("/") ? path.slice(0, -1) : path;

  // Check for root paths
  if (normalized === "" || normalized === "/") {
    return null;
  }

  // Windows root check (e.g., "C:" or "C:\")
  if (/^[A-Za-z]:$/.test(normalized) || /^[A-Za-z]:\\?$/.test(normalized)) {
    return null;
  }

  // Find last separator
  const lastSlash = normalized.lastIndexOf("/");

  if (lastSlash === -1) {
    // No slash found - Windows root like "C:\folder"
    const backslashIndex = normalized.lastIndexOf("\\");
    if (backslashIndex <= 2) {
      // At or near root
      return normalized.slice(0, backslashIndex + 1) || null;
    }
    return normalized.slice(0, backslashIndex);
  }

  if (lastSlash === 0) {
    // Root directory (Unix)
    return "/";
  }

  return normalized.slice(0, lastSlash);
}

/**
 * Check if a path is at the filesystem root.
 */
function isAtFilesystemRoot(path: string): boolean {
  const normalized = path.endsWith("/") ? path.slice(0, -1) : path;

  // Unix root
  if (normalized === "" || normalized === "/") {
    return true;
  }

  // Windows root
  if (/^[A-Za-z]:$/.test(normalized) || /^[A-Za-z]:\\?$/.test(normalized)) {
    return true;
  }

  return false;
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
  onCwdChange,
  onFileOpen,
  onTreeModeChange,
  onSave,
}: EditorPaneV2Props) {
  const { cwd: initialCwd, filePath: initialFilePath, treeMode } = pane;

  // Get editor theme from user settings
  const editorTheme = useEditorTheme();

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const treePanelRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  // Current working directory (can change via navigation)
  const [currentCwd, setCurrentCwd] = useState(initialCwd);

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

  // Changes view mode (flat or nested) for FileTreeChanges
  const [changesViewMode, setChangesViewMode] = useState<"flat" | "nested">(
    "flat",
  );

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
  const git = useGitV2(currentCwd);

  // ---------------------------------------------------------------------------
  // Git State
  // ---------------------------------------------------------------------------

  // Full git status map (for GitBranchToolbar)
  const [gitStatus, setGitStatus] = useState<Map<string, GitFileStatus> | null>(
    null,
  );

  // Git status state - tracks which files have changes
  const [gitChangedFiles, setGitChangedFiles] = useState<Set<string>>(
    () => new Set(),
  );

  // Current branch name
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);

  // Staged count and change detection for git toolbar
  const [stagedCount, setStagedCount] = useState(0);

  // Commit message state
  const [commitMessage, setCommitMessage] = useState("");

  // Git operation states
  const [isCommitting, setIsCommitting] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [hasUpstream, setHasUpstream] = useState(true);

  // Helper to update git status state
  const updateGitStatusState = useCallback(
    (status: { files: Map<string, GitFileStatus> } | null) => {
      if (!status?.files) {
        setGitStatus(null);
        setGitChangedFiles(new Set());
        setStagedCount(0);
        return;
      }

      // Store full status map for GitBranchToolbar
      setGitStatus(status.files);
      setGitChangedFiles(new Set(status.files.keys()));

      // Count staged files
      let staged = 0;
      for (const fileStatus of status.files.values()) {
        if (fileStatus.staged) {
          staged++;
        }
      }
      setStagedCount(staged);
    },
    [],
  );

  // Load git status and subscribe to changes
  useEffect(() => {
    let cancelled = false;

    // Subscribe to status changes (can set up immediately - will receive events when ready)
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

    // Load initial data after git API is ready
    // This is important for the global container pattern where the first editor
    // might mount before the git API has received its initial data from IPC
    const loadInitialData = async () => {
      try {
        // Wait for git subscription to be ready before querying
        await git.whenReady();

        if (cancelled) return;

        // Load initial status
        const status = await git.getStatus();
        if (!cancelled) {
          updateGitStatusState(status);
          // Check if upstream is configured
          if (status) {
            setHasUpstream(!!status.upstream);
          }
        }

        // Load current branch
        const branch = await git.getCurrentBranch();
        if (!cancelled) {
          setCurrentBranch(branch);
        }
      } catch (error) {
        // Log error but don't crash - git status is non-critical
        console.error("[EditorPaneV2] Failed to load initial git data:", error);
      }
    };

    loadInitialData();

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
        // Wait for git subscription to be ready before querying
        await git.whenReady();

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
        const fullPath = currentCwd.endsWith("/")
          ? `${currentCwd}${relativePath}`
          : `${currentCwd}/${relativePath}`;
        const name = relativePath.split("/").pop() ?? relativePath;

        // Create file node and select it
        const fileNode: FileNode = {
          path: fullPath,
          name,
          type: "file",
        };

        setSelectedFile(fileNode);

        // Check if file is specifically "modified" in git status
        // Only "modified" files get diff view, not "added" files
        // Note: git status uses relative paths, so use relativePath not fullPath
        const status = await git.getStatus();
        const fileStatus = status?.files.get(relativePath);
        if (fileStatus?.status === "modified") {
          setViewMode({
            type: "diff",
            filePath: fullPath,
            baseBranch: baseBranch ?? undefined,
          });
        } else {
          setViewMode({ type: "editor" });
        }
      } catch (error) {
        // Silently fail - not critical if auto-open doesn't work
        console.debug("[EditorPaneV2] Auto-open failed:", error);
      }
    };

    autoOpenFile();

    return () => {
      cancelled = true;
    };
  }, [selectedFile, initialFilePath, currentCwd, git, baseBranch]);

  // Generate stable editor ID from pane ID
  const editorId = useMemo(() => `editor-${pane.id}`, [pane.id]);

  // FileSystem API for reading file content (for callbacks)
  const fs = useFileSystemV2(currentCwd);

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

      // Set initial view mode based on git status - modified files open in diff
      // Only "modified" files get diff view, not "added" files (added files have no base to diff against)
      // Note: gitStatus uses relative paths, so we need to convert the absolute file.path
      const relativePath = file.path.startsWith(currentCwd)
        ? file.path.slice(currentCwd.length).replace(/^\//, "")
        : file.path;
      const fileStatus = gitStatus?.get(relativePath);
      if (fileStatus?.status === "modified") {
        setViewMode({
          type: "diff",
          filePath: file.path,
          baseBranch: baseBranch ?? undefined,
        });
      } else {
        setViewMode({ type: "editor" });
      }

      // Note: onFileOpen is NOT called here - it's for external "open in quick pane" action
      // File selection within the editor just updates selectedFile state

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
    [layout, fs, onFileChange, selectedFile, gitChangedFiles, baseBranch],
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
   * Handle base branch change for comparison mode.
   */
  const handleBaseBranchChange = useCallback((branch: string | null) => {
    setBaseBranch(branch);
  }, []);

  /**
   * Handle navigation to parent directory.
   * Clears the selected file and updates the working directory.
   */
  const handleNavigateUp = useCallback(() => {
    const parentDir = getParentDirectory(currentCwd);
    if (!parentDir) return;

    // Clear selected file when navigating
    setSelectedFile(null);
    onClearFile?.();

    // Update current working directory
    setCurrentCwd(parentDir);

    // Notify parent of cwd change
    onCwdChange?.(parentDir);
  }, [currentCwd, onClearFile, onCwdChange]);

  /**
   * Handle commit action.
   */
  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim() || stagedCount === 0) return;

    setIsCommitting(true);
    try {
      await git.commit(commitMessage.trim());
      setCommitMessage("");
    } catch (error) {
      console.error("[EditorPaneV2] Commit failed:", error);
    } finally {
      setIsCommitting(false);
    }
  }, [commitMessage, stagedCount, git]);

  /**
   * Handle pull action.
   */
  const handlePull = useCallback(async () => {
    if (isPulling || isPushing || isCommitting) return;

    setIsPulling(true);
    try {
      await window.conduit.gitPull(currentCwd, false);
    } catch (error) {
      console.error("[EditorPaneV2] Pull failed:", error);
    } finally {
      setIsPulling(false);
    }
  }, [currentCwd, isPulling, isPushing, isCommitting]);

  /**
   * Handle push action (or publish if no upstream).
   */
  const handlePush = useCallback(async () => {
    if (isPulling || isPushing || isCommitting) return;

    setIsPushing(true);
    try {
      const isPublishing = !hasUpstream;
      await window.conduit.gitPush(currentCwd, false, isPublishing);

      if (isPublishing) {
        setHasUpstream(true);
      }
    } catch (error) {
      console.error(
        `[EditorPaneV2] ${hasUpstream ? "Push" : "Publish"} failed:`,
        error,
      );
    } finally {
      setIsPushing(false);
    }
  }, [currentCwd, hasUpstream, isPulling, isPushing, isCommitting]);

  /**
   * Whether navigation up is possible.
   */
  const canNavigateUp = !isAtFilesystemRoot(currentCwd);

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
   * Handle changing the current working directory to a specific folder.
   * Similar to navigateUp but navigates to the clicked directory instead.
   */
  const handleDirectoryChange = useCallback(
    (path: string) => {
      // Clear selected file when changing directory
      setSelectedFile(null);
      onClearFile?.();

      // Update current working directory
      setCurrentCwd(path);

      // Notify parent of cwd change
      onCwdChange?.(path);
    },
    [onClearFile, onCwdChange],
  );

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

  /**
   * Keyboard shortcuts for editor actions.
   * Handles Cmd/Ctrl+S (save). Monaco handles Cmd/Ctrl+F (find) internally.
   */
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd/Ctrl+S: Save file
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "s" &&
        selectedFile &&
        onSave
      ) {
        event.preventDefault();
        onSave();
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedFile, onSave]);

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
      className="relative flex h-full w-full overflow-hidden bg-background"
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
          "flex-shrink-0 h-full overflow-hidden",
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
          paneId={pane.id}
          cwd={currentCwd}
          selectedFile={selectedFile}
          onFileSelect={handleFileSelect}
          treeViewMode={treeViewMode}
          onTreeViewModeChange={handleTreeViewModeChange}
          // Git Branch Props
          currentBranch={currentBranch}
          stagedCount={stagedCount}
          onPull={handlePull}
          onPush={handlePush}
          isPulling={isPulling}
          isPushing={isPushing}
          hasUpstream={hasUpstream}
          commitMessage={commitMessage}
          onCommitMessageChange={setCommitMessage}
          onCommit={handleCommit}
          isCommitting={isCommitting}
          // Navigation Props
          canNavigateUp={canNavigateUp}
          onNavigateUp={handleNavigateUp}
          isTreeCollapsed={isTreeCollapsed}
          onToggleCollapse={handleToggleTree}
          showCollapseButton={layout === "split"}
          baseBranch={baseBranch}
          gitStatus={gitStatus}
          changedFilesCount={gitChangedFiles.size}
          onDirectoryChange={handleDirectoryChange}
          changesViewMode={changesViewMode}
          onChangesViewModeChange={setChangesViewMode}
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
          cwd={currentCwd}
          selectedFile={selectedFile}
          viewMode={viewMode}
          baseBranch={baseBranch ?? undefined}
          theme={editorTheme}
          onSave={onSave}
          showBackButton={layout === "single"}
          onBack={() => setPanelView("tree")}
          showExpandTreeButton={layout === "split" && isTreeCollapsed}
          onExpandTree={() => setIsTreeCollapsed(false)}
        />
      </div>

      {/* Panel View Toggle (single-column layout only) */}
      {layout === "single" && (
        <PanelViewPortToggle
          activeView={panelView}
          onViewChange={handlePanelViewChange}
        />
      )}

      {/* v2 Indicator Badge (development only) */}
      {import.meta.env.DEV && (
        <div
          className="absolute bottom-1 left-1 px-1.5 py-0.5 text-[10px] font-mono font-bold bg-blue-500/80 text-white rounded"
          title="Editor v2 is active"
          data-testid="v2-indicator"
        >
          v2
        </div>
      )}
    </div>
  );
}
