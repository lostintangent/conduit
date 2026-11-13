/**
 * RegularEditorWrapper - Wrapper for Monaco standalone editor.
 *
 * This component wraps a Monaco editor instance and integrates with the
 * global registries (MonacoModelRegistry, ViewStateRegistry).
 *
 * Key responsibilities:
 * - Creates a fresh Monaco editor on mount (disposed on unmount)
 * - Gets model from MonacoModelRegistry via useMonacoModel hook (for working directory)
 * - Creates standalone model for git sources (HEAD, index, refs)
 * - Saves/restores ViewState via ViewStateRegistry (working directory only)
 * - Handles automatic layout on container resize
 * - Configures editor options (theme, minimap, etc.)
 *
 * The `source` prop controls where content is loaded from:
 * - `'workingDirectory'` (default): Editable file from disk via MonacoModelRegistry
 * - `'head'`, `'index'`, or any git ref: Read-only content from git
 *
 * Note: This creates fresh editors each time to avoid layout issues when
 * switching between editor and diff modes (similar to how
 * @monaco-editor/react works in v1).
 *
 * @example
 * ```tsx
 * // Editable file from working directory
 * <RegularEditorWrapper
 *   editorId="main-editor"
 *   filePath="/path/to/file.ts"
 *   cwd="/project"
 * />
 *
 * // Read-only file from git HEAD
 * <RegularEditorWrapper
 *   editorId="deleted-viewer"
 *   filePath="/path/to/deleted-file.ts"
 *   cwd="/project"
 *   source="head"
 * />
 * ```
 */

import * as monaco from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useAutoSizeEditor,
  useEditorTheme,
  useGitContent,
  useMonacoModel,
  usePreventFocusScroll,
} from "../../hooks";
import { createModelKey, ViewStateRegistry } from "../../registry";
import { type ContentSource, isGitSource } from "../../types";
import { forceTokenizeVisibleLines } from "../../utils";
import { detectLanguage } from "../../utils/languageDetection";
import { ReadOnlyBadge, SourceBadge } from "../shared";

/** Debounce delay for ViewState saves (ms) */
const VIEWSTATE_SAVE_DEBOUNCE_MS = 300;

export interface RegularEditorWrapperProps {
  /** Unique ID for this editor instance */
  editorId: string;

  /** Working directory for file operations */
  cwd: string;

  /** Absolute path to the file to edit */
  filePath: string;

  /** Monaco theme name */
  theme?: string;

  /**
   * Where to load content from. Defaults to 'workingDirectory'.
   *
   * - `'workingDirectory'`: Editable file from disk (uses MonacoModelRegistry)
   * - `'head'`: Read-only content from HEAD commit
   * - `'index'`: Read-only content from git staging area
   * - Any other string: Read-only content from that git ref
   *
   * Git sources are always read-only regardless of the `readOnly` prop.
   */
  source?: ContentSource;

  /**
   * Whether the editor should be read-only.
   * Only applies when source is 'workingDirectory'.
   * Git sources are always read-only.
   */
  readOnly?: boolean;

  /**
   * Callback when editor content changes.
   * Only called when source is 'workingDirectory' and not read-only.
   */
  onChange?: (value: string) => void;

  /** Callback when editor is mounted/ready */
  onMount?: (editor: monaco.editor.IStandaloneCodeEditor) => void;

  /**
   * Maximum height in pixels. When provided, the editor is constrained
   * to this height with internal scrolling. If not provided, the editor
   * fills its container.
   */
  autoSize?: number;

  /**
   * Show a read-only badge overlay when content is read-only.
   * Useful for historical views to indicate content cannot be edited.
   */
  showReadOnlyBadge?: boolean;

  /**
   * Label to show for the content source (e.g., commit short ID).
   * Displayed as a badge when viewing git content.
   */
  sourceLabel?: string;
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
    // Scrollbar options for better scroll behavior in lists
    scrollbar: {
      // Allow scroll events to bubble to parent when editor can't scroll
      alwaysConsumeMouseWheel: false,
    },
    // Disable language features that cause issues with file:// URIs
    occurrencesHighlight: "off",
    selectionHighlight: false,
    hover: { enabled: "off" },
    parameterHints: { enabled: false },
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    unicodeHighlight: { ambiguousCharacters: false },
  };

/**
 * Monaco editor wrapper with registry integration.
 *
 * Manages the lifecycle of a Monaco editor instance, including:
 * - Model management via MonacoModelRegistry (working directory)
 * - Standalone model management (git sources)
 * - ViewState persistence via ViewStateRegistry (working directory only)
 */
