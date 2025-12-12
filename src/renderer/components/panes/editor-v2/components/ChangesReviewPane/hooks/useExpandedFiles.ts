/**
 * useExpandedFiles Hook
 *
 * Manages expansion state for file diffs in the changes review pane.
 * Tracks which files are expanded and provides helpers for bulk operations.
 *
 * Features:
 * - Track individual file expansion state
 * - Auto-expand all files on initial load
 * - Expand/collapse all helpers
 * - Derived state (allExpanded, noneExpanded)
 *
 * @example
 * ```tsx
 * function FileList({ files }: { files: string[] }) {
 *   const {
 *     expandedFiles,
 *     toggleFile,
 *     expandAll,
 *     collapseAll,
 *     allExpanded,
 *   } = useExpandedFiles(files);
 *
 *   return (
 *     <div>
 *       <button onClick={allExpanded ? collapseAll : () => expandAll(files)}>
 *         {allExpanded ? "Collapse All" : "Expand All"}
 *       </button>
 *       {files.map(file => (
 *         <FileItem
 *           key={file}
 *           expanded={expandedFiles.has(file)}
 *           onToggle={() => toggleFile(file)}
 *         />
 *       ))}
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";

/**
 * Return type for useExpandedFiles hook.
 */
export interface UseExpandedFilesResult {
  /** Set of currently expanded file paths */
  expandedFiles: Set<string>;

  /** Toggle a single file's expansion state */
  toggleFile: (path: string) => void;

  /** Expand a single file (no-op if already expanded) */
  expandFile: (path: string) => void;

  /** Expand all specified files */
  expandAll: (files: string[]) => void;

  /** Collapse all files */
  collapseAll: () => void;

  /** Whether all files in the provided list are expanded */
  allExpanded: boolean;

  /** Whether no files are expanded */
  noneExpanded: boolean;
}

/**
 * Hook for managing file expansion state in the changes review pane.
 *
 * @param allFiles - Array of all file paths that can be expanded
 * @param autoExpandOnMount - Whether to expand all files on initial mount (default: true)
 * @returns Expansion state and control functions
 */
export function useExpandedFiles(
  allFiles: string[],
  autoExpandOnMount = true,
): UseExpandedFilesResult {
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  // Track if we've done the initial auto-expand
  const hasAutoExpandedRef = useRef(false);

  // Auto-expand all files on mount (only once)
  useEffect(() => {
    if (
      autoExpandOnMount &&
      !hasAutoExpandedRef.current &&
      allFiles.length > 0
    ) {
      hasAutoExpandedRef.current = true;
      setExpandedFiles(new Set(allFiles));
    }
  }, [allFiles, autoExpandOnMount]);

  /**
   * Toggle a single file's expansion state.
   */
  const toggleFile = useCallback((path: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  /**
   * Expand a single file (no-op if already expanded).
   */
  const expandFile = useCallback((path: string) => {
    setExpandedFiles((prev) => {
      if (prev.has(path)) return prev;
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }, []);

  /**
   * Expand all specified files.
   */
  const expandAll = useCallback((files: string[]) => {
    setExpandedFiles(new Set(files));
  }, []);

  /**
   * Collapse all files.
   */
  const collapseAll = useCallback(() => {
    setExpandedFiles(new Set());
  }, []);

  /**
   * Derived state: whether all files are expanded.
   */
  const allExpanded = useMemo(() => {
    if (allFiles.length === 0) return false;
    return allFiles.every((f) => expandedFiles.has(f));
  }, [allFiles, expandedFiles]);

  /**
   * Derived state: whether no files are expanded.
   */
  const noneExpanded = useMemo(() => {
    return expandedFiles.size === 0;
  }, [expandedFiles]);

  return {
    expandedFiles,
    toggleFile,
    expandFile,
    expandAll,
    collapseAll,
    allExpanded,
    noneExpanded,
  };
}
