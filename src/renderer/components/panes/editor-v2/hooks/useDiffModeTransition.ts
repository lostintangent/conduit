/**
 * useDiffModeTransition - Hook for managing diff/edit mode transitions with height preservation.
 *
 * When switching between diff and regular editor views, the container can flash/shrink
 * as one editor unmounts and another mounts. This hook:
 * 1. Captures the container height before switching
 * 2. Provides a locked autoSize config that prevents resizing during transition
 * 3. Releases the lock after the new editor has rendered
 *
 * @example
 * ```tsx
 * const {
 *   isDiffMode,
 *   handleToggle,
 *   autoSizeConfig,
 *   containerRef,
 *   transitionStyle,
 * } = useDiffModeTransition(DEFAULT_AUTO_SIZE_CONFIG);
 *
 * return (
 *   <div ref={containerRef} style={transitionStyle}>
 *     {isDiffMode ? <DiffEditor autoSize={autoSizeConfig} /> : <Editor autoSize={autoSizeConfig} />}
 *   </div>
 * );
 * ```
 */

import { useCallback, useMemo, useRef, useState } from "react";
import type { AutoSizeConfig } from "../components/EditorViewPanel/constants";

/** Duration to hold the fixed height during transition (ms) */
const TRANSITION_DURATION_MS = 200;

export interface UseDiffModeTransitionOptions {
  /** Default auto-size config to use when not transitioning */
  defaultConfig: AutoSizeConfig;

  /** Initial mode (default: true for diff mode) */
  initialMode?: boolean;
}

export interface UseDiffModeTransitionResult {
  /** Whether currently in diff mode */
  isDiffMode: boolean;

  /** Set diff mode directly */
  setIsDiffMode: (isDiff: boolean) => void;

  /** Click handler for toggle button (includes height preservation) */
  handleToggle: (e: React.MouseEvent) => void;

  /** Auto-size config to pass to editor (locked during transition) */
  autoSizeConfig: AutoSizeConfig;

  /** Ref to attach to the editor container */
  containerRef: React.RefObject<HTMLDivElement>;

  /** Style to apply to container during transition */
  transitionStyle: React.CSSProperties | undefined;

  /** Whether currently transitioning */
  isTransitioning: boolean;
}

/**
 * Hook for managing diff/edit mode transitions with height preservation.
 */
export function useDiffModeTransition({
  defaultConfig,
  initialMode = true,
}: UseDiffModeTransitionOptions): UseDiffModeTransitionResult {
  // Mode state
  const [isDiffMode, setIsDiffMode] = useState(initialMode);

  // Transition state
  const containerRef = useRef<HTMLDivElement>(null);
  const [transitionHeight, setTransitionHeight] = useState<number | null>(null);

  // Handle toggle with height preservation
  const handleToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();

    // Capture current height before switching
    if (containerRef.current) {
      const currentHeight = containerRef.current.offsetHeight;
      setTransitionHeight(currentHeight);
    }

    setIsDiffMode((prev) => !prev);

    // Clear the fixed height after transition duration
    setTimeout(() => {
      setTransitionHeight(null);
    }, TRANSITION_DURATION_MS);
  }, []);

  // During transition, lock the auto-size config to prevent resizing
  const autoSizeConfig = useMemo<AutoSizeConfig>(() => {
    if (transitionHeight !== null) {
      // Lock both min and max to the transition height
      return { minHeight: transitionHeight, maxHeight: transitionHeight };
    }
    return defaultConfig;
  }, [transitionHeight, defaultConfig]);

  // Style to apply to container during transition
  const transitionStyle = useMemo<React.CSSProperties | undefined>(() => {
    if (transitionHeight !== null) {
      return { minHeight: transitionHeight };
    }
    return undefined;
  }, [transitionHeight]);

  return {
    isDiffMode,
    setIsDiffMode,
    handleToggle,
    autoSizeConfig,
    containerRef,
    transitionStyle,
    isTransitioning: transitionHeight !== null,
  };
}
