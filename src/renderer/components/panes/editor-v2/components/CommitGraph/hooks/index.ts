/**
 * Commit Graph Hooks Module
 *
 * This module contains React hooks for managing commit graph state.
 *
 * The useCommitGraph hook is the central piece - it:
 * - Fetches commit history from the Git API
 * - Computes swimlane positions using the graph algorithm
 * - Manages expansion state for showing file lists
 * - Handles pagination (load more)
 * - Provides refresh functionality
 *
 * Note: usePanelHeight has been moved to the shared editor-v2/hooks module
 * as it's a general-purpose utility not specific to the commit graph.
 *
 * @example
 * ```tsx
 * import { useCommitGraph } from './hooks';
 * import { usePanelHeight } from '../../../hooks';
 *
 * function CommitGraphPanel({ git }) {
 *   const { nodes, isLoading, refresh, toggleExpand } = useCommitGraph(git);
 *   const { height, updateHeight } = usePanelHeight({ ... });
 *   // ...
 * }
 * ```
 */

export { useCommitGraph } from "./useCommitGraph";
export type {
  UseCommitGraphOptions,
  UseCommitGraphResult,
  CommitGraphState,
  CommitGraphActions,
} from "./useCommitGraph";

// Re-export usePanelHeight from shared hooks for backward compatibility
export { usePanelHeight } from "../../../hooks/usePanelHeight";
export type {
  UsePanelHeightOptions,
  UsePanelHeightResult,
} from "../../../hooks/usePanelHeight";
