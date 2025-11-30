/**
 * EditorViewPanel - Main editor panel that orchestrates editor components.
 *
 * This is the top-level component for the editor view. It coordinates:
 * - MonacoEditorWrapper (for regular editing)
 * - DiffEditorWrapper (for diff view)
 * - ExternalChangeWarning (for conflict detection)
 * - EditorToolbar (for actions and mode switching)
 *
 * Uses useEditorActions hook for toolbar action wiring and state management.
 *
 * @example
 * ```tsx
 * <EditorViewPanel
 *   editorId="main-editor"
 *   cwd="/project"
 *   selectedFile={{ path: "/project/src/index.ts", name: "index.ts", type: "file" }}
 *   viewMode={{ type: 'editor' }}
 *   onViewModeChange={(mode) => setViewMode(mode)}
 *   theme="dark"
 * />
 * ```
 */

import { useCallback, useState, useRef } from "react";
import * as monaco from "monaco-editor";
import type { ViewMode, FileNode, ModelState } from "../../types";
import { useModelState, useEditorActions } from "../../hooks";
import { MonacoModelRegistry, pathToUri } from "../../registry";
import { MonacoEditorWrapper } from "./MonacoEditorWrapper";
import { DiffEditorWrapper } from "./DiffEditorWrapper";
import { ExternalChangeWarning } from "./ExternalChangeWarning";
import { EditorToolbar } from "../Toolbar/EditorToolbar";
import { EditorErrorBoundary } from "../EditorErrorBoundary";

// ============================================================================
// Types
// ============================================================================

export interface EditorViewPanelProps {
  /** Unique ID for the editor instance */
  editorId: string;

  /** Working directory for file operations */
  cwd: string;

  /** Currently selected file (null for empty state) */
  selectedFile: FileNode | null;

  /** Current view mode (editor, diff, changesReview) */
  viewMode: ViewMode;

  /** Handler for view mode changes */
  onViewModeChange: (mode: ViewMode) => void;

  /** Git ref for diff comparisons (default: 'HEAD') */
  baseBranch?: string;

  /** Monaco theme name */
  theme?: string;

  /** Callback when file is saved */
  onSave?: () => void;
}

// ============================================================================
// Component
// ============================================================================

/**
 * Main editor panel component.
 *
 * Orchestrates the editor view based on the current mode:
 * - `editor`: Shows MonacoEditorWrapper
 * - `diff`: Shows DiffEditorWrapper
 * - `changesReview`: Shows multi-file diff view (TODO: Phase 4+)
 */
export function EditorViewPanel({
  editorId,
  cwd,
  selectedFile,
  viewMode,
  onViewModeChange,
  baseBranch = "HEAD",
  theme = "vs-dark",
  onSave,
}: EditorViewPanelProps) {
  // Track if warning was dismissed
  const [warningDismissed, setWarningDismissed] = useState(false);

  // Editor ref for actions
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  // Get file path from selected file
  const filePath = selectedFile?.path ?? null;

  // Get model state for the current file
  const modelState = useModelState(filePath);

  // Reset warning dismissed state when file changes
  const previousFilePathRef = useRef<string | null>(null);
  if (previousFilePathRef.current !== filePath) {
    previousFilePathRef.current = filePath;
    setWarningDismissed(false);
  }

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
      await registry.saveModel(pathToUri(filePath));
      onSave?.();
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  }, [filePath, onSave]);

  // ---------------------------------------------------------------------------
  // Editor Actions Hook
  // ---------------------------------------------------------------------------

  /**
   * Get editor actions from hook - provides undo/redo/find and state tracking.
   * The hook properly manages subscriptions to model changes for canUndo/canRedo.
   */
  const editorActions = useEditorActions(editorRef, modelState, handleSave);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle editor mount - store ref for actions hook.
   */
  const handleEditorMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      editorRef.current = editor;
    },
    [],
  );

  /**
   * Handle reload from disk.
   */
  const handleReload = useCallback(async () => {
    if (!filePath) return;

    try {
      const registry = MonacoModelRegistry.getInstance();
      await registry.reloadModel(pathToUri(filePath));
      setWarningDismissed(true);
    } catch (error) {
      console.error("Failed to reload file:", error);
    }
  }, [filePath]);

  /**
   * Handle keep changes (dismiss warning).
   */
  const handleKeepChanges = useCallback(() => {
    setWarningDismissed(true);
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  // Empty state - no file selected
  if (!selectedFile || !filePath) {
    return (
      <div
        className="flex h-full w-full items-center justify-center text-muted-foreground"
        data-testid="editor-empty-state"
      >
        Select a file to edit
      </div>
    );
  }

  // Determine if we should show the warning
  const shouldShowWarning =
    !warningDismissed &&
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
      className="flex flex-col h-full w-full"
      data-testid="editor-view-panel"
    >
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

      {/* Toolbar */}
      <EditorToolbar
        viewMode={viewMode}
        modelState={effectiveModelState}
        onViewModeChange={onViewModeChange}
        onSave={editorActions.save}
        onUndo={editorActions.undo}
        onRedo={editorActions.redo}
        onFind={editorActions.find}
        canUndo={editorActions.canUndo}
        canRedo={editorActions.canRedo}
        filePath={filePath}
      />

      {/* Editor content */}
      <div className="flex-1 min-h-0">
        {viewMode.type === "editor" && (
          <EditorErrorBoundary filePath={filePath}>
            <MonacoEditorWrapper
              editorId={editorId}
              cwd={cwd}
              filePath={filePath}
              theme={theme}
              onMount={handleEditorMount}
            />
          </EditorErrorBoundary>
        )}

        {viewMode.type === "diff" && (
          <EditorErrorBoundary filePath={filePath}>
            <DiffEditorWrapper
              editorId={`${editorId}-diff`}
              cwd={cwd}
              filePath={filePath}
              baseBranch={baseBranch}
              theme={theme}
            />
          </EditorErrorBoundary>
        )}

        {viewMode.type === "changesReview" && (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            Changes review mode (coming in Phase 4+)
          </div>
        )}
      </div>
    </div>
  );
}
