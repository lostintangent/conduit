/**
 * CommitSummary Component
 *
 * The main component for displaying commit information in a row.
 * Uses a compact single-line layout matching VS Code's git graph.
 *
 * Layout:
 * ```
 * ┌─────────────────────────────────────────────────────┐
 * │ Fix authentication bug in login flow  Author  [👁] │
 * └─────────────────────────────────────────────────────┘
 * ```
 *
 * The HEAD commit uses a hollow circle in the graph (handled by GraphCell).
 *
 * @example
 * ```tsx
 * <CommitSummary
 *   commit={historyCommit}
 *   isHead={true}
 *   onViewAll={() => openCommitReview(commit.id)}
 * />
 * ```
 */

import { memo } from "react";
import { cn } from "@/utils";
import type { HistoryCommit } from "../types";
import { ViewAllButton } from "./ViewAllButton";

// =============================================================================
// Props
// =============================================================================

export interface CommitSummaryProps {
  /** The commit to display */
  commit: HistoryCommit;

  /** Whether this is the HEAD commit */
  isHead?: boolean;

  /** Called when "view all" is clicked */
  onViewAll?: () => void;

  /** Optional className for the container */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * CommitSummary displays commit information in a compact single line.
 *
 * Structure: Subject + Author + [View All button on hover]
 *
 * Uses CSS grid so author truncates first, then subject.
 * Matches VS Code's compact git graph style for visual consistency.
 */
function CommitSummaryComponent({
  commit,
  isHead = false,
  onViewAll,
  className,
}: CommitSummaryProps) {
  return (
    <div
      className={cn("flex items-center gap-2 min-w-0", className)}
      data-testid="commit-summary"
    >
      {/* Subject and Author - author truncates first, then subject */}
      <div
        className="min-w-0 flex-1 items-baseline gap-1.5"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, auto) minmax(0, 1fr)",
        }}
      >
        {/* Subject - truncates second */}
        <span
          className={cn(
            "truncate text-[13px]",
            isHead ? "font-medium" : "font-normal",
          )}
          title={commit.subject}
          data-testid="commit-subject"
        >
          {commit.subject}
        </span>

        {/* Author - truncates first */}
        <span
          className="truncate text-[13px] text-muted-foreground"
          data-testid="commit-meta-author"
        >
          {commit.author}
        </span>
      </div>

      {/* View all button - appears on hover */}
      {onViewAll && <ViewAllButton onClick={onViewAll} className="ml-auto" />}
    </div>
  );
}

/**
 * Memoized CommitSummary component.
 *
 * The memoization compares props shallowly. Since commit objects
 * are replaced (not mutated) when data changes, this works correctly.
 */
export const CommitSummary = memo(CommitSummaryComponent);

export default CommitSummary;
