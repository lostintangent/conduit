import { FileTree } from "@/components/panes/editor/FileTree";
import { userSettingsAtom } from "@/store/atoms";
import Editor, { loader } from "@monaco-editor/react";
import type { FileTreeNode } from "@shared/types";
import { useAtomValue } from "jotai";
import { ChevronDown, FolderUp, Loader2, RefreshCw } from "lucide-react";
import "monaco-editor/esm/vs/basic-languages/go/go.contribution";
import "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution";
import "monaco-editor/esm/vs/basic-languages/rust/rust.contribution";
import "monaco-editor/esm/vs/basic-languages/shell/shell.contribution";
import "monaco-editor/esm/vs/basic-languages/xml/xml.contribution";
import "monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/language/css/monaco.contribution";
import "monaco-editor/esm/vs/language/html/monaco.contribution";
import "monaco-editor/esm/vs/language/json/monaco.contribution";
import "monaco-editor/esm/vs/language/typescript/monaco.contribution";
import path from "path-browserify";
import { useCallback, useEffect, useMemo, useState } from "react";

const api = window.conduit;

let isMonacoConfigured = false;

// Cache for file trees by cwd path
const fileTreeCache = new Map<string, FileTreeNode[]>();

function ensureMonacoConfigured() {
  if (isMonacoConfigured || typeof window === "undefined") {
    return;
  }

  loader.config({ monaco });

  isMonacoConfigured = true;
}

ensureMonacoConfigured();

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  css: "css",
  scss: "scss",
  sass: "scss",
  less: "less",
  html: "html",
  htm: "html",
  md: "markdown",
  markdown: "markdown",
  yml: "yaml",
  yaml: "yaml",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  swift: "swift",
  c: "c",
  h: "c",
  cpp: "cpp",
  cxx: "cpp",
  cc: "cpp",
  hh: "cpp",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  rb: "ruby",
  ini: "ini",
  sql: "sql",
  xml: "xml",
  txt: "plaintext",
};

function inferLanguageFromFilePath(filePath: string): string {
  const segments = filePath.split(".");
  if (segments.length <= 1) {
    return "plaintext";
  }

  const extension = segments[segments.length - 1]?.toLowerCase() ?? "";
  if (!extension) {
    return "plaintext";
  }

  return LANGUAGE_BY_EXTENSION[extension] ?? "plaintext";
}

type EditorPaneProps = {
  cwd: string;
  filePath?: string;
  onFileChange?: (fileData: {
    filePath: string;
    language: string;
    content: string;
  }) => void;
  onClearFile?: () => void;
  onCwdChange?: (cwd: string) => void;
  onFileOpen?: (node: FileTreeNode) => void;
};

