/**
 * FileChangeDiff - Individual file diff component for the changes review pane.
 *
 * Displays a collapsible diff view for a single changed file with:
 * - Collapsible header showing file path and git status
 * - Embedded diff editor (read-only) when expanded
 * - Inline action buttons: Stage, Unstage, Revert
 *
 * Used within ChangesReviewPane to show multiple file diffs in a scrollable list.
 *
 * @example
 * ```tsx
 * <FileChangeDiff
 *   filePath="src/components/Button.tsx"
 *   cwd="/project"
 *   git={git}
 *   status={{ path: "src/components/Button.tsx", status: "modified", staged: false }}
 *   isExpanded={true}
 *   onToggle={() => setExpanded(!expanded)}
 * />
 * ```
 */

import type { GitFileStatus } from "@/../../src/ipc/gitv2/types";
import type { GitV2API } from "@/api/GitV2API";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import {
  Asterisk,
  ChevronDown,
  ChevronRight,
  FileText,
  Minus,
  Plus,
  RotateCcw,
} from "lucide-react";
import { formatRelativeTime } from "../../utils";
import * as monaco from "monaco-editor";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useDiffModeTransition,
  useEditorActions,
  useEditorSaveKeybinding,
  useModelState,
} from "../../hooks";
import { MonacoModelRegistry, createModelKey } from "../../registry";
import { EditorErrorBoundary } from "../EditorErrorBoundary";
import {
  DEFAULT_AUTO_SIZE_CONFIG,
  DeletedFileViewer,
  DiffEditorWrapper,
  RegularEditorWrapper,
} from "../EditorViewPanel";
import { DiffModeToggle, EditorActionButtons, GitBadge } from "../shared";

export interface FileChangeDiffProps {
  /** Relative file path from git root */
  filePath: string;

  /** Working directory */
  cwd: string;

  /** Optional sandbox ID for cloud VM operations */
  sandboxId?: string;

  /** Git API instance (shared from parent) */
  git: GitV2API;

  /** Git status for this file */
  status: GitFileStatus;

  /** Git ref for original content (default: 'HEAD') */
  baseBranch?: string;

  /** Whether the diff is expanded */
  isExpanded: boolean;

  /** Toggle expansion callback */
  onToggle: () => void;

  // ---------------------------------------------------------------------------
  // Follow Mode Props (optional)
  // ---------------------------------------------------------------------------

  /** Whether this file has unseen changes (Follow mode) */
  isUnseen?: boolean;

  /** Timestamp when this file was last modified (Follow mode) */
  timestamp?: number | null;

  /** Callback when user interacts with the file (marks as seen) */
  onInteract?: () => void;
}

/**
 * Individual file diff with collapsible header and action buttons.
 */
