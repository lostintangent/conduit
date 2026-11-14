/**
 * SectionDiffStats - Container component for section total diff statistics.
 *
 * Fetches aggregated stats for staged or unstaged section and renders
 * them using DiffStatsDisplay. Returns null if no stats available.
 *
 * @example
 * ```tsx
 * <SectionDiffStats staged={true} />   // Staged section totals
 * <SectionDiffStats staged={false} />  // Unstaged section totals
 * ```
 */

import { memo } from "react";
import { useSectionTotalStats } from "./FileDiffStatsContext";
import { DiffStatsDisplay } from "./DiffStatsDisplay";

export interface SectionDiffStatsProps {
  /** Whether to show stats for staged (true) or unstaged (false) section */
  staged: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Displays aggregated diff statistics (+X -Y) for a section.
 *
 * Automatically fetches pre-computed totals from FileDiffStatsContext.
 * Returns null if no stats available or if the section is empty.
 */
export const SectionDiffStats = memo(function SectionDiffStats({
  staged,
  className,
}: SectionDiffStatsProps) {
  const stats = useSectionTotalStats(staged);

  // Don't render if no stats available
  if (!stats) {
    return null;
  }

  // Don't render if both are 0 (empty section)
  if (stats.added === 0 && stats.removed === 0) {
    return null;
  }

  return <DiffStatsDisplay stats={stats} className={className} />;
});
