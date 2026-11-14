/**
 * EditorPane - Main editor panel that orchestrates editor components.
 *
 * This is the top-level component for the editor view. It coordinates:
 * - RegularEditorWrapper (for regular editing)
 * - DiffEditorWrapper (for diff view)
 * - ExternalChangeWarning (for conflict detection)
 * - EditorToolbar (for editor actions)
 *
 * Uses conditional rendering to switch between editor and diff modes.
 * When switching modes, a brief loading state is shown to allow the new
 * editor to properly initialize with correct dimensions (Monaco needs the
 * container to have proper size before mounting).
 *
 * Uses useEditorActions hook for toolbar action wiring and state management.
 *
 * @example
 * ```tsx
 * <EditorPane
 *   editorId="main-editor"
 *   cwd="/project"
 *   git={git}
 *   selectedFile={{ path: "/project/src/index.ts", name: "index.ts", type: "file" }}
 *   viewMode={{ type: 'editor' }}
 *   theme="dark"
 * />
 * ```
 */

import type { GitFileStatus, GitV2API } from "@features/git/client/GitV2API";
import * as monaco from "monaco-editor";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useCommitDetails,
  useEditorActions,
  useEditorSaveKeybinding,
  useModelState,
  type UnseenTrackingResult,
} from "../../hooks";
import { isImageFile } from "../../hooks/useImagePreview";
import { createModelKey, MonacoModelRegistry } from "../../registry";
import type {
  ContentSource,
  FileNode,
  ModelState,
  ViewMode,
} from "../../types";
import { EditorErrorBoundary } from "../EditorErrorBoundary";
import { ReviewCommitPane } from "../ReviewCommit";
import { ReviewWorkingPane } from "../ReviewWorking";
import { EditorToolbar } from "../Toolbar";
import { FileEditor } from "../shared";
import { DeletedFileBanner } from "./DeletedFileBanner";
import { DiffEditorWrapper } from "./DiffEditorWrapper";
import { ExternalChangeWarning } from "./ExternalChangeWarning";
import { ImagePreview } from "./ImagePreview";
import { LazyMarkdownPreview } from "./LazyMarkdownPreview";
import { RegularEditorWrapper } from "./RegularEditorWrapper";

/**
 * Brief delay when transitioning between editor and diff modes.
 * This ensures the container has proper dimensions before the new editor mounts,
 * preventing the 5px sizing issue that occurs when Monaco mounts in a
 * zero-size or incorrectly-sized container.
 */
const MODE_TRANSITION_DELAY_MS = 50;

/** Show a path relative to cwd when it is inside cwd (like v1). */
function toDisplayPath(filePath: string, cwd: string): string {
  const cwdWithSlash = cwd.endsWith("/") ? cwd : `${cwd}/`;
  return filePath.startsWith(cwdWithSlash)
    ? filePath.slice(cwdWithSlash.length)
    : filePath;
}

export interface EditorPaneProps {
  /** Unique ID for the editor instance */
  editorId: string;

  /** Working directory for file operations */
  cwd: string;

  /** Git API instance (shared from parent) */
  git: GitV2API;

  /** Currently selected file (null for empty state) */
  selectedFile: FileNode | null;

  /**
   * Selected map key for changes review mode.
   * Used to distinguish between staged and unstaged entries of partially staged files.
   * The key matches the git status Map key (includes UNSTAGED_KEY_SUFFIX for unstaged entries).
   */
  selectedMapKey?: string | null;

  /** Current view mode (editor, diff, changesReview) */
  viewMode: ViewMode;

  /** Git ref for diff comparisons (default: 'HEAD') */
  baseBranch?: string;

  /** Monaco theme name */
  theme?: string;

  /** Callback when file is saved */
  onSave?: () => void;

  /** Whether to show the back button (for single-column layout) */
  showBackButton?: boolean;

  /** Handler for back button click (navigate to tree view) */
  onBack?: () => void;

  /** Whether to show the expand tree button (when tree is collapsed in split mode) */
  showExpandTreeButton?: boolean;

  /** Handler for expand tree button click */
  onExpandTree?: () => void;

  /** Whether to show the diff/edit mode toggle (only for dirty git-modified files) */
  showDiffToggle?: boolean;

  /** Whether currently in diff mode (vs regular edit mode) */
  isDiffMode?: boolean;

