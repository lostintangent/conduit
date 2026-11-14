// @ts-nocheck
import { applyGitStatus } from "@/api/gitQueries";
import { createQueryClient } from "@/query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerEditorHandlers } from "../../../src/renderer/commands/handlers";
import { EditorPaneV2 } from "../../../src/renderer/components/panes/editor/EditorPaneV2";
import { render as renderWithQuery } from "../queryRender";

// Each render gets a fresh QueryClient, and reportStatus stands in for the
// git watcher reporting to it
let queryClient;
function render(ui, options) {
  queryClient = createQueryClient();
  return renderWithQuery(ui, { ...options, queryClient });
}
const reportStatus = (status) =>
  act(async () => applyGitStatus(queryClient, mockGit.cwd, status));

// Runs an editor command (like Cmd+B) as the command system does
const runEditorCommand = (name) =>
  act(() => registerEditorHandlers.mock.calls.at(-1)[1][name]());

// ============================================================================
// Mocks
// ============================================================================

// Mock the hooks barrel (useResponsiveLayout, useEditorTheme, useReviewModeState)
const mockLayout = vi.fn();
const mockMarkSeen = vi.fn();

// Stateful mock for useReviewModeState. Like useState, the initial view mode
// only applies until something sets one (beforeEach clears it).
let mockViewMode;
const mockSetViewMode = vi.fn((newMode) => {
  mockViewMode = newMode;
});
const mockSetViewModePreservingReview = vi.fn((fn) => {
  const result = fn();
  mockViewMode = result;
  return result;
});

vi.mock("../../../src/renderer/components/panes/editor/hooks", () => ({
  useResponsiveLayout: () => mockLayout(),
  useEditorTheme: () => "vs-dark",
  useReviewModeState: (initialViewMode = { type: "editor" }) => {
    mockViewMode ??= initialViewMode;
    return {
      viewMode: mockViewMode,
      isReviewMode: mockViewMode.type === "changesReview",
      enterReviewMode: () => {
        mockViewMode = { type: "changesReview" };
      },
      exitReviewMode: () => {
        mockViewMode = { type: "editor" };
      },
      setViewMode: mockSetViewMode,
      setViewModePreservingReview: mockSetViewModePreservingReview,
      handleTreeViewModeTransition: vi.fn(),
    };
  },
  useUnseenTracking: () => ({
    isUnseen: () => false,
    getTimestamp: () => null,
    markSeen: mockMarkSeen,
    markAllSeen: vi.fn(),
    getUnseenCount: () => 0,
    unseenCount: 0,
    sortByTimestamp: (files: unknown[]) => files,
    tracking: {
      isUnseen: () => false,
      getTimestamp: () => null,
      markSeen: vi.fn(),
      markAllSeen: vi.fn(),
      getUnseenCount: () => 0,
      unseenCount: 0,
      sortByTimestamp: (files: unknown[]) => files,
      processStatusChange: vi.fn(),
      initializeFiles: vi.fn(),
      reset: vi.fn(),
    },
  }),
  useModelState: () => null, // Returns null when no model exists (file not loaded)
  useAutoOpenFile: vi.fn(), // Auto-open file hook (does nothing in tests)
}));

// Mock registerEditorHandlers
vi.mock("../../../src/renderer/commands/handlers", () => ({
  registerEditorHandlers: vi.fn(() => vi.fn()),
}));

// Mock useFileSystemV2 hook
const mockFs = {
  readTextFile: vi.fn().mockResolvedValue("// test file content"),
  readDirectory: vi.fn().mockResolvedValue([]),
  release: vi.fn(),
};
vi.mock("../../../src/renderer/hooks/useFileSystemV2", () => ({
  useFileSystemV2: () => mockFs,
}));

// Mock useGitV2 hook - returns git API with empty status. findRoot is null so
// the pane reads no per-file diff stats, which these tests don't cover.
const mockGit = {
  cwd: "/project",
  findRoot: vi.fn().mockResolvedValue(null),
  getStatus: vi.fn().mockResolvedValue({ files: new Map(), branch: "main" }),
  getStatusFromBranch: vi.fn().mockResolvedValue(new Map()),
  onStatusChanged: vi.fn().mockReturnValue(() => {}),
  onBranchChanged: vi.fn().mockReturnValue(() => {}),
  getCurrentBranch: vi.fn().mockResolvedValue("main"),
  getMostRecentDirtyFile: vi.fn().mockResolvedValue(null),
  getMostRecentCommittedFile: vi.fn().mockResolvedValue(null),
  whenReady: vi.fn().mockResolvedValue(undefined),
  commit: vi.fn().mockResolvedValue(undefined),
  release: vi.fn(),
  getBranches: vi.fn().mockResolvedValue([]),
  getChangedFilesFromBranch: vi.fn().mockResolvedValue([]),
  hasUpstream: vi.fn().mockResolvedValue(true),
  pull: vi.fn().mockResolvedValue(undefined),
  push: vi.fn().mockResolvedValue(undefined),
};
vi.mock("../../../src/renderer/hooks/useGitV2", () => ({
  useGitV2: () => mockGit,
}));

