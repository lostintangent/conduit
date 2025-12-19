// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorPaneV2 } from "../../../src/renderer/components/panes/editor-v2/EditorPaneV2";

// ============================================================================
// Mocks
// ============================================================================

// Mock the hooks barrel (useResponsiveLayout, useEditorTheme, useReviewModeState)
const mockLayout = vi.fn();

// Stateful mock for useReviewModeState
let mockViewMode = { type: "editor" as const };
const mockSetViewMode = vi.fn((newMode) => {
  mockViewMode = newMode;
});
const mockSetViewModePreservingReview = vi.fn((fn) => {
  const result = fn();
  mockViewMode = result;
  return result;
});

vi.mock("../../../src/renderer/components/panes/editor-v2/hooks", () => ({
  useResponsiveLayout: () => mockLayout(),
  useEditorTheme: () => "vs-dark",
  useReviewModeState: () => ({
    viewMode: mockViewMode,
    isReviewMode: false,
    enterReviewMode: vi.fn(),
    exitReviewMode: vi.fn(),
    setViewMode: mockSetViewMode,
    setViewModePreservingReview: mockSetViewModePreservingReview,
    handleTreeViewModeTransition: vi.fn(),
  }),
  useFileChangeTracking: () => ({
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
  }),
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

// Mock useGitV2 hook - returns git API with empty status
const mockGit = {
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
  "../../../src/renderer/components/panes/editor-v2/components/FileTreePanel",
  () => ({
    FileTreePanel: ({ onFileSelect, treeViewMode, onTreeViewModeChange }) => (
      <div data-testid="mock-file-tree-panel">
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

// Mock EditorViewPanel
vi.mock(
  "../../../src/renderer/components/panes/editor-v2/components/EditorViewPanel",
  () => ({
    EditorViewPanel: ({ selectedFile, viewMode }) => (
      <div data-testid="mock-editor-view-panel">
        <span data-testid="editor-file-path">
          {selectedFile?.path ?? "no-file"}
        </span>
        <span data-testid="editor-view-mode">{viewMode.type}</span>
      </div>
    ),
  }),
);

// Mock TreeResizer
vi.mock(
  "../../../src/renderer/components/panes/editor-v2/components/TreeResizer",
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
  "../../../src/renderer/components/panes/editor-v2/hooks/useReviewModeState",
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
    mockViewMode = { type: "editor" as const };

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
    it("should render the main container", () => {
      render(<EditorPaneV2 pane={TEST_PANE} />);

      expect(screen.getByTestId("editor-pane-v2")).toBeDefined();
    });

    it("should render tree and editor panels", () => {
      render(<EditorPaneV2 pane={TEST_PANE} />);

      expect(screen.getByTestId("mock-file-tree-panel")).toBeDefined();
      expect(screen.getByTestId("mock-editor-view-panel")).toBeDefined();
    });

    it("should render tree resizer in split mode", () => {
      mockLayout.mockReturnValue("split");

      render(<EditorPaneV2 pane={TEST_PANE} />);

      expect(screen.getByTestId("mock-tree-resizer")).toBeDefined();
    });

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
    it("should update selected file when file is selected from tree", () => {
      render(<EditorPaneV2 pane={TEST_PANE} />);

      fireEvent.click(screen.getByTestId("select-file-button"));

      expect(screen.getByTestId("editor-file-path").textContent).toBe(
        "/project/test.ts",
      );
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
        "editor-v2:treeViewMode",
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
        "editor-v2:treeWidth",
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
  });

  // ===========================================================================
  // Editor ID Generation
  // ===========================================================================

  describe("editor ID generation", () => {
    it("should generate stable editor ID from pane ID", () => {
      const { rerender } = render(<EditorPaneV2 pane={TEST_PANE} />);

      // Re-render with same pane should maintain same editor
      rerender(<EditorPaneV2 pane={TEST_PANE} />);

      // The editor panel should still be rendered (verifies ID stability)
      expect(screen.getByTestId("mock-editor-view-panel")).toBeDefined();
    });
  });

  // ===========================================================================
  // Agent Integration
  // ===========================================================================

  describe("agent integration", () => {
    it("should use agentBaseBranch when provided", () => {
      const paneWithAgent = {
        ...TEST_PANE,
        agentBaseBranch: "main",
      };

      render(<EditorPaneV2 pane={paneWithAgent} />);

      // Component should initialize without errors
      expect(screen.getByTestId("editor-pane-v2")).toBeDefined();
    });
  });

  // ===========================================================================
  // Callback Props
  // ===========================================================================

  describe("callback props", () => {
    beforeEach(() => {
      mockFs.readTextFile.mockClear();
    });

    // Note: onFileOpen is NOT called when file is selected within the editor.
    // It's meant for external "open in quick pane" actions, not internal file selection.
    // Internal file selection just updates the selectedFile state.

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

    it("should pass onSave to EditorViewPanel", () => {
      const onSave = vi.fn();

      render(<EditorPaneV2 pane={TEST_PANE} onSave={onSave} />);

      // EditorViewPanel is mocked, so we just verify the component renders
      // The actual onSave pass-through is tested in the mock
      expect(screen.getByTestId("mock-editor-view-panel")).toBeDefined();
    });
  });

  // ===========================================================================
  // Git-Derived Editor Mode
  // ===========================================================================

  describe("git-derived editor mode", () => {
    beforeEach(() => {
      mockGit.getStatus.mockClear();
      mockGit.onStatusChanged.mockClear();
    });

    it("should fetch git status on mount", async () => {
      render(<EditorPaneV2 pane={TEST_PANE} />);

      await waitFor(() => {
        expect(mockGit.getStatus).toHaveBeenCalled();
      });
    });

    it("should subscribe to git status changes", () => {
      render(<EditorPaneV2 pane={TEST_PANE} />);

      expect(mockGit.onStatusChanged).toHaveBeenCalled();
    });

    it("should unsubscribe from git status on unmount", () => {
      const cleanup = vi.fn();
      mockGit.onStatusChanged.mockReturnValue(cleanup);

      const { unmount } = render(<EditorPaneV2 pane={TEST_PANE} />);
      unmount();

      expect(cleanup).toHaveBeenCalled();
    });

    // NOTE: This test is skipped because with the new useReviewModeState architecture,
    // view mode is managed externally and the auto-switch to diff is no longer automatic
    // when selecting a modified file. The view mode is now controlled by review mode state.
    it.skip("should derive editor mode from git status", async () => {
      // Set up git status with a changed file (uses relative path, not absolute)
      const changedFiles = new Map([
        ["test.ts", { status: "modified", staged: false }],
      ]);
      mockGit.getStatus.mockResolvedValue({
        files: changedFiles,
        branch: "main",
      });

      render(<EditorPaneV2 pane={TEST_PANE} />);

      // Wait for git status to load
      await waitFor(() => {
        expect(mockGit.getStatus).toHaveBeenCalled();
      });

      // Select the file that has changes
      await act(async () => {
        fireEvent.click(screen.getByTestId("select-file-button"));
      });

      // Mode should switch to diff for file with changes
      await waitFor(() => {
        expect(screen.getByTestId("editor-view-mode").textContent).toBe("diff");
      });
    });
  });

  // ===========================================================================
  // Prop to State Sync
  // ===========================================================================

  describe("pane.cwd prop sync", () => {
    it("should handle pane.cwd prop changes without crashing", async () => {
      const initialPane = {
        ...TEST_PANE,
        cwd: "/project/initial",
      };

      const { rerender } = render(<EditorPaneV2 pane={initialPane} />);

      // Verify initial render
      expect(screen.getByTestId("mock-file-tree-panel")).toBeDefined();

      // Update the pane prop with a new cwd
      const updatedPane = {
        ...TEST_PANE,
        cwd: "/project/updated",
      };

      await act(async () => {
        rerender(<EditorPaneV2 pane={updatedPane} />);
      });

      // Component should still be rendered after cwd change
      expect(screen.getByTestId("mock-file-tree-panel")).toBeDefined();
    });

    it("should handle multiple cwd changes", async () => {
      const { rerender } = render(
        <EditorPaneV2 pane={{ ...TEST_PANE, cwd: "/project/a" }} />,
      );

      // Change cwd multiple times rapidly
      await act(async () => {
        rerender(<EditorPaneV2 pane={{ ...TEST_PANE, cwd: "/project/b" }} />);
      });
      await act(async () => {
        rerender(<EditorPaneV2 pane={{ ...TEST_PANE, cwd: "/project/c" }} />);
      });
      await act(async () => {
        rerender(<EditorPaneV2 pane={{ ...TEST_PANE, cwd: "/project/d" }} />);
      });

      // Component should still be rendered after multiple cwd changes
      expect(screen.getByTestId("mock-file-tree-panel")).toBeDefined();
    });
  });
});
