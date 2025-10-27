import { userSettingsAtom } from "@/store/atoms";
import { FileTree } from "@/components/FileTree";
import type { FileTreeNode } from "@shared/types";
import Editor, { loader } from "@monaco-editor/react";
import { useAtomValue } from "jotai";
import { ChevronDown, Loader2 } from "lucide-react";
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
import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

const api = window.conduit;

let isMonacoConfigured = false;

// Cache for file trees by cwd path
const fileTreeCache = new Map<string, FileTreeNode[]>();

function ensureMonacoConfigured() {
  if (isMonacoConfigured || typeof window === "undefined") {
    return;
  }

  const globalObject = self as unknown as {
    MonacoEnvironment?: {
      getWorker: (id: string, label: string) => Worker;
    };
  };

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
  relativePath?: string;
  language?: string;
  content?: string;
  onContextMenu?: (event: MouseEvent<HTMLDivElement>) => void;
  onActivate?: () => void;
  onFileChange?: (fileData: {
    filePath: string;
    relativePath: string;
    language: string;
    content: string;
  }) => void;
  onClearFile?: () => void;
};

export function EditorPane({
  cwd,
  filePath,
  relativePath,
  language,
  content,
  onContextMenu,
  onActivate,
  onFileChange,
  onClearFile,
}: EditorPaneProps) {
  const { homeDirectory } = useAtomValue(userSettingsAtom);
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [isLoadingTree, setIsLoadingTree] = useState(false);

  const hasOpenFile = Boolean(filePath && content !== undefined);

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
      .getFileTree(cwd)
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
          relativePath: node.relativePath,
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

  const displayPath = useMemo(() => {
    if (!filePath && !relativePath) {
      return cwd;
    }

    const originalPath = filePath ?? relativePath ?? cwd;
    if (!homeDirectory) {
      return originalPath;
    }

    const normalizedOriginal = originalPath.replace(/\\/g, "/");
    const normalizedHome = homeDirectory.replace(/\\/g, "/");

    if (normalizedOriginal === normalizedHome) {
      return "~";
    }

    const homeWithSlash = normalizedHome.endsWith("/")
      ? normalizedHome
      : `${normalizedHome}/`;
    if (normalizedOriginal.startsWith(homeWithSlash)) {
      const suffix = normalizedOriginal.slice(homeWithSlash.length);
      return suffix ? `~/${suffix}` : "~";
    }

    return originalPath;
  }, [filePath, relativePath, cwd, homeDirectory]);

  return (
    <div
      className="flex flex-1 min-h-0 min-w-0 flex-col bg-[#1e1e1e]"
      onContextMenu={onContextMenu}
      onMouseDown={onActivate}
    >
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-muted border-b border-white/10 text-[13px] text-white/70">
        <span className="truncate" title={filePath || cwd}>
          {displayPath}
        </span>
        {hasOpenFile && (
          <button
            type="button"
            onClick={handleClearFile}
            className="ml-2 p-1 rounded hover:bg-white/10 transition-colors"
            title="Show file tree"
          >
            <ChevronDown size={14} className="text-white/60" />
          </button>
        )}
      </div>
      <div className="flex flex-1 min-h-0 min-w-0">
        {hasOpenFile ? (
          <Editor
            key={filePath}
            value={content}
            language={language}
            path={filePath}
            theme="vs-dark"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              smoothScrolling: true,
              scrollBeyondLastLine: false,
              lineNumbers: "on",
            }}
            loading={
              <div className="flex h-full w-full items-center justify-center text-white/70">
                Loading {relativePath}...
              </div>
            }
          />
        ) : (
          <div className="flex flex-1 overflow-auto p-4">
            {isLoadingTree ? (
              <div className="flex items-center justify-center w-full text-white/70">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : fileTree.length > 0 ? (
              <FileTree items={fileTree} onFileSelect={handleFileSelect} />
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
