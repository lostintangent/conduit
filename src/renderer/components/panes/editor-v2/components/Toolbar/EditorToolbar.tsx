/**
 * EditorToolbar - Toolbar for editor actions.
 *
 * Styled to match v1's editor header:
 * - px-3 py-1.5 bg-elevated text-[13px]
 * - p-1 rounded hover:bg-white/10 buttons
 * - size={14} icons
 */

import {
  Save,
  Undo,
  Redo,
  Search,
  ChevronLeft,
  PanelLeftOpen,
  Columns2,
  FileCode,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ModelState } from "../../types";

export interface EditorToolbarProps {
  /** Current model state (dirty, orphaned, etc.) */
  modelState: ModelState | null;

  /** Handler for save action */
  onSave: () => void;

  /** Handler for undo action */
  onUndo: () => void;

  /** Handler for redo action */
  onRedo: () => void;

  /** Handler for find action (optional) */
  onFind?: () => void;

  /** Whether undo is available */
  canUndo?: boolean;

  /** Whether redo is available */
  canRedo?: boolean;

  /** Full file path (for tooltip) */
  filePath?: string;

  /** Display path (relative to cwd, shown in toolbar) */
  displayPath?: string;

  /** Whether to show the back button (for single-column layout) */
  showBackButton?: boolean;

  /** Handler for back button click (navigate to tree view) */
  onBack?: () => void;

  /** Whether to show the expand tree button (when tree is collapsed in split mode) */
  showExpandTreeButton?: boolean;

  /** Handler for expand tree button click */
  onExpandTree?: () => void;

  /** Whether to show the diff/edit mode toggle (only for dirty files) */
  showDiffToggle?: boolean;

  /** Whether currently in diff mode (vs regular edit mode) */
  isDiffMode?: boolean;

  /** Handler for toggling between diff and edit modes */
  onToggleDiffMode?: (isDiff: boolean) => void;
}

/**
 * Editor toolbar with save, undo/redo actions.
 * Styled to match v1's header.
 */
export function EditorToolbar({
  modelState,
  onSave,
  onUndo,
  onRedo,
  onFind,
  canUndo = false,
  canRedo = false,
  filePath,
  displayPath,
  showBackButton = false,
  onBack,
  showExpandTreeButton = false,
  onExpandTree,
  showDiffToggle = false,
  isDiffMode = false,
  onToggleDiffMode,
}: EditorToolbarProps) {
  const isDirty = modelState?.isDirty ?? false;

  // Use displayPath if provided, otherwise fall back to filePath
  const pathToShow = displayPath ?? filePath ?? "";

  // Common button class matching v1
  const buttonClass =
    "p-1 rounded hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed";

  return (
    <div
      className="flex items-center justify-between px-3 py-1.5 bg-elevated text-[13px] border-b border-border"
      data-testid="editor-toolbar"
    >
      {/* Left side: navigation + file info + edit actions */}
      <div className="flex items-center gap-2 truncate">
        {/* Expand tree button (when tree is collapsed in split mode) */}
        {showExpandTreeButton && onExpandTree && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onExpandTree}
                  className={buttonClass}
                  data-testid="expand-tree-button"
                >
                  <PanelLeftOpen size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex items-center gap-2">
                  <span>Expand sidebar</span>
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                    ⌘B
                  </kbd>
                </div>
              </TooltipContent>
            </Tooltip>
            <div className="h-4 w-px bg-white/10 shrink-0" />
          </>
        )}

        {/* Back button (single-column layout only) */}
        {showBackButton && onBack && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onBack}
                  className={buttonClass}
                  data-testid="back-to-tree-button"
                >
                  <ChevronLeft size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>Back to file tree</TooltipContent>
            </Tooltip>
            <div className="h-4 w-px bg-white/10 shrink-0" />
          </>
        )}

        {/* Dirty indicator */}
        {isDirty && (
          <div
            className="w-2 h-2 rounded-full bg-blue-500 shrink-0"
            title="Unsaved changes"
            data-testid="dirty-indicator"
          />
        )}

        {/* File name with full path tooltip */}
        {pathToShow && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="truncate cursor-help">
                {pathToShow.split("/").pop() ?? pathToShow}
              </span>
            </TooltipTrigger>
            <TooltipContent>{pathToShow}</TooltipContent>
          </Tooltip>
        )}

        {/* Diff/Edit mode toggle (only for git-modified files) */}
        {showDiffToggle && onToggleDiffMode && (
          <>
            <Separator
              orientation="vertical"
              className="h-4 mx-1 bg-elevated-border"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onToggleDiffMode(!isDiffMode)}
                  className={buttonClass}
                  data-testid="diff-mode-toggle"
                >
                  {isDiffMode ? <FileCode size={14} /> : <Columns2 size={14} />}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {isDiffMode ? "Switch to editor view" : "Switch to diff view"}
              </TooltipContent>
            </Tooltip>
          </>
        )}

        {/* Edit actions (after file path, with separator) */}
        {pathToShow && (
          <>
            <Separator
              orientation="vertical"
              className="h-4 mx-1 bg-elevated-border"
            />

            {/* Undo */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  className={buttonClass}
                  data-testid="undo-button"
                >
                  <Undo size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex items-center gap-2">
                  <span>Undo</span>
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                    ⌘Z
                  </kbd>
                </div>
              </TooltipContent>
            </Tooltip>

            {/* Redo */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onRedo}
                  disabled={!canRedo}
                  className={buttonClass}
                  data-testid="redo-button"
                >
                  <Redo size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex items-center gap-2">
                  <span>Redo</span>
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                    ⌘⇧Z
                  </kbd>
                </div>
              </TooltipContent>
            </Tooltip>

            <Separator
              orientation="vertical"
              className="h-4 mx-1 bg-elevated-border"
            />

            {/* Save */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onSave}
                  disabled={!isDirty}
                  className={buttonClass}
                  data-testid="save-button"
                >
                  <Save size={14} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex items-center gap-2">
                  <span>Save</span>
                  <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                    ⌘S
                  </kbd>
                </div>
              </TooltipContent>
            </Tooltip>

            {/* Find */}
            {onFind && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onFind}
                    className={buttonClass}
                    data-testid="find-button"
                  >
                    <Search size={14} />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="flex items-center gap-2">
                    <span>Find in file</span>
                    <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
                      ⌘F
                    </kbd>
                  </div>
                </TooltipContent>
              </Tooltip>
            )}
          </>
        )}
      </div>
    </div>
  );
}
