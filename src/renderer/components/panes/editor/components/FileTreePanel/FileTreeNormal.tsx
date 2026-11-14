/**
 * FileTreeNormal - Normal file tree view showing directory structure.
 *
 * Displays the file system hierarchy with:
 * - Lazy loading of directory contents (load when expanded)
 * - Real-time updates via FileSystemSubscription events
 * - Git status badges from the parent's status map
 * - Keyboard navigation support
 *
 * @example
 * ```tsx
 * <FileTreeNormal
 *   cwd="/project"
 *   selectedFile={selectedFile}
 *   onFileSelect={(file) => openFile(file)}
 *   gitStatus={gitStatus}
 * />
 * ```
 */

import type { FileSystemSubscription } from "@features/files/client/FileSystemSubscription";
import { useSettings } from "@features/settings/client/queries";
import { cn } from "@/utils";
import { FileText, Folder } from "lucide-react";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useExpandedPaths,
  useFilePrefetch,
  useFileTreeContextMenu,
  useScrollPersistence,
} from "../../hooks";
import {
  getParentPath,
  getParentPaths,
  getRelativePath,
  normalizePathForKey,
  pathsEqual,
} from "../../utils";

import type { DirectoryEntry } from "@features/files/model";
import type { GitFileStatus } from "@features/git/model";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { enqueueNotification } from "@/store/actions/notifications";
import type { FileNode } from "../../types";
import { FileTreeItem } from "./FileTreeItem";
import { FileTreeItemRename } from "./FileTreeItemRename";

export interface FileTreeNormalProps {
  /** Editor pane ID (for scroll persistence) */
  paneId: string;

  /** Working directory (root of the tree) */
  cwd: string;

  /** FileSystem API instance (shared from parent) */
  fs: FileSystemSubscription;

  /** Currently selected file (null if none) */
  selectedFile: FileNode | null;

  /** Callback when a file is selected (mapKey is always null for normal view) */
  onFileSelect: (file: FileNode, mapKey: string | null) => void;

  /** Callback when "change to this directory" is clicked */
  onDirectoryChange?: (path: string) => void;

  /** Git status map from the parent (relative paths to status) */
  gitStatus: Map<string, GitFileStatus> | null;

  /** Callback when a file/folder is renamed - used to preserve seen status */
  onPathRename?: (oldPath: string, newPath: string) => void;
}

/**
 * Handle type for imperative methods exposed by FileTreeNormal.
 */
