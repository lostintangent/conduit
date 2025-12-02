/**
 * MonacoEditorWrapper - Wrapper for Monaco standalone editor.
 *
 * This component wraps a Monaco editor instance and integrates with the
 * global registries (EditorRegistry, MonacoModelRegistry, ViewStateRegistry).
 *
 * Key responsibilities:
 * - Gets/creates editor from EditorRegistry (portal pattern for reuse)
 * - Gets model from MonacoModelRegistry via useMonacoModel hook
 * - Saves/restores ViewState via ViewStateRegistry
 * - Handles automatic layout on container resize
 * - Configures editor options (theme, minimap, etc.)
 *
 * @example
 * ```tsx
 * <MonacoEditorWrapper
 *   editorId="main-editor"
 *   filePath="/path/to/file.ts"
 *   cwd="/project"
 *   theme="dark"
 * />
 * ```
 */

import { useEffect, useRef, useCallback } from "react";
import * as monaco from "monaco-editor";
import { useMonacoModel } from "../../hooks";
import { EditorRegistry, ViewStateRegistry } from "../../registry";

// ============================================================================
// Constants
// ============================================================================

/** Debounce delay for ViewState saves (ms) */
const VIEWSTATE_SAVE_DEBOUNCE_MS = 300;

// ============================================================================
// Types
// ============================================================================

export interface MonacoEditorWrapperProps {
  /** Unique ID for this editor instance */
  editorId: string;

  /** Working directory for file operations */
  cwd: string;

  /** Absolute path to the file to edit */
  filePath: string;

  /** Monaco theme name */
  theme?: string;

  /** Whether the editor should be read-only */
  readOnly?: boolean;

  /** Callback when editor content changes */
  onChange?: (value: string) => void;

  /** Callback when editor is mounted/ready */
  onMount?: (editor: monaco.editor.IStandaloneCodeEditor) => void;

  /**
   * External visibility notification (optional alternative approach).
   * When provided, the wrapper will trigger layout when visibility changes.
   * Increment this value to notify that the editor has become visible.
   *
   * Note: The global container pattern uses EditorPaneRegistry.notifyVisible()
   * instead, which is the recommended approach. This prop is available for
   * alternative implementations or testing.
   */
  visibilityKey?: number;
}

// ============================================================================
// Default Editor Options
// ============================================================================

/**
 * Default Monaco editor options optimized for the application.
 *
 * These match the v1 editor configuration for consistency.
 */
const DEFAULT_EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions =
  {
    minimap: { enabled: false },
    smoothScrolling: true,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    fontSize: 13,
    wordWrap: "on",
    // Disable language features that cause issues with file:// URIs
    occurrencesHighlight: "off",
    selectionHighlight: false,
    hover: { enabled: false },
    parameterHints: { enabled: false },
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
  };

// ============================================================================
// Component
// ============================================================================

/**
 * Monaco editor wrapper with registry integration.
 *
 * Manages the lifecycle of a Monaco editor instance, including:
 * - Editor reuse via EditorRegistry (portal pattern)
 * - Model management via MonacoModelRegistry
 * - ViewState persistence via ViewStateRegistry
 */
