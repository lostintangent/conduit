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
import type { ContentSource } from "../../types";
import { detectLanguage, forceTokenizeVisibleLines } from "../../utils";
import { ReadOnlyBadge, SourceBadge } from "../shared";

export interface DiffEditorWrapperProps {
  /** Unique ID for this diff editor instance */
  editorId: string;

  /** Working directory for file and git operations */
  cwd: string;

  /** Absolute path to the file to diff */
  filePath: string;

  /**
   * For renamed/copied files, the original path before the rename.
   * When provided, this path is used to fetch content from originalSource,
   * while filePath is used for modifiedSource.
   */
  originalFilePath?: string;

  /**
   * Source for original (left) side content.
   * Default: 'head'
   */
  originalSource?: ContentSource;

  /**
   * Source for modified (right) side content.
   * Default: 'workingDirectory'
   *
   * Note: Only 'workingDirectory' is editable. Git sources are read-only.
   */
  modifiedSource?: ContentSource;

  /**
   * @deprecated Use originalSource instead. Kept for backward compatibility.
   * If originalSource is not provided, baseBranch is used as the original source.
   */
  baseBranch?: string;

  /** Optional sandbox ID for cloud VM operations */
  sandboxId?: string;

  /** Monaco theme name */
  theme?: string;

  /**
   * Whether the modified side should be read-only.
   * Only applies when modifiedSource is 'workingDirectory'.
   */
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

  /**
   * Show a read-only badge when the diff is entirely read-only.
   * Useful for historical diffs to indicate content cannot be edited.
   */
  showReadOnlyBadge?: boolean;

  /**
   * Labels for the diff sides (e.g., commit short IDs).
   * Displayed as badges above the diff editor.
   */
  labels?: {
    /** Label for original (left) side */
    original?: string;
    /** Label for modified (right) side */
    modified?: string;
  };
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
 * Creates a diff editor that compares content from configurable sources:
 * - Original: Content from originalSource (default: 'head')
 * - Modified: Content from modifiedSource (default: 'workingDirectory')
 */
export function DiffEditorWrapper({
  editorId,
  cwd,
  filePath,
  originalFilePath,
  originalSource: originalSourceProp,
  modifiedSource: modifiedSourceProp = "workingDirectory",
  baseBranch,
  sandboxId,
  theme: themeProp,
  readOnly = false,
  onChange,
  onMount,
  autoSize,
  hideUnchangedRegions = false,
  showReadOnlyBadge = false,
  labels,
}: DiffEditorWrapperProps) {
  // Resolve original source: prefer originalSource prop, fall back to baseBranch for backward compat
  const originalSource: ContentSource =
    originalSourceProp ?? baseBranch ?? "head";
  const modifiedSource: ContentSource = modifiedSourceProp;

  // Use provided theme or fall back to user's preferred theme
  const defaultTheme = useEditorTheme();
  const theme = themeProp ?? defaultTheme;

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const diffEditorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(
    null,
  );
  const originalModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const modifiedModelRef = useRef<monaco.editor.ITextModel | null>(null);
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

  // Get diff content based on sources
  const diffContent = useDiffContent(filePath, cwd, {
    originalSource,
    modifiedSource,
    sandboxId,
    originalFilePath,
  });

  // Effective read-only state: read-only if explicitly set OR if modified source is not editable
  const effectiveReadOnly = readOnly || !diffContent.isModifiedEditable;

  // Ref to track effectiveReadOnly for cleanup (defined after effectiveReadOnly is calculated)
  const effectiveReadOnlyRef = useRef(effectiveReadOnly);
  useEffect(() => {
    effectiveReadOnlyRef.current = effectiveReadOnly;
  }, [effectiveReadOnly]);

  // Get the shared model for the modified side (only when modifiedSource is 'workingDirectory')
  // Pass editorId to ensure consistent reference counting with other registries
  const registryModel = useMonacoModel(
    editorId,
    modifiedSource === "workingDirectory" ? filePath : null,
    cwd,
    sandboxId,
  );

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
    // Note: readOnly is set via updateOptions below to avoid having it in dependencies
    const diffEditor = monaco.editor.createDiffEditor(container, {
      ...DEFAULT_DIFF_OPTIONS,
      theme,
      ...(hideUnchangedRegions && {
        hideUnchangedRegions: HIDE_UNCHANGED_REGIONS_CONFIG,
      }),
    });

    diffEditorRef.current = diffEditor;

    // Set initial readOnly option
    diffEditor.updateOptions({ readOnly: effectiveReadOnly });

    // Call onMount callback via ref to avoid dependency
    onMountRef.current?.(diffEditor);

    // Cleanup on unmount
    return () => {
      // Save ViewState before disposing so it can be restored later (only for editable content)
      if (!effectiveReadOnlyRef.current) {
        const modifiedEditor = diffEditor.getModifiedEditor();
        if (modifiedEditor && currentFilePathRef.current) {
          ViewStateRegistry.getInstance().save(
            `diff-modified-${editorId}`,
            currentFilePathRef.current,
            modifiedEditor,
          );
        }
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

      // Dispose modified model if we own it (git source mode)
      if (modifiedModelRef.current) {
        modifiedModelRef.current.dispose();
        modifiedModelRef.current = null;
      }

      // Dispose diff editor
      diffEditor.dispose();
      diffEditorRef.current = null;
    };
    // Note: onMount handled via ref, filePath via ref for cleanup
    // Note: effectiveReadOnly is NOT in dependencies - we update it via updateOptions
    // to avoid recreating the entire editor (which causes keyboard listener leaks)
  }, [theme, editorId, hideUnchangedRegions]);