// Mock FileTreePanel (including BranchSelector which is re-exported from this barrel)
vi.mock(
  "../../../src/renderer/components/panes/editor/components/FileTreePanel",
  () => ({
    FileTreePanel: ({
      cwd,
      onFileSelect,
      treeViewMode,
      onTreeViewModeChange,
      gitStatus,
      onReviewChanges,
      onViewCommit,
      onCommitFileSelect,
      onToggleCollapse,
      showCollapseButton,
    }) => (
      <div data-testid="mock-file-tree-panel">
        <span data-testid="tree-cwd">{cwd}</span>
        {showCollapseButton && (
          <button
            data-testid="collapse-toggle-button"
            onClick={onToggleCollapse}
          >
            Collapse
          </button>
        )}
        <button data-testid="review-changes-button" onClick={onReviewChanges}>
          Review
        </button>
        <div data-testid="commit-row" tabIndex={0}>
          <button
            data-testid="view-commit-button"
            onClick={() =>
              onViewCommit({ commitId: "abc1234", parentCommitId: "def5678" })
            }
          >
            View Commit
          </button>
        </div>
        <button
          data-testid="select-commit-file-button"
          onClick={() =>
            onCommitFileSelect({
              commitId: "abc1234",
              parentCommitId: "def5678",
              file: { path: "test.ts", status: "M" },
            })
          }
        >
          Select Commit File
        </button>
        <span data-testid="tree-git-status">
          {[...(gitStatus?.keys() ?? [])].join(",")}
        </span>
        <button
          data-testid="select-file-button"
          onClick={() =>
            onFileSelect({
              path: "/project/test.ts",
              name: "test.ts",
              type: "file",
            })
          }
        >
          Select File
        </button>
        <button
          data-testid="select-changes-file-button"
          onClick={() =>
            onFileSelect(
              { path: "/project/test.ts", name: "test.ts", type: "file" },
              "test.ts",
            )
          }
        >
          Select Changed File
        </button>
        <span data-testid="tree-view-mode">{treeViewMode}</span>
        <button
          data-testid="toggle-tree-mode"
          onClick={() =>
            onTreeViewModeChange(treeViewMode === "files" ? "changes" : "files")
          }
        >
          Toggle Mode
        </button>
      </div>
    ),
    BranchSelector: ({ open, onSelectBranch, onOpenChange }) => (
      <div data-testid="mock-branch-selector" data-open={open}>
        <button
          data-testid="select-branch-button"
          onClick={() => onSelectBranch("test-branch")}
        >
          Select Branch
        </button>
        <button
          data-testid="close-branch-selector"
          onClick={() => onOpenChange(false)}
        >
          Close
        </button>
      </div>
    ),
    BranchSwitcher: () => <div data-testid="mock-branch-switcher" />,
    FileTreeNormal: () => <div data-testid="mock-file-tree-normal" />,
    FileTreeChanges: () => <div data-testid="mock-file-tree-changes" />,
    FileTreeItem: () => <div data-testid="mock-file-tree-item" />,
  }),
);

// Mock EditorPane
vi.mock(
  "../../../src/renderer/components/panes/editor/components/EditorPane",
  () => ({
    EditorPane: ({
      selectedFile,
      viewMode,
      onBack,
      onExitReview,
      onExitCommitMode,
    }) => (
      <div data-testid="mock-editor-pane">
        <button data-testid="back-button" onClick={onBack}>
          Back
        </button>
        <button data-testid="exit-review-button" onClick={onExitReview}>
          Exit Review
        </button>
        <button data-testid="exit-commit-button" onClick={onExitCommitMode}>
          Exit Commit
        </button>
        <span data-testid="editor-file-path">
          {selectedFile?.path ?? "no-file"}
        </span>
        <span data-testid="editor-view-mode">{viewMode.type}</span>
        {selectedFile && (
          <div className="monaco-editor">
            <textarea className="inputarea" data-testid="editor-input" />
          </div>
        )}
      </div>
    ),
  }),
);

// Mock TreeResizer
vi.mock(
  "../../../src/renderer/components/panes/editor/components/TreeResizer",
  () => ({
    TreeResizer: ({ onResize, currentWidth }) => (
      <div
        data-testid="mock-tree-resizer"
        onClick={() => onResize(currentWidth + 50)}
      >
        Resizer ({currentWidth}px)
      </div>
    ),
  }),
);