export function EditorPane({
  cwd,
  filePath,
  onFileChange,
  onClearFile,
  onCwdChange,
  onFileOpen,
}: EditorPaneProps) {
  const { homeDirectory } = useAtomValue(userSettingsAtom);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [currentContent, setCurrentContent] = useState<string | undefined>(
    undefined
  );
  const [currentLanguage, setCurrentLanguage] = useState<string | undefined>(
    undefined
  );
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const hasOpenFile = Boolean(filePath && currentContent !== undefined);

  // Load file content when filePath changes
  useEffect(() => {
    if (!filePath) {
      setCurrentContent(undefined);
      setCurrentLanguage(undefined);
      setHasUnsavedChanges(false);
      return;
    }

    let cancelled = false;

    api
      .readFile(filePath)
      .then((content) => {
        if (!cancelled) {
          const language = inferLanguageFromFilePath(filePath);
          setCurrentContent(content);
          setCurrentLanguage(language);
          setHasUnsavedChanges(false);
        }
      })
      .catch((error) => {
        console.error("Failed to load file:", error);
        if (!cancelled) {
          setCurrentContent(undefined);
          setCurrentLanguage(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // Save file handler
  const handleSave = useCallback(async () => {
    if (!filePath || !hasUnsavedChanges || currentContent === undefined) {
      return;
    }

    try {
      await api.writeFile(filePath, currentContent);
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  }, [filePath, currentContent, hasUnsavedChanges]);

  // Ctrl+S keyboard handler
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        event.preventDefault();
        handleSave();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSave]);

  useEffect(() => {
    if (!cwd || hasOpenFile) {
      return;
    }

    // Check cache first
    const cachedTree = fileTreeCache.get(cwd);
    if (cachedTree) {
      setFileTree(cachedTree);
      setIsLoadingTree(false);
      return;
    }

    let cancelled = false;
    setIsLoadingTree(true);

    api
      .listDirectory(cwd)
      .then((tree) => {
        if (!cancelled) {
          setFileTree(tree);
          fileTreeCache.set(cwd, tree);
          setIsLoadingTree(false);
        }
      })
      .catch((error) => {
        console.error("Failed to load file tree:", error);
        if (!cancelled) {
          setFileTree([]);
          setIsLoadingTree(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cwd, hasOpenFile]);

  const handleFileSelect = useCallback(
    async (node: FileTreeNode) => {
      if (node.type !== "file") {
        return;
      }

      try {
        const fileContent = await api.readFile(node.path);
        const detectedLanguage = inferLanguageFromFilePath(node.path);

        onFileChange?.({
          filePath: node.path,
          language: detectedLanguage,
          content: fileContent,
        });
      } catch (error) {
        console.error("Failed to open file:", error);
      }
    },
    [onFileChange]
  );

  const handleClearFile = useCallback(() => {
    onClearFile?.();
  }, [onClearFile]);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      const originalContent = currentContent;
      setCurrentContent(value);
      setHasUnsavedChanges(value !== originalContent);
    },
    [currentContent]
  );

  const handleDirectoryChange = useCallback(
    (newPath: string) => {
      onCwdChange?.(newPath);
    },
    [onCwdChange]
  );

  const handleNavigateUp = useCallback(() => {
    const parentDir = path.dirname(cwd);
    if (parentDir && parentDir !== cwd) {
      onCwdChange?.(parentDir);
    }
  }, [cwd, onCwdChange]);

  const handleRefresh = useCallback(async () => {
    if (hasOpenFile && filePath) {
      // Refresh file content
      try {
        const content = await api.readFile(filePath);
        const language = inferLanguageFromFilePath(filePath);
        setCurrentContent(content);
        setCurrentLanguage(language);
        setHasUnsavedChanges(false);
      } catch (error) {
        console.error("Failed to refresh file:", error);
      }
    } else {
      // Refresh directory tree
      setIsLoadingTree(true);
      try {
        const tree = await api.listDirectory(cwd);
        setFileTree(tree);
        fileTreeCache.set(cwd, tree);
        setIsLoadingTree(false);
      } catch (error) {
        console.error("Failed to refresh directory:", error);
        setFileTree([]);
        setIsLoadingTree(false);
      }
    }
  }, [hasOpenFile, filePath, cwd]);

  const canNavigateUp = useMemo(() => {
    const parentDir = path.dirname(cwd);
    return parentDir !== cwd && parentDir !== ".";
  }, [cwd]);

  const displayPath = useMemo(() => {
    const pathToDisplay = filePath || cwd;
    if (!homeDirectory) {
      return pathToDisplay;
    }

    const normalizedPath = pathToDisplay.replace(/\\/g, "/");
    const normalizedHome = homeDirectory.replace(/\\/g, "/");

    if (normalizedPath === normalizedHome) {
      return "~";
    }

    const homeWithSlash = normalizedHome.endsWith("/")
      ? normalizedHome
      : `${normalizedHome}/`;
    if (normalizedPath.startsWith(homeWithSlash)) {
      const suffix = normalizedPath.slice(homeWithSlash.length);
      return suffix ? `~/${suffix}` : "~";
    }

    return pathToDisplay;
  }, [filePath, cwd, homeDirectory]);

  return (
    <div className="flex flex-1 min-h-0 min-w-0 flex-col bg-[#1e1e1e]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-muted border-b border-white/10 text-[13px] text-white/70">
        <div className="flex items-center gap-2 truncate">
          {hasUnsavedChanges && (
            <div
              className="w-2 h-2 rounded-full bg-blue-500 shrink-0"
              title="Unsaved changes"
            />
          )}
          <span className="truncate" title={filePath || cwd}>
            {displayPath}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleRefresh}
            className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
            title={hasOpenFile ? "Refresh file" : "Refresh directory"}
          >
            <RefreshCw size={14} className="text-white/60" />
          </button>
          {hasOpenFile && (
            <button
              type="button"
              onClick={handleClearFile}
              className="p-1 rounded hover:bg-white/10 transition-colors"
              title="Show file tree"
            >
              <ChevronDown size={14} className="text-white/60" />
            </button>
          )}
          {!hasOpenFile && canNavigateUp && (
            <button
              type="button"
              onClick={handleNavigateUp}
              className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
              title="Go up one directory"
            >
              <FolderUp size={14} className="text-white/60" />
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-1 min-h-0 min-w-0">
        {hasOpenFile ? (
          <Editor
            key={filePath}
            value={currentContent}
            onChange={handleEditorChange}
            language={currentLanguage}
            path={filePath}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              smoothScrolling: true,
              scrollBeyondLastLine: false,
              lineNumbers: "on",
            }}
            loading={
              <div className="flex h-full w-full items-center justify-center text-white/70">
                Loading file...
              </div>
            }
          />
        ) : (
          <div className="flex flex-1 overflow-auto p-2">
            {isLoadingTree ? (
              <div className="flex items-center justify-center w-full text-white/70">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : fileTree.length > 0 ? (
              <FileTree
                items={fileTree}
                onFileSelect={handleFileSelect}
                onDirectoryChange={handleDirectoryChange}
                onFileOpen={onFileOpen}
                rootPath={cwd}
              />
            ) : (
              <div className="flex items-center justify-center w-full text-white/50">
                No files found
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
