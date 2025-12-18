/**
 * EditorToolbar - Toolbar for editor actions.
 *
 * Styled to match v1's editor header:
 * - px-3 py-1.5 bg-elevated text-[13px]
 * - p-1 rounded hover:bg-white/10 buttons
 * - size={14} icons
 */

import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ChevronLeft,
  Code,
  Eye,
  GitCompare,
  PanelLeftOpen,
} from "lucide-react";
import { useCallback, useState } from "react";
import type { ModelState } from "../../types";
import { EditorActionButtons } from "../shared";

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

  /** Whether to show the preview toggle (for supported file types like .md) */
  showPreviewToggle?: boolean;

  /** Whether currently in preview mode */
  isPreviewMode?: boolean;

  /** Handler for toggling between preview and editor modes */
  onTogglePreviewMode?: (isPreview: boolean) => void;
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
  showPreviewToggle = false,
  isPreviewMode = false,
  onTogglePreviewMode,
}: EditorToolbarProps) {
  const isDirty = modelState?.isDirty ?? false;
  const [copied, setCopied] = useState(false);

  // Use displayPath if provided, otherwise fall back to filePath
  const pathToShow = displayPath ?? filePath ?? "";

  const handleCopyPath = useCallback(() => {
    if (pathToShow) {
      navigator.clipboard.writeText(pathToShow);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [pathToShow]);

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

        {/* File name with full path tooltip - click to copy */}
        {pathToShow && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleCopyPath}
                className="truncate cursor-pointer hover:text-foreground/80 transition-colors text-left"
              >
                {pathToShow.split("/").pop() ?? pathToShow}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {copied ? "Copied!" : `${pathToShow} - Click to copy`}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Editor/Diff/Preview mode toggle group (only shown when diff or preview is available) */}
        {(showDiffToggle || showPreviewToggle) && (
          <>
            <Separator
              orientation="vertical"
              className="h-4 mx-1 bg-elevated-border"
            />
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              className="gap-0 h-5.5 [&>*]:h-5.5 [&>*]:px-1.5 [&>*]:py-0 [&>*:first-child]:rounded-r-none [&>*:last-child]:rounded-l-none [&>*:not(:first-child):not(:last-child)]:rounded-none [&>*:not(:first-child)]:-ml-px"
              value={isPreviewMode ? "preview" : isDiffMode ? "diff" : "editor"}
              onValueChange={(value) => {
                if (!value) return; // Don't allow deselecting
                if (value === "editor") {
                  onToggleDiffMode?.(false);
                  onTogglePreviewMode?.(false);
                } else if (value === "diff") {
                  onToggleDiffMode?.(true);
                } else if (value === "preview") {
                  onTogglePreviewMode?.(true);
                }
              }}
            >
              <ToggleGroupItem value="editor" aria-label="Editor mode">
                <Code className="w-3 h-3" />
              </ToggleGroupItem>
              {showDiffToggle && (
                <ToggleGroupItem value="diff" aria-label="Diff mode">
                  <GitCompare className="w-3 h-3" />
                </ToggleGroupItem>
              )}
              {showPreviewToggle && (
                <ToggleGroupItem value="preview" aria-label="Preview mode">
                  <Eye className="w-3 h-3" />
                </ToggleGroupItem>
              )}
            </ToggleGroup>
          </>
        )}
        {/* Edit actions (after file path, with separator) */}
        {pathToShow && !isPreviewMode && (
          <>
            <Separator
              orientation="vertical"
              className="h-4 mx-1 bg-elevated-border"
            />
            <EditorActionButtons
              onUndo={onUndo}
              onRedo={onRedo}
              onSave={onSave}
              onFind={onFind}
              canUndo={canUndo}
              canRedo={canRedo}
              canSave={isDirty}
              variant="toolbar"
            />
          </>
        )}
      </div>
    </div>
  );
}