// Also mock the useReviewModeState hook
vi.mock(
  "../../../src/renderer/components/panes/editor/hooks/useReviewModeState",
  () => ({
    useReviewModeState: () => ({
      viewMode: { type: "editor" },
      isReviewMode: false,
      enterReviewMode: vi.fn(),
      exitReviewMode: vi.fn(),
      setViewMode: vi.fn(),
      setViewModePreservingReview: vi.fn(),
      handleTreeViewModeTransition: vi.fn().mockReturnValue({
        restoredReviewMode: false,
      }),
    }),
  }),
);

// ============================================================================
// Test Data
// ============================================================================

const TEST_PANE = {
  id: "test-editor-1",
  type: "editor" as const,
  cwd: "/project",
};

const TEST_PANE_WITH_FILE = {
  ...TEST_PANE,
  filePath: "/project/src/index.ts",
};

// ============================================================================
// Tests
// ============================================================================

describe("EditorPaneV2", () => {
  // Store original localStorage
  let originalLocalStorage: Storage;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset view mode state
    mockViewMode = undefined;

    // Default to split layout
    mockLayout.mockReturnValue("split");

    // Mock localStorage
    originalLocalStorage = window.localStorage;
    const mockStorage: Record<string, string> = {};
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: vi.fn((key: string) => mockStorage[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          mockStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
        clear: vi.fn(() => {
          Object.keys(mockStorage).forEach((key) => delete mockStorage[key]);
        }),
      },
      writable: true,
    });
  });

  afterEach(() => {
    // Restore localStorage
    Object.defineProperty(window, "localStorage", {
      value: originalLocalStorage,
      writable: true,
    });
  });

  // ===========================================================================
  // Basic Rendering
  // ===========================================================================

  describe("basic rendering", () => {
    it("should not render tree resizer in single mode", () => {
      mockLayout.mockReturnValue("single");

      render(<EditorPaneV2 pane={TEST_PANE} />);

      expect(screen.queryByTestId("mock-tree-resizer")).toBeNull();
    });
  });

  // ===========================================================================
  // Initial State
  // ===========================================================================

  describe("initial state", () => {
    it("should initialize with no file selected when pane has no filePath", () => {
      render(<EditorPaneV2 pane={TEST_PANE} />);

      expect(screen.getByTestId("editor-file-path").textContent).toBe(
        "no-file",
      );
    });

    it("should initialize with file selected when pane has filePath", () => {
      render(<EditorPaneV2 pane={TEST_PANE_WITH_FILE} />);

      expect(screen.getByTestId("editor-file-path").textContent).toBe(
        "/project/src/index.ts",
      );
    });

    it("should initialize with editor view mode", () => {
      render(<EditorPaneV2 pane={TEST_PANE} />);

      expect(screen.getByTestId("editor-view-mode").textContent).toBe("editor");
    });

    it("should initialize tree view mode from pane treeMode", () => {
      const paneWithChanges = { ...TEST_PANE, treeMode: "changes" as const };
      render(<EditorPaneV2 pane={paneWithChanges} />);

      expect(screen.getByTestId("tree-view-mode").textContent).toBe("changes");
    });
  });

  // ===========================================================================
  // File Selection
  // ===========================================================================

  describe("file selection", () => {
    it("should select the file and mark it seen when file is selected from tree", () => {
      render(<EditorPaneV2 pane={TEST_PANE} />);

      fireEvent.click(screen.getByTestId("select-file-button"));

      expect(screen.getByTestId("editor-file-path").textContent).toBe(
        "/project/test.ts",
      );
      expect(mockMarkSeen).toHaveBeenCalledWith("test.ts");
    });
  });

  // ===========================================================================
  // Tree View Mode
  // ===========================================================================

  describe("tree view mode", () => {
    it("should toggle tree view mode", () => {
      render(<EditorPaneV2 pane={TEST_PANE} />);

      expect(screen.getByTestId("tree-view-mode").textContent).toBe("files");

      fireEvent.click(screen.getByTestId("toggle-tree-mode"));

      expect(screen.getByTestId("tree-view-mode").textContent).toBe("changes");
    });

    it("should persist tree view mode to localStorage", () => {
      render(<EditorPaneV2 pane={TEST_PANE} />);

      fireEvent.click(screen.getByTestId("toggle-tree-mode"));

      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        "editor:treeViewMode",
        "changes",
      );
    });
  });

  // ===========================================================================
  // Tree Resizing
  // ===========================================================================

  describe("tree resizing", () => {
    it("should update tree width when resizer is used", () => {
      mockLayout.mockReturnValue("split");

      render(<EditorPaneV2 pane={TEST_PANE} />);

      const resizer = screen.getByTestId("mock-tree-resizer");
      expect(resizer.textContent).toContain("220px"); // Default width

      fireEvent.click(resizer);

      expect(resizer.textContent).toContain("270px"); // 220 + 50
    });

    it("should persist tree width to localStorage", () => {
      mockLayout.mockReturnValue("split");

      render(<EditorPaneV2 pane={TEST_PANE} />);

      fireEvent.click(screen.getByTestId("mock-tree-resizer"));

      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        "editor:treeWidth",
        "270",
      );
    });
  });

  // ===========================================================================
  // Responsive Layout
  // ===========================================================================

  describe("responsive layout", () => {
    it("should show both panels in split mode", () => {
      mockLayout.mockReturnValue("split");

      render(<EditorPaneV2 pane={TEST_PANE} />);

      const treeContainer = screen.getByTestId("tree-container");
      const editorContainer = screen.getByTestId("editor-container");

      expect(treeContainer.classList.contains("hidden")).toBe(false);
      expect(editorContainer.classList.contains("hidden")).toBe(false);
    });

    it("should show only tree panel initially in single mode", () => {
      mockLayout.mockReturnValue("single");

      render(<EditorPaneV2 pane={TEST_PANE} />);

      const treeContainer = screen.getByTestId("tree-container");
      const editorContainer = screen.getByTestId("editor-container");

      expect(treeContainer.classList.contains("hidden")).toBe(false);
      expect(editorContainer.classList.contains("hidden")).toBe(true);
    });

    it("should swap the tree for review in single mode and back on exit", () => {
      mockLayout.mockReturnValue("single");

      render(<EditorPaneV2 pane={TEST_PANE} />);
      const treeContainer = screen.getByTestId("tree-container");
      const editorContainer = screen.getByTestId("editor-container");

      fireEvent.click(screen.getByTestId("review-changes-button"));
      expect(treeContainer.classList.contains("hidden")).toBe(true);
      expect(editorContainer.classList.contains("hidden")).toBe(false);

      fireEvent.click(screen.getByTestId("exit-review-button"));
      expect(treeContainer.classList.contains("hidden")).toBe(false);
      expect(editorContainer.classList.contains("hidden")).toBe(true);
    });

    it.each(["view-commit-button", "select-commit-file-button"])(
      "should swap the tree for a commit in single mode and back on exit (%s)",
      (openCommit) => {
        mockLayout.mockReturnValue("single");

        render(<EditorPaneV2 pane={TEST_PANE} />);
        const treeContainer = screen.getByTestId("tree-container");
        const editorContainer = screen.getByTestId("editor-container");

        fireEvent.click(screen.getByTestId(openCommit));
        expect(treeContainer.classList.contains("hidden")).toBe(true);
        expect(editorContainer.classList.contains("hidden")).toBe(false);

        fireEvent.click(screen.getByTestId("exit-commit-button"));
        expect(treeContainer.classList.contains("hidden")).toBe(false);
        expect(editorContainer.classList.contains("hidden")).toBe(true);
      },
    );

    it("should return to the tree in single mode when the open file is committed away", async () => {
      mockLayout.mockReturnValue("single");
      const modified = { path: "test.ts", status: "modified", staged: false };
      const dirty = { files: new Map([["test.ts", modified]]), branch: "main" };
      const clean = { files: new Map(), branch: "main" };
      mockGit.getStatus.mockResolvedValue(dirty);

      render(<EditorPaneV2 pane={{ ...TEST_PANE, treeMode: "changes" }} />);
      await reportStatus(dirty);
      const treeContainer = screen.getByTestId("tree-container");
      const editorContainer = screen.getByTestId("editor-container");

      fireEvent.click(screen.getByTestId("select-changes-file-button"));
      await waitFor(() => {
        expect(editorContainer.classList.contains("hidden")).toBe(false);
      });
      expect(treeContainer.classList.contains("hidden")).toBe(true);

      mockGit.getStatus.mockResolvedValue(clean);
      await reportStatus(clean);

      await waitFor(() => {
        expect(screen.getByTestId("editor-file-path").textContent).toBe(
          "no-file",
        );
      });
      expect(treeContainer.classList.contains("hidden")).toBe(false);
      expect(editorContainer.classList.contains("hidden")).toBe(true);
    });
    it("should show the tree in split mode when the open file goes away while it's collapsed", async () => {
      const modified = { path: "test.ts", status: "modified", staged: false };
      const dirty = { files: new Map([["test.ts", modified]]), branch: "main" };
      const clean = { files: new Map(), branch: "main" };
      mockGit.getStatus.mockResolvedValue(dirty);

      render(<EditorPaneV2 pane={{ ...TEST_PANE, treeMode: "changes" }} />);
      await reportStatus(dirty);
      const treeContainer = screen.getByTestId("tree-container");

      fireEvent.click(screen.getByTestId("select-changes-file-button"));
      await waitFor(() => {
        expect(screen.getByTestId("editor-file-path").textContent).toBe(
          "/project/test.ts",
        );
      });
      fireEvent.click(screen.getByTestId("collapse-toggle-button"));
      expect(treeContainer.classList.contains("hidden")).toBe(true);

      mockGit.getStatus.mockResolvedValue(clean);
      await reportStatus(clean);

      await waitFor(() => {
        expect(treeContainer.classList.contains("hidden")).toBe(false);
      });
    });

    it("should keep the tree in split mode while there's no file to show instead", async () => {
      render(<EditorPaneV2 pane={TEST_PANE} />);
      const treeContainer = screen.getByTestId("tree-container");

      expect(screen.queryByTestId("collapse-toggle-button")).toBeNull();
      await runEditorCommand("toggleSidebar");
      expect(treeContainer.classList.contains("hidden")).toBe(false);

      // Opening a file doesn't collapse a tree that the toggle above left
      fireEvent.click(screen.getByTestId("select-file-button"));
      expect(treeContainer.classList.contains("hidden")).toBe(false);
    });

    it("should toggle and reveal the tree in single mode", async () => {
      mockLayout.mockReturnValue("single");

      render(<EditorPaneV2 pane={TEST_PANE} />);
      const treeContainer = screen.getByTestId("tree-container");
      const editorContainer = screen.getByTestId("editor-container");
      fireEvent.click(screen.getByTestId("select-file-button"));
      await waitFor(() => {
        expect(treeContainer.classList.contains("hidden")).toBe(true);
      });

      await runEditorCommand("toggleSidebar");
      expect(treeContainer.classList.contains("hidden")).toBe(false);
      expect(editorContainer.classList.contains("hidden")).toBe(true);

      await runEditorCommand("toggleSidebar");
      expect(treeContainer.classList.contains("hidden")).toBe(true);
      expect(editorContainer.classList.contains("hidden")).toBe(false);

      await runEditorCommand("revealActiveFile");
      expect(treeContainer.classList.contains("hidden")).toBe(false);
      expect(editorContainer.classList.contains("hidden")).toBe(true);
    });
  });

  // ===========================================================================
  // Focus in a single layout
  // ===========================================================================

  describe("focus in a single layout", () => {
    beforeEach(() => {
      mockLayout.mockReturnValue("single");
    });

    const openFileFromTree = async (button = "select-file-button") => {
      const treeButton = screen.getByTestId(button);
      treeButton.focus();
      fireEvent.click(treeButton);
      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByTestId("editor-input"));
      });
      return treeButton;
    };

    it("moves focus into the editor when a file opens from the tree", async () => {
      render(<EditorPaneV2 pane={TEST_PANE} />);
      await openFileFromTree();

      expect(document.activeElement).toBe(screen.getByTestId("editor-input"));
    });

    it("returns focus to where it was in the tree on back", async () => {
      render(<EditorPaneV2 pane={TEST_PANE} />);
      const treeButton = await openFileFromTree();

      const back = screen.getByTestId("back-button");
      back.focus();
      fireEvent.click(back);

      await waitFor(() => {
        expect(document.activeElement).toBe(treeButton);
      });
    });

    it("returns focus to the row of a hover-only button that opened a commit", async () => {
      render(<EditorPaneV2 pane={TEST_PANE} />);
      const viewCommit = screen.getByTestId("view-commit-button");
      viewCommit.focus();
      fireEvent.click(viewCommit);
      await waitFor(() => {
        expect(document.activeElement).toBe(
          screen.getByTestId("editor-container"),
        );
      });

      // The pointer has left the row, which hides its buttons
      viewCommit.style.display = "none";
      const exit = screen.getByTestId("exit-commit-button");
      exit.focus();
      fireEvent.click(exit);

      await waitFor(() => {
        expect(document.activeElement).toBe(screen.getByTestId("commit-row"));
      });
    });

    it("returns focus to the tree when the file it was in is committed away", async () => {
      const modified = { path: "test.ts", status: "modified", staged: false };
      const dirty = { files: new Map([["test.ts", modified]]), branch: "main" };
      const clean = { files: new Map(), branch: "main" };
      mockGit.getStatus.mockResolvedValue(dirty);

      render(<EditorPaneV2 pane={{ ...TEST_PANE, treeMode: "changes" }} />);
      await reportStatus(dirty);
      const treeButton = await openFileFromTree("select-changes-file-button");

      mockGit.getStatus.mockResolvedValue(clean);
      await reportStatus(clean);

      await waitFor(() => {
        expect(document.activeElement).toBe(treeButton);
      });
    });

    it("leaves focus alone when it isn't on the side that hid", async () => {
      const outside = document.body.appendChild(
        document.createElement("input"),
      );
      render(<EditorPaneV2 pane={TEST_PANE} />);
      const treeButton = screen.getByTestId("select-file-button");
      treeButton.focus();
      outside.focus();

      fireEvent.click(treeButton);
      await waitFor(() => {
        expect(screen.getByTestId("editor-input")).toBeDefined();
      });

      expect(document.activeElement).toBe(outside);
      outside.remove();
    });

    it("doesn't take focus that the pane didn't have", async () => {
      render(<EditorPaneV2 pane={TEST_PANE} />);

      fireEvent.click(screen.getByTestId("select-file-button"));
      await waitFor(() => {
        expect(screen.getByTestId("editor-input")).toBeDefined();
      });

      expect(document.activeElement).toBe(document.body);
    });
  });

  describe("focus in a split layout", () => {
    it.each([
      ["the collapse button", "collapse-toggle-button"],
      ["Cmd+B", null],
    ])(
      "moves focus into the editor when %s collapses the tree it was in",
      async (_, button) => {
        render(<EditorPaneV2 pane={TEST_PANE} />);
        const treeButton = screen.getByTestId("select-file-button");
        treeButton.focus();
        fireEvent.click(treeButton);
        await waitFor(() => {
          expect(screen.getByTestId("editor-input")).toBeDefined();
        });
        expect(document.activeElement).toBe(treeButton);

        if (button) {
          const collapse = screen.getByTestId(button);
          collapse.focus();
          fireEvent.click(collapse);
        } else {
          await runEditorCommand("toggleSidebar");
        }

        await waitFor(() => {
          expect(document.activeElement).toBe(
            screen.getByTestId("editor-input"),
          );
        });
      },
    );
  });

  // ===========================================================================
  // Callback Props
  // ===========================================================================

  describe("callback props", () => {
    beforeEach(() => {
      mockFs.readTextFile.mockClear();
    });

    it("should call onFileChange with file content when file is selected", async () => {
      const onFileChange = vi.fn();
      mockFs.readTextFile.mockResolvedValue("const x = 1;");

      render(<EditorPaneV2 pane={TEST_PANE} onFileChange={onFileChange} />);

      fireEvent.click(screen.getByTestId("select-file-button"));

      // Note: onFileChange no longer includes content for performance reasons
      // (content is loaded asynchronously by Monaco model registry)
      await waitFor(() => {
        expect(onFileChange).toHaveBeenCalledWith({
          file: "/project/test.ts",
          language: "typescript",
        });
      });
    });

    it("should call onTreeModeChange when tree mode changes", () => {
      const onTreeModeChange = vi.fn();

      render(
        <EditorPaneV2 pane={TEST_PANE} onTreeModeChange={onTreeModeChange} />,
      );

      fireEvent.click(screen.getByTestId("toggle-tree-mode"));

      expect(onTreeModeChange).toHaveBeenCalledWith("changes");
    });

    it("should call onTreeModeChange with 'all' when switching back to files", () => {
      const onTreeModeChange = vi.fn();
      const paneWithChanges = { ...TEST_PANE, treeMode: "changes" as const };

      render(
        <EditorPaneV2
          pane={paneWithChanges}
          onTreeModeChange={onTreeModeChange}
        />,
      );

      fireEvent.click(screen.getByTestId("toggle-tree-mode"));

      expect(onTreeModeChange).toHaveBeenCalledWith("all");
    });
  });

  // ===========================================================================
  // Git-Derived Editor Mode
  // ===========================================================================

  describe("git-derived editor mode", () => {
    beforeEach(() => {
      mockGit.getStatus.mockClear();
    });

    it("should fetch git status on mount", async () => {
      render(<EditorPaneV2 pane={TEST_PANE} />);

      await waitFor(() => {
        expect(mockGit.getStatus).toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // Non-Git CWD Recovery
  // ===========================================================================

  describe("non-git CWD recovery", () => {
    it("should auto-switch from changes to files view when CWD is not a git repo", async () => {
      // Configure git to return null (not a git repo)
      mockGit.getStatus.mockResolvedValue(null);
      mockGit.getCurrentBranch.mockResolvedValue(null);

      const paneWithChanges = { ...TEST_PANE, treeMode: "changes" as const };
      render(<EditorPaneV2 pane={paneWithChanges} />);

      // Initially starts in changes mode (from pane config)
      expect(screen.getByTestId("tree-view-mode").textContent).toBe("changes");

      // After git status loads and reveals it's not a git repo, should switch to files
      await waitFor(() => {
        expect(screen.getByTestId("tree-view-mode").textContent).toBe("files");
      });
    });

    it("should stay in changes view when CWD is a git repo", async () => {
      // Configure git to return valid status (is a git repo)
      mockGit.getStatus.mockResolvedValue({
        files: new Map(),
        branch: "main",
      });
      mockGit.getCurrentBranch.mockResolvedValue("main");

      const paneWithChanges = { ...TEST_PANE, treeMode: "changes" as const };
      render(<EditorPaneV2 pane={paneWithChanges} />);

      // Wait for git status to load
      await waitFor(() => {
        expect(mockGit.getStatus).toHaveBeenCalled();
      });

      // Should remain in changes mode
      expect(screen.getByTestId("tree-view-mode").textContent).toBe("changes");
    });

    it("should auto-switch when the status becomes null", async () => {
      // Start with a valid git repo
      mockGit.getStatus.mockResolvedValue({
        files: new Map(),
        branch: "main",
      });
      mockGit.getCurrentBranch.mockResolvedValue("main");

      const paneWithChanges = { ...TEST_PANE, treeMode: "changes" as const };
      render(<EditorPaneV2 pane={paneWithChanges} />);

      // Wait for initial load
      await waitFor(() => {
        expect(mockGit.getStatus).toHaveBeenCalled();
      });

      // Should be in changes mode
      expect(screen.getByTestId("tree-view-mode").textContent).toBe("changes");

      // Simulate git repo becoming unavailable
      await reportStatus(null);

      // Should switch to files mode
      await waitFor(() => {
        expect(screen.getByTestId("tree-view-mode").textContent).toBe("files");
      });
    });

    it("should not switch when already in files view and CWD is not a git repo", async () => {
      mockGit.getStatus.mockResolvedValue(null);
      mockGit.getCurrentBranch.mockResolvedValue(null);

      render(<EditorPaneV2 pane={TEST_PANE} />);

      // Wait for git status to load
      await waitFor(() => {
        expect(mockGit.getStatus).toHaveBeenCalled();
      });

      // Should remain in files mode (was already files)
      expect(screen.getByTestId("tree-view-mode").textContent).toBe("files");
    });
  });

  // ===========================================================================
  // Prop to State Sync
  // ===========================================================================

  describe("pane.cwd prop sync", () => {
    it("should follow pane.cwd prop changes", async () => {
      const initialPane = {
        ...TEST_PANE,
        cwd: "/project/initial",
      };

      const { rerender } = render(<EditorPaneV2 pane={initialPane} />);

      expect(screen.getByTestId("tree-cwd").textContent).toBe(
        "/project/initial",
      );

      // Update the pane prop with a new cwd
      const updatedPane = {
        ...TEST_PANE,
        cwd: "/project/updated",
      };

      await act(async () => {
        rerender(<EditorPaneV2 pane={updatedPane} />);
      });

      expect(screen.getByTestId("tree-cwd").textContent).toBe(
        "/project/updated",
      );
    });
  });

  describe("branch comparison", () => {
    const changed = (path) => [path, { path, status: "modified" }];

    // mockReset also drops unconsumed *Once values, which clearAllMocks keeps
    afterEach(() => {
      mockGit.getStatus
        .mockReset()
        .mockResolvedValue({ files: new Map(), branch: "main" });
      mockGit.getStatusFromBranch.mockReset().mockResolvedValue(new Map());
    });

    it("refreshes the comparison instead of showing HEAD status when files change", async () => {
      mockGit.getStatusFromBranch
        .mockResolvedValueOnce(new Map([changed("feature.ts")]))
        .mockResolvedValueOnce(
          new Map([changed("feature.ts"), changed("saved.ts")]),
        );

      render(<EditorPaneV2 pane={TEST_PANE} />);
      fireEvent.click(screen.getByTestId("select-branch-button"));
      await waitFor(() => {
        expect(screen.getByTestId("tree-git-status").textContent).toBe(
          "feature.ts",
        );
      });

      await reportStatus({
        files: new Map([changed("saved.ts")]),
        branch: "main",
      });

      await waitFor(() => {
        expect(screen.getByTestId("tree-git-status").textContent).toBe(
          "feature.ts,saved.ts",
        );
      });
      expect(mockGit.getStatusFromBranch).toHaveBeenLastCalledWith(
        "test-branch",
      );
    });

    it("keeps listing HEAD's changes until the comparison loads", async () => {
      mockGit.getStatus.mockResolvedValue({
        files: new Map([changed("head.ts")]),
        branch: "main",
      });
      let resolveComparison;
      mockGit.getStatusFromBranch.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveComparison = resolve;
        }),
      );

      render(<EditorPaneV2 pane={TEST_PANE} />);
      await waitFor(() => {
        expect(screen.getByTestId("tree-git-status").textContent).toBe(
          "head.ts",
        );
      });

      fireEvent.click(screen.getByTestId("select-branch-button"));
      await waitFor(() => {
        expect(mockGit.getStatusFromBranch).toHaveBeenCalledWith("test-branch");
      });
      expect(screen.getByTestId("tree-git-status").textContent).toBe("head.ts");

      await act(async () => {
        resolveComparison(new Map([changed("feature.ts")]));
      });
      await waitFor(() => {
        expect(screen.getByTestId("tree-git-status").textContent).toBe(
          "feature.ts",
        );
      });
    });

    it("keeps an agent pane's comparison when HEAD status loads after it", async () => {
      let resolveHeadStatus;
      mockGit.getStatus.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveHeadStatus = resolve;
        }),
      );
      mockGit.getStatusFromBranch.mockResolvedValueOnce(
        new Map([changed("feature.ts")]),
      );

      render(<EditorPaneV2 pane={{ ...TEST_PANE, agentBaseBranch: "main" }} />);
      await waitFor(() => {
        expect(screen.getByTestId("tree-git-status").textContent).toBe(
          "feature.ts",
        );
      });

      await act(async () => {
        resolveHeadStatus({
          files: new Map([changed("saved.ts")]),
          branch: "main",
        });
      });

      expect(screen.getByTestId("tree-git-status").textContent).toBe(
        "feature.ts",
      );
    });
  });

  describe("pane.file prop sync", () => {
    it("opens an image in preview when the pane mounts on it", () => {
      render(
        <EditorPaneV2 pane={{ ...TEST_PANE, file: "/project/pixel.png" }} />,
      );

      expect(screen.getByTestId("editor-view-mode").textContent).toBe(
        "preview",
      );
    });

    it("switches to preview when pane.file changes to an image", async () => {
      const { rerender } = render(
        <EditorPaneV2 pane={{ ...TEST_PANE, file: "/project/src/index.ts" }} />,
      );
      expect(screen.getByTestId("editor-view-mode").textContent).toBe("editor");

      await act(async () => {
        rerender(
          <EditorPaneV2 pane={{ ...TEST_PANE, file: "/project/pixel.png" }} />,
        );
      });

      expect(screen.getByTestId("editor-file-path").textContent).toBe(
        "/project/pixel.png",
      );
      expect(screen.getByTestId("editor-view-mode").textContent).toBe(
        "preview",
      );
    });

    // Markdown supports preview too, so only an explicit reset keeps the
    // image's preview mode from carrying over to it
    it("opens the next file in the editor after an image", async () => {
      const { rerender } = render(
        <EditorPaneV2 pane={{ ...TEST_PANE, file: "/project/pixel.png" }} />,
      );
      expect(screen.getByTestId("editor-view-mode").textContent).toBe(
        "preview",
      );

      await act(async () => {
        rerender(
          <EditorPaneV2 pane={{ ...TEST_PANE, file: "/project/notes.md" }} />,
        );
      });

      expect(screen.getByTestId("editor-file-path").textContent).toBe(
        "/project/notes.md",
      );
      expect(screen.getByTestId("editor-view-mode").textContent).toBe("editor");
    });

    // Tabs and the quick pane write the selection back to pane.file, which
    // must not be mistaken for an external open that resets the view
    it("keeps a modified file's diff when the parent echoes the selection", async () => {
      mockGit.getStatus.mockResolvedValue({
        files: new Map([["test.ts", { path: "test.ts", status: "modified" }]]),
        branch: "main",
      });
      function EchoingParent() {
        const [file, setFile] = useState<string>();
        return (
          <EditorPaneV2
            pane={{ ...TEST_PANE, file }}
            onFileChange={(change) => setFile(change.file)}
          />
        );
      }

      try {
        render(<EchoingParent />);
        await waitFor(() => {
          expect(screen.getByTestId("tree-git-status").textContent).toBe(
            "test.ts",
          );
        });

        await act(async () => {
          fireEvent.click(screen.getByTestId("select-file-button"));
        });

        expect(screen.getByTestId("editor-file-path").textContent).toBe(
          "/project/test.ts",
        );
        expect(screen.getByTestId("editor-view-mode").textContent).toBe("diff");
      } finally {
        mockGit.getStatus
          .mockReset()
          .mockResolvedValue({ files: new Map(), branch: "main" });
      }
    });
  });
});
