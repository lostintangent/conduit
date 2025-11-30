/**
 * FileTreeNormal - Normal file tree view showing directory structure.
 *
 * Displays the file system hierarchy with:
 * - Lazy loading of directory contents (load when expanded)
 * - Real-time updates via FileSystemV2 events
 * - Git status badges via GitV2 API
 * - Keyboard navigation support
 * - Branch comparison mode (shows only files changed from base branch)
 *
 * When `baseBranch` is provided, the tree switches to "comparison mode":
 * - Shows only files that differ from the base branch
 * - Displays a flat list instead of the full directory tree
 * - Uses `gitApi.getChangedFilesFromBranch()` for the file list
 *
 * @example
 * ```tsx
 * // Normal mode - full directory tree
 * <FileTreeNormal
 *   cwd="/project"
 *   selectedFile={selectedFile}
 *   onFileSelect={(file) => openFile(file)}
 * />
 *
 * // Comparison mode - only changed files
 * <FileTreeNormal
 *   cwd="/project"
 *   selectedFile={selectedFile}
 *   onFileSelect={(file) => openFile(file)}
 *   baseBranch="main"
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

  // Branch comparison state
  const [changedFilesFromBranch, setChangedFilesFromBranch] = useState<
    string[]
  >([]);
  const [isLoadingComparison, setIsLoadingComparison] = useState(false);

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
  // Branch Comparison Load
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Only load comparison data when baseBranch is set
    if (!baseBranch) {
      setChangedFilesFromBranch([]);
      return;
    }

    let cancelled = false;

    async function loadChangedFiles() {
      setIsLoadingComparison(true);
      try {
        const files = await git.getChangedFilesFromBranch(baseBranch);
        if (!cancelled) {
          setChangedFilesFromBranch(files);
        }
      } catch (error) {
        console.error("Failed to load changed files from branch:", error);
        if (!cancelled) {
          setChangedFilesFromBranch([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingComparison(false);
        }
      }
    }

    loadChangedFiles();

    return () => {
      cancelled = true;
    };
  }, [git, baseBranch]);

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
  // Git Status Maps
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

  /**
   * Map of relative paths to git status for folder aggregation.
   */
  const relativeGitStatusMap = useMemo(() => {
    if (!gitStatus?.files) return null;
    return gitStatus.files;
  }, [gitStatus]);

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
      relativeGitStatusMap,
      selectedFile?.path,
      handleSelect,
      handleToggleExpand,
      cwd,
    ],
  );

  // ---------------------------------------------------------------------------
  // Render Branch Comparison View
  // ---------------------------------------------------------------------------

  /**
   * Render flat list of changed files for branch comparison mode.
   * Shows only files that differ from the base branch.
   */
  const renderBranchComparison = useCallback((): React.ReactNode => {
    if (changedFilesFromBranch.length === 0) {
      return (
        <div
          className="flex items-center justify-center h-full text-muted-foreground text-sm"
          data-testid="branch-comparison-empty"
        >
          No changes from {baseBranch}
        </div>
      );
    }

    // Sort files alphabetically
    const sortedFiles = [...changedFilesFromBranch].sort((a, b) =>
      a.localeCompare(b),
    );

    return sortedFiles.map((relativePath) => {
      const fullPath = joinPath(cwd, relativePath);
      const name = relativePath.split("/").pop() ?? "";
      const status = gitStatusMap.get(fullPath) ?? null;

      // Create a synthetic DirectoryEntry for file display
      const entry: DirectoryEntry = {
        name,
        type: "file",
      };

      return (
        <FileTreeItem
          key={fullPath}
          entry={entry}
          path={fullPath}
          relativePath={relativePath}
          depth={0}
          gitStatus={status}
          gitStatusMap={relativeGitStatusMap}
          isSelected={selectedFile?.path === fullPath}
          isExpanded={false}
          onSelect={handleSelect}
          onToggleExpand={handleToggleExpand}
          // Show relative path as label for better context
          displayPath={relativePath}
        />
      );
    });
  }, [
    changedFilesFromBranch,
    baseBranch,
    cwd,
    gitStatusMap,
    relativeGitStatusMap,
    selectedFile?.path,
    handleSelect,
    handleToggleExpand,
  ]);

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

  // Loading state for branch comparison
  if (baseBranch && isLoadingComparison) {
    return (
      <div
        className="flex items-center justify-center h-full text-muted-foreground text-sm"
        data-testid="branch-comparison-loading"
      >
        Loading changes from {baseBranch}...
      </div>
    );
  }

  // Branch comparison mode: show flat list of changed files
  if (baseBranch) {
    return (
      <nav
        className="overflow-auto h-full px-3 text-[13px] text-white/80"
        data-testid="file-tree-branch-comparison"
      >
        <ul className="space-y-0.5">{renderBranchComparison()}</ul>
      </nav>
    );
  }

  // Normal mode: show directory tree
  return (
    <nav
      className="overflow-auto h-full px-3 text-[13px] text-white/80"
      data-testid="file-tree-normal"
    >
      <ul className="space-y-0.5">{renderDirectory(cwd, 0)}</ul>
    </nav>
  );
}
