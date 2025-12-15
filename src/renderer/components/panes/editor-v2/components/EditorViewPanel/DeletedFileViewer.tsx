/**
 * DeletedFileViewer - Read-only viewer for deleted files.
 *
 * Shows the content of a file as it existed in git before deletion.
 * Used by both EditorViewPanel (main editor) and FileChangeDiff (review pane)
 * when a deleted file is selected.
 *
 * This is an editor wrapper like RegularEditorWrapper and DiffEditorWrapper,
 * but specialized for files that no longer exist on disk.
 *
 * @example
 * ```tsx
 * <DeletedFileViewer
 *   editorId="deleted-file-viewer"
 *   filePath="/project/src/old-file.ts"
 *   cwd="/project"
 *   baseBranch="HEAD"
 * />
 * ```
 */

import { useGitV2 } from "@/hooks/useGitV2";
import * as monaco from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAutoSizeEditor, useEditorTheme } from "../../hooks";
import { detectLanguage } from "../../utils/languageDetection";
import type { AutoSizeConfig } from "./constants";

export interface DeletedFileViewerProps {
  /** Unique ID for this editor instance */
  editorId: string;

  /** Working directory for git operations */
  cwd: string;

  /** Absolute path to the deleted file */
  filePath: string;

  /** Git ref for the content (default: 'HEAD') */
  baseBranch?: string;

  /** Optional sandbox ID for cloud VM operations */
  sandboxId?: string;

  /** Auto-size configuration */
  autoSize?: AutoSizeConfig;

  /** Callback when editor is mounted */
  onMount?: (editor: monaco.editor.IStandaloneCodeEditor) => void;
}

/**
 * Default Monaco editor options for read-only deleted file viewing.
 */
const DEFAULT_EDITOR_OPTIONS: monaco.editor.IStandaloneEditorConstructionOptions =
  {
    readOnly: true,
    minimap: { enabled: false },
    smoothScrolling: true,
    scrollBeyondLastLine: false,
    automaticLayout: true,
    fontSize: 13,
    wordWrap: "on",
    scrollbar: {
      alwaysConsumeMouseWheel: false,
    },
    // Visual indicator that file is deleted
    lineNumbers: "on",
    renderLineHighlight: "none",
    // Disable interactive features
    occurrencesHighlight: "off",
    selectionHighlight: false,
    hover: { enabled: false },
    parameterHints: { enabled: false },
    quickSuggestions: false,
    suggestOnTriggerCharacters: false,
  };

/**
 * Read-only editor for viewing deleted file content from git.
 */
export function DeletedFileViewer({
  editorId,
  cwd,
  filePath,
  baseBranch,
  sandboxId,
  autoSize,
  onMount,
}: DeletedFileViewerProps) {
  const git = useGitV2(cwd, sandboxId);
  const theme = useEditorTheme();
  const language = detectLanguage(filePath);

  // State
  const [content, setContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);

  // Auto-sizing hook
  const { containerStyle } = useAutoSizeEditor({
    editor: editorRef.current,
    config: autoSize,
    deps: [content, isLoading],
  });

  // Load content from git
  useEffect(() => {
    let cancelled = false;

    async function loadContent() {
      setIsLoading(true);
      setError(null);

      try {
        const ref = baseBranch || "HEAD";
        const fileContent = await git.getFileAtRef(filePath, ref);

        if (!cancelled) {
          setContent(fileContent);
          setIsLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          const message =
            err instanceof Error ? err.message : "Failed to load file content";
          setError(message);
          setIsLoading(false);
        }
      }
    }

    loadContent();

    return () => {
      cancelled = true;
    };
  }, [git, filePath, baseBranch]);

  // Create/update editor when content is available
  useEffect(() => {
    const container = containerRef.current;
    if (!container || content === null) return;

    // Create editor if it doesn't exist
    if (!editorRef.current) {
      const editor = monaco.editor.create(container, {
        ...DEFAULT_EDITOR_OPTIONS,
        theme,
        value: content,
        language,
      });

      editorRef.current = editor;
      onMount?.(editor);

      // Store model reference for cleanup
      modelRef.current = editor.getModel();
    } else {
      // Update existing editor's content
      const model = editorRef.current.getModel();
      if (model) {
        model.setValue(content);
      }
    }
  }, [content, theme, language, onMount]);

  // Update theme
  useEffect(() => {
    if (editorRef.current) {
      monaco.editor.setTheme(theme);
    }
  }, [theme]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (modelRef.current) {
        modelRef.current.dispose();
        modelRef.current = null;
      }
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
    };
  }, []);

  // Handle container click to focus editor
  const handleContainerClick = useCallback(() => {
    editorRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col" style={containerStyle}>
      {/* Deleted file indicator banner - shown before editor */}
      {!isLoading && !error && (
        <div className="bg-red-900/30 text-red-300 text-xs px-3 py-1 border-b border-red-800/50 flex-shrink-0">
          This file has been deleted. Showing content from{" "}
          {baseBranch || "HEAD"}.
        </div>
      )}

      {/* Editor container */}
      <div className="relative flex-1 min-h-0">
        <div
          ref={containerRef}
          className="h-full w-full"
          onClick={handleContainerClick}
          data-testid="deleted-file-viewer"
        />

        {/* Loading state */}
        {isLoading && (
          <div
            className="absolute inset-0 flex items-center justify-center text-muted-foreground bg-background"
            data-testid="deleted-file-viewer-loading"
          >
            Loading deleted file...
          </div>
        )}

        {/* Error state */}
        {error && (
          <div
            className="absolute inset-0 flex items-center justify-center text-destructive bg-background"
            data-testid="deleted-file-viewer-error"
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