  /** Handler for toggling between diff and edit modes */
  onToggleDiffMode?: (isDiff: boolean) => void;

  /** Handler for exiting changes review mode */
  onExitReview?: () => void;

  /** Handler for exiting any commit mode (diff or review) */
  onExitCommitMode?: () => void;

  /** Whether the selected file is a deleted file (shows read-only git content) */
  isFileDeleted?: boolean;

  /**
   * Whether the selected file is staged (in "Showing only changed files" mode).
   * Used to determine content sources for diff view:
   * - Staged: HEAD → Index (read-only)
   * - Unstaged: HEAD → Working Directory (or Index → Working Directory if hasIndexChanges)
   */
  isFileStaged?: boolean;

  /**
   * Whether the file has changes in the git index (staging area).
   * When true on an unstaged file, the diff shows Index → Working Directory
   * instead of HEAD → Working Directory.
   */
  hasIndexChanges?: boolean;

  /**
   * Git status for the selected file (for toolbar badge).
   * Shows the status badge (M, A, D, etc.) on the right side of the toolbar.
   */
  selectedGitStatus?: GitFileStatus;

  /**
   * Label for changes mode: "Staged" or "Unstaged".
   * Shown in the toolbar when viewing files in "changes" mode.
   */
  changesViewLabel?: string;

  /** Whether to show the preview toggle (for supported file types like .md) */
  showPreviewToggle?: boolean;

  /** Whether currently in preview mode */
  isPreviewMode?: boolean;

  /** Handler for toggling between preview and editor modes */
  onTogglePreviewMode?: (isPreview: boolean) => void;

  /** Content to display in markdown preview mode */
  previewContent?: string;

  // ---------------------------------------------------------------------------
  // Unseen Tracking (shared state from parent)
  // ---------------------------------------------------------------------------

  /** Unseen tracking state and functions (shared from EditorPaneV2) */
  unseenTracking?: UnseenTrackingResult;

  // ---------------------------------------------------------------------------
  // Dirty File Checking
  // ---------------------------------------------------------------------------

  /** Check if a file has unsaved changes - used to prevent staging dirty files */
  isFileDirty?: (filePath: string) => boolean;

  // ---------------------------------------------------------------------------
  // Close Handler
  // ---------------------------------------------------------------------------

  /** Handler for close button - if provided, shows close button in toolbar */
  onClose?: () => void;
}

/**
 * Main editor panel component.
 *
 * Orchestrates the editor view based on the current mode:
 * - `editor`: Shows RegularEditorWrapper
 * - `preview`: Shows MarkdownPreview (for .md files) or ImagePreview (for images)
 * - `diff`: Shows DiffEditorWrapper
 * - `changesReview`: Shows multi-file diff view (TODO: Phase 4+)
 *
 * Memoized to prevent re-renders from parent state changes that don't affect this component.
 */
