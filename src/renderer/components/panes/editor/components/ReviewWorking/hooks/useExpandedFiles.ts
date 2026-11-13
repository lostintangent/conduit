/**
 * useExpandedFiles Hook
 *
 * Manages expansion state for file diffs in the changes review pane.
 * Tracks which files are expanded, auto-expanding all files on initial load.
 *
 * @example
 * ```tsx
 * function FileList({ files }: { files: string[] }) {
 *   const { expandedFiles, toggleFile } = useExpandedFiles(files);
 *
 *   return (
 *     <div>
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

import { useState, useCallback, useEffect, useRef } from "react";

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

  /** Expand specific files (adds to existing set) */
  expandFiles: (files: string[]) => void;

  /** Collapse specific files (removes from existing set) */
  collapseFiles: (files: string[]) => void;
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
   * Expand specific files (adds to existing set, preserves others).
   */
  const expandFiles = useCallback((files: string[]) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      for (const file of files) {
        next.add(file);
      }
      return next;
    });
  }, []);

  /**
   * Collapse specific files (removes from set, preserves others).
   */
  const collapseFiles = useCallback((files: string[]) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      for (const file of files) {
        next.delete(file);
      }
      return next;
    });
  }, []);

  return {
    expandedFiles,
    toggleFile,
    expandFile,
    expandFiles,
    collapseFiles,
  };
}
