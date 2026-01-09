/**
 * ReviewPaneFile - Shared file component for review panes.
 *
 * Displays a collapsible diff view for a single changed file.
 * Supports two modes:
 * - "working": Interactive mode with git actions, editing, dirty tracking
 * - "commit": Read-only mode for viewing historical commits
 *
 * Used by both ReviewWorkingPane and ReviewCommitPane to ensure consistent
 * rendering and behavior across review contexts.
 *
 * @example
 * ```tsx
 * // Working mode (interactive)
 * <ReviewPaneFile
 *   mode="working"
 *   filePath="src/index.ts"
 *   cwd="/project"
 *   git={git}
 *   status={fileStatus}
 *   isExpanded={true}
 *   onToggle={toggle}
 * />
 *
 * // Commit mode (read-only)
 * <ReviewPaneFile
 *   mode="commit"
 *   filePath="src/index.ts"
 *   cwd="/project"
 *   commitFile={file}
 *   commitId="abc123"
 *   parentCommitId="def456"
 *   isExpanded={true}
 *   onToggle={toggle}
 * />
 * ```
 */

import type { CommitFile, GitFileStatus, GitV2API } from "@/api/GitV2API";
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
import {
  canStageFile,
  commitFileToFileChange,
  formatRelativeTime,
  joinCwdPath,
} from "../../utils";
import { EditorErrorBoundary } from "../EditorErrorBoundary";
import {
  DiffEditorWrapper,
  EDITOR_MAX_HEIGHT,
  RegularEditorWrapper,
} from "../EditorPane";
import { DiffModeToggle } from "./DiffModeToggle";
import { EditorActionButtons } from "./EditorActionButtons";
import { GitBadge } from "./GitBadge";

// ============================================================================
// Types
// ============================================================================

interface BaseProps {
  /** Relative file path from git root */
  filePath: string;

  /** Working directory */
  cwd: string;

  /** Optional sandbox ID for cloud VM operations */
  sandboxId?: string;

  /** Whether the diff is expanded */
  isExpanded: boolean;

  /** Toggle expansion callback */
  onToggle: () => void;
}

interface WorkingModeProps extends BaseProps {
  /** Working mode - interactive with git actions */
  mode: "working";

  /** Git API instance (required for working mode) */
  git: GitV2API;

  /** Git status for this file (required for working mode) */
  status: GitFileStatus;

  /** Git ref for original content (default: 'HEAD') */
  baseBranch?: string;

  /** Whether this file has unseen changes (Follow mode) */
  isUnseen?: boolean;

  /** Timestamp when this file was last modified (Follow mode) */
  timestamp?: number | null;

  /** Callback when user interacts with the file (marks as seen) */
  triggerRead?: (action: ReadTriggerAction) => void;

  /** Check if a file has unsaved changes - used to prevent staging dirty files */
  isFileDirty?: (filePath: string) => boolean;

  // Commit mode props not used
  commitFile?: never;
  commitId?: never;
  parentCommitId?: never;
}

interface CommitModeProps extends BaseProps {
  /** Commit mode - read-only historical view */
  mode: "commit";

  /** Commit file info (required for commit mode) */
  commitFile: CommitFile;

  /** Commit ID for the "after" state (required for commit mode) */
  commitId: string;

  /** Parent commit ID for the "before" state (required for commit mode) */
  parentCommitId: string;

  // Working mode props not used
  git?: never;
  status?: never;
  baseBranch?: never;
  isUnseen?: never;
  timestamp?: never;
  triggerRead?: never;
  isFileDirty?: never;
}

export type ReviewPaneFileProps = WorkingModeProps | CommitModeProps;

// ============================================================================
// Component
// ============================================================================

/**
 * Shared file component for review panes.
 * Handles both working tree (interactive) and commit (read-only) modes.
 */
