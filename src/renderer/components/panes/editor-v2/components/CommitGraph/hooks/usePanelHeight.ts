/**
 * usePanelHeight Hook
 *
 * Manages panel height with localStorage persistence.
 * Provides controlled height state with min/max constraints.
 *
 * Features:
 * - Persists height to localStorage
 * - Loads initial height from storage
 * - Enforces min/max constraints
 * - Debounces storage writes
 *
 * @example
 * ```tsx
 * function ResizablePanel() {
 *   const { height, setHeight, resetHeight } = usePanelHeight({
 *     storageKey: 'commit-graph-height',
 *     defaultHeight: 200,
 *     minHeight: 100,
 *     maxHeight: 500,
 *   });
 *
 *   return (
 *     <div style={{ height }}>
 *       <ResizeHandle onResize={setHeight} />
 *       {children}
 *     </div>
 *   );
 * }
 * ```
 */

import { useState, useCallback, useEffect, useRef } from "react";

// =============================================================================
// Types
// =============================================================================

export interface UsePanelHeightOptions {
  /**
   * Key for localStorage persistence.
   */
  storageKey: string;

  /**
   * Default height when no stored value exists.
   */
  defaultHeight: number;

  /**
   * Minimum allowed height.
   * @default 100
   */
  minHeight?: number;

  /**
   * Maximum allowed height.
   * @default 600
   */
  maxHeight?: number;

  /**
   * Debounce delay for storage writes (ms).
   * @default 300
   */
  debounceMs?: number;
}

export interface UsePanelHeightResult {
  /**
   * Current panel height in pixels.
   */
  height: number;

  /**
   * Set the panel height. Automatically clamps to min/max.
   */
  setHeight: (height: number) => void;

  /**
   * Reset to default height and clear stored value.
   */
  resetHeight: () => void;

  /**
   * Minimum allowed height.
   */
  minHeight: number;

  /**
   * Maximum allowed height.
   */
  maxHeight: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_MIN_HEIGHT = 100;
const DEFAULT_MAX_HEIGHT = 600;
const DEFAULT_DEBOUNCE_MS = 300;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Clamp a value between min and max.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Try to read a number from localStorage.
 * Returns null if not found or invalid.
 */
function readFromStorage(key: string): number | null {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) {
      return null;
    }

    const parsed = parseFloat(stored);
    if (isNaN(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    // localStorage might not be available
    return null;
  }
}

/**
 * Write a number to localStorage.
 */
function writeToStorage(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // localStorage might not be available or full
  }
}

/**
 * Remove a key from localStorage.
 */
function removeFromStorage(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // localStorage might not be available
  }
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook for managing panel height with persistence.
 *
 * @param options - Configuration options
 * @returns Height state and actions
 */
export function usePanelHeight(
  options: UsePanelHeightOptions,
): UsePanelHeightResult {
  const {
    storageKey,
    defaultHeight,
    minHeight = DEFAULT_MIN_HEIGHT,
    maxHeight = DEFAULT_MAX_HEIGHT,
    debounceMs = DEFAULT_DEBOUNCE_MS,
  } = options;

  // Initialize height from storage or default
  const [height, setHeightState] = useState<number>(() => {
    const stored = readFromStorage(storageKey);
    if (stored !== null) {
      return clamp(stored, minHeight, maxHeight);
    }
    return clamp(defaultHeight, minHeight, maxHeight);
  });

  // Debounce timer ref
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Set height with clamping and debounced storage
  const setHeight = useCallback(
    (newHeight: number) => {
      const clamped = clamp(newHeight, minHeight, maxHeight);
      setHeightState(clamped);

      // Clear existing timer
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }

      // Debounce storage write
      debounceTimer.current = setTimeout(() => {
        writeToStorage(storageKey, clamped);
      }, debounceMs);
    },
    [storageKey, minHeight, maxHeight, debounceMs],
  );

  // Reset to default
  const resetHeight = useCallback(() => {
    const clamped = clamp(defaultHeight, minHeight, maxHeight);
    setHeightState(clamped);
    removeFromStorage(storageKey);
  }, [storageKey, defaultHeight, minHeight, maxHeight]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return {
    height,
    setHeight,
    resetHeight,
    minHeight,
    maxHeight,
  };
}
