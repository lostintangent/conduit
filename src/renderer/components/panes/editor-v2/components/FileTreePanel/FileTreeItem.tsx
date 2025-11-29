/**
 * FileTreeItem - Individual item in the file tree.
 *
 * Renders a file or directory with:
 * - Appropriate icon (file or folder)
 * - Name with indentation based on depth
 * - Git status badge (if applicable)
 * - Selection highlighting
 * - Expand/collapse for directories
 *
 * @example
 * ```tsx
 * <FileTreeItem
 *   entry={{ name: "index.ts", type: "file" }}
 *   path="/project/src/index.ts"
 *   depth={1}
 *   gitStatus={{ status: "modified", staged: false, path: "src/index.ts" }}
 *   isSelected={true}
 *   onSelect={(path) => setSelected(path)}
 * />
 * ```
 */

import { memo, useCallback } from "react";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
} from "lucide-react";
import type { DirectoryEntry } from "@/../../src/ipc/fsv2/types";
import type { GitFileStatus } from "@/../../src/ipc/gitv2/types";
import { cn } from "@/utils";
import { GitBadge } from "../shared";

// ============================================================================
// Types
// ============================================================================

export interface FileTreeItemProps {
  /** Directory entry (name and type) */
  entry: DirectoryEntry;

  /** Full absolute path to the item */
  path: string;

  /** Nesting depth for indentation (0 = root level) */
  depth: number;

  /** Git status for this file (null if unchanged) */
  gitStatus: GitFileStatus | null;

  /** Whether this item is currently selected */
  isSelected: boolean;

  /** Whether this directory is expanded (only for directories) */
  isExpanded?: boolean;

  /** Callback when item is selected (clicked) */
  onSelect: (path: string, type: "file" | "directory") => void;

  /** Callback when directory expand/collapse is toggled */
  onToggleExpand?: (path: string) => void;

  /** Children to render when expanded (for directories) */
  children?: React.ReactNode;

  /**
   * Custom display path to show instead of entry.name.
   * Useful for branch comparison mode where we want to show the relative path.
   */
  displayPath?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * File tree item component.
 *
 * Memoized to prevent unnecessary re-renders in large trees.
 */
export const FileTreeItem = memo(function FileTreeItem({
  entry,
  path,
  depth,
  gitStatus,
  isSelected,
  isExpanded = false,
  onSelect,
  onToggleExpand,
  children,
  displayPath,
}: FileTreeItemProps) {
  const isDirectory = entry.type === "directory";

  // Handle click on the item
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(path, entry.type);
    },
    [path, entry.type, onSelect],
  );

  // Handle click on the expand/collapse chevron
  const handleToggleExpand = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggleExpand?.(path);
    },
    [path, onToggleExpand],
  );

  // Calculate indentation padding (16px per level)
  const paddingLeft = depth * 16 + 4;

  // Choose appropriate icon
  const Icon = isDirectory ? (isExpanded ? FolderOpen : Folder) : File;

  return (
    <div data-testid="file-tree-item">
      {/* Item row */}
      <div
        className={cn(
          "flex items-center gap-1 py-0.5 px-1 cursor-pointer rounded-sm",
          "hover:bg-accent/50 transition-colors",
          isSelected && "bg-accent text-accent-foreground",
        )}
        style={{ paddingLeft }}
        onClick={handleClick}
        data-testid={`tree-item-${entry.name}`}
        data-path={path}
        data-type={entry.type}
      >
        {/* Expand/collapse chevron for directories */}
        {isDirectory ? (
          <button
            className="flex-shrink-0 w-4 h-4 flex items-center justify-center hover:bg-accent rounded"
            onClick={handleToggleExpand}
            data-testid="toggle-expand"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3" />
            ) : (
              <ChevronRight className="w-3 h-3" />
            )}
          </button>
        ) : (
          // Spacer for files to align with directories
          <div className="w-4" />
        )}

        {/* Icon */}
        <Icon
          className={cn(
            "flex-shrink-0 w-4 h-4",
            isDirectory ? "text-blue-400" : "text-muted-foreground",
          )}
        />

        {/* Name - use displayPath if provided (for branch comparison mode) */}
        <span className="flex-1 truncate text-sm">
          {displayPath ?? entry.name}
        </span>

        {/* Git status badge */}
        {gitStatus && <GitBadge status={gitStatus} />}
      </div>

      {/* Children (expanded directory contents) */}
      {isDirectory && isExpanded && children}
    </div>
  );
});