export function RegularEditorWrapper({
  editorId,
  cwd,
  filePath,
  theme: themeProp,
  source = "workingDirectory",
  readOnly = false,
  onChange,
  onMount,
  autoSize,
  showReadOnlyBadge = false,
  sourceLabel,
}: RegularEditorWrapperProps) {
  // Determine if we're loading from git or working directory
  const isGitSourceMode = isGitSource(source);

  // Git sources are always read-only; working directory respects the prop
  const effectiveReadOnly = isGitSourceMode || readOnly;

  // Use provided theme or fall back to user's preferred theme
  const defaultTheme = useEditorTheme();
  const theme = themeProp ?? defaultTheme;

  // Language detection for git sources (working directory uses model's language)
  const language = isGitSourceMode ? detectLanguage(filePath) : undefined;

  // Version counter to trigger re-render when editor is created
  // This ensures useAutoSizeEditor sees the editor instance after creation
  const [, setEditorVersion] = useState(0);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const previousFilePathRef = useRef<string | null>(null);
  const contentChangeDisposableRef = useRef<monaco.IDisposable | null>(null);
  const saveViewStateDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // Standalone model ref for git sources (needs manual disposal)
  const standaloneModelRef = useRef<monaco.editor.ITextModel | null>(null);

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

  // ---------------------------------------------------------------------------
  // Content Loading
  // ---------------------------------------------------------------------------

  // Get content from git for git sources
  const gitContent = useGitContent(
    isGitSourceMode ? filePath : null,
    source,
    cwd,
  );

  // Get model from registry for working directory source
  // Pass editorId so MonacoModelRegistry can reference-count this editor
  const registryModel = useMonacoModel(
    editorId,
    isGitSourceMode ? null : filePath,
    cwd,
  );

  // Auto-sizing hook - grows height with content up to maxHeight
  const { containerRef: autoSizeRef } = useAutoSizeEditor({
    editor: editorRef.current,
    maxHeight: autoSize,
  });

  // ---------------------------------------------------------------------------
  // ViewState Save Helper
  // ---------------------------------------------------------------------------

  /**
   * Save ViewState with optional debouncing.
   * Immediate save clears any pending debounced save.
   *
   * Only saves for working directory sources - git sources are read-only
   * and don't need ViewState persistence.
   *
   * To avoid stale closure issues:
   * - Reads filePath from ref at execution time (not capture time)
   * - Verifies filePath hasn't changed when debounced save fires
   */
  const saveViewState = useCallback(
    (immediate = false) => {
      // Skip ViewState for git sources - they're read-only and immutable
      if (isGitSourceMode) return;

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
    [editorId, isGitSourceMode],
  );

  // ---------------------------------------------------------------------------
  // Editor Setup
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const viewStateRegistry = ViewStateRegistry.getInstance();

    // Create a fresh Monaco editor (like @monaco-editor/react does in v1).
    const editor = monaco.editor.create(container, {
      ...DEFAULT_EDITOR_OPTIONS,
      theme,
      readOnly: effectiveReadOnly,
    });

    editorRef.current = editor;
    setEditorVersion((v) => v + 1); // Trigger re-render so hook sees the editor

    // Call onMount callback via ref to avoid dependency
    onMountRef.current?.(editor);

    // Cleanup on unmount
    return () => {
      // Clear any pending debounced save
      if (saveViewStateDebounceRef.current) {
        clearTimeout(saveViewStateDebounceRef.current);
        saveViewStateDebounceRef.current = null;
      }

      // Save ViewState immediately before disposing (working directory only)
      if (
        !isGitSourceMode &&
        editorRef.current &&
        previousFilePathRef.current
      ) {
        viewStateRegistry.save(
          editorId,
          previousFilePathRef.current,
          editorRef.current,
        );
      }

      // Dispose content change listener
      if (contentChangeDisposableRef.current) {
        contentChangeDisposableRef.current.dispose();
        contentChangeDisposableRef.current = null;
      }

      // Dispose standalone model for git sources
      if (standaloneModelRef.current) {
        standaloneModelRef.current.dispose();
        standaloneModelRef.current = null;
      }

      // Dispose the editor
      editor.dispose();
      editorRef.current = null;
    };
    // Note: onMount handled via ref to avoid editor recreation when callback changes
  }, [editorId, theme, effectiveReadOnly, isGitSourceMode]);

  // ---------------------------------------------------------------------------
  // Git Source Model Creation
  // ---------------------------------------------------------------------------

  // Create/update standalone model when git content changes
  useEffect(() => {
    if (!isGitSourceMode) return;

    // Wait for content to load
    if (gitContent.isLoading || gitContent.content === null) return;

    // Create a unique URI for this git content to avoid conflicts
    const modelUri = monaco.Uri.parse(
      `git://${source}/${filePath}?t=${Date.now()}`,
    );

    // Dispose previous standalone model if it exists
    if (standaloneModelRef.current) {
      standaloneModelRef.current.dispose();
    }

    // Create new standalone model
    const newModel = monaco.editor.createModel(
      gitContent.content,
      language,
      modelUri,
    );

    standaloneModelRef.current = newModel;

    // Attach to editor if it exists
    const editor = editorRef.current;
    if (editor) {
      editor.setModel(newModel);
      forceTokenizeVisibleLines(newModel);
    }

    // No cleanup here - model disposal handled in Editor Setup cleanup
  }, [
    isGitSourceMode,
    gitContent.content,
    gitContent.isLoading,
    filePath,
    source,
    language,
  ]);

  // ---------------------------------------------------------------------------
  // Working Directory Model Attachment
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Skip for git sources - handled by Git Source Model Creation effect
    if (isGitSourceMode) return;

    const editor = editorRef.current;
    if (!editor || !registryModel) return;

    // IMPORTANT: Verify the model matches the current filePath before attaching.
    // When filePath changes, React may re-run this effect with the OLD model
    // before useMonacoModel updates with the new model. We must skip attaching
    // stale models to avoid ending the session prematurely.
    const modelUri = registryModel.uri.toString();
    const expectedModelKey = createModelKey(filePath);
    const modelMatchesFile =
      modelUri === expectedModelKey || registryModel.uri.fsPath === filePath;

    if (!modelMatchesFile) {
      // Model is for a different file - skip this render cycle
      // The effect will re-run when useMonacoModel provides the correct model
      return;
    }

    const viewStateRegistry = ViewStateRegistry.getInstance();

    // Save ViewState for previous file before switching
    if (
      previousFilePathRef.current &&
      previousFilePathRef.current !== filePath
    ) {
      viewStateRegistry.save(editorId, previousFilePathRef.current, editor);
    }

    // Attach model to editor
    editor.setModel(registryModel);

    // Force immediate tokenization to prevent white flash before syntax highlighting
    forceTokenizeVisibleLines(registryModel);

    // Restore ViewState for new file
    viewStateRegistry.restore(editorId, filePath, editor);

    // Update previous file path
    previousFilePathRef.current = filePath;

    // Set up content change listener for onChange callback
    if (contentChangeDisposableRef.current) {
      contentChangeDisposableRef.current.dispose();
    }

    // Use ref to always call latest onChange without effect dependency
    contentChangeDisposableRef.current = registryModel.onDidChangeContent(
      () => {
        onChangeRef.current?.(registryModel.getValue());
      },
    );

    return () => {
      // Cleanup content change listener
      if (contentChangeDisposableRef.current) {
        contentChangeDisposableRef.current.dispose();
        contentChangeDisposableRef.current = null;
      }
    };
    // Note: onChange handled via ref to avoid listener re-setup when callback changes
  }, [editorId, filePath, registryModel, isGitSourceMode]);

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
      theme,
      readOnly: effectiveReadOnly,
    });
  }, [theme, effectiveReadOnly]);

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
    // Skip ViewState for git sources
    if (isGitSourceMode) return;

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
  }, [editorId, isGitSourceMode]);

  // ---------------------------------------------------------------------------
  // Focus Handler
  // ---------------------------------------------------------------------------

  // Prevent browser's automatic scroll-into-view when clicking the editor
  usePreventFocusScroll(containerRef);

  const handleContainerClick = useCallback((e: React.MouseEvent) => {
    // Don't steal focus from Monaco's overlay widgets (find widget, etc.)
    if ((e.target as HTMLElement).closest(".overlayWidgets")) return;
    editorRef.current?.focus();
  }, []);

  return (
    <div ref={autoSizeRef} className={autoSize ? "" : "h-full w-full"}>
      <div className="relative h-full w-full">
        <div
          ref={containerRef}
          className="h-full w-full"
          onClick={handleContainerClick}
          data-testid="monaco-editor-wrapper"
        />

        {/* Read-only badge (top-right corner) */}
        {showReadOnlyBadge && effectiveReadOnly && (
          <div className="absolute top-2 right-2 z-10">
            <ReadOnlyBadge />
          </div>
        )}

        {/* Source label badge (top-left corner) */}
        {sourceLabel && (
          <div className="absolute top-2 left-2 z-10">
            <SourceBadge label={sourceLabel} />
          </div>
        )}

        {/* Loading state for git sources */}
        {isGitSourceMode && gitContent.isLoading && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-background text-muted-foreground"
            data-testid="git-content-loading"
          >
            Loading...
          </div>
        )}

        {/* Error state for git sources */}
        {isGitSourceMode && gitContent.error && (
          <div
            className="absolute inset-0 flex items-center justify-center bg-background text-destructive"
            data-testid="git-content-error"
          >
            {gitContent.error.message}
          </div>
        )}
      </div>
    </div>
  );
}
