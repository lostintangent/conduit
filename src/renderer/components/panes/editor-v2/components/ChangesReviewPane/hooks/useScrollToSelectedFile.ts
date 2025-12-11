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
import type { GitFileStatus } from "@/../../src/ipc/gitv2/types";

/** Delay before scrolling to allow DOM updates (ms) */
const SCROLL_DELAY_MS = 100;

export interface UseScrollToSelectedFileOptions {
  /** Currently selected file path (relative to cwd) */
  selectedFilePath: string | undefined;

  /** Ref to the scrollable container */
  scrollContainerRef: RefObject<HTMLDivElement | null>;

  /** List of staged files */
  stagedFiles: Array<[string, GitFileStatus]>;

  /** List of unstaged files */
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
 */
export function useScrollToSelectedFile({
  selectedFilePath,
  scrollContainerRef,
  stagedFiles,
  unstagedFiles,
  expandFile,
  setStagedSectionExpanded,
  setUnstagedSectionExpanded,
}: UseScrollToSelectedFileOptions): void {
  // Track the last selected file to avoid re-scrolling on re-renders.
  // Initialize to current selection so we don't auto-scroll when entering review mode.
  const lastSelectedFileRef = useRef<string | null>(selectedFilePath ?? null);

  useEffect(() => {
    // Skip if no selection or same as last selection
    if (!selectedFilePath || selectedFilePath === lastSelectedFileRef.current) {
      return;
    }

    // Check if the file exists in either list
    const isInStaged = stagedFiles.some(([path]) => path === selectedFilePath);
    const isInUnstaged = unstagedFiles.some(
      ([path]) => path === selectedFilePath,
    );

    // If file not in any list yet (data still loading), skip
    if (!isInStaged && !isInUnstaged) {
      return;
    }

    // Update last selected file
    lastSelectedFileRef.current = selectedFilePath;

    // Expand the file's diff
    expandFile(selectedFilePath);

    // Expand the appropriate section (staged or unstaged)
    if (isInStaged) {
      setStagedSectionExpanded(true);
    } else {
      setUnstagedSectionExpanded(true);
    }

    // Scroll to the file after a delay to allow expansion to render
    const timeoutId = setTimeout(() => {
      const container = scrollContainerRef.current;
      if (!container) return;

      const fileElement = container.querySelector(
        `[data-filepath="${selectedFilePath}"]`,
      );
      if (fileElement) {
        fileElement.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, SCROLL_DELAY_MS);

    return () => clearTimeout(timeoutId);
  }, [
    selectedFilePath,
    scrollContainerRef,
    stagedFiles,
    unstagedFiles,
    expandFile,
    setStagedSectionExpanded,
    setUnstagedSectionExpanded,
  ]);
}
