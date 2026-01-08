/**
 * HistoricalDiffViewer - Read-only diff viewer for historical commits.
 *
 * This component displays a diff between two commits for a specific file.
 * Both sides are read-only since they represent historical versions.
 *
 * Key differences from DiffEditorWrapper:
 * - Both sides are read-only (historical content)
 * - Uses useHistoricalDiff to load content from commits
 * - No model registry integration (content is transient)
 * - No save/edit capabilities
 *
 * @example
 * ```tsx
 * <HistoricalDiffViewer
 *   editorId="historical-diff"
 *   commitId="abc123"
 *   parentCommitId="def456"
 *   filePath="src/index.ts"
 *   git={gitApi}
 * />
 * ```
 */

import * as monaco from "monaco-editor";
import { useCallback, useEffect, useRef } from "react";
import {
  useHistoricalDiff,
  useEditorTheme,
  usePreventFocusScroll,
} from "../../hooks";
import { detectLanguage } from "../../utils/languageDetection";
import type { GitV2API } from "@/api/GitV2API";

export interface HistoricalDiffViewerProps {
  /** Unique ID for this diff editor instance */
  editorId: string;

  /** Commit containing the change (right side) */
  commitId: string;

  /** Parent commit for comparison (left side) */
  parentCommitId: string;

  /** Relative path to the file from git root */
  filePath: string;

  /** Original path for renamed/copied files (path at parent commit) */
  originalFilePath?: string;

  /** Git API instance for fetching content */
  git: GitV2API;

  /** Monaco theme name */
  theme?: string;

  /** Callback when diff editor is mounted/ready */
  onMount?: (editor: monaco.editor.IStandaloneDiffEditor) => void;
}

// ============================================================================
// Default Diff Editor Options
// ============================================================================

/**
 * Default Monaco diff editor options for historical viewing.
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
    // Both sides are read-only
    readOnly: true,
    originalEditable: false,
    // Scrollbar options for better scroll behavior
    scrollbar: {
      alwaysConsumeMouseWheel: false,
    },
    // Disable interactive features
    occurrencesHighlight: "off",
    selectionHighlight: false,
    hover: { enabled: false },
    parameterHints: { enabled: false },
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    unicodeHighlight: { ambiguousCharacters: false },
  };

/**
 * Read-only Monaco diff editor for viewing historical commits.
 *
 * Creates a diff editor that compares:
 * - Original: Content from parent commit
 * - Modified: Content from the commit
 */
export function HistoricalDiffViewer({
  editorId,
  commitId,
  parentCommitId,
  filePath,
  originalFilePath,
  git,
  theme: themeProp,
  onMount,
}: HistoricalDiffViewerProps) {
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

  // Callback refs - keeps callbacks stable to avoid unnecessary effect re-runs
  const onMountRef = useRef(onMount);

  useEffect(() => {
    onMountRef.current = onMount;
  }, [onMount]);

  // Get historical diff content
  // For renamed/copied files, pass originalFilePath so the hook uses it for parent commit
  const diffContent = useHistoricalDiff(
    commitId,
    parentCommitId,
    filePath,
    git,
    originalFilePath,
  );

  // Detect language from file path
  const language = detectLanguage(filePath);

  // ---------------------------------------------------------------------------
  // Diff Editor Setup
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Create a fresh diff editor
    const diffEditor = monaco.editor.createDiffEditor(container, {
      ...DEFAULT_DIFF_OPTIONS,
      theme,
    });

    diffEditorRef.current = diffEditor;

    // Call onMount callback
    onMountRef.current?.(diffEditor);

    // Cleanup on unmount
    return () => {
      // Reset the diff editor's model to null BEFORE disposing the TextModels
      try {
        diffEditor.setModel(null);
      } catch {
        // Ignore if already disposed
      }

      // Dispose models (we own them)
      if (originalModelRef.current) {
        originalModelRef.current.dispose();
        originalModelRef.current = null;
      }
      if (modifiedModelRef.current) {
        modifiedModelRef.current.dispose();
        modifiedModelRef.current = null;
      }

      // Dispose diff editor
      diffEditor.dispose();
      diffEditorRef.current = null;
    };
  }, [theme, editorId]);

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

    try {
      // Dispose previous models if they exist
      if (originalModelRef.current || modifiedModelRef.current) {
        try {
          diffEditor.setModel(null);
        } catch {
          // Ignore if already disposed
        }
        originalModelRef.current?.dispose();
        modifiedModelRef.current?.dispose();
      }

      // Create models for both sides
      // Use unique URIs to avoid conflicts
      const originalUri = monaco.Uri.parse(
        `inmemory://historical/${editorId}/original/${parentCommitId}/${filePath}`,
      );
      const modifiedUri = monaco.Uri.parse(
        `inmemory://historical/${editorId}/modified/${commitId}/${filePath}`,
      );

      originalModelRef.current = monaco.editor.createModel(
        diffContent.original,
        language,
        originalUri,
      );

      modifiedModelRef.current = monaco.editor.createModel(
        diffContent.modified,
        language,
        modifiedUri,
      );

      // Set the diff models
      diffEditor.setModel({
        original: originalModelRef.current,
        modified: modifiedModelRef.current,
      });

      // Reveal the first diff after a short delay
      const revealTimeoutId = setTimeout(
        () => diffEditor.revealFirstDiff(),
        100,
      );

      return () => {
        clearTimeout(revealTimeoutId);
      };
    } catch (error) {
      console.error("Error setting up historical diff editor models:", error);
    }
  }, [
    editorId,
    commitId,
    parentCommitId,
    filePath,
    language,
    diffContent.isLoading,
    diffContent.original,
    diffContent.modified,
  ]);

  // ---------------------------------------------------------------------------
  // Theme Update
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Update theme globally (Monaco themes are global)
    monaco.editor.setTheme(theme);
  }, [theme]);

  // ---------------------------------------------------------------------------
  // Focus Handler
  // ---------------------------------------------------------------------------

  // Prevent browser's automatic scroll-into-view when clicking the editor
  usePreventFocusScroll(containerRef);

  const handleContainerClick = useCallback(() => {
    diffEditorRef.current?.getModifiedEditor().focus();
  }, []);

  return (
    <div className="relative h-full">
      {/* Diff editor container */}
      <div
        ref={containerRef}
        className="h-full w-full"
        onClick={handleContainerClick}
        data-testid="historical-diff-viewer"
      />

      {/* Loading state overlay */}
      {diffContent.isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-background"
          data-testid="historical-diff-loading"
        >
          Loading historical diff...
        </div>
      )}

      {/* Error state overlay */}
      {diffContent.error && (
        <div
          className="absolute inset-0 flex items-center justify-center text-destructive bg-background"
          data-testid="historical-diff-error"
        >
          {diffContent.error.message}
        </div>
      )}
    </div>
  );
}
