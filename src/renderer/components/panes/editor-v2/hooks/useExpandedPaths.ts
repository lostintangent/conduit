/**
 * useExpandedPaths - Hook to manage expanded directory state in file trees.
 *
 * Provides state and callbacks for tracking which directories are expanded,
 * with support for expanding to reveal specific files.
 */

import { useState, useCallback } from "react";
import { getParentPaths } from "../utils";

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

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(initialPaths),
  );

  const isExpanded = useCallback(
    (path: string) => expandedPaths.has(path),
    [expandedPaths],
  );

  const toggle = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const expand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      if (prev.has(path)) return prev;
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }, []);

  const collapse = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      if (!prev.has(path)) return prev;
      const next = new Set(prev);
      next.delete(path);
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
        if (!next.has(parent)) {
          next.add(parent);
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
            if (!next.has(parent)) {
              next.add(parent);
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
      setExpandedPaths(new Set(paths ?? initialPaths));
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