export function ReviewPaneFile(props: ReviewPaneFileProps) {
  const { mode, filePath, cwd, sandboxId, isExpanded, onToggle } = props;

  // ---------------------------------------------------------------------------
  // Mode-specific extraction
  // ---------------------------------------------------------------------------

  const isWorkingMode = mode === "working";

  // Working mode props
  const git = isWorkingMode ? props.git : undefined;
  const status = isWorkingMode ? props.status : undefined;
  const baseBranch = isWorkingMode ? props.baseBranch : undefined;
  const isUnseen = isWorkingMode ? (props.isUnseen ?? false) : false;
  const timestamp = isWorkingMode ? props.timestamp : undefined;
  const triggerRead = isWorkingMode ? props.triggerRead : undefined;
  const isFileDirty = isWorkingMode ? props.isFileDirty : undefined;

  // Commit mode props
  const commitFile = !isWorkingMode ? props.commitFile : undefined;
  const commitId = !isWorkingMode ? props.commitId : undefined;
  const parentCommitId = !isWorkingMode ? props.parentCommitId : undefined;

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  // Ref to hold latest triggerRead for event handlers that capture closures at mount time
  const triggerReadRef = useRef(triggerRead);
  useEffect(() => {
    triggerReadRef.current = triggerRead;
  }, [triggerRead]);

  const fileName = useMemo(() => {
    return filePath.split("/").pop() ?? filePath;
  }, [filePath]);

  const fullFilePath = useMemo(() => {
    return joinCwdPath(cwd, filePath);
  }, [cwd, filePath]);

  // Get file status code for display
  const fileStatus = useMemo(() => {
    if (isWorkingMode && status) {
      return status.status;
    }
    if (!isWorkingMode && commitFile) {
      return commitFile.status;
    }
    return "modified";
  }, [isWorkingMode, status, commitFile]);

  // Is this file staged (only relevant in working mode)
  const isStaged = isWorkingMode && status?.staged;

  // Original path for renamed files
  const originalPath = isWorkingMode
    ? status?.originalPath
    : commitFile?.originalPath;

  // Editor ID - unique per file and context
  const editorId = useMemo(() => {
    if (isWorkingMode) {
      const stageSuffix = isStaged ? "-staged" : "-unstaged";
      return `review-file-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}${stageSuffix}`;
    }
    // Commit mode: include commit ID for uniqueness
    return `review-commit-${commitId?.slice(0, 7)}-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}`;
  }, [isWorkingMode, filePath, isStaged, commitId]);

  // ---------------------------------------------------------------------------
  // Content Source Calculation
  // ---------------------------------------------------------------------------

  const { originalSource, modifiedSource } = useMemo((): {
    originalSource: ContentSource;
    modifiedSource: ContentSource;
  } => {
    if (!isWorkingMode) {
      // Commit mode: compare parent commit to this commit
      return {
        originalSource: parentCommitId!,
        modifiedSource: commitId!,
      };
    }

    // Working mode: determine based on staging status
    if (baseBranch && baseBranch !== "HEAD") {
      return { originalSource: baseBranch, modifiedSource: "workingDirectory" };
    }

    if (status?.staged) {
      return { originalSource: "head", modifiedSource: "index" };
    } else if (status?.hasIndexChanges) {
      return { originalSource: "index", modifiedSource: "workingDirectory" };
    } else {
      return { originalSource: "head", modifiedSource: "workingDirectory" };
    }
  }, [isWorkingMode, baseBranch, status, parentCommitId, commitId]);

  // ---------------------------------------------------------------------------
  // Editor Controls State (working mode only)
  // ---------------------------------------------------------------------------

  const [editor, setEditor] =
    useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [controlsActivated, setControlsActivated] = useState(false);

  // Only show diff toggle in working mode for modified files
  const showDiffToggle =
    isWorkingMode &&
    fileStatus !== "untracked" &&
    fileStatus !== "added" &&
    fileStatus !== "deleted";

  const { isDiffMode, handleToggle: handleToggleDiffMode } =
    useDiffModeTransition();

  // In commit mode, always show diff (no edit mode)
  const effectiveDiffMode = isWorkingMode ? isDiffMode : true;

  // Model state for dirty tracking (working mode only)
  const modelState = useModelState(
    isWorkingMode ? fullFilePath : null,
    sandboxId,
  );
  const isDirty = isWorkingMode && (modelState?.isDirty ?? false);

  useEffect(() => {
    if (isDirty && !controlsActivated) {
      setControlsActivated(true);
    }
  }, [isDirty, controlsActivated]);

  const showEditorControls =
    isWorkingMode && fileStatus !== "deleted" && (isDirty || controlsActivated);

  // Save handler (working mode only)
  const handleSave = useCallback(async () => {
    if (!isWorkingMode || !fullFilePath) return;

    try {
      const registry = MonacoModelRegistry.getInstance();
      await registry.saveModel(createModelKey(fullFilePath, sandboxId));
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  }, [isWorkingMode, fullFilePath, sandboxId]);

  const { registerSaveKeybinding } = useEditorSaveKeybinding(
    handleSave,
    editorId,
  );

  const editorActions = useEditorActions(editor, modelState, handleSave);

  // Handle editor mount
  const handleEditorMount = useCallback(
    (mountedEditor: monaco.editor.IStandaloneCodeEditor) => {
      setEditor(mountedEditor);
      if (isWorkingMode) {
        registerSaveKeybinding(mountedEditor);
      }
      mountedEditor.onDidFocusEditorText(() => {
        triggerReadRef.current?.("file:focus");
      });
    },
    [isWorkingMode, registerSaveKeybinding],
  );

  const handleDiffEditorMount = useCallback(
    (diffEditor: monaco.editor.IStandaloneDiffEditor) => {
      const modifiedEditor = diffEditor.getModifiedEditor();
      setEditor(modifiedEditor);
      if (isWorkingMode) {
        registerSaveKeybinding(modifiedEditor);
      }
      modifiedEditor.onDidFocusEditorText(() => {
        triggerReadRef.current?.("file:focus");
      });
      diffEditor.getOriginalEditor().onDidFocusEditorText(() => {
        triggerReadRef.current?.("file:focus");
      });
    },
    [isWorkingMode, registerSaveKeybinding],
  );

  // ---------------------------------------------------------------------------
  // Git Action Handlers (working mode only)
  // ---------------------------------------------------------------------------

  const handleStage = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isWorkingMode || !git) return;

      if (!canStageFile(fullFilePath, isFileDirty)) {
        return;
      }

      triggerRead?.("file:stage");
      try {
        await git.stage([filePath]);
      } catch (error) {
        console.error("Failed to stage file:", error);
      }
    },
    [isWorkingMode, git, filePath, fullFilePath, triggerRead, isFileDirty],
  );

  const handleUnstage = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isWorkingMode || !git) return;

      triggerRead?.("file:unstage");
      try {
        await git.unstage([filePath]);
      } catch (error) {
        console.error("Failed to unstage file:", error);
      }
    },
    [isWorkingMode, git, filePath, triggerRead],
  );

  const handleRevert = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!isWorkingMode || !git) return;

      const confirmed = window.confirm(
        `Discard changes to "${filePath}"?\n\nThis action cannot be undone.`,
      );

      if (!confirmed) return;

      triggerRead?.("file:revert");
      try {
        await git.revert([filePath]);
      } catch (error) {
        console.error("Failed to revert file:", error);
      }
    },
    [isWorkingMode, git, filePath, triggerRead],
  );

  const handleToggle = useCallback(() => {
    if (isWorkingMode) {
      const action = isExpanded ? "file:collapse" : "file:expand";
      triggerRead?.(action);
    }
    onToggle();
  }, [isWorkingMode, isExpanded, triggerRead, onToggle]);

  // ---------------------------------------------------------------------------
  // Badge status for GitBadge
  // ---------------------------------------------------------------------------

  const badgeStatus = useMemo(() => {
    if (isWorkingMode && status) {
      return status;
    }
    if (!isWorkingMode && commitFile) {
      // Convert CommitFile to GitFileStatus-like object for GitBadge
      const fileChange = commitFileToFileChange(commitFile);
      return {
        path: commitFile.path,
        status: fileChange.status,
        staged: true as const, // Show as "committed" color
        originalPath: commitFile.originalPath,
      };
    }
    return { path: filePath, status: "modified" as const, staged: false };
  }, [isWorkingMode, status, commitFile, filePath]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      className="border-b border-border last:border-b-0"
      data-testid={`review-pane-file-${fileName}`}
      data-filepath={filePath}
      data-mode={mode}
      data-staged={isStaged ? "true" : "false"}
    >
      {/* Collapsible Header */}
      <div
        className={cn(
          "flex items-center gap-2 w-full py-1 px-3",
          "hover:bg-accent/50 transition-colors",
          "cursor-pointer text-[13px]",
        )}
        data-testid="review-pane-file-header"
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

            {/* Unseen indicator (working mode only) */}
            {isWorkingMode && isUnseen && (
              <Asterisk
                className="text-yellow-500 flex-shrink-0"
                size={12}
                data-testid="unseen-indicator"
              />
            )}

            {/* Dirty indicator (working mode only) */}
            {isWorkingMode && isDirty && (
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

            {/* Timestamp (working mode only) */}
            {isWorkingMode && timestamp != null && (
              <span
                className="text-muted-foreground text-xs flex-shrink-0"
                title={new Date(timestamp).toLocaleString()}
                data-testid="timestamp"
              >
                {formatRelativeTime(Math.floor(timestamp / 1000))}
              </span>
            )}
          </div>

          {/* Diff/Edit mode toggle (working mode, modified files only) */}
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

          {/* Editor Controls (working mode only, when dirty) */}
          {showEditorControls && (
            <>
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

        {/* Git Action Buttons (working mode only) */}
        {isWorkingMode && (
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
              </>
            )}
          </div>
        )}

        {/* Git Status Badge */}
        <GitBadge status={badgeStatus} />
      </div>

      {/* Editor (expanded only) */}
      {isExpanded && (
        <div className="bg-background" data-testid="review-pane-file-content">
          <EditorErrorBoundary filePath={filePath}>
            {fileStatus === "added" ? (
              // Added files: show single file view (no original to compare)
              <RegularEditorWrapper
                editorId={editorId}
                cwd={cwd}
                sandboxId={sandboxId}
                filePath={fullFilePath}
                source={modifiedSource}
                autoSize={EDITOR_MAX_HEIGHT}
                onMount={handleEditorMount}
              />
            ) : fileStatus === "deleted" ? (
              // Deleted files: show content from original source
              <RegularEditorWrapper
                editorId={editorId}
                cwd={cwd}
                sandboxId={sandboxId}
                filePath={
                  originalPath ? joinCwdPath(cwd, originalPath) : fullFilePath
                }
                source={originalSource}
                autoSize={EDITOR_MAX_HEIGHT}
                onMount={handleEditorMount}
              />
            ) : fileStatus === "untracked" || !effectiveDiffMode ? (
              // Untracked files or edit mode: show single file
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
              // Diff mode: show comparison
              <DiffEditorWrapper
                editorId={editorId}
                cwd={cwd}
                sandboxId={sandboxId}
                filePath={fullFilePath}
                originalFilePath={
                  originalPath ? joinCwdPath(cwd, originalPath) : undefined
                }
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
