/**
 * FileEditor - Unified file editor component.
 *
 * Renders a file with its content and toolbar. Supports two layouts:
 * - "standalone": Full editor view with toolbar (used by EditorPane)
 * - "inline": Collapsible file in a list (used by ReviewWorkingPane/ReviewCommitPane)
 *
 * And three contexts:
 * - "working": Interactive mode with git actions, editing, dirty tracking
 * - "commit": Read-only mode for viewing historical commits
 * - "normal": Regular file editing without git context
 *
 * @example
 * ```tsx
 * // Standalone editing
 * <FileEditor
 *   layout="standalone"
 *   context="normal"
 *   filePath="/project/src/index.ts"
 *   cwd="/project"
 * />
 *
 * // Inline in working tree review
 * <FileEditor
 *   layout="inline"
 *   context="working"
 *   filePath="src/index.ts"
 *   cwd="/project"
 *   git={git}
 *   status={fileStatus}
 *   isExpanded={true}
 *   onToggle={toggle}
 * />
 *
 * // Inline in commit review
 * <FileEditor
 *   layout="inline"
 *   context="commit"
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

import { gitMutations } from "@features/git/client/queries";
import type { CommitFile, GitFileStatus } from "@features/git/model";
import type { GitSubscription } from "@features/git/client/GitSubscription";
import { useMutation } from "@tanstack/react-query";
import * as monaco from "monaco-editor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useDiffModeTransition,
  useEditorActions,
  useEditorSaveKeybinding,
  useModelState,
} from "../../hooks";
import { MonacoModelRegistry, createModelKey } from "../../registry";
import type { ContentSource } from "../../types";
import { canStageFile, commitFileToFileChange, joinCwdPath } from "../../utils";
import { EditorErrorBoundary } from "../EditorErrorBoundary";
import {
  DiffEditorWrapper,
  EDITOR_MAX_HEIGHT,
  RegularEditorWrapper,
} from "../EditorPane";
import { EditorToolbar } from "../Toolbar";

// ============================================================================
// Types
// ============================================================================

interface BaseProps {
  /** Layout mode: standalone (full editor) or inline (collapsible in list) */
  layout: "standalone" | "inline";

  /** Relative file path from git root */
  filePath: string;

  /** Working directory */
  cwd: string;

  /** Monaco theme name */
  theme?: string;

  /** Auto-size editor height (max height before scrolling) */
  autoSize?: number;
}

interface InlineProps {
  /** Whether the editor is expanded (inline mode only) */
  isExpanded: boolean;

  /** Toggle expansion callback (inline mode only) */
  onToggle: () => void;
}

interface StandaloneProps {
  /** Not used in standalone mode */
  isExpanded?: never;
  onToggle?: never;

  /** Optional back button callback (standalone mode only) */
  onBack?: () => void;
}

interface WorkingContextProps {
  /** Working context - interactive with git actions */
  context: "working";

  /** Git subscription (required for working context) */
  git: GitSubscription;

  /** Git status for this file (required for working context) */
  status: GitFileStatus;

  /** Git ref for original content (default: 'HEAD') */
  baseBranch?: string;

  /** Whether this file has unseen changes (Follow mode) */
  isUnseen?: boolean;

  /** Timestamp when this file was last modified (Follow mode) */
  timestamp?: number | null;

  /** Mark a file as seen when the user interacts with it (unseen tracking) */
  markSeen?: (path: string) => void;

  /** Check if a file has unsaved changes - used to prevent staging dirty files */
  isFileDirty?: (filePath: string) => boolean;

  // Commit context props not used
  commitFile?: never;
  commitId?: never;
  parentCommitId?: never;
}

interface CommitContextProps {
  /** Commit context - read-only historical view */
  context: "commit";

  /** Commit file info (required for commit context) */
  commitFile: CommitFile;

  /** Commit ID for the "after" state (required for commit context) */
  commitId: string;

  /** Parent commit ID for the "before" state (required for commit context) */
  parentCommitId: string;

  // Working context props not used
  git?: never;
  status?: never;
  baseBranch?: never;
  isUnseen?: never;
  timestamp?: never;
  markSeen?: never;
  isFileDirty?: never;
}

interface NormalContextProps {
  /** Normal context - regular file editing */
  context: "normal";

  /** Optional content source (default: workingDirectory) */
  source?: ContentSource;

  /** Whether the file is read-only */
  readOnly?: boolean;

  // Git-specific props not used
  git?: never;
  status?: never;
  baseBranch?: never;
  isUnseen?: never;
  timestamp?: never;
  markSeen?: never;
  isFileDirty?: never;
  commitFile?: never;
  commitId?: never;
  parentCommitId?: never;
}

