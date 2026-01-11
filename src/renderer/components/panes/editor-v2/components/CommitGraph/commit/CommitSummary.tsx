/**
 * CommitSummary Component
 *
 * The main component for displaying commit information in a row.
 * Uses a compact single-line layout matching VS Code's git graph.
 *
 * Layout:
 * ```
 * ┌────────────────────────────────────────────────────────────────────┐
 * │ [main] [origin/main] Fix authentication bug in login  Author [👁] │
 * └────────────────────────────────────────────────────────────────────┘
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

import { memo, useMemo } from "react";
import { cn } from "@/utils";
import type { HistoryCommit } from "../types";
import type { TrackedBranchInfo } from "@/api/GitV2API";
import { ViewAllButton } from "./ViewAllButton";
import {
  parseRefs,
  filterRefsForDisplay,
  RefBadgeList,
  type RefWithColorHint,
} from "../refs";
import type { GitRef } from "../types";

// =============================================================================
// Props
// =============================================================================

export interface CommitSummaryProps {
  /** The commit to display */
  commit: HistoryCommit;

  /** Whether this is the HEAD commit */
  isHead?: boolean;

  /**
   * Tracked branch information for VS Code-style colored badges.
   * When provided, shows colored badges for current, upstream, and base branches.
   */
  trackedBranches?: TrackedBranchInfo | null;

  /** Called when "view all" is clicked */
  onViewAll?: () => void;

  /** Optional className for the container */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Check if two branch refs are the same (same remote and name).
 */
function isSameBranch(
  a: { remote?: string; displayName: string } | null | undefined,
  b: { remote?: string; displayName: string } | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a.remote === b.remote && a.displayName === b.displayName;
}

/**
 * Build tracked branch badges for a commit.
 *
 * Each badge appears on the commit it actually points to:
 * - Current branch (blue): Always on HEAD (current branch === HEAD by definition)
 * - Upstream (purple): On the commit upstream points to
 * - Base (orange): On the commit base points to
 *
 * If upstream or base point to HEAD, those badges appear alongside current.
 * If they point to different commits, they appear on those commits instead.
 *
 * VS Code-style filtering and display:
 * - Base badge is HIDDEN when it's the same branch as upstream
 *   (avoids showing redundant badges when on main branch)
 * - First badge shows full text (branch name)
 * - Subsequent badges show icon only (to avoid redundancy)
 */
function buildTrackedBranchBadges(
  commitId: string,
  isHead: boolean,
  trackedBranches: TrackedBranchInfo | null | undefined,
): RefWithColorHint[] {
  if (!trackedBranches) {
    return [];
  }

  const badges: RefWithColorHint[] = [];
  const { current, upstream, base } = trackedBranches;

  // VS Code-style: Hide base when it's the same branch as upstream
  // This prevents redundant badges when on main branch where
  // upstream (origin/main) and base (origin/main) would be identical
  const showBase = base && !isSameBranch(base, upstream);

  // Current branch badge always appears on HEAD
  // First badge shows full text
  if (isHead && current) {
    const ref: GitRef = {
      type: "head",
      name: current.displayName,
      isHead: true,
    };
    badges.push({ ref, colorHint: "current" });
  }

  // Upstream badge appears on the commit it points to
  // Shows icon only if there's already a badge (VS Code style)
  if (upstream && commitId === upstream.commitId) {
    const ref: GitRef = {
      type: "remote",
      name:
        upstream.displayName.split("/").slice(1).join("/") ||
        upstream.displayName,
      remote: upstream.remote || "origin",
    };
    badges.push({ ref, colorHint: "upstream", iconOnly: badges.length > 0 });
  }

  // Base badge appears on the commit it points to
  // Hidden when same as upstream (VS Code style)
  // Shows icon only if there's already a badge
  if (showBase && commitId === base.commitId) {
    const ref: GitRef = {
      type: "remote",
      name: base.displayName.split("/").slice(1).join("/") || base.displayName,
      remote: base.remote || "origin",
    };
    badges.push({ ref, colorHint: "base", iconOnly: badges.length > 0 });
  }

  return badges;
}

/**
 * CommitSummary displays commit information in a compact single line.
 *
 * Structure: [Refs] + Subject + Author + [View All button on hover]
 *
 * Uses CSS grid so author truncates first, then subject.
 * Matches VS Code's compact git graph style for visual consistency.
 */
function CommitSummaryComponent({
  commit,
  isHead = false,
  trackedBranches,
  onViewAll,
  className,
}: CommitSummaryProps) {
  // Build refs with color hints for tracked branches
  const refsWithColorHints = useMemo(() => {
    // Get tracked branch badges (with color hints)
    const trackedBadges = buildTrackedBranchBadges(
      commit.id,
      isHead,
      trackedBranches,
    );

    // If we have tracked branch badges, use only those (VS Code style)
    if (trackedBadges.length > 0) {
      return trackedBadges;
    }

    // Fallback: parse refs from commit and show as regular badges (no color hints)
    const parsedRefs = filterRefsForDisplay(parseRefs(commit.refs));
    return parsedRefs.map((ref): RefWithColorHint => ({ ref }));
  }, [commit.id, commit.refs, isHead, trackedBranches]);

  const hasRefBadges = refsWithColorHints.length > 0;

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

      {/* Ref badges - shown after subject/author */}
      {hasRefBadges && (
        <RefBadgeList
          refs={refsWithColorHints}
          maxVisible={3}
          className="flex-shrink-0"
        />
      )}

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
