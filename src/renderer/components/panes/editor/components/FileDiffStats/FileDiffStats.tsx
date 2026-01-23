/**
 * FileDiffStats - Container component for per-file diff statistics.
 *
 * Fetches stats for a specific file and renders them using DiffStatsDisplay.
 * Returns null if no stats available or if both values are 0.
 *
 * @example
 * ```tsx
 * // Basic usage (combines stats for partially staged files)
 * <FileDiffStats filePath="src/app.tsx" />
 *
 * // With section context (for partially staged files)
 * <FileDiffStats filePath="src/app.tsx" staged={true} />   // staged section
 * <FileDiffStats filePath="src/app.tsx" staged={false} />  // unstaged section
 * ```
 */

import { memo } from "react";
import { useFileDiffStats } from "./FileDiffStatsContext";
import { DiffStatsDisplay } from "./DiffStatsDisplay";

export interface FileDiffStatsProps {
  /** Relative path to the file */
  filePath: string;
  /**
   * Whether this is for the staged or unstaged section.
   * Required for correct stats when a file is partially staged.
   * If undefined, combines stats (backward compatible).
   */
  staged?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Whether to show stats even when both added and removed are 0 */
  showZero?: boolean;
  /** Whether the file has unseen changes (bolds the stats) */
  isUnseen?: boolean;
}

/**
 * Displays diff statistics (+X -Y) for a specific file.
 *
 * Automatically fetches stats from FileDiffStatsContext.
 * Returns null if no stats available or if both values are 0 (unless showZero is true).
 */
export const FileDiffStats = memo(function FileDiffStats({
  filePath,
  staged,
  className,
  showZero = false,
  isUnseen = false,
}: FileDiffStatsProps) {
  const stats = useFileDiffStats(filePath, staged);

  // Don't render if no stats available
  if (!stats) {
    return null;
  }

  // Don't render if both are 0 (unless showZero is true)
  if (!showZero && stats.added === 0 && stats.removed === 0) {
    return null;
  }

  return (
    <DiffStatsDisplay stats={stats} className={className} isUnseen={isUnseen} />
  );
});
