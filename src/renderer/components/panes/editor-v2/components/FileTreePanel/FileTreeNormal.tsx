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
import { useFileSystemV2 } from "@/hooks/useFileSystemV2";
import { useGitV2 } from "@/hooks/useGitV2";
import { useScrollPersistence, useExpandedPaths } from "../../hooks";
import { pathsEqual, getParentPaths } from "../../utils";

import type { DirectoryEntry } from "@/../../src/ipc/fsv2/types";
import type { GitFileStatus, GitStatus } from "@/../../src/ipc/gitv2/types";
import type { FileNode } from "../../types";
import { FileTreeItem } from "./FileTreeItem";

// ============================================================================
// Types
// ============================================================================

export interface FileTreeNormalProps {
  /** Editor pane ID (for scroll persistence) */
  paneId: string;

  /** Working directory (root of the tree) */
  cwd: string;

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

// ============================================================================
// Helpers
// ============================================================================

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

// ============================================================================
// Component
// ============================================================================

/**
 * Normal file tree showing directory structure.
 */
export function FileTreeNormal({
  paneId,
  cwd,
  selectedFile,
  onFileSelect,
  onDirectoryChange,
  gitStatus: gitStatusFromParent,
}: FileTreeNormalProps) {
  // Whether parent is providing git status (we skip internal fetching)
  const hasParentStatus = gitStatusFromParent !== undefined;

  // APIs
  const fs = useFileSystemV2(cwd);
  const git = useGitV2(cwd);

  // Callback ref for scroll persistence across DOM moves
  const scrollContainerRef = useScrollPersistence(paneId, "fileTree");

  // Expanded paths state (shared hook)
  const {
    expandedPaths,
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
  // CWD Change Handler
  // ---------------------------------------------------------------------------

  const prevCwdRef = useRef(cwd);

  useEffect(() => {
    if (prevCwdRef.current !== cwd) {
      setDirectoryCache({});
      resetExpandedPaths([cwd]);
      setInternalGitStatus(null);
      prevCwdRef.current = cwd;
    }
  }, [cwd, resetExpandedPaths]);

  // ---------------------------------------------------------------------------
  // Expand to Selected File
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!selectedFile) return;
    let cancelled = false;

    const parentDirs = getParentPaths(selectedFile.path, cwd);
    if (parentDirs.length === 0) return;

    // Load directory contents, then expand
    const loadAndExpand = async () => {
      for (const dir of parentDirs) {
        if (cancelled) return;
        if (!directoryCache[dir]) {
          try {
            const entries = await fs.readDirectory(dir);
            if (cancelled) return;
            setDirectoryCache((prev) => ({ ...prev, [dir]: entries }));
          } catch {
            return;
          }
        }
      }
      if (!cancelled) {
        expandPathsToFile(selectedFile.path, cwd);
      }
    };

    loadAndExpand();
    return () => {
      cancelled = true;
    };
  }, [selectedFile, cwd, fs, directoryCache, expandPathsToFile]);

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
          setDirectoryCache((prev) => ({ ...prev, [cwd]: entries }));
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
      const cleanup = fs.onDirectoryListingChanged(path, (entries) => {
        setDirectoryCache((prev) => ({ ...prev, [path]: entries }));
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
      const isCurrentlyExpanded = expandedPaths.has(path);

      if (isCurrentlyExpanded) {
        // Collapsing: clear cache so we fetch fresh data when re-expanding
        setDirectoryCache((cache) => {
          const newCache = { ...cache };
          delete newCache[path];
          return newCache;
        });
      } else {
        // Expanding: load fresh directory contents
        fs.readDirectory(path)
          .then((entries) => {
            setDirectoryCache((cache) => ({ ...cache, [path]: entries }));
          })
          .catch((error) => {
            console.error(`Failed to load directory ${path}:`, error);
          });
      }

      toggleExpanded(path);
    },
    [fs, expandedPaths, toggleExpanded],
  );

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
      const entries = directoryCache[dirPath];
      if (!entries) return null;

      // Sort entries: directories first, then alphabetically
      const sorted = [...entries].sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "directory" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return sorted.map((entry) => {
        const entryPath = joinPath(dirPath, entry.name);
        const isExpanded = expandedPaths.has(entryPath);
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
            isExpanded={isExpanded}
            onSelect={handleSelect}
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
      expandedPaths,
      gitStatusMap,
      relativeGitStatusMap,
      selectedFile?.path,
      handleSelect,
      handleToggleExpand,
      onDirectoryChange,
      cwd,
    ],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Loading state for initial load
  if (isLoading && !directoryCache[cwd]) {
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
      className="overflow-auto h-full px-3 text-[13px] text-white/80"
      data-testid="file-tree-normal"
    >
      <ul className="space-y-0.5">{renderDirectory(cwd, 0)}</ul>
    </nav>
  );
}