export const EditorPane = memo(function EditorPane({
  editorId,
  cwd,
  git,
  selectedFile,
  selectedMapKey,
  viewMode,
  baseBranch = "HEAD",
  theme = "vs-dark",
  onSave,
  showBackButton = false,
  onBack,
  showExpandTreeButton = false,
  onExpandTree,
  showDiffToggle = false,
  isDiffMode = false,
  onToggleDiffMode,
  onExitReview,
  onExitCommitMode,
  isFileDeleted = false,
  isFileStaged = false,
  hasIndexChanges = false,
  selectedGitStatus,
  changesViewLabel,
  showPreviewToggle = false,
  isPreviewMode = false,
  onTogglePreviewMode,
  previewContent = "",
  // Unseen tracking
  unseenTracking,
  // Dirty file checking
  isFileDirty,
  // Close handler
  onClose,
}: EditorPaneProps) {
  // Editor instance state - using state instead of ref so changes trigger re-renders
  // This ensures useEditorActions re-subscribes when the editor changes
  const [editor, setEditor] =
    useState<monaco.editor.IStandaloneCodeEditor | null>(null);

  // Get file path from selected file
  const filePath = selectedFile?.path ?? null;

  const displayFilePath = filePath ? toDisplayPath(filePath, cwd) : "";

  // Get model state for the current file
  const modelState = useModelState(filePath);

  // ---------------------------------------------------------------------------
  // Commit Review Details (for historical mode)
  // ---------------------------------------------------------------------------

  // Extract commitId from viewMode for the hook (must be called unconditionally)
  const commitReviewId =
    viewMode.type === "commitReview" ? viewMode.commitId : null;

  // Fetch commit details when in commit review mode
  const {
    commit: commitData,
    files: historicalFiles,
    isLoading: isCommitLoading,
    error: commitError,
  } = useCommitDetails(commitReviewId, git);

  // Convert commit data to metadata format expected by ReviewCommitPane
  const commitMetadata = useMemo(() => {
    if (!commitData) return undefined;
    return {
      subject: commitData.subject,
      author: commitData.author,
      // Convert milliseconds to seconds for formatRelativeTime
      timestamp: Math.floor(commitData.timestamp / 1000),
      shortId: commitData.shortId,
      fullId: commitData.id,
    };
  }, [commitData]);

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
    if (isFileStaged) {
      // Staged changes: show HEAD → Index (read-only on both sides conceptually,
      // but modified side shows what's staged)
      return { originalSource: "head", modifiedSource: "index" };
    } else if (hasIndexChanges) {
      // Unstaged changes for a partially staged file: show Index → Working Directory
      return { originalSource: "index", modifiedSource: "workingDirectory" };
    } else {
      // Normal unstaged changes: show HEAD → Working Directory
      return { originalSource: "head", modifiedSource: "workingDirectory" };
    }
  }, [baseBranch, isFileStaged, hasIndexChanges]);

  // ---------------------------------------------------------------------------
  // Mode Transition Handling
  // ---------------------------------------------------------------------------

  // Track if we're in a transition between editor types (editor <-> diff)
  // During transition, we show a loading state to give the container time to
  // have proper dimensions before the new editor mounts.
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Track the previous viewMode type to detect mode transitions
  const previousModeTypeRef = useRef<string>(viewMode.type);

  // Effect to handle transitions between editor and diff modes
  // When switching between mode types (not within the same type), we:
  // 1. Show loading state (isTransitioning = true)
  // 2. Wait for a brief delay to ensure container has proper dimensions
  // 3. Mount the new editor (isTransitioning = false)
  useEffect(() => {
    const previousModeType = previousModeTypeRef.current;
    const currentModeType = viewMode.type;

    // Update ref for next comparison
    previousModeTypeRef.current = currentModeType;

    // Only apply transition delay when switching BETWEEN editor and diff modes
    // Not when staying in the same mode type (e.g., editor -> editor for different files)
    const isModeTypeChange =
      (previousModeType === "editor" && currentModeType === "diff") ||
      (previousModeType === "diff" && currentModeType === "editor");

    if (!isModeTypeChange) {
      // Same mode type - no transition needed
      return;
    }

    // Start transition - show loading state
    setIsTransitioning(true);

    // After a brief delay, end transition and mount the new editor
    // Using requestAnimationFrame ensures the container has been laid out
    const timeoutId = setTimeout(() => {
      requestAnimationFrame(() => {
        setIsTransitioning(false);
      });
    }, MODE_TRANSITION_DELAY_MS);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [viewMode.type]);

  // ---------------------------------------------------------------------------
  // Save Handler (for useEditorActions)
  // ---------------------------------------------------------------------------

  /**
   * Handle save action - saves the model and notifies parent.
   */
  const handleSave = useCallback(async () => {
    if (!filePath) return;

    try {
      const registry = MonacoModelRegistry.getInstance();
      await registry.saveModel(createModelKey(filePath));
      onSave?.();
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  }, [filePath, onSave]);

  // ---------------------------------------------------------------------------
  // Editor Keybindings
  // ---------------------------------------------------------------------------

  /**
   * Hook to register Cmd+S keybinding on editors.
   */
  const { registerSaveKeybinding } = useEditorSaveKeybinding(
    handleSave,
    editorId,
  );

  // ---------------------------------------------------------------------------
  // Editor Actions Hook
  // ---------------------------------------------------------------------------

  /**
   * Get editor actions from hook - provides undo/redo/find and state tracking.
   * The hook properly manages subscriptions to model changes for canUndo/canRedo.
   */
  const editorActions = useEditorActions(editor, modelState, handleSave);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle editor mount - store editor for actions hook and register keybindings.
   */
  const handleEditorMount = useCallback(
    (mountedEditor: monaco.editor.IStandaloneCodeEditor) => {
      setEditor(mountedEditor);
      registerSaveKeybinding(mountedEditor);
    },
    [registerSaveKeybinding],
  );

  /**
   * Handle diff editor mount - store modified editor and register keybindings.
   */
  const handleDiffEditorMount = useCallback(
    (diffEditor: monaco.editor.IStandaloneDiffEditor) => {
      // For diff editor, we need to get the modified (right side) editor
      const modifiedEditor = diffEditor.getModifiedEditor();
      setEditor(modifiedEditor);
      registerSaveKeybinding(modifiedEditor);
    },
    [registerSaveKeybinding],
  );

  /**
   * Handle reload from disk.
   * Discards local changes and loads current disk content.
   */
  const handleReload = useCallback(async () => {
    if (!filePath) return;

    try {
      const registry = MonacoModelRegistry.getInstance();
      await registry.reloadModel(createModelKey(filePath));
    } catch (error) {
      console.error("Failed to reload file:", error);
    }
  }, [filePath]);

  /**
   * Handle keep changes - user acknowledges external changes but wants to keep editing.
   * Clears the hasExternalChanges flag so the warning disappears.
   */
  const handleKeepChanges = useCallback(() => {
    if (!filePath) return;

    const registry = MonacoModelRegistry.getInstance();
    registry.clearExternalChanges(createModelKey(filePath));
  }, [filePath]);

  // Changes review mode - render full-height pane with its own toolbar
  // This is checked first because review mode doesn't require a selected file
  if (viewMode.type === "changesReview") {
    return (
      <div
        className="flex flex-col h-full w-full bg-background"
        data-testid="editor-pane"
      >
        <ReviewWorkingPane
          cwd={cwd}
          git={git}
          baseBranch={baseBranch}
          onExitReview={onExitReview}
          selectedFilePath={displayFilePath || undefined}
          selectedMapKey={selectedMapKey}
          unseenTracking={unseenTracking}
          isFileDirty={isFileDirty}
        />
      </div>
    );
  }

  // Commit file diff mode - read-only historical diff view
  // Shows diff between parent commit and the commit using FileEditor in standalone mode
  if (viewMode.type === "commitFileDiff") {
    const {
      filePath: commitFilePath,
      commitId,
      parentCommitId,
      fileStatus,
      originalPath,
    } = viewMode;

    const commitDisplayPath = toDisplayPath(commitFilePath, cwd);

    return (
      <div
        className="flex flex-col h-full w-full bg-background"
        data-testid="editor-pane"
      >
        <FileEditor
          layout="standalone"
          context="commit"
          filePath={commitDisplayPath}
          cwd={cwd}
          commitFile={{
            path: commitDisplayPath,
            status: fileStatus,
            originalPath: originalPath,
            additions: 0,
            deletions: 0,
            isBinary: false,
          }}
          commitId={commitId}
          parentCommitId={parentCommitId}
          onBack={onExitCommitMode}
          theme={theme}
        />
      </div>
    );
  }

  // Commit review mode - read-only view of all changes in a commit
  // This shows the full commit with all file diffs in a scrollable list
  // Uses ReviewCommitPane for consistent UI. Keyed by commit, since a cached
  // commit loads without an intervening loading state.
  if (viewMode.type === "commitReview") {
    const { commitId, parentCommitId } = viewMode;

    return (
      <div
        className="flex flex-col h-full w-full bg-background"
        data-testid="editor-pane"
      >
        <ReviewCommitPane
          key={commitId}
          cwd={cwd}
          commitId={commitId}
          parentCommitId={parentCommitId}
          files={historicalFiles}
          commitMetadata={commitMetadata}
          isLoading={isCommitLoading}
          error={commitError}
          onClose={onExitCommitMode}
        />
      </div>
    );
  }

  // Empty state - no file selected
  if (!selectedFile || !filePath) {
    return (
      <div
        className="flex h-full w-full items-center justify-center bg-background text-muted-foreground"
        data-testid="editor-empty-state"
      >
        Select a file to edit
      </div>
    );
  }

  // Show warning when there's a conflict (external changes while dirty) or file was deleted externally
  // The warning hides automatically when the user takes action (reload, save, keep changes)
  // Don't show when isFileDeleted is true - that's a git-deleted file, which shows DeletedFileBanner instead
  const shouldShowWarning =
    !isFileDeleted &&
    modelState &&
    (modelState.isOrphaned || modelState.hasExternalChanges);

  // Build effective model state for toolbar
  const effectiveModelState: ModelState = modelState ?? {
    isDirty: false,
    isOrphaned: false,
    hasExternalChanges: false,
  };

  return (
    <div
      className="flex flex-col h-full w-full bg-background"
      data-testid="editor-pane"
    >
      {/* Toolbar */}
      <EditorToolbar
        modelState={effectiveModelState}
        onSave={editorActions.save}
        onUndo={editorActions.undo}
        onRedo={editorActions.redo}
        onFind={editorActions.find}
        canUndo={editorActions.canUndo}
        canRedo={editorActions.canRedo}
        filePath={filePath}
        displayPath={displayFilePath}
        showBackButton={showBackButton}
        onBack={onBack}
        showExpandTreeButton={showExpandTreeButton}
        onExpandTree={onExpandTree}
        showDiffToggle={showDiffToggle}
        isDiffMode={isDiffMode}
        onToggleDiffMode={onToggleDiffMode}
        showPreviewToggle={showPreviewToggle}
        isPreviewMode={isPreviewMode}
        onTogglePreviewMode={onTogglePreviewMode}
        readOnly={modifiedSource !== "workingDirectory"}
        gitStatus={selectedGitStatus}
        commitShortId={changesViewLabel}
        onClose={onClose}
      />

      {/* External change warning */}
      {shouldShowWarning && modelState && (
        <ExternalChangeWarning
          filePath={filePath}
          isOrphaned={modelState.isOrphaned}
          hasExternalChanges={modelState.hasExternalChanges}
          isDirty={modelState.isDirty}
          onReload={handleReload}
          onKeepChanges={handleKeepChanges}
          onSave={handleSave}
        />
      )}

      {/* Deleted file banner - shows when viewing a deleted file in changes mode */}
      {isFileDeleted && <DeletedFileBanner />}

      {/* Editor content - uses conditional rendering to switch between modes.
       * When transitioning between editor and diff modes, we show a brief loading
       * state to ensure the container has proper dimensions before the new editor
       * mounts. This prevents the 5px sizing issue with Monaco.
       */}
      <div className="flex-1 min-h-0 relative">
        {isTransitioning ? (
          // Loading state during mode transitions
          <div
            className="absolute inset-0 flex items-center justify-center bg-background text-muted-foreground"
            data-testid="editor-transition-loading"
          >
            Loading...
          </div>
        ) : isFileDeleted ? (
          // Deleted file viewer - shows read-only content from git
          <EditorErrorBoundary filePath={filePath}>
            <RegularEditorWrapper
              editorId={`${editorId}-deleted`}
              cwd={cwd}
              filePath={filePath}
              source={originalSource}
              theme={theme}
              onMount={handleEditorMount}
            />
          </EditorErrorBoundary>
        ) : viewMode.type === "preview" ? (
          // Preview - shows rendered markdown or image
          isImageFile(filePath) ? (
            <ImagePreview filePath={filePath} cwd={cwd} />
          ) : (
            <LazyMarkdownPreview content={previewContent} />
          )
        ) : viewMode.type === "editor" ? (
          // Regular editor - conditionally rendered
          // For staged files, show index content (read-only)
          // For unstaged/normal files, show working directory (editable)
          <EditorErrorBoundary filePath={filePath}>
            <RegularEditorWrapper
              editorId={editorId}
              cwd={cwd}
              filePath={filePath}
              source={modifiedSource}
              theme={theme}
              onMount={handleEditorMount}
            />
          </EditorErrorBoundary>
        ) : viewMode.type === "diff" ? (
          // Diff editor - conditionally rendered
          <EditorErrorBoundary filePath={filePath}>
            <DiffEditorWrapper
              editorId={`${editorId}-diff`}
              cwd={cwd}
              filePath={filePath}
              originalSource={originalSource}
              modifiedSource={modifiedSource}
              theme={theme}
              onMount={handleDiffEditorMount}
            />
          </EditorErrorBoundary>
        ) : null}
      </div>
    </div>
  );
});
