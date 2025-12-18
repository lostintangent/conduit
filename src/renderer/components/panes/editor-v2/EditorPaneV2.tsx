/**
 * EditorPaneV2 - Main orchestrator for the Editor v2 system.
 *
 * This component ties together all the editor subsystems:
 * - FileTreePanel for file navigation
 * - EditorViewPanel for file editing
 * - TreeResizer for panel resizing
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

import type { GitFileStatus } from "@/../../src/ipc/gitv2/types";
import { registerEditorHandlers } from "@/commands/handlers";
import { SandboxIndicator } from "@/components/panes/terminal/SandboxIndicator";
import { useFileSystemV2 } from "@/hooks/useFileSystemV2";
import { useGitV2 } from "@/hooks/useGitV2";
import { useSandboxHandlers } from "@/hooks/useSandboxHandlers";
import { tabsAtom } from "@/store/atoms";
import type { EditorPane as EditorPaneType } from "@/types";
import { cn } from "@/utils";
import { useAtomValue } from "jotai";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BranchSelector,
  EditorViewPanel,
  FileTreePanel,
  TreeResizer,
  type FileTreePanelHandle,
} from "./components";
import {
  useEditorTheme,
  useResponsiveLayout,
  useReviewModeState,
} from "./hooks";
import type { FileNode, TreeViewMode } from "./types";
import { detectLanguage } from "./utils/languageDetection";

/** Image extensions for auto-preview */
const IMAGE_EXTENSIONS = [
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".bmp",
  ".ico",
  ".svg",
];

/**
 * Check if a file is an image (should auto-open in preview mode).
 */
function isImageFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

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

/**
 * Callback payload when file changes (selection or content).
 */
export interface FileChangeData {
  /** File path */
  file: string;
  /** Full file path (alias for file) */
  filePath?: string;
  /** Detected language from file extension */
  language: string;
  /** File content (optional - not always loaded for performance) */
  content?: string;
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

  /**
   * Callback fired when hover state changes (mouseenter/mouseleave on root element).
   *
   * This is essential for design mode because EditorPaneV2 is rendered via React
   * portal in GlobalEditorContainer. Mouse events don't propagate across the portal
   * boundary in React's event system, so parent components can't detect hover via
   * their own event handlers. This callback bridges that gap.
   */
  onHover?: (isHovering: boolean) => void;
}

/** Default tree panel width in pixels */
const DEFAULT_TREE_WIDTH = 220;

/** Minimum tree panel width in pixels */
const MIN_TREE_WIDTH = 150;

