/**
 * EditorToolbar - Unified toolbar for editor actions.
 *
 * Supports both standalone and inline (list) modes:
 * - Standalone: Full toolbar for single file editing
 * - Inline: Clickable, collapsible header for file lists
 *
 * Styled to match v1's editor header:
 * - px-3 py-1.5 bg-elevated text-[13px]
 * - p-1 rounded hover:bg-white/10 buttons
 * - size={14} icons
 */

import type { GitFileStatus } from "@/api/GitV2API";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/utils";
import {
  Asterisk,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code,
  Eye,
  GitCompare,
  Lock,
  Minus,
  PanelLeftOpen,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import { useCallback, useState } from "react";
import type { ModelState } from "../../types";
import { formatRelativeTime } from "../../utils";
import { EditorActionButtons, GitBadge } from "../shared";

export interface EditorToolbarProps {
  /** Current model state (dirty, orphaned, etc.) */
  modelState?: ModelState | null;

  /** Handler for save action */
  onSave?: () => void;

  /** Handler for undo action */
  onUndo?: () => void;

  /** Handler for redo action */
  onRedo?: () => void;

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

  // ---------------------------------------------------------------------------
  // Inline/List Mode Props
  // ---------------------------------------------------------------------------

  /** Click handler - if provided, enables clickable behavior with hover effect */
  onClick?: () => void;

  /** Whether the item is expanded (for inline mode) */
  isExpanded?: boolean;

  /** Whether to show the expand/collapse chevron */
  showChevron?: boolean;

  // ---------------------------------------------------------------------------
  // Git Actions (Working Context)
  // ---------------------------------------------------------------------------

  /** Handler for staging the file */
  onStage?: () => void;

  /** Handler for unstaging the file */
  onUnstage?: () => void;

  /** Handler for reverting the file */
  onRevert?: () => void;

  /** Whether the file is staged */
  isStaged?: boolean;

  /** Git status for displaying badge */
  gitStatus?: GitFileStatus;

  // ---------------------------------------------------------------------------
  // Read-only / Commit Mode Props
  // ---------------------------------------------------------------------------

  /** Whether the file is read-only (shows lock, disables edit buttons) */
  readOnly?: boolean;

  /** Commit short ID to display (for commit file views) */
  commitShortId?: string;

  // ---------------------------------------------------------------------------
  // Follow Mode Props
  // ---------------------------------------------------------------------------

  /** Whether this file has unseen changes */
  isUnseen?: boolean;

  /** Timestamp when file was last modified */
  timestamp?: number | null;

  /** Handler for close button - if provided, shows close button */
  onClose?: () => void;
}

/**
 * Unified editor toolbar with save, undo/redo actions.
 * Supports both standalone and inline (list) modes.
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
  // Inline/List mode props
  onClick,
  isExpanded = true,
  showChevron = false,
  // Git actions
  onStage,
  onUnstage,
  onRevert,
  isStaged = false,
  gitStatus,
  // Read-only / Commit mode
  readOnly = false,
  commitShortId,
  // Follow mode
  isUnseen = false,
  timestamp,
  // Close handler
  onClose,
}: EditorToolbarProps) {
  const isDirty = modelState?.isDirty ?? false;
  const [copied, setCopied] = useState(false);

  // Determine if this is inline mode (clickable list item)
  const isInlineMode = onClick !== undefined;

  // Use displayPath if provided, otherwise fall back to filePath
  const pathToShow = displayPath ?? filePath ?? "";

  // In inline mode, show full relative path; in standalone, show just filename
  const displayName = isInlineMode
    ? pathToShow
    : (pathToShow.split("/").pop() ?? pathToShow);

  const handleCopyPath = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // Don't trigger onClick in inline mode
      if (pathToShow && navigator.clipboard) {
        navigator.clipboard.writeText(pathToShow);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }
    },
    [pathToShow],
  );

  const handleStage = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onStage?.();
    },
    [onStage],
  );

  const handleUnstage = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onUnstage?.();
    },
    [onUnstage],
  );

  const handleRevert = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onRevert?.();
    },
    [onRevert],
  );

  // Common button class matching v1
  const buttonClass =
    "p-1 rounded hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed";

  // Show git action buttons in working context (when git handlers are provided)
  const showGitActions = onStage || onUnstage || onRevert;

  // Show edit actions when not in preview mode and not read-only
  const showEditActions = pathToShow && !isPreviewMode && !readOnly;

  return (
    <div
      className={cn(
        "flex items-center justify-between px-3 py-1.5 text-[13px] border-b border-border",
        isInlineMode
          ? "bg-background cursor-pointer hover:bg-muted/50 transition-colors"
          : "bg-elevated",
      )}
      data-testid="editor-toolbar"
      onClick={onClick}
      role={isInlineMode ? "button" : undefined}
      aria-expanded={isInlineMode && showChevron ? isExpanded : undefined}
      tabIndex={isInlineMode ? 0 : undefined}
      onKeyDown={
        isInlineMode
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      {/* Left side: navigation + file info + edit actions */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* Expand/Collapse chevron (inline mode) */}
        {showChevron &&
          (isExpanded ? (
            <ChevronDown className="text-foreground shrink-0" size={14} />
          ) : (
            <ChevronRight className="text-foreground shrink-0" size={14} />
          ))}

        {/* Expand tree button (when tree is collapsed in split mode) */}
        {showExpandTreeButton && onExpandTree && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExpandTree();
                  }}
                  className={buttonClass}
                  aria-label="Expand sidebar"
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onBack();
                  }}
                  className={buttonClass}
                  aria-label="Back to file tree"
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

        {/* Unseen indicator (follow mode) */}
        {isUnseen && (
          <Asterisk
            className="text-yellow-500 shrink-0"
            size={14}
            data-testid="unseen-indicator"
          />
        )}

        {/* Dirty indicator */}
        {isDirty && (
          <div
            className="w-2 h-2 rounded-full bg-blue-500 shrink-0"
            title="Unsaved changes"
            data-testid="dirty-indicator"
          />
        )}

        {/* Read-only lock indicator */}
        {readOnly && (
          <Lock
            className="text-muted-foreground shrink-0"
            size={14}
            role="img"
            aria-label="Read-only"
            data-testid="readonly-indicator"
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
                {displayName}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {copied ? "Copied!" : `${pathToShow} - Click to copy`}
            </TooltipContent>
          </Tooltip>
        )}

        {/* Timestamp (follow mode) */}
        {timestamp != null && (
          <span
            className="text-muted-foreground text-xs shrink-0"
            title={new Date(timestamp).toLocaleString()}
            data-testid="timestamp"
          >
            {formatRelativeTime(Math.floor(timestamp / 1000))}
          </span>
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
              onClick={(e) => e.stopPropagation()}
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
        {showEditActions && (
          <>
            <Separator
              orientation="vertical"
              className="h-4 mx-1 bg-elevated-border"
            />
            <EditorActionButtons
              onUndo={onUndo ?? (() => {})}
              onRedo={onRedo ?? (() => {})}
              onSave={onSave ?? (() => {})}
              onFind={onFind}
              canUndo={canUndo}
              canRedo={canRedo}
              canSave={isDirty}
            />
          </>
        )}
      </div>

      {/* Right side: Git actions + badge */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Git Action Buttons (working context only) */}
        {showGitActions && (
          <>
            {isStaged ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={handleUnstage}
                title="Unstage"
                data-testid="unstage-button"
              >
                <Minus className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <>
                {onStage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={handleStage}
                    title="Stage"
                    data-testid="stage-button"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
                {onRevert && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 hover:text-destructive"
                    onClick={handleRevert}
                    title="Discard Changes"
                    data-testid="revert-button"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
              </>
            )}
          </>
        )}

        {/* Commit short ID (to the left of git badge) - standalone mode only */}
        {commitShortId && !isInlineMode && (
          <span
            className="text-muted-foreground text-xs font-mono shrink-0"
            data-testid="commit-id"
          >
            {commitShortId}
          </span>
        )}

        {/* Git Status Badge */}
        {gitStatus && <GitBadge status={gitStatus} />}

        {/* Close button - only shown when handler is provided */}
        {onClose && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className={buttonClass}
            title="Close"
            data-testid="close-button"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}
