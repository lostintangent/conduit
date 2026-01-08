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

import type { GitFileStatus } from "@/api/GitV2API";
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
import { canStageFile, formatRelativeTime, joinCwdPath } from "../../utils";
import * as monaco from "monaco-editor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useDiffModeTransition,
  useEditorActions,
  useEditorSaveKeybinding,
  useModelState,
  type ReadTriggerAction,
} from "../../hooks";
import { MonacoModelRegistry, createModelKey } from "../../registry";
import type { ContentSource } from "../../types";
import { EditorErrorBoundary } from "../EditorErrorBoundary";
import {
  DiffEditorWrapper,
  EDITOR_MAX_HEIGHT,
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
  triggerRead?: (action: ReadTriggerAction) => void;

  // ---------------------------------------------------------------------------
  // Dirty File Checking
  // ---------------------------------------------------------------------------

  /** Check if a file has unsaved changes - used to prevent staging dirty files */
  isFileDirty?: (filePath: string) => boolean;
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
  triggerRead,
  isFileDirty,
}: FileChangeDiffProps) {
  // Ref to hold latest triggerRead for event handlers that capture closures at mount time
  const triggerReadRef = useRef(triggerRead);
  useEffect(() => {
    triggerReadRef.current = triggerRead;
  }, [triggerRead]);

  const fileName = useMemo(() => {
    return filePath.split("/").pop() ?? filePath;
  }, [filePath]);

  // Full path for the diff editor
  const fullFilePath = useMemo(() => {
    return joinCwdPath(cwd, filePath);
  }, [cwd, filePath]);

  // Stable editor ID based on file path and staging status
  // Important: Include staged suffix to prevent Monaco model URI conflicts
  // when both staged and unstaged entries of a partially staged file are rendered
  const editorId = useMemo(() => {
    const stageSuffix = status.staged ? "-staged" : "-unstaged";
    return `file-change-diff-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}${stageSuffix}`;
  }, [filePath, status.staged]);

  const isStaged = status.staged;

  // ---------------------------------------------------------------------------
  // Content Source Calculation
  // ---------------------------------------------------------------------------

  /**
   * Calculate content sources for diff view based on staging status.
   *
   * For normal staged/unstaged view (no baseBranch or baseBranch === 'HEAD'):
   * - Staged changes: HEAD → Index (comparing what was committed vs what's staged)
   * - Unstaged with index changes: Index → Working Directory (partially staged file)
   * - Unstaged without index changes: HEAD → Working Directory (normal unstaged)
   *
   * For branch comparison mode (baseBranch !== 'HEAD'):
   * - All files compared against the base branch
   */
  const { originalSource, modifiedSource } = useMemo((): {
    originalSource: ContentSource;
    modifiedSource: ContentSource;
  } => {
    // Branch comparison mode: compare against the specified branch
    if (baseBranch && baseBranch !== "HEAD") {
      return { originalSource: baseBranch, modifiedSource: "workingDirectory" };
    }

    // Normal staged/unstaged view
    if (status.staged) {
      // Staged changes: show HEAD → Index
      return { originalSource: "head", modifiedSource: "index" };
    } else if (status.hasIndexChanges) {
      // Unstaged changes for a partially staged file: show Index → Working Directory
      return { originalSource: "index", modifiedSource: "workingDirectory" };
    } else {
      // Normal unstaged changes: show HEAD → Working Directory
      return { originalSource: "head", modifiedSource: "workingDirectory" };
    }
  }, [baseBranch, status.staged, status.hasIndexChanges]);

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

  // Diff/edit mode toggle state
  const { isDiffMode, handleToggle: handleToggleDiffMode } =
    useDiffModeTransition();

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
      // Use ref to ensure we always call the latest triggerRead
      mountedEditor.onDidFocusEditorText(() => {
        triggerReadRef.current?.("file:focus");
      });
    },
    [registerSaveKeybinding],
  );

  // Handle diff editor mount - get modified editor, register keybindings, and track focus
  const handleDiffEditorMount = useCallback(
    (diffEditor: monaco.editor.IStandaloneDiffEditor) => {
      const modifiedEditor = diffEditor.getModifiedEditor();
      setEditor(modifiedEditor);
      registerSaveKeybinding(modifiedEditor);

      // Mark as seen when user focuses either side of the diff editor
      // Use ref to ensure we always call the latest triggerRead
      modifiedEditor.onDidFocusEditorText(() => {
        triggerReadRef.current?.("file:focus");
      });
      diffEditor.getOriginalEditor().onDidFocusEditorText(() => {
        triggerReadRef.current?.("file:focus");
      });
    },
    [registerSaveKeybinding],
  );

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleStage = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();

      // Check if file has unsaved changes
      if (!canStageFile(fullFilePath, isFileDirty)) {
        return;
      }

      triggerRead?.("file:stage", filePath); // Mark as seen when staging
      try {
        await git.stage([filePath]);
      } catch (error) {
        console.error("Failed to stage file:", error);
      }
    },
    [git, filePath, fullFilePath, triggerRead, isFileDirty],
  );

  const handleUnstage = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      triggerRead?.("file:unstage", filePath); // Mark as seen when unstaging
      try {
        await git.unstage([filePath]);
      } catch (error) {
        console.error("Failed to unstage file:", error);
      }
    },
    [git, filePath, triggerRead],
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

      triggerRead?.("file:revert"); // Mark as seen when reverting
      try {
        await git.revert([filePath]);
      } catch (error) {
        console.error("Failed to revert file:", error);
      }
    },
    [git, filePath, triggerRead],
  );

  /**
   * Handle toggle with interaction tracking.
   * Marks as seen on both expand and collapse (user has interacted with the file).
   */
  const handleToggle = useCallback(() => {
    const action = isExpanded ? "file:collapse" : "file:expand";
    triggerRead?.(action);
    onToggle();
  }, [isExpanded, triggerRead, onToggle]);

  // Revert is available for all file types:
  // - Modified/deleted files: restore from HEAD
  // - Untracked/added files: delete the file
  const canRevert = true;

  return (
    <div
      className="border-b border-border last:border-b-0"
      data-testid={`file-change-diff-${fileName}`}
      data-filepath={filePath}
      data-staged={isStaged ? "true" : "false"}
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
      {/* Use read-only editor for deleted files (shows git content from original source) */}
      {/* Use regular editor for new files (untracked/added) or when in edit mode */}
      {/* Use diff editor for modified files when in diff mode */}
      {isExpanded && (
        <div className="bg-background" data-testid="file-change-diff-content">
          <EditorErrorBoundary filePath={filePath}>
            {status.status === "deleted" ? (
              // Deleted files: show read-only content from git (HEAD or index)
              <RegularEditorWrapper
                editorId={editorId}
                cwd={cwd}
                sandboxId={sandboxId}
                filePath={fullFilePath}
                source={originalSource}
                autoSize={EDITOR_MAX_HEIGHT}
                onMount={handleEditorMount}
              />
            ) : status.status === "untracked" ||
              status.status === "added" ||
              !isDiffMode ? (
              // New files or edit mode: show content based on staging status
              // - Staged files: show index content (read-only)
              // - Unstaged/untracked files: show working directory (editable)
              <RegularEditorWrapper
                editorId={editorId}
                cwd={cwd}
                sandboxId={sandboxId}
                filePath={fullFilePath}
                source={modifiedSource}
                autoSize={EDITOR_MAX_HEIGHT}
                onMount={handleEditorMount}
              />
            ) : (
              // Diff mode: show comparison based on staging status
              <DiffEditorWrapper
                editorId={editorId}
                cwd={cwd}
                sandboxId={sandboxId}
                filePath={fullFilePath}
                originalSource={originalSource}
                modifiedSource={modifiedSource}
                autoSize={EDITOR_MAX_HEIGHT}
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
