/**
 * CommitFileStatusBadge Component
 *
 * Displays a small colored badge indicating the type of file change
 * within a commit (added, modified, deleted, renamed, copied).
 *
 * Similar to GitBadge but tailored for historical commit files
 * which have a simpler status model (no staged property).
 *
 * @example
 * ```tsx
 * <CommitFileStatusBadge status="modified" />
 * <CommitFileStatusBadge status="renamed" />
 * ```
 */

import { memo } from "react";
import { cn } from "@/utils";
import type { CommitFile } from "../types";

// =============================================================================
// Types
// =============================================================================

export interface CommitFileStatusBadgeProps {
  /** The file change status */
  status: CommitFile["status"];

  /** Optional additional class names */
  className?: string;
}

/**
 * Display configuration for each status type.
 */
interface StatusDisplayConfig {
  /** Single letter to display */
  letter: string;

  /** Tailwind background color class */
  bgColor: string;

  /** Tailwind text color for file name coloring */
  textColor: string;

  /** Tooltip/title text */
  label: string;
}

// =============================================================================
// Status Configuration
// =============================================================================

/**
 * Status display configurations.
 * Uses the same color scheme as GitBadge for consistency.
 */
const STATUS_CONFIG: Record<CommitFile["status"], StatusDisplayConfig> = {
  added: {
    letter: "A",
    bgColor: "bg-git-added",
    textColor: "text-git-added",
    label: "Added",
  },
  modified: {
    letter: "M",
    bgColor: "bg-git-modified",
    textColor: "text-git-modified",
    label: "Modified",
  },
  deleted: {
    letter: "D",
    bgColor: "bg-git-deleted",
    textColor: "text-git-deleted",
    label: "Deleted",
  },
  renamed: {
    letter: "R",
    bgColor: "bg-git-renamed",
    textColor: "text-git-renamed",
    label: "Renamed",
  },
  copied: {
    letter: "C",
    bgColor: "bg-git-copied",
    textColor: "text-git-copied",
    label: "Copied",
  },
};

/**
 * Get the display configuration for a status.
 */
export function getCommitFileStatusConfig(
  status: CommitFile["status"],
): StatusDisplayConfig {
  return STATUS_CONFIG[status];
}

// =============================================================================
// Component
// =============================================================================

/**
 * Status badge for commit file changes.
 *
 * Renders a compact colored badge with a single letter
 * indicating the type of change (A, M, D, R, C).
 */
function CommitFileStatusBadgeComponent({
  status,
  className,
}: CommitFileStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <div
      className={cn(
        "flex-shrink-0 flex items-center justify-center",
        "text-[10px] font-semibold leading-none",
        "w-[14px] h-[14px] rounded-sm text-background",
        config.bgColor,
        className,
      )}
      title={config.label}
      data-testid="commit-file-status-badge"
      data-status={status}
    >
      {config.letter}
    </div>
  );
}

export const CommitFileStatusBadge = memo(CommitFileStatusBadgeComponent);

export default CommitFileStatusBadge;
