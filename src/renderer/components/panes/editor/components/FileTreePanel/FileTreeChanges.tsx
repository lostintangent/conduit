/**
 * FileTreeChanges - Git changes view showing modified files.
 *
 * Displays changed files grouped by staging status:
 * - Staged Changes section
 * - Changes (unstaged) section
 *
 * Supports two view modes:
 * - Flat: Shows files in a flat list with folder path as subtext
 * - Nested: Shows files nested within their folder hierarchy
 *
 * Features:
 * - Multi-select with shift-click and cmd/ctrl-click
 * - Bulk operations on selected files/folders
 * - Inline action buttons for stage/unstage/revert
 *
 * @example
 * ```tsx
 * <FileTreeChanges
 *   cwd="/project"
 *   selectedFile={selectedFile}
 *   onFileSelect={(file) => openFile(file)}
 * />
 * ```
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Plus,
  Minus,
  ChevronRight,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import { useGitAvailable } from "@/hooks/useGitAvailable";
import type { FileSystemV2API } from "@/api/FileSystemV2API";
import type { GitV2API } from "@/api/GitV2API";
import {
  useScrollPersistence,
  useFileTreeChangesContextMenu,
} from "../../hooks";
import {
  filterDirtyFilesForStaging,
  getParentPath,
  getParentPaths,
  getRelativePath,
  joinCwdPath,
  notifyDirtyFilesSkipped,
  // MapKey helpers (centralized operations)
  normalizeMapKey,
} from "../../utils";
import type { GitFileStatus } from "@/api/GitV2API";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { enqueueNotification } from "@/store/actions/notifications";
import type { FileNode } from "../../types";

// Local imports from extracted modules
import { useMultiSelect } from "./hooks";
import {
  buildFolderTree,
  buildVisualOrderFromTree,
  buildFlatVisualOrder,
  expandFoldersToFiles,
} from "./utils";
import type { SelectableItem, FolderNode } from "./utils";
import { ChangeFileItem, NestedFolderItem } from "./components";
import { SectionDiffStats } from "../FileDiffStats";

// ============================================================================
// Types
// ============================================================================

export interface FileTreeChangesProps {
  /** Editor pane ID (for scroll persistence) */
  paneId: string;
  /** Working directory */
  cwd: string;
  /** FileSystem API instance (shared from parent) - required for rename/delete */
  fs: FileSystemV2API;
  /** Git API instance (shared from parent) */
  git: GitV2API;
  /** Currently selected file (null if none) */
  selectedFile: FileNode | null;
  /**
   * Selected map key for changes mode.
   * Identifies which entry is selected for partially staged files.
   * The key matches the git status Map key (includes UNSTAGED_KEY_SUFFIX for unstaged entries).
   */
  selectedMapKey?: string | null;
  /** Callback when a file is selected */
  onFileSelect: (file: FileNode, mapKey: string | null) => void;
  /** View mode for changes list (flat or nested) - controlled by parent */
  viewMode?: "flat" | "nested";
  /** Git status map from the parent (relative paths to status) */
  gitStatus: Map<string, GitFileStatus> | null;
  /** Whether we're comparing to a branch (not HEAD). When true: hides action buttons, combines staged/unstaged sections. */
  isComparingToBranch?: boolean;
  /** Base branch name for display (e.g., "main") */
  baseBranchName?: string | null;
  /** Check if a file is unseen - returns true if file has unacknowledged changes */
  isFileUnseen?: (path: string) => boolean;
  /** Check if a file has unsaved changes - used to prevent staging dirty files */
  isFileDirty?: (filePath: string) => boolean;
  /** Callback when a file/folder is renamed - used to preserve seen status */
  onPathRename?: (oldPath: string, newPath: string) => void;
  /** Mark a file as seen (unseen tracking) */
  markSeen?: (path: string) => void;
}

// ============================================================================
// Section Component
// ============================================================================

interface SectionProps {
  title: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  actions?: React.ReactNode;
  /** Whether this is the staged section (for diff stats) */
  isStaged?: boolean;
}

/**
 * Collapsible section for grouping changes (Staged/Unstaged).
 */