/** Maximum tree panel width in pixels */
const MAX_TREE_WIDTH = 500;

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
  onFileOpen: _onFileOpen,
  onTreeModeChange,
  onSave,
  onHover,
}: EditorPaneV2Props) {
  const {
    cwd: initialCwd,
    file: initialFilePath,
    filePath,
    treeMode,
    sandboxId,
    agentSessionId,
    preview: initialPreview,
  } = pane as EditorPaneType & { filePath?: string };

  // Get editor theme from user settings
  const editorTheme = useEditorTheme();

  // Get current tab for sandbox handlers
  const tabs = useAtomValue(tabsAtom);
  const currentTab = useMemo(() => {
    for (const tab of tabs) {
      if (tab.panes[pane.id]) {
        return tab;
      }
    }
    return undefined;
  }, [tabs, pane.id]);

  // Use sandbox handlers from the shared hook
  const {
    handleCompleteAgentSession: handleCompleteAgentSessionBase,
    handleDeleteAgentSession: handleDeleteAgentSessionBase,
  } = useSandboxHandlers({
    tabId: currentTab?.id ?? "",
    paneId: pane.id,
  });

  // Wrap the base handlers to check for required values
  const handleCompleteAgentSession = useCallback(async () => {
    if (!agentSessionId || !currentTab) {
      return;
    }
    await handleCompleteAgentSessionBase(agentSessionId);
  }, [agentSessionId, currentTab, handleCompleteAgentSessionBase]);

  const handleDeleteAgentSession = useCallback(async () => {
    if (!agentSessionId || !currentTab) {
      return;
    }
    await handleDeleteAgentSessionBase(agentSessionId);
  }, [agentSessionId, currentTab, handleDeleteAgentSessionBase]);

  // Preference for showing diff vs regular editor for git-modified files
  // This is session-local state (like changesViewMode), not persisted
  const [preferDiffForModified, setPreferDiffForModified] = useState(true);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const treePanelRef = useRef<HTMLDivElement>(null);
  const fileTreeRef = useRef<FileTreePanelHandle>(null);

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
    const pathToUse = initialFilePath || filePath;
    if (pathToUse) {
      const name = pathToUse.split("/").pop() ?? "";
      return { path: pathToUse, name, type: "file" };
    }
    return null;
  });

  // Review mode state management
  const {
    viewMode,
    isReviewMode,
    enterReviewMode,
    exitReviewMode,
    setViewMode,
    setViewModePreservingReview,
    handleTreeViewModeTransition,
  } = useReviewModeState();

  // Changes view mode (flat or nested) for FileTreeChanges
  const [changesViewMode, setChangesViewMode] = useState<"flat" | "nested">(
    "flat",
  );

  // Base branch for comparison (null = compare against HEAD)
  const [baseBranch, setBaseBranch] = useState<string | null>(
    pane.agentBaseBranch ?? null,
  );

  // Panel view state (for single-column layout mode)
  const [panelView, setPanelView] = useState<"tree" | "editor">("tree");

  // ---------------------------------------------------------------------------
  // Prop → State Sync
  // ---------------------------------------------------------------------------

  // Sync pane.cwd prop to currentCwd state when it changes externally.
  // This handles the case where the pane config is updated (e.g., registry update)
  // while the component is still mounted. Without this, subscriptions would
  // remain for the old cwd.
  useEffect(() => {
    if (initialCwd !== currentCwd) {
      setCurrentCwd(initialCwd);
    }
    // Note: We intentionally exclude currentCwd from deps - we only want to sync
    // when the PROP changes, not when internal navigation changes currentCwd
  }, [initialCwd]);

  // ---------------------------------------------------------------------------
  // Hooks
  // ---------------------------------------------------------------------------

  // Responsive layout detection
  const layout = useResponsiveLayout(containerRef);

  // Git API for checking file status
  const git = useGitV2(currentCwd, sandboxId);

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

  // Branch selector state
  const [isBranchSelectorOpen, setIsBranchSelectorOpen] = useState(false);

  // Helper to update git status state
  const updateGitStatusState = useCallback(
    (status: { files: Map<string, GitFileStatus>; branch?: string } | null) => {
      if (!status?.files) {
        setGitStatus(null);
        setGitChangedFiles(new Set());
        setStagedCount(0);
        return;
      }

      // Store full status map for GitBranchToolbar
      setGitStatus(status.files);
      setGitChangedFiles(new Set(status.files.keys()));

      // Update current branch from status (if available)
      // This is more reliable than a separate async call since it comes with the status
      if (status.branch) {
        setCurrentBranch(status.branch);
      }

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
        // Also update upstream status from the fresh status
        if (event.status) {
          setHasUpstream(!!event.status.upstream);
        }
      }
    });

    // Subscribe to branch changes
    const branchCleanup = git.onBranchChanged(async (event) => {
      if (!cancelled) {
        setCurrentBranch(event.currentBranch);

        // Re-check upstream status when branch changes
        // (different branches may have different upstream configurations)
        try {
          const upstream = await git.hasUpstream();
          if (!cancelled) {
            setHasUpstream(upstream);
          }
        } catch {
          // Ignore errors - keep previous upstream state
        }
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

  // Recompute git status when baseBranch changes
  // When baseBranch is set, fetch status relative to that branch
  // When baseBranch is null, use normal HEAD status
  useEffect(() => {
    let cancelled = false;

    const updateStatusForBranch = async () => {
      try {
        await git.whenReady();
        if (cancelled) return;

        if (baseBranch) {
          // Branch comparison mode: get status relative to base branch
          // This returns proper status (added, modified, deleted, renamed)
          const branchStatus = await git.getStatusFromBranch(baseBranch);
          if (!cancelled) {
            setGitStatus(branchStatus);
            setGitChangedFiles(new Set(branchStatus.keys()));
            // In branch comparison mode, staging is not applicable
            setStagedCount(0);
          }
        } else {
          // HEAD mode: refresh normal status
          const status = await git.getStatus();
          if (!cancelled) {
            updateGitStatusState(status);
          }
        }
      } catch (error) {
        console.error(
          "[EditorPaneV2] Failed to update status for branch:",
          error,
        );
      }
    };

    updateStatusForBranch();

    return () => {
      cancelled = true;
    };
  }, [git, baseBranch, updateGitStatusState]);

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
    if (selectedFile || initialFilePath || filePath) {
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

        // Check if file is specifically "modified" in git status and user prefers diff view
        // Only "modified" files get diff view option, not "added" files
        // Note: git status uses relative paths, so use relativePath not fullPath
        const status = await git.getStatus();
        const fileStatus = status?.files.get(relativePath);
        if (fileStatus?.status === "modified" && preferDiffForModified) {
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
  }, [
    selectedFile,
    initialFilePath,
    currentCwd,
    git,
    baseBranch,
    preferDiffForModified,
  ]);

  // Generate stable editor ID from pane ID
  const editorId = useMemo(() => `editor-${pane.id}`, [pane.id]);

  // FileSystem API for reading file content (for callbacks)
  const fs = useFileSystemV2(currentCwd, sandboxId);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle file selection from tree.
   */
  const handleFileSelect = useCallback(
    async (file: FileNode) => {
      // Compute relative path and git status for this file
      const relativePath = file.path.startsWith(currentCwd)
        ? file.path.slice(currentCwd.length).replace(/^\//, "")
        : file.path;
      const fileStatus = gitStatus?.get(relativePath);

      // Use startTransition to make the file selection render non-blocking.
      // This allows IPC responses to be processed during the render, significantly
      // reducing perceived latency when loading file content.
      startTransition(() => {
        setSelectedFile(file);

        // In single layout, switch to editor view when file is selected
        if (layout === "single") {
          setPanelView("editor");
        }

        // Update view mode, but preserve review mode if active
        // (review mode handles file selection by scrolling to the file)
        setViewModePreservingReview(() => {
          // Image files should default to preview mode
          if (isImageFile(file.name)) {
            return { type: "preview" };
          }
          // Only "modified" files get diff view option, not "added" files
          if (fileStatus?.status === "modified" && preferDiffForModified) {
            return {
              type: "diff",
              filePath: file.path,
              baseBranch: baseBranch ?? undefined,
            };
          }
          return { type: "editor" };
        });
      });

      // Note: onFileOpen is NOT called here - it's for external "open in quick pane" action
      // File selection within the editor just updates selectedFile state

      // Notify parent of file selection (skip for deleted files - they don't exist on disk)
      // Note: We no longer read file content here - Monaco model registry handles that.
      // This eliminates a duplicate file read that was causing ~300ms latency.
      if (
        onFileChange &&
        file.type === "file" &&
        fileStatus?.status !== "deleted"
      ) {
        onFileChange({
          file: file.path,
          language: detectLanguage(file.path),
        });
      }
    },
    [
      layout,
      onFileChange,
      gitStatus,
      baseBranch,
      currentCwd,
      preferDiffForModified,
      setViewModePreservingReview,
    ],
  );

  /**
   * Handle tree view mode change (files/changes).
   * Delegates to useReviewModeState for review mode transitions.
   */
  const handleTreeViewModeChange = useCallback(
    (mode: TreeViewMode) => {
      setTreeViewMode(mode);

      // Persist to localStorage
      localStorage.setItem("editor-v2:treeViewMode", mode);

      // Notify parent - map internal mode to external format
      onTreeModeChange?.(mode === "changes" ? "changes" : "all");

      // Handle review mode transitions (exit/restore)
      handleTreeViewModeTransition(mode);
    },
    [onTreeModeChange, handleTreeViewModeTransition],
  );

  /**
   * Handle tree width resize.
   */
  const handleTreeResize = useCallback((width: number) => {
    setTreeWidth(width);

    // Persist to localStorage
    localStorage.setItem("editor-v2:treeWidth", width.toString());
  }, []);

  /**
   * Handle base branch change for comparison mode.
   * Called when a branch is selected from the BranchSelector dialog.
   */
  const handleBranchSelect = useCallback((branch: string | null) => {
    setBaseBranch(branch);
    setIsBranchSelectorOpen(false);
  }, []);

  /**
   * Open the branch selector dialog.
   */
  const handleOpenBranchPicker = useCallback(() => {
    setIsBranchSelectorOpen(true);
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
      await git.pull();
    } catch (error) {
      console.error("[EditorPaneV2] Pull failed:", error);
    } finally {
      setIsPulling(false);
    }
  }, [git, isPulling, isPushing, isCommitting]);

  /**
   * Handle push action (or publish if no upstream).
   */
  const handlePush = useCallback(async () => {
    if (isPulling || isPushing || isCommitting) return;

    setIsPushing(true);
    try {
      // If no upstream exists, push with --set-upstream to create/track remote branch
      const isPublishing = !hasUpstream;
      await git.push(false, isPublishing);

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
  }, [git, hasUpstream, isPulling, isPushing, isCommitting]);

  /**
   * Handle branch switch callback.
   *
   * The actual state updates (currentBranch, hasUpstream) happen through
   * the onBranchChanged event subscription. This callback is for any
   * additional actions needed when the user explicitly switches branches.
   */
  const handleBranchSwitch = useCallback(
    (newBranch: string) => {
      // Clear comparison mode when switching branches
      // (comparison to old base branch doesn't make sense on new branch)
      if (baseBranch !== null) {
        setBaseBranch(null);
      }
      console.log(`[EditorPaneV2] Branch switched to: ${newBranch}`);
    },
    [baseBranch],
  );

  /**
   * Whether navigation up is possible.
   */
  const canNavigateUp = !isAtFilesystemRoot(currentCwd);

  /**
   * Toggle tree panel collapsed state.
   * Only effective in split layout mode.
   */
  const handleToggleTree = useCallback(() => {
    setIsTreeCollapsed((prev) => !prev);
  }, []);

  /**
   * Handle toggling between diff and edit modes for git-modified files.
   * Updates both the current view mode AND the session preference.
   */
  const handleToggleDiffMode = useCallback(
    (isDiff: boolean) => {
      // Update the view mode for the current file
      if (isDiff && selectedFile) {
        setViewMode({
          type: "diff",
          filePath: selectedFile.path,
          baseBranch: baseBranch ?? undefined,
        });
      } else {
        setViewMode({ type: "editor" });
      }

      // Update the preference for future file selections (session-local)
      setPreferDiffForModified(isDiff);
    },
    [selectedFile, baseBranch],
  );

  /**
   * Handle entering changes review mode.
   * Switches the view mode to show all changes with inline diffs.
   */
  const handleReviewChanges = useCallback(() => {
    enterReviewMode(baseBranch ?? undefined);
  }, [baseBranch, enterReviewMode]);

  /**
   * Determine if the current file is git-modified (eligible for diff toggle).
   */
  const isCurrentFileGitModified = useMemo(() => {
    if (!selectedFile) return false;

    const relativePath = selectedFile.path.startsWith(currentCwd)
      ? selectedFile.path.slice(currentCwd.length).replace(/^\//, "")
      : selectedFile.path;

    const fileStatus = gitStatus?.get(relativePath);
    return fileStatus?.status === "modified";
  }, [selectedFile, currentCwd, gitStatus]);

  /**
   * Determine if the current file is deleted (needs special viewer).
   */
  const isCurrentFileDeleted = useMemo(() => {
    if (!selectedFile) return false;

    const relativePath = selectedFile.path.startsWith(currentCwd)
      ? selectedFile.path.slice(currentCwd.length).replace(/^\//, "")
      : selectedFile.path;

    const fileStatus = gitStatus?.get(relativePath);
    return fileStatus?.status === "deleted";
  }, [selectedFile, currentCwd, gitStatus]);

  /**
   * Determine if the current file supports preview mode (e.g., markdown files, images).
   */
  const isPreviewSupported = useMemo(() => {
    if (!selectedFile) return false;
    const fileName = selectedFile.name.toLowerCase();
    // Markdown files
    if (fileName.endsWith(".md") || fileName.endsWith(".markdown")) {
      return true;
    }
    // Image files (binary and SVG)
    return isImageFile(fileName);
  }, [selectedFile]);

  /**
   * Preview content for markdown files.
   * Loaded when preview mode is active.
   */
  const [previewContent, setPreviewContent] = useState<string>("");

  /**
   * Load preview content when preview mode is enabled or file changes.
   */
  useEffect(() => {
    if (viewMode.type !== "preview" || !selectedFile || !isPreviewSupported) {
      return;
    }

    let cancelled = false;

    const loadContent = async () => {
      try {
        const content = await fs.readTextFile(selectedFile.path);
        if (!cancelled) {
          setPreviewContent(content);
        }
      } catch (error) {
        console.error("[EditorPaneV2] Failed to load preview content:", error);
        if (!cancelled) {
          setPreviewContent("");
        }
      }
    };

    loadContent();

    return () => {
      cancelled = true;
    };
  }, [viewMode.type, selectedFile, isPreviewSupported, fs]);

  /**
   * Initialize preview mode from pane config if specified.
   */
  useEffect(() => {
    if (initialPreview && isPreviewSupported) {
      setViewMode({ type: "preview" });
    }
  }, [initialPreview, isPreviewSupported, setViewMode]);

  /**
   * Reset view mode to editor when switching to a file that doesn't support
   * the current mode (e.g., was in diff mode but new file has no diff,
   * or was in preview mode but new file doesn't support preview).
   */
  useEffect(() => {
    if (!selectedFile) return;

    // Reset preview mode if new file doesn't support preview
    if (viewMode.type === "preview" && !isPreviewSupported) {
      setViewMode({ type: "editor" });
    }

    // Reset diff mode if new file isn't git-modified
    if (viewMode.type === "diff" && !isCurrentFileGitModified) {
      setViewMode({ type: "editor" });
    }
  }, [
    selectedFile?.path,
    viewMode.type,
    isPreviewSupported,
    isCurrentFileGitModified,
    setViewMode,
  ]);

  /**
   * Handle toggling between preview and editor modes.
   */
  const handleTogglePreviewMode = useCallback(
    (isPreview: boolean) => {
      if (isPreview) {
        setViewMode({ type: "preview" });
      } else {
        setViewMode({ type: "editor" });
      }
    },
    [setViewMode],
  );

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

  /**
   * Reveal and focus the currently selected file in the file tree.
   * Expands parent directories if needed and focuses the file item.
   */
  const handleRevealActiveFile = useCallback(() => {
    // Ensure tree is visible first
    if (isTreeCollapsed) {
      setIsTreeCollapsed(false);
    }

    // Call the imperative method on the file tree
    requestAnimationFrame(() => {
      fileTreeRef.current?.revealActiveFile();
    });
  }, [isTreeCollapsed]);

  // ---------------------------------------------------------------------------
  // Command Registration
  // ---------------------------------------------------------------------------

  /**
   * Register editor command handlers with the command system.
   * This allows keyboard shortcuts (Cmd+B, Cmd+Shift+T) to control this pane.
   */
  useEffect(() => {
    const cleanup = registerEditorHandlers(pane.id, {
      toggleSidebar: handleToggleTree,
      focusSidebar: handleFocusTree,
      revealActiveFile: handleRevealActiveFile,
    });

    return cleanup;
  }, [pane.id, handleToggleTree, handleFocusTree, handleRevealActiveFile]);

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
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
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
          ref={fileTreeRef}
          paneId={pane.id}
          cwd={currentCwd}
          fs={fs}
          git={git}
          selectedFile={selectedFile}
          onFileSelect={handleFileSelect}
          treeViewMode={treeViewMode}
          onTreeViewModeChange={handleTreeViewModeChange}
          // Git Branch Props
          currentBranch={currentBranch}
          baseBranch={baseBranch}
          isComparingToBranch={baseBranch !== null}
          gitStatus={gitStatus}
          changedFilesCount={gitChangedFiles.size}
          onOpenBranchPicker={handleOpenBranchPicker}
          onBranchSwitch={handleBranchSwitch}
          // Git Operations Props
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
          onDirectoryChange={handleDirectoryChange}
          // Changes View Mode Props
          changesViewMode={changesViewMode}
          onChangesViewModeChange={setChangesViewMode}
          // Review Mode Props
          isReviewModeActive={isReviewMode}
          onReviewChanges={handleReviewChanges}
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
          sandboxId={sandboxId}
          git={git}
          selectedFile={selectedFile}
          viewMode={viewMode}
          baseBranch={baseBranch ?? undefined}
          theme={editorTheme}
          onSave={onSave}
          showBackButton={layout === "single"}
          onBack={() => setPanelView("tree")}
          showExpandTreeButton={layout === "split" && isTreeCollapsed}
          onExpandTree={() => setIsTreeCollapsed(false)}
          showDiffToggle={isCurrentFileGitModified}
          isDiffMode={viewMode.type === "diff"}
          onToggleDiffMode={handleToggleDiffMode}
          onExitReview={exitReviewMode}
          isFileDeleted={isCurrentFileDeleted}
          // Preview mode props
          showPreviewToggle={isPreviewSupported}
          isPreviewMode={viewMode.type === "preview"}
          onTogglePreviewMode={handleTogglePreviewMode}
          previewContent={previewContent}
          // Remote operations
          hasUpstream={hasUpstream}
          isPulling={isPulling}
          isPushing={isPushing}
          onPull={handlePull}
          onPush={handlePush}
        />
      </div>

      {/* Branch Selector Dialog */}
      <BranchSelector
        git={git}
        open={isBranchSelectorOpen}
        currentBaseBranch={baseBranch}
        onSelectBranch={handleBranchSelect}
        onOpenChange={setIsBranchSelectorOpen}
      />

      {/* Cloud VM / Agent Session Indicator */}
      <SandboxIndicator
        sandboxId={sandboxId ?? null}
        agentSessionId={agentSessionId ?? null}
        onCompleteAgentSession={handleCompleteAgentSession}
        onDeleteAgentSession={handleDeleteAgentSession}
      />
    </div>
  );
}
