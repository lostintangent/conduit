/**
 * HistoricalFileViewer - Read-only viewer for a file at a specific commit.
 *
 * Used for viewing added or deleted files where a diff view doesn't make sense.
 * Shows the file content in a read-only Monaco editor.
 *
 * @example
 * ```tsx
 * <HistoricalFileViewer
 *   editorId="historical-file"
 *   commitId="abc123"
 *   filePath="src/index.ts"
 *   git={gitApi}
 * />
 * ```
 */

import * as monaco from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorTheme, usePreventFocusScroll } from "../../hooks";
import { detectLanguage } from "../../utils/languageDetection";
import type { GitV2API } from "@/api/GitV2API";

export interface HistoricalFileViewerProps {
  /** Unique ID for this editor instance */
  editorId: string;

  /** Commit to get the file from */
  commitId: string;

  /** Relative path to the file from git root */
  filePath: string;

  /** Git API instance for fetching content */
  git: GitV2API;

  /** Monaco theme name */
  theme?: string;
}

// ============================================================================
// Default Editor Options
// ============================================================================

const DEFAULT_EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions =
  {
    minimap: { enabled: false },
    smoothScrolling: true,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    fontSize: 13,
    wordWrap: "on",
    readOnly: true,
    scrollbar: {
      alwaysConsumeMouseWheel: false,
    },
    occurrencesHighlight: "off",
    selectionHighlight: false,
    hover: { enabled: false },
    parameterHints: { enabled: false },
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
    unicodeHighlight: { ambiguousCharacters: false },
  };

/**
 * Read-only Monaco editor for viewing a file at a historical commit.
 */
export function HistoricalFileViewer({
  editorId,
  commitId,
  filePath,
  git,
  theme: themeProp,
}: HistoricalFileViewerProps) {
  // Use provided theme or fall back to user's preferred theme
  const defaultTheme = useEditorTheme();
  const theme = themeProp ?? defaultTheme;

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);

  // State
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detect language from file path
  const language = detectLanguage(filePath);

  // ---------------------------------------------------------------------------
  // Fetch Content
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let isStale = false;
    setIsLoading(true);
    setError(null);

    const loadContent = async () => {
      try {
        const fileContent = await git.getFileAtCommit(commitId, filePath);
        if (!isStale) {
          setContent(fileContent);
          setIsLoading(false);
        }
      } catch (err) {
        if (!isStale) {
          setError(
            err instanceof Error ? err.message : "Failed to load file content",
          );
          setIsLoading(false);
        }
      }
    };

    loadContent();

    return () => {
      isStale = true;
    };
  }, [commitId, filePath, git]);

  // ---------------------------------------------------------------------------
  // Editor Setup
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const editor = monaco.editor.create(container, {
      ...DEFAULT_EDITOR_OPTIONS,
      theme,
    });

    editorRef.current = editor;

    return () => {
      if (modelRef.current) {
        modelRef.current.dispose();
        modelRef.current = null;
      }
      editor.dispose();
      editorRef.current = null;
    };
  }, [theme, editorId]);

  // ---------------------------------------------------------------------------
  // Model Setup
  // ---------------------------------------------------------------------------

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || content === null || isLoading) return;

    // Dispose previous model
    if (modelRef.current) {
      modelRef.current.dispose();
    }

    // Create model
    const uri = monaco.Uri.parse(
      `inmemory://historical/${editorId}/${commitId}/${filePath}`,
    );

    modelRef.current = monaco.editor.createModel(content, language, uri);
    editor.setModel(modelRef.current);
  }, [editorId, commitId, filePath, language, content, isLoading]);

  // ---------------------------------------------------------------------------
  // Theme Update
  // ---------------------------------------------------------------------------

  useEffect(() => {
    monaco.editor.setTheme(theme);
  }, [theme]);

  // ---------------------------------------------------------------------------
  // Focus Handler
  // ---------------------------------------------------------------------------

  usePreventFocusScroll(containerRef);

  const handleContainerClick = useCallback(() => {
    editorRef.current?.focus();
  }, []);

  return (
    <div className="relative h-full">
      {/* Editor container */}
      <div
        ref={containerRef}
        className="h-full w-full"
        onClick={handleContainerClick}
        data-testid="historical-file-viewer"
      />

      {/* Loading state overlay */}
      {isLoading && (
        <div
          className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-background"
          data-testid="historical-file-loading"
        >
          Loading file...
        </div>
      )}

      {/* Error state overlay */}
      {error && (
        <div
          className="absolute inset-0 flex items-center justify-center text-destructive bg-background"
          data-testid="historical-file-error"
        >
          {error}
        </div>
      )}
    </div>
  );
}
