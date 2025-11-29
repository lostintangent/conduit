/**
 * GitBadge - Shared component for displaying git status badges.
 *
 * Displays a small colored badge with a status letter (M, A, D, etc.)
 * to indicate the git status of a file.
 *
 * @example
 * ```tsx
 * <GitBadge status={{ status: "modified", staged: false, path: "src/index.ts" }} />
 * ```
 */

import type { GitFileStatus } from "@/../../src/ipc/gitv2/types";
import { cn } from "@/utils";

// ============================================================================
// Types
// ============================================================================

export interface GitBadgeProps {
  /** Git status for the file */
  status: GitFileStatus;

  /** Optional additional class names */
  className?: string;
}

/**
 * Configuration for git status display.
 */
interface StatusConfig {
  /** Single letter to display */
  letter: string;

  /** Tailwind background color class */
  colorClass: string;

  /** Tooltip label */
  label: string;
}

// ============================================================================
// Status Configuration
// ============================================================================

/**
 * Get display configuration for a git status.
 *
 * @param status - Git file status object
 * @returns Configuration for the badge, or null if status should not show a badge
 */
export function getStatusConfig(status: GitFileStatus): StatusConfig | null {
  switch (status.status) {
    case "modified":
      return {
        letter: "M",
        colorClass: "bg-yellow-500",
        label: status.staged ? "Modified (staged)" : "Modified",
      };
    case "added":
      return {
        letter: "A",
        colorClass: "bg-green-500",
        label: status.staged ? "Added (staged)" : "Added",
      };
    case "deleted":
      return {
        letter: "D",
        colorClass: "bg-red-500",
        label: status.staged ? "Deleted (staged)" : "Deleted",
      };
    case "renamed":
      return {
        letter: "R",
        colorClass: "bg-blue-500",
        label: "Renamed",
      };
    case "copied":
      return {
        letter: "C",
        colorClass: "bg-blue-400",
        label: "Copied",
      };
    case "untracked":
      return {
        letter: "U",
        colorClass: "bg-gray-500",
        label: "Untracked",
      };
    case "unmerged":
      return {
        letter: "!",
        colorClass: "bg-orange-500",
        label: "Conflict",
      };
    case "ignored":
      return {
        letter: "I",
        colorClass: "bg-gray-400",
        label: "Ignored",
      };
    default:
      return null;
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * Small badge showing git status letter with colored background.
 *
 * Returns null if the status type doesn't require a visible badge.
 */
export function GitBadge({ status, className }: GitBadgeProps) {
  const config = getStatusConfig(status);
  if (!config) return null;

  return (
    <div
      className={cn(
        "flex-shrink-0 flex items-center justify-center",
        "text-[10px] font-semibold leading-none",
        "w-[14px] h-[14px] rounded-sm text-white",
        config.colorClass,
        className,
      )}
      title={config.label}
      data-testid="git-badge"
      data-status={status.status}
    >
      {config.letter}
    </div>
  );
}
