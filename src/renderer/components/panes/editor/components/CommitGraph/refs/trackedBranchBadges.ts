/**
 * Tracked Branch Badge Utilities
 *
 * Builds colored ref badges for commits based on tracked branch relationships.
 * Used by both CommitSummary (in the list) and CommitTooltip (on hover).
 *
 * Badge colors follow VS Code's git graph styling:
 * - Current branch: Blue
 * - Upstream branch: Purple
 * - Base branch: Orange
 */

import type { TrackedBranchInfo } from "@/api/GitV2API";
import type { GitRef } from "../types";
import type { RefWithColorHint } from "./RefBadge";

// =============================================================================
// Types
// =============================================================================

export interface BuildTrackedBadgesOptions {
  /**
   * When true, subsequent badges (after the first) show only icons.
   * Used in compact list view to avoid redundant text.
   * Default: false (show full text on all badges)
   */
  useIconOnly?: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Check if two branch refs are the same (same remote and name).
 */
export function isSameBranch(
  a: { remote?: string; displayName: string } | null | undefined,
  b: { remote?: string; displayName: string } | null | undefined,
): boolean {
  if (!a || !b) return false;
  return a.remote === b.remote && a.displayName === b.displayName;
}

// =============================================================================
// Badge Building
// =============================================================================

/**
 * Build colored badges for tracked branches on a specific commit.
 *
 * Each badge appears on the commit it actually points to:
 * - Current branch (blue): Always on HEAD (current branch === HEAD by definition)
 * - Upstream (purple): On the commit upstream points to
 * - Base (orange): On the commit base points to
 *
 * VS Code-style filtering:
 * - Base badge is HIDDEN when it's the same branch as upstream
 *   (avoids redundant badges when on main branch)
 *
 * @param commitId - The commit ID to check
 * @param isHead - Whether this is the HEAD commit
 * @param trackedBranches - Tracked branch information
 * @param options - Optional configuration
 * @returns Array of refs with color hints
 */
export function buildTrackedBranchBadges(
  commitId: string,
  isHead: boolean,
  trackedBranches: TrackedBranchInfo | null | undefined,
  options: BuildTrackedBadgesOptions = {},
): RefWithColorHint[] {
  if (!trackedBranches) {
    return [];
  }

  const { useIconOnly = false } = options;
  const badges: RefWithColorHint[] = [];
  const { current, upstream, base } = trackedBranches;

  // VS Code-style: Hide base when it's the same branch as upstream
  // This prevents redundant badges when on main branch where
  // upstream (origin/main) and base (origin/main) would be identical
  const showBase = base && !isSameBranch(base, upstream);

  // Current branch badge always appears on HEAD
  if (isHead && current) {
    const ref: GitRef = {
      type: "head",
      name: current.displayName,
      isHead: true,
    };
    badges.push({ ref, colorHint: "current" });
  }

  // Upstream badge appears on the commit it points to
  if (upstream && commitId === upstream.commitId) {
    const ref: GitRef = {
      type: "remote",
      name:
        upstream.displayName.split("/").slice(1).join("/") ||
        upstream.displayName,
      remote: upstream.remote || "origin",
    };
    badges.push({
      ref,
      colorHint: "upstream",
      iconOnly: useIconOnly && badges.length > 0,
    });
  }

  // Base badge appears on the commit it points to (hidden when same as upstream)
  if (showBase && commitId === base.commitId) {
    const ref: GitRef = {
      type: "remote",
      name: base.displayName.split("/").slice(1).join("/") || base.displayName,
      remote: base.remote || "origin",
    };
    badges.push({
      ref,
      colorHint: "base",
      iconOnly: useIconOnly && badges.length > 0,
    });
  }

  return badges;
}
