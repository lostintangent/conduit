/**
 * EditorViewPanel - Main editor panel that orchestrates editor components.
 *
 * This is the top-level component for the editor view. It coordinates:
 * - MonacoEditorWrapper (for regular editing)
 * - DiffEditorWrapper (for diff view)
 * - ExternalChangeWarning (for conflict detection)
 * - EditorToolbar (for editor actions)
 *
 * IMPORTANT: Both MonacoEditorWrapper and DiffEditorWrapper are kept mounted
 * at all times to prevent Monaco editor issues with mount/unmount cycles.
 * Visibility is controlled via CSS (visibility:hidden) and model detachment
 * rather than conditional rendering, following Monaco's official recommendations.
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

import { useCallback, useRef, useMemo, useEffect, useState } from "react";
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
// Constants
// ============================================================================

/**
 * Delay in ms when transitioning between editor and diff modes.
 * This gives the new editor time to load its model before becoming visible,
 * preventing a flash of stale content from the previous file.
 */
const MODE_TRANSITION_DELAY_MS = 50;

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
  const modelState = useModelState(filePath);

  // ---------------------------------------------------------------------------
  // Mode Transition Handling
  // ---------------------------------------------------------------------------

  // Track if we're in a transition between editor types (editor <-> diff)
  // During transition, both editors are hidden to prevent flash of stale content
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Track the previous viewMode type to detect mode transitions
  const previousModeTypeRef = useRef<string>(viewMode.type);

  // Effect to handle transitions between editor and diff modes
  // When switching between mode types (not within the same type), we:
  // 1. Hide both editors immediately (isTransitioning = true)
  // 2. Wait for a brief delay + double RAF to let the new model load
  // 3. Show the new editor (isTransitioning = false)
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

    // Start transition - hide both editors
    setIsTransitioning(true);

    // After delay + double RAF, end transition and show new editor
    const timeoutId = setTimeout(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setIsTransitioning(false);
        });
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
      await registry.saveModel(pathToUri(filePath));
      onSave?.();
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  }, [filePath, onSave]);

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

      {/* Editor content
       * IMPORTANT: Both MonacoEditorWrapper and DiffEditorWrapper are kept mounted
       * at all times. We use CSS visibility toggling instead of conditional rendering
       * to avoid Monaco editor issues with mount/unmount cycles.
       *
       * The `isActive` prop tells each wrapper whether it's the current view:
       * - When active: editor attaches model, responds to interactions
       * - When inactive: editor detaches model (setModel(null)) to prevent issues
       *
       * When transitioning between editor and diff modes (isTransitioning=true),
       * both editors are hidden to prevent flash of stale content from the
       * previously active editor's old file.
       *
       * This follows Monaco's official recommendation for handling hidden editors.
       */}
      <div className="flex-1 min-h-0 relative">
        {/* Regular editor - always mounted, visibility controlled by isActive and isTransitioning */}
        <div
          className="absolute inset-0"
          style={{
            // Hide during transition OR when not the active mode
            visibility:
              viewMode.type === "editor" && !isTransitioning
                ? "visible"
                : "hidden",
            pointerEvents:
              viewMode.type === "editor" && !isTransitioning ? "auto" : "none",
            // Use z-index to ensure the active view is on top
            zIndex: viewMode.type === "editor" ? 1 : 0,
          }}
        >
          <EditorErrorBoundary filePath={filePath}>
            <MonacoEditorWrapper
              editorId={editorId}
              cwd={cwd}
              filePath={filePath}
              theme={theme}
              onMount={handleEditorMount}
              isActive={viewMode.type === "editor"}
            />
          </EditorErrorBoundary>
        </div>

        {/* Diff editor - always mounted, visibility controlled by isActive and isTransitioning */}
        <div
          className="absolute inset-0"
          style={{
            // Hide during transition OR when not the active mode
            visibility:
              viewMode.type === "diff" && !isTransitioning
                ? "visible"
                : "hidden",
            pointerEvents:
              viewMode.type === "diff" && !isTransitioning ? "auto" : "none",
            zIndex: viewMode.type === "diff" ? 1 : 0,
          }}
        >
          <EditorErrorBoundary filePath={filePath}>
            <DiffEditorWrapper
              editorId={`${editorId}-diff`}
              cwd={cwd}
              filePath={filePath}
              baseBranch={baseBranch}
              theme={theme}
              onMount={handleDiffEditorMount}
              isActive={viewMode.type === "diff"}
            />
          </EditorErrorBoundary>
        </div>

        {/* Changes review - conditionally rendered (not a Monaco editor) */}
        {viewMode.type === "changesReview" && (
          <ChangesReviewPane cwd={cwd} baseBranch={baseBranch} />
        )}
      </div>
    </div>
  );
}
