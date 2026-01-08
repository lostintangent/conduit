/**
 * CommitFileItem Component
 *
 * Displays a single file from a commit's change list.
 * Shows file path, status badge, and optional line statistics.
 *
 * Used within CommitFilesPanel when a commit row is expanded.
 *
 * Layout:
 * ```
 * ┌──────────────────────────────────────────────────────┐
 * │ 📄 src/components/Button.tsx   +12 -3            [M] │
 * └──────────────────────────────────────────────────────┘
 * ```
 *
 * @example
 * ```tsx
 * <CommitFileItem
 *   file={{ path: "src/index.ts", status: "modified", additions: 10, deletions: 2 }}
 *   isSelected={false}
 *   onClick={() => viewFileDiff(file)}
 * />
 * ```
 */

import { memo, useCallback, useMemo } from "react";
import { FileText } from "lucide-react";
import { cn } from "@/utils";
import type { GitFileStatus } from "@/api/GitV2API";
import type { CommitFile } from "../types";
import { GitBadge, getStatusConfig } from "../../shared";
import { DiffStatsDisplay } from "../../FileDiffStats/DiffStatsDisplay";
import { getFileName, getDirectoryPath } from "../../../utils";

// =============================================================================
// Types
// =============================================================================

export interface CommitFileItemProps {
  /** The file to display */
  file: CommitFile;

  /** Whether this file is currently selected */
  isSelected?: boolean;

  /** Callback when the file is clicked */
  onClick?: (file: CommitFile) => void;

  /** Optional additional class names */
  className?: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Format a path for display, handling renames.
 */
function formatDisplayPath(file: CommitFile): {
  fileName: string;
  folderPath: string;
  tooltip: string;
} {
  const fileName = getFileName(file.path);
  const folderPath = getDirectoryPath(file.path);

  let tooltip = file.path;
  if (
    file.originalPath &&
    (file.status === "renamed" || file.status === "copied")
  ) {
    tooltip = `${file.originalPath} → ${file.path}`;
  }

  return { fileName, folderPath, tooltip };
}

/**
 * Convert CommitFile status to GitFileStatus for GitBadge.
 * Historical commits are treated as "staged" (committed).
 */
function toGitFileStatus(file: CommitFile): GitFileStatus {
  return {
    status: file.status,
    staged: true, // Historical commits are committed (effectively "staged")
    path: file.path,
  };
}

// =============================================================================
// Component
// =============================================================================

/**
 * Individual file row in the commit file list.
 *
 * Clickable row that displays:
 * - File icon (colored by status)
 * - File name and folder path
 * - Line statistics (+/-)
 * - Status badge
 */
function CommitFileItemComponent({
  file,
  isSelected = false,
  onClick,
  className,
}: CommitFileItemProps) {
  const { fileName, folderPath, tooltip } = formatDisplayPath(file);

  // Convert to GitFileStatus for shared components
  const gitFileStatus = useMemo(() => toGitFileStatus(file), [file]);
  const statusConfig = getStatusConfig(gitFileStatus);

  // Stats for DiffStatsDisplay
  const diffStats = useMemo(
    () => ({
      added: file.additions ?? 0,
      removed: file.deletions ?? 0,
    }),
    [file.additions, file.deletions],
  );
  const hasStats = diffStats.added > 0 || diffStats.removed > 0;

  const handleClick = useCallback(() => {
    onClick?.(file);
  }, [onClick, file]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick?.(file);
      }
    },
    [onClick, file],
  );

  return (
    <li>
      <button
        type="button"
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-sm px-2 py-0.5",
          "text-[12px] text-left transition cursor-pointer",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
          // Use same colors as FileTreeItem for selection
          isSelected
            ? "bg-accent/20 hover:bg-accent/25"
            : "hover:bg-foreground/5",
          className,
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        title={tooltip}
        data-testid={`commit-file-item-${fileName}`}
        data-filepath={file.path}
        data-selected={isSelected}
      >
        {/* File icon - colored based on status */}
        <FileText
          className={cn("flex-shrink-0", statusConfig?.textColorClass)}
          size={12}
        />

        {/* File name and folder path */}
        <div
          className="min-w-0 flex-1 items-baseline gap-1.5"
          style={{
            display: "grid",
            gridTemplateColumns: folderPath
              ? "minmax(0, auto) minmax(0, 1fr)"
              : "minmax(0, 1fr)",
          }}
        >
          <span className={cn("truncate", statusConfig?.textColorClass)}>
            {fileName}
          </span>
          {folderPath && (
            <span className="truncate text-foreground/40 text-[11px]">
              {folderPath}
            </span>
          )}
        </div>

        {/* Line statistics */}
        {hasStats && <DiffStatsDisplay stats={diffStats} />}

        {/* Status badge */}
        <GitBadge status={gitFileStatus} />
      </button>
    </li>
  );
}

export const CommitFileItem = memo(CommitFileItemComponent);

export default CommitFileItem;
