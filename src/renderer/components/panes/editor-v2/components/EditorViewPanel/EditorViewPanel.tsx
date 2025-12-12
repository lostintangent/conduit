/**
 * EditorViewPanel - Main editor panel that orchestrates editor components.
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
 * <EditorViewPanel
 *   editorId="main-editor"
 *   cwd="/project"
 *   selectedFile={{ path: "/project/src/index.ts", name: "index.ts", type: "file" }}
 *   viewMode={{ type: 'editor' }}
 *   theme="dark"
 * />
 * ```
 */

import * as monaco from "monaco-editor";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorActions, useModelState } from "../../hooks";
import { MonacoModelRegistry, createModelKey } from "../../registry";
import type { FileNode, ModelState, ViewMode } from "../../types";
import { ChangesReviewPane } from "../ChangesReviewPane";
import { EditorErrorBoundary } from "../EditorErrorBoundary";
import { EditorToolbar } from "../Toolbar/EditorToolbar";
import { DiffEditorWrapper } from "./DiffEditorWrapper";
import { ExternalChangeWarning } from "./ExternalChangeWarning";
import { RegularEditorWrapper } from "./RegularEditorWrapper";

/**
 * Brief delay when transitioning between editor and diff modes.
 * This ensures the container has proper dimensions before the new editor mounts,
 * preventing the 5px sizing issue that occurs when Monaco mounts in a
 * zero-size or incorrectly-sized container.
 */
const MODE_TRANSITION_DELAY_MS = 50;

export interface EditorViewPanelProps {
  /** Unique ID for the editor instance */
  editorId: string;

  /** Working directory for file operations */
  cwd: string;

  /** Optional sandbox ID for cloud VM operations */
  sandboxId?: string;

  /** Currently selected file (null for empty state) */
  selectedFile: FileNode | null;

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
}

/**
 * Main editor panel component.
 *
 * Orchestrates the editor view based on the current mode:
 * - `editor`: Shows RegularEditorWrapper
 * - `diff`: Shows DiffEditorWrapper
 * - `changesReview`: Shows multi-file diff view (TODO: Phase 4+)
 */
export function EditorViewPanel({
  editorId,
  cwd,
  sandboxId,
  selectedFile,
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
}: EditorViewPanelProps) {
  // Editor ref for actions
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  // Ref to store the Monaco keybinding disposable for cleanup
  const saveKeybindingDisposableRef = useRef<monaco.IDisposable | null>(null);

  // Ref to always access the latest handleSave (avoids stale closure in Monaco keybinding)
  const handleSaveRef = useRef<() => void>(() => {});

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
  const modelState = useModelState(filePath, sandboxId);

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
      await registry.saveModel(createModelKey(filePath, sandboxId));
      onSave?.();
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  }, [filePath, sandboxId, onSave]);

  // Keep ref updated so Monaco keybinding always calls the latest handleSave
  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

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
   * Handle editor mount - store ref for actions hook and add Cmd+S keybinding.
   */
  const handleEditorMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      editorRef.current = editor;

      // Clean up any existing keybinding
      if (saveKeybindingDisposableRef.current) {
        saveKeybindingDisposableRef.current.dispose();
        saveKeybindingDisposableRef.current = null;
      }

      // Add Monaco action for Cmd+S to trigger save
      // This ensures Cmd+S works even when the editor has focus
      // We use handleSaveRef to always get the latest handleSave (avoids stale closure)
      // Using addAction instead of addCommand because addAction returns an IDisposable
      const actionDisposable = editor.addAction({
        id: "conduit.save",
        label: "Save",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => {
          handleSaveRef.current();
        },
      });

      // Store disposable for cleanup
      saveKeybindingDisposableRef.current = actionDisposable;
    },
    [],
  );

  /**
   * Handle diff editor mount - store ref and add Cmd+S keybinding to modified editor.
   */
  const handleDiffEditorMount = useCallback(
    (diffEditor: monaco.editor.IStandaloneDiffEditor) => {
      // For diff editor, we need to get the modified (right side) editor
      const modifiedEditor = diffEditor.getModifiedEditor();
      editorRef.current = modifiedEditor;

      // Clean up any existing keybinding
      if (saveKeybindingDisposableRef.current) {
        saveKeybindingDisposableRef.current.dispose();
        saveKeybindingDisposableRef.current = null;
      }

      // Add Monaco action for Cmd+S to trigger save
      // We use handleSaveRef to always get the latest handleSave (avoids stale closure)
      // Using addAction instead of addCommand because addAction returns an IDisposable
      const actionDisposable = modifiedEditor.addAction({
        id: "conduit.save",
        label: "Save",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => {
          handleSaveRef.current();
        },
      });

      // Store disposable for cleanup
      saveKeybindingDisposableRef.current = actionDisposable;
    },
    [],
  );

  /**
   * Cleanup keybinding on unmount.
   */
  useEffect(() => {
    return () => {
      if (saveKeybindingDisposableRef.current) {
        saveKeybindingDisposableRef.current.dispose();
        saveKeybindingDisposableRef.current = null;
      }
    };
  }, []);

  /**
   * Handle reload from disk.
   * Discards local changes and loads current disk content.
   */
  const handleReload = useCallback(async () => {
    if (!filePath) return;

    try {
      const registry = MonacoModelRegistry.getInstance();
      await registry.reloadModel(createModelKey(filePath, sandboxId));
    } catch (error) {
      console.error("Failed to reload file:", error);
    }
  }, [filePath, sandboxId]);

  /**
   * Handle keep changes - user acknowledges external changes but wants to keep editing.
   * Clears the hasExternalChanges flag so the warning disappears.
   */
  const handleKeepChanges = useCallback(() => {
    if (!filePath) return;

    const registry = MonacoModelRegistry.getInstance();
    registry.clearExternalChanges(createModelKey(filePath, sandboxId));
  }, [filePath, sandboxId]);

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
        ) : viewMode.type === "editor" ? (
          // Regular editor - conditionally rendered
          <EditorErrorBoundary filePath={filePath}>
            <RegularEditorWrapper
              editorId={editorId}
              cwd={cwd}
              sandboxId={sandboxId}
              filePath={filePath}
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
              sandboxId={sandboxId}
              filePath={filePath}
              baseBranch={baseBranch}
              theme={theme}
              onMount={handleDiffEditorMount}
            />
          </EditorErrorBoundary>
        ) : viewMode.type === "changesReview" ? (
          // Changes review pane
          <ChangesReviewPane
            cwd={cwd}
            sandboxId={sandboxId}
            baseBranch={baseBranch}
          />
        ) : null}
      </div>
    </div>
  );
}
