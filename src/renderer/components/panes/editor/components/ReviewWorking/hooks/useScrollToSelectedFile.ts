/**
 * useScrollToSelectedFile Hook
 *
 * Handles scrolling to and expanding a selected file in the changes review pane.
 * Only triggers scroll when a NEW file is selected while in review mode,
 * not when entering review mode with an existing selection.
 *
 * @example
 * ```tsx
 * const scrollContainerRef = useRef<HTMLDivElement>(null);
 *
 * useScrollToSelectedFile({
 *   selectedFilePath,
 *   scrollContainerRef,
 *   stagedFiles,
 *   unstagedFiles,
 *   expandFile,
 *   setStagedSectionExpanded,
 *   setUnstagedSectionExpanded,
 * });
 * ```
 */

import { useEffect, useRef, type RefObject } from "react";
import type { GitFileStatus } from "@features/git/model";
import { UNSTAGED_KEY_SUFFIX } from "../../../utils";

/** Delay before scrolling to allow DOM updates (ms) */
const SCROLL_DELAY_MS = 100;

export interface UseScrollToSelectedFileOptions {
  /** Currently selected file path (relative to cwd) */
  selectedFilePath: string | undefined;

  /**
   * Selected map key for distinguishing staged vs unstaged entries.
   * For partially staged files, this includes UNSTAGED_KEY_SUFFIX for unstaged entries.
   */
  selectedMapKey?: string | undefined;

  /** Ref to the scrollable container */
  scrollContainerRef: RefObject<HTMLDivElement | null>;

  /** List of staged files (tuples of [mapKey, status]) */
  stagedFiles: Array<[string, GitFileStatus]>;

  /** List of unstaged files (tuples of [mapKey, status]) */
  unstagedFiles: Array<[string, GitFileStatus]>;

  /** Function to expand a file */
  expandFile: (path: string) => void;

  /** Function to expand the staged section */
  setStagedSectionExpanded: (expanded: boolean) => void;

  /** Function to expand the unstaged section */
  setUnstagedSectionExpanded: (expanded: boolean) => void;
}

/**
 * Hook that scrolls to and expands the selected file in the changes review pane.
 *
 * Only scrolls when a NEW selection is made while in review mode.
 * Does not scroll when entering review mode with an existing selection.
 *
 * Uses selectedMapKey (when provided) to correctly match staged vs unstaged entries
 * of partially staged files. Falls back to selectedFilePath for backwards compatibility.
 */
export function useScrollToSelectedFile({
  selectedFilePath,
  selectedMapKey,
  scrollContainerRef,
  stagedFiles,
  unstagedFiles,
  expandFile,
  setStagedSectionExpanded,
  setUnstagedSectionExpanded,
}: UseScrollToSelectedFileOptions): void {
  // Track the last selected file to avoid re-scrolling on re-renders.
  // Use mapKey when available for more precise tracking.
  // Initialize to current selection so we don't auto-scroll when entering review mode.
  const lastSelectedKeyRef = useRef<string | null>(
    selectedMapKey ?? selectedFilePath ?? null,
  );

  useEffect(() => {
    // The key to use for matching - prefer mapKey for precise staged/unstaged matching
    const matchKey = selectedMapKey ?? selectedFilePath;

    // Skip if no selection or same as last selection
    if (!matchKey || matchKey === lastSelectedKeyRef.current) {
      return;
    }

    // Check if the file exists in either list using mapKey for precise matching
    // stagedFiles and unstagedFiles are tuples of [mapKey, status]
    const isInStaged = stagedFiles.some(([mapKey]) => mapKey === matchKey);
    const isInUnstaged = unstagedFiles.some(([mapKey]) => mapKey === matchKey);

    // If file not in any list yet (data still loading), skip
    if (!isInStaged && !isInUnstaged) {
      return;
    }

    // Update last selected key
    lastSelectedKeyRef.current = matchKey;

    // Expand the file's diff - expandFile uses mapKey as its identifier
    expandFile(matchKey);

    // Expand the appropriate section (staged or unstaged)
    if (isInStaged) {
      setStagedSectionExpanded(true);
    } else {
      setUnstagedSectionExpanded(true);
    }

    // Scroll to the file after a delay to allow expansion to render
    // Note: data-filepath uses the actual file path (status.path), not mapKey
    const timeoutId = setTimeout(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      // Use selectedFilePath for the DOM query since that's what's in data-filepath
      const filePathForQuery = selectedFilePath ?? matchKey;

      // For partially staged files, use data-staged attribute to distinguish entries
      // Check if the mapKey has the unstaged suffix to determine which entry to target
      // For non-partial files (no suffix), use the section the file was found in
      const hasUnstagedSuffix = selectedMapKey?.includes(UNSTAGED_KEY_SUFFIX);
      const isTargetStaged = hasUnstagedSuffix ? false : isInStaged;

      const fileElement = container.querySelector(
        `[data-filepath="${filePathForQuery}"][data-staged="${isTargetStaged}"]`,
      );
      if (fileElement) {
        fileElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, SCROLL_DELAY_MS);

    return () => clearTimeout(timeoutId);
  }, [
    selectedFilePath,
    selectedMapKey,
    scrollContainerRef,
    stagedFiles,
    unstagedFiles,
    expandFile,
    setStagedSectionExpanded,
    setUnstagedSectionExpanded,
  ]);
}
