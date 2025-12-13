/**
 * CommitSummary Component
 *
 * The main component for displaying commit information in a row.
 * Composes CommitSubject, CommitMeta, and ViewAllButton into a
 * cohesive layout.
 *
 * Layout:
 * ```
 * ┌─────────────────────────────────────────────────────┐
 * │ [HEAD] Fix authentication bug in login flow    [👁] │
 * │ 2h ago · John Doe · abc1234                        │
 * └─────────────────────────────────────────────────────┘
 * ```
 *
 * The HEAD badge only appears for the current HEAD commit.
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
import { CommitSubject } from "./CommitSubject";
import { CommitMeta } from "./CommitMeta";
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
// Sub-components
// =============================================================================

/**
 * Small badge indicating HEAD commit.
 * Styled to be subtle but visible.
 */
function HeadBadge() {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center",
        "px-1.5 py-0.5 rounded text-[10px] font-semibold",
        "bg-primary/15 text-primary",
        "flex-shrink-0",
      )}
      data-testid="head-badge"
    >
      HEAD
    </span>
  );
}

// =============================================================================
// Component
// =============================================================================

/**
 * CommitSummary displays all commit information for a row.
 *
 * Structure:
 * - First line: [HEAD badge?] + Subject + [View All button]
 * - Second line: Meta info (time · author · hash)
 *
 * The component uses `group` class to enable hover effects
 * on child components (e.g., showing the view all button).
 */
function CommitSummaryComponent({
  commit,
  isHead = false,
  onViewAll,
  className,
}: CommitSummaryProps) {
  return (
    <div
      className={cn("flex flex-col gap-0.5 min-w-0 py-1", className)}
      data-testid="commit-summary"
    >
      {/* First line: Subject with optional HEAD badge and view button */}
      <div className="flex items-center gap-2 min-w-0">
        {isHead && <HeadBadge />}

        <CommitSubject
          subject={commit.subject}
          message={commit.message}
          className="flex-1 min-w-0"
        />

        {onViewAll && <ViewAllButton onClick={onViewAll} className="ml-auto" />}
      </div>

      {/* Second line: Meta info */}
      <CommitMeta
        timestamp={commit.timestamp}
        author={commit.author}
        shortId={commit.shortId}
      />
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
