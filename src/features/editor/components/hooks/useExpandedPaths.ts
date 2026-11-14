/**
 * useExpandedPaths - Hook to manage expanded directory state in file trees.
 *
 * Provides state and callbacks for tracking which directories are expanded,
 * with support for expanding to reveal specific files.
 *
 * Uses case-insensitive path comparison on macOS/Windows to handle paths
 * from different sources (CLI commands, file system API) that may have
 * different casing. Each path keeps the casing it was expanded with, which
 * is what its folder is read by.
 */

import { useState, useCallback, useRef } from "react";
import { getParentPaths, normalizePathForKey } from "../utils/pathUtils";

export interface UseExpandedPathsOptions {
  /** Initial expanded paths (typically the root directory) */
  initialPaths?: string[];
}

/** Expanded paths, by normalized path */
type ExpandedPaths = ReadonlyMap<string, string>;

export interface UseExpandedPathsResult {
  /** Currently expanded paths, by normalized path */
  expandedPaths: ExpandedPaths;

  /** Check if a path is expanded */
  isExpanded: (path: string) => boolean;

  /** Toggle a path's expanded state */
  toggle: (path: string) => void;

  /** Expand a specific path (without toggling) */
  expand: (path: string) => void;

  /** Collapse a specific path (without toggling) */
  collapse: (path: string) => void;

  /** Expand all parent directories to reveal a file */
  expandToFile: (filePath: string, rootPath?: string) => void;

  /** Expand parents for multiple files */
  expandToFiles: (filePaths: string[], rootPath?: string) => void;

  /** Reset to initial state */
  reset: (paths?: string[]) => void;
}

function byKey(paths: string[]): ExpandedPaths {
  return new Map(paths.map((path) => [normalizePathForKey(path), path]));
}

/**
 * Hook to manage expanded directory paths in a file tree.
 *
 * @example
 * ```tsx
 * const { expandedPaths, toggle, expandToFile } = useExpandedPaths({
 *   initialPaths: [cwd]
 * });
 *
 * // When user clicks a directory chevron
 * <button onClick={() => toggle(dirPath)}>Toggle</button>
 *
 * // When a file is selected programmatically
 * useEffect(() => {
 *   if (selectedFile) expandToFile(selectedFile.path, cwd);
 * }, [selectedFile]);
 * ```
 */
export function useExpandedPaths(
  options: UseExpandedPathsOptions = {},
): UseExpandedPathsResult {
  const { initialPaths = [] } = options;

  const [expandedPaths, setExpandedPaths] = useState<ExpandedPaths>(() =>
    byKey(initialPaths),
  );

  // Use a ref to hold the current expandedPaths for isExpanded.
  // This allows isExpanded to be a stable callback reference (no dependencies),
  // preventing consumers like renderDirectory from being recreated when paths change.
  const expandedPathsRef = useRef(expandedPaths);
  expandedPathsRef.current = expandedPaths;

  const isExpanded = useCallback(
    (path: string) => expandedPathsRef.current.has(normalizePathForKey(path)),
    [], // Stable - reads from ref
  );

  const toggle = useCallback((path: string) => {
    const key = normalizePathForKey(path);
    setExpandedPaths((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, path);
      }
      return next;
    });
  }, []);

  const expand = useCallback((path: string) => {
    const key = normalizePathForKey(path);
    setExpandedPaths((prev) => {
      if (prev.has(key)) return prev;
      const next = new Map(prev);
      next.set(key, path);
      return next;
    });
  }, []);

  const collapse = useCallback((path: string) => {
    const key = normalizePathForKey(path);
    setExpandedPaths((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const expandToFile = useCallback((filePath: string, rootPath?: string) => {
    const parents = getParentPaths(filePath, rootPath);
    if (parents.length === 0) return;

    setExpandedPaths((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const parent of parents) {
        const key = normalizePathForKey(parent);
        if (!next.has(key)) {
          next.set(key, parent);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const expandToFiles = useCallback(
    (filePaths: string[], rootPath?: string) => {
      if (filePaths.length === 0) return;

      setExpandedPaths((prev) => {
        const next = new Map(prev);
        let changed = false;
        for (const filePath of filePaths) {
          for (const parent of getParentPaths(filePath, rootPath)) {
            const key = normalizePathForKey(parent);
            if (!next.has(key)) {
              next.set(key, parent);
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    },
    [],
  );

  const reset = useCallback(
    (paths?: string[]) => {
      setExpandedPaths(byKey(paths ?? initialPaths));
    },
    [initialPaths],
  );

  return {
    expandedPaths,
    isExpanded,
    toggle,
    expand,
    collapse,
    expandToFile,
    expandToFiles,
    reset,
  };
}
