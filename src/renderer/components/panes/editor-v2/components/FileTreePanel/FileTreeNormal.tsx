/**
 * FileTreeNormal - Normal file tree view showing directory structure.
 *
 * Displays the file system hierarchy with:
 * - Lazy loading of directory contents (load when expanded)
 * - Real-time updates via FileSystemV2 events
 * - Git status badges via GitV2 API (or from parent for branch comparison)
 * - Keyboard navigation support
 *
 * When `gitStatusFromParent` is provided, uses that for git badges instead
 * of fetching its own status. This allows the parent to control which
 * branch the badges compare against.
 *
 * @example
 * ```tsx
 * <FileTreeNormal
 *   cwd="/project"
 *   selectedFile={selectedFile}
 *   onFileSelect={(file) => openFile(file)}
 *   gitStatusFromParent={gitStatus} // Optional: for branch comparison badges
 * />
 * ```
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { FileText, Folder } from "lucide-react";
import {
  useScrollPersistence,
  useExpandedPaths,
  useFileTreeContextMenu,
} from "../../hooks";
import type { FileSystemV2API } from "@/api/FileSystemV2API";
import type { GitV2API } from "@/api/GitV2API";
import { pathsEqual, getParentPaths, normalizePathForKey } from "../../utils";
import { cn } from "@/utils";

import type { DirectoryEntry } from "@/../../src/ipc/fsv2/types";
import type { GitFileStatus, GitStatus } from "@/../../src/ipc/gitv2/types";
import type { FileNode } from "../../types";
import { FileTreeItem } from "./FileTreeItem";
import { FileTreeItemRename } from "./FileTreeItemRename";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export interface FileTreeNormalProps {
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

  /** Callback when a file is selected */
  onFileSelect: (file: FileNode) => void;

  /** Callback when "change to this directory" is clicked */
  onDirectoryChange?: (path: string) => void;

  /**
   * Git status from parent (source of truth).
   * When provided, component uses this instead of fetching its own.
   * When null/undefined, component fetches its own HEAD-based status.
   */
  gitStatus?: Map<string, GitFileStatus> | null;
}

/**
 * Internal type for tracking loaded directory contents.
 */
interface DirectoryCache {
  [path: string]: DirectoryEntry[];
}

/**
 * Join path segments correctly.
 */
function joinPath(base: string, name: string): string {
  if (base.endsWith("/")) {
    return base + name;
  }
  return base + "/" + name;
}

/**
 * Get the parent directory path.
 */
function getParentPath(filePath: string): string | null {
  const lastSlash = filePath.lastIndexOf("/");
  if (lastSlash <= 0) return null;
  return filePath.slice(0, lastSlash);
}

/**
 * Get relative path from cwd.
 */
function getRelativePath(fullPath: string, cwd: string): string {
  if (fullPath.startsWith(cwd)) {
    const relative = fullPath.slice(cwd.length);
    // Remove leading slash
    return relative.startsWith("/") ? relative.slice(1) : relative;
  }
  return fullPath;
}

/**
 * Sort directory entries: directories first, then alphabetically by name.
 * This must match the order used in renderDirectory for visiblePaths to be correct.
 */