export function FileChangeDiff({
  filePath,
  cwd,
  sandboxId,
  git,
  status,
  baseBranch,
  isExpanded,
  onToggle,
  isUnseen = false,
  timestamp,
  onInteract,
}: FileChangeDiffProps) {
  const fileName = useMemo(() => {
    return filePath.split("/").pop() ?? filePath;
  }, [filePath]);

  // Full path for the diff editor
  const fullFilePath = useMemo(() => {
    return cwd.endsWith("/") ? cwd + filePath : cwd + "/" + filePath;
  }, [cwd, filePath]);

  // Stable editor ID based on file path
  const editorId = useMemo(() => {
    return `file-change-diff-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}`;
  }, [filePath]);

  const isStaged = status.staged;

  // ---------------------------------------------------------------------------
  // Editor Controls State
  // ---------------------------------------------------------------------------

  // Editor instance state - using state instead of ref so changes trigger re-renders
  const [editor, setEditor] =
    useState<monaco.editor.IStandaloneCodeEditor | null>(null);

  // Track if editor controls have been "activated" (shown due to dirty state)
  // Once activated, controls remain visible even after save
  const [controlsActivated, setControlsActivated] = useState(false);

  // Show diff toggle for modified files only
  // - Not for untracked/added (no original to diff against)
  // - Not for deleted (file doesn't exist, shown as read-only from git)
  const showDiffToggle =
    status.status !== "untracked" &&
    status.status !== "added" &&
    status.status !== "deleted";

  // Diff/edit mode transition with height preservation
  const {
    isDiffMode,
    handleToggle: handleToggleDiffMode,
    autoSizeConfig,
    containerRef: editorContainerRef,
    transitionStyle,
  } = useDiffModeTransition({
    defaultConfig: DEFAULT_AUTO_SIZE_CONFIG,
    initialMode: true,
  });

  // Get model state for this file
  const modelState = useModelState(fullFilePath, sandboxId);
  const isDirty = modelState?.isDirty ?? false;

  // Activate controls when file becomes dirty
  useEffect(() => {
    if (isDirty && !controlsActivated) {
      setControlsActivated(true);
    }
  }, [isDirty, controlsActivated]);

  // Show controls if dirty or previously activated (but not for deleted files which are read-only)
  const showEditorControls =
    status.status !== "deleted" && (isDirty || controlsActivated);

  // Save handler
  const handleSave = useCallback(async () => {
    if (!fullFilePath) return;

    try {
      const registry = MonacoModelRegistry.getInstance();
      // Use composite key that includes sandboxId for VM file support
      await registry.saveModel(createModelKey(fullFilePath, sandboxId));
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  }, [fullFilePath, sandboxId]);

  // Keybinding hook for Cmd+S
  const { registerSaveKeybinding } = useEditorSaveKeybinding(
    handleSave,
    editorId,
  );

  // Editor actions hook
  const editorActions = useEditorActions(editor, modelState, handleSave);

  // Handle editor mount - store editor, register keybindings, and track focus for Follow mode
  const handleEditorMount = useCallback(
    (mountedEditor: monaco.editor.IStandaloneCodeEditor) => {
      setEditor(mountedEditor);
      registerSaveKeybinding(mountedEditor);

      // Mark as seen when user focuses the editor (clicks into it)
      mountedEditor.onDidFocusEditorText(() => {
        onInteract?.();
      });
    },
    [registerSaveKeybinding, onInteract],
  );

  // Handle diff editor mount - get modified editor, register keybindings, and track focus
  const handleDiffEditorMount = useCallback(
    (diffEditor: monaco.editor.IStandaloneDiffEditor) => {
      const modifiedEditor = diffEditor.getModifiedEditor();
      setEditor(modifiedEditor);
      registerSaveKeybinding(modifiedEditor);

      // Mark as seen when user focuses either side of the diff editor
      modifiedEditor.onDidFocusEditorText(() => {
        onInteract?.();
      });
      diffEditor.getOriginalEditor().onDidFocusEditorText(() => {
        onInteract?.();
      });
    },
    [registerSaveKeybinding, onInteract],
  );

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleStage = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      onInteract?.(); // Mark as seen when staging
      try {
        await git.stage([filePath]);
      } catch (error) {
        console.error("Failed to stage file:", error);
      }
    },
    [git, filePath, onInteract],
  );

  const handleUnstage = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      onInteract?.(); // Mark as seen when unstaging
      try {
        await git.unstage([filePath]);
      } catch (error) {
        console.error("Failed to unstage file:", error);
      }
    },
    [git, filePath, onInteract],
  );

  /**
   * Handle revert with confirmation dialog.
   * Only reverts if user confirms the action.
   */
  const handleRevert = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();

      // Show confirmation dialog before reverting
      const confirmed = window.confirm(
        `Discard changes to "${filePath}"?\n\nThis action cannot be undone.`,
      );

      if (!confirmed) {
        return;
      }

      onInteract?.(); // Mark as seen when reverting
      try {
        await git.revert([filePath]);
      } catch (error) {
        console.error("Failed to revert file:", error);
      }
    },
    [git, filePath, onInteract],
  );

  /**
   * Handle toggle with interaction tracking.
   * Marks as seen when collapsing (user has acknowledged the file).
   */
  const handleToggle = useCallback(() => {
    // Mark as seen when collapsing (user is dismissing/acknowledging)
    if (isExpanded) {
      onInteract?.();
    }
    onToggle();
  }, [isExpanded, onInteract, onToggle]);

  // Determine if revert button should be shown
  // Don't show revert for untracked files (they have nothing to revert to)
  const canRevert = status.status !== "untracked";

  return (
    <div
      className="border-b border-border last:border-b-0"
      data-testid={`file-change-diff-${fileName}`}
      data-filepath={filePath}
    >
      {/* Collapsible Header */}
      <div
        className={cn(
          "flex items-center gap-2 w-full py-1 px-3",
          "hover:bg-accent/50 transition-colors",
          "cursor-pointer text-[13px]",
        )}
        data-testid="file-change-diff-header"
      >
        {/* Left side: expand/collapse + file info + editor controls */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Clickable area for expand/collapse */}
          <div
            className="flex items-center gap-2 min-w-0"
            onClick={handleToggle}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleToggle();
              }
            }}
          >
            {/* Expand/Collapse Icon */}
            {isExpanded ? (
              <ChevronDown
                className="text-foreground flex-shrink-0"
                size={12}
              />
            ) : (
              <ChevronRight
                className="text-foreground flex-shrink-0"
                size={12}
              />
            )}

            {/* Unseen indicator (Follow mode) - yellow asterisk */}
            {isUnseen && (
              <Asterisk
                className="text-yellow-500 flex-shrink-0"
                size={12}
                data-testid="unseen-indicator"
              />
            )}

            {/* Dirty indicator (unsaved editor changes) */}
            {isDirty && (
              <div
                className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"
                title="Unsaved changes"
                data-testid="dirty-indicator"
              />
            )}

            {/* File Icon */}
            <FileText
              className="flex-shrink-0 text-muted-foreground"
              size={12}
            />

            {/* File Path */}
            <span className="truncate" title={filePath}>
              {filePath}
            </span>

            {/* Timestamp (Follow mode) */}
            {timestamp != null && (
              <span
                className="text-muted-foreground text-xs flex-shrink-0"
                title={new Date(timestamp).toLocaleString()}
                data-testid="timestamp"
              >
                {formatRelativeTime(timestamp)}
              </span>
            )}
          </div>

          {/* Diff/Edit mode toggle for modified files */}
          {showDiffToggle && (
            <>
              <div className="h-4 w-px bg-border mx-1 flex-shrink-0" />
              <DiffModeToggle
                isDiffMode={isDiffMode}
                onToggle={handleToggleDiffMode}
                variant="compact"
              />
            </>
          )}

          {/* Editor Controls (shown when dirty or previously activated) */}
          {showEditorControls && (
            <>
              {/* Separator before editor controls */}
              <div className="h-4 w-px bg-border mx-1 flex-shrink-0" />
              <EditorActionButtons
                onUndo={editorActions.undo}
                onRedo={editorActions.redo}
                onSave={editorActions.save}
                onFind={editorActions.find}
                canUndo={editorActions.canUndo}
                canRedo={editorActions.canRedo}
                canSave={isDirty}
                variant="compact"
              />
            </>
          )}
        </div>

        {/* Git Action Buttons */}
        <div className="flex-shrink-0 flex items-center gap-1">
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
              {canRevert && (
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
        </div>

        {/* Git Status Badge */}
        <GitBadge status={status} />
      </div>

      {/* Editor (expanded only) - height is auto-sized */}
      {/* Use deleted file viewer for deleted files (read-only, shows git content) */}
      {/* Use regular editor for new files (untracked/added) or when in edit mode */}
      {/* Use diff editor for modified files when in diff mode */}
      {isExpanded && (
        <div
          ref={editorContainerRef}
          className="bg-background"
          style={transitionStyle}
          data-testid="file-change-diff-content"
        >
          <EditorErrorBoundary filePath={filePath}>
            {status.status === "deleted" ? (
              <DeletedFileViewer
                editorId={editorId}
                cwd={cwd}
                sandboxId={sandboxId}
                filePath={fullFilePath}
                baseBranch={baseBranch}
                autoSize={autoSizeConfig}
                onMount={handleEditorMount}
              />
            ) : status.status === "untracked" ||
              status.status === "added" ||
              !isDiffMode ? (
              <RegularEditorWrapper
                editorId={editorId}
                cwd={cwd}
                filePath={fullFilePath}
                autoSize={autoSizeConfig}
                onMount={handleEditorMount}
              />
            ) : (
              <DiffEditorWrapper
                editorId={editorId}
                cwd={cwd}
                sandboxId={sandboxId}
                filePath={fullFilePath}
                baseBranch={baseBranch}
                autoSize={autoSizeConfig}
                onMount={handleDiffEditorMount}
                hideUnchangedRegions
              />
            )}
          </EditorErrorBoundary>
        </div>
      )}
    </div>
  );
}