function Section({
  title,
  count,
  isExpanded,
  onToggle,
  children,
  actions,
  isStaged,
}: SectionProps) {
  return (
    <div data-testid={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="group flex items-center gap-1.5 w-full py-1 px-1.5 hover:bg-foreground/10 rounded-md text-[13px] font-medium text-foreground transition cursor-pointer">
        <button
          type="button"
          className="flex items-center gap-1.5 flex-1 min-w-0 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
          onClick={onToggle}
          data-testid="section-toggle"
        >
          {isExpanded ? (
            <ChevronDown className="text-foreground flex-shrink-0" size={12} />
          ) : (
            <ChevronRight className="text-foreground flex-shrink-0" size={12} />
          )}
          <span className="truncate">
            {title} <span className="text-foreground/50">({count})</span>
          </span>
        </button>
        {/* Diff stats / Actions - mutually exclusive via display:none/block */}
        {/* Stats: shown by default, hidden on hover */}
        {/* Right margin aligns with file stats (accounts for GitBadge 14px + gap 6px) */}
        {isStaged !== undefined && (
          <div className="block group-hover:hidden mr-5">
            <SectionDiffStats staged={isStaged} />
          </div>
        )}
        {/* Actions: hidden by default, shown on hover (no margin - stays at hard right) */}
        {actions && (
          <div className="hidden group-hover:block flex items-center">
            {actions}
          </div>
        )}
      </div>
      {isExpanded && <ul className="ml-2 pb-2">{children}</ul>}
    </div>
  );
}

// ============================================================================
// Types
// ============================================================================

/**
 * Separate expansion state for staged and unstaged folder sections.
 * This keeps folder collapse/expand independent between sections.
 */
interface ExpandedFoldersState {
  staged: Set<string>;
  unstaged: Set<string>;
}

// ============================================================================
// Custom Hook: useChangesViewState
// ============================================================================

/**
 * Hook to manage changes view state including section expansion
 * and folder expansion for nested view.
 */
function useChangesViewState() {
  const [stagedExpanded, setStagedExpanded] = useState(true);
  const [changesExpanded, setChangesExpanded] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState<ExpandedFoldersState>(
    () => ({ staged: new Set(), unstaged: new Set() }),
  );

  /**
   * Toggle a folder's expansion state in a specific section.
   */
  const toggleFolder = useCallback(
    (path: string, section: "staged" | "unstaged") => {
      setExpandedFolders((prev) => {
        const sectionSet = prev[section];
        const next = new Set(sectionSet);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);
        }
        return { ...prev, [section]: next };
      });
    },
    [],
  );

  /**
   * Expand folders to reveal the given files.
   * @param filePaths - File paths to reveal
   * @param section - Which section to expand folders in
   * @param replace - If true, replaces all expanded folders; if false, adds to existing
   */
  const expandFoldersForFiles = useCallback(
    (filePaths: string[], section: "staged" | "unstaged", replace = false) => {
      if (filePaths.length === 0 && !replace) return;

      setExpandedFolders((prev) => {
        const next = replace ? new Set<string>() : new Set(prev[section]);
        for (const filePath of filePaths) {
          for (const folder of getParentPaths(filePath)) {
            next.add(folder);
          }
        }
        return { ...prev, [section]: next };
      });
    },
    [],
  );

  /**
   * Expand folders in both sections (convenience for initial load).
   * @param stagedPaths - Staged file paths
   * @param unstagedPaths - Unstaged file paths
   * @param replace - If true, replaces all expanded folders
   */
  const expandAllFoldersForFiles = useCallback(
    (stagedPaths: string[], unstagedPaths: string[], replace = false) => {
      setExpandedFolders((prev) => {
        const nextStaged = replace ? new Set<string>() : new Set(prev.staged);
        const nextUnstaged = replace
          ? new Set<string>()
          : new Set(prev.unstaged);

        for (const filePath of stagedPaths) {
          for (const folder of getParentPaths(filePath)) {
            nextStaged.add(folder);
          }
        }
        for (const filePath of unstagedPaths) {
          for (const folder of getParentPaths(filePath)) {
            nextUnstaged.add(folder);
          }
        }

        return { staged: nextStaged, unstaged: nextUnstaged };
      });
    },
    [],
  );

  return {
    stagedExpanded,
    setStagedExpanded,
    changesExpanded,
    setChangesExpanded,
    expandedFolders,
    toggleFolder,
    expandFoldersForFiles,
    expandAllFoldersForFiles,
  };
}

// ============================================================================
// Main Component
// ============================================================================

