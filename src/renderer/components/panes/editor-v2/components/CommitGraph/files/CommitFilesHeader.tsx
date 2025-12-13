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

import { memo } from "react";
import { cn } from "@/utils";

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

      {/* Line statistics */}
      <span className="font-mono" data-testid="line-totals">
        {totalAdditions > 0 && (
          <span className="text-git-added">+{totalAdditions}</span>
        )}
        {totalAdditions > 0 && totalDeletions > 0 && (
          <span className="mx-1">/</span>
        )}
        {totalDeletions > 0 && (
          <span className="text-git-deleted">-{totalDeletions}</span>
        )}
        {totalAdditions === 0 && totalDeletions === 0 && (
          <span>no line changes</span>
        )}
      </span>
    </div>
  );
}

export const CommitFilesHeader = memo(CommitFilesHeaderComponent);

export default CommitFilesHeader;
