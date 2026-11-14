/**
 * Folder item for nested view mode.
 * Shows folder with expandable children and action buttons.
 * Folders are selectable with shift/cmd modifiers for multi-select.
 */

import path from "path-browserify";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
} from "lucide-react";
import { cn } from "@/utils";
import { ActionButtons } from "./ActionButtons";
import { ChangeFileItem } from "./ChangeFileItem";
import { FileTreeItemRename } from "../FileTreeItemRename";
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
   * Check if a file is selected by its map key.
   * Passed from parent to ensure consistent selection logic.
   */
  isFileSelected: (mapKey: string) => boolean;
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
  /**
   * Callback when right-clicked for context menu.
   * @param mapKey - The map key identifying the entry
   * @param filePath - The file/folder path (relative to cwd)
   * @param isDirectory - Whether the item is a directory
   * @param event - The mouse event
   */
  onContextMenu?: (
    mapKey: string,
    filePath: string,
    isDirectory: boolean,
    event: React.MouseEvent,
  ) => void;
  // ---------------------------------------------------------------------------
  // Inline Rename Props (passed through to child ChangeFileItem)
  // ---------------------------------------------------------------------------
  /** Path currently being renamed (relative to cwd), or null if not renaming */
  renamingPath?: string | null;
  /** Callback when rename is committed with new name */
  onCommitRename?: (newName: string) => void;
  /** Callback when rename is cancelled */
  onCancelRename?: () => void;
  // ---------------------------------------------------------------------------
  // Inline Creation Props
  // ---------------------------------------------------------------------------
  /** Absolute path where new file/folder is being created, or null */
  creatingInPath?: string | null;
  /** Type of item being created */
  creatingType?: "file" | "folder" | null;
  /** Callback when creation is committed with name */
  onCommitCreate?: (name: string) => void;
  /** Callback when creation is cancelled */
  onCancelCreate?: () => void;
}

export function NestedFolderItem({
  folder,
  cwd,
  expandedFolders,
  onToggleFolder,
  isFileSelected,
  multiSelectedPaths,
  isStaged,
  onFileSelect,
  onStage,
  onUnstage,
  onRevert,
  isFileUnseen,
  onContextMenu,
  renamingPath,
  onCommitRename,
  onCancelRename,
  creatingInPath,
  creatingType,
  onCommitCreate,
  onCancelCreate,
}: NestedFolderItemProps) {
  const isExpanded = expandedFolders.has(folder.path);
  const FolderIcon = isExpanded ? FolderOpen : Folder;
  const isFolderSelected = multiSelectedPaths.has(folder.path);
  const isFolderRenaming = renamingPath === folder.path;

  // Sort files and subfolders alphabetically
  const sortedFiles = [...folder.files].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const sortedFolders = [...folder.folders.values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );

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
      {/* Folder row. Like file rows, the row takes the click and the name
          button's clicks bubble up to it. */}
      <div
        className={cn(
          "group flex w-full items-center gap-1.5 rounded-md px-1.5 py-px text-[13px] transition cursor-pointer",
          "has-[>button:focus-visible]:ring-1 has-[>button:focus-visible]:ring-white/40",
          isFolderRenaming
            ? "ring-1 ring-accent/60"
            : isFolderSelected
              ? "bg-accent/20 hover:bg-accent/25"
              : "hover:bg-foreground/10",
        )}
        onClick={handleFolderClick}
        onContextMenu={
          onContextMenu
            ? (e) => onContextMenu(folder.path, folder.path, true, e)
            : undefined
        }
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

        {/* Folder name or rename input */}
        {isFolderRenaming && onCommitRename && onCancelRename ? (
          <FileTreeItemRename
            initialName={folder.name}
            isDirectory={true}
            onCommit={onCommitRename}
            onCancel={onCancelRename}
          />
        ) : (
          <button
            type="button"
            className="flex min-w-0 flex-1 text-left focus:outline-none"
            aria-expanded={isExpanded}
          >
            <span className="truncate text-foreground">{folder.name}</span>
          </button>
        )}

        {/* Action buttons (visible on hover or keyboard focus, hidden when renaming) */}
        {!isFolderRenaming && (
          <div className="flex-shrink-0 sr-only group-hover:not-sr-only group-has-[:focus-visible]:not-sr-only">
            <ActionButtons
              isStaged={isStaged}
              canRevert={!isStaged}
              onStage={onStage ? () => onStage(folder.path) : undefined}
              onUnstage={onUnstage ? () => onUnstage(folder.path) : undefined}
              onRevert={onRevert ? () => onRevert(folder.path) : undefined}
              itemType="folder"
            />
          </div>
        )}
      </div>

      {/* Children (when expanded) */}
      {isExpanded && (
        <ul className="border-l border-border pl-2">
          {/* Creation placeholder (at top of children) */}
          {creatingInPath === path.join(cwd, folder.path) &&
            creatingType &&
            onCommitCreate &&
            onCancelCreate && (
              <li>
                <div
                  className={cn(
                    "group flex w-full items-center gap-1.5 rounded-md px-1.5 py-px text-[13px]",
                    "ring-1 ring-accent/60",
                  )}
                  data-testid={`creating-${creatingType}-in-${folder.name}`}
                >
                  {/* Spacer to align with folder chevrons */}
                  <div style={{ width: 12 }} />

                  {/* Icon based on type */}
                  {creatingType === "folder" ? (
                    <Folder
                      className="flex-shrink-0 text-foreground"
                      size={12}
                    />
                  ) : (
                    <FileText
                      className="flex-shrink-0 text-foreground"
                      size={12}
                    />
                  )}

                  {/* Inline creation input */}
                  <FileTreeItemRename
                    initialName=""
                    isDirectory={creatingType === "folder"}
                    onCommit={onCommitCreate}
                    onCancel={onCancelCreate}
                  />
                </div>
              </li>
            )}

          {/* Subfolders first */}
          {sortedFolders.map((subfolder) => (
            <NestedFolderItem
              key={subfolder.path}
              folder={subfolder}
              cwd={cwd}
              expandedFolders={expandedFolders}
              onToggleFolder={onToggleFolder}
              isFileSelected={isFileSelected}
              multiSelectedPaths={multiSelectedPaths}
              isStaged={isStaged}
              onFileSelect={onFileSelect}
              onStage={onStage}
              onUnstage={onUnstage}
              onRevert={onRevert}
              isFileUnseen={isFileUnseen}
              onContextMenu={onContextMenu}
              renamingPath={renamingPath}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              creatingInPath={creatingInPath}
              creatingType={creatingType}
              onCommitCreate={onCommitCreate}
              onCancelCreate={onCancelCreate}
            />
          ))}

          {/* Then files */}
          {sortedFiles.map((file) => (
            <ChangeFileItem
              key={file.mapKey}
              path={file.path}
              status={file.status}
              nested
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
              onContextMenu={
                onContextMenu
                  ? (e) => onContextMenu(file.mapKey, file.path, false, e)
                  : undefined
              }
              isRenaming={renamingPath === file.path}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
