/**
 * DiffEditorWrapper - Wrapper for Monaco diff editor.
 *
 * This component wraps a Monaco diff editor for side-by-side comparison.
 * Unlike the regular editor, diff editors are NOT stored in the registry
 * because they have simpler lifecycle requirements (cheaper to recreate).
 *
 * Key responsibilities:
 * - Creates Monaco diff editor on mount
 * - Uses useDiffContent hook to fetch original (git) and modified content
 * - Original side is read-only (from git)
 * - Modified side uses shared model from MonacoModelRegistry (editable)
 * - Shows loading state while fetching content
 * - Properly disposes on unmount
 *
 * @example
 * ```tsx
 * <DiffEditorWrapper
 *   editorId="diff-editor"
 *   filePath="/path/to/file.ts"
 *   cwd="/project"
 *   baseBranch="main"
 * />
 * ```
 */

import * as monaco from "monaco-editor";
import { useCallback, useEffect, useRef } from "react";
import {
  useAutoSizeEditor,
  useDiffContent,
  useEditorTheme,
  useMonacoModel,
  usePreventFocusScroll,
} from "../../hooks";
import { createModelKey } from "../../registry";
import { ViewStateRegistry } from "../../registry/ViewStateRegistry";
import { detectLanguage, forceTokenizeVisibleLines } from "../../utils";

export interface DiffEditorWrapperProps {
  /** Unique ID for this diff editor instance */
  editorId: string;

  /** Working directory for file and git operations */
  cwd: string;

  /** Absolute path to the file to diff */
  filePath: string;

  /** Git ref for the original content (default: 'HEAD') */
  baseBranch?: string;

  /** Optional sandbox ID for cloud VM operations */
  sandboxId?: string;

  /** Monaco theme name */
  theme?: string;

  /** Whether the modified side should be read-only */
  readOnly?: boolean;

  /** Callback when modified content changes */
  onChange?: (value: string) => void;

  /** Callback when diff editor is mounted/ready */
  onMount?: (editor: monaco.editor.IStandaloneDiffEditor) => void;

  /**
   * Maximum height in pixels. When provided, the editor is constrained
   * to this height with internal scrolling. If not provided, the editor
   * fills its container.
   */
  autoSize?: number;

  /** Whether to collapse unchanged regions in the diff view */
  hideUnchangedRegions?: boolean;
}

// ============================================================================
// Default Diff Editor Options
// ============================================================================

/**
 * Default Monaco diff editor options optimized for the application.
 */
const DEFAULT_DIFF_OPTIONS: monaco.editor.IStandaloneDiffEditorConstructionOptions =
  {
    renderSideBySide: true,
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
    // Disable language features that cause issues
    occurrencesHighlight: "off",
    selectionHighlight: false,
    hover: { enabled: false },
    parameterHints: { enabled: false },
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    unicodeHighlight: { ambiguousCharacters: false },
  };

/**
 * Configuration for hiding unchanged regions in diff view.
 * Shows only changed areas with configurable context lines.
 */
const HIDE_UNCHANGED_REGIONS_CONFIG: monaco.editor.IDiffEditorBaseOptions["hideUnchangedRegions"] =
  {
    enabled: true,
    contextLineCount: 3,
    minimumLineCount: 3,
    revealLineCount: 20,
  };

/**
 * Monaco diff editor wrapper with content loading.
 *
 * Creates a diff editor that compares:
 * - Original: Content from git (HEAD or baseBranch)
 * - Modified: Current working directory content (via MonacoModelRegistry)
 */
