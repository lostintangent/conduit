import { BranchSelector } from "@/components/panes/editor/BranchSelector";
import { EditorToolbarButtons } from "@/components/panes/editor/EditorToolbarButtons";
import { FileTree } from "@/components/panes/editor/tree/FileTree";
import { GitBranchToolbar } from "@/components/panes/editor/tree/GitBranchToolbar";
import {
  clearDirectoryCache,
  handleFileChanged,
  handleFileRenamed,
  invalidateDirectory,
} from "@/components/panes/editor/tree/useDirectoryCache";
import { useGitStatus } from "@/components/panes/editor/useGitStatus";
import { SandboxIndicator } from "@/components/panes/terminal/SandboxIndicator";
import { Separator } from "@/components/ui/separator";
import { useCommand } from "@/commands/hooks/useCommand";
import { ApplicationCommands } from "@/commands/applicationCommands";
import { useSandboxHandlers } from "@/hooks/useSandboxHandlers";
import { tabsAtom, userSettingsAtom } from "@/store/atoms";
import type { EditorTreeMode } from "@/types";
import { resolveTheme } from "@/utils/theme";
import Editor, { DiffEditor, loader } from "@monaco-editor/react";
import type { FileDiffResult, FileTreeNode } from "@shared/types";
import { useAtomValue } from "jotai";
import {
  ChevronRight,
  FolderUp,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";

// CRITICAL: Import worker setup BEFORE any monaco contribution imports
// This sets up MonacoEnvironment before languages try to register
import "./monaco/monaco-workers";
import { configureTsConfig } from "./monaco/monaco-workers";

import "monaco-editor/esm/vs/base/browser/ui/codicons/codicon/codicon.css";
import "monaco-editor/esm/vs/basic-languages/go/go.contribution";
import "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution";
import "monaco-editor/esm/vs/basic-languages/rust/rust.contribution";
import "monaco-editor/esm/vs/basic-languages/shell/shell.contribution";
import "monaco-editor/esm/vs/basic-languages/xml/xml.contribution";
import "monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution";
import "monaco-editor/esm/vs/editor/contrib/find/browser/findController";
import "monaco-editor/esm/vs/editor/contrib/find/browser/findWidget.css";
// Import from full monaco-editor bundle (same as monaco-workers.ts)
// DO NOT import from 'monaco-editor/esm/vs/editor/editor.api' as it lacks language support
import * as monaco from "monaco-editor";

import path from "path-browserify";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const api = window.conduit;

let isMonacoConfigured = false;

// Cache for file trees by cwd path
const fileTreeCache = new Map<string, FileTreeNode[]>();

// Layout constants
const SPLIT_MODE_THRESHOLD = 600; // px - switch to split mode above this width
const DEFAULT_TREE_WIDTH = 200; // px
const MIN_TREE_WIDTH = 120; // px
const MAX_TREE_WIDTH = 400; // px
const TREE_MAX_WIDTH_PERCENTAGE = 0.5; // 50% of container width

function ensureMonacoConfigured() {
  if (isMonacoConfigured || typeof window === "undefined") {
    return;
  }

  // Expose monaco globally for debugging
  (window as any).monaco = monaco;

  // Note: MonacoEnvironment is now configured in monaco-workers.ts
  // which is imported before the contribution files

  loader.config({ monaco });

  isMonacoConfigured = true;
}

ensureMonacoConfigured();

// Map exact filenames to languages (case-insensitive)
const LANGUAGE_BY_FILENAME: Record<string, string> = {
  // Dockerfiles
  dockerfile: "dockerfile",
  "dockerfile.dev": "dockerfile",
  "dockerfile.prod": "dockerfile",
  "dockerfile.test": "dockerfile",
  // Makefiles
  makefile: "makefile",
  gnumakefile: "makefile",
  // Git/ignore files (use shell/ini as fallback since 'ignore' language doesn't exist)
  ".gitignore": "shell",
  ".gitattributes": "ini",
  ".gitmodules": "ini",
  ".dockerignore": "shell",
  ".prettierignore": "shell",
  ".eslintignore": "shell",
  ".npmignore": "shell",
  // Env files (use ini as fallback since 'dotenv' language doesn't exist)
  ".env": "ini",
  ".env.local": "ini",
  ".env.development": "ini",
  ".env.production": "ini",
  ".env.test": "ini",
  ".env.example": "ini",
  // NPM/Node
  ".npmrc": "ini",
  ".nvmrc": "plaintext",
  ".yarnrc": "yaml",
  ".node-version": "plaintext",
  // Editor configs
  ".editorconfig": "ini",
  ".prettierrc": "json",
  ".eslintrc": "json",
  // Other common config files
  ".browserslistrc": "plaintext",
  cname: "plaintext",
  license: "plaintext",
  authors: "plaintext",
  contributors: "plaintext",
  // Docker Compose (use yaml since 'dockercompose' doesn't exist)
  "docker-compose.yml": "yaml",
  "docker-compose.yaml": "yaml",
  "compose.yml": "yaml",
  "compose.yaml": "yaml",
};

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "jsonc",
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
  bash: "bash",
  zsh: "shell", // Fallback to shell (zsh grammar might not be in Shiki)
  fish: "shell", // Fallback to shell (fish grammar might not be in Shiki)
  ps1: "powershell",
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
  cfg: "ini",
  conf: "ini",
  config: "ini",
  properties: "ini", // Fallback to ini (properties grammar might not be in Shiki)
  env: "ini", // Fallback to ini (dotenv grammar might not be in Shiki)
  sql: "sql",
  xml: "xml",
  txt: "plaintext",
  dockerfile: "dockerfile",
  toml: "toml",
  graphql: "graphql",
  gql: "graphql",
  diff: "diff",
  patch: "diff",
};

function inferLanguageFromFilePath(filePath: string): string {
  // Extract just the filename (not the full path)
  const fileName = filePath.split("/").pop()?.toLowerCase() ?? "";

  // Check exact filename matches first (for files like .gitignore, Dockerfile, etc.)
  if (LANGUAGE_BY_FILENAME[fileName]) {
    return LANGUAGE_BY_FILENAME[fileName];
  }

  // Then check by extension
  const segments = fileName.split(".");
  if (segments.length <= 1) {
    return "plaintext";
  }

  const extension = segments[segments.length - 1] ?? "";
  if (!extension) {
    return "plaintext";
  }

  return LANGUAGE_BY_EXTENSION[extension] ?? "plaintext";
}

type EditorPaneProps = {
  cwd: string;
  filePath?: string;
  paneId: string;
  agentSessionId?: string | null;
  treeMode?: EditorTreeMode;
  onFileChange?: (fileData: {
    filePath: string;
    language: string;
    content: string;
  }) => void;
  onClearFile?: () => void;
  onCwdChange?: (cwd: string) => void;
  onFileOpen?: (node: FileTreeNode) => void;
  onTreeModeChange?: (mode: EditorTreeMode) => void;
  isLocked?: boolean;
  onSave?: () => void;
  hideIndividualSandboxIndicator?: boolean;
};

