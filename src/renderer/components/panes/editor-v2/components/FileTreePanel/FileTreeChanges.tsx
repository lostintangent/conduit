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
import type { GitV2API } from "@/api/GitV2API";
import { useScrollPersistence } from "../../hooks/useScrollPersistence";
import {
  filterDirtyFilesForStaging,
  getParentPaths,
  joinCwdPath,
  notifyDirtyFilesSkipped,
  UNSTAGED_KEY_SUFFIX,
} from "../../utils";
import type { GitFileStatus, GitStatus } from "@/../../src/ipc/gitv2/types";
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
import { FlatChangeItem, NestedFileItem, NestedFolderItem } from "./components";

// ============================================================================
// Types
// ============================================================================

export interface FileTreeChangesProps {
  /** Editor pane ID (for scroll persistence) */
  paneId: string;
  /** Working directory */
  cwd: string;
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
  /** Git status from parent (source of truth). When provided, component uses this instead of fetching its own. */
  gitStatus?: Map<string, GitFileStatus> | null;
  /** Whether we're comparing to a branch (not HEAD). When true: hides action buttons, combines staged/unstaged sections. */
  isComparingToBranch?: boolean;
  /** Base branch name for display (e.g., "main") */
  baseBranchName?: string | null;
  /** Check if a file is unseen - returns true if file has unacknowledged changes */
  isFileUnseen?: (path: string) => boolean;
  /** Check if a file has unsaved changes - used to prevent staging dirty files */
  isFileDirty?: (filePath: string) => boolean;
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
}: SectionProps) {
  return (
    <div data-testid={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="group flex items-center gap-1.5 w-full py-1 px-1.5 hover:bg-foreground/10 rounded-md text-[13px] font-medium text-foreground transition cursor-pointer">
        <button
          type="button"
          className="flex items-center gap-1.5 flex-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
          onClick={onToggle}
          data-testid="section-toggle"
        >
          {isExpanded ? (
            <ChevronDown className="text-foreground" size={12} />
          ) : (
            <ChevronRight className="text-foreground" size={12} />
          )}
          <span>{title}</span>
          <span className="text-foreground/50 ml-1">({count})</span>
        </button>
        {actions && (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center">
            {actions}
          </div>
        )}
      </div>
      {isExpanded && <ul className="ml-2">{children}</ul>}
    </div>
  );
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
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(),
  );

  const toggleFolder = useCallback((path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const expandFoldersForFiles = useCallback(
    (filePaths: string[], replace = false) => {
      if (filePaths.length === 0 && !replace) return;

      setExpandedFolders((prev) => {
        const next = replace ? new Set<string>() : new Set(prev);
        for (const filePath of filePaths) {
          for (const folder of getParentPaths(filePath)) {
            next.add(folder);
          }
        }
        return next;
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
  };
}

// ============================================================================
// Custom Hook: useGitStatus
// ============================================================================

interface OptimisticUpdate {
  path: string;
  action: "stage" | "unstage";
  timestamp: number;
}

/**
 * Hook to manage git status loading, subscriptions, and optimistic updates.
 */
function useGitStatus(git: GitV2API, cwd: string, skip = false) {
  const { isAvailable: isGitAvailable, isLoading: isCheckingGit } =
    useGitAvailable();

  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [isLoading, setIsLoading] = useState(!skip);
  const [isNotGitRepo, setIsNotGitRepo] = useState(false);
  const [optimisticUpdates, setOptimisticUpdates] = useState<
    OptimisticUpdate[]
  >([]);

  // Initial load
  useEffect(() => {
    if (skip) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadStatus() {
      if (!isGitAvailable || isCheckingGit) {
        return;
      }

      setIsLoading(true);
      setIsNotGitRepo(false);
      try {
        const status = await git.getStatus();
        if (!cancelled) {
          setGitStatus(status);
          setIsLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load git status:", error);
          setIsNotGitRepo(true);
          setIsLoading(false);
        }
      }
    }

    loadStatus();

    return () => {
      cancelled = true;
    };
  }, [git, cwd, skip, isGitAvailable, isCheckingGit]);

  // Subscribe to status changes
  useEffect(() => {
    if (skip || !isGitAvailable || isCheckingGit) {
      return;
    }

    const unsubscribe = git.onStatusChanged((event) => {
      setGitStatus(event.status);
      setOptimisticUpdates([]);
    });

    return unsubscribe;
  }, [git, skip, isGitAvailable, isCheckingGit]);

  // Apply optimistic update
  const applyOptimisticUpdate = useCallback(
    (path: string, action: "stage" | "unstage") => {
      setOptimisticUpdates((prev) => [
        ...prev.filter((u) => u.path !== path),
        { path, action, timestamp: Date.now() },
      ]);
    },
    [],
  );

  // Revert optimistic update
  const revertOptimisticUpdate = useCallback((path: string) => {
    setOptimisticUpdates((prev) => prev.filter((u) => u.path !== path));
  }, []);

  // Compute status with optimistic updates applied
  const statusWithOptimistic = useMemo(() => {
    if (!gitStatus || optimisticUpdates.length === 0) {
      return gitStatus;
    }

    const files = new Map(gitStatus.files);

    for (const update of optimisticUpdates) {
      const current = files.get(update.path);
      if (current) {
        files.set(update.path, {
          ...current,
          staged: update.action === "stage",
        });
      }
    }

    return { ...gitStatus, files };
  }, [gitStatus, optimisticUpdates]);

  return {
    gitStatus: statusWithOptimistic,
    isLoading,
    isNotGitRepo,
    isGitAvailable,
    isCheckingGit,
    applyOptimisticUpdate,
    revertOptimisticUpdate,
  };
}

// ============================================================================
// Main Component
// ============================================================================

export function FileTreeChanges({
  paneId,
  cwd,
  git,
  selectedFile,
  selectedMapKey,
  onFileSelect,
  viewMode = "flat",
  gitStatus: gitStatusFromParent,
  isComparingToBranch = false,
  baseBranchName,
  isFileUnseen,
  isFileDirty,
}: FileTreeChangesProps) {
  const hasParentStatus = gitStatusFromParent !== undefined;
  const showActionButtons = !isComparingToBranch;

  // Scroll persistence
  const scrollContainerRef = useScrollPersistence(paneId, "changesTree");

  // Git status (internal or from parent)
  const {
    gitStatus: gitStatusFromHook,
    isLoading: isLoadingInternal,
    isNotGitRepo,
    isGitAvailable,
    isCheckingGit,
    applyOptimisticUpdate,
    revertOptimisticUpdate,
  } = useGitStatus(git, cwd, hasParentStatus);

  const gitStatus = hasParentStatus
    ? { files: gitStatusFromParent }
    : gitStatusFromHook;
  const isLoading = hasParentStatus ? false : isLoadingInternal;

  // View state (section/folder expansion)
  const {
    stagedExpanded,
    setStagedExpanded,
    changesExpanded,
    setChangesExpanded,
    expandedFolders,
    toggleFolder,
    expandFoldersForFiles,
  } = useChangesViewState();

  // Group files by staging status
  const { stagedFiles, unstagedFiles } = useMemo(() => {
    const staged: Array<[string, GitFileStatus]> = [];
    const unstaged: Array<[string, GitFileStatus]> = [];

    if (gitStatus?.files) {
      for (const [path, status] of gitStatus.files) {
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
  const visualOrder = useMemo((): SelectableItem[] => {
    if (viewMode === "flat") {
      return buildFlatVisualOrder(stagedFiles, unstagedFiles);
    } else {
      const stagedVisual = buildVisualOrderFromTree(
        stagedTree,
        expandedFolders,
      );
      const unstagedVisual = buildVisualOrderFromTree(
        unstagedTree,
        expandedFolders,
      );
      return [...stagedVisual, ...unstagedVisual];
    }
  }, [
    viewMode,
    stagedFiles,
    unstagedFiles,
    stagedTree,
    unstagedTree,
    expandedFolders,
  ]);

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
  // Selected MapKey Normalization
  // ---------------------------------------------------------------------------

  /**
   * Normalize selectedMapKey to match the actual mapKey in the file list.
   *
   * For non-partially-staged files, the parent may pass selectedMapKey with
   * the unstaged suffix, but the file list only has the path without suffix.
   * This computes the actual mapKey that exists in the list.
   */
  const normalizedSelectedMapKey = useMemo(() => {
    if (!selectedMapKey) return null;

    // Direct match - selectedMapKey exists in the list
    if (allFilePaths.includes(selectedMapKey)) {
      return selectedMapKey;
    }

    // Handle case where selectedMapKey has suffix but file isn't partially staged
    if (selectedMapKey.endsWith(UNSTAGED_KEY_SUFFIX)) {
      const pathWithoutSuffix = selectedMapKey.slice(
        0,
        -UNSTAGED_KEY_SUFFIX.length,
      );
      // If the path without suffix exists and there's no separate unstaged entry,
      // this is a non-partially-staged file
      if (allFilePaths.includes(pathWithoutSuffix)) {
        return pathWithoutSuffix;
      }
    }

    return selectedMapKey;
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
      const { cleanFiles: cleanPaths, allDirty, skippedCount } =
        filterDirtyFilesForStaging(
          actualPaths,
          (path) => joinCwdPath(cwd, path),
          isFileDirty,
        );

      // Show notification if any files were skipped
      notifyDirtyFilesSkipped(skippedCount, allDirty);

      if (allDirty) return;

      // Get map keys for clean paths only (for optimistic updates)
      const cleanMapKeys = mapKeys.filter((key) => {
        const actualPath = mapKeyToActualPath.get(key) ?? key;
        return !isFileDirty || !isFileDirty(joinCwdPath(cwd, actualPath));
      });

      for (const p of cleanMapKeys) {
        applyOptimisticUpdate(p, "stage");
      }

      git.stage(cleanPaths).catch((error) => {
        console.error("Failed to stage file(s):", error);
        for (const p of cleanMapKeys) {
          revertOptimisticUpdate(p);
        }
      });

      clearSelection();
    },
    [
      git,
      cwd,
      applyOptimisticUpdate,
      revertOptimisticUpdate,
      isMultiSelected,
      getSelectedFilePaths,
      allFilePaths,
      getActualPaths,
      mapKeyToActualPath,
      isFileDirty,
      clearSelection,
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

      for (const p of mapKeys) {
        applyOptimisticUpdate(p, "unstage");
      }

      git.unstage(actualPaths).catch((error) => {
        console.error("Failed to unstage file(s):", error);
        for (const p of mapKeys) {
          revertOptimisticUpdate(p);
        }
      });

      clearSelection();
    },
    [
      git,
      applyOptimisticUpdate,
      revertOptimisticUpdate,
      isMultiSelected,
      getSelectedFilePaths,
      allFilePaths,
      getActualPaths,
      clearSelection,
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
        await git.revert(actualPaths);
      } catch (error) {
        console.error("Failed to revert file(s):", error);
      }

      clearSelection();
    },
    [git, isMultiSelected, getSelectedFilePaths, allFilePaths, getActualPaths, clearSelection],
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

    // Map keys for optimistic updates
    const mapKeys = cleanFiles.map(([path]) => path);
    // Actual paths for git operations
    const actualPaths = cleanFiles.map(([, status]) => status.path);

    for (const path of mapKeys) {
      applyOptimisticUpdate(path, "stage");
    }

    git.stage(actualPaths).catch((error) => {
      console.error("Failed to stage all files:", error);
      for (const path of mapKeys) {
        revertOptimisticUpdate(path);
      }
    });
  }, [git, cwd, unstagedFiles, isFileDirty, applyOptimisticUpdate, revertOptimisticUpdate]);

  const handleUnstageAll = useCallback(() => {
    if (stagedFiles.length === 0) return;
    // Map keys for optimistic updates
    const mapKeys = stagedFiles.map(([path]) => path);
    // Actual paths for git operations
    const actualPaths = stagedFiles.map(([, status]) => status.path);

    for (const path of mapKeys) {
      applyOptimisticUpdate(path, "unstage");
    }

    git.unstage(actualPaths).catch((error) => {
      console.error("Failed to unstage all files:", error);
      for (const path of mapKeys) {
        revertOptimisticUpdate(path);
      }
    });
  }, [git, stagedFiles, applyOptimisticUpdate, revertOptimisticUpdate]);

  // Auto-expand folders in nested view
  const prevStateRef = useRef<{ viewMode: string; filePaths: Set<string> }>({
    viewMode,
    filePaths: new Set(),
  });

  useEffect(() => {
    const allPaths = [
      ...stagedFiles.map(([p]) => p),
      ...unstagedFiles.map(([p]) => p),
    ];
    const currentPaths = new Set(allPaths);
    const wasNestedView = prevStateRef.current.viewMode === "nested";
    const isNestedView = viewMode === "nested";

    if (isNestedView) {
      if (!wasNestedView) {
        expandFoldersForFiles(allPaths, true);
      } else {
        const newPaths = allPaths.filter(
          (p) => !prevStateRef.current.filePaths.has(p),
        );
        if (newPaths.length > 0) {
          expandFoldersForFiles(newPaths, false);
        }
      }
    }

    prevStateRef.current = { viewMode, filePaths: currentPaths };
  }, [viewMode, stagedFiles, unstagedFiles, expandFoldersForFiles]);

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
      <FlatChangeItem
        key={mapKey}
        path={status.path}
        status={status}
        cwd={cwd}
        isSelected={isFileSelected(mapKey)}
        isMultiSelected={multiSelectedPaths.has(mapKey)}
        isStaged={isStaged}
        canRevert={showActionButtons && status.status !== "untracked"}
        onSelect={(event) => handleSelect(mapKey, status.path, event)}
        onStage={showActionButtons ? () => handleStage(mapKey) : undefined}
        onUnstage={showActionButtons ? () => handleUnstage(mapKey) : undefined}
        onRevert={showActionButtons ? () => handleRevert(mapKey) : undefined}
        showUnseenIndicator={isFileUnseen?.(status.path)}
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

    return (
      <>
        {folders.map((folder) => (
          <NestedFolderItem
            key={folder.path}
            folder={folder}
            cwd={cwd}
            expandedFolders={expandedFolders}
            onToggleFolder={toggleFolder}
            selectedMapKey={selectedMapKey}
            multiSelectedPaths={multiSelectedPaths}
            isStaged={isStaged}
            onFileSelect={handleSelect}
            onStage={showActionButtons ? handleStage : undefined}
            onUnstage={showActionButtons ? handleUnstage : undefined}
            onRevert={showActionButtons ? handleRevert : undefined}
            isFileUnseen={isFileUnseen}
          />
        ))}
        {rootFiles
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((file) => (
            <NestedFileItem
              key={file.mapKey}
              file={file}
              cwd={cwd}
              isSelected={isFileSelected(file.mapKey)}
              isMultiSelected={multiSelectedPaths.has(file.mapKey)}
              isStaged={isStaged}
              canRevert={
                showActionButtons && file.status.status !== "untracked"
              }
              onSelect={(event) =>
                handleSelect(file.mapKey, file.path, event)
              }
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

  // Not a git repo
  if (isNotGitRepo) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <AlertCircle className="w-8 h-8 text-foreground/50 mb-2" />
        <p className="text-sm text-foreground/70">Not a git repository</p>
      </div>
    );
  }

  // Loading
  if (isLoading) {
    return (
      <div
        className="flex items-center justify-center h-full"
        data-testid="file-tree-changes-loading"
      >
        <p className="text-sm text-foreground/50">Loading...</p>
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
    </div>
  );
}
