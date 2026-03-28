/**
 * EditorPaneV2 - Main orchestrator for the Editor v2 system.
 *
 * This component ties together all the editor subsystems:
 * - FileTreePanel for file navigation
 * - EditorPane for file editing
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

import type { GitFileStatus } from "@/api/GitV2API";
import { registerEditorHandlers } from "@/commands/handlers";
import { SandboxIndicator } from "@/components/panes/terminal/shell/sandbox/SandboxIndicator";
import { useFileSystemV2 } from "@/hooks/useFileSystemV2";
import { useGitV2 } from "@/hooks/useGitV2";
import { useSandboxHandlers } from "@/hooks/useSandboxHandlers";
import { enqueueNotification } from "@/store/actions/notifications";
import { tabsAtom, userSettingsAtom } from "@/store/atoms";
import type { EditorPane as EditorPaneType } from "@/types";
import { cn } from "@/utils";
import type { ChangesViewMode } from "@shared/types";
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
  EditorPane,
  FileDiffStatsProvider,
  FileTreePanel,
  TreeResizer,
  type FileTreePanelHandle,
} from "./components";
import type {
  CommitFileSelectEvent,
  CommitViewEvent,
} from "./components/CommitGraph/types";
import {
  useAutoOpenFile,
  useEditorTheme,
  useModelState,
  useResponsiveLayout,
  useReviewModeState,
  useUnseenTracking,
} from "./hooks";
import { MonacoModelRegistry, createModelKey } from "./registry";
import type { FileNode, TreeViewMode, ViewMode } from "./types";
import {
  computeStagedForChangesMode,
  detectLanguage,
  getFileEntryPresence,
  getFileStatusForEntry,
  getFriendlyGitError,
  getRelativePath,
  isDiffableStatus,
  isUnstagedMapKey,
  // MapKey helpers (centralized operations)
  makeMapKey,
  mapKeyToPath,
  selectNextAvailableFile,
} from "./utils";

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
   * Callback fired when changes view mode changes.
   */
  onChangesViewModeChange?: (mode: ChangesViewMode) => void;

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

  /**
   * Hide the file tree and only show the editor.
   * Used for focused editing scenarios like commit messages.
   * @default false
   */
  hideFileTree?: boolean;

  /**
   * Callback fired when the close button is clicked.
   * If provided, shows a close button in the editor toolbar.
   * The meaning of "close" depends on the context:
   * - Tab editor: closes the pane
   * - Quick modal: closes the modal
   * - Sidebar: closes the sidebar
   */
  onClose?: () => void;
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
  onChangesViewModeChange,
  onSave,
  onHover,
  hideFileTree = false,
  onClose,
}: EditorPaneV2Props) {
  const {
    cwd: initialCwd,
    file: initialFilePath,
    filePath,
    treeMode,
    changesViewMode: paneChangesViewMode,
    sandboxId,
    agentSessionId,
    preview: initialPreview,
  } = pane as EditorPaneType & { filePath?: string };

  // Get editor theme from user settings
  const editorTheme = useEditorTheme();

  // Get current tab for sandbox handlers
  const tabs = useAtomValue(tabsAtom);

  // Get user settings for unseen tracking preference
  const userSettings = useAtomValue(userSettingsAtom);
  const trackUnseenChanges =
    userSettings.trackUnseenChangesInReviewMode ?? true;
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

  /**
   * Selected map key for "changes" mode.
   *
   * In changes mode, the same file can appear twice (staged and unstaged).
   * This key identifies which entry is selected:
   * - "path/to/file.ts" for staged entry
   * - "path/to/file.ts\0unstaged" for unstaged entry
   * - null when no file is selected or in "files" mode
   *
   * This is separate from selectedFile because:
   * 1. selectedFile tracks the file identity (path, name)
   * 2. selectedMapKey tracks which entry of that file is selected
   */
  const [selectedMapKey, setSelectedMapKey] = useState<string | null>(null);

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
  const [changesViewMode, setChangesViewModeInternal] =
    useState<ChangesViewMode>(paneChangesViewMode ?? "nested");

  // Sync changesViewMode when pane config changes
  useEffect(() => {
    if (paneChangesViewMode !== undefined) {
      setChangesViewModeInternal(paneChangesViewMode);
    }
  }, [paneChangesViewMode]);

  // Wrapper to call both internal state setter and external callback
  const setChangesViewMode = useCallback(
    (mode: ChangesViewMode) => {
      setChangesViewModeInternal(mode);
      onChangesViewModeChange?.(mode);
    },
    [onChangesViewModeChange],
  );

  // Base branch for comparison (null = compare against HEAD)
  const [baseBranch, setBaseBranch] = useState<string | null>(
    pane.agentBaseBranch ?? null,
  );

  // Previous view mode (for returning from commit diff view)
  const previousViewModeRef = useRef<ViewMode | null>(null);

  // Panel view state (for single-column layout mode)
  const [panelView, setPanelView] = useState<"tree" | "editor">("tree");

  // ---------------------------------------------------------------------------
  // Responsive Layout Detection (must be before effects that use it)
  // ---------------------------------------------------------------------------

  // Responsive layout detection
  const layout = useResponsiveLayout(containerRef);

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

  // Sync pane.file prop to selectedFile state when it changes externally.
  // This handles cases like EditorSidebar restoring a different file when CWD changes,
  // or when files are opened programmatically (Quick Open, navigation, etc.).
  const prevInitialFilePathRef = useRef(initialFilePath);
  useEffect(() => {
    // Only sync when the prop actually changed (not on every render)
    if (prevInitialFilePathRef.current === initialFilePath) return;
    prevInitialFilePathRef.current = initialFilePath;

    if (initialFilePath) {
      const name = initialFilePath.split("/").pop() ?? "";
      setSelectedFile({ path: initialFilePath, name, type: "file" });

      // In single layout, switch to editor view when file is opened programmatically
      // (same behavior as clicking a file in the tree)
      if (layout === "single") {
        setPanelView("editor");
      }
    } else {
      setSelectedFile(null);
    }
    // Note: We intentionally exclude selectedFile from deps - we only want to sync
    // when the PROP changes, not when internal file selection changes selectedFile
  }, [initialFilePath, layout]);

  // ---------------------------------------------------------------------------
  // Hooks
  // ---------------------------------------------------------------------------

  // Git API for checking file status
  const git = useGitV2(currentCwd, sandboxId);

  // Monitor selected file's model state for orphan detection
  const selectedFileModelState = useModelState(
    selectedFile?.path ?? null,
    sandboxId,
  );

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

  // Unseen file change tracking (consolidated hook)
  // Handles state, subscriptions, and read triggers
  const currentlyOpenFile = selectedFile
    ? getRelativePath(selectedFile.path, currentCwd)
    : null;

  const unseenTracking = useUnseenTracking({
    git,
    cwd: currentCwd,
    sandboxId,
    enabled: trackUnseenChanges && gitStatus !== null,
    currentlyOpenFile,
    gitChangedFiles,
  });

  // Destructure triggerRead for convenience
  const { triggerRead } = unseenTracking;

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

  /**
   * The git status for the currently selected entry (from selectedMapKey).
   * This is the single source of truth for the selected entry's git state.
   * Returns null if no entry is selected or it doesn't exist in gitStatus.
   */
  const selectedGitStatus = useMemo(() => {
    if (!selectedMapKey) return null;
    return gitStatus?.get(selectedMapKey) ?? null;
  }, [selectedMapKey, gitStatus]);

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
        } else {
          // Not a git repo (anymore) - auto-switch from changes to files view
          // to avoid leaving the user stuck (GitBranchToolbar hides when no git)
          setTreeViewMode((current) =>
            current === "changes" ? "files" : current,
          );
          setSelectedMapKey(null);
        }
        // Note: Unseen tracking is handled by useUnseenTracking hook
        // Note: Per-file diff stats are handled by FileDiffStatsProvider
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
          } else {
            // Not a git repo - auto-switch from changes to files view
            // to avoid leaving the user stuck (GitBranchToolbar hides when no git)
            setTreeViewMode((current) =>
              current === "changes" ? "files" : current,
            );
            setSelectedMapKey(null);
          }
        }
        // Note: Per-file diff stats are handled by FileDiffStatsProvider

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
  // Note: Filesystem change subscription for unseen tracking is handled by useUnseenTracking

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

  // Generate stable editor ID from pane ID
  const editorId = useMemo(() => `editor-${pane.id}`, [pane.id]);

  // FileSystem API for reading file content (for callbacks)
  const fs = useFileSystemV2(currentCwd, sandboxId);

  // Auto-open file on mount (validates initial file, falls back to most recently modified)
  useAutoOpenFile({
    initialFilePath,
    selectedFile,
    setSelectedFile,
    cwd: currentCwd,
    fs,
    git,
    baseBranch,
    preferDiffForModified,
    setViewMode,
    triggerRead: trackUnseenChanges ? triggerRead : undefined,
  });

  // ---------------------------------------------------------------------------
  // External File Rename Handling
  // ---------------------------------------------------------------------------

  // Subscribe to file rename events from the v2 file system API.
  // When a file is renamed externally (terminal, Finder, other editor),
  // update selectedFile if it matches the renamed file.
  useEffect(() => {
    if (!fs?.onAnyFileRenamed) {
      return;
    }

    const cleanup = fs.onAnyFileRenamed((oldPath, newPath) => {
      // Check if the renamed file is the currently open file
      // Use case-insensitive comparison for macOS which has a case-insensitive file system
      if (
        selectedFile &&
        selectedFile.path.toLowerCase() === oldPath.toLowerCase()
      ) {
        const newName = newPath.split("/").pop() ?? "";
        setSelectedFile({
          ...selectedFile,
          path: newPath,
          name: newName,
        });
      }
    });

    return cleanup;
  }, [fs, selectedFile]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle file selection from tree.
   *
   * @param file - The file node being selected
   * @param mapKey - The map key for this entry (used in changes mode to distinguish
   *                 staged vs unstaged entries of the same file). Pass null for
   *                 normal "files" mode selections.
   */
  const handleFileSelect = useCallback(
    async (file: FileNode, mapKey: string | null) => {
      // Look up the actual staged status from gitStatus using the mapKey
      // (can't derive from mapKey suffix alone - that only works for partially staged files)
      const fileStatusFromMap = mapKey ? gitStatus?.get(mapKey) : undefined;
      const isStaged = fileStatusFromMap?.staged;
      const relativePath = getRelativePath(file.path, currentCwd);
      const fileStatus = getFileStatusForEntry(
        gitStatus,
        relativePath,
        isStaged === false ? false : undefined,
      );

      // Use startTransition to make the file selection render non-blocking.
      // This allows IPC responses to be processed during the render, significantly
      // reducing perceived latency when loading file content.
      startTransition(() => {
        setSelectedFile(file);
        setSelectedMapKey(mapKey);

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
          // Diffable files (modified/renamed) get diff view if preferred
          if (isDiffableStatus(fileStatus) && preferDiffForModified) {
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

      // Mark file as seen (if unseen tracking is enabled)
      if (trackUnseenChanges) {
        triggerRead("file:select", relativePath);
      }

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
      triggerRead,
      trackUnseenChanges,
    ],
  );

  /**
   * Handle file or folder rename.
   *
   * Updates selectedFile if the renamed path matches the currently open file,
   * and also updates unseen tracking if enabled.
   */
  const handlePathRename = useCallback(
    (oldPath: string, newPath: string) => {
      // Update unseen tracking if enabled
      if (trackUnseenChanges) {
        unseenTracking.handlePathRename(oldPath, newPath);
      }

      // The callback receives relative paths, but selectedFile.path is absolute
      // Convert relative paths to absolute for comparison
      const oldAbsolute = oldPath.startsWith("/")
        ? oldPath
        : `${currentCwd}/${oldPath}`;
      const newAbsolute = newPath.startsWith("/")
        ? newPath
        : `${currentCwd}/${newPath}`;

      // Update selectedFile if the renamed file is currently open
      if (selectedFile && selectedFile.path === oldAbsolute) {
        const newName = newAbsolute.split("/").pop() ?? "";
        setSelectedFile({
          ...selectedFile,
          path: newAbsolute,
          name: newName,
        });
      }
    },
    [selectedFile, trackUnseenChanges, unseenTracking, currentCwd],
  );

  /**
   * Exit any commit mode (diff or review) and return to previous view.
   */
  const handleExitCommitMode = useCallback(() => {
    // Return to previous view mode (or editor mode as fallback)
    if (previousViewModeRef.current) {
      setViewMode(previousViewModeRef.current);
      previousViewModeRef.current = null;
    } else {
      setViewMode({ type: "editor" });
    }
  }, [setViewMode]);

  /**
   * Handle tree view mode changes.
   *
   * When switching modes, we update selectedMapKey appropriately:
   * - Entering "changes" mode: compute map key based on git status (prefer unstaged)
   * - Exiting to "files" mode: clear the map key
   *
   * Also exits commit review modes when switching away from "changes".
   */
  const handleTreeViewModeChange = useCallback(
    (mode: TreeViewMode) => {
      setTreeViewMode(mode);

      // Update selectedMapKey for the new mode
      if (selectedFile) {
        if (mode === "changes") {
          // Compute which entry to select (prefer unstaged if it exists)
          const relativePath = getRelativePath(selectedFile.path, currentCwd);
          const preferStaged = computeStagedForChangesMode(
            gitStatus,
            relativePath,
          );
          if (preferStaged === true) {
            setSelectedMapKey(makeMapKey(relativePath, true));
          } else if (preferStaged === false) {
            setSelectedMapKey(makeMapKey(relativePath, false));
          } else {
            // File not in changes - clear selection
            setSelectedMapKey(null);
          }
        } else {
          // Exiting changes mode - clear map key
          setSelectedMapKey(null);
        }
      }

      // Persist to localStorage
      localStorage.setItem("editor:treeViewMode", mode);

      // Notify parent - map internal mode to external format
      onTreeModeChange?.(mode === "changes" ? "changes" : "all");

      // Handle review mode transitions (exit/restore)
      handleTreeViewModeTransition(mode);

      // Also exit commit modes when switching to "files" mode
      if (mode === "files") {
        if (
          viewMode.type === "commitReview" ||
          viewMode.type === "commitFileDiff"
        ) {
          handleExitCommitMode();
        }
      }
    },
    [
      selectedFile,
      currentCwd,
      gitStatus,
      onTreeModeChange,
      handleTreeViewModeTransition,
      viewMode,
      handleExitCommitMode,
    ],
  );

  /**
   * Effect: Sync selectedMapKey when git status changes.
   *
   * When a file is staged/unstaged via git operations, the selected entry
   * may no longer exist. This effect switches to the other entry if needed:
   * - After staging all: if unstaged entry disappears, switch to staged
   * - After unstaging all: if staged entry disappears, switch to unstaged
   * - After reverting untracked/added: if file is completely gone, select next file
   *
   * This does NOT override user selection - it only syncs when the selected
   * entry no longer exists in git status.
   */
  useEffect(() => {
    if (treeViewMode !== "changes" || !selectedMapKey) return;

    // Check if the selected entry still exists (using memoized lookup)
    if (selectedGitStatus !== null) return; // Selected entry still exists, nothing to do

    // Selected entry is gone - try to switch to the other entry
    const relativePath = mapKeyToPath(selectedMapKey);
    const { hasStagedEntry, hasUnstagedEntry } = getFileEntryPresence(
      gitStatus,
      relativePath,
    );

    if (isUnstagedMapKey(selectedMapKey)) {
      // Was viewing unstaged, but it's gone - switch to staged if available
      if (hasStagedEntry) {
        setSelectedMapKey(makeMapKey(relativePath, true));
        return;
      }
    } else {
      // Was viewing staged, but it's gone - switch to unstaged if available
      if (hasUnstagedEntry) {
        setSelectedMapKey(makeMapKey(relativePath, false));
        return;
      }
    }

    // File is completely gone (e.g., reverted untracked/added file was deleted)
    // Select the next most recent dirty file
    if (!hasStagedEntry && !hasUnstagedEntry) {
      let cancelled = false;

      // In changes mode, only look for dirty files (no committed fallback)
      selectNextAvailableFile(git, currentCwd, {
        fallbackToCommitted: false,
      }).then(({ file, relativePath }) => {
        if (cancelled) return;

        if (file && relativePath) {
          setSelectedFile(file);
          // Compute proper mapKey - prefer unstaged entry if it exists
          const preferStaged = computeStagedForChangesMode(
            gitStatus,
            relativePath,
          );
          setSelectedMapKey(
            preferStaged !== undefined
              ? makeMapKey(relativePath, preferStaged)
              : relativePath,
          );
          // Mark the auto-selected file as seen
          triggerRead("file:select", relativePath);
        } else {
          // No dirty files left - clear selection
          setSelectedFile(null);
          setSelectedMapKey(null);
        }
      });

      // Cleanup: cancel if effect re-runs before promise resolves
      return () => {
        cancelled = true;
      };
    }
  }, [
    gitStatus,
    selectedMapKey,
    selectedGitStatus,
    treeViewMode,
    git,
    currentCwd,
    triggerRead,
  ]);

  /**
   * Handle file deletion (orphaned files) in files mode.
   *
   * When a file is deleted externally (not via git revert), the model becomes
   * orphaned. In this case, select the most recent dirty file to avoid leaving
   * the user viewing a deleted file with the "file deleted externally" warning.
   *
   * This effect ONLY runs in "files" mode. In "changes" mode, the git status
   * sync effect handles file selection when files are reverted.
   */
  useEffect(() => {
    // Only handle in files mode - changes mode has its own effect
    if (treeViewMode !== "files") return;
    if (!selectedFile) return;
    if (!selectedFileModelState?.isOrphaned) return;

    // File is orphaned - select next file
    let cancelled = false;

    selectNextAvailableFile(git, currentCwd, {
      fallbackToCommitted: true,
    }).then(({ file, relativePath }) => {
      if (cancelled) return;
      setSelectedFile(file);
      // Mark the auto-selected file as seen
      if (relativePath) {
        triggerRead("file:select", relativePath);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    treeViewMode,
    selectedFile,
    selectedFileModelState?.isOrphaned,
    currentCwd,
    git,
    triggerRead,
  ]);

  /**
   * Handle tree width resize.
   */
  const handleTreeResize = useCallback((width: number) => {
    setTreeWidth(width);

    // Persist to localStorage
    localStorage.setItem("editor:treeWidth", width.toString());
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
      const friendlyError = getFriendlyGitError(error);
      console.error("[EditorPaneV2] Commit failed:", friendlyError.rawMessage);
      enqueueNotification({
        kind: "error",
        message: friendlyError.message,
        details: friendlyError.details,
      });
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
      const friendlyError = getFriendlyGitError(error);
      console.error("[EditorPaneV2] Pull failed:", friendlyError.rawMessage);
      enqueueNotification({
        kind: "error",
        message: friendlyError.message,
        details: friendlyError.details,
      });
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
      const friendlyError = getFriendlyGitError(error);
      console.error(
        `[EditorPaneV2] ${hasUpstream ? "Push" : "Publish"} failed:`,
        friendlyError.rawMessage,
      );
      enqueueNotification({
        kind: "error",
        message: friendlyError.message,
        details: friendlyError.details,
      });
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
    (_newBranch: string) => {
      // Clear comparison mode when switching branches
      // (comparison to old base branch doesn't make sense on new branch)
      if (baseBranch !== null) {
        setBaseBranch(null);
      }
    },
    [baseBranch],
  );

  /**
   * Whether navigation up is possible.
   */
  const canNavigateUp = !isAtFilesystemRoot(currentCwd);

  /**
   * Check if a file has unsaved changes in the editor.
   * Used to prevent staging files with unsaved changes.
   */
  const isFileDirty = useCallback(
    (filePath: string): boolean => {
      const registry = MonacoModelRegistry.getInstance();
      const modelKey = createModelKey(filePath, sandboxId);
      const state = registry.getModelState(modelKey);
      return state?.isDirty ?? false;
    },
    [sandboxId],
  );

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
   * Handle file selection from commit graph.
   * Opens the historical diff view for the selected file.
   */
  const handleCommitFileSelect = useCallback(
    (event: CommitFileSelectEvent) => {
      // Only save previous view mode if not already in a commit mode
      // This prevents building a stack when clicking multiple files
      if (
        viewMode.type !== "commitFileDiff" &&
        viewMode.type !== "commitReview"
      ) {
        previousViewModeRef.current = viewMode;
      }

      // Convert relative path to absolute path
      const absolutePath = currentCwd.endsWith("/")
        ? `${currentCwd}${event.file.path}`
        : `${currentCwd}/${event.file.path}`;

      // Set view mode to commit file diff
      setViewMode({
        type: "commitFileDiff",
        filePath: absolutePath,
        commitId: event.commitId,
        parentCommitId: event.parentCommitId,
        fileStatus: event.file.status,
        originalPath: event.file.originalPath,
      });

      // In single layout, switch to editor view
      if (layout === "single") {
        setPanelView("editor");
      }
    },
    [viewMode, currentCwd, layout, setViewMode],
  );

  /**
   * Handle "view all" on a commit from commit graph.
   * Opens the commit review pane showing all files changed in that commit.
   */
  const handleViewCommit = useCallback(
    (event: CommitViewEvent) => {
      // Only save previous view mode if not already in a commit mode
      // This prevents building a stack when switching between commit views
      if (
        viewMode.type !== "commitFileDiff" &&
        viewMode.type !== "commitReview"
      ) {
        previousViewModeRef.current = viewMode;
      }

      // Set view mode to commit review
      setViewMode({
        type: "commitReview",
        commitId: event.commitId,
        parentCommitId: event.parentCommitId,
      });

      // In single layout, switch to editor view
      if (layout === "single") {
        setPanelView("editor");
      }
    },
    [viewMode, layout, setViewMode],
  );

  /**
   * Determine if the current file can show a diff view.
   * A file is diffable if its status is "modified" or "renamed".
   */
  const isCurrentFileGitModified = useMemo(() => {
    if (!selectedFile) return false;
    // In changes mode, use selectedGitStatus directly.
    // In files mode, look up by relative path.
    const fileStatus =
      selectedGitStatus ??
      gitStatus?.get(getRelativePath(selectedFile.path, currentCwd));
    return isDiffableStatus(fileStatus);
  }, [selectedFile, selectedGitStatus, currentCwd, gitStatus]);

  /**
   * Determine if the current file is deleted (needs special viewer).
   */
  const isCurrentFileDeleted = useMemo(() => {
    if (!selectedFile) return false;
    const relativePath = getRelativePath(selectedFile.path, currentCwd);
    const fileStatus = gitStatus?.get(relativePath);
    return fileStatus?.status === "deleted";
  }, [selectedFile, currentCwd, gitStatus]);

  /**
   * Determine if the current file is selected as a staged entry.
   * Uses the memoized selectedGitStatus for efficiency.
   *
   * Only true when:
   * 1. The file's actual staged property is true
   * 2. We're currently in "Showing only changed files" mode
   *
   * When switching out of "changes" mode, the file becomes editable even if it was
   * previously selected as staged. This matches the expectation that normal file
   * browsing always edits the working directory version.
   */
  const isCurrentFileStaged = useMemo(() => {
    if (!selectedFile || !selectedGitStatus) return false;
    return selectedGitStatus.staged === true && treeViewMode === "changes";
  }, [selectedFile, selectedGitStatus, treeViewMode]);

  /**
   * Label for changes mode: "Staged" or "Unstaged".
   * Only shown when in "changes" mode to indicate which version is being viewed.
   */
  const changesViewLabel = useMemo(() => {
    if (treeViewMode !== "changes" || !selectedGitStatus) return undefined;
    return selectedGitStatus.staged ? "Staged" : "Unstaged";
  }, [treeViewMode, selectedGitStatus]);

  /**
   * Determine if the current file has changes in the git index.
   * Used to show Index → Working Directory diff for partially staged files.
   *
   * IMPORTANT: This should only return true when:
   * 1. We're in "changes" mode (viewing git changes, not normal files)
   * 2. The selected entry is unstaged (viewing working directory changes)
   * 3. The file has staged changes in the index
   *
   * In "files" mode, we always want HEAD → Working Directory comparison,
   * so this returns false to ensure that behavior.
   */
  const currentFileHasIndexChanges = useMemo(() => {
    // Only applies in changes mode when viewing an unstaged entry
    if (treeViewMode !== "changes") return false;
    if (!selectedFile || !selectedGitStatus) return false;

    // Only show Index → Working Directory for unstaged entries
    // (staged entries show HEAD → Index instead)
    if (selectedGitStatus.staged) return false;

    // Check if there are staged changes to compare against
    const relativePath = getRelativePath(selectedFile.path, currentCwd);
    const baseEntry = gitStatus?.get(relativePath);
    return baseEntry?.hasIndexChanges ?? false;
  }, [selectedFile, selectedGitStatus, treeViewMode, currentCwd, gitStatus]);

  /**
   * Git status for the current file (for toolbar badge).
   * In "changes" mode, uses selectedGitStatus from the map key.
   * In "files" mode, looks up by relative path.
   */
  const currentFileGitStatus = useMemo(() => {
    if (!selectedFile) return undefined;
    // In changes mode, use the entry from selectedMapKey
    if (selectedGitStatus) return selectedGitStatus;
    // In files mode, look up by relative path
    const relativePath = getRelativePath(selectedFile.path, currentCwd);
    return gitStatus?.get(relativePath) ?? undefined;
  }, [selectedFile, selectedGitStatus, currentCwd, gitStatus]);

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
   * Handles Cmd/Ctrl+S (save).
   * Monaco handles Cmd/Ctrl+F (find) internally.
   * Cmd/Ctrl+P (quick open) is handled globally by the command system.
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
  // hideFileTree prop overrides all other logic to force editor-only mode
  const showTree = hideFileTree
    ? false
    : layout === "single"
      ? panelView === "tree"
      : !isTreeCollapsed;
  const showEditor =
    hideFileTree || layout === "split" || panelView === "editor";

  return (
    <FileDiffStatsProvider git={git} fs={fs}>
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
            selectedMapKey={selectedMapKey}
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
            // Unseen Tracking Props (when enabled)
            isFileUnseen={
              trackUnseenChanges ? unseenTracking.isUnseen : undefined
            }
            onPathRename={handlePathRename}
            triggerRead={trackUnseenChanges ? triggerRead : undefined}
            // Dirty file checking (for preventing staging unsaved files)
            isFileDirty={isFileDirty}
            // Commit graph callbacks
            onCommitFileSelect={handleCommitFileSelect}
            onViewCommit={handleViewCommit}
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
          <EditorPane
            editorId={editorId}
            cwd={currentCwd}
            sandboxId={sandboxId}
            git={git}
            selectedFile={selectedFile}
            selectedMapKey={selectedMapKey}
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
            onExitCommitMode={handleExitCommitMode}
            isFileDeleted={isCurrentFileDeleted}
            isFileStaged={isCurrentFileStaged}
            hasIndexChanges={currentFileHasIndexChanges}
            selectedGitStatus={currentFileGitStatus}
            changesViewLabel={changesViewLabel}
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
            // Unseen tracking (when enabled)
            unseenTracking={trackUnseenChanges ? unseenTracking : undefined}
            // Dirty file checking (for preventing staging unsaved files)
            isFileDirty={isFileDirty}
            // Close handler
            onClose={onClose}
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
    </FileDiffStatsProvider>
  );
}
