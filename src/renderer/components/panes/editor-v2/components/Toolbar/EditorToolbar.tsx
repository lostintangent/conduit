/**
 * EditorToolbar - Toolbar for editor actions and mode switching.
 *
 * Provides:
 * - Save button (enabled when dirty)
 * - Undo/Redo buttons
 * - Editor/Diff mode toggle
 * - Dirty indicator
 *
 * @example
 * ```tsx
 * <EditorToolbar
 *   viewMode={{ type: 'editor' }}
 *   modelState={{ isDirty: true, isOrphaned: false, hasExternalChanges: false }}
 *   onViewModeChange={(mode) => setViewMode(mode)}
 *   onSave={handleSave}
 *   onUndo={handleUndo}
 *   onRedo={handleRedo}
 *   canUndo={true}
 *   canRedo={false}
 * />
 * ```
 */

import { Save, Undo, Redo, Code, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
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

  /** Whether undo is available */
  canUndo?: boolean;

  /** Whether redo is available */
  canRedo?: boolean;

  /** File path for display */
  filePath?: string;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Editor toolbar with save, undo/redo, and mode toggle.
 */
export function EditorToolbar({
  viewMode,
  modelState,
  onViewModeChange,
  onSave,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  filePath,
}: EditorToolbarProps) {
  const isDirty = modelState?.isDirty ?? false;
  const isEditorMode = viewMode.type === "editor";
  const isDiffMode = viewMode.type === "diff";

  // Get filename for display
  const fileName = filePath?.split("/").pop() ?? "";

  return (
    <div
      className="flex items-center gap-1 px-2 py-1 border-b border-border bg-elevated"
      data-testid="editor-toolbar"
    >
      {/* File name with dirty indicator */}
      {fileName && (
        <>
          <div className="flex items-center gap-1 text-sm text-foreground/80 px-1">
            <span className="truncate max-w-[200px]" title={filePath}>
              {fileName}
            </span>
            {isDirty && (
              <span
                className="text-warning font-bold"
                title="Unsaved changes"
                data-testid="dirty-indicator"
              >
                •
              </span>
            )}
          </div>
          <Separator orientation="vertical" className="h-4 mx-1" />
        </>
      )}

      {/* Save button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onSave}
        disabled={!isDirty}
        className="h-7 px-2"
        title="Save (Cmd+S)"
        data-testid="save-button"
      >
        <Save className="h-4 w-4" />
      </Button>

      {/* Undo button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onUndo}
        disabled={!canUndo}
        className="h-7 px-2"
        title="Undo (Cmd+Z)"
        data-testid="undo-button"
      >
        <Undo className="h-4 w-4" />
      </Button>

      {/* Redo button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onRedo}
        disabled={!canRedo}
        className="h-7 px-2"
        title="Redo (Cmd+Shift+Z)"
        data-testid="redo-button"
      >
        <Redo className="h-4 w-4" />
      </Button>

      <Separator orientation="vertical" className="h-4 mx-1" />

      {/* Mode toggle buttons */}
      <div className="flex items-center gap-0.5">
        {/* Editor mode button */}
        <Button
          variant={isEditorMode ? "secondary" : "ghost"}
          size="sm"
          onClick={() => onViewModeChange({ type: "editor" })}
          className="h-7 px-2"
          title="Code view"
          data-testid="editor-mode-button"
        >
          <Code className="h-4 w-4" />
        </Button>

        {/* Diff mode button */}
        <Button
          variant={isDiffMode ? "secondary" : "ghost"}
          size="sm"
          onClick={() =>
            onViewModeChange({
              type: "diff",
              filePath: filePath ?? "",
            })
          }
          className="h-7 px-2"
          title="Diff view"
          data-testid="diff-mode-button"
        >
          <GitCompare className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
