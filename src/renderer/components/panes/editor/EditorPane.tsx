import { BranchSelector } from "@/components/panes/editor/BranchSelector";
import { FileTree } from "@/components/panes/editor/tree/FileTree";
import { SandboxIndicator } from "@/components/panes/terminal/SandboxIndicator";
import { useGitStatus } from "@/hooks/useGitStatus";
import { useSandboxHandlers } from "@/hooks/useSandboxHandlers";
import { tabsAtom, userSettingsAtom } from "@/store/atoms";
import Editor, { loader } from "@monaco-editor/react";
import type { FileTreeNode } from "@shared/types";
import { useAtomValue } from "jotai";
import {
  ChevronLeft,
  ChevronRight,
  FolderUp,
  GitBranch,
  Loader2,
  Redo,
  Save,
  Search,
  Undo,
  X,
} from "lucide-react";
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
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/language/css/monaco.contribution";
import "monaco-editor/esm/vs/language/html/monaco.contribution";
import "monaco-editor/esm/vs/language/json/monaco.contribution";
import "monaco-editor/esm/vs/language/typescript/monaco.contribution";
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
  paneId: string;
  agentSessionId?: string | null;
  onFileChange?: (fileData: {
    filePath: string;
    language: string;
    content: string;
  }) => void;
  onClearFile?: () => void;
  onCwdChange?: (cwd: string) => void;
  onFileOpen?: (node: FileTreeNode) => void;
  isLocked?: boolean;
  onSave?: () => void;
  hideIndividualSandboxIndicator?: boolean;
};

