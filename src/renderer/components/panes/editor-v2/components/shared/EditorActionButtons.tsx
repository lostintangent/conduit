/**
 * EditorActionButtons - Shared undo/redo/save/find buttons for editors.
 *
 * Used in:
 * - EditorToolbar (main editor toolbar)
 * - ReviewWorkingPaneFile (review mode file headers)
 *
 * Provides consistent button layout and keybinding hints.
 *
 * @example
 * ```tsx
 * <EditorActionButtons
 *   onUndo={handleUndo}
 *   onRedo={handleRedo}
 *   onSave={handleSave}
 *   onFind={handleFind}
 *   canUndo={canUndo}
 *   canRedo={canRedo}
 *   canSave={isDirty}
 *   variant="toolbar"
 * />
 * ```
 */

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils";
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

  /**
   * Visual variant:
   * - "toolbar": For use in EditorToolbar (native buttons, larger icons)
   * - "compact": For use in file headers (smaller, denser)
   */
  variant?: "toolbar" | "compact";

  /** Whether to show keyboard shortcuts in tooltips */
  showKeyboardHints?: boolean;

  /** Additional class name for the container */
  className?: string;
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
  variant = "toolbar",
  showKeyboardHints = true,
  className,
}: EditorActionButtonsProps) {
  const isToolbar = variant === "toolbar";

  // Button styling based on variant
  const buttonClass = isToolbar
    ? "p-1 rounded hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
    : "h-6 w-6 p-0 rounded hover:bg-accent transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center justify-center";

  // Icon size based on variant
  const iconSize = isToolbar ? 14 : 14;
  const iconClass = isToolbar ? "" : "h-3.5 w-3.5";

  // Separator styling based on variant
  const separatorClass = isToolbar
    ? "h-4 w-px bg-elevated-border mx-2"
    : "h-4 w-px bg-border mx-2";

  // Keyboard shortcut badge component
  const KeyboardHint = ({ children }: { children: string }) =>
    showKeyboardHints ? (
      <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground opacity-100">
        {children}
      </kbd>
    ) : null;

  return (
    <div
      className={cn("flex items-center", className)}
      onClick={(e) => e.stopPropagation()}
    >
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
            {isToolbar ? (
              <Undo size={iconSize} />
            ) : (
              <Undo className={iconClass} />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex items-center gap-2">
            <span>Undo</span>
            <KeyboardHint>⌘Z</KeyboardHint>
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
            {isToolbar ? (
              <Redo size={iconSize} />
            ) : (
              <Redo className={iconClass} />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex items-center gap-2">
            <span>Redo</span>
            <KeyboardHint>⌘⇧Z</KeyboardHint>
          </div>
        </TooltipContent>
      </Tooltip>

      {/* Separator */}
      <div className={separatorClass} />

      {/* Save */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onSave}
            disabled={!canSave}
            className={buttonClass}
            data-testid="save-button"
          >
            {isToolbar ? (
              <Save size={iconSize} />
            ) : (
              <Save className={iconClass} />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <div className="flex items-center gap-2">
            <span>Save</span>
            <KeyboardHint>⌘S</KeyboardHint>
          </div>
        </TooltipContent>
      </Tooltip>

      {/* Find (optional) */}
      {onFind && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onFind}
              className={buttonClass}
              data-testid="find-button"
            >
              {isToolbar ? (
                <Search size={iconSize} />
              ) : (
                <Search className={iconClass} />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <div className="flex items-center gap-2">
              <span>Find</span>
              <KeyboardHint>⌘F</KeyboardHint>
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
