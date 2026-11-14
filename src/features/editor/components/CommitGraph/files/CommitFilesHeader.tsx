/**
 * CommitFilesHeader Component
 *
 * Displays summary information for a commit's file changes:
 * - Number of files changed
 * - Total lines added and deleted
 *
 * Used at the top of CommitFilesPanel when a commit is expanded.
 *
 * Layout:
 * ```
 * ┌────────────────────────────────┐
 * │ 5 files changed  +42 / -18    │
 * └────────────────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <CommitFilesHeader
 *   fileCount={5}
 *   totalAdditions={42}
 *   totalDeletions={18}
 * />
 * ```
 */

import { memo, useMemo } from "react";
import { cn } from "@/utils";
import { DiffStatsDisplay } from "../../FileDiffStats/DiffStatsDisplay";

// =============================================================================
// Types
// =============================================================================

export interface CommitFilesHeaderProps {
  /** Number of files changed */
  fileCount: number;

  /** Total lines added across all files */
  totalAdditions: number;

  /** Total lines deleted across all files */
  totalDeletions: number;

  /** Optional additional class names */
  className?: string;
}

// =============================================================================
// Component
// =============================================================================

/**
 * Header showing file change statistics.
 */
function CommitFilesHeaderComponent({
  fileCount,
  totalAdditions,
  totalDeletions,
  className,
}: CommitFilesHeaderProps) {
  // Pluralize "file(s)"
  const filesText = fileCount === 1 ? "file" : "files";

  // Stats for DiffStatsDisplay
  const diffStats = useMemo(
    () => ({
      added: totalAdditions,
      removed: totalDeletions,
    }),
    [totalAdditions, totalDeletions],
  );
  const hasStats = totalAdditions > 0 || totalDeletions > 0;

  return (
    <div
      className={cn(
        "flex items-center justify-between px-2 py-1",
        "text-[11px] text-muted-foreground",
        "border-b border-border/50",
        className,
      )}
      data-testid="commit-files-header"
    >
      {/* File count */}
      <span data-testid="file-count">
        {fileCount} {filesText} changed
      </span>

      {/* Line statistics - right margin accounts for badge width (14px) + gap (6px) in file items */}
      {hasStats ? (
        <DiffStatsDisplay stats={diffStats} className="mr-5" />
      ) : (
        <span className="font-mono mr-5">no line changes</span>
      )}
    </div>
  );
}

export const CommitFilesHeader = memo(CommitFilesHeaderComponent);

export default CommitFilesHeader;