export function DiffEditorWrapper({
  editorId,
  cwd,
  filePath,
  baseBranch,
  sandboxId,
  theme: themeProp,
  readOnly = false,
  onChange,
  onMount,
  autoSize,
  hideUnchangedRegions = false,
}: DiffEditorWrapperProps) {
  // Use provided theme or fall back to user's preferred theme
  const defaultTheme = useEditorTheme();
  const theme = themeProp ?? defaultTheme;

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(
    null,
  );
  const originalModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const contentChangeDisposableRef = useRef<monaco.IDisposable | null>(null);
  const currentFilePathRef = useRef<string>(filePath);

  // Callback refs - keeps callbacks stable to avoid unnecessary effect re-runs
  const onMountRef = useRef(onMount);
  const onChangeRef = useRef(onChange);

  // Sync refs with latest values
  useEffect(() => {
    currentFilePathRef.current = filePath;
  }, [filePath]);

  useEffect(() => {
    onMountRef.current = onMount;
  }, [onMount]);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Get diff content (original from git, modified from file system)
  const diffContent = useDiffContent(filePath, baseBranch, cwd, sandboxId);

  // Get the shared model for the modified side
  // Pass editorId to ensure consistent reference counting with other registries
  const modifiedModel = useMonacoModel(editorId, filePath, cwd, sandboxId);

  // Detect language from file path
  const language = detectLanguage(filePath);

  // Auto-sizing hook - grows height with content up to maxHeight
  const { containerRef: autoSizeRef } = useAutoSizeEditor({
    diffEditor: diffEditorRef.current,
    maxHeight: autoSize,
  });

  // ---------------------------------------------------------------------------
  // Diff Editor Setup
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create a fresh diff editor (like v1 does with @monaco-editor/react)
    const diffEditor = monaco.editor.createDiffEditor(container, {
      ...DEFAULT_DIFF_OPTIONS,
      theme,
      readOnly,
      ...(hideUnchangedRegions && {
        hideUnchangedRegions: HIDE_UNCHANGED_REGIONS_CONFIG,
      }),
    });

    diffEditorRef.current = diffEditor;

    // Call onMount callback via ref to avoid dependency
    onMountRef.current?.(diffEditor);

    // Cleanup on unmount
    return () => {
      // Save ViewState before disposing so it can be restored later
      const modifiedEditor = diffEditor.getModifiedEditor();
      if (modifiedEditor && currentFilePathRef.current) {
        ViewStateRegistry.getInstance().save(
          `diff-modified-${editorId}`,
          currentFilePathRef.current,
          modifiedEditor,
        );
      }

      // Dispose content change listener
      if (contentChangeDisposableRef.current) {
        contentChangeDisposableRef.current.dispose();
        contentChangeDisposableRef.current = null;
      }

      // CRITICAL: Reset the diff editor's model to null BEFORE disposing the TextModels.
      // This prevents the "TextModel got disposed before DiffEditorWidget model got reset" error.
      try {
        diffEditor.setModel(null);
      } catch {
        // Ignore if already disposed
      }

      // Now safe to dispose original model (we own it)
      if (originalModelRef.current) {
        originalModelRef.current.dispose();
        originalModelRef.current = null;
      }

      // Dispose diff editor
      diffEditor.dispose();
      diffEditorRef.current = null;
    };
    // Note: onMount handled via ref, filePath via ref for cleanup
  }, [theme, readOnly, editorId, hideUnchangedRegions]);

  // ---------------------------------------------------------------------------
  // Model Setup
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const diffEditor = diffEditorRef.current;
    if (!diffEditor) return;

    // Need both original content and modified model to set up the diff
    if (
      diffContent.isLoading ||
      diffContent.original === null ||
      !modifiedModel
    ) {
      return;
    }

    // IMPORTANT: Verify the modifiedModel matches the current filePath before attaching.
    // When filePath changes, React may re-run this effect with the OLD model
    // before useMonacoModel updates with the new model. We must skip attaching
    // stale models to avoid ending the session prematurely.
    const modelUri = modifiedModel.uri.toString();
    const expectedModelKey = createModelKey(filePath, sandboxId);
    // Handle sandboxId in model key: file:///path::vm:sandboxId
    const modelMatchesFile =
      modelUri === expectedModelKey ||
      modelUri.startsWith(expectedModelKey.split("::")[0] + "::") ||
      modifiedModel.uri.fsPath === filePath;

    if (!modelMatchesFile) {
      // Model is for a different file - skip this render cycle
      // The effect will re-run when useMonacoModel provides the correct model
      return;
    }

    // Wrap in try-catch to prevent any errors from crashing the app
    try {
      // Create original model (read-only, we own this)
      // Dispose previous if exists - must reset diff editor model first
      if (originalModelRef.current) {
        // Reset diff editor model before disposing to prevent race condition
        try {
          diffEditor.setModel(null);
        } catch {
          // Ignore if already disposed
        }
        originalModelRef.current.dispose();
      }

      // Use editorId in URI to ensure uniqueness across multiple diff editors
      // showing the same file (e.g., different panes comparing same file)
      const originalUri = monaco.Uri.parse(
        `inmemory://original/${editorId}/${filePath}`,
      );

      originalModelRef.current = monaco.editor.createModel(
        diffContent.original,
        language,
        originalUri,
      );

      // Set the diff models
      diffEditor.setModel({
        original: originalModelRef.current,
        modified: modifiedModel,
      });

      // Force immediate tokenization to prevent white flash before syntax highlighting
      forceTokenizeVisibleLines(originalModelRef.current);
      forceTokenizeVisibleLines(modifiedModel);
    } catch (error) {
      console.error("Error setting up diff editor models:", error);
      return;
    }

    // Restore ViewState for the modified editor (scroll position, cursor, etc.)
    const modifiedEditor = diffEditor.getModifiedEditor();
    if (modifiedEditor) {
      ViewStateRegistry.getInstance().restore(
        `diff-modified-${editorId}`,
        filePath,
        modifiedEditor,
      );
    }

    // Automatically scroll to the first diff after a short delay
    // to ensure diff computation is complete
    const revealTimeoutId = setTimeout(() => diffEditor.revealFirstDiff(), 100);

    // Set up content change listener for onChange callback
    if (contentChangeDisposableRef.current) {
      contentChangeDisposableRef.current.dispose();
    }

    // Use ref to always call latest onChange without effect dependency
    if (!readOnly) {
      contentChangeDisposableRef.current = modifiedModel.onDidChangeContent(
        () => {
          onChangeRef.current?.(modifiedModel.getValue());
        },
      );
    }

    return () => {
      // Clear the reveal timeout
      clearTimeout(revealTimeoutId);

      // Cleanup content change listener
      if (contentChangeDisposableRef.current) {
        contentChangeDisposableRef.current.dispose();
        contentChangeDisposableRef.current = null;
      }
    };
    // Note: onChange handled via ref to avoid listener re-setup when callback changes
  }, [
    editorId,
    filePath,
    language,
    diffContent.isLoading,
    diffContent.original,
    modifiedModel,
    readOnly,
    sandboxId,
  ]);

  // ---------------------------------------------------------------------------
  // Editor Options Update
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const diffEditor = diffEditorRef.current;
    if (!diffEditor) return;

    // Update theme globally (Monaco themes are global)
    monaco.editor.setTheme(theme);

    // Update editor-specific options
    diffEditor.updateOptions({
      readOnly,
    });
  }, [theme, readOnly]);

  // ---------------------------------------------------------------------------
  // Focus Handler
  // ---------------------------------------------------------------------------

  // Prevent browser's automatic scroll-into-view when clicking the editor
  usePreventFocusScroll(containerRef);

  const handleContainerClick = useCallback(() => {
    diffEditorRef.current?.getModifiedEditor().focus();
  }, []);

  return (
    <div
      ref={autoSizeRef}
      className={`relative ${autoSize ? "" : "h-full w-full"}`}
    >
      {/* Diff editor container */}
      <div
        ref={containerRef}
        className="h-full w-full"
        onClick={handleContainerClick}
        data-testid="diff-editor-wrapper"
      />

      {/* Loading state overlay */}
      {diffContent.isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-background"
          data-testid="diff-editor-loading"
        >
          Loading diff...
        </div>
      )}

      {/* Error state overlay */}
      {diffContent.error && (
        <div
          className="absolute inset-0 flex items-center justify-center text-destructive bg-background"
          data-testid="diff-editor-error"
        >
          {diffContent.error.message}
        </div>
      )}
    </div>
  );
}
