/**
 * EditorActionButtons - Undo, redo, save and find buttons for the editor
 * toolbar, with their keybindings in each tooltip.
 */

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Redo, Save, Search, Undo } from "lucide-react";

export interface EditorActionButtonsProps {
  /** Undo action handler */
  onUndo: () => void;

  /** Redo action handler */
  onRedo: () => void;

  /** Save action handler */
  onSave: () => void;

  /** Find action handler (optional) */
  onFind?: () => void;

  /** Whether undo is available */
  canUndo: boolean;

  /** Whether redo is available */
  canRedo: boolean;

  /** Whether save is available (file is dirty) */
  canSave: boolean;
}

const buttonClass =
  "p-1 rounded hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed";

function ActionTooltip({ label, keys }: { label: string; keys: string }) {
  return (
    <TooltipContent>
      <div className="flex items-center gap-2">
        <span>{label}</span>
        <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
          {keys}
        </kbd>
      </div>
    </TooltipContent>
  );
}

/**
 * Shared editor action buttons (undo, redo, save, find).
 */
export function EditorActionButtons({
  onUndo,
  onRedo,
  onSave,
  onFind,
  canUndo,
  canRedo,
  canSave,
}: EditorActionButtonsProps) {
  return (
    <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            className={buttonClass}
            aria-label="Undo"
            data-testid="undo-button"
          >
            <Undo size={14} />
          </button>
        </TooltipTrigger>
        <ActionTooltip label="Undo" keys="⌘Z" />
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onRedo}
            disabled={!canRedo}
            className={buttonClass}
            aria-label="Redo"
            data-testid="redo-button"
          >
            <Redo size={14} />
          </button>
        </TooltipTrigger>
        <ActionTooltip label="Redo" keys="⌘⇧Z" />
      </Tooltip>

      <div className="h-4 w-px bg-elevated-border mx-2" />

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className={buttonClass}
            aria-label="Save"
            data-testid="save-button"
          >
            <Save size={14} />
          </button>
        </TooltipTrigger>
        <ActionTooltip label="Save" keys="⌘S" />
      </Tooltip>

      {onFind && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onFind}
              className={buttonClass}
              aria-label="Find"
              data-testid="find-button"
            >
              <Search size={14} />
            </button>
          </TooltipTrigger>
          <ActionTooltip label="Find" keys="⌘F" />
        </Tooltip>
      )}
    </div>
  );
}