  // ---------------------------------------------------------------------------
  // Model Setup
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const diffEditor = diffEditorRef.current;
    if (!diffEditor) return;

    // Need both original and modified content to set up the diff
    if (
      diffContent.isLoading ||
      diffContent.original === null ||
      diffContent.modified === null
    ) {
      return;
    }

    // Determine which model to use for the modified side
    let modifiedModel: monaco.editor.ITextModel | null = null;

    if (modifiedSource === "workingDirectory") {
      // Working directory: use the shared registry model
      if (!registryModel) {
        return;
      }

      // IMPORTANT: Verify the registryModel matches the current filePath before attaching.
      // When filePath changes, React may re-run this effect with the OLD model
      // before useMonacoModel updates with the new model.
      const modelUri = registryModel.uri.toString();
      const expectedModelKey = createModelKey(filePath, sandboxId);
      const modelMatchesFile =
        modelUri === expectedModelKey ||
        modelUri.startsWith(expectedModelKey.split("::")[0] + "::") ||
        registryModel.uri.fsPath === filePath;

      if (!modelMatchesFile) {
        return;
      }

      modifiedModel = registryModel;
    }
    // For git sources, we'll create a standalone model below

    // Wrap in try-catch to prevent any errors from crashing the app
    try {
      // Reset diff editor model before disposing old models
      if (originalModelRef.current || modifiedModelRef.current) {
        try {
          diffEditor.setModel(null);
        } catch {
          // Ignore if already disposed
        }
      }

      // Dispose previous original model
      if (originalModelRef.current) {
        originalModelRef.current.dispose();
      }

      // Dispose previous modified model (only if we own it - git source mode)
      if (modifiedModelRef.current) {
        modifiedModelRef.current.dispose();
        modifiedModelRef.current = null;
      }

      // Create original model (read-only, we own this)
      const originalUri = monaco.Uri.parse(
        `inmemory://original/${editorId}/${filePath}`,
      );
      originalModelRef.current = monaco.editor.createModel(
        diffContent.original,
        language,
        originalUri,
      );

      // Create modified model for git sources (we own this)
      if (modifiedSource !== "workingDirectory") {
        const modifiedUri = monaco.Uri.parse(
          `inmemory://modified/${editorId}/${filePath}`,
        );
        modifiedModelRef.current = monaco.editor.createModel(
          diffContent.modified,
          language,
          modifiedUri,
        );
        modifiedModel = modifiedModelRef.current;
      }

      if (!modifiedModel) {
        console.error("No modified model available for diff editor");
        return;
      }

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

    // Restore ViewState for the modified editor (only for editable content)
    if (!effectiveReadOnly) {
      const modifiedEditor = diffEditor.getModifiedEditor();
      if (modifiedEditor) {
        ViewStateRegistry.getInstance().restore(
          `diff-modified-${editorId}`,
          filePath,
          modifiedEditor,
        );
      }
    }

    // Automatically scroll to the first diff after a short delay
    const revealTimeoutId = setTimeout(() => diffEditor.revealFirstDiff(), 100);

    // Set up content change listener for onChange callback (only for editable content)
    if (contentChangeDisposableRef.current) {
      contentChangeDisposableRef.current.dispose();
    }

    if (!effectiveReadOnly && modifiedModel) {
      const model = modifiedModel;
      contentChangeDisposableRef.current = model.onDidChangeContent(() => {
        onChangeRef.current?.(model.getValue());
      });
    }

    return () => {
      clearTimeout(revealTimeoutId);

      if (contentChangeDisposableRef.current) {
        contentChangeDisposableRef.current.dispose();
        contentChangeDisposableRef.current = null;
      }
    };
  }, [
    editorId,
    filePath,
    language,
    modifiedSource,
    diffContent.isLoading,
    diffContent.original,
    diffContent.modified,
    registryModel,
    effectiveReadOnly,
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
      readOnly: effectiveReadOnly,
    });
  }, [theme, effectiveReadOnly]);

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

      {/* Read-only badge (top-right corner) */}
      {showReadOnlyBadge && effectiveReadOnly && (
        <div className="absolute top-2 right-2 z-10">
          <ReadOnlyBadge tooltip="Historical diff (read-only)" />
        </div>
      )}

      {/* Source labels (top corners, positioned over each side) */}
      {labels && (labels.original || labels.modified) && (
        <div className="absolute top-2 left-0 right-0 z-10 flex justify-between px-2 pointer-events-none">
          <div className="pointer-events-auto">
            {labels.original && <SourceBadge label={labels.original} />}
          </div>
          <div className="pointer-events-auto">
            {labels.modified && <SourceBadge label={labels.modified} />}
          </div>
        </div>
      )}

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
