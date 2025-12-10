/**
 * Change item for flat view mode.
 * Shows file name with folder path as subtext.
 */

import { FileText } from "lucide-react";
import type { GitFileStatus } from "@/../../src/ipc/gitv2/types";
import { cn } from "@/utils";
import { GitBadge, getStatusConfig } from "../../shared";
import { ActionButtons } from "./ActionButtons";

export interface FlatChangeItemProps {
  /** File path (relative to cwd) */
  path: string;
  /** Git status for this file */
  status: GitFileStatus;
  /** Whether this item is the primary selected file (for opening in editor) */
  isSelected: boolean;
  /** Whether this item is part of multi-selection */
  isMultiSelected: boolean;
  /** Whether file is staged */
  isStaged: boolean;
  /** Whether file can be reverted (false for untracked files) */
  canRevert: boolean;
  /** Callback when file is clicked (passes event for shift/cmd detection) */
  onSelect: (event: React.MouseEvent) => void;
  /** Callback to stage file */
  onStage?: () => void;
  /** Callback to unstage file */
  onUnstage?: () => void;
  /** Callback to revert file */
  onRevert?: () => void;
}

/**
 * Get the directory path from a file path.
 * Returns empty string for root-level files.
 */
function getDirectoryPath(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  return lastSlash === -1 ? "" : filePath.slice(0, lastSlash);
}

export function FlatChangeItem({
  path,
  status,
  isSelected,
  isMultiSelected,
  isStaged,
  canRevert,
  onSelect,
  onStage,
  onUnstage,
  onRevert,
}: FlatChangeItemProps) {
  const fileName = path.split("/").pop() ?? path;
  const folderPath = getDirectoryPath(path);

  // Get text color class from git status
  const statusConfig = getStatusConfig(status);
  const textColorClass = statusConfig?.textColorClass ?? "text-foreground";
  const iconColorClass = statusConfig?.textColorClass ?? "text-foreground";

  // Determine background styling based on selection state
  const isHighlighted = isSelected || isMultiSelected;

  return (
    <li>
      <button
        type="button"
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[13px] text-left transition cursor-pointer",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
          isHighlighted
            ? "bg-accent/20 hover:bg-accent/25"
            : "hover:bg-foreground/10",
        )}
        onClick={onSelect}
        data-testid={`change-item-${fileName}`}
        data-path={path}
      >
        {/* File icon - colored based on git status */}
        <FileText className={cn("flex-shrink-0", iconColorClass)} size={12} />

        {/* File name and folder path */}
        <div className="min-w-0 flex-1 flex items-baseline gap-1.5">
          <span className={cn("truncate", textColorClass)}>{fileName}</span>
          {folderPath && (
            <span className="text-foreground/40 text-[11px] truncate">
              {folderPath}
            </span>
          )}
        </div>

        {/* Action buttons (stage/unstage/revert) */}
        <ActionButtons
          isStaged={isStaged}
          canRevert={canRevert}
          onStage={onStage}
          onUnstage={onUnstage}
          onRevert={onRevert}
        />

        {/* Git status badge */}
        <GitBadge status={status} />
      </button>
    </li>
  );
}
