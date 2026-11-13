/**
 * useFilePrefetch - Hook for prefetching file content on hover.
 *
 * Prefetches file content into MonacoModelRegistry when the user hovers
 * over a file in the tree. Uses a delay to avoid prefetching on casual
 * mouse movements.
 *
 * The prefetch is automatically deduplicated by MonacoModelRegistry:
 * - If file is already cached, returns immediately
 * - If file is already loading, returns the existing promise
 * - If file is not cached, starts loading
 *
 * @example
 * ```tsx
 * const { onFileHover, onFileHoverEnd } = useFilePrefetch({ cwd });
 *
 * <FileTreeItem
 *   onFileHover={onFileHover}
 *   onFileHoverEnd={onFileHoverEnd}
 * />
 * ```
 */

import { useCallback, useRef } from "react";
import { MonacoModelRegistry } from "../registry";

/** Delay before prefetching starts (ms) */
const PREFETCH_DELAY_MS = 400;

export interface UseFilePrefetchOptions {
  /** Working directory for file resolution */
  cwd: string;

  /** Whether prefetching is enabled (default: true) */
  enabled?: boolean;
}

export interface UseFilePrefetchResult {
  /** Call when mouse enters a file item */
  onFileHover: (path: string) => void;

  /** Call when mouse leaves a file item */
  onFileHoverEnd: (path: string) => void;
}

/**
 * Hook for prefetching file content on hover.
 */
export function useFilePrefetch({
  cwd,
  enabled = true,
}: UseFilePrefetchOptions): UseFilePrefetchResult {
  // Map of file path to pending timeout ID
  const pendingPrefetchRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  /**
   * Start prefetch timer when hovering over a file.
   */
  const onFileHover = useCallback(
    (path: string) => {
      if (!enabled) return;

      // Clear any existing timer for this path
      const existingTimer = pendingPrefetchRef.current.get(path);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Start new timer
      const timerId = setTimeout(() => {
        pendingPrefetchRef.current.delete(path);

        // Prefetch the file - MonacoModelRegistry handles deduplication
        const registry = MonacoModelRegistry.getInstance();
        registry.getOrCreateModel(path, cwd).catch(() => {
          // Silently ignore prefetch failures - this is an optimization,
          // the actual load will show errors if needed
        });
      }, PREFETCH_DELAY_MS);

      pendingPrefetchRef.current.set(path, timerId);
    },
    [cwd, enabled],
  );

  /**
   * Cancel prefetch timer when mouse leaves.
   */
  const onFileHoverEnd = useCallback((path: string) => {
    const timerId = pendingPrefetchRef.current.get(path);
    if (timerId) {
      clearTimeout(timerId);
      pendingPrefetchRef.current.delete(path);
    }
  }, []);

  return {
    onFileHover,
    onFileHoverEnd,
  };
}