export function EditorPane({
  cwd,
  filePath,
  paneId,
  agentSessionId,
  onFileChange,
  onClearFile: _onClearFile,
  onCwdChange,
  onFileOpen,
  isLocked = false,
  onSave,
  hideIndividualSandboxIndicator = false,
}: EditorPaneProps) {
  const { homeDirectory } = useAtomValue(userSettingsAtom);
  const tabs = useAtomValue(tabsAtom);
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

  // File watcher state
  const [externallyModified, setExternallyModified] = useState(false);
  const [externallyDeleted, setExternallyDeleted] = useState(false);
  const [showExternalChangeWarning, setShowExternalChangeWarning] =
    useState(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Git status integration
  const {
    gitStatus,
    baseBranch,
    branches,
    isBranchSelectorOpen,
    isInGitRepo,
    setIsBranchSelectorOpen,
    handleBranchSelect,
  } = useGitStatus(cwd);

  const [showOnlyChangedFiles] = useState(false);

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
  const transitionClass =
    prefersReducedMotion || isResizing
      ? "transition-none"
      : "transition-all duration-200 ease-out";
  const transitionTransformClass = prefersReducedMotion
    ? "transition-none"
    : "transition-transform duration-200 ease-out";

  // Resize handle highlight class (matches pane resize behavior)
  const resizeHandleClass = isResizing
    ? "bg-blue-500/60"
    : "bg-transparent hover:bg-blue-500/40";

  // In single mode, auto-switch to editor when file is opened or changed
  useEffect(() => {
    if (layoutMode === "single" && hasOpenFile) {
      setActiveView("editor");
    }
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
      }
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

      // Check if this is the currently open file
      if (filePath && payload.filePath === filePath) {
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
            api
              .fileExists(filePath)
              .then((exists) => {
                if (!exists) {
                  // File was deleted during debounce
                  setExternallyDeleted(true);
                  setExternallyModified(false);
                  setShowExternalChangeWarning(true);
                  return;
                }

                // If editor has no unsaved changes, auto-reload
                if (!hasUnsavedChanges) {
                  console.log(
                    `[EditorPane] Auto-reloading file (clean editor): ${filePath}`,
                  );
                  api
                    .readFile(filePath)
                    .then((content) => {
                      console.log(
                        `[EditorPane] File reloaded successfully: ${filePath}`,
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
                      api.fileExists(filePath).then((stillExists) => {
                        if (!stillExists) {
                          setExternallyDeleted(true);
                          setShowExternalChangeWarning(true);
                        }
                      });
                    });
                } else {
                  // Editor has unsaved changes, show warning
                  console.log(
                    `[EditorPane] Showing warning (dirty editor): ${filePath}`,
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

      // Check if the currently open file was renamed
      if (filePath && payload.oldPath === filePath) {
        console.log(
          `[EditorPane] File renamed: ${payload.oldRelativePath} → ${payload.newRelativePath}`,
        );

        // Update the file path without losing content or state
        onFileChange?.({
          filePath: payload.newPath,
          language: inferLanguageFromFilePath(payload.newPath),
          content: currentContent, // Keep existing content
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

      // Refresh the file tree
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
  }, [cwd, paneId, filePath, hasUnsavedChanges]);

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
    [onFileChange],
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

  const handleNavigateUp = useCallback(() => {
    const parentDir = path.dirname(cwd);
    if (parentDir && parentDir !== cwd) {
      onCwdChange?.(parentDir);
    }
  }, [cwd, onCwdChange]);

  // Filter file tree by git status
  const filterTreeByGitStatus = useCallback(
    (
      nodes: FileTreeNode[],
      statusMap: Map<string, unknown>,
    ): FileTreeNode[] => {
      return nodes
        .map((node) => {
          if (node.type === "file") {
            return statusMap.has(node.relativePath) ? node : null;
          } else {
            // Recursively filter children
            const filteredChildren = node.children
              ? filterTreeByGitStatus(node.children, statusMap)
              : [];

            if (filteredChildren.length > 0) {
              return { ...node, children: filteredChildren };
            }
            return null;
          }
        })
        .filter((node): node is FileTreeNode => node !== null);
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
    [],
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
    <div
      ref={containerRef}
      className="flex flex-1 min-h-0 min-w-0 flex-col bg-background"
    >
      {layoutMode === "split" ? (
        // Split Mode Layout
        <>
          {/* Headers row */}
          <div className="flex items-stretch border-b border-white/10">
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
                      <ChevronLeft size={14} className="text-white/60" />
                    </button>
                    <span className="truncate" title={cwd}>
                      {displayPath}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {canNavigateUp && !isLocked && (
                      <button
                        type="button"
                        onClick={handleNavigateUp}
                        className="p-1 rounded hover:bg-white/10 transition-colors"
                        title="Go up one directory"
                      >
                        <FolderUp size={14} className="text-white/60" />
                      </button>
                    )}
                    {isInGitRepo && branches.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setIsBranchSelectorOpen(true)}
                        className={`p-1 rounded transition-colors ${
                          baseBranch
                            ? "bg-white/20 hover:bg-white/25"
                            : "hover:bg-white/10"
                        }`}
                        title={
                          baseBranch
                            ? `Comparing to: ${baseBranch}`
                            : "Comparing to: HEAD (uncommitted changes)"
                        }
                      >
                        <GitBranch size={14} className="text-white/60" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Vertical divider - matches content divider width */}
                <div
                  style={{ width: "4px" }}
                  className="flex items-center justify-center"
                >
                  <div className="w-px h-full bg-white/10" />
                </div>
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
                      <ChevronRight size={14} className="text-white/60" />
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
                  {filePath ? displayPath : ""}
                </span>
                {hasOpenFile && (
                  <>
                    <div className="h-4 w-px bg-white/10 shrink-0" />
                    <button
                      type="button"
                      onClick={handleUndo}
                      disabled={!canUndo}
                      className="p-1 rounded hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Undo"
                    >
                      <Undo size={14} className="text-white/60" />
                    </button>
                    <button
                      type="button"
                      onClick={handleRedo}
                      disabled={!canRedo}
                      className="p-1 rounded hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Redo"
                    >
                      <Redo size={14} className="text-white/60" />
                    </button>
                    <div className="h-4 w-px bg-white/10 shrink-0" />
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={!hasUnsavedChanges}
                      className="p-1 rounded hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Save"
                    >
                      <Save size={14} className="text-white/60" />
                    </button>
                    <button
                      type="button"
                      onClick={handleFind}
                      className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
                      title="Find in file (Ctrl+F)"
                    >
                      <Search size={14} className="text-white/60" />
                    </button>
                  </>
                )}
              </div>
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

          {/* Content row */}
          <div className="flex flex-1 min-h-0 min-w-0">
            {/* Tree section */}
            {!isTreeCollapsed && (
              <>
                <div
                  className={`flex flex-col overflow-auto p-2 ${transitionClass}`}
                  style={{ width: `${treeWidth}px` }}
                >
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
                    />
                  ) : (
                    <div className="flex items-center justify-center w-full text-white/50">
                      No files found
                    </div>
                  )}
                </div>

                {/* Resize handle - matches pane divider behavior */}
                <div
                  className="relative flex items-center justify-center"
                  style={{ width: "4px" }}
                >
                  {/* Always-visible thin border */}
                  <div className="absolute w-px h-full bg-white/10" />
                  {/* Wider interactive handle that highlights on hover */}
                  <div
                    className={`w-1 h-full cursor-col-resize transition-colors z-10 ${resizeHandleClass}`}
                    onMouseDown={handleResizeStart}
                  />
                </div>
              </>
            )}

            {/* Editor section */}
            <div className="flex flex-1 min-h-0 min-w-0">
              {hasOpenFile ? (
                <Editor
                  key={`${paneId}-${filePath}`}
                  value={currentContent}
                  onChange={handleEditorChange}
                  onMount={handleEditorMount}
                  language={currentLanguage}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    smoothScrolling: true,
                    scrollBeyondLastLine: false,
                    lineNumbers: "on",
                    automaticLayout: true,
                    wordWrap: "on",
                  }}
                  loading={
                    <div className="flex h-full w-full items-center justify-center">
                      Loading file...
                    </div>
                  }
                />
              ) : (
                <div className="flex flex-1 bg-background" />
              )}
            </div>
          </div>
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
                    <ChevronRight size={14} className="text-white/60" />
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
                {activeView === "editor" && filePath
                  ? displayPath
                  : displayPath}
              </span>
              {activeView === "editor" && hasOpenFile ? (
                <>
                  <div className="h-4 w-px bg-white/10 shrink-0" />
                  <button
                    type="button"
                    onClick={handleUndo}
                    disabled={!canUndo}
                    className="p-1 rounded hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Undo"
                  >
                    <Undo size={14} className="text-white/60" />
                  </button>
                  <button
                    type="button"
                    onClick={handleRedo}
                    disabled={!canRedo}
                    className="p-1 rounded hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Redo"
                  >
                    <Redo size={14} className="text-white/60" />
                  </button>
                  <div className="h-4 w-px bg-white/10 shrink-0" />
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!hasUnsavedChanges}
                    className="p-1 rounded hover:bg-white/10 transition-colors shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Save"
                  >
                    <Save size={14} className="text-white/60" />
                  </button>
                  <button
                    type="button"
                    onClick={handleFind}
                    className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
                    title="Find in file (Ctrl+F)"
                  >
                    <Search size={14} className="text-white/60" />
                  </button>
                </>
              ) : (
                <>
                  <div className="h-4 w-px bg-white/10 shrink-0" />
                  <div className="flex items-center gap-1 shrink-0">
                    {canNavigateUp && !isLocked && (
                      <button
                        type="button"
                        onClick={handleNavigateUp}
                        className="p-1 rounded hover:bg-white/10 transition-colors shrink-0"
                        title="Go up one directory"
                      >
                        <FolderUp size={14} className="text-white/60" />
                      </button>
                    )}
                    {isInGitRepo && branches.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setIsBranchSelectorOpen(true)}
                        className={`p-1 rounded transition-colors ${
                          baseBranch
                            ? "bg-white/20 hover:bg-white/25"
                            : "hover:bg-white/10"
                        }`}
                        title={
                          baseBranch
                            ? `Comparing to: ${baseBranch}`
                            : "Comparing to: HEAD (uncommitted changes)"
                        }
                      >
                        <GitBranch size={14} className="text-white/60" />
                      </button>
                    )}
                  </div>
                </>
              )}
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

          <div className="flex flex-1 min-h-0 min-w-0 relative overflow-hidden">
            {/* Tree view */}
            <div
              className={`absolute inset-0 ${transitionTransformClass} ${
                activeView === "tree" ? "translate-x-0" : "-translate-x-full"
              }`}
            >
              <div className="flex flex-1 h-full overflow-auto p-2">
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
                  />
                ) : (
                  <div className="flex items-center justify-center w-full text-white/50">
                    No files found
                  </div>
                )}
              </div>
            </div>

            {/* Editor view */}
            {hasOpenFile && (
              <div
                className={`absolute inset-0 ${transitionTransformClass} ${
                  activeView === "editor" ? "translate-x-0" : "translate-x-full"
                }`}
              >
                <Editor
                  key={`${paneId}-${filePath}`}
                  value={currentContent}
                  onChange={handleEditorChange}
                  onMount={handleEditorMount}
                  language={currentLanguage}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: false },
                    smoothScrolling: true,
                    scrollBeyondLastLine: false,
                    lineNumbers: "on",
                    automaticLayout: true,
                    wordWrap: "on",
                  }}
                  loading={
                    <div className="flex h-full w-full items-center justify-center text-white/70">
                      Loading file...
                    </div>
                  }
                />
              </div>
            )}
          </div>
        </>
      )}
      {!hideIndividualSandboxIndicator && (
        <SandboxIndicator
          agentSessionId={agentSessionId ?? null}
          onCompleteAgentSession={handleCompleteAgentSession}
          onDeleteAgentSession={handleDeleteAgentSession}
        />
      )}
      {isBranchSelectorOpen && (
        <BranchSelector
          branches={branches}
          currentBaseBranch={baseBranch}
          onSelectBranch={handleBranchSelect}
          onClose={() => setIsBranchSelectorOpen(false)}
        />
      )}
    </div>
  );
}
