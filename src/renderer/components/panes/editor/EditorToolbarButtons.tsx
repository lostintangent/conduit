import { Separator } from "@/components/ui/separator";
import type { FileDiffResult } from "@shared/types";
import {
  Eye,
  FileText,
  Redo,
  RotateCcw,
  Save,
  Search,
  Undo,
} from "lucide-react";

interface EditorToolbarButtonsProps {
  mode: "diff" | "editor";
  variant: "split" | "single";

  // Diff-specific props
  diffData?: FileDiffResult;
  showRaw?: boolean;
  baseBranch: string | null;

  // Button states
  canUndo: boolean;
  canRedo: boolean;
  hasUnsavedChanges: boolean;

  // Handlers
  onToggleRawView: () => void;
  onRevert: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onFind: () => void;
}

export function EditorToolbarButtons({
  mode,
  variant,
  diffData,
  showRaw = false,
  baseBranch,
  canUndo,
  canRedo,
  hasUnsavedChanges,
  onToggleRawView,
  onRevert,
  onUndo,
  onRedo,
  onSave,
  onFind,
}: EditorToolbarButtonsProps) {
  const isSplit = variant === "split";
  const iconClassName = isSplit ? "" : "text-white/60";

  const ButtonSeparator = isSplit ? (
    <Separator orientation="vertical" className="h-4 mx-1 bg-elevated-border" />
  ) : (
    <div className="h-4 w-px bg-white/10 shrink-0" />
  );

  // Reusable button components
  const UndoButton = (
    <button
      type="button"
      onClick={onUndo}
      disabled={!canUndo}
      className="p-1 rounded hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
      title="Undo"
    >
      <Undo size={14} className={iconClassName} />
    </button>
  );

  const RedoButton = (
    <button
      type="button"
      onClick={onRedo}
      disabled={!canRedo}
      className="p-1 rounded hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
      title="Redo"
    >
      <Redo size={14} className={iconClassName} />
    </button>
  );

  const SaveButton = (
    <button
      type="button"
      onClick={onSave}
      disabled={!hasUnsavedChanges}
      className="p-1 rounded hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
      title="Save"
    >
      <Save size={14} className={iconClassName} />
    </button>
  );

  const FindButton = (
    <button
      type="button"
      onClick={onFind}
      className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
      title="Find in file (Ctrl+F)"
    >
      <Search size={14} className={iconClassName} />
    </button>
  );

  // Common edit actions (shared by both modes)
  const EditActions = (
    <>
      {UndoButton}
      {RedoButton}
      {ButtonSeparator}
      {SaveButton}
      {FindButton}
    </>
  );

  if (mode === "diff") {
    return (
      <>
        {/* Diff-specific buttons */}
        {diffData?.status !== "deleted" && (
          <button
            type="button"
            onClick={onToggleRawView}
            className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
            title={showRaw ? "Show diff view" : "View raw file"}
          >
            {showRaw ? (
              <Eye size={14} className={iconClassName} />
            ) : (
              <FileText size={14} className={iconClassName} />
            )}
          </button>
        )}
        {diffData?.status !== "binary" && baseBranch === null && (
          <button
            type="button"
            onClick={onRevert}
            className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
            title="Revert changes"
          >
            <RotateCcw size={14} className={iconClassName} />
          </button>
        )}

        {ButtonSeparator}

        {EditActions}
      </>
    );
  }

  // Editor mode - just the common actions
  return <>{EditActions}</>;
}
