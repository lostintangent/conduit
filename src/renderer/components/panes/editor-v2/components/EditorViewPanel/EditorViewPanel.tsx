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

import { useCallback, useRef, useMemo } from "react";
import * as monaco from "monaco-editor";
import type { ViewMode, FileNode, ModelState } from "../../types";
import { useModelState, useEditorActions } from "../../hooks";
import { MonacoModelRegistry, pathToUri } from "../../registry";
import { MonacoEditorWrapper } from "./MonacoEditorWrapper";
import { DiffEditorWrapper } from "./DiffEditorWrapper";
import { ExternalChangeWarning } from "./ExternalChangeWarning";
import { EditorToolbar } from "../Toolbar/EditorToolbar";
import { EditorErrorBoundary } from "../EditorErrorBoundary";
import { ChangesReviewPane } from "../ChangesReviewPane";

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

  /** Whether to show the back button (for single-column layout) */
  showBackButton?: boolean;

  /** Handler for back button click (navigate to tree view) */
  onBack?: () => void;

  /** Whether to show the expand tree button (when tree is collapsed in split mode) */
  showExpandTreeButton?: boolean;

  /** Handler for expand tree button click */
  onExpandTree?: () => void;
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
  showBackButton = false,
  onBack,
  showExpandTreeButton = false,
  onExpandTree,
}: EditorViewPanelProps) {
  // Editor ref for actions
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  // Get file path from selected file
  const filePath = selectedFile?.path ?? null;

  // Calculate display path relative to cwd (like v1)
  const displayFilePath = useMemo(() => {
    if (!filePath) {
      return "";
    }

    const normalizedFilePath = filePath.replace(/\\/g, "/");
    const normalizedCwd = cwd.replace(/\\/g, "/");

    const cwdWithSlash = normalizedCwd.endsWith("/")
      ? normalizedCwd
      : `${normalizedCwd}/`;

    // If file is under cwd, show relative path
    if (normalizedFilePath.startsWith(cwdWithSlash)) {
      return normalizedFilePath.slice(cwdWithSlash.length);
    }

    // Otherwise show full path
    return filePath;
  }, [filePath, cwd]);

  // Get model state for the current file
  const modelState = useModelState(filePath);

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
   * Discards local changes and loads current disk content.
   */
  const handleReload = useCallback(async () => {
    if (!filePath) return;

    try {
      const registry = MonacoModelRegistry.getInstance();
      await registry.reloadModel(pathToUri(filePath));
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
    registry.clearExternalChanges(pathToUri(filePath));
  }, [filePath]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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

  // Show warning when there's a conflict (external changes while dirty) or file was deleted
  // The warning hides automatically when the user takes action (reload, save, keep changes)
  const shouldShowWarning =
    modelState && (modelState.isOrphaned || modelState.hasExternalChanges);

  // Build effective model state for toolbar
  const effectiveModelState: ModelState = modelState ?? {
    isDirty: false,
    isOrphaned: false,
    hasExternalChanges: false,
  };

  return (
    <div
      className="flex flex-col h-full w-full bg-background"
      data-testid="editor-view-panel"
    >
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
        displayPath={displayFilePath}
        showBackButton={showBackButton}
        onBack={onBack}
        showExpandTreeButton={showExpandTreeButton}
        onExpandTree={onExpandTree}
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
          <ChangesReviewPane cwd={cwd} baseBranch={baseBranch} />
        )}
      </div>
    </div>
  );
}
