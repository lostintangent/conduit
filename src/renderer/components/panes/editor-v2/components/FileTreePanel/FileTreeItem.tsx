/**
 * FileTreeItem - Individual item in the file tree.
 *
 * Renders a file or directory with:
 * - Appropriate icon (file or folder)
 * - Name with indentation based on depth
 * - Git status badge (letter for files, dot for folders)
 * - Text coloring based on git status (files only)
 * - Selection highlighting
 * - Expand/collapse for directories
 *
 * @example
 * ```tsx
 * <FileTreeItem
 *   entry={{ name: "index.ts", type: "file" }}
 *   path="/project/src/index.ts"
 *   relativePath="src/index.ts"
 *   depth={1}
 *   gitStatus={{ status: "modified", staged: false, path: "src/index.ts" }}
 *   isSelected={true}
 *   onSelect={(path) => setSelected(path)}
 * />
 * ```
 */

import { memo, useCallback, useMemo } from "react";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";
import type { DirectoryEntry } from "@/../../src/ipc/fsv2/types";
import type { GitFileStatus } from "@/../../src/ipc/gitv2/types";
import { cn } from "@/utils";
import { GitBadge, getStatusConfig, aggregateFolderStatus } from "../shared";

// ============================================================================
// Types
// ============================================================================

export interface FileTreeItemProps {
  /** Directory entry (name and type) */
  entry: DirectoryEntry;

  /** Full absolute path to the item */
  path: string;

  /** Relative path from cwd (for folder aggregation) */
  relativePath?: string;

  /** Nesting depth for indentation (0 = root level) */
  depth: number;

  /** Git status for this file (null if unchanged) */
  gitStatus: GitFileStatus | null;

  /** Git status map for folder aggregation (relative paths) */
  gitStatusMap?: Map<string, GitFileStatus> | null;

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
  relativePath,
  depth,
  gitStatus,
  gitStatusMap,
  isSelected,
  isExpanded = false,
  onSelect,
  onToggleExpand,
  children,
  displayPath,
}: FileTreeItemProps) {
  const isDirectory = entry.type === "directory";

  // Handle click on the item row
  // - For directories: toggle expand/collapse (like v1)
  // - For files: select the file
  const handleRowClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isDirectory) {
        onToggleExpand?.(path);
      } else {
        onSelect(path, entry.type);
      }
    },
    [path, entry.type, isDirectory, onSelect, onToggleExpand],
  );

  // Choose appropriate icon
  const Icon = isDirectory ? (isExpanded ? FolderOpen : Folder) : FileText;

  // Depth is no longer used for padding - indentation comes from nested ul elements
  void depth;

  // ---------------------------------------------------------------------------
  // Git Status Styling
  // ---------------------------------------------------------------------------

  // For files: get text color class from git status
  const fileStatusConfig = useMemo(() => {
    if (isDirectory || !gitStatus) return null;
    return getStatusConfig(gitStatus);
  }, [isDirectory, gitStatus]);

  // For directories: compute aggregated status from children
  const folderStatus = useMemo(() => {
    if (!isDirectory || !gitStatusMap || !relativePath) return null;
    return aggregateFolderStatus(gitStatusMap, relativePath);
  }, [isDirectory, gitStatusMap, relativePath]);

  // Text color: files get colored based on git status, folders stay default
  const textColorClass = fileStatusConfig?.textColorClass ?? "text-foreground";
  const iconColorClass = fileStatusConfig?.textColorClass ?? "text-foreground";

  return (
    <li data-testid="file-tree-item">
      {/* Item row */}
      <div
        role="button"
        tabIndex={0}
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[13px] text-left transition cursor-pointer",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
          isSelected
            ? "bg-accent/20 hover:bg-accent/25"
            : "hover:bg-foreground/10",
        )}
        onClick={handleRowClick}
        data-testid={`tree-item-${entry.name}`}
        data-path={path}
        data-type={entry.type}
      >
        {/* Expand/collapse chevron for directories */}
        {isDirectory ? (
          <span className="flex-shrink-0 flex items-center justify-center">
            {isExpanded ? (
              <ChevronDown className="text-foreground" size={12} />
            ) : (
              <ChevronRight className="text-foreground" size={12} />
            )}
          </span>
        ) : (
          // Spacer for files to align with directories
          <div style={{ width: 12 }} />
        )}

        {/* Icon - colored for files with git status */}
        <Icon className={cn("flex-shrink-0", iconColorClass)} size={12} />

        {/* Name - colored for files with git status */}
        <span
          className={cn("min-w-0 flex-1 truncate", textColorClass)}
          title={displayPath ?? entry.name}
        >
          {displayPath ?? entry.name}
        </span>

        {/* Git status badge: letter for files, dot for folders */}
        {gitStatus && !isDirectory && <GitBadge status={gitStatus} />}
        {isDirectory && folderStatus && (
          <div
            className={cn(
              "flex-shrink-0 w-1.5 h-1.5 rounded-full",
              folderStatus.colorClass,
            )}
            title={folderStatus.label}
            data-testid="git-badge-folder"
          />
        )}
      </div>

      {/* Children (expanded directory contents) - with vertical connecting line */}
      {isDirectory && isExpanded && (
        <ul className="mt-0.5 border-l border-border pl-2">{children}</ul>
      )}
    </li>
  );
});
