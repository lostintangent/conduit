/**
 * EditorToolbar - Toolbar for editor actions and mode switching.
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
  Code,
  GitCompare,
  ChevronLeft,
  PanelLeftOpen,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import type { ViewMode, ModelState } from "../../types";

// ============================================================================
// Types
// ============================================================================

export interface EditorToolbarProps {
  /** Current view mode */
  viewMode: ViewMode;

  /** Current model state (dirty, orphaned, etc.) */
  modelState: ModelState | null;

  /** Handler for view mode changes */
  onViewModeChange: (mode: ViewMode) => void;

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
}

// ============================================================================
// Component
// ============================================================================

/**
 * Editor toolbar with save, undo/redo, and mode toggle.
 * Styled to match v1's header.
 */
export function EditorToolbar({
  viewMode,
  modelState,
  onViewModeChange,
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
}: EditorToolbarProps) {
  const isDirty = modelState?.isDirty ?? false;
  const isEditorMode = viewMode.type === "editor";
  const isDiffMode = viewMode.type === "diff";

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
            <button
              type="button"
              onClick={onExpandTree}
              className={buttonClass}
              title="Expand tree"
              data-testid="expand-tree-button"
            >
              <PanelLeftOpen size={14} />
            </button>
            <div className="h-4 w-px bg-white/10 shrink-0" />
          </>
        )}

        {/* Back button (single-column layout only) */}
        {showBackButton && onBack && (
          <>
            <button
              type="button"
              onClick={onBack}
              className={buttonClass}
              title="Show file tree"
              data-testid="back-to-tree-button"
            >
              <ChevronLeft size={14} />
            </button>
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

        {/* File path */}
        {pathToShow && (
          <span className="truncate" title={filePath}>
            {pathToShow}
          </span>
        )}

        {/* Edit actions (after file path, with separator) */}
        {pathToShow && (
          <>
            <Separator
              orientation="vertical"
              className="h-4 mx-1 bg-elevated-border"
            />

            {/* Mode toggle buttons */}
            <button
              type="button"
              onClick={() => onViewModeChange({ type: "editor" })}
              className={`${buttonClass} ${isEditorMode ? "bg-white/10" : ""}`}
              title="Code view"
              data-testid="editor-mode-button"
            >
              <Code size={14} />
            </button>

            <button
              type="button"
              onClick={() =>
                onViewModeChange({
                  type: "diff",
                  filePath: filePath ?? "",
                })
              }
              className={`${buttonClass} ${isDiffMode ? "bg-white/10" : ""}`}
              title="Diff view"
              data-testid="diff-mode-button"
            >
              <GitCompare size={14} />
            </button>

            <Separator
              orientation="vertical"
              className="h-4 mx-1 bg-elevated-border"
            />

            {/* Undo */}
            <button
              type="button"
              onClick={onUndo}
              disabled={!canUndo}
              className={buttonClass}
              title="Undo"
              data-testid="undo-button"
            >
              <Undo size={14} />
            </button>

            {/* Redo */}
            <button
              type="button"
              onClick={onRedo}
              disabled={!canRedo}
              className={buttonClass}
              title="Redo"
              data-testid="redo-button"
            >
              <Redo size={14} />
            </button>

            <Separator
              orientation="vertical"
              className="h-4 mx-1 bg-elevated-border"
            />

            {/* Save */}
            <button
              type="button"
              onClick={onSave}
              disabled={!isDirty}
              className={buttonClass}
              title="Save"
              data-testid="save-button"
            >
              <Save size={14} />
            </button>

            {/* Find */}
            {onFind && (
              <button
                type="button"
                onClick={onFind}
                className={buttonClass}
                title="Find in file (Cmd+F)"
                data-testid="find-button"
              >
                <Search size={14} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
