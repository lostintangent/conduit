/**
 * EditorViewPanel - Main editor panel that orchestrates editor components.
 *
 * This is the top-level component for the editor view. It coordinates:
 * - MonacoEditorWrapper (for regular editing)
 * - DiffEditorWrapper (for diff view)
 * - ExternalChangeWarning (for conflict detection)
 * - EditorToolbar (for actions and mode switching)
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
import { useModelState } from "../../hooks";
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
  // Track undo/redo state
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Track if warning was dismissed
  const [warningDismissed, setWarningDismissed] = useState(false);

  // Editor ref for undo/redo operations
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
  // Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handle editor mount to track undo/redo state.
   */
  const handleEditorMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      editorRef.current = editor;

      // Set up undo/redo state tracking
      const model = editor.getModel();
      if (model) {
        const updateUndoRedoState = () => {
          const versionId = model.getAlternativeVersionId();
          // Simple heuristic: can undo if not at initial version
          // In a real implementation, we'd track the initial version ID
          setCanUndo(versionId > 1);
          setCanRedo(false); // Would need more tracking for accurate redo state
        };

        // Initial state
        updateUndoRedoState();

        // Listen for content changes
        const disposable = model.onDidChangeContent(updateUndoRedoState);
        return () => disposable.dispose();
      }
    },
    [],
  );

  /**
   * Handle save action.
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

  /**
   * Handle undo action.
   */
  const handleUndo = useCallback(() => {
    editorRef.current?.trigger("editor", "undo", null);
  }, []);

  /**
   * Handle redo action.
   */
  const handleRedo = useCallback(() => {
    editorRef.current?.trigger("editor", "redo", null);
  }, []);

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
        onSave={handleSave}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={canUndo}
        canRedo={canRedo}
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