function sortEntries(entries: DirectoryEntry[]): DirectoryEntry[] {
  return [...entries].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === "directory" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

/**
 * Normal file tree showing directory structure.
 */
export function FileTreeNormal({
  paneId,
  cwd,
  fs,
  git,
  selectedFile,
  onFileSelect,
  onDirectoryChange,
  gitStatus: gitStatusFromParent,
}: FileTreeNormalProps) {
  // Whether parent is providing git status (we skip internal fetching)
  const hasParentStatus = gitStatusFromParent !== undefined;

  // Callback ref for scroll persistence across DOM moves
  const scrollContainerRef = useScrollPersistence(paneId, "fileTree");

  // Expanded paths state (shared hook)
  const {
    expandedPaths,
    isExpanded: isPathExpanded,
    toggle: toggleExpanded,
    expandToFile: expandPathsToFile,
    reset: resetExpandedPaths,
  } = useExpandedPaths({ initialPaths: [cwd] });

  // Directory contents cache
  const [directoryCache, setDirectoryCache] = useState<DirectoryCache>({});

  // Internal git status - only used when parent doesn't provide status
  const [internalGitStatus, setInternalGitStatus] = useState<GitStatus | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);

  // ---------------------------------------------------------------------------
  // Keyboard Navigation State
  // ---------------------------------------------------------------------------

  /**
   * Currently focused path for keyboard navigation.
   * Distinct from selectedFile - focus is transient for navigation,
   * selection indicates the file open in the editor.
   */
  const [focusedPath, setFocusedPath] = useState<string | null>(null);

  /**
   * Pending focus path - set after rename when the new path may not be
   * visible yet. Once the path appears in visiblePaths, it will be applied.
   */
  const [pendingFocusPath, setPendingFocusPath] = useState<string | null>(null);

  /**
   * Paths to suppress git status for during rename transitions.
   * Includes both source and destination paths, cleared after a timeout
   * to allow git status to settle.
   */
  const [gitStatusSuppressedPaths, setGitStatusSuppressedPaths] = useState<
    Set<string>
  >(new Set());

  /**
   * Path pending deletion - when set, shows confirmation dialog.
   */
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  /**
   * Flat list of all currently visible paths in display order.
   * Used for efficient arrow key navigation.
   */
  const visiblePaths = useMemo(() => {
    const paths: string[] = [];

    function collectVisible(dirPath: string): void {
      const entries = directoryCache[normalizePathForKey(dirPath)];
      if (!entries) return;

      const sorted = sortEntries(entries);
      for (const entry of sorted) {
        const entryPath = joinPath(dirPath, entry.name);
        paths.push(entryPath);

        // Recursively collect children of expanded directories
        if (entry.type === "directory" && isPathExpanded(entryPath)) {
          collectVisible(entryPath);
        }
      }
    }

    collectVisible(cwd);
    return paths;
  }, [directoryCache, isPathExpanded, cwd]);

  /**
   * Get the entry type for a given path.
   */
  const getEntryTypeForPath = useCallback(
    (path: string): "file" | "directory" | null => {
      const parentPath = getParentPath(path);
      if (!parentPath) return null;

      const entries = directoryCache[normalizePathForKey(parentPath)];
      if (!entries) return null;

      const name = path.split("/").pop();
      const entry = entries.find((e) => e.name === name);
      return entry?.type ?? null;
    },
    [directoryCache],
  );

  // ---------------------------------------------------------------------------
  // Inline Rename State
  // ---------------------------------------------------------------------------

  /**
   * Path of the item currently being renamed, or null if not renaming.
   */
  const [renamingPath, setRenamingPath] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // New File/Folder Creation State
  // ---------------------------------------------------------------------------

  /**
   * Path of the parent directory where a new item is being created, or null.
   */
  const [creatingInPath, setCreatingInPath] = useState<string | null>(null);

  /**
   * Type of item being created: 'file' or 'folder'.
   */
  const [creatingType, setCreatingType] = useState<"file" | "folder" | null>(
    null,
  );

  // ---------------------------------------------------------------------------
  // CWD Change Handler
  // ---------------------------------------------------------------------------

  const prevCwdRef = useRef(cwd);

  // Track which file we've already expanded to, so we don't re-expand
  // when the user manually collapses a folder
  const expandedToFileRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevCwdRef.current !== cwd) {
      setDirectoryCache({});
      resetExpandedPaths([cwd]);
      setInternalGitStatus(null);
      expandedToFileRef.current = null;
      setFocusedPath(null); // Reset focus when cwd changes
      prevCwdRef.current = cwd;
    }
  }, [cwd, resetExpandedPaths]);

  // ---------------------------------------------------------------------------
  // Expand to Selected File (event-driven, not reactive)
  // ---------------------------------------------------------------------------

  // This effect should run ONLY when selectedFile changes, not when cache updates.
  // We explicitly track the last processed selection to achieve event-like behavior.
  useEffect(() => {
    const currentPath = selectedFile?.path ?? null;

    // Only process actual selection changes
    if (pathsEqual(expandedToFileRef.current, currentPath)) {
      return;
    }
    expandedToFileRef.current = currentPath;

    if (!currentPath) return;

    let cancelled = false;
    const parentDirs = getParentPaths(currentPath, cwd);
    if (parentDirs.length === 0) return;

    // Load directory contents, then expand
    const loadAndExpand = async () => {
      for (const dir of parentDirs) {
        if (cancelled) return;
        // Check cache at runtime, not as a dependency
        const cacheKey = normalizePathForKey(dir);
        if (!directoryCache[cacheKey]) {
          try {
            const entries = await fs.readDirectory(dir);
            if (cancelled) return;
            setDirectoryCache((prev) => ({ ...prev, [cacheKey]: entries }));
          } catch {
            return;
          }
        }
      }
      if (!cancelled) {
        expandPathsToFile(currentPath, cwd);
      }
    };

    loadAndExpand();
    return () => {
      cancelled = true;
    };
    // Dependencies are intentionally minimal: we want event-driven behavior
    // (run once per selection change), not reactive (run when cache updates).
    // fs, directoryCache, expandPathsToFile are read at runtime, not triggers.
  }, [selectedFile?.path, cwd]);

  // ---------------------------------------------------------------------------
  // Initial Load
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setIsLoading(true);
      try {
        // Load root directory
        const entries = await fs.readDirectory(cwd);
        if (!cancelled) {
          setDirectoryCache((prev) => ({
            ...prev,
            [normalizePathForKey(cwd)]: entries,
          }));
        }

        // Only fetch git status if parent isn't providing it
        if (!hasParentStatus) {
          await git.whenReady();
          if (cancelled) return;

          const status = await git.getStatus();
          if (!cancelled) {
            setInternalGitStatus(status);
          }
        }
      } catch (error) {
        console.error("Failed to load file tree:", error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadInitial();

    return () => {
      cancelled = true;
    };
  }, [fs, git, cwd, hasParentStatus]);

  // ---------------------------------------------------------------------------
  // Directory Change Subscription
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Subscribe to directory changes for all expanded paths
    const cleanups: (() => void)[] = [];

    for (const path of expandedPaths) {
      // path is already normalized (from useExpandedPaths), but be explicit
      const cacheKey = normalizePathForKey(path);
      const cleanup = fs.onDirectoryListingChanged(path, (entries) => {
        setDirectoryCache((prev) => ({ ...prev, [cacheKey]: entries }));
      });
      cleanups.push(cleanup);
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [fs, expandedPaths]);

  // ---------------------------------------------------------------------------
  // Git Status Subscription (only when parent doesn't provide status)
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Skip subscription if parent is providing status
    if (hasParentStatus) {
      return;
    }

    const cleanup = git.onStatusChanged((event) => {
      setInternalGitStatus(event.status);
    });

    return cleanup;
  }, [git, hasParentStatus]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle selection of a file or directory.
   */
  const handleSelect = useCallback(
    (path: string, type: "file" | "directory") => {
      if (type === "file") {
        const name = path.split("/").pop() ?? "";
        onFileSelect({ path, name, type: "file" });
      }
      // Directories can be selected too (for context menus, etc.)
      // but we don't call onFileSelect for them
    },
    [onFileSelect],
  );

  /**
   * Handle expand/collapse of a directory.
   */
  const handleToggleExpand = useCallback(
    async (path: string) => {
      const isCurrentlyExpanded = isPathExpanded(path);
      const cacheKey = normalizePathForKey(path);

      if (isCurrentlyExpanded) {
        // Collapsing: clear cache so we fetch fresh data when re-expanding
        setDirectoryCache((cache) => {
          const newCache = { ...cache };
          delete newCache[cacheKey];
          return newCache;
        });
      } else {
        // Expanding: load fresh directory contents
        fs.readDirectory(path)
          .then((entries) => {
            setDirectoryCache((cache) => ({ ...cache, [cacheKey]: entries }));
          })
          .catch((error) => {
            console.error(`Failed to load directory ${path}:`, error);
          });
      }

      toggleExpanded(path);
    },
    [fs, isPathExpanded, toggleExpanded],
  );

  // ---------------------------------------------------------------------------
  // Keyboard Navigation Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle ArrowRight key:
   * - If folder is collapsed: expand it
   * - If folder is expanded: move focus to first child
   * - If file: no-op
   */
  const handleArrowRight = useCallback(
    (path: string) => {
      const entryType = getEntryTypeForPath(path);
      if (entryType !== "directory") return;

      if (!isPathExpanded(path)) {
        // Expand the folder
        handleToggleExpand(path);
      } else {
        // Move focus to first child
        const children = directoryCache[normalizePathForKey(path)];
        if (children && children.length > 0) {
          const sorted = sortEntries(children);
          setFocusedPath(joinPath(path, sorted[0].name));
        }
      }
    },
    [getEntryTypeForPath, isPathExpanded, handleToggleExpand, directoryCache],
  );

  /**
   * Handle ArrowLeft key:
   * - If folder is expanded: collapse it
   * - If folder is collapsed or file: move focus to parent
   */
  const handleArrowLeft = useCallback(
    (path: string) => {
      const entryType = getEntryTypeForPath(path);

      if (entryType === "directory" && isPathExpanded(path)) {
        // Collapse the folder
        handleToggleExpand(path);
      } else {
        // Move focus to parent folder
        const parentPath = getParentPath(path);
        if (parentPath && !pathsEqual(parentPath, cwd)) {
          setFocusedPath(parentPath);
        }
      }
    },
    [getEntryTypeForPath, isPathExpanded, handleToggleExpand, cwd],
  );

  /**
   * Handle Space key: open file or toggle folder.
   */
  const handleSpaceKey = useCallback(
    (path: string) => {
      const entryType = getEntryTypeForPath(path);
      if (entryType === "file") {
        const name = path.split("/").pop() ?? "";
        onFileSelect({ path, name, type: "file" });
      } else if (entryType === "directory") {
        handleToggleExpand(path);
      }
    },
    [getEntryTypeForPath, onFileSelect, handleToggleExpand],
  );

  // ---------------------------------------------------------------------------
  // Inline Rename Handlers
  // ---------------------------------------------------------------------------

  /**
   * Begin renaming the item at the given path.
   */
  const beginRename = useCallback((path: string) => {
    setRenamingPath(path);
  }, []);

  /**
   * Cancel the current rename operation.
   */
  const cancelRename = useCallback(() => {
    setRenamingPath(null);
  }, []);

  /**
   * Commit a rename operation.
   * Calls the file system API to rename the file/folder.
   */
  const commitRename = useCallback(
    async (newName: string) => {
      if (!renamingPath) return;

      const parentDir = getParentPath(renamingPath);
      if (!parentDir) {
        console.error("Cannot rename: no parent directory found");
        setRenamingPath(null);
        return;
      }

      const newPath = joinPath(parentDir, newName);

      try {
        await fs.rename(renamingPath, newPath);

        // Optimistic update: update directory cache immediately so the new name
        // is visible before the file watcher triggers a refresh
        const oldName = renamingPath.split("/").pop();
        const cacheKey = normalizePathForKey(parentDir);
        setDirectoryCache((prev) => {
          const entries = prev[cacheKey];
          if (!entries || !oldName) return prev;
          return {
            ...prev,
            [cacheKey]: entries.map((entry) =>
              entry.name === oldName ? { ...entry, name: newName } : entry,
            ),
          };
        });

        // Now safe to hide the rename input - new name is already in cache
        setRenamingPath(null);
        // Suppress git status for both paths during transition
        // (prevents "deleted" flash on source and stale status on destination)
        setGitStatusSuppressedPaths(new Set([renamingPath, newPath]));
        // Clear suppression after git has time to recognize the rename
        setTimeout(() => {
          setGitStatusSuppressedPaths(new Set());
        }, 250);
        // Set pending focus - will be applied once path appears in visiblePaths
        setPendingFocusPath(newPath);
      } catch (error) {
        console.error("Rename failed:", error);
        // TODO: Show error notification
        setRenamingPath(null);
      }
    },
    [renamingPath, fs],
  );

  /**
   * Check if a name conflicts with existing siblings.
   * Returns a function that can be passed to FileTreeItemRename.
   */
  const createNameConflictChecker = useCallback(
    (path: string): ((name: string) => boolean) => {
      return (name: string): boolean => {
        const parentDir = getParentPath(path);
        if (!parentDir) return false;

        const entries = directoryCache[normalizePathForKey(parentDir)];
        if (!entries) return false;

        const currentName = path.split("/").pop();
        // Check if any sibling (other than current item) has this name
        return entries.some(
          (e) =>
            e.name.toLowerCase() === name.toLowerCase() &&
            e.name !== currentName,
        );
      };
    },
    [directoryCache],
  );

  /**
   * Check if a name conflicts with existing items in a directory.
   * Used for new file/folder creation.
   */
  const createNewItemConflictChecker = useCallback(
    (parentPath: string): ((name: string) => boolean) => {
      return (name: string): boolean => {
        const entries = directoryCache[normalizePathForKey(parentPath)];
        if (!entries) return false;

        return entries.some((e) => e.name.toLowerCase() === name.toLowerCase());
      };
    },
    [directoryCache],
  );

  // ---------------------------------------------------------------------------
  // New File/Folder Creation Handlers
  // ---------------------------------------------------------------------------

  /**
   * Begin creating a new file in the specified directory.
   */
  const beginCreateFile = useCallback(
    (parentPath: string) => {
      // Expand the directory if not already expanded
      if (!isPathExpanded(parentPath)) {
        toggleExpanded(parentPath);
      }
      setCreatingInPath(parentPath);
      setCreatingType("file");
    },
    [isPathExpanded, toggleExpanded],
  );

  /**
   * Begin creating a new folder in the specified directory.
   */
  const beginCreateFolder = useCallback(
    (parentPath: string) => {
      // Expand the directory if not already expanded
      if (!isPathExpanded(parentPath)) {
        toggleExpanded(parentPath);
      }
      setCreatingInPath(parentPath);
      setCreatingType("folder");
    },
    [isPathExpanded, toggleExpanded],
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

      const newPath = joinPath(creatingInPath, name);

      try {
        if (creatingType === "file") {
          // Create empty file
          await fs.writeFile(newPath, new Uint8Array(0));
        } else {
          // Create directory
          await fs.createDirectory(newPath);
        }

        // Optimistic update: add new entry to directory cache
        const cacheKey = normalizePathForKey(creatingInPath);
        setDirectoryCache((prev) => {
          const entries = prev[cacheKey];
          if (!entries) return prev;
          const newEntry = {
            name,
            type:
              creatingType === "file"
                ? ("file" as const)
                : ("directory" as const),
          };
          return {
            ...prev,
            [cacheKey]: [...entries, newEntry],
          };
        });

        // Clear creation state
        setCreatingInPath(null);
        setCreatingType(null);

        // Set pending focus to the new item
        setPendingFocusPath(newPath);
      } catch (error) {
        console.error("Create failed:", error);
        // TODO: Show error notification
        setCreatingInPath(null);
        setCreatingType(null);
      }
    },
    [creatingInPath, creatingType, fs],
  );

  // ---------------------------------------------------------------------------
  // Delete Handlers
  // ---------------------------------------------------------------------------

  /**
   * Initiate delete - shows confirmation dialog.
   */
  const handleDelete = useCallback((path: string) => {
    setDeletingPath(path);
  }, []);

  /**
   * Cancel the delete operation.
   */
  const cancelDelete = useCallback(() => {
    setDeletingPath(null);
  }, []);

  /**
   * Compute the next focus target after deleting a path.
   * Priority: next sibling > previous sibling > parent
   */
  const getNextFocusAfterDelete = useCallback(
    (deletedPath: string): string | null => {
      const index = visiblePaths.indexOf(deletedPath);
      if (index === -1) return null;

      // Try next sibling (next item in visible list)
      if (index < visiblePaths.length - 1) {
        return visiblePaths[index + 1];
      }

      // Try previous sibling
      if (index > 0) {
        return visiblePaths[index - 1];
      }

      // Fall back to parent
      const parentPath = getParentPath(deletedPath);
      if (parentPath && !pathsEqual(parentPath, cwd)) {
        return parentPath;
      }

      return null;
    },
    [visiblePaths, cwd],
  );

  /**
   * Confirm and execute the delete operation.
   */
  const confirmDelete = useCallback(async () => {
    if (!deletingPath) return;

    const pathToDelete = deletingPath;
    const entryType = getEntryTypeForPath(pathToDelete);
    const isDirectory = entryType === "directory";

    // Compute next focus target before delete
    const nextFocus = getNextFocusAfterDelete(pathToDelete);

    try {
      // Delete with recursive option for directories
      await fs.delete(pathToDelete, { recursive: isDirectory });

      // Optimistic update: remove from cache immediately
      const parentDir = getParentPath(pathToDelete);
      const fileName = pathToDelete.split("/").pop();
      if (parentDir && fileName) {
        const cacheKey = normalizePathForKey(parentDir);
        setDirectoryCache((prev) => {
          const entries = prev[cacheKey];
          if (!entries) return prev;
          return {
            ...prev,
            [cacheKey]: entries.filter((entry) => entry.name !== fileName),
          };
        });
      }

      // Clear deleting state
      setDeletingPath(null);

      // Move focus to next item
      if (nextFocus) {
        setFocusedPath(nextFocus);
      } else {
        setFocusedPath(null);
      }
    } catch (error) {
      console.error("Delete failed:", error);
      // TODO: Show error notification
      setDeletingPath(null);
    }
  }, [deletingPath, getEntryTypeForPath, getNextFocusAfterDelete, fs]);

  // ---------------------------------------------------------------------------
  // Context Menu (via command system)
  // ---------------------------------------------------------------------------

  /**
   * Handle new file from context menu command.
   */
  const handleNewFileCommand = useCallback(
    (parentPath: string) => {
      beginCreateFile(parentPath);
    },
    [beginCreateFile],
  );

  /**
   * Handle new folder from context menu command.
   */
  const handleNewFolderCommand = useCallback(
    (parentPath: string) => {
      beginCreateFolder(parentPath);
    },
    [beginCreateFolder],
  );

  /**
   * Handle rename from context menu command.
   */
  const handleRenameCommand = useCallback(
    (path: string) => {
      setFocusedPath(path);
      beginRename(path);
    },
    [beginRename],
  );

  /**
   * Handle delete from context menu command.
   */
  const handleDeleteCommand = useCallback(
    (path: string) => {
      setFocusedPath(path);
      handleDelete(path);
    },
    [handleDelete],
  );

  /**
   * Context menu hook - integrates with command system.
   */
  const { showContextMenu, setFocusState } = useFileTreeContextMenu({
    cwd,
    onNewFile: handleNewFileCommand,
    onNewFolder: handleNewFolderCommand,
    onRename: handleRenameCommand,
    onDelete: handleDeleteCommand,
  });

  /**
   * Handle right-click on a file tree item.
   */
  const handleContextMenu = useCallback(
    (path: string, e: React.MouseEvent) => {
      // Also set focus to the right-clicked item
      setFocusedPath(path);

      const entryType = getEntryTypeForPath(path);
      const isFile = entryType === "file";

      showContextMenu(path, isFile, e);
    },
    [getEntryTypeForPath, showContextMenu],
  );

  /**
   * Main keyboard event handler for the tree container.
   */
  const handleTreeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Don't handle keyboard events while renaming (rename input handles them)
      if (renamingPath) {
        // But allow Escape to bubble up to cancel rename if needed
        if (e.key === "Escape") {
          e.preventDefault();
          cancelRename();
        }
        return;
      }

      // If no focus, set focus to first item on any navigation key
      if (!focusedPath) {
        if (
          [
            "ArrowUp",
            "ArrowDown",
            "ArrowLeft",
            "ArrowRight",
            "Home",
            "End",
          ].includes(e.key)
        ) {
          e.preventDefault();
          if (visiblePaths.length > 0) {
            setFocusedPath(visiblePaths[0]);
          }
        }
        return;
      }

      const currentIndex = visiblePaths.indexOf(focusedPath);
      if (currentIndex === -1) {
        // Focused path no longer visible, reset to first
        if (visiblePaths.length > 0) {
          setFocusedPath(visiblePaths[0]);
        }
        return;
      }

      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          if (currentIndex > 0) {
            setFocusedPath(visiblePaths[currentIndex - 1]);
          }
          break;

        case "ArrowDown":
          e.preventDefault();
          if (currentIndex < visiblePaths.length - 1) {
            setFocusedPath(visiblePaths[currentIndex + 1]);
          }
          break;

        case "ArrowRight":
          e.preventDefault();
          handleArrowRight(focusedPath);
          break;

        case "ArrowLeft":
          e.preventDefault();
          handleArrowLeft(focusedPath);
          break;

        case "Home":
          e.preventDefault();
          if (visiblePaths.length > 0) {
            setFocusedPath(visiblePaths[0]);
          }
          break;

        case "End":
          e.preventDefault();
          if (visiblePaths.length > 0) {
            setFocusedPath(visiblePaths[visiblePaths.length - 1]);
          }
          break;

        case " ": // Space
          e.preventDefault();
          handleSpaceKey(focusedPath);
          break;

        case "Enter":
          e.preventDefault();
          beginRename(focusedPath);
          break;

        case "Escape":
          e.preventDefault();
          // Clear focus (like VS Code behavior)
          setFocusedPath(null);
          break;

        case "Delete":
        case "Backspace":
          e.preventDefault();
          handleDelete(focusedPath);
          break;
      }
    },
    [
      focusedPath,
      visiblePaths,
      renamingPath,
      handleArrowRight,
      handleArrowLeft,
      handleSpaceKey,
      beginRename,
      cancelRename,
      handleDelete,
    ],
  );

  /**
   * Handle click on an item - also sets focus.
   */
  const handleItemClick = useCallback(
    (path: string, type: "file" | "directory") => {
      setFocusedPath(path);
      if (type === "file") {
        handleSelect(path, type);
      }
      // For directories, the click handler in FileTreeItem calls onToggleExpand
    },
    [handleSelect],
  );

  /**
   * Handle focus entering the tree container.
   * Sets focus to the first item if nothing is focused.
   * Only triggers when tabbing INTO the tree, not when clicking items within it.
   */
  const handleTreeFocus = useCallback(
    (e: React.FocusEvent) => {
      // Only handle focus when the container itself receives focus (Tab key),
      // not when focus bubbles up from clicking a child item
      if (e.target !== e.currentTarget) {
        return;
      }

      if (!focusedPath && visiblePaths.length > 0) {
        // If there's a selected file, focus that; otherwise focus first item
        if (selectedFile?.path && visiblePaths.includes(selectedFile.path)) {
          setFocusedPath(selectedFile.path);
        } else {
          setFocusedPath(visiblePaths[0]);
        }
      }
    },
    [focusedPath, visiblePaths, selectedFile?.path],
  );

  // ---------------------------------------------------------------------------
  // Focus Management & Scroll Into View
  // ---------------------------------------------------------------------------

  /**
   * Apply pending focus when the path becomes visible.
   * This handles the race condition after rename where the new path
   * isn't immediately in visiblePaths.
   */
  useEffect(() => {
    if (pendingFocusPath && visiblePaths.includes(pendingFocusPath)) {
      setFocusedPath(pendingFocusPath);
      setPendingFocusPath(null);
      // Note: gitStatusSuppressedPaths is cleared via timeout, not here,
      // to allow git status time to settle after the tree updates
    }
  }, [pendingFocusPath, visiblePaths]);

  /**
   * When a folder is collapsed and the focused item was inside it,
   * move focus to the collapsed folder.
   *
   * Skip this logic if we're waiting for a pending focus (e.g., after rename)
   * since the new path may not be visible yet.
   */
  useEffect(() => {
    // Don't "fix" focus if we're waiting for a pending path to appear
    if (pendingFocusPath) return;

    if (focusedPath && !visiblePaths.includes(focusedPath)) {
      // Focused path is no longer visible - find nearest visible parent
      let parentPath = getParentPath(focusedPath);
      while (parentPath) {
        if (visiblePaths.includes(parentPath)) {
          setFocusedPath(parentPath);
          return;
        }
        parentPath = getParentPath(parentPath);
      }
      // No parent found, focus first item
      if (visiblePaths.length > 0) {
        setFocusedPath(visiblePaths[0]);
      } else {
        setFocusedPath(null);
      }
    }
  }, [focusedPath, visiblePaths, pendingFocusPath]);

  /**
   * When focusedPath changes:
   * 1. Focus the DOM element (for roving tabindex)
   * 2. Scroll it into view
   */
  useEffect(() => {
    if (focusedPath) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        const element = document.querySelector(
          `[data-path="${CSS.escape(focusedPath)}"]`,
        ) as HTMLElement | null;

        if (element) {
          // Focus the element for keyboard navigation
          element.focus({ preventScroll: true });
          // Scroll into view after focusing
          element.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      });
    }
  }, [focusedPath]);

  /**
   * Sync focus state with context keys for command system.
   * This enables keybindings and context menu commands to work correctly.
   */
  useEffect(() => {
    const entryType = focusedPath ? getEntryTypeForPath(focusedPath) : null;
    setFocusState(focusedPath !== null, focusedPath, entryType);
  }, [focusedPath, getEntryTypeForPath, setFocusState]);

  // ---------------------------------------------------------------------------
  // Git Status Maps
  // ---------------------------------------------------------------------------

  // Use parent's gitStatus when provided, otherwise use internal status
  const effectiveGitStatusFiles =
    gitStatusFromParent ?? internalGitStatus?.files ?? null;

  /**
   * Map of full paths to git status for quick lookup.
   */
  const gitStatusMap = useMemo(() => {
    const map = new Map<string, GitFileStatus>();
    if (effectiveGitStatusFiles) {
      for (const [relativePath, status] of effectiveGitStatusFiles) {
        const fullPath = joinPath(cwd, relativePath);
        map.set(fullPath, status);
      }
    }
    return map;
  }, [effectiveGitStatusFiles, cwd]);

  /**
   * Map of relative paths to git status for folder aggregation.
   */
  const relativeGitStatusMap = useMemo(() => {
    return effectiveGitStatusFiles;
  }, [effectiveGitStatusFiles]);

  // ---------------------------------------------------------------------------
  // Render Tree
  // ---------------------------------------------------------------------------

  /**
   * Render placeholder for new file/folder creation.
   * Matches the structure of FileTreeItem for consistent styling.
   */
  const renderCreationPlaceholder = useCallback(
    (parentPath: string): React.ReactNode => {
      if (!creatingInPath || !creatingType || creatingInPath !== parentPath) {
        return null;
      }

      const isDirectory = creatingType === "folder";
      const Icon = isDirectory ? Folder : FileText;

      return (
        <li key="__creating__" role="treeitem">
          <div
            className={cn(
              "group flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[13px] text-left transition",
              "ring-1 ring-accent/60", // Always show focus ring for creation input
            )}
          >
            {/* Spacer to align with files (matches FileTreeItem file spacer) */}
            <div style={{ width: 12 }} />

            {/* Icon */}
            <Icon className="flex-shrink-0 text-foreground" size={12} />

            {/* Inline input */}
            <FileTreeItemRename
              initialName=""
              isDirectory={isDirectory}
              onCommit={commitCreate}
              onCancel={cancelCreate}
              checkNameConflict={createNewItemConflictChecker(parentPath)}
            />
          </div>
        </li>
      );
    },
    [
      creatingInPath,
      creatingType,
      commitCreate,
      cancelCreate,
      createNewItemConflictChecker,
    ],
  );

  /**
   * Recursively render directory contents.
   */
  const renderDirectory = useCallback(
    (dirPath: string, depth: number): React.ReactNode => {
      const entries = directoryCache[normalizePathForKey(dirPath)];
      if (!entries) return null;

      // Sort entries using shared helper (must match visiblePaths order)
      const sorted = sortEntries(entries);

      // Check if we're creating a new item in this directory
      const isCreatingHere = creatingInPath === dirPath;
      const creationPlaceholder = renderCreationPlaceholder(dirPath);

      // Find index where files start (after all directories)
      const firstFileIndex = sorted.findIndex((e) => e.type === "file");
      const fileStartIndex =
        firstFileIndex === -1 ? sorted.length : firstFileIndex;

      // Determine where to insert placeholder:
      // - New folder: at the start (index 0)
      // - New file: after all folders (at fileStartIndex)
      const placeholderIndex =
        isCreatingHere && creatingType === "file" ? fileStartIndex : 0;

      const renderItem = (entry: DirectoryEntry) => {
        const entryPath = joinPath(dirPath, entry.name);
        const isExpanded = isPathExpanded(entryPath);
        // Suppress git status for paths involved in a recent rename
        // (cleared via timeout after git has time to settle)
        const status = gitStatusSuppressedPaths.has(entryPath)
          ? null
          : (gitStatusMap.get(entryPath) ?? null);
        const relativePath = getRelativePath(entryPath, cwd);

        const isItemRenaming = pathsEqual(renamingPath, entryPath);

        return (
          <FileTreeItem
            key={entryPath}
            entry={entry}
            path={entryPath}
            relativePath={relativePath}
            depth={depth}
            gitStatus={status}
            gitStatusMap={relativeGitStatusMap}
            isSelected={pathsEqual(selectedFile?.path, entryPath)}
            isFocused={pathsEqual(focusedPath, entryPath)}
            isExpanded={isExpanded}
            onSelect={handleItemClick}
            onToggleExpand={handleToggleExpand}
            onDirectoryChange={onDirectoryChange}
            // Inline rename props
            isRenaming={isItemRenaming}
            onRenameCommit={isItemRenaming ? commitRename : undefined}
            onRenameCancel={isItemRenaming ? cancelRename : undefined}
            checkNameConflict={
              isItemRenaming ? createNameConflictChecker(entryPath) : undefined
            }
            onContextMenu={handleContextMenu}
          >
            {entry.type === "directory" &&
              isExpanded &&
              renderDirectory(entryPath, depth + 1)}
          </FileTreeItem>
        );
      };

      return (
        <>
          {/* Render items before placeholder position */}
          {sorted.slice(0, placeholderIndex).map(renderItem)}
          {/* Show creation placeholder at the appropriate position */}
          {creationPlaceholder}
          {/* Render items after placeholder position */}
          {sorted.slice(placeholderIndex).map(renderItem)}
        </>
      );
    },
    [
      directoryCache,
      isPathExpanded,
      gitStatusMap,
      gitStatusSuppressedPaths,
      relativeGitStatusMap,
      selectedFile?.path,
      focusedPath,
      renamingPath,
      handleItemClick,
      handleToggleExpand,
      onDirectoryChange,
      commitRename,
      cancelRename,
      createNameConflictChecker,
      handleContextMenu,
      cwd,
      renderCreationPlaceholder,
      creatingInPath,
      creatingType,
    ],
  );

  // Loading state for initial load
  if (isLoading && !directoryCache[normalizePathForKey(cwd)]) {
    return (
      <div
        className="flex items-center justify-center h-full text-muted-foreground text-sm"
        data-testid="file-tree-loading"
      >
        Loading...
      </div>
    );
  }

  // Compute delete dialog message
  const deletingName = deletingPath?.split("/").pop() ?? "";
  const deletingIsDirectory = deletingPath
    ? getEntryTypeForPath(deletingPath) === "directory"
    : false;

  // Normal mode: show directory tree
  return (
    <>
      <nav
        ref={scrollContainerRef}
        role="tree"
        aria-label="File tree"
        tabIndex={focusedPath ? -1 : 0}
        className="overflow-auto h-full px-3 text-[13px] text-white/80 focus:outline-none"
        data-testid="file-tree-normal"
        onKeyDown={handleTreeKeyDown}
        onFocus={handleTreeFocus}
      >
        <ul role="group" className="space-y-0.5">
          {renderDirectory(cwd, 0)}
        </ul>
      </nav>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={deletingPath !== null}
        title={deletingIsDirectory ? "Delete Folder" : "Delete File"}
        description={
          deletingIsDirectory
            ? `Are you sure you want to delete "${deletingName}" and all its contents? This action cannot be undone.`
            : `Are you sure you want to delete "${deletingName}"? This action cannot be undone.`
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
        variant="destructive"
      />
    </>
  );
}
