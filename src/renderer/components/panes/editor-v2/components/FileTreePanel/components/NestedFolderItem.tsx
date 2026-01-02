/**
 * Folder item for nested view mode.
 * Shows folder with expandable children and action buttons.
 * Folders are selectable with shift/cmd modifiers for multi-select.
 */

import { ChevronRight, ChevronDown, Folder, FolderOpen } from "lucide-react";
import { cn } from "@/utils";
import { ActionButtons } from "./ActionButtons";
import { NestedFileItem } from "./NestedFileItem";
import type { FolderNode } from "../utils/types";

export interface NestedFolderItemProps {
  /** Folder node with path, name, files, and subfolders */
  folder: FolderNode;
  /** Working directory (for building absolute path in tooltip) */
  cwd: string;
  /** Set of expanded folder paths */
  expandedFolders: Set<string>;
  /** Toggle folder expansion */
  onToggleFolder: (path: string) => void;
  /**
   * Selected map key for highlighting.
   * The key matches the git status Map key (includes UNSTAGED_KEY_SUFFIX for unstaged entries).
   */
  selectedMapKey?: string | null;
  /** Set of multi-selected paths (includes folders) */
  multiSelectedPaths: Set<string>;
  /** Whether files in this folder are staged */
  isStaged: boolean;
  /**
   * Callback when file/folder is clicked.
   * For files: (mapKey, filePath, event, isFolder=false)
   * For folders: (mapKey, filePath, event, isFolder=true) where mapKey === filePath
   */
  onFileSelect: (
    mapKey: string,
    filePath: string,
    event: React.MouseEvent,
    isFolder?: boolean,
  ) => void;
  /** Callback to stage file/folder (uses mapKey) */
  onStage?: (mapKey: string) => void;
  /** Callback to unstage file/folder (uses mapKey) */
  onUnstage?: (mapKey: string) => void;
  /** Callback to revert file/folder (uses mapKey) */
  onRevert?: (mapKey: string) => void;
  /** Check if a file is unseen (Follow mode) */
  isFileUnseen?: (path: string) => boolean;
}

export function NestedFolderItem({
  folder,
  cwd,
  expandedFolders,
  onToggleFolder,
  selectedMapKey,
  multiSelectedPaths,
  isStaged,
  onFileSelect,
  onStage,
  onUnstage,
  onRevert,
  isFileUnseen,
}: NestedFolderItemProps) {
  const isExpanded = expandedFolders.has(folder.path);
  const FolderIcon = isExpanded ? FolderOpen : Folder;
  const isFolderSelected = multiSelectedPaths.has(folder.path);

  // Sort files and subfolders alphabetically
  const sortedFiles = [...folder.files].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const sortedFolders = [...folder.folders.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  /**
   * Check if a file should be shown as selected.
   * Simply compares the entry's mapKey with the selectedMapKey.
   */
  const isFileSelected = (mapKey: string): boolean => {
    return selectedMapKey === mapKey;
  };

  /**
   * Handle folder click - toggle expansion OR select with shift/cmd.
   * Regular click toggles expansion.
   * Shift/Cmd+click handles selection without toggling.
   */
  const handleFolderClick = (event: React.MouseEvent) => {
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      // Shift/Cmd click: handle selection, don't toggle expansion
      event.preventDefault();
      // For folders, mapKey === path
      onFileSelect(folder.path, folder.path, event, true);
    } else {
      // Regular click: toggle expansion
      onToggleFolder(folder.path);
    }
  };

  return (
    <li data-testid={`nested-folder-${folder.name}`}>
      {/* Folder row */}
      <button
        type="button"
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md px-1.5 py-px text-[13px] text-left transition cursor-pointer",
          "focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40",
          isFolderSelected
            ? "bg-accent/20 hover:bg-accent/25"
            : "hover:bg-foreground/10",
        )}
        onClick={handleFolderClick}
        data-testid={`folder-toggle-${folder.name}`}
      >
        {/* Expand/collapse chevron - always toggles on click */}
        <span
          className="flex-shrink-0 flex items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFolder(folder.path);
          }}
        >
          {isExpanded ? (
            <ChevronDown className="text-foreground" size={12} />
          ) : (
            <ChevronRight className="text-foreground" size={12} />
          )}
        </span>

        {/* Folder icon */}
        <FolderIcon className="flex-shrink-0 text-foreground" size={12} />

        {/* Folder name */}
        <span className="min-w-0 flex-1 truncate text-foreground">
          {folder.name}
        </span>

        {/* Action buttons (visible on hover) */}
        <ActionButtons
          isStaged={isStaged}
          canRevert={!isStaged}
          onStage={onStage ? () => onStage(folder.path) : undefined}
          onUnstage={onUnstage ? () => onUnstage(folder.path) : undefined}
          onRevert={onRevert ? () => onRevert(folder.path) : undefined}
          itemType="folder"
        />
      </button>

      {/* Children (when expanded) */}
      {isExpanded && (
        <ul className="border-l border-border pl-2">
          {/* Subfolders first */}
          {sortedFolders.map((subfolder) => (
            <NestedFolderItem
              key={subfolder.path}
              folder={subfolder}
              cwd={cwd}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              selectedMapKey={selectedMapKey}
              multiSelectedPaths={multiSelectedPaths}
              isStaged={isStaged}
              onFileSelect={onFileSelect}
              onStage={onStage}
              onUnstage={onUnstage}
              onRevert={onRevert}
              isFileUnseen={isFileUnseen}
            />
          ))}

          {/* Then files */}
          {sortedFiles.map((file) => (
            <NestedFileItem
              key={file.mapKey}
              file={file}
              cwd={cwd}
              isSelected={isFileSelected(file.mapKey)}
              isMultiSelected={multiSelectedPaths.has(file.mapKey)}
              isStaged={isStaged}
              canRevert={true}
              onSelect={(event) => onFileSelect(file.mapKey, file.path, event)}
              onStage={onStage ? () => onStage(file.mapKey) : undefined}
              onUnstage={onUnstage ? () => onUnstage(file.mapKey) : undefined}
              onRevert={onRevert ? () => onRevert(file.mapKey) : undefined}
              showUnseenIndicator={isFileUnseen?.(file.path)}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
