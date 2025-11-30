/**
 * GitBadge - Shared component for displaying git status badges.
 *
 * Displays a small colored badge with a status letter (M, A, D, etc.)
 * to indicate the git status of a file. For folders, shows a dot instead.
 *
 * @example
 * ```tsx
 * <GitBadge status={{ status: "modified", staged: false, path: "src/index.ts" }} />
 * <GitBadge status={{ status: "modified", staged: false, path: "src" }} isFolder />
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

  /** Whether this badge is for a folder (shows dot instead of letter) */
  isFolder?: boolean;

  /** Optional additional class names */
  className?: string;
}

/**
 * Configuration for git status display.
 * Follows VS Code's git status mapping.
 */
export interface StatusConfig {
  /** Single letter to display */
  letter: string;

  /** Tailwind background color class */
  colorClass: string;

  /** Tailwind text color class (for file name/icon coloring) */
  textColorClass: string;

  /** Tooltip label */
  label: string;

  /** Weight for folder aggregation (higher = higher priority) */
  weight: number;
}

// ============================================================================
// Status Configuration
// ============================================================================

/**
 * Get display configuration for a git status.
 * Uses semantic color classes matching VS Code's git decorations.
 *
 * @param status - Git file status object
 * @returns Configuration for the badge, or null if status should not show a badge
 */
export function getStatusConfig(status: GitFileStatus): StatusConfig | null {
  const { status: fileStatus, staged } = status;

  switch (fileStatus) {
    case "modified":
      return {
        letter: "M",
        colorClass: "bg-git-modified",
        textColorClass: "text-git-modified",
        label: staged ? "Modified (staged)" : "Modified",
        weight: 2,
      };
    case "added":
      return {
        letter: "A",
        colorClass: "bg-git-added",
        textColorClass: "text-git-added",
        label: staged ? "Added (staged)" : "Added",
        weight: 3,
      };
    case "deleted":
      return {
        letter: "D",
        colorClass: staged ? "bg-git-deleted-staged" : "bg-git-deleted",
        textColorClass: staged ? "text-git-deleted-staged" : "text-git-deleted",
        label: staged ? "Deleted (staged)" : "Deleted",
        weight: 3,
      };
    case "renamed":
      return {
        letter: "R",
        colorClass: "bg-git-renamed",
        textColorClass: "text-git-renamed",
        label: "Renamed",
        weight: 2,
      };
    case "copied":
      return {
        letter: "C",
        colorClass: "bg-git-copied",
        textColorClass: "text-git-copied",
        label: "Copied",
        weight: 2,
      };
    case "untracked":
      return {
        letter: "U",
        colorClass: "bg-git-untracked",
        textColorClass: "text-git-untracked",
        label: "Untracked",
        weight: 1,
      };
    case "unmerged":
      return {
        letter: "!",
        colorClass: "bg-git-conflict",
        textColorClass: "text-git-conflict",
        label: "Conflict",
        weight: 4,
      };
    case "ignored":
      return {
        letter: "I",
        colorClass: "bg-git-ignored",
        textColorClass: "text-git-ignored",
        label: "Ignored",
        weight: 0,
      };
    default:
      return null;
  }
}

// ============================================================================
// Component
// ============================================================================

/**
 * Git status badge for files and folders.
 *
 * For files: Shows a letter badge (M, A, D, R, C, U, T, I, !)
 * For folders: Shows a small colored dot
 *
 * Returns null if the status type doesn't require a visible badge.
 */
export function GitBadge({
  status,
  isFolder = false,
  className,
}: GitBadgeProps) {
  const config = getStatusConfig(status);
  if (!config) return null;

  // Folders show only a dot, not a letter
  if (isFolder) {
    return (
      <div
        className={cn(
          "flex-shrink-0 w-1.5 h-1.5 rounded-full",
          config.colorClass,
          className,
        )}
        title={config.label}
        data-testid="git-badge-folder"
        data-status={status.status}
      />
    );
  }

  // Files show a letter badge
  return (
    <div
      className={cn(
        "flex-shrink-0 flex items-center justify-center",
        "text-[10px] font-semibold leading-none",
        "w-[14px] h-[14px] rounded-sm text-background",
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
