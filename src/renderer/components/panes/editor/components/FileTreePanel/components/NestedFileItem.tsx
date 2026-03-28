/**
 * File item for nested view mode.
 * Shows just the file name (folder context provided by parent).
 */

import path from "path-browserify";
import { FileText } from "lucide-react";
import { cn } from "@/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { GitBadge, getStatusConfig } from "../../shared";
import { FileDiffStats } from "../../FileDiffStats";
import { ActionButtons } from "./ActionButtons";
import { FileTreeItemRename } from "../FileTreeItemRename";
import type { FileEntry } from "../utils/types";

export interface NestedFileItemProps {
  /** File entry with path, name, and status */
  file: FileEntry;
  /** Working directory (for building absolute path in tooltip) */
  cwd: string;
  /** Whether this item is the primary selected file */
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
  /** Whether to show unseen indicator on git badge (Follow mode) */
  showUnseenIndicator?: boolean;
  /** Callback when right-clicked for context menu */
  onContextMenu?: (event: React.MouseEvent) => void;
  // ---------------------------------------------------------------------------
  // Inline Rename Props
  // ---------------------------------------------------------------------------
  /** Whether this item is currently being renamed */
  isRenaming?: boolean;
  /** Callback when rename is committed with new name */
  onCommitRename?: (newName: string) => void;
  /** Callback when rename is cancelled */
  onCancelRename?: () => void;
}

export function NestedFileItem({
  file,
  cwd,
  isSelected,
  isMultiSelected,
  isStaged,
  canRevert,
  onSelect,
  onStage,
  onUnstage,
  onRevert,
  showUnseenIndicator = false,
  onContextMenu,
  isRenaming = false,
  onCommitRename,
  onCancelRename,
}: NestedFileItemProps) {
  // Get text color class from git status
  const statusConfig = getStatusConfig(file.status);
  const textColorClass = statusConfig?.textColorClass ?? "text-foreground";
  const iconColorClass = statusConfig?.textColorClass ?? "text-foreground";

  // Build tooltip: absolute path • git status label
  const absolutePath = path.join(cwd, file.path);
  const statusLabel = statusConfig?.label ?? file.status.status;
  const tooltip = `${absolutePath} • ${statusLabel}`;

  // Determine background styling based on selection state
  const isHighlighted = isSelected || isMultiSelected;

  // When renaming, render a special inline edit row
  if (isRenaming && onCommitRename && onCancelRename) {
    return (
      <li>
        <div
          className={cn(
            "group flex w-full items-center gap-1.5 rounded-md px-1.5 py-px text-[13px]",
            "ring-1 ring-accent/60",
          )}
          data-testid={`nested-file-${file.name}-renaming`}
        >
          {/* Spacer to align with folder chevrons */}
          <div style={{ width: 12 }} />

          {/* File icon */}
          <FileText className={cn("flex-shrink-0", iconColorClass)} size={12} />

          {/* Inline rename input */}
          <FileTreeItemRename
            initialName={file.name}
            isDirectory={false}
            onCommit={onCommitRename}
            onCancel={onCancelRename}
          />

          {/* Git status badge (keep visible during rename) */}
          <GitBadge
            status={file.status}
            showUnseenIndicator={showUnseenIndicator}
          />
        </div>
      </li>
    );
  }

  return (
    <li>
      <TooltipProvider delayDuration={2000} skipDelayDuration={2000}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className={cn(
                "group flex w-full items-center gap-1.5 rounded-md px-1.5 py-px text-[13px] text-left transition cursor-pointer",
                "focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
                isHighlighted
                  ? "bg-accent/20 hover:bg-accent/25"
                  : "hover:bg-foreground/10",
              )}
              onClick={onSelect}
              onContextMenu={onContextMenu}
              data-testid={`nested-file-${file.name}`}
              data-path={file.path}
            >
              {/* Spacer to align with folder chevrons */}
              <div style={{ width: 12 }} />

              {/* File icon - colored based on git status */}
              <FileText
                className={cn("flex-shrink-0", iconColorClass)}
                size={12}
              />

              {/* File name */}
              <span className={cn("min-w-0 flex-1 truncate", textColorClass)}>
                {file.name}
              </span>

              {/* Diff stats / Action buttons - mutually exclusive via display:none/block */}
              {/* Stats: shown by default, hidden on hover */}
              <div className="flex-shrink-0 block group-hover:hidden">
                <FileDiffStats
                  filePath={file.path}
                  staged={isStaged}
                  isUnseen={showUnseenIndicator}
                />
              </div>
              {/* Action buttons: hidden by default, shown on hover */}
              <div className="flex-shrink-0 hidden group-hover:block">
                <ActionButtons
                  isStaged={isStaged}
                  canRevert={canRevert}
                  onStage={onStage}
                  onUnstage={onUnstage}
                  onRevert={onRevert}
                />
              </div>

              {/* Git status badge */}
              <GitBadge
                status={file.status}
                showUnseenIndicator={showUnseenIndicator}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start">
            {tooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </li>
  );
}