// Combine layout and context props
type InlineWorkingProps = BaseProps & InlineProps & WorkingContextProps;
type InlineCommitProps = BaseProps & InlineProps & CommitContextProps;
type StandaloneNormalProps = BaseProps & StandaloneProps & NormalContextProps;
type StandaloneWorkingProps = BaseProps & StandaloneProps & WorkingContextProps;
type StandaloneCommitProps = BaseProps & StandaloneProps & CommitContextProps;

export type FileEditorProps =
  | InlineWorkingProps
  | InlineCommitProps
  | StandaloneNormalProps
  | StandaloneWorkingProps
  | StandaloneCommitProps;

// ============================================================================
// Component
// ============================================================================

/**
 * Unified file editor component.
 * Handles standalone and inline layouts with working, commit, and normal contexts.
 */
export function FileEditor(props: FileEditorProps) {
  const { layout, filePath, cwd, theme, autoSize = EDITOR_MAX_HEIGHT } = props;

  // Layout-specific props
  const isInline = layout === "inline";
  const isExpanded = isInline ? (props as InlineProps).isExpanded : true;
  const onToggle = isInline ? (props as InlineProps).onToggle : undefined;
  const onBack = !isInline ? (props as StandaloneProps).onBack : undefined;

  // Context detection
  const context = props.context;
  const isWorkingContext = context === "working";
  const isCommitContext = context === "commit";
  const isNormalContext = context === "normal";

  // ---------------------------------------------------------------------------
  // Context-specific extraction
  // ---------------------------------------------------------------------------

  // Working context props
  const git = isWorkingContext ? props.git : undefined;
  const status = isWorkingContext ? props.status : undefined;
  const baseBranch = isWorkingContext ? props.baseBranch : undefined;
  const isUnseen = isWorkingContext ? (props.isUnseen ?? false) : false;
  const timestamp = isWorkingContext ? props.timestamp : undefined;
  const markSeen = isWorkingContext ? props.markSeen : undefined;
  const isFileDirty = isWorkingContext ? props.isFileDirty : undefined;

  // Commit context props
  const commitFile = isCommitContext ? props.commitFile : undefined;
  const commitId = isCommitContext ? props.commitId : undefined;
  const parentCommitId = isCommitContext ? props.parentCommitId : undefined;

  // Normal context props
  const normalSource = isNormalContext ? props.source : undefined;

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  // Focus listeners are registered once per editor, so they read the latest
  // callback through a ref.
  const markFileSeen = markSeen && (() => markSeen(filePath));
  const markFileSeenRef = useRef(markFileSeen);
  useEffect(() => {
    markFileSeenRef.current = markFileSeen;
  }, [markFileSeen]);

  const fileName = useMemo(() => {
    return filePath.split("/").pop() ?? filePath;
  }, [filePath]);

  const fullFilePath = useMemo(() => {
    return joinCwdPath(cwd, filePath);
  }, [cwd, filePath]);

  // Get file status code for display
  const fileStatus = useMemo(() => {
    if (isWorkingContext && status) {
      return status.status;
    }
    if (isCommitContext && commitFile) {
      return commitFile.status;
    }
    return "modified";
  }, [isWorkingContext, isCommitContext, status, commitFile]);

  // Is this file staged (only relevant in working context)
  const isStaged = isWorkingContext && status?.staged;

  // Original path for renamed files
  const originalPath = isWorkingContext
    ? status?.originalPath
    : commitFile?.originalPath;

  // Editor ID - unique per file and context
  const editorId = useMemo(() => {
    if (isWorkingContext) {
      const stageSuffix = isStaged ? "-staged" : "-unstaged";
      return `file-editor-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}${stageSuffix}`;
    }
    if (isCommitContext) {
      return `file-editor-commit-${commitId?.slice(0, 7)}-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}`;
    }
    return `file-editor-${filePath.replace(/[^a-zA-Z0-9]/g, "-")}`;
  }, [isWorkingContext, isCommitContext, filePath, isStaged, commitId]);

  // ---------------------------------------------------------------------------
  // Content Source Calculation
  // ---------------------------------------------------------------------------

  const { originalSource, modifiedSource } = useMemo((): {
    originalSource: ContentSource;
    modifiedSource: ContentSource;
  } => {
    // Only a commit context has commit ids
    if (parentCommitId !== undefined && commitId !== undefined) {
      return { originalSource: parentCommitId, modifiedSource: commitId };
    }

    if (isNormalContext) {
      const source = normalSource ?? "workingDirectory";
      return { originalSource: "head", modifiedSource: source };
    }

    // Working context
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
  }, [
    isNormalContext,
    normalSource,
    baseBranch,
    status,
    parentCommitId,
    commitId,
  ]);

  // ---------------------------------------------------------------------------
  // Read-only Detection
  // ---------------------------------------------------------------------------

  // Editor is readonly when the content source is not workingDirectory
  // This includes: commit context, deleted files, staged files, explicit readonly
  const isReadOnly = useMemo(() => {
    // Deleted files show original content which is readonly
    if (fileStatus === "deleted") {
      return true;
    }

    // Normal context with explicit readonly prop
    if (isNormalContext && props.readOnly) {
      return true;
    }

    // Check if modified source is editable (only workingDirectory is editable)
    return modifiedSource !== "workingDirectory";
  }, [fileStatus, isNormalContext, props, modifiedSource]);

  // ---------------------------------------------------------------------------
  // Editor Controls State
  // ---------------------------------------------------------------------------

  const [editor, setEditor] =
    useState<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [controlsActivated, setControlsActivated] = useState(false);

  // Show diff toggle for modified files (not for added/deleted/untracked/readonly)
  const showDiffToggle =
    !isReadOnly &&
    fileStatus !== "untracked" &&
    fileStatus !== "added" &&
    fileStatus !== "deleted";

  const { isDiffMode, setIsDiffMode } = useDiffModeTransition();

  // In commit context, always show diff (no edit mode)
  const effectiveDiffMode = isCommitContext ? true : isDiffMode;

  // Model state for dirty tracking
  const modelState = useModelState(!isReadOnly ? fullFilePath : null);
  const isDirty = !isReadOnly && (modelState?.isDirty ?? false);

  useEffect(() => {
    if (isDirty && !controlsActivated) {
      setControlsActivated(true);
    }
  }, [isDirty, controlsActivated]);

  // Show editor controls when dirty or previously activated (not for deleted/read-only)
  const _showEditorControls =
    !isReadOnly && fileStatus !== "deleted" && (isDirty || controlsActivated);

  // Save handler
  const handleSave = useCallback(async () => {
    if (isReadOnly || !fullFilePath) return;

    try {
      const registry = MonacoModelRegistry.getInstance();
      await registry.saveModel(createModelKey(fullFilePath));
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  }, [isReadOnly, fullFilePath]);

  const { registerSaveKeybinding } = useEditorSaveKeybinding(
    handleSave,
    editorId,
  );

  const editorActions = useEditorActions(editor, modelState, handleSave);

  // Handle editor mount
  const handleEditorMount = useCallback(
    (mountedEditor: monaco.editor.IStandaloneCodeEditor) => {
      setEditor(mountedEditor);
      if (!isReadOnly) {
        registerSaveKeybinding(mountedEditor);
      }
      mountedEditor.onDidFocusEditorText(() => {
        markFileSeenRef.current?.();
      });
    },
    [isReadOnly, registerSaveKeybinding],
  );

  const handleDiffEditorMount = useCallback(
    (diffEditor: monaco.editor.IStandaloneDiffEditor) => {
      const modifiedEditor = diffEditor.getModifiedEditor();
      setEditor(modifiedEditor);
      if (!isReadOnly) {
        registerSaveKeybinding(modifiedEditor);
      }
      modifiedEditor.onDidFocusEditorText(() => {
        markFileSeenRef.current?.();
      });
      diffEditor.getOriginalEditor().onDidFocusEditorText(() => {
        markFileSeenRef.current?.();
      });
    },
    [isReadOnly, registerSaveKeybinding],
  );

  const handleToggle = useCallback(() => {
    if (isWorkingContext) {
      markSeen?.(filePath);
    }
    onToggle?.();
  }, [isWorkingContext, markSeen, filePath, onToggle]);

  // ---------------------------------------------------------------------------
  // Badge status for GitBadge
  // ---------------------------------------------------------------------------

  const badgeStatus = useMemo(() => {
    if (isWorkingContext && status) {
      return status;
    }
    if (isCommitContext && commitFile) {
      const fileChange = commitFileToFileChange(commitFile);
      return {
        path: commitFile.path,
        status: fileChange.status,
        staged: true as const,
        originalPath: commitFile.originalPath,
      };
    }
    return null;
  }, [isWorkingContext, isCommitContext, status, commitFile]);

  // ---------------------------------------------------------------------------
  // Render Editor Content
  // ---------------------------------------------------------------------------

  const renderEditor = () => (
    <EditorErrorBoundary filePath={filePath}>
      {fileStatus === "added" ? (
        <RegularEditorWrapper
          editorId={editorId}
          cwd={cwd}
          filePath={fullFilePath}
          source={modifiedSource}
          autoSize={autoSize}
          onMount={handleEditorMount}
          theme={theme}
        />
      ) : fileStatus === "deleted" ? (
        <RegularEditorWrapper
          editorId={editorId}
          cwd={cwd}
          filePath={
            originalPath ? joinCwdPath(cwd, originalPath) : fullFilePath
          }
          source={originalSource}
          autoSize={autoSize}
          onMount={handleEditorMount}
          theme={theme}
        />
      ) : fileStatus === "untracked" || !effectiveDiffMode ? (
        <RegularEditorWrapper
          editorId={editorId}
          cwd={cwd}
          filePath={fullFilePath}
          source={modifiedSource}
          autoSize={autoSize}
          onMount={handleEditorMount}
          theme={theme}
        />
      ) : (
        <DiffEditorWrapper
          editorId={editorId}
          cwd={cwd}
          filePath={fullFilePath}
          originalFilePath={
            originalPath ? joinCwdPath(cwd, originalPath) : undefined
          }
          originalSource={originalSource}
          modifiedSource={modifiedSource}
          autoSize={autoSize}
          onMount={handleDiffEditorMount}
          hideUnchangedRegions
          theme={theme}
        />
      )}
    </EditorErrorBoundary>
  );

  // ---------------------------------------------------------------------------
  // Git action handlers for EditorToolbar
  // ---------------------------------------------------------------------------

  // Only the working context has git, and only it shows these actions
  const { mutate: stage } = useMutation(git ? gitMutations.stage(git.cwd) : {});
  const { mutate: unstage } = useMutation(
    git ? gitMutations.unstage(git.cwd) : {},
  );
  const { mutate: revert } = useMutation(
    git ? gitMutations.revert(git.cwd) : {},
  );

  const handleToolbarStage = useCallback(() => {
    if (!isWorkingContext || !git) return;

    if (!canStageFile(fullFilePath, isFileDirty)) {
      return;
    }

    markSeen?.(filePath);
    stage([filePath]);
  }, [
    isWorkingContext,
    git,
    stage,
    filePath,
    fullFilePath,
    markSeen,
    isFileDirty,
  ]);

  const handleToolbarUnstage = useCallback(() => {
    if (!isWorkingContext || !git) return;

    markSeen?.(filePath);
    unstage([filePath]);
  }, [isWorkingContext, git, unstage, filePath, markSeen]);

  const handleToolbarRevert = useCallback(() => {
    if (!isWorkingContext || !git) return;

    const confirmed = window.confirm(
      `Discard changes to "${filePath}"?\n\nThis action cannot be undone.`,
    );

    if (!confirmed) return;

    markSeen?.(filePath);
    revert([filePath]);
  }, [isWorkingContext, git, revert, filePath, markSeen]);

  // ---------------------------------------------------------------------------
  // Render Toolbar using EditorToolbar
  // ---------------------------------------------------------------------------

  const renderToolbar = () => (
    <EditorToolbar
      // File info
      filePath={fullFilePath}
      displayPath={filePath}
      modelState={modelState}
      // Inline mode props
      onClick={isInline ? handleToggle : undefined}
      isExpanded={isExpanded}
      showChevron={isInline}
      // Back button (standalone mode)
      showBackButton={!isInline && !!onBack}
      onBack={onBack}
      // Read-only / commit mode
      readOnly={isReadOnly}
      commitShortId={isCommitContext ? commitId?.slice(0, 7) : undefined}
      // Diff toggle (only for modifiable files)
      showDiffToggle={showDiffToggle}
      isDiffMode={isDiffMode}
      onToggleDiffMode={setIsDiffMode}
      // Editor actions
      onSave={editorActions.save}
      onUndo={editorActions.undo}
      onRedo={editorActions.redo}
      onFind={editorActions.find}
      canUndo={editorActions.canUndo}
      canRedo={editorActions.canRedo}
      // Git actions (working context only)
      onStage={isWorkingContext && !isStaged ? handleToolbarStage : undefined}
      onUnstage={
        isWorkingContext && isStaged ? handleToolbarUnstage : undefined
      }
      onRevert={isWorkingContext && !isStaged ? handleToolbarRevert : undefined}
      isStaged={isStaged}
      gitStatus={badgeStatus ?? undefined}
      // Follow mode
      isUnseen={isUnseen}
      timestamp={timestamp}
    />
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (layout === "standalone") {
    return (
      <div
        className="flex flex-col h-full"
        data-testid={`file-editor-${fileName}`}
        data-filepath={filePath}
        data-context={context}
      >
        {/* Toolbar (EditorToolbar has border-b built in) */}
        {renderToolbar()}

        {/* Editor */}
        <div className="flex-1 overflow-hidden bg-background">
          {renderEditor()}
        </div>
      </div>
    );
  }

  // Inline layout
  return (
    <div
      className="last:border-b-0"
      data-testid={`file-editor-${fileName}`}
      data-filepath={filePath}
      data-context={context}
      data-staged={isStaged ? "true" : "false"}
    >
      {/* Collapsible Header (EditorToolbar has border-b built in) */}
      {renderToolbar()}

      {/* Editor (expanded only) */}
      {isExpanded && (
        <div className="bg-background" data-testid="file-editor-content">
          {renderEditor()}
        </div>
      )}
    </div>
  );
}
