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
import { useScrollPersistence, useExpandedPaths } from "../../hooks";
import type { FileSystemV2API } from "@/api/FileSystemV2API";
import type { GitV2API } from "@/api/GitV2API";
import { pathsEqual, getParentPaths, normalizePathForKey } from "../../utils";

import type { DirectoryEntry } from "@/../../src/ipc/fsv2/types";
import type { GitFileStatus, GitStatus } from "@/../../src/ipc/gitv2/types";
import type { FileNode } from "../../types";
import { FileTreeItem } from "./FileTreeItem";

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

  /**
   * Main keyboard event handler for the tree container.
   */
  const handleTreeKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
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
      }
    },
    [
      focusedPath,
      visiblePaths,
      handleArrowRight,
      handleArrowLeft,
      handleSpaceKey,
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
   */
  const handleTreeFocus = useCallback(() => {
    if (!focusedPath && visiblePaths.length > 0) {
      // If there's a selected file, focus that; otherwise focus first item
      if (selectedFile?.path && visiblePaths.includes(selectedFile.path)) {
        setFocusedPath(selectedFile.path);
      } else {
        setFocusedPath(visiblePaths[0]);
      }
    }
  }, [focusedPath, visiblePaths, selectedFile?.path]);

  // ---------------------------------------------------------------------------
  // Focus Management & Scroll Into View
  // ---------------------------------------------------------------------------

  /**
   * When a folder is collapsed and the focused item was inside it,
   * move focus to the collapsed folder.
   */
  useEffect(() => {
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
  }, [focusedPath, visiblePaths]);

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
   * Recursively render directory contents.
   */
  const renderDirectory = useCallback(
    (dirPath: string, depth: number): React.ReactNode => {
      const entries = directoryCache[normalizePathForKey(dirPath)];
      if (!entries) return null;

      // Sort entries using shared helper (must match visiblePaths order)
      const sorted = sortEntries(entries);

      return sorted.map((entry) => {
        const entryPath = joinPath(dirPath, entry.name);
        const isExpanded = isPathExpanded(entryPath);
        const status = gitStatusMap.get(entryPath) ?? null;
        const relativePath = getRelativePath(entryPath, cwd);

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
          >
            {entry.type === "directory" &&
              isExpanded &&
              renderDirectory(entryPath, depth + 1)}
          </FileTreeItem>
        );
      });
    },
    [
      directoryCache,
      isPathExpanded,
      gitStatusMap,
      relativeGitStatusMap,
      selectedFile?.path,
      focusedPath,
      handleItemClick,
      handleToggleExpand,
      onDirectoryChange,
      cwd,
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

  // Normal mode: show directory tree
  return (
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
  );
}
