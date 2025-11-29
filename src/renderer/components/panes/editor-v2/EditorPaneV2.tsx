/**
 * EditorPaneV2 - Main orchestrator for the Editor v2 system.
 *
 * This component ties together all the editor subsystems:
 * - FileTreePanel for file navigation
 * - EditorViewPanel for file editing
 * - TreeResizer for panel resizing
 * - MobileViewToggle for narrow viewport navigation
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
  MobileViewToggle,
} from "./components";
import type { MobileView } from "./components";
import { useResponsiveLayout } from "./hooks";
import { useFileSystemV2 } from "@/hooks/useFileSystemV2";
import { useGitV2 } from "@/hooks/useGitV2";
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

/** LocalStorage key prefix for persisted settings */
const STORAGE_KEY_PREFIX = "editor-v2";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get persisted tree width from localStorage.
 */
function getPersistedTreeWidth(): number {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}:treeWidth`);
    if (stored) {
      const width = parseInt(stored, 10);
      if (!isNaN(width) && width >= MIN_TREE_WIDTH && width <= MAX_TREE_WIDTH) {
        return width;
      }
    }
  } catch {
    // localStorage not available
  }
  return DEFAULT_TREE_WIDTH;
}

/**
 * Persist tree width to localStorage.
 */
function persistTreeWidth(width: number): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}:treeWidth`, String(width));
  } catch {
    // localStorage not available
  }
}

/**
 * Get persisted tree view mode from localStorage.
 */
function getPersistedTreeViewMode(): TreeViewMode {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY_PREFIX}:treeViewMode`);
    if (stored === "files" || stored === "changes") {
      return stored;
    }
  } catch {
    // localStorage not available
  }
  return "files";
}

/**
 * Persist tree view mode to localStorage.
 */
function persistTreeViewMode(mode: TreeViewMode): void {
  try {
    localStorage.setItem(`${STORAGE_KEY_PREFIX}:treeViewMode`, mode);
  } catch {
    // localStorage not available
  }
}

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

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  // Selected file state - initialized from pane config if provided
  const [selectedFile, setSelectedFile] = useState<FileNode | null>(() => {
    if (initialFilePath) {
      const name = initialFilePath.split("/").pop() ?? "";
      return { path: initialFilePath, name, type: "file" };
    }
    return null;
  });

  // Tree view mode (files or changes)
  const [treeViewMode, setTreeViewMode] = useState<TreeViewMode>(() => {
    // Prefer pane config, then localStorage
    if (treeMode === "changes") return "changes";
    if (treeMode === "all") return "files";
    return getPersistedTreeViewMode();
  });

  // View mode for editor panel
  const [viewMode, setViewMode] = useState<ViewMode>({ type: "editor" });

  // Base branch for comparison (null = compare against HEAD)
  const [baseBranch, setBaseBranch] = useState<string | null>(
    pane.agentBaseBranch ?? null,
  );

  // Tree panel width (persisted)
  const [treeWidth, setTreeWidth] = useState<number>(getPersistedTreeWidth);

  // Mobile view state (for single layout mode)
  const [mobileView, setMobileView] = useState<MobileView>("tree");

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

  // Load git status and subscribe to changes
  useEffect(() => {
    // Load initial status
    git.getStatus().then((status) => {
      if (status?.files) {
        setGitChangedFiles(new Set(status.files.keys()));
      }
    });

    // Subscribe to status changes
    const cleanup = git.onStatusChanged((event) => {
      setGitChangedFiles(new Set(event.status.files.keys()));
    });

    return cleanup;
  }, [git]);

  // Track if auto-open has been attempted (ref to avoid re-triggering effect)
  const autoOpenAttemptedRef = useRef(false);

  // Auto-open most recently modified file on mount (dirty files first, then committed)
  useEffect(() => {
    // Only attempt once per component instance
    if (autoOpenAttemptedRef.current) {
      return;
    }
    autoOpenAttemptedRef.current = true;

    const sessionKey = `editor-v2-auto-opened-${pane.id}`;

    // Only run once per session
    const hasAutoOpened = sessionStorage.getItem(sessionKey);
    if (hasAutoOpened) {
      return;
    }

    // Don't auto-open if a file is already selected
    if (selectedFile || initialFilePath) {
      sessionStorage.setItem(sessionKey, "true");
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
        sessionStorage.setItem(sessionKey, "true");
      } catch (error) {
        // Silently fail - not critical if auto-open doesn't work
        console.debug("[EditorPaneV2] Auto-open failed:", error);
      }
    };

    autoOpenFile();

    return () => {
      cancelled = true;
    };
  }, [pane.id, selectedFile, initialFilePath, cwd, git]);

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
        setMobileView("editor");
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
      persistTreeViewMode(mode);

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
    persistTreeWidth(width);
  }, []);

  /**
   * Handle view mode change (editor/diff/changesReview).
   */
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  /**
   * Handle mobile view toggle.
   */
  const handleMobileViewChange = useCallback((view: MobileView) => {
    setMobileView(view);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Determine if tree should be visible
  const showTree = layout === "split" || mobileView === "tree";
  const showEditor = layout === "split" || mobileView === "editor";

  return (
    <div
      ref={containerRef}
      className="flex h-full w-full overflow-hidden"
      data-testid="editor-pane-v2"
    >
      {/* File Tree Panel */}
      <div
        className={cn(
          "flex-shrink-0 h-full overflow-hidden",
          layout === "single" && !showTree && "hidden",
        )}
        style={{
          width: layout === "split" ? treeWidth : "100%",
        }}
        data-testid="tree-container"
      >
        <FileTreePanel
          cwd={cwd}
          selectedFile={selectedFile}
          onFileSelect={handleFileSelect}
          treeViewMode={treeViewMode}
          onTreeViewModeChange={handleTreeViewModeChange}
          baseBranch={baseBranch ?? undefined}
        />
      </div>

      {/* Tree Resizer (split mode only) */}
      {layout === "split" && (
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

      {/* Mobile View Toggle (single mode only) */}
      {layout === "single" && (
        <MobileViewToggle
          activeView={mobileView}
          onViewChange={handleMobileViewChange}
        />
      )}
    </div>
  );
}
