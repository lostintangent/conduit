/**
 * useExpandedPaths - Hook to manage expanded directory state in file trees.
 *
 * Provides state and callbacks for tracking which directories are expanded,
 * with support for expanding to reveal specific files.
 *
 * Uses case-insensitive path comparison on macOS/Windows to handle paths
 * from different sources (CLI commands, file system API) that may have
 * different casing.
 */

import { useState, useCallback, useRef } from "react";
import { getParentPaths, normalizePathForKey } from "../utils";

export interface UseExpandedPathsOptions {
  /** Initial expanded paths (typically the root directory) */
  initialPaths?: string[];
}

export interface UseExpandedPathsResult {
  /** Set of currently expanded paths */
  expandedPaths: Set<string>;

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

  // Store normalized paths for case-insensitive comparison
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(initialPaths.map(normalizePathForKey)),
  );

  // Use a ref to hold the current expandedPaths for isExpanded.
  // This allows isExpanded to be a stable callback reference (no dependencies),
  // preventing consumers like renderDirectory from being recreated when paths change.
  const expandedPathsRef = useRef<Set<string>>(expandedPaths);
  expandedPathsRef.current = expandedPaths;

  const isExpanded = useCallback(
    (path: string) => expandedPathsRef.current.has(normalizePathForKey(path)),
    [], // Stable - reads from ref
  );

  const toggle = useCallback((path: string) => {
    const key = normalizePathForKey(path);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const expand = useCallback((path: string) => {
    const key = normalizePathForKey(path);
    setExpandedPaths((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  const collapse = useCallback((path: string) => {
    const key = normalizePathForKey(path);
    setExpandedPaths((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const expandToFile = useCallback((filePath: string, rootPath?: string) => {
    const parents = getParentPaths(filePath, rootPath);
    if (parents.length === 0) return;

    setExpandedPaths((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const parent of parents) {
        const key = normalizePathForKey(parent);
        if (!next.has(key)) {
          next.add(key);
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
        const next = new Set(prev);
        let changed = false;
        for (const filePath of filePaths) {
          for (const parent of getParentPaths(filePath, rootPath)) {
            const key = normalizePathForKey(parent);
            if (!next.has(key)) {
              next.add(key);
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
      setExpandedPaths(
        new Set((paths ?? initialPaths).map(normalizePathForKey)),
      );
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
