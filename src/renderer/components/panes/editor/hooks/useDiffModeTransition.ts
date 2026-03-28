/**
 * useDiffModeTransition - Hook for managing diff/edit mode toggle state.
 *
 * Provides state management for switching between diff and regular editor views.
 *
 * @example
 * ```tsx
 * const { isDiffMode, handleToggle } = useDiffModeTransition();
 *
 * return isDiffMode ? <DiffEditor /> : <Editor />;
 * ```
 */

import { useCallback, useState } from "react";

export interface UseDiffModeTransitionResult {
  /** Whether currently in diff mode */
  isDiffMode: boolean;

  /** Set diff mode directly */
  setIsDiffMode: (isDiff: boolean) => void;

  /** Click handler for toggle button */
  handleToggle: (e: React.MouseEvent) => void;
}

/**
 * Hook for managing diff/edit mode toggle state.
 *
 * @param initialMode - Initial mode (default: true for diff mode)
 */
export function useDiffModeTransition(
  initialMode = true,
): UseDiffModeTransitionResult {
  const [isDiffMode, setIsDiffMode] = useState(initialMode);

  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDiffMode((prev) => !prev);
  }, []);

  return {
    isDiffMode,
    setIsDiffMode,
    handleToggle,
  };
}
