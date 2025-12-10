/**
 * Multi-select hook for tree views.
 *
 * Provides VS Code-style multi-selection with:
 * - Regular click: Select single item
 * - Shift+click: Range selection
 * - Cmd/Ctrl+click: Toggle selection
 *
 * Works with both files and folders, expanding folder selections
 * to their contained files when performing actions.
 */

import { useState, useCallback } from "react";
import type { SelectableItem } from "../utils/types";
import { expandFoldersToFiles } from "../utils/treeHelpers";

export interface UseMultiSelectResult {
  /** Set of currently selected paths (may include folder paths) */
  selectedPaths: Set<string>;
  /** The anchor path for shift-click range selection */
  anchorPath: string | null;
  /** Handle item click with modifier key support */
  handleItemClick: (path: string, event: React.MouseEvent) => void;
  /** Clear all selections */
  clearSelection: () => void;
  /** Check if a path is selected */
  isSelected: (path: string) => boolean;
  /** Get array of selected paths (may include folders) */
  getSelectedPaths: () => string[];
  /** Get array of file paths, expanding any selected folders */
  getSelectedFilePaths: () => string[];
}

/**
 * Hook to manage multi-select state for files and folders.
 *
 * @param visualOrder - Items in visual display order (determines shift-click ranges)
 * @param allFilePaths - All file paths (for expanding folders to files)
 * @returns Multi-select state and handlers
 *
 * @example
 * ```tsx
 * const {
 *   selectedPaths,
 *   handleItemClick,
 *   clearSelection,
 *   isSelected,
 *   getSelectedFilePaths,
 * } = useMultiSelect(visualOrder, allFilePaths);
 *
 * // In click handler:
 * onClick={(e) => handleItemClick(item.path, e)}
 *
 * // When performing actions:
 * const filesToStage = getSelectedFilePaths();
 * await git.stage(filesToStage);
 * clearSelection();
 * ```
 */
export function useMultiSelect(
  visualOrder: SelectableItem[],
  allFilePaths: string[],
): UseMultiSelectResult {
  // Set of currently selected paths (can include folder paths)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(
    () => new Set(),
  );
  // Anchor path for shift-click range selection
  const [anchorPath, setAnchorPath] = useState<string | null>(null);

  /**
   * Handle item click with modifier key support.
   * - Regular click: Select only this item
   * - Shift-click: Select range from anchor to this item
   * - Cmd/Ctrl-click: Toggle this item's selection
   */
  const handleItemClick = useCallback(
    (path: string, event: React.MouseEvent) => {
      const isShiftKey = event.shiftKey;
      const isMetaKey = event.metaKey || event.ctrlKey;

      if (isShiftKey && anchorPath) {
        // Shift-click: select range from anchor to current in visual order
        const anchorIndex = visualOrder.findIndex(
          (item) => item.path === anchorPath,
        );
        const currentIndex = visualOrder.findIndex(
          (item) => item.path === path,
        );

        if (anchorIndex !== -1 && currentIndex !== -1) {
          const start = Math.min(anchorIndex, currentIndex);
          const end = Math.max(anchorIndex, currentIndex);
          const rangePaths = visualOrder
            .slice(start, end + 1)
            .map((item) => item.path);

          setSelectedPaths(new Set(rangePaths));
        }
      } else if (isMetaKey) {
        // Cmd/Ctrl-click: toggle selection
        setSelectedPaths((prev) => {
          const next = new Set(prev);
          if (next.has(path)) {
            next.delete(path);
          } else {
            next.add(path);
          }
          return next;
        });
        // Update anchor to current item
        setAnchorPath(path);
      } else {
        // Regular click: select only this item
        setSelectedPaths(new Set([path]));
        setAnchorPath(path);
      }
    },
    [visualOrder, anchorPath],
  );

  /**
   * Clear all selections.
   */
  const clearSelection = useCallback(() => {
    setSelectedPaths(new Set());
    setAnchorPath(null);
  }, []);

  /**
   * Check if a path is selected.
   */
  const isSelected = useCallback(
    (path: string) => selectedPaths.has(path),
    [selectedPaths],
  );

  /**
   * Get array of selected paths (may include folders).
   */
  const getSelectedPaths = useCallback(
    () => Array.from(selectedPaths),
    [selectedPaths],
  );

  /**
   * Get array of file paths, expanding any selected folders to their files.
   */
  const getSelectedFilePaths = useCallback(
    () => expandFoldersToFiles(selectedPaths, allFilePaths),
    [selectedPaths, allFilePaths],
  );

  return {
    selectedPaths,
    anchorPath,
    handleItemClick,
    clearSelection,
    isSelected,
    getSelectedPaths,
    getSelectedFilePaths,
  };
}
