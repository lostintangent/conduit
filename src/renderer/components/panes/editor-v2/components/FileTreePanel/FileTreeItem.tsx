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
  FolderInput,
} from "lucide-react";
import type { DirectoryEntry } from "@/../../src/ipc/fsv2/types";
import type { GitFileStatus } from "@/../../src/ipc/gitv2/types";
import { cn } from "@/utils";
import { GitBadge, getStatusConfig, aggregateFolderStatus } from "../shared";
import { FileTreeItemRename } from "./FileTreeItemRename";

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

  /** Whether this item is currently selected (file open in editor) */
  isSelected: boolean;

  /**
   * Whether this item has keyboard focus.
   * Distinct from isSelected - focus is for keyboard navigation,
   * selection indicates the file open in the editor.
   */
  isFocused?: boolean;

  /** Whether this directory is expanded (only for directories) */
  isExpanded?: boolean;

  /** Callback when item is selected (clicked) */
  onSelect: (path: string, type: "file" | "directory") => void;

  /** Callback when directory expand/collapse is toggled */
  onToggleExpand?: (path: string) => void;

  /** Callback when "change to this directory" is clicked */
  onDirectoryChange?: (path: string) => void;

  /** Children to render when expanded (for directories) */
  children?: React.ReactNode;

  /**
   * Custom display path to show instead of entry.name.
   * Useful for branch comparison mode where we want to show the relative path.
   */
  displayPath?: string;

  // ---------------------------------------------------------------------------
  // Inline Rename Props
  // ---------------------------------------------------------------------------

  /** Whether this item is currently being renamed */
  isRenaming?: boolean;

  /** Callback when rename is committed with the new name */
  onRenameCommit?: (newName: string) => void;

  /** Callback when rename is cancelled */
  onRenameCancel?: () => void;

  /**
   * Optional callback to check if a sibling with this name already exists.
   * Used for validation during rename.
   */
  checkNameConflict?: (name: string) => boolean;

  /**
   * Callback when user right-clicks on the item.
   * Provides the item's path and the mouse event.
   */
  onContextMenu?: (path: string, e: React.MouseEvent) => void;

  /**
   * Callback when user hovers over a file item.
   * Used for prefetching file content to reduce perceived latency.
   * Only called for files, not directories.
   */
  onFileHover?: (path: string) => void;

  /**
   * Callback when user stops hovering over a file item.
   * Used to cancel prefetch if user moves away quickly.
   */
  onFileHoverEnd?: (path: string) => void;
}

/**
 * File tree item component.
 *
 * Note: We intentionally do NOT use a custom arePropsEqual here.
 * While skipping `children` comparison could help performance for unchanged items,
 * it breaks selection highlighting because when a parent directory's props haven't
 * changed, it bails out completely and its children JSX is never re-created with
 * updated isSelected props.
 */
export const FileTreeItem = memo(function FileTreeItem({
  entry,
  path,
  relativePath,
  depth,
  gitStatus,
  gitStatusMap,
  isSelected,
  isFocused = false,
  isExpanded = false,
  onSelect,
  onToggleExpand,
  onDirectoryChange,
  children,
  displayPath,
  isRenaming = false,
  onRenameCommit,
  onRenameCancel,
  checkNameConflict,
  onContextMenu,
  onFileHover,
  onFileHoverEnd,
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

  // Handle "change to this directory" click
  const handleChangeCwd = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDirectoryChange?.(path);
    },
    [path, onDirectoryChange],
  );

  // Handle right-click context menu
  const handleRightClick = useCallback(
    (e: React.MouseEvent) => {
      onContextMenu?.(path, e);
    },
    [path, onContextMenu],
  );

  // Handle mouse enter for prefetching (files only)
  const handleMouseEnter = useCallback(() => {
    if (!isDirectory && onFileHover) {
      onFileHover(path);
    }
  }, [isDirectory, onFileHover, path]);

  // Handle mouse leave to cancel prefetch
  const handleMouseLeave = useCallback(() => {
    if (!isDirectory && onFileHoverEnd) {
      onFileHoverEnd(path);
    }
  }, [isDirectory, onFileHoverEnd, path]);

  // Choose appropriate icon
  const Icon = isDirectory ? (isExpanded ? FolderOpen : Folder) : FileText;

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

  // For files, selection implies focus (for keyboard nav to work after clicking).
  // This avoids needing a separate state update for focusedPath when clicking files,
  // which would cause double renders.
  // For directories, we use the explicit isFocused prop.
  const effectiveFocus = isDirectory ? isFocused : isFocused || isSelected;

  return (
    <li
      role="treeitem"
      aria-selected={effectiveFocus}
      aria-expanded={isDirectory ? isExpanded : undefined}
      aria-level={depth + 1}
      data-testid="file-tree-item"
    >
      {/* Item row */}
      <div
        tabIndex={effectiveFocus ? 0 : -1}
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md px-1.5 py-px text-[13px] text-left transition cursor-pointer",
          // Focus styling (keyboard navigation) - ring only when element has DOM focus
          "focus:outline-none focus:ring-1 focus:ring-accent/60",
          // Selection styling (file open in editor) - background highlight
          isSelected
            ? "bg-accent/20 hover:bg-accent/25"
            : "hover:bg-foreground/10",
        )}
        onClick={handleRowClick}
        onContextMenu={handleRightClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        data-testid={`tree-item-${entry.name}`}
        data-path={path}
        data-type={entry.type}
      >
        {/* Expand/collapse chevron for directories */}
        {isDirectory ? (
          <span
            className="flex-shrink-0 flex items-center justify-center"
            data-testid="toggle-expand"
          >
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

        {/* Name or Rename Input */}
        {isRenaming && onRenameCommit && onRenameCancel ? (
          <FileTreeItemRename
            initialName={entry.name}
            isDirectory={isDirectory}
            onCommit={onRenameCommit}
            onCancel={onRenameCancel}
            checkNameConflict={checkNameConflict}
          />
        ) : (
          <span
            className={cn("min-w-0 flex-1 truncate", textColorClass)}
            title={displayPath ?? entry.name}
          >
            {displayPath ?? entry.name}
          </span>
        )}

        {/* Action buttons container - hidden during rename */}
        {!isRenaming && (
          <div className="shrink-0 flex items-center gap-1">
            {/* Change to this directory button (directories only, on hover) */}
            {isDirectory && onDirectoryChange && (
              <button
                type="button"
                tabIndex={-1}
                onClick={handleChangeCwd}
                className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-foreground/20 transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
                title="Change to this directory"
                data-testid="change-directory-button"
              >
                <FolderInput size={12} />
              </button>
            )}

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
        )}
      </div>

      {/* Children (expanded directory contents) - with vertical connecting line */}
      {isDirectory && isExpanded && (
        <ul role="group" className="mt-0.5 border-l border-border pl-2">
          {children}
        </ul>
      )}
    </li>
  );
});
