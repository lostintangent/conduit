/**
 * Commit Graph Hooks Module
 *
 * Note: useCommitGraph has been moved to the shared editor-v2/hooks module
 * following the established pattern. This file re-exports for backward
 * compatibility.
 *
 * @example
 * ```tsx
 * // Preferred import path:
 * import { useCommitGraph, usePanelHeight } from '../../../hooks';
 *
 * // Or import from CommitGraph module (backward compatible):
 * import { useCommitGraph, usePanelHeight } from './hooks';
 * ```
 */

// Re-export useCommitGraph from shared hooks for backward compatibility
export { useCommitGraph } from "../../../hooks/useCommitGraph";
export type {
  UseCommitGraphOptions,
  UseCommitGraphResult,
  CommitGraphState,
  CommitGraphActions,
} from "../../../hooks/useCommitGraph";

// Re-export usePanelHeight from shared hooks for backward compatibility
export { usePanelHeight } from "../../../hooks/usePanelHeight";
export type {
  UsePanelHeightOptions,
  UsePanelHeightResult,
} from "../../../hooks/usePanelHeight";