export function MonacoEditorWrapper({
  editorId,
  cwd,
  filePath,
  theme = "vs-dark",
  readOnly = false,
  onChange,
  onMount,
  visibilityKey,
}: MonacoEditorWrapperProps) {
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const previousFilePathRef = useRef<string | null>(null);
  const contentChangeDisposableRef = useRef<monaco.IDisposable | null>(null);
  const saveViewStateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // Callback refs - keeps callbacks stable to avoid unnecessary effect re-runs
  const onMountRef = useRef(onMount);
  const onChangeRef = useRef(onChange);

  // Sync callback refs with latest values
  useEffect(() => {
    onMountRef.current = onMount;
  }, [onMount]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Get model from registry via hook
  // IMPORTANT: Pass editorId to ensure MonacoModelRegistry uses the same ID
  // as EditorRegistry for proper lifecycle coordination
  const model = useMonacoModel(editorId, filePath, cwd);

  // ---------------------------------------------------------------------------
  // ViewState Save Helper
  // ---------------------------------------------------------------------------

  /**
   * Save ViewState with optional debouncing.
   * Immediate save clears any pending debounced save.
   *
   * To avoid stale closure issues:
   * - Reads filePath from ref at execution time (not capture time)
   * - Verifies filePath hasn't changed when debounced save fires
   */
  const saveViewState = useCallback(
    (immediate = false) => {
      const editor = editorRef.current;

      if (!editor) return;

      // Clear any pending debounced save
      if (saveViewStateDebounceRef.current) {
        clearTimeout(saveViewStateDebounceRef.current);
        saveViewStateDebounceRef.current = null;
      }

      // Capture the file path at the time of the call for comparison
      const filePathAtCallTime = previousFilePathRef.current;
      if (!filePathAtCallTime) return;

      const doSave = () => {
        // Re-read the current file path at execution time
        const currentFilePath = previousFilePathRef.current;

        // Verify file hasn't changed since the save was scheduled
        // This prevents saving ViewState for the wrong file after rapid switches
        if (currentFilePath !== filePathAtCallTime) {
          return;
        }

        const viewStateRegistry = ViewStateRegistry.getInstance();
        viewStateRegistry.save(editorId, currentFilePath, editor);
      };

      if (immediate) {
        doSave();
      } else {
        saveViewStateDebounceRef.current = setTimeout(
          doSave,
          VIEWSTATE_SAVE_DEBOUNCE_MS,
        );
      }
    },
    [editorId],
  );

  // ---------------------------------------------------------------------------
  // Editor Setup
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const editorRegistry = EditorRegistry.getInstance();
    const viewStateRegistry = ViewStateRegistry.getInstance();

    // Get or create editor
    const editor = editorRegistry.getOrCreateEditor(editorId, container, {
      ...DEFAULT_EDITOR_OPTIONS,
      theme,
      readOnly,
    });

    editorRef.current = editor;

    // Call onMount callback via ref to avoid dependency
    onMountRef.current?.(editor);

    // Cleanup on unmount
    return () => {
      // Clear any pending debounced save
      if (saveViewStateDebounceRef.current) {
        clearTimeout(saveViewStateDebounceRef.current);
        saveViewStateDebounceRef.current = null;
      }

      // Save ViewState immediately before releasing
      if (editorRef.current && previousFilePathRef.current) {
        viewStateRegistry.save(editorId, previousFilePathRef.current, editor);
      }

      // Dispose content change listener
      if (contentChangeDisposableRef.current) {
        contentChangeDisposableRef.current.dispose();
        contentChangeDisposableRef.current = null;
      }

      // Release editor (doesn't dispose, just marks as unused)
      editorRegistry.releaseEditor(editorId);
      editorRef.current = null;
    };
    // Note: onMount handled via ref to avoid editor recreation when callback changes
  }, [editorId, theme, readOnly]);

  // ---------------------------------------------------------------------------
  // Model Attachment
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !model) return;

    const viewStateRegistry = ViewStateRegistry.getInstance();

    // Save ViewState for previous file before switching
    if (
      previousFilePathRef.current &&
      previousFilePathRef.current !== filePath
    ) {
      viewStateRegistry.save(editorId, previousFilePathRef.current, editor);
    }

    // Attach model to editor
    editor.setModel(model);

    // Restore ViewState for new file
    viewStateRegistry.restore(editorId, filePath, editor);

    // Update previous file path
    previousFilePathRef.current = filePath;

    // Set up content change listener for onChange callback
    if (contentChangeDisposableRef.current) {
      contentChangeDisposableRef.current.dispose();
    }

    // Use ref to always call latest onChange without effect dependency
    contentChangeDisposableRef.current = model.onDidChangeContent(() => {
      onChangeRef.current?.(model.getValue());
    });

    return () => {
      // Cleanup content change listener
      if (contentChangeDisposableRef.current) {
        contentChangeDisposableRef.current.dispose();
        contentChangeDisposableRef.current = null;
      }
    };
    // Note: onChange handled via ref to avoid listener re-setup when callback changes
  }, [editorId, filePath, model]);

  // ---------------------------------------------------------------------------
  // Editor Options Update
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Update theme globally (Monaco themes are global)
    monaco.editor.setTheme(theme);

    // Update editor-specific options
    editor.updateOptions({
      readOnly,
    });
  }, [theme, readOnly]);

  // ---------------------------------------------------------------------------
  // ViewState Save on Blur
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    // Save ViewState when editor loses focus (debounced)
    const blurDisposable = editor.onDidBlurEditorText(() => {
      saveViewState(false); // debounced
    });

    return () => {
      blurDisposable.dispose();
    };
  }, [saveViewState]);

  // ---------------------------------------------------------------------------
  // ViewState Save on Visibility Change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Save ViewState when page becomes hidden (tab switch, minimize, etc.)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        saveViewState(true); // immediate - we might not get another chance
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [saveViewState]);

  // ---------------------------------------------------------------------------
  // ViewState Save on Page Unload
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Save ViewState before page closes
    const handleBeforeUnload = () => {
      // Immediate save - no time for debouncing
      const editor = editorRef.current;
      const currentFilePath = previousFilePathRef.current;

      if (editor && currentFilePath) {
        const viewStateRegistry = ViewStateRegistry.getInstance();
        viewStateRegistry.save(editorId, currentFilePath, editor);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [editorId]);

  // ---------------------------------------------------------------------------
  // Visibility Change Handler
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Skip if no visibility key provided or on first render
    if (visibilityKey === undefined) return;

    const editorRegistry = EditorRegistry.getInstance();

    // Trigger layout when visibility key changes (indicates container became visible)
    // Use the registry's triggerLayout for proper debouncing
    editorRegistry.triggerLayout(editorId, false);
  }, [editorId, visibilityKey]);

  // ---------------------------------------------------------------------------
  // Focus Handler
  // ---------------------------------------------------------------------------

  const handleContainerClick = useCallback(() => {
    editorRef.current?.focus();
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      onClick={handleContainerClick}
      data-testid="monaco-editor-wrapper"
    />
  );
}