export function EditorPane({
  cwd,
  filePath,
  paneId,
  agentSessionId,
  treeMode,
  onFileChange,
  onClearFile: _onClearFile,
  onCwdChange,
  onFileOpen,
  onTreeModeChange,
  isLocked = false,
  onSave,
  hideIndividualSandboxIndicator = false,
}: EditorPaneProps) {
  const { homeDirectory, theme } = useAtomValue(userSettingsAtom);
  const tabs = useAtomValue(tabsAtom);
  const closePaneCmd = useCommand(ApplicationCommands.PANE_CLOSE);
  // Use Shiki's VS Code themes (markdown formatting handled by Shiki's grammar)
  const editorTheme =
    resolveTheme(theme) === "light" ? "light-plus" : "dark-plus";
  const [fileTree, setFileTree] = useState<FileTreeNode[]>([]);
  const [isLoadingTree, setIsLoadingTree] = useState(false);
  const [currentContent, setCurrentContent] = useState<string | undefined>(
    undefined,
  );
  const [originalContent, setOriginalContent] = useState<string | undefined>(
    undefined,
  );
  const [currentLanguage, setCurrentLanguage] = useState<string | undefined>(
    undefined,
  );

  // Compute language from filePath immediately to avoid plaintext default
  const detectedLanguage = useMemo(() => {
    if (filePath) {
      return inferLanguageFromFilePath(filePath);
    }
    return currentLanguage || "plaintext";
  }, [filePath, currentLanguage]);

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const disposableRef = useRef<monaco.IDisposable | null>(null);

  // Split view state
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [treeWidth, setTreeWidth] = useState(() => {
    // Load tree width from localStorage
    const savedWidth = localStorage.getItem(`editor-pane-tree-width-${paneId}`);
    return savedWidth ? parseInt(savedWidth, 10) : DEFAULT_TREE_WIDTH;
  });
  const [isTreeCollapsed, setIsTreeCollapsed] = useState(() => {
    // Load collapsed state from localStorage
    const savedCollapsed = localStorage.getItem(
      `editor-pane-tree-collapsed-${paneId}`,
    );
    return savedCollapsed === "true";
  });
  const [isResizing, setIsResizing] = useState(false);
  const [activeView, setActiveView] = useState<"tree" | "editor">("tree");
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  // Track if the user has manually toggled the tree collapse state
  // This prevents animation on initial mount and in tab previews
  const [enableTreeAnimation, setEnableTreeAnimation] = useState(false);

  // File watcher state
  const [externallyModified, setExternallyModified] = useState(false);
  const [externallyDeleted, setExternallyDeleted] = useState(false);
  const [showExternalChangeWarning, setShowExternalChangeWarning] =
    useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Refs to track current values for file watcher event handlers
  // This allows handlers to access current values without causing re-subscription
  const filePathRef = useRef(filePath);
  const hasUnsavedChangesRef = useRef(hasUnsavedChanges);
  const currentContentRef = useRef(currentContent);
  const previousFilePathRef = useRef(filePath);
  const previousCwdRef = useRef(cwd);

  // Git status integration
  const {
    gitStatus,
    baseBranch,
    branches,
    isBranchSelectorOpen,
    isInGitRepo,
    currentBranch,
    setIsBranchSelectorOpen,
    handleBranchSelect,
  } = useGitStatus(cwd);

  const [showOnlyChangedFiles, setShowOnlyChangedFiles] = useState(
    treeMode === "changes",
  );

  // Diff viewer state - using discriminated union to prevent invalid states
  type ViewMode =
    | { type: "editor" }
    | { type: "diff"; data: FileDiffResult; showRaw: boolean };

  const [viewMode, setViewMode] = useState<ViewMode>({ type: "editor" });

  // Helper to fetch diff data for a file
  const fetchDiffForFile = useCallback(
    async (targetFilePath: string) => {
      const result = await api.getFileDiff(targetFilePath, cwd, baseBranch);
      if (result.success && result.diff) {
        return result.diff;
      }
      return null;
    },
    [cwd, baseBranch],
  );

  // Configure Monaco's TypeScript language service with project's tsconfig.json
  // This implements TypeScript's upward search algorithm to find tsconfig.json
  useEffect(() => {
    if (!cwd) return;

    // Configure tsconfig asynchronously
    configureTsConfig(cwd, api).catch((error) => {
      console.error("[Monaco TypeScript] Failed to configure tsconfig:", error);
    });
  }, [cwd]);

  // Re-fetch diff when baseBranch changes while in diff mode
  useEffect(() => {
    if (viewMode.type !== "diff" || !filePath || !cwd) return;

    const refetchDiff = async () => {
      try {
        const diff = await fetchDiffForFile(filePath);
        if (diff) {
          setViewMode({ type: "diff", data: diff, showRaw: false });
          // Don't call onFileChange here - it would cause render loops
          // The diff data update is sufficient for the UI to re-render
        }
      } catch (error) {
        console.error("Failed to refetch diff:", error);
      }
    };

    refetchDiff();
  }, [baseBranch, viewMode.type, filePath, cwd, fetchDiffForFile]);

  // Track which paths were manually expanded by the user
  const [manuallyExpandedPaths, setManuallyExpandedPaths] = useState<
    Set<string>
  >(() => {
    const saved = localStorage.getItem(`tree-manual-expanded-${paneId}`);
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });

  // Track which paths were manually collapsed during filtering
  // This overrides auto-expansion when user explicitly collapses a folder
  const [manuallyCollapsedPaths, setManuallyCollapsedPaths] = useState<
    Set<string>
  >(new Set());

  // Clear manually collapsed paths when filtering is turned off
  useEffect(() => {
    if (!showOnlyChangedFiles) {
      setManuallyCollapsedPaths(new Set());
    }
  }, [showOnlyChangedFiles]);

  // Compute layout mode based on container width
  const layoutMode = containerWidth > SPLIT_MODE_THRESHOLD ? "split" : "single";

  // Detect prefers-reduced-motion
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (e: MediaQueryListEvent) => {
      setPrefersReducedMotion(e.matches);
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  const hasOpenFile = Boolean(filePath && currentContent !== undefined);

  // Transition classes respecting prefers-reduced-motion
  // Note: duration-200 is a Tailwind class for 200ms transitions
  // Don't apply transitions to tree width during resize - causes lag
  // Only animate if user has manually toggled (prevents animation on mount/preview)
  const transitionClass =
    prefersReducedMotion || isResizing || !enableTreeAnimation
      ? "transition-none"
      : "transition-all duration-200 ease-out";
  const transitionTransformClass = prefersReducedMotion
    ? "transition-none"
    : "transition-transform duration-200 ease-out";

  // Resize handle highlight class (matches pane resize behavior)
  const resizeHandleClass = isResizing
    ? "bg-accent"
    : "bg-transparent hover:bg-accent";

  // In single mode, auto-switch to editor when a NEW file is opened or changed
  // but NOT when just transitioning from split to single mode
  useEffect(() => {
    const filePathChanged = filePath !== previousFilePathRef.current;

    if (layoutMode === "single" && hasOpenFile && filePathChanged) {
      setActiveView("editor");
    }

    // Update the ref for next comparison
    previousFilePathRef.current = filePath;
  }, [layoutMode, hasOpenFile, filePath]);

  // Find the current tab for agent session operations
  const currentTab = useMemo(() => {
    for (const tab of tabs) {
      if (tab.panes[paneId]) {
        return tab;
      }
    }
    return undefined;
  }, [tabs, paneId]);

  // Use sandbox handlers from the shared hook
  const {
    handleCompleteAgentSession: handleCompleteAgentSessionBase,
    handleDeleteAgentSession: handleDeleteAgentSessionBase,
  } = useSandboxHandlers({
    tabId: currentTab?.id ?? "",
    paneId,
  });

  // Wrap the base handlers to check for required values
  const handleCompleteAgentSession = useCallback(async () => {
    if (!agentSessionId || !currentTab) {
      return;
    }
    await handleCompleteAgentSessionBase(agentSessionId);
  }, [agentSessionId, currentTab, handleCompleteAgentSessionBase]);

  const handleDeleteAgentSession = useCallback(async () => {
    if (!agentSessionId || !currentTab) {
      return;
    }
    await handleDeleteAgentSessionBase(agentSessionId);
  }, [agentSessionId, currentTab, handleDeleteAgentSessionBase]);

  // Load file content when filePath changes
  useEffect(() => {
    if (!filePath) {
      setCurrentContent(undefined);
      setOriginalContent(undefined);
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
          setOriginalContent(content);
          setCurrentLanguage(language);
          setHasUnsavedChanges(false);
        }
      })
      .catch((error) => {
        console.error("Failed to load file:", error);
        if (!cancelled) {
          setCurrentContent(undefined);
          setOriginalContent(undefined);
          setCurrentLanguage(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [filePath]);

  // Auto-restore diff view when returning to a tab with a changed file
  useEffect(() => {
    if (!filePath || !gitStatus || !cwd) return;

    // Calculate relative path for git status lookup
    const normalizedFilePath = filePath.replace(/\\/g, "/");
    const normalizedCwd = cwd.replace(/\\/g, "/");
    const relativePath = normalizedFilePath.startsWith(normalizedCwd + "/")
      ? normalizedFilePath.slice(normalizedCwd.length + 1)
      : normalizedFilePath;

    const fileStatus = gitStatus.get(relativePath);
    const hasGitChanges = fileStatus !== undefined;

    // If file has git changes and is modified, load diff view
    if (hasGitChanges && fileStatus.status === "modified") {
      // Only fetch diff if we're not already in diff mode for this file
      if (viewMode.type !== "diff") {
        fetchDiffForFile(filePath).then((diff) => {
          if (diff && diff.status === "modified") {
            setViewMode({ type: "diff", data: diff, showRaw: false });
          }
        });
      }
    } else if (viewMode.type === "diff" && !hasGitChanges) {
      // File no longer has changes, switch back to editor
      // Reload file from disk to ensure we have current state
      // (user may have made edits in diff view against intermediate state)
      if (filePath) {
        api
          .readFile(filePath)
          .then((content) => {
            setCurrentContent(content);
            setOriginalContent(content);
            setExternallyModified(false);
            setExternallyDeleted(false);

            // Force Monaco to update the model with disk content
            // DiffEditor and Editor use the same model path (file://${filePath})
            // so we need to explicitly update the model or it will show stale edits
            const modelUri = monaco.Uri.parse(`file://${filePath}`);
            const existingModel = monaco.editor.getModel(modelUri);
            if (existingModel && !existingModel.isDisposed()) {
              // Update model content to match disk (will trigger editor refresh)
              existingModel.setValue(content);
            }

            setViewMode({ type: "editor" });
          })
          .catch((error) => {
            console.error(
              "[EditorPane] Failed to reload file when exiting diff view:",
              error,
            );
            // Still switch to editor view even if reload fails
            setViewMode({ type: "editor" });
          });
      } else {
        setViewMode({ type: "editor" });
      }
    }
  }, [filePath, gitStatus, cwd, baseBranch, viewMode.type, fetchDiffForFile]);

  // Save file handler
  const handleSave = useCallback(async () => {
    if (!filePath || !hasUnsavedChanges || currentContent === undefined) {
      return;
    }

    // Check if file was externally modified before saving
    if (externallyModified && !externallyDeleted) {
      try {
        const diskContent = await api.readFile(filePath);
        // If disk content differs from what we last read, show warning
        if (diskContent !== originalContent) {
          setShowExternalChangeWarning(true);
          return; // Don't save yet
        }
      } catch (error) {
        console.error("Failed to check file before save:", error);
      }
    }

    try {
      await api.writeFile(filePath, currentContent);
      setOriginalContent(currentContent);
      setHasUnsavedChanges(false);
      setExternallyModified(false);
      setExternallyDeleted(false);
      setShowExternalChangeWarning(false);
      onSave?.();
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  }, [
    filePath,
    currentContent,
    hasUnsavedChanges,
    externallyModified,
    externallyDeleted,
    originalContent,
    onSave,
  ]);

  // Handler to reload file from disk (discard local changes)
  const handleReloadFromDisk = useCallback(async () => {
    if (!filePath) {
      return;
    }

    try {
      const content = await api.readFile(filePath);
      setCurrentContent(content);
      setOriginalContent(content);
      setHasUnsavedChanges(false);
      setExternallyModified(false);
      setExternallyDeleted(false);
      setShowExternalChangeWarning(false);
    } catch (error) {
      console.error("Failed to reload file:", error);
    }
  }, [filePath]);

  // Handler to dismiss warning and keep local changes
  const handleDismissWarning = useCallback(() => {
    setShowExternalChangeWarning(false);
  }, []);

  // Handler to save and overwrite external changes
  const handleSaveAnyway = useCallback(async () => {
    if (!filePath || currentContent === undefined) {
      return;
    }

    try {
      await api.writeFile(filePath, currentContent);
      setOriginalContent(currentContent);
      setHasUnsavedChanges(false);
      setExternallyModified(false);
      setExternallyDeleted(false);
      setShowExternalChangeWarning(false);
      onSave?.();
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  }, [filePath, currentContent, onSave]);

  // Find handler
  const handleFind = useCallback(() => {
    if (!editorRef.current) {
      return;
    }

    editorRef.current.focus();
    const action = editorRef.current.getAction("actions.find");
    if (action) {
      action.run();
    }
  }, []);

  const handleToggleTreeCollapse = useCallback(() => {
    // Enable animation when user manually toggles (prevents animation on mount/preview)
    setEnableTreeAnimation(true);
    setIsTreeCollapsed((prev) => !prev);
  }, []);

  // Keyboard handlers for save and find
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd/Ctrl+S: Save file
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        handleSave();
        return;
      }

      // Cmd/Ctrl+F: Find in file
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "f" &&
        hasOpenFile
      ) {
        event.preventDefault();
        handleFind();
        return;
      }

      // Cmd/Ctrl+B: Toggle tree visibility
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key === "b" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        if (layoutMode === "split") {
          handleToggleTreeCollapse();
        } else if (layoutMode === "single" && hasOpenFile) {
          setActiveView((prev) => (prev === "tree" ? "editor" : "tree"));
        }
        return;
      }

      // Cmd/Ctrl+Shift+E: Focus tree (expand if collapsed)
      if (
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        event.key === "E"
      ) {
        event.preventDefault();
        if (layoutMode === "split") {
          if (isTreeCollapsed) {
            // Enable animation when user expands via keyboard
            setEnableTreeAnimation(true);
            setIsTreeCollapsed(false);
          }
          // TODO: Focus tree element (would need a ref to the tree container)
        } else if (layoutMode === "single") {
          setActiveView("tree");
        }
        return;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    handleSave,
    handleFind,
    layoutMode,
    handleToggleTreeCollapse,
    hasOpenFile,
    isTreeCollapsed,
  ]);

  // Cleanup disposable on unmount
  useEffect(() => {
    return () => {
      if (disposableRef.current) {
        disposableRef.current.dispose();
        disposableRef.current = null;
      }
      editorRef.current = null;
    };
  }, []);

  // ResizeObserver to track container width
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        setContainerWidth(width);
      }
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  // Persist tree width to localStorage
  useEffect(() => {
    localStorage.setItem(
      `editor-pane-tree-width-${paneId}`,
      treeWidth.toString(),
    );
  }, [treeWidth, paneId]);

  // Persist collapsed state to localStorage
  useEffect(() => {
    localStorage.setItem(
      `editor-pane-tree-collapsed-${paneId}`,
      isTreeCollapsed.toString(),
    );
  }, [isTreeCollapsed, paneId]);

  useEffect(() => {
    // In split mode, always load the tree (even with a file open)
    // In single mode, only load when no file is open
    const shouldLoadTree = layoutMode === "split" || !hasOpenFile;

    if (!cwd || !shouldLoadTree) {
      return;
    }

    // Only clear directory cache when cwd actually changes (not when layoutMode changes)
    if (previousCwdRef.current !== cwd) {
      clearDirectoryCache();
      previousCwdRef.current = cwd;
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
  }, [cwd, hasOpenFile, layoutMode]);

  // Keep refs in sync with current values
  useEffect(() => {
    filePathRef.current = filePath;
    hasUnsavedChangesRef.current = hasUnsavedChanges;
    currentContentRef.current = currentContent;
  }, [filePath, hasUnsavedChanges, currentContent]);

  // File watcher subscription lifecycle
  useEffect(() => {
    if (!cwd) {
      return;
    }

    // Subscribe to file watcher
    console.log(
      `[EditorPane] Subscribing to file watcher: paneId=${paneId}, cwd=${cwd}`,
    );
    api.subscribeFileWatcher(cwd, paneId).catch((error) => {
      console.error("[EditorPane] Failed to subscribe to file watcher:", error);
    });

    // Set up event listeners
    const removeFileChangedListener = api.onFileChanged((payload) => {
      // Only handle events for this cwd
      if (payload.cwd !== cwd) {
        return;
      }

      // Invalidate the parent directory cache for this file
      handleFileChanged(payload.filePath, cwd);

      // Check if this is the currently open file
      if (filePathRef.current && payload.filePath === filePathRef.current) {
        console.log(
          `[EditorPane] File changed event: ${payload.relativePath}, type=${payload.eventType}`,
        );

        if (payload.eventType === "deleted") {
          console.log(
            `[EditorPane] File deleted externally: ${payload.relativePath}`,
          );
          // Clear any pending debounce timer
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
            debounceTimerRef.current = null;
          }
          setExternallyDeleted(true);
          setShowExternalChangeWarning(true);
        } else if (payload.eventType === "changed") {
          console.log(
            `[EditorPane] File modified externally: ${payload.relativePath}`,
          );
          setExternallyModified(true);

          // Debounce rapid changes (100ms)
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }

          debounceTimerRef.current = setTimeout(() => {
            debounceTimerRef.current = null;

            // Check if file still exists before reading
            const currentFilePath = filePathRef.current;
            if (!currentFilePath) return;

            api
              .fileExists(currentFilePath)
              .then((exists) => {
                if (!exists) {
                  // File was deleted during debounce
                  setExternallyDeleted(true);
                  setExternallyModified(false);
                  setShowExternalChangeWarning(true);
                  return;
                }

                // If editor has no unsaved changes, auto-reload
                if (!hasUnsavedChangesRef.current) {
                  console.log(
                    `[EditorPane] Auto-reloading file (clean editor): ${currentFilePath}`,
                  );
                  api
                    .readFile(currentFilePath)
                    .then((content) => {
                      console.log(
                        `[EditorPane] File reloaded successfully: ${currentFilePath}`,
                      );
                      setCurrentContent(content);
                      setOriginalContent(content);
                      setExternallyModified(false);
                      // If file was previously deleted but now exists, clear deletion flag
                      setExternallyDeleted(false);
                    })
                    .catch((error) => {
                      console.error(
                        "[EditorPane] Failed to reload file:",
                        error,
                      );
                      // If read fails, file might have been deleted
                      api.fileExists(currentFilePath).then((stillExists) => {
                        if (!stillExists) {
                          setExternallyDeleted(true);
                          setShowExternalChangeWarning(true);
                        }
                      });
                    });
                } else {
                  // Editor has unsaved changes, show warning
                  console.log(
                    `[EditorPane] Showing warning (dirty editor): ${currentFilePath}`,
                  );
                  setShowExternalChangeWarning(true);
                }
              })
              .catch((error) => {
                console.error("Failed to check file existence:", error);
              });
          }, 100);
        }
      }
    });

    const removeFileRenamedListener = api.onFileRenamed((payload) => {
      // Only handle events for this cwd
      if (payload.cwd !== cwd) {
        return;
      }

      // Invalidate parent directory caches for the rename
      handleFileRenamed(
        payload.oldPath,
        payload.newPath,
        payload.isDirectory,
        cwd,
      );

      // Check if the currently open file was renamed
      const currentFilePath = filePathRef.current;
      if (currentFilePath && payload.oldPath === currentFilePath) {
        console.log(
          `[EditorPane] File renamed: ${payload.oldRelativePath} → ${payload.newRelativePath}`,
        );

        // Update the file path without losing content or state
        // Use currentContentRef to avoid stale closure
        onFileChange?.({
          filePath: payload.newPath,
          language: inferLanguageFromFilePath(payload.newPath),
          content: currentContentRef.current || "", // Keep existing content
        });

        // Clear any external modification warnings
        setExternallyModified(false);
        setExternallyDeleted(false);
        setShowExternalChangeWarning(false);

        console.log(
          `[EditorPane] Editor updated to track renamed file: ${payload.newPath}`,
        );
      }
    });

    const removeTreeChangedListener = api.onTreeChanged((payload) => {
      // Only handle events for this cwd
      if (payload.cwd !== cwd) {
        return;
      }

      console.log(`[EditorPane] Tree changed event received for cwd=${cwd}`);

      // Invalidate the root directory cache
      invalidateDirectory(cwd, cwd);

      // Refresh the root file tree
      api
        .listDirectory(cwd)
        .then((tree) => {
          console.log(
            `[EditorPane] File tree refreshed successfully for cwd=${cwd}`,
          );
          setFileTree(tree);
          fileTreeCache.set(cwd, tree);
        })
        .catch((error) => {
          console.error("[EditorPane] Failed to refresh file tree:", error);
        });
    });

    // Cleanup on unmount or cwd change
    return () => {
      console.log(
        `[EditorPane] Cleaning up file watcher subscription: paneId=${paneId}, cwd=${cwd}`,
      );

      // Clear debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      // Unsubscribe from file watcher
      api.unsubscribeFileWatcher(cwd, paneId).catch((error) => {
        console.error(
          "[EditorPane] Failed to unsubscribe from file watcher:",
          error,
        );
      });

      // Remove event listeners
      removeFileChangedListener();
      removeFileRenamedListener();
      removeTreeChangedListener();
    };
    // Only re-run when cwd or paneId changes
    // filePath and hasUnsavedChanges are accessed via refs to avoid re-subscription
  }, [cwd, paneId]);

  // Clear external modification flags when switching files
  useEffect(() => {
    // Clear flags when filePath changes (user opened a different file)
    setExternallyModified(false);
    setExternallyDeleted(false);
    setShowExternalChangeWarning(false);

    // Clear any pending debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, [filePath]);

  const handleFileSelect = useCallback(
    async (node: FileTreeNode) => {
      if (node.type !== "file") {
        return;
      }

      try {
        const detectedLanguage = inferLanguageFromFilePath(node.path);

        const hasDiff = gitStatus && gitStatus.has(node.relativePath);

        if (hasDiff) {
          // Fetch diff data
          const diff = await fetchDiffForFile(node.path);

          if (diff) {
            // Set appropriate view mode based on diff status
            if (diff.status === "modified") {
              setViewMode({ type: "diff", data: diff, showRaw: false });
            } else {
              // Added/deleted files don't benefit from diff UI
              setViewMode({ type: "editor" });
            }

            // Update parent with the modified content
            onFileChange?.({
              filePath: node.path,
              language: detectedLanguage,
              content: diff.modifiedContent,
            });
          } else {
            // Fallback to regular file view if diff fetch fails
            const fileContent = await api.readFile(node.path);
            setViewMode({ type: "editor" });

            onFileChange?.({
              filePath: node.path,
              language: detectedLanguage,
              content: fileContent,
            });
          }
        } else {
          // Regular file view
          const fileContent = await api.readFile(node.path);
          setViewMode({ type: "editor" });

          onFileChange?.({
            filePath: node.path,
            language: detectedLanguage,
            content: fileContent,
          });
        }
      } catch (error) {
        console.error("Failed to open file:", error);
      }
    },
    [onFileChange, showOnlyChangedFiles, gitStatus, fetchDiffForFile],
  );

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      setCurrentContent(value);
      setHasUnsavedChanges(value !== originalContent);
    },
    [originalContent],
  );

  const handleDirectoryChange = useCallback(
    (newPath: string) => {
      onCwdChange?.(newPath);
    },
    [onCwdChange],
  );

  // Handle manual expansion/collapse of directories
  const handleManualExpansionToggle = useCallback(
    (path: string, isExpanded: boolean) => {
      setManuallyExpandedPaths((prev) => {
        const next = new Set(prev);
        if (isExpanded) {
          next.add(path);
        } else {
          next.delete(path);
        }
        // Persist to localStorage
        localStorage.setItem(
          `tree-manual-expanded-${paneId}`,
          JSON.stringify([...next]),
        );
        return next;
      });

      // When filtering is on, track manual collapses to override auto-expansion
      if (showOnlyChangedFiles) {
        setManuallyCollapsedPaths((prev) => {
          const next = new Set(prev);
          if (isExpanded) {
            // User expanded - remove from collapsed override
            next.delete(path);
          } else {
            // User collapsed - add to collapsed override
            next.add(path);
          }
          return next;
        });
      }
    },
    [paneId, showOnlyChangedFiles],
  );

  const handleNavigateUp = useCallback(() => {
    const parentDir = path.dirname(cwd);
    if (parentDir && parentDir !== cwd) {
      onCwdChange?.(parentDir);
    }
  }, [cwd, onCwdChange]);

  // Filter file tree by git status - only show directories that contain changes
  // Note: We only filter at the root level to decide which directories to show
  // DirectoryItem handles filtering its own children when they're loaded
  const filterTreeByGitStatus = useCallback(
    (
      nodes: FileTreeNode[],
      statusMap: Map<string, unknown>,
    ): FileTreeNode[] => {
      return nodes.filter((node) => {
        if (node.type === "file") {
          // Only show files that have git status
          return statusMap.has(node.relativePath);
        } else {
          // For directories, check if any changed files exist under this path
          const dirPath = node.relativePath;
          for (const [filePath] of statusMap) {
            if (
              filePath.startsWith(dirPath + "/") ||
              filePath.startsWith(dirPath + "\\")
            ) {
              return true;
            }
          }
          return false;
        }
      });
    },
    [],
  );

  // Helper to determine which folders should be expanded when filtering
  const getExpandedPaths = useCallback(
    (statusMap: Map<string, unknown>): Set<string> => {
      const expandedPaths = new Set<string>();

      // Derive all parent directory paths from the gitStatus map
      // This ensures we expand ALL directories containing changes, not just loaded ones
      for (const [filePath] of statusMap) {
        // For each changed file, add all its parent directories to expandedPaths
        const parts = filePath.split(/[/\\]/);

        // Build up the path progressively
        let currentPath = "";
        for (let i = 0; i < parts.length - 1; i++) {
          if (currentPath) {
            currentPath += "/" + parts[i];
          } else {
            currentPath = parts[i];
          }

          if (currentPath) {
            expandedPaths.add(currentPath);
          }
        }
      }

      return expandedPaths;
    },
    [],
  );

  // Apply git status filtering to file tree
  const displayedFileTree = useMemo(() => {
    if (!showOnlyChangedFiles || !gitStatus || gitStatus.size === 0) {
      return fileTree;
    }
    return filterTreeByGitStatus(fileTree, gitStatus);
  }, [fileTree, showOnlyChangedFiles, gitStatus, filterTreeByGitStatus]);

  // Compute paths that should be auto-expanded when filtering
  const autoExpandedPaths = useMemo(() => {
    if (!showOnlyChangedFiles || !gitStatus || gitStatus.size === 0) {
      return new Set<string>();
    }
    return getExpandedPaths(gitStatus);
  }, [showOnlyChangedFiles, gitStatus, getExpandedPaths]);

  // Combine manual and auto expanded paths
  const expandedPaths = useMemo(() => {
    if (showOnlyChangedFiles) {
      // When filtering, combine manually and auto-expanded paths,
      // but exclude paths that were manually collapsed
      const combined = new Set([
        ...manuallyExpandedPaths,
        ...autoExpandedPaths,
      ]);
      for (const path of manuallyCollapsedPaths) {
        combined.delete(path);
      }
      return combined;
    }
    // When not filtering, only show manually expanded paths
    return manuallyExpandedPaths;
  }, [
    showOnlyChangedFiles,
    manuallyExpandedPaths,
    autoExpandedPaths,
    manuallyCollapsedPaths,
  ]);

  const handleEditorMount = useCallback(
    (editor: monaco.editor.IStandaloneCodeEditor) => {
      // Clean up previous disposable if it exists
      if (disposableRef.current) {
        disposableRef.current.dispose();
        disposableRef.current = null;
      }

      // Reset state when remounting
      setCanUndo(false);
      setCanRedo(false);

      editorRef.current = editor;

      // Ensure correct language is set for the file
      const model = editor.getModel();
      if (model && filePath) {
        const correctLanguage = inferLanguageFromFilePath(filePath);
        if (model.getLanguageId() !== correctLanguage) {
          try {
            monaco.editor.setModelLanguage(model, correctLanguage);
          } catch (error) {
            console.error("[Monaco] Error setting language:", error);
          }
        }
      }

      // Update undo/redo state when editor content changes
      const updateUndoRedoState = () => {
        const model = editor.getModel();
        if (model) {
          setCanUndo(model.canUndo());
          setCanRedo(model.canRedo());
        } else {
          // Model is null/undefined, disable both buttons
          setCanUndo(false);
          setCanRedo(false);
        }
      };

      // Initial state
      updateUndoRedoState();

      // Listen for content changes to update undo/redo state
      disposableRef.current = editor.onDidChangeModelContent(() => {
        updateUndoRedoState();
      });
    },
    [filePath],
  );

  const handleDiffEditorMount = useCallback(
    (diffEditor: monaco.editor.IStandaloneDiffEditor) => {
      // Clean up previous disposable if it exists
      if (disposableRef.current) {
        disposableRef.current.dispose();
        disposableRef.current = null;
      }

      // Reset state when remounting
      setCanUndo(false);
      setCanRedo(false);

      // Get the modified (right side) editor - this is the editable one
      const modifiedEditor = diffEditor.getModifiedEditor();
      editorRef.current = modifiedEditor;

      // Ensure correct language is set for the file
      const model = modifiedEditor.getModel();
      if (model && filePath) {
        const correctLanguage = inferLanguageFromFilePath(filePath);
        if (model.getLanguageId() !== correctLanguage) {
          try {
            monaco.editor.setModelLanguage(model, correctLanguage);
          } catch (error) {
            console.error("[Monaco] Error setting language:", error);
          }
        }
      }

      // Update undo/redo state when editor content changes
      const updateUndoRedoState = () => {
        const model = modifiedEditor.getModel();
        if (model && !model.isDisposed()) {
          setCanUndo(model.canUndo());
          setCanRedo(model.canRedo());
        } else {
          setCanUndo(false);
          setCanRedo(false);
        }
      };

      // Initial state
      updateUndoRedoState();

      // Listen for content changes in the modified editor
      disposableRef.current = modifiedEditor.onDidChangeModelContent(() => {
        const newValue = modifiedEditor.getValue();
        handleEditorChange(newValue);
        updateUndoRedoState();
      });

      // Automatically scroll to the first diff after a short delay
      // to ensure diff computation is complete
      setTimeout(() => {
        try {
          diffEditor.revealFirstDiff();
        } catch (error) {
          // Silently ignore if diff editor was disposed during timeout
          console.debug("[DiffEditor] Could not reveal first diff:", error);
        }
      }, 100);
    },
    [filePath, handleEditorChange],
  );

  const handleUndo = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.trigger("keyboard", "undo", null);
    }
  }, []);

  const handleRedo = useCallback(() => {
    if (editorRef.current) {
      editorRef.current.trigger("keyboard", "redo", null);
    }
  }, []);

  // Diff viewer handlers
  const handleToggleRawView = useCallback(() => {
    if (viewMode.type === "diff") {
      setViewMode({ ...viewMode, showRaw: !viewMode.showRaw });
    }
  }, [viewMode]);

  const handleRevertFile = useCallback(async () => {
    if (!filePath || viewMode.type !== "diff") return;

    const confirmed = confirm(
      `Are you sure you want to revert all changes to ${path.basename(filePath)}?`,
    );
    if (!confirmed) return;

    try {
      // Write the original content back to the file
      if (viewMode.data.originalContent !== undefined) {
        await api.writeFile(filePath, viewMode.data.originalContent);
        // Reload the file to show the reverted content
        const fileContent = await api.readFile(filePath);
        onFileChange?.({
          filePath,
          language: currentLanguage || "plaintext",
          content: fileContent,
        });
        setViewMode({ type: "editor" });
      }
    } catch (error) {
      console.error("Failed to revert file:", error);
    }
  }, [filePath, viewMode, currentLanguage, onFileChange]);

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }

      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = e.clientX - containerRect.left;

      // Constraints: min/max tree width
      const maxWidth = Math.min(
        MAX_TREE_WIDTH,
        containerWidth * TREE_MAX_WIDTH_PERCENTAGE,
      );
      const constrainedWidth = Math.max(
        MIN_TREE_WIDTH,
        Math.min(maxWidth, newWidth),
      );

      setTreeWidth(constrainedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing, containerWidth]);

  const canNavigateUp = useMemo(() => {
    const parentDir = path.dirname(cwd);
    return parentDir !== cwd && parentDir !== ".";
  }, [cwd]);

  // Display path for the cwd (file tree header)
  const displayCwd = useMemo(() => {
    if (!homeDirectory) {
      return cwd;
    }

    const normalizedPath = cwd.replace(/\\/g, "/");
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

    return cwd;
  }, [cwd, homeDirectory]);

  // Display path for the file (editor header) - relative to cwd
  const displayFilePath = useMemo(() => {
    if (!filePath) {
      return "";
    }

    const normalizedFilePath = filePath.replace(/\\/g, "/");
    const normalizedCwd = cwd.replace(/\\/g, "/");

    const cwdWithSlash = normalizedCwd.endsWith("/")
      ? normalizedCwd
      : `${normalizedCwd}/`;

    if (normalizedFilePath.startsWith(cwdWithSlash)) {
      return normalizedFilePath.slice(cwdWithSlash.length);
    }

    // If file is not under cwd, show full path with ~ substitution
    if (!homeDirectory) {
      return filePath;
    }

    const normalizedHome = homeDirectory.replace(/\\/g, "/");
    const homeWithSlash = normalizedHome.endsWith("/")
      ? normalizedHome
      : `${normalizedHome}/`;

    if (normalizedFilePath.startsWith(homeWithSlash)) {
      const suffix = normalizedFilePath.slice(homeWithSlash.length);
      return suffix ? `~/${suffix}` : "~";
    }

    return filePath;
  }, [filePath, cwd, homeDirectory]);

  return (
    <div
      ref={containerRef}
      className="flex flex-1 min-h-0 min-w-0 flex-col bg-background relative"
    >
      {/* Wrapper that contains both split and single mode layouts */}
      <div className="flex flex-1 min-h-0 min-w-0 flex-col">
        {layoutMode === "split" ? (
          // Split Mode Layout
          <>
            {/* Headers row */}
            <div className="flex items-stretch border-b border-border">
              {/* Tree header */}
              {!isTreeCollapsed && (
                <>
                  <div
                    className={`flex items-center justify-between px-3 py-1.5 bg-elevated text-[13px] ${transitionClass}`}
                    style={{ width: `${treeWidth}px` }}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <button
                        type="button"
                        onClick={handleToggleTreeCollapse}
                        className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
                        title="Collapse tree"
                      >
                        <PanelLeftClose size={14} />
                      </button>
                      <span className="truncate" title={cwd}>
                        {displayCwd}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {canNavigateUp && !isLocked && (
                        <button
                          type="button"
                          onClick={handleNavigateUp}
                          className="p-1 rounded hover:bg-foreground/10 transition-colors"
                          title="Go up one directory"
                        >
                          <FolderUp size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Vertical divider - matches content divider width */}
                  <div className="w-px h-full bg-border" />
                </>
              )}

              {/* Editor header */}
              <div className="flex flex-1 items-center justify-between px-3 py-1.5 bg-elevated text-[13px]">
                <div className="flex items-center gap-2 truncate">
                  {isTreeCollapsed && (
                    <>
                      <button
                        type="button"
                        onClick={handleToggleTreeCollapse}
                        className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
                        title="Expand tree"
                      >
                        <PanelLeftOpen size={14} />
                      </button>
                      <div className="h-4 w-px bg-white/10 shrink-0" />
                    </>
                  )}
                  {hasUnsavedChanges && (
                    <div
                      className="w-2 h-2 rounded-full bg-blue-500 shrink-0"
                      title="Unsaved changes"
                    />
                  )}
                  <span className="truncate" title={filePath || ""}>
                    {displayFilePath}
                  </span>
                  {hasOpenFile && (
                    <>
                      <Separator
                        orientation="vertical"
                        className="h-4 mx-1 bg-elevated-border"
                      />
                      <EditorToolbarButtons
                        mode={viewMode.type}
                        variant="split"
                        diffData={
                          viewMode.type === "diff" ? viewMode.data : undefined
                        }
                        showRaw={
                          viewMode.type === "diff" ? viewMode.showRaw : false
                        }
                        baseBranch={baseBranch}
                        canUndo={canUndo}
                        canRedo={canRedo}
                        hasUnsavedChanges={hasUnsavedChanges}
                        onToggleRawView={handleToggleRawView}
                        onRevert={handleRevertFile}
                        onUndo={handleUndo}
                        onRedo={handleRedo}
                        onSave={handleSave}
                        onFind={handleFind}
                      />
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closePaneCmd.execute}
                  disabled={closePaneCmd.disabled}
                  className="p-1 rounded hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Close Pane"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Warning banner for external modifications */}
            {showExternalChangeWarning && hasOpenFile && (
              <div className="bg-warning border-b border-warning-border px-3 py-2 relative">
                <button
                  type="button"
                  onClick={handleDismissWarning}
                  className="absolute top-2 right-2 p-1 rounded hover:bg-white/20 text-warning-foreground transition-colors"
                  title="Dismiss"
                >
                  <X size={16} />
                </button>
                <div className="flex items-center gap-2 text-sm pr-8">
                  <div className="flex items-center gap-2 text-warning-foreground">
                    {externallyDeleted ? (
                      <span>
                        This file was deleted externally. Your unsaved changes
                        will be lost unless you save to recreate the file.
                      </span>
                    ) : (
                      <span>This file was modified externally.</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-auto">
                    {!externallyDeleted && (
                      <button
                        type="button"
                        onClick={handleReloadFromDisk}
                        className="px-3 py-1 text-xs rounded bg-warning-button hover:bg-warning-button-hover text-white transition-colors"
                      >
                        Reload from disk
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveAnyway}
                      className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                    >
                      {externallyDeleted ? "Save anyway" : "Keep my changes"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          // Single Mode Layout
          <>
            <div className="flex items-center justify-between px-3 py-1.5 bg-elevated text-[13px] border-b border-white/10">
              <div className="flex items-center gap-2 truncate">
                {activeView === "editor" && hasOpenFile && (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveView("tree")}
                      className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
                      title="Show tree"
                    >
                      <ChevronRight size={14} />
                    </button>
                    <div className="h-4 w-px bg-white/10 shrink-0" />
                  </>
                )}
                {hasUnsavedChanges && activeView === "editor" && (
                  <div
                    className="w-2 h-2 rounded-full bg-blue-500 shrink-0"
                    title="Unsaved changes"
                  />
                )}
                <span
                  className="truncate"
                  title={activeView === "editor" ? filePath || "" : cwd}
                >
                  {activeView === "editor" ? displayFilePath : displayCwd}
                </span>
                {activeView === "editor" && hasOpenFile ? (
                  <>
                    <div className="h-4 w-px bg-white/10 shrink-0" />
                    <EditorToolbarButtons
                      mode={viewMode.type}
                      variant="single"
                      diffData={
                        viewMode.type === "diff" ? viewMode.data : undefined
                      }
                      showRaw={
                        viewMode.type === "diff" ? viewMode.showRaw : false
                      }
                      baseBranch={baseBranch}
                      canUndo={canUndo}
                      canRedo={canRedo}
                      hasUnsavedChanges={hasUnsavedChanges}
                      onToggleRawView={handleToggleRawView}
                      onRevert={handleRevertFile}
                      onUndo={handleUndo}
                      onRedo={handleRedo}
                      onSave={handleSave}
                      onFind={handleFind}
                    />
                  </>
                ) : (
                  <>
                    <div className="h-4 w-px bg-white/10 shrink-0" />
                    <div className="flex items-center gap-1 shrink-0">
                      {canNavigateUp && !isLocked && (
                        <button
                          type="button"
                          onClick={handleNavigateUp}
                          className="p-1 rounded hover:bg-foreground/10 transition-colors shrink-0"
                          title="Go up one directory"
                        >
                          <FolderUp size={14} />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={closePaneCmd.execute}
                disabled={closePaneCmd.disabled}
                className="p-1 rounded hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                title="Close Pane"
              >
                <X size={14} className="text-white/60" />
              </button>
            </div>

            {/* Warning banner for external modifications */}
            {showExternalChangeWarning && hasOpenFile && (
              <div className="bg-warning border-b border-warning-border px-3 py-2 relative">
                <button
                  type="button"
                  onClick={handleDismissWarning}
                  className="absolute top-2 right-2 p-1 rounded hover:bg-white/20 text-warning-foreground transition-colors"
                  title="Dismiss"
                >
                  <X size={16} />
                </button>
                <div className="flex items-center gap-2 text-sm pr-8">
                  <div className="flex items-center gap-2 text-warning-foreground">
                    {externallyDeleted ? (
                      <span>
                        This file was deleted externally. Your unsaved changes
                        will be lost unless you save to recreate the file.
                      </span>
                    ) : (
                      <span>This file was modified externally.</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-auto">
                    {!externallyDeleted && (
                      <button
                        type="button"
                        onClick={handleReloadFromDisk}
                        className="px-3 py-1 text-xs rounded bg-warning-button hover:bg-warning-button-hover text-white transition-colors"
                      >
                        Reload from disk
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveAnyway}
                      className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                    >
                      {externallyDeleted ? "Save anyway" : "Keep my changes"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Content row - shared between split and single modes */}
        <div className="flex flex-1 min-h-0 min-w-0">
          {/* Tree section - single instance */}
          <div
            className={`flex flex-col ${layoutMode === "split" ? transitionClass : ""}`}
            style={{
              // Split mode: fixed width or collapsed
              // Single mode: full width or hidden based on activeView
              ...(layoutMode === "split"
                ? {
                    width: isTreeCollapsed ? "0px" : `${treeWidth}px`,
                    display: isTreeCollapsed ? "none" : "flex",
                  }
                : {
                    width: "100%",
                    display: activeView === "tree" ? "flex" : "none",
                  }),
            }}
          >
            <div className="flex-1 overflow-auto p-2">
              {isLoadingTree ? (
                <div className="flex items-center justify-center w-full text-white/70">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : displayedFileTree.length > 0 ? (
                <FileTree
                  items={displayedFileTree}
                  gitStatus={gitStatus}
                  onFileSelect={handleFileSelect}
                  onDirectoryChange={handleDirectoryChange}
                  onFileOpen={onFileOpen}
                  rootPath={cwd}
                  expandedPaths={expandedPaths}
                  onManualExpansionToggle={handleManualExpansionToggle}
                  isFiltering={showOnlyChangedFiles}
                />
              ) : (
                <div className="flex items-center justify-center w-full text-white/50">
                  {showOnlyChangedFiles ? (
                    <span className="italic">
                      No changed files in this repository
                    </span>
                  ) : (
                    "No files found"
                  )}
                </div>
              )}
            </div>
            {isInGitRepo && (
              <GitBranchToolbar
                currentBranch={currentBranch}
                baseBranch={baseBranch}
                onOpenBranchPicker={
                  branches.length > 0
                    ? () => setIsBranchSelectorOpen(true)
                    : undefined
                }
                showOnlyChangedFiles={showOnlyChangedFiles}
                onFilterToggle={() => {
                  const newMode: EditorTreeMode = showOnlyChangedFiles
                    ? "all"
                    : "changes";
                  setShowOnlyChangedFiles(!showOnlyChangedFiles);
                  onTreeModeChange?.(newMode);
                }}
              />
            )}
          </div>

          {/* Resize handle - only in split mode */}
          {layoutMode === "split" && !isTreeCollapsed && (
            <div className="relative flex items-center justify-center w-px">
              {/* Always-visible thin border */}
              <div className="absolute w-px h-full bg-border" />
              {/* Wider interactive handle that highlights on hover */}
              <div
                className={`w-1 absolute h-full cursor-col-resize transition-colors z-10 ${resizeHandleClass}`}
                onMouseDown={handleResizeStart}
              />
            </div>
          )}

          {/* Editor section - visible in split mode always, visible in single mode when activeView is editor */}
          <div
            className="flex flex-1 min-h-0 min-w-0"
            style={{
              display:
                layoutMode === "split"
                  ? "flex"
                  : activeView === "editor"
                    ? "flex"
                    : "none",
            }}
          >
            {hasOpenFile ? (
              <>
                {viewMode.type === "diff" && !viewMode.showRaw ? (
                  // Show diff editor when in diff mode
                  viewMode.data.isBinary ? (
                    // Binary file indicator
                    <div className="flex flex-1 items-center justify-center bg-background text-muted-foreground">
                      <div className="text-center">
                        <div className="text-lg mb-2">Binary file</div>
                        <div className="text-sm">
                          Cannot display diff for binary files
                        </div>
                      </div>
                    </div>
                  ) : viewMode.data.status === "deleted" ? (
                    // Show deleted file content
                    <Editor
                      key={`${paneId}-${filePath}-deleted`}
                      path={filePath ? `file://${filePath}` : undefined}
                      value={viewMode.data.originalContent}
                      language={detectedLanguage}
                      theme={editorTheme}
                      options={{
                        minimap: { enabled: false },
                        smoothScrolling: true,
                        scrollBeyondLastLine: false,
                        lineNumbers: "on",
                        automaticLayout: true,
                        wordWrap: "on",
                        fontSize: 13,
                        readOnly: true,
                      }}
                      loading={
                        <div className="flex h-full w-full items-center justify-center">
                          Loading diff...
                        </div>
                      }
                    />
                  ) : (
                    // Show diff editor for modified/added files
                    <DiffEditor
                      key={`${paneId}-${filePath}-diff`}
                      originalModelPath={
                        filePath ? `inmemory://original${filePath}` : undefined
                      }
                      modifiedModelPath={
                        filePath ? `file://${filePath}` : undefined
                      }
                      original={viewMode.data.originalContent}
                      modified={viewMode.data.modifiedContent}
                      language={detectedLanguage}
                      theme={editorTheme}
                      keepCurrentOriginalModel={true}
                      keepCurrentModifiedModel={true}
                      onMount={handleDiffEditorMount}
                      options={{
                        minimap: { enabled: false },
                        smoothScrolling: true,
                        scrollBeyondLastLine: false,
                        lineNumbers: "on",
                        automaticLayout: true,
                        wordWrap: "on",
                        fontSize: 13,
                        readOnly: false,
                        renderSideBySide: true,
                      }}
                      loading={
                        <div className="flex h-full w-full items-center justify-center">
                          Loading diff...
                        </div>
                      }
                    />
                  )
                ) : (
                  // Regular editor
                  <Editor
                    key={`${paneId}-${filePath}`}
                    path={filePath ? `file://${filePath}` : undefined}
                    value={currentContent}
                    onChange={handleEditorChange}
                    onMount={handleEditorMount}
                    language={detectedLanguage}
                    theme={editorTheme}
                    options={{
                      minimap: { enabled: false },
                      smoothScrolling: true,
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      fontSize: 13,
                      // Default settings
                      lineNumbers:
                        detectedLanguage === "markdown" ? "off" : "on",
                      wordWrap: "on",
                      // Markdown-specific enhancements
                      ...(detectedLanguage === "markdown" && {
                        glyphMargin: false, // Hide glyph margin
                        folding: true, // Enable section folding
                        links: true, // Enable clickable links (Cmd+Click)
                        colorDecorators: true, // Show color decorators
                        renderWhitespace: "none", // Hide whitespace markers
                        padding: { top: 16, bottom: 16 }, // Extra padding for readability
                      }),
                    }}
                    loading={
                      <div className="flex h-full w-full items-center justify-center">
                        Loading file...
                      </div>
                    }
                  />
                )}
              </>
            ) : (
              <div className="flex flex-1 bg-background" />
            )}
          </div>
        </div>
      </div>

      {!hideIndividualSandboxIndicator && (
        <SandboxIndicator
          agentSessionId={agentSessionId ?? null}
          onCompleteAgentSession={handleCompleteAgentSession}
          onDeleteAgentSession={handleDeleteAgentSession}
        />
      )}

      <BranchSelector
        open={isBranchSelectorOpen}
        branches={branches}
        currentBaseBranch={baseBranch}
        onSelectBranch={handleBranchSelect}
        onOpenChange={setIsBranchSelectorOpen}
      />
    </div>
  );
}
