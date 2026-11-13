/**
 * useReviewModeState Hook
 *
 * Manages the review mode state and transitions for the editor pane.
 * Encapsulates the logic for:
 * - Entering/exiting review mode
 * - Preserving review mode when switching tree view modes
 * - Restoring review mode when returning to "changes" view
 *
 * @example
 * ```tsx
 * const {
 *   viewMode,
 *   isReviewMode,
 *   enterReviewMode,
 *   exitReviewMode,
 *   setViewModePreservingReview,
 *   handleTreeViewModeChange,
 * } = useReviewModeState();
 * ```
 */

import { useState, useCallback, useRef } from "react";
import type { ViewMode } from "../types";

export interface UseReviewModeStateResult {
  /** Current view mode */
  viewMode: ViewMode;

  /** Whether currently in review mode */
  isReviewMode: boolean;

  /** Enter review mode */
  enterReviewMode: (baseBranch?: string) => void;

  /** Exit review mode (returns to editor mode) */
  exitReviewMode: () => void;

  /**
   * Set view mode directly.
   * Use for explicit user actions (e.g., diff toggle).
   * Will exit review mode if a non-review mode is set.
   */
  setViewMode: (mode: ViewMode) => void;

  /**
   * Set view mode, but preserve review mode if currently active.
   * Use this when selecting files - if in review mode, stays in review mode.
   */
  setViewModePreservingReview: (getNewMode: () => ViewMode) => void;

  /**
   * Handle tree view mode changes (files/changes toggle).
   * - When switching to "files": exits review mode but remembers it
   * - When switching to "changes": restores review mode if it was remembered
   * Returns whether review mode was restored.
   */
  handleTreeViewModeTransition: (newTreeMode: "files" | "changes") => {
    restoredReviewMode: boolean;
  };
}

/**
 * Hook for managing review mode state and transitions.
 *
 * @param initialViewMode - View mode for the first render, like useState
 */
export function useReviewModeState(
  initialViewMode: ViewMode = { type: "editor" },
): UseReviewModeStateResult {
  const [viewMode, setViewModeInternal] = useState<ViewMode>(initialViewMode);

  // Remember if we were in review mode when switching out of "changes" mode
  const wasInReviewModeRef = useRef(false);

  const isReviewMode = viewMode.type === "changesReview";

  /**
   * Enter review mode.
   */
  const enterReviewMode = useCallback((baseBranch?: string) => {
    setViewModeInternal({
      type: "changesReview",
      baseBranch,
    });
  }, []);

  /**
   * Exit review mode.
   * Clears the "was in review" flag so it won't auto-restore.
   */
  const exitReviewMode = useCallback(() => {
    wasInReviewModeRef.current = false;
    setViewModeInternal({ type: "editor" });
  }, []);

  /**
   * Set view mode directly.
   * Used for explicit user actions like diff toggle.
   */
  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeInternal(mode);
  }, []);

  /**
   * Set view mode, preserving review mode if active.
   * Used when selecting files - if in review mode, the selection
   * should scroll to the file in review mode, not exit it.
   */
  const setViewModePreservingReview = useCallback(
    (getNewMode: () => ViewMode) => {
      setViewModeInternal((current) => {
        if (current.type === "changesReview") {
          return current; // Preserve review mode
        }
        return getNewMode();
      });
    },
    [],
  );

  /**
   * Handle tree view mode transitions.
   * Manages the review mode preservation/restoration logic.
   */
  const handleTreeViewModeTransition = useCallback(
    (newTreeMode: "files" | "changes"): { restoredReviewMode: boolean } => {
      let restoredReviewMode = false;

      if (newTreeMode === "files") {
        // Switching to "files" mode - exit review but remember it
        setViewModeInternal((current) => {
          if (current.type === "changesReview") {
            wasInReviewModeRef.current = true;
            return { type: "editor" };
          }
          return current;
        });
      } else if (newTreeMode === "changes") {
        // Switching to "changes" mode - restore review if remembered
        if (wasInReviewModeRef.current) {
          wasInReviewModeRef.current = false;
          setViewModeInternal({ type: "changesReview" });
          restoredReviewMode = true;
        }
      }

      return { restoredReviewMode };
    },
    [],
  );

  return {
    viewMode,
    isReviewMode,
    enterReviewMode,
    exitReviewMode,
    setViewMode,
    setViewModePreservingReview,
    handleTreeViewModeTransition,
  };
}
