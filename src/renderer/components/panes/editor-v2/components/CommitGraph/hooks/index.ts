/**
 * Commit Graph Hooks Module
 *
 * This module contains React hooks for managing commit graph state:
 *
 * - useCommitGraph.ts: Main state hook managing commits, loading, expansion
 * - useCommitGraphKeyboard.ts: Keyboard navigation (arrow keys, enter, etc.)
 * - usePanelHeight.ts: Persisted panel height with resize support
 *
 * The useCommitGraph hook is the central piece - it:
 * - Fetches commit history from the Git API
 * - Computes swimlane positions using the graph algorithm
 * - Manages expansion state for showing file lists
 * - Handles pagination (load more)
 * - Provides refresh functionality
 *
 * @example
 * ```tsx
 * import { useCommitGraph, usePanelHeight } from './hooks';
 *
 * function CommitGraphPanel({ git }) {
 *   const { nodes, isLoading, refresh, toggleExpand } = useCommitGraph(git);
 *   const { height, updateHeight } = usePanelHeight();
 *   // ...
 * }
 * ```
 */

// Phase 6: Main state hook
export { useCommitGraph } from "./useCommitGraph";
export type {
  UseCommitGraphOptions,
  UseCommitGraphResult,
  CommitGraphState,
  CommitGraphActions,
} from "./useCommitGraph";

// Phase 10: Keyboard navigation
// export { useCommitGraphKeyboard } from './useCommitGraphKeyboard';

// Phase 11: Panel height persistence
// export { usePanelHeight } from './usePanelHeight';
