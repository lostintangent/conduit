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

import { memo, useCallback } from "react";
import { FileText } from "lucide-react";
import { cn } from "@/utils";
import type { CommitFile } from "../types";
import {
  CommitFileStatusBadge,
  getCommitFileStatusConfig,
} from "./CommitFileStatusBadge";

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
 * Extract file name from path.
 */
function getFileName(filePath: string): string {
  return filePath.split("/").pop() ?? filePath;
}

/**
 * Extract directory path from file path.
 * Returns empty string for root-level files.
 */
function getDirectoryPath(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  return lastSlash === -1 ? "" : filePath.slice(0, lastSlash);
}

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

// =============================================================================
// Sub-components
// =============================================================================

/**
 * Displays +N -M line statistics.
 */
function LineStats({
  additions,
  deletions,
}: {
  additions?: number;
  deletions?: number;
}) {
  if (additions === undefined && deletions === undefined) {
    return null;
  }

  return (
    <span
      className="flex-shrink-0 text-[11px] font-mono text-muted-foreground"
      data-testid="line-stats"
    >
      {additions !== undefined && additions > 0 && (
        <span className="text-git-added">+{additions}</span>
      )}
      {additions !== undefined &&
        additions > 0 &&
        deletions !== undefined &&
        deletions > 0 && <span className="mx-0.5">/</span>}
      {deletions !== undefined && deletions > 0 && (
        <span className="text-git-deleted">-{deletions}</span>
      )}
    </span>
  );
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
  const statusConfig = getCommitFileStatusConfig(file.status);

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
          className={cn("flex-shrink-0", statusConfig.textColor)}
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
          <span className={cn("truncate", statusConfig.textColor)}>
            {fileName}
          </span>
          {folderPath && (
            <span className="truncate text-foreground/40 text-[11px]">
              {folderPath}
            </span>
          )}
        </div>

        {/* Line statistics */}
        <LineStats additions={file.additions} deletions={file.deletions} />

        {/* Status badge */}
        <CommitFileStatusBadge status={file.status} />
      </button>
    </li>
  );
}

export const CommitFileItem = memo(CommitFileItemComponent);

export default CommitFileItem;
