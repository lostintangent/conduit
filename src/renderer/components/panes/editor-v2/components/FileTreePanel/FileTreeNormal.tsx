/**
 * FileTreeNormal - Normal file tree view showing directory structure.
 *
 * Displays the file system hierarchy with:
 * - Lazy loading of directory contents (load when expanded)
 * - Real-time updates via FileSystemV2 events
 * - Git status badges via GitV2 API
 * - Keyboard navigation support
 *
 * @example
 * ```tsx
 * <FileTreeNormal
 *   cwd="/project"
 *   selectedPath="/project/src/index.ts"
 *   onFileSelect={(path) => openFile(path)}
 * />
 * ```
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useFileSystemV2 } from "@/hooks/useFileSystemV2";
import { useGitV2 } from "@/hooks/useGitV2";
import type { DirectoryEntry } from "@/../../src/ipc/fsv2/types";
import type { GitFileStatus, GitStatus } from "@/../../src/ipc/gitv2/types";
import type { FileNode } from "../../types";
import { FileTreeItem } from "./FileTreeItem";

// ============================================================================
// Types
// ============================================================================

export interface FileTreeNormalProps {
  /** Working directory (root of the tree) */
  cwd: string;

  /** Currently selected file (null if none) */
  selectedFile: FileNode | null;

  /** Callback when a file is selected */
  onFileSelect: (file: FileNode) => void;

  /** Git ref for comparison (affects which files show as changed) */
  baseBranch?: string;
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
  cwd,
  selectedFile,
  onFileSelect,
  baseBranch,
}: FileTreeNormalProps) {
  // APIs
  const fs = useFileSystemV2(cwd);
  const git = useGitV2(cwd);

  // State
  const [directoryCache, setDirectoryCache] = useState<DirectoryCache>({});
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set([cwd]),
  );
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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

        // Load git status
        const status = await git.getStatus();
        if (!cancelled) {
          setGitStatus(status);
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
  }, [fs, git, cwd]);

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
  // Git Status Subscription
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const cleanup = git.onStatusChanged((event) => {
      setGitStatus(event.status);
    });

    return cleanup;
  }, [git]);

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
      setExpandedPaths((prev) => {
        const next = new Set(prev);
        if (next.has(path)) {
          next.delete(path);
        } else {
          next.add(path);

          // Load directory contents if not cached
          if (!directoryCache[path]) {
            fs.readDirectory(path)
              .then((entries) => {
                setDirectoryCache((cache) => ({ ...cache, [path]: entries }));
              })
              .catch((error) => {
                console.error(`Failed to load directory ${path}:`, error);
              });
          }
        }
        return next;
      });
    },
    [fs, directoryCache],
  );

  // ---------------------------------------------------------------------------
  // Git Status Map
  // ---------------------------------------------------------------------------

  /**
   * Map of full paths to git status for quick lookup.
   */
  const gitStatusMap = useMemo(() => {
    const map = new Map<string, GitFileStatus>();
    if (gitStatus?.files) {
      for (const [relativePath, status] of gitStatus.files) {
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

        return (
          <FileTreeItem
            key={entryPath}
            entry={entry}
            path={entryPath}
            depth={depth}
            gitStatus={status}
            isSelected={selectedFile?.path === entryPath}
            isExpanded={isExpanded}
            onSelect={handleSelect}
            onToggleExpand={handleToggleExpand}
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
      selectedFile?.path,
      handleSelect,
      handleToggleExpand,
    ],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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

  return (
    <div
      className="overflow-auto h-full text-sm"
      data-testid="file-tree-normal"
    >
      {renderDirectory(cwd, 0)}
    </div>
  );
}