export interface FileTreeNormalHandle {
  /** Reveal and focus the currently selected file in the tree */
  revealActiveFile: () => void;
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
 *
 * Memoized to prevent unnecessary re-renders when parent props haven't changed.
 * This is important for performance since the file tree can contain many items.
 */
export const FileTreeNormal = memo(
  forwardRef<FileTreeNormalHandle, FileTreeNormalProps>(function FileTreeNormal(
    {
      paneId,
      cwd,
      fs,
      selectedFile,
      onFileSelect,
      onDirectoryChange,
      gitStatus,
      onPathRename,
    },
    ref,
  ) {
    // Get user settings for home directory (used for "Add to Dotfiles" context menu)
    const homeDirectory = useSettings((s) => s.homeDirectory);

    // Callback ref for scroll persistence across DOM moves
    const scrollContainerRef = useScrollPersistence(paneId, "fileTree");
    const treeRef = useRef<HTMLElement | null>(null);
    const setTreeElement = useCallback(
      (element: HTMLElement | null) => {
        treeRef.current = element;
        scrollContainerRef(element);
      },
      [scrollContainerRef],
    );

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

    // ---------------------------------------------------------------------------
    // Imperative Handle (for parent to trigger reveal)
    // ---------------------------------------------------------------------------

    useImperativeHandle(
      ref,
      () => ({
        revealActiveFile: () => {
          if (!selectedFile?.path) return;
          expandPathsToFile(selectedFile.path, cwd);
          setFocusedPath(selectedFile.path);
        },
      }),
      [selectedFile?.path, cwd, expandPathsToFile],
    );

    /**
     * Pending focus path - set after rename when the new path may not be
     * visible yet. Once the path appears in visiblePaths, it will be applied.
     */
    const [pendingFocusPath, setPendingFocusPath] = useState<string | null>(
      null,
    );

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
     * Get the full directory entry for a given path.
     * Returns null if path not found in cache.
     */
    const getEntryForPath = useCallback(
      (path: string): DirectoryEntry | null => {
        const parentPath = getParentPath(path);
        if (!parentPath) return null;

        const entries = directoryCache[normalizePathForKey(parentPath)];
        if (!entries) return null;

        const name = path.split("/").pop();
        return entries.find((e) => e.name === name) ?? null;
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

    /**
     * Ref to guard against double invocation of creation handlers.
     */
    const creationInProgressRef = useRef<string | null>(null);

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
              const entries = await window.conduit.files.readDirectory(
                cwd,
                dir,
              );
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
      // directoryCache, expandPathsToFile are read at runtime, not triggers.
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
          const entries = await window.conduit.files.readDirectory(cwd, cwd);
          if (!cancelled) {
            setDirectoryCache((prev) => ({
              ...prev,
              [normalizePathForKey(cwd)]: entries,
            }));
          }
        } catch (error) {
          console.error("Failed to load file tree:", error);
        }
        if (!cancelled) {
          setIsLoading(false);
        }
      }

      loadInitial();

      return () => {
        cancelled = true;
      };
    }, [cwd]);

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
    // Handlers
    // ---------------------------------------------------------------------------

    /**
     * Handle selection of a file or directory.
     */
    const handleSelect = useCallback(
      (path: string, type: "file" | "directory") => {
        if (type === "file") {
          const name = path.split("/").pop() ?? "";
          // Normal view always passes null for mapKey (no staged/unstaged distinction)
          onFileSelect({ path, name, type: "file" }, null);
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
          try {
            const entries = await window.conduit.files.readDirectory(cwd, path);
            setDirectoryCache((cache) => ({ ...cache, [cacheKey]: entries }));
          } catch (error) {
            console.error(`Failed to load directory ${path}:`, error);
          }
        }

        toggleExpanded(path);
      },
      [cwd, isPathExpanded, toggleExpanded],
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
        const entry = getEntryForPath(path);
        if (entry?.type !== "directory") return;

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
      [getEntryForPath, isPathExpanded, handleToggleExpand, directoryCache],
    );

    /**
     * Handle ArrowLeft key:
     * - If folder is expanded: collapse it
     * - If folder is collapsed or file: move focus to parent
     */
    const handleArrowLeft = useCallback(
      (path: string) => {
        const entry = getEntryForPath(path);

        if (entry?.type === "directory" && isPathExpanded(path)) {
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
      [getEntryForPath, isPathExpanded, handleToggleExpand, cwd],
    );

    /**
     * Handle Space key: open file or toggle folder.
     */
    const handleSpaceKey = useCallback(
      (path: string) => {
        const entry = getEntryForPath(path);
        if (entry?.type === "file") {
          const name = path.split("/").pop() ?? "";
          // Normal view always passes null for mapKey
          onFileSelect({ path, name, type: "file" }, null);
        } else if (entry?.type === "directory") {
          handleToggleExpand(path);
        }
      },
      [getEntryForPath, onFileSelect, handleToggleExpand],
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
          await window.conduit.files.rename(cwd, renamingPath, newPath);

          // Transfer seen status from old path to new path (handles folders and files)
          const oldRelative = getRelativePath(renamingPath, cwd);
          const newRelative = getRelativePath(newPath, cwd);
          onPathRename?.(oldRelative, newRelative);

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
          const itemName = renamingPath.split("/").pop() ?? "item";
          enqueueNotification({
            kind: "error",
            message: `Failed to rename "${itemName}"`,
            details: error instanceof Error ? error.message : "Unknown error",
          });
          setRenamingPath(null);
        }
      },
      [renamingPath, cwd, onPathRename],
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

          return entries.some(
            (e) => e.name.toLowerCase() === name.toLowerCase(),
          );
        };
      },
      [directoryCache],
    );

    // ---------------------------------------------------------------------------
    // New File/Folder Creation Handlers
    // ---------------------------------------------------------------------------

    /**
     * Begin creating a new file or folder in the specified directory.
     */
    const beginCreate = useCallback(
      async (parentPath: string, type: "file" | "folder") => {
        // Guard against double invocation using ref
        if (creationInProgressRef.current === parentPath) {
          return;
        }
        creationInProgressRef.current = parentPath;

        // Expand the directory if not already expanded (this also loads contents)
        if (!isPathExpanded(parentPath)) {
          await handleToggleExpand(parentPath);
        }
        setCreatingInPath(parentPath);
        setCreatingType(type);

        // Clear the guard after state updates
        setTimeout(() => {
          creationInProgressRef.current = null;
        }, 0);
      },
      [isPathExpanded, handleToggleExpand],
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
            await window.conduit.files.writeFile(
              cwd,
              newPath,
              new Uint8Array(0),
            );
          } else {
            // Create directory
            await window.conduit.files.createDirectory(cwd, newPath);
          }

          // Optimistic update: add new entry to directory cache
          const cacheKey = normalizePathForKey(creatingInPath);
          setDirectoryCache((prev) => {
            const entries = prev[cacheKey];
            if (!entries) return prev;
            const newEntry: DirectoryEntry = {
              name,
              type:
                creatingType === "file"
                  ? ("file" as const)
                  : ("directory" as const),
              isSymlink: false,
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

          // Select the newly created file (opens it in editor)
          if (creatingType === "file") {
            onFileSelect({ path: newPath, name, type: "file" }, null);
          }
        } catch (error) {
          console.error("Create failed:", error);
          const itemType = creatingType === "file" ? "file" : "folder";
          enqueueNotification({
            kind: "error",
            message: `Failed to create ${itemType}`,
            details: error instanceof Error ? error.message : "Unknown error",
          });
          setCreatingInPath(null);
          setCreatingType(null);
        }
      },
      [creatingInPath, creatingType, cwd, onFileSelect],
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
      const entry = getEntryForPath(pathToDelete);
      const isDirectory = entry?.type === "directory";

      // Compute next focus target before delete
      const nextFocus = getNextFocusAfterDelete(pathToDelete);

      try {
        // Delete with recursive option for directories
        await window.conduit.files.delete(cwd, pathToDelete, {
          recursive: isDirectory,
        });

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
        const itemName = deletingPath?.split("/").pop() ?? "item";
        enqueueNotification({
          kind: "error",
          message: `Failed to delete "${itemName}"`,
          details: error instanceof Error ? error.message : "Unknown error",
        });
        setDeletingPath(null);
      }
    }, [deletingPath, getEntryForPath, getNextFocusAfterDelete, cwd]);

    // ---------------------------------------------------------------------------
    // Context Menu Command Handlers
    // ---------------------------------------------------------------------------

    /**
     * Handle rename from context menu command.
     * Sets focus to the item and starts inline rename.
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
     * Sets focus to the item and shows delete confirmation.
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
      homeDirectory,
      onNewFile: (path) => beginCreate(path, "file"),
      onNewFolder: (path) => beginCreate(path, "folder"),
      onRename: handleRenameCommand,
      onDelete: handleDeleteCommand,
    });

    /**
     * File prefetch hook - prefetches file content on hover.
     */
    const { onFileHover, onFileHoverEnd } = useFilePrefetch({ cwd });

    /**
     * Handle right-click on a file tree item.
     */
    const handleContextMenu = useCallback(
      (path: string, e: React.MouseEvent) => {
        // Also set focus to the right-clicked item
        setFocusedPath(path);

        const entry = getEntryForPath(path);
        const isFile = entry?.type === "file";
        const isSymlink = entry?.isSymlink ?? false;

        showContextMenu(path, isFile, isSymlink, e);
      },
      [getEntryForPath, showContextMenu],
    );

    /**
     * Handle right-click on empty space in the tree (not on an item).
     * Shows context menu with New File/Folder options for the root directory.
     */
    const handleTreeContainerContextMenu = useCallback(
      (e: React.MouseEvent) => {
        // Only handle if clicking on the container itself, not on items
        // Items have their own onContextMenu handlers that stop propagation
        // This handler fires when clicking on empty space
        const target = e.target as HTMLElement;
        const isOnItem = target.closest('[role="treeitem"]');
        if (isOnItem) {
          // Let the item's context menu handler take over
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        // Clear focus since we're not clicking on an item
        setFocusedPath(null);

        // Show context menu for the root directory (cwd)
        // Pass empty path to indicate empty space click, isFile=false, isSymlink=false
        showContextMenu("", false, false, e);
      },
      [showContextMenu],
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

        // Don't handle keyboard events while creating (creation input handles them)
        if (creatingInPath) {
          if (e.key === "Escape") {
            e.preventDefault();
            cancelCreate();
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
        creatingInPath,
        handleArrowRight,
        handleArrowLeft,
        handleSpaceKey,
        beginRename,
        cancelRename,
        cancelCreate,
        handleDelete,
      ],
    );

    /**
     * Handle click on an item.
     *
     * For files: Don't set focusedPath - we derive focus from selection to avoid
     * two separate state updates (which causes double renders). The selection
     * background already highlights the active file.
     *
     * For directories: Set focusedPath since directories don't get selected.
     */
    const handleItemClick = useCallback(
      (path: string, type: "file" | "directory") => {
        if (type === "file") {
          handleSelect(path, type);
        } else {
          setFocusedPath(path);
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
          const selectedPath = selectedFile?.path;
          if (selectedPath && visiblePaths.includes(selectedPath)) {
            setFocusedPath(selectedPath);
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
          // Look only in this tree, since another pane can show the same folder
          const element = treeRef.current?.querySelector<HTMLElement>(
            `[data-path="${CSS.escape(focusedPath)}"]`,
          );

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
      const entry = focusedPath ? getEntryForPath(focusedPath) : null;
      setFocusState(focusedPath !== null, focusedPath, entry?.type ?? null);
    }, [focusedPath, getEntryForPath, setFocusState]);

    // ---------------------------------------------------------------------------
    // Git Status Maps
    // ---------------------------------------------------------------------------

    /**
     * Map of full paths to git status for quick lookup.
     */
    const gitStatusMap = useMemo(() => {
      const map = new Map<string, GitFileStatus>();
      if (gitStatus) {
        for (const [relativePath, status] of gitStatus) {
          const fullPath = joinPath(cwd, relativePath);
          map.set(fullPath, status);
        }
      }
      return map;
    }, [gitStatus, cwd]);

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
                "group flex w-full items-center gap-1.5 rounded-md px-1.5 py-px text-[13px] text-left transition",
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
    function renderDirectory(dirPath: string, depth: number): React.ReactNode {
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
        const isFileSelected = pathsEqual(selectedFile?.path, entryPath);

        return (
          <FileTreeItem
            key={entryPath}
            entry={entry}
            path={entryPath}
            relativePath={relativePath}
            depth={depth}
            gitStatus={status}
            gitStatusMap={gitStatus}
            isSelected={isFileSelected}
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
            onFileHover={onFileHover}
            onFileHoverEnd={onFileHoverEnd}
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
    }

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
      ? getEntryForPath(deletingPath)?.type === "directory"
      : false;

    // Normal mode: show directory tree
    return (
      <>
        <nav
          ref={setTreeElement}
          role="tree"
          aria-label="File tree"
          tabIndex={focusedPath ? -1 : 0}
          className="overflow-auto h-full px-3 text-[13px] text-white/80 focus:outline-none"
          data-testid="file-tree-normal"
          onKeyDown={handleTreeKeyDown}
          onFocus={handleTreeFocus}
          onContextMenu={handleTreeContainerContextMenu}
        >
          <ul role="group">{renderDirectory(cwd, 0)}</ul>
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
  }),
);
