/**
 * Commit Display Module
 *
 * This module contains components for displaying commit information
 * alongside the graph visualization:
 *
 * - CommitSummary.tsx: Main component composing all commit info
 * - ViewAllButton.tsx: Button to open full commit review
 * - utils.ts: Helper functions for formatting
 *
 * These components handle the right side of each commit row,
 * complementing the GraphCell on the left.
 *
 * @example
 * ```tsx
 * import { CommitSummary } from './commit';
 *
 * <CommitSummary
 *   commit={node.commit}
 *   isHead={node.isHead}
 *   onViewAll={() => openCommitReview(node)}
 * />
 * ```
 */

// =============================================================================
// Main Component (Public API)
// =============================================================================

export { CommitSummary } from "./CommitSummary";
export type { CommitSummaryProps } from "./CommitSummary";

export { CommitTooltip } from "./CommitTooltip";
export type { CommitTooltipProps } from "./CommitTooltip";

// =============================================================================
// Sub-components (for advanced usage)
// =============================================================================

export { ViewAllButton } from "./ViewAllButton";
export type { ViewAllButtonProps } from "./ViewAllButton";

// =============================================================================
// Utilities (for formatting)
// =============================================================================

// Text utilities (local)
export { truncateText, getFirstLine } from "./utils";

// Time utilities (re-exported from shared for backward compatibility)
export { formatRelativeTime, formatFullDate } from "../../../utils";