export function FileTreeChanges({
  paneId,
  cwd,
  fs,
  git,
  selectedFile: _selectedFile,
  selectedMapKey,
  onFileSelect,
  viewMode = "nested",
  gitStatus,
  isComparingToBranch = false,
  baseBranchName,
  isFileUnseen,
  isFileDirty,
  onPathRename,
  markSeen,
}: FileTreeChangesProps) {
  const showActionButtons = !isComparingToBranch;

  // Scroll persistence
  const scrollContainerRef = useScrollPersistence(paneId, "changesTree");

  const { isAvailable: isGitAvailable, isLoading: isCheckingGit } =
    useGitAvailable();

  // View state (section/folder expansion)
  const {
    stagedExpanded,
    setStagedExpanded,
    changesExpanded,
    setChangesExpanded,
    expandedFolders,
    toggleFolder,
    expandFoldersForFiles,
    expandAllFoldersForFiles,
  } = useChangesViewState();

  // Group files by staging status
  const { stagedFiles, unstagedFiles } = useMemo(() => {
    const staged: Array<[string, GitFileStatus]> = [];
    const unstaged: Array<[string, GitFileStatus]> = [];

    if (gitStatus) {
      for (const [path, status] of gitStatus) {
        if (isComparingToBranch) {
          unstaged.push([path, status]);
        } else if (status.staged) {
          staged.push([path, status]);
        } else {
          unstaged.push([path, status]);
        }
      }
    }

    staged.sort((a, b) => a[0].localeCompare(b[0]));
    unstaged.sort((a, b) => a[0].localeCompare(b[0]));

    return { stagedFiles: staged, unstagedFiles: unstaged };
  }, [gitStatus, isComparingToBranch]);

  // All file paths (Map keys, for expanding folders and multi-select tracking)
  const allFilePaths = useMemo(() => {
    return [
      ...stagedFiles.map(([path]) => path),
      ...unstagedFiles.map(([path]) => path),
    ];
  }, [stagedFiles, unstagedFiles]);

  /**
   * Lookup map from Map key to actual file path.
   *
   * For partially staged files, the Map key includes a suffix (e.g., "foo.ts\0unstaged")
   * but git operations need the actual file path ("foo.ts").
   * This map provides fast lookup to convert Map keys to actual paths.
   */
  const mapKeyToActualPath = useMemo(() => {
    const lookup = new Map<string, string>();
    for (const [mapKey, status] of [...stagedFiles, ...unstagedFiles]) {
      lookup.set(mapKey, status.path);
    }
    return lookup;
  }, [stagedFiles, unstagedFiles]);

  /**
   * Convert a Map key (or set of keys) to actual file paths for git operations.
   */
  const getActualPaths = useCallback(
    (mapKeys: string[]): string[] => {
      return mapKeys.map((key) => mapKeyToActualPath.get(key) ?? key);
    },
    [mapKeyToActualPath],
  );

  // Build folder trees for nested view
  const { stagedTree, unstagedTree } = useMemo(() => {
    return {
      stagedTree: buildFolderTree(stagedFiles),
      unstagedTree: buildFolderTree(unstagedFiles),
    };
  }, [stagedFiles, unstagedFiles]);

  // Build visual order based on view mode
  // Split into separate memos so toggling a folder in one section
  // doesn't recalculate the other section's visual order
  const stagedVisualOrder = useMemo((): SelectableItem[] => {
    if (viewMode === "flat") {
      return buildFlatVisualOrder(stagedFiles, []);
    }
    return buildVisualOrderFromTree(stagedTree, expandedFolders.staged);
  }, [viewMode, stagedFiles, stagedTree, expandedFolders.staged]);

  const unstagedVisualOrder = useMemo((): SelectableItem[] => {
    if (viewMode === "flat") {
      return buildFlatVisualOrder([], unstagedFiles);
    }
    return buildVisualOrderFromTree(unstagedTree, expandedFolders.unstaged);
  }, [viewMode, unstagedFiles, unstagedTree, expandedFolders.unstaged]);

  // Combined for multi-select (needs full list for shift-click ranges)
  const visualOrder = useMemo(
    (): SelectableItem[] => [...stagedVisualOrder, ...unstagedVisualOrder],
    [stagedVisualOrder, unstagedVisualOrder],
  );

  // Multi-select state
  const {
    selectedPaths: multiSelectedPaths,
    anchorPath,
    handleItemClick: handleMultiSelectClick,
    clearSelection,
    isSelected: isMultiSelected,
    getSelectedFilePaths,
  } = useMultiSelect(visualOrder, allFilePaths);

  // ---------------------------------------------------------------------------
  // Rename/Delete State (for unstaged files only)
  // ---------------------------------------------------------------------------

  /**
   * Path of the file currently being renamed (relative to cwd).
   * Only unstaged files can be renamed.
   */
  const [renamingPath, setRenamingPath] = useState<string | null>(null);

  /**
   * Path of the file pending deletion (relative to cwd).
   * Only unstaged files can be deleted.
   */
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // File/Folder Creation State
  // ---------------------------------------------------------------------------

  /**
   * Path of the folder where a new file/folder is being created (absolute path).
   * null when not creating anything.
   */
  const [creatingInPath, setCreatingInPath] = useState<string | null>(null);

  /**
   * Type of item being created: "file" or "folder".
   * null when not creating anything.
   */
  const [creatingType, setCreatingType] = useState<"file" | "folder" | null>(
    null,
  );

  /**
   * Path of a newly created file waiting to be selected.
   * Used to handle the delay between file creation and git detecting it.
   * When git status updates to include this file, we select it.
   */
  const [pendingSelectPath, setPendingSelectPath] = useState<string | null>(
    null,
  );

  /**
   * Ref to guard against double invocation of creation handlers.
   * Stores the path being processed to prevent duplicate calls.
   */
  const creationInProgressRef = useRef<string | null>(null);

  // ---------------------------------------------------------------------------
  // Selected MapKey Normalization
  // ---------------------------------------------------------------------------

  /**
   * Normalize selectedMapKey to match the actual mapKey in the file list.
   *
   * Uses the centralized normalizeMapKey helper which handles:
   * - Direct match (selectedMapKey exists in the list)
   * - Suffix normalization (selectedMapKey has suffix but file isn't partially staged)
   */
  const normalizedSelectedMapKey = useMemo(() => {
    if (!selectedMapKey) return null;
    return normalizeMapKey(selectedMapKey, allFilePaths);
  }, [selectedMapKey, allFilePaths]);

  // ---------------------------------------------------------------------------
  // Sync anchor with selectedMapKey from parent
  // ---------------------------------------------------------------------------

  // When selectedMapKey changes or anchor is cleared, set the anchor
  // so shift-click works from the selected file.
  useEffect(() => {
    if (!normalizedSelectedMapKey) return;

    // Only set anchor if it's not already set to the correct value
    if (anchorPath !== normalizedSelectedMapKey) {
      clearSelection(normalizedSelectedMapKey);
    }
  }, [normalizedSelectedMapKey, anchorPath, clearSelection]);

  // ---------------------------------------------------------------------------
  // Pending File Selection (after creation)
  // ---------------------------------------------------------------------------

  /**
   * Select a newly created file once git detects it.
   * This handles the delay between file creation and git status update.
   */
  useEffect(() => {
    if (!pendingSelectPath) return;

    // Convert absolute path to relative for comparison with allFilePaths
    const relativePath = getRelativePath(pendingSelectPath, cwd);

    // Check if the file has appeared in git status
    if (allFilePaths.includes(relativePath)) {
      const name = relativePath.split("/").pop() ?? relativePath;
      // Pass relativePath as mapKey so the file tree highlights the item
      onFileSelect(
        { path: pendingSelectPath, name, type: "file" },
        relativePath,
      );
      setPendingSelectPath(null);
    }
  }, [pendingSelectPath, allFilePaths, cwd, onFileSelect]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle file/folder selection.
   *
   * For files, constructs a FileNode with the actual path.
   * The mapKey parameter uniquely identifies the entry (staged vs unstaged for partially staged files).
   * The filePath parameter is the actual filesystem path (from status.path).
   */
  const handleSelect = useCallback(
    (
      mapKey: string,
      filePath: string,
      event: React.MouseEvent,
      isFolder = false,
    ) => {
      if (event.shiftKey || event.metaKey || event.ctrlKey) {
        // Multi-select: add/toggle/range selection
        handleMultiSelectClick(mapKey, event);
      } else {
        // Single click: clear multi-selection but set anchor for future shift-clicks
        clearSelection(mapKey);

        if (!isFolder) {
          // Use actual file path for FileNode, pass mapKey for selection tracking
          const fullPath = joinCwdPath(cwd, filePath);
          const name = filePath.split("/").pop() ?? filePath;
          onFileSelect({ path: fullPath, name, type: "file" }, mapKey);
        }
      }
    },
    [cwd, onFileSelect, handleMultiSelectClick, clearSelection],
  );

  const handleStage = useCallback(
    (mapKey: string) => {
      // Get Map keys for tracking (may include suffix for partially staged files)
      const mapKeys = isMultiSelected(mapKey)
        ? getSelectedFilePaths()
        : expandFoldersToFiles(new Set([mapKey]), allFilePaths);

      // Convert to actual paths for git operations
      const actualPaths = getActualPaths(mapKeys);

      // Filter out dirty files (files with unsaved changes in editor)
      const {
        cleanFiles: cleanPaths,
        allDirty,
        skippedCount,
      } = filterDirtyFilesForStaging(
        actualPaths,
        (path) => joinCwdPath(cwd, path),
        isFileDirty,
      );

      // Show notification if any files were skipped
      notifyDirtyFilesSkipped(skippedCount, allDirty);

      if (allDirty) return;

      // Mark files as seen when staging
      for (const path of cleanPaths) {
        markSeen?.(path);
      }

      git.stage(cleanPaths).catch((error) => {
        console.error("Failed to stage file(s):", error);
      });

      clearSelection();
    },
    [
      git,
      cwd,
      isMultiSelected,
      getSelectedFilePaths,
      allFilePaths,
      getActualPaths,
      isFileDirty,
      clearSelection,
      markSeen,
    ],
  );

  const handleUnstage = useCallback(
    (mapKey: string) => {
      // Get Map keys for tracking (may include suffix for partially staged files)
      const mapKeys = isMultiSelected(mapKey)
        ? getSelectedFilePaths()
        : expandFoldersToFiles(new Set([mapKey]), allFilePaths);

      // Convert to actual paths for git operations
      const actualPaths = getActualPaths(mapKeys);

      // Mark files as seen when unstaging
      for (const path of actualPaths) {
        markSeen?.(path);
      }

      git.unstage(actualPaths).catch((error) => {
        console.error("Failed to unstage file(s):", error);
      });

      clearSelection();
    },
    [
      git,
      isMultiSelected,
      getSelectedFilePaths,
      allFilePaths,
      getActualPaths,
      clearSelection,
      markSeen,
    ],
  );

  const handleRevert = useCallback(
    async (mapKey: string) => {
      // Get Map keys for tracking (may include suffix for partially staged files)
      const mapKeys = isMultiSelected(mapKey)
        ? getSelectedFilePaths()
        : expandFoldersToFiles(new Set([mapKey]), allFilePaths);

      // Convert to actual paths for git operations
      const actualPaths = getActualPaths(mapKeys);

      try {
        // Mark files as seen when reverting
        for (const path of actualPaths) {
          markSeen?.(path);
        }

        await git.revert(actualPaths);
        // Note: If the reverted file was untracked/added (deleted on revert),
        // EditorPaneV2's git status sync effect will auto-select the next file
      } catch (error) {
        console.error("Failed to revert file(s):", error);
      }

      clearSelection();
    },
    [
      git,
      isMultiSelected,
      getSelectedFilePaths,
      allFilePaths,
      getActualPaths,
      clearSelection,
      markSeen,
    ],
  );

  // ---------------------------------------------------------------------------
  // Rename/Delete Handlers (for unstaged files via context menu)
  // ---------------------------------------------------------------------------

  /**
   * Start renaming a file. Sets the renamingPath state to show inline editor.
   * Path should be relative to cwd.
   */
  const beginRename = useCallback((relativePath: string) => {
    setRenamingPath(relativePath);
  }, []);

  /**
   * Commit the rename operation. Performs the actual filesystem rename.
   */
  const commitRename = useCallback(
    async (newName: string) => {
      if (!renamingPath) return;

      const parentDir = getParentPath(renamingPath);
      const newPath = parentDir ? `${parentDir}/${newName}` : newName;
      const oldAbsolutePath = joinCwdPath(cwd, renamingPath);
      const newAbsolutePath = joinCwdPath(cwd, newPath);

      try {
        await fs.rename(oldAbsolutePath, newAbsolutePath);

        // Transfer seen status from old path to new path
        // This works for both files and folders (handles nested files too)
        onPathRename?.(renamingPath, newPath);

        setRenamingPath(null);
      } catch (error) {
        const itemName = renamingPath.split("/").pop() ?? "item";
        enqueueNotification({
          kind: "error",
          message: `Failed to rename "${itemName}"`,
          details: error instanceof Error ? error.message : "Unknown error",
        });
        setRenamingPath(null);
      }
    },
    [renamingPath, cwd, fs, onPathRename],
  );

  /**
   * Cancel the rename operation.
   */
  const cancelRename = useCallback(() => {
    setRenamingPath(null);
  }, []);

  /**
   * Handle rename command from context menu.
   * Converts absolute path to relative and starts inline rename.
   */
  const handleRenameCommand = useCallback(
    (absolutePath: string) => {
      const relativePath = getRelativePath(absolutePath, cwd);
      beginRename(relativePath);
    },
    [cwd, beginRename],
  );

  /**
   * Handle delete command from context menu.
   * Converts absolute path to relative and shows delete confirmation.
   */
  const handleDeleteCommand = useCallback(
    (absolutePath: string) => {
      const relativePath = getRelativePath(absolutePath, cwd);
      setDeletingPath(relativePath);
    },
    [cwd],
  );

  /**
   * Confirm and execute delete operation.
   */
  const confirmDelete = useCallback(async () => {
    if (!deletingPath) return;

    const absolutePath = joinCwdPath(cwd, deletingPath);
    const itemName = deletingPath.split("/").pop() ?? "file";

    try {
      // Use recursive: true to handle both files and folders
      await fs.delete(absolutePath, { recursive: true });
      setDeletingPath(null);
    } catch (error) {
      enqueueNotification({
        kind: "error",
        message: `Failed to delete "${itemName}"`,
        details: error instanceof Error ? error.message : "Unknown error",
      });
      setDeletingPath(null);
    }
  }, [deletingPath, cwd, fs]);

  /**
   * Cancel delete operation.
   */
  const cancelDelete = useCallback(() => {
    setDeletingPath(null);
  }, []);

  // ---------------------------------------------------------------------------
  // File/Folder Creation Handlers
  // ---------------------------------------------------------------------------

  /**
   * Begin creating a new file or folder in the specified directory.
   * Expands the folder in nested view so the creation input is visible.
   */
  const beginCreate = useCallback(
    (parentPath: string, type: "file" | "folder") => {
      // Guard against double invocation using ref (state updates are batched)
      if (creationInProgressRef.current === parentPath) {
        return;
      }
      creationInProgressRef.current = parentPath;

      // Expand the folder in nested view if not already expanded
      // Creation only happens in unstaged section
      if (viewMode === "nested") {
        const relativePath = getRelativePath(parentPath, cwd);
        if (relativePath && !expandedFolders.unstaged.has(relativePath)) {
          toggleFolder(relativePath, "unstaged");
        }
      }
      setCreatingInPath(parentPath);
      setCreatingType(type);

      // Clear the guard after state updates
      setTimeout(() => {
        creationInProgressRef.current = null;
      }, 0);
    },
    [cwd, viewMode, expandedFolders.unstaged, toggleFolder],
  );

  /**
   * Cancel the current creation operation.
   */
  const cancelCreate = useCallback(() => {
    setCreatingInPath(null);
    setCreatingType(null);
  }, []);

  /**
   * Commit the creation of a new file or folder.
   */
  const commitCreate = useCallback(
    async (name: string) => {
      if (!creatingInPath || !creatingType) return;

      const newPath = `${creatingInPath}/${name}`;

      try {
        if (creatingType === "file") {
          await fs.writeTextFile(newPath, "");
          // Queue the file for selection once git detects it
          setPendingSelectPath(newPath);
        } else {
          await fs.createDirectory(newPath);
        }
        setCreatingInPath(null);
        setCreatingType(null);
      } catch (error) {
        enqueueNotification({
          kind: "error",
          message: `Failed to create ${creatingType}`,
          details: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    [creatingInPath, creatingType, fs],
  );

  // ---------------------------------------------------------------------------
  // Context Menu Hook
  // ---------------------------------------------------------------------------

  const { showContextMenu } = useFileTreeChangesContextMenu({
    cwd,
    onStage: handleStage,
    onUnstage: handleUnstage,
    onRevert: handleRevert,
    onRename: handleRenameCommand,
    onDelete: handleDeleteCommand,
    onNewFile: (path) => beginCreate(path, "file"),
    onNewFolder: (path) => beginCreate(path, "folder"),
  });

  /**
   * Handle context menu for files and folders.
   * Builds the absolute path and shows the context menu with appropriate options.
   */
  const handleContextMenu = useCallback(
    (
      mapKey: string,
      filePath: string,
      isStaged: boolean,
      isDirectory: boolean,
      event: React.MouseEvent,
    ) => {
      const absolutePath = joinCwdPath(cwd, filePath);
      showContextMenu({
        path: absolutePath,
        mapKey,
        isStaged,
        isDirectory,
        event,
      });
    },
    [cwd, showContextMenu],
  );

  const handleStageAll = useCallback(() => {
    if (unstagedFiles.length === 0) return;

    // Filter out dirty files
    const { cleanFiles, allDirty, skippedCount } = filterDirtyFilesForStaging(
      unstagedFiles,
      ([, status]) => joinCwdPath(cwd, status.path),
      isFileDirty,
    );

    // Show notification if any files were skipped
    notifyDirtyFilesSkipped(skippedCount, allDirty);

    if (allDirty) return;

    const actualPaths = cleanFiles.map(([, status]) => status.path);
    git.stage(actualPaths).catch((error) => {
      console.error("Failed to stage all files:", error);
    });
  }, [git, cwd, unstagedFiles, isFileDirty]);

  const handleUnstageAll = useCallback(() => {
    if (stagedFiles.length === 0) return;
    const actualPaths = stagedFiles.map(([, status]) => status.path);
    git.unstage(actualPaths).catch((error) => {
      console.error("Failed to unstage all files:", error);
    });
  }, [git, stagedFiles]);

  // Auto-expand folders in nested view
  const prevStateRef = useRef<{
    viewMode: string;
    stagedPaths: Set<string>;
    unstagedPaths: Set<string>;
  }>({
    viewMode,
    stagedPaths: new Set(),
    unstagedPaths: new Set(),
  });

  useEffect(() => {
    const stagedPaths = stagedFiles.map(([p]) => p);
    const unstagedPaths = unstagedFiles.map(([p]) => p);

    const currentStagedPaths = new Set(stagedPaths);
    const currentUnstagedPaths = new Set(unstagedPaths);
    const wasNestedView = prevStateRef.current.viewMode === "nested";
    const isNestedView = viewMode === "nested";

    if (isNestedView) {
      if (!wasNestedView) {
        // Switching to nested view: expand all folders
        expandAllFoldersForFiles(stagedPaths, unstagedPaths, true);
      } else {
        // Already in nested view: only expand folders for new files
        const newStagedPaths = stagedPaths.filter(
          (p) => !prevStateRef.current.stagedPaths.has(p),
        );
        const newUnstagedPaths = unstagedPaths.filter(
          (p) => !prevStateRef.current.unstagedPaths.has(p),
        );
        if (newStagedPaths.length > 0) {
          expandFoldersForFiles(newStagedPaths, "staged", false);
        }
        if (newUnstagedPaths.length > 0) {
          expandFoldersForFiles(newUnstagedPaths, "unstaged", false);
        }
      }
    }

    prevStateRef.current = {
      viewMode,
      stagedPaths: currentStagedPaths,
      unstagedPaths: currentUnstagedPaths,
    };
  }, [
    viewMode,
    stagedFiles,
    unstagedFiles,
    expandFoldersForFiles,
    expandAllFoldersForFiles,
  ]);

  // ---------------------------------------------------------------------------
  // Render Helpers
  // ---------------------------------------------------------------------------

  /**
   * Check if a file should be shown as selected.
   * Uses normalizedSelectedMapKey which handles suffix normalization.
   */
  const isFileSelected = (mapKey: string): boolean => {
    return normalizedSelectedMapKey === mapKey;
  };

  const renderFlatFiles = (
    files: Array<[string, GitFileStatus]>,
    isStaged: boolean,
  ) => {
    return files.map(([mapKey, status]) => (
      <ChangeFileItem
        key={mapKey}
        path={status.path}
        status={status}
        cwd={cwd}
        isSelected={isFileSelected(mapKey)}
        isMultiSelected={multiSelectedPaths.has(mapKey)}
        isStaged={isStaged}
        canRevert={showActionButtons}
        onSelect={(event) => handleSelect(mapKey, status.path, event)}
        onStage={showActionButtons ? () => handleStage(mapKey) : undefined}
        onUnstage={showActionButtons ? () => handleUnstage(mapKey) : undefined}
        onRevert={showActionButtons ? () => handleRevert(mapKey) : undefined}
        showUnseenIndicator={isFileUnseen?.(status.path)}
        onContextMenu={(e) =>
          handleContextMenu(mapKey, status.path, isStaged, false, e)
        }
        isRenaming={!isStaged && renamingPath === status.path}
        onCommitRename={commitRename}
        onCancelRename={cancelRename}
      />
    ));
  };

  const renderNestedFiles = (
    tree: Map<string, FolderNode>,
    isStaged: boolean,
  ) => {
    const rootFolder = tree.get("");
    const rootFiles = rootFolder?.files ?? [];
    const folders = [...tree.values()]
      .filter((f) => f.name !== "")
      .sort((a, b) => a.name.localeCompare(b.name));

    // Get the appropriate section's expansion state
    const section = isStaged ? "staged" : "unstaged";
    const sectionExpandedFolders = expandedFolders[section];

    // Wrapper that toggles in the correct section
    const handleToggleFolder = (path: string) => toggleFolder(path, section);

    return (
      <>
        {folders.map((folder) => (
          <NestedFolderItem
            key={folder.path}
            folder={folder}
            cwd={cwd}
            expandedFolders={sectionExpandedFolders}
            onToggleFolder={handleToggleFolder}
            isFileSelected={isFileSelected}
            multiSelectedPaths={multiSelectedPaths}
            isStaged={isStaged}
            onFileSelect={handleSelect}
            onStage={showActionButtons ? handleStage : undefined}
            onUnstage={showActionButtons ? handleUnstage : undefined}
            onRevert={showActionButtons ? handleRevert : undefined}
            isFileUnseen={isFileUnseen}
            onContextMenu={(mapKey, filePath, isDirectory, e) =>
              handleContextMenu(mapKey, filePath, isStaged, isDirectory, e)
            }
            renamingPath={!isStaged ? renamingPath : null}
            onCommitRename={commitRename}
            onCancelRename={cancelRename}
            creatingInPath={creatingInPath}
            creatingType={creatingType}
            onCommitCreate={commitCreate}
            onCancelCreate={cancelCreate}
          />
        ))}
        {rootFiles
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((file) => (
            <ChangeFileItem
              key={file.mapKey}
              path={file.path}
              status={file.status}
              nested
              cwd={cwd}
              isSelected={isFileSelected(file.mapKey)}
              isMultiSelected={multiSelectedPaths.has(file.mapKey)}
              isStaged={isStaged}
              canRevert={showActionButtons}
              onSelect={(event) => handleSelect(file.mapKey, file.path, event)}
              onStage={
                showActionButtons ? () => handleStage(file.mapKey) : undefined
              }
              onUnstage={
                showActionButtons ? () => handleUnstage(file.mapKey) : undefined
              }
              onRevert={
                showActionButtons ? () => handleRevert(file.mapKey) : undefined
              }
              showUnseenIndicator={isFileUnseen?.(file.path)}
              onContextMenu={(e) =>
                handleContextMenu(file.mapKey, file.path, isStaged, false, e)
              }
              isRenaming={!isStaged && renamingPath === file.path}
              onCommitRename={commitRename}
              onCancelRename={cancelRename}
            />
          ))}
      </>
    );
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Git not installed
  if (!isCheckingGit && !isGitAvailable) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <AlertCircle className="w-8 h-8 text-yellow-500 mb-2" />
        <p className="text-sm text-foreground/70">Git is not installed</p>
      </div>
    );
  }

  // No changes
  if (stagedFiles.length === 0 && unstagedFiles.length === 0) {
    return (
      <div
        className="flex items-center justify-center h-full"
        data-testid="file-tree-changes-empty"
      >
        <p className="text-sm text-foreground/50">No changes</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="file-tree-changes">
      <nav
        ref={scrollContainerRef}
        className="overflow-auto flex-1 h-full px-3 text-[13px] text-white/80"
      >
        {/* Staged Changes Section */}
        {stagedFiles.length > 0 && (
          <Section
            title="Staged Changes"
            count={stagedFiles.length}
            isExpanded={stagedExpanded}
            onToggle={() => setStagedExpanded(!stagedExpanded)}
            isStaged={true}
            actions={
              showActionButtons && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleUnstageAll();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      handleUnstageAll();
                    }
                  }}
                  className="p-1 rounded hover:bg-foreground/20 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer"
                  title="Unstage All"
                  data-testid="unstage-all-button"
                >
                  <Minus size={12} />
                </div>
              )
            }
          >
            {viewMode === "flat"
              ? renderFlatFiles(stagedFiles, true)
              : renderNestedFiles(stagedTree, true)}
          </Section>
        )}

        {/* Changes Section */}
        {unstagedFiles.length > 0 && (
          <Section
            title={
              isComparingToBranch ? `Changes from ${baseBranchName}` : "Changes"
            }
            count={unstagedFiles.length}
            isExpanded={changesExpanded}
            onToggle={() => setChangesExpanded(!changesExpanded)}
            isStaged={false}
            actions={
              showActionButtons && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStageAll();
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      handleStageAll();
                    }
                  }}
                  className="p-1 rounded hover:bg-foreground/20 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40 cursor-pointer"
                  title="Stage All"
                  data-testid="stage-all-button"
                >
                  <Plus size={12} />
                </div>
              )
            }
          >
            {viewMode === "flat"
              ? renderFlatFiles(unstagedFiles, false)
              : renderNestedFiles(unstagedTree, false)}
          </Section>
        )}
      </nav>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deletingPath !== null}
        title="Delete"
        description={`Are you sure you want to delete "${deletingPath?.split("/").pop() ?? ""}"? This action cannot be undone.`}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        variant="destructive"
      />
    </div>
  );
}
