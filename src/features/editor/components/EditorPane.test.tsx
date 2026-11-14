import { applyGitStatus } from "@features/git/client/queries";
import type {
  GitFileStatus,
  GitStatus,
  HistoryCommit,
} from "@features/git/model";
import { createQueryClient } from "@/query";
import type { QueryClient } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useState, type ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  registerEditorHandlers,
  type EditorCommandHandlers,
} from "@features/editor/client/editorCommandHandlers";
import { TabContentPortalProvider } from "@features/workbench/components/layout/normal/TabContentPortalContext";
import { TabLayout } from "@features/workbench/components/layout/normal/TabLayout";
import type {
  EditorPane as EditorPaneConfig,
  LayoutNode,
  Pane,
  TerminalPane,
} from "@features/workbench/model";
import { EditorPane, type EditorPaneProps } from "./EditorPane";
import { GlobalEditorContainer } from "./GlobalEditorContainer";
import type { BranchSelectorProps } from "./FileTreePanel/BranchSelector";
import type { FileTreePanelProps } from "./FileTreePanel/FileTreePanel";
import type { EditorPanelProps } from "./EditorPanel/EditorPanel";
import type { TreeResizerProps } from "./TreeResizer";
import { DISABLED_TRACKING } from "./hooks/useFileChangeTracking";
import type { UnseenTrackingResult } from "./hooks/useUnseenTracking";
import { TooltipProvider } from "@/ui/tooltip";
import { EditorPaneRegistry } from "../client/EditorPaneRegistry";
import { activeTabIdAtom, tabsAtom } from "@features/workbench/client/atoms";
import { mockFiles } from "../../../../tests/renderer/files";
import { mockGitReads, mockGitWrites } from "../../../../tests/renderer/git";
import { render as renderWithQuery } from "../../../../tests/renderer/queryRender";

// The tab layout's browser pane reads the preload API when it loads
vi.hoisted(() => {
  Object.assign(window, { conduit: {} });
});

// Each render gets a fresh QueryClient, and reportStatus stands in for the
// git watcher reporting to it
let queryClient: QueryClient;
function render(ui: ReactElement) {
  queryClient = createQueryClient();
  return renderWithQuery(ui, { queryClient });
}
const reportStatus = (status: GitStatus | null) =>
  act(async () => applyGitStatus(queryClient, mockGit.cwd, status));

// Runs an editor command (like Cmd+B) as the command system does
const runEditorCommand = (name: keyof EditorCommandHandlers) =>
  act(() => vi.mocked(registerEditorHandlers).mock.calls.at(-1)![1][name]!());

// ============================================================================
// Mocks
// ============================================================================

const mockLayout = vi.fn();
const mockMarkSeen = vi.fn();

vi.mock("./hooks/useResponsiveLayout", () => ({
  useResponsiveLayout: () => mockLayout(),
}));

vi.mock("./hooks/useUnseenTracking", () => ({
  useUnseenTracking: (): UnseenTrackingResult => ({
    isUnseen: () => false,
    getTimestamp: () => null,
    markSeen: mockMarkSeen,
    markAllSeen: () => {},
    getUnseenCount: () => 0,
    unseenCount: 0,
    sortByTimestamp: (files) => files,
    handlePathRename: () => {},
    tracking: DISABLED_TRACKING,
  }),
}));

vi.mock("./hooks/useModelState", () => ({
  useModelState: () => null, // Returns null when no model exists (file not loaded)
}));

vi.mock("./hooks/useAutoOpenFile", () => ({
  useAutoOpenFile: vi.fn(), // Auto-open file hook (does nothing in tests)
}));

vi.mock("@features/editor/client/editorCommandHandlers", () => ({
  registerEditorHandlers: vi.fn(() => vi.fn()),
}));

const mockFs = {
  release: vi.fn(),
};
vi.mock("@features/files/components/useFileSystemSubscription", () => ({
  useFileSystemSubscription: () => mockFs,
}));

const mockGit = {
  cwd: "/project",
  onStatusChanged: vi.fn().mockReturnValue(() => {}),
  whenReady: vi.fn().mockResolvedValue(undefined),
  release: vi.fn(),
};
vi.mock("@features/git/components/useGitSubscription", () => ({
  useGitSubscription: () => mockGit,
}));

const COMMIT: HistoryCommit = {
  id: "abc1234",
  shortId: "abc1234",
  subject: "Commit",
  message: "Commit",
  author: "Test",
  authorEmail: "test@example.com",
  timestamp: 0,
  parentIds: ["def5678"],
};

vi.mock("./FileTreePanel/FileTreePanel", () => ({
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
    onCommit,
    onCommitMessageChange,
  }: FileTreePanelProps) => (
    <div>
      <span data-testid="tree-cwd">{cwd}</span>
      <input
        data-testid="commit-message-input"
        onChange={(e) => onCommitMessageChange?.(e.target.value)}
      />
      <button data-testid="commit-button" onClick={() => onCommit?.()}>
        Commit
      </button>
      {showCollapseButton && (
        <button data-testid="collapse-toggle-button" onClick={onToggleCollapse}>
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
            onViewCommit?.({
              commitId: COMMIT.id,
              parentCommitId: "def5678",
              commit: COMMIT,
            })
          }
        >
          View Commit
        </button>
      </div>
      <button
        data-testid="select-commit-file-button"
        onClick={() =>
          onCommitFileSelect?.({
            commitId: COMMIT.id,
            parentCommitId: "def5678",
            file: {
              path: "test.ts",
              status: "modified",
              additions: 1,
              deletions: 0,
              isBinary: false,
            },
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
          onFileSelect(
            { path: "/project/test.ts", name: "test.ts", type: "file" },
            null,
          )
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
}));

vi.mock("./FileTreePanel/BranchSelector", () => ({
  BranchSelector: ({ onSelectBranch }: BranchSelectorProps) => (
    <button
      data-testid="select-branch-button"
      onClick={() => onSelectBranch("test-branch")}
    >
      Select Branch
    </button>
  ),
}));

vi.mock("./EditorPanel/EditorPanel", () => ({
  EditorPanel: ({
    selectedFile,
    viewMode,
    onBack,
    onExitReview,
    onExitCommitMode,
  }: EditorPanelProps) => (
    <div>
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
}));

vi.mock("./TreeResizer", () => ({
  TreeResizer: ({ onResize, currentWidth }: TreeResizerProps) => (
    <div
      data-testid="mock-tree-resizer"
      onClick={() => onResize(currentWidth + 50)}
    >
      Resizer ({currentWidth}px)
    </div>
  ),
}));

// A tab's terminals render nothing here, so the pills counted are the tab's
// and its editors'
vi.mock("@features/terminal/components/TerminalPane", () => ({
  TerminalPane: () => null,
}));

// ============================================================================
// Test Data
// ============================================================================

const TEST_PANE: EditorPaneConfig = {
  id: "test-editor-1",
  type: "editor",
  cwd: "/project",
};

/** An entry for a modified file in a git status */
const changed = (path: string, staged = false): [string, GitFileStatus] => [
  path,
  { path, status: "modified", staged },
];

/** The status of a repository on main, with the given changes */
const statusWith = (...files: [string, GitFileStatus][]): GitStatus => ({
  branch: "main",
  ahead: 0,
  behind: 0,
  files: new Map(files),
});

const DIRTY = statusWith(changed("test.ts"));
const CLEAN = statusWith();

// The IPC calls file and git reads make, mocked afresh for each test with an
// empty status on main. findRoot is null so the pane reads no per-file diff
// stats, which these tests don't cover.
let reads: ReturnType<typeof mockGitReads>;
beforeEach(() => {
  vi.clearAllMocks();
  mockFiles();
  reads = mockGitReads();
  reads.getStatus.mockResolvedValue(CLEAN);
  reads.getCurrentBranch.mockResolvedValue("main");
  mockLayout.mockReturnValue("split");
  localStorage.clear();
});

/** Renders the pane on /project, with any changes to its config and props */
function renderPane(
  config: Partial<EditorPaneConfig> = {},
  props: Partial<EditorPaneProps> = {},
) {
  return render(<EditorPane pane={{ ...TEST_PANE, ...config }} {...props} />);
}

/** Renders the pane in its changes view, with test.ts modified */
async function renderDirty(props: Partial<EditorPaneProps> = {}) {
  reads.getStatus.mockResolvedValue(DIRTY);
  renderPane({ treeMode: "changes" }, props);
  await reportStatus(DIRTY);
}

/** Commits test.ts, which takes it out of the changes */
async function commitAway() {
  reads.getStatus.mockResolvedValue(CLEAN);
  await reportStatus(CLEAN);
}

const text = (testId: string) => screen.getByTestId(testId).textContent;

/** Which of the pane's sides show */
function shown() {
  const tree = !screen.getByTestId("tree-container").hidden;
  const editor = !screen.getByTestId("editor-container").hidden;
  return tree && editor ? "both" : tree ? "tree" : "editor";
}

// ============================================================================
// Tests
// ============================================================================

describe("EditorPane", () => {
  describe("basic rendering", () => {
    it("should not render tree resizer in single mode", () => {
      mockLayout.mockReturnValue("single");

      renderPane();

      expect(screen.queryByTestId("mock-tree-resizer")).toBeNull();
    });
  });

  describe("initial state", () => {
    it("should initialize with no file selected when pane has no filePath", () => {
      renderPane();

      expect(text("editor-file-path")).toBe("no-file");
    });

    it("should initialize with file selected when pane has filePath", () => {
      renderPane({ file: "/project/src/index.ts" });

      expect(text("editor-file-path")).toBe("/project/src/index.ts");
    });

    it("should initialize with editor view mode", () => {
      renderPane();

      expect(text("editor-view-mode")).toBe("editor");
    });

    it("should initialize tree view mode from pane treeMode", () => {
      renderPane({ treeMode: "changes" });

      expect(text("tree-view-mode")).toBe("changes");
    });
  });

  describe("file selection", () => {
    it("should select the file and mark it seen when file is selected from tree", () => {
      renderPane();

      fireEvent.click(screen.getByTestId("select-file-button"));

      expect(text("editor-file-path")).toBe("/project/test.ts");
      expect(mockMarkSeen).toHaveBeenCalledWith("test.ts");
    });
  });

  describe("tree view mode", () => {
    it("should toggle tree view mode", () => {
      renderPane();
      expect(text("tree-view-mode")).toBe("files");

      fireEvent.click(screen.getByTestId("toggle-tree-mode"));

      expect(text("tree-view-mode")).toBe("changes");
    });

    it("should persist tree view mode to localStorage", () => {
      renderPane();

      fireEvent.click(screen.getByTestId("toggle-tree-mode"));

      expect(localStorage.getItem("editor:treeViewMode")).toBe("changes");
    });
  });

  describe("tree resizing", () => {
    it("should update tree width when resizer is used", () => {
      renderPane();
      const resizer = screen.getByTestId("mock-tree-resizer");
      expect(resizer.textContent).toContain("220px"); // Default width

      fireEvent.click(resizer);

      expect(resizer.textContent).toContain("270px"); // 220 + 50
    });

    it("should persist tree width to localStorage", () => {
      renderPane();

      fireEvent.click(screen.getByTestId("mock-tree-resizer"));

      expect(localStorage.getItem("editor:treeWidth")).toBe("270");
    });
  });

  describe("responsive layout", () => {
    it("should show both panels in split mode", () => {
      renderPane();

      expect(shown()).toBe("both");
    });

    it("should show only tree panel initially in single mode", () => {
      mockLayout.mockReturnValue("single");

      renderPane();

      expect(shown()).toBe("tree");
    });

    // With a file open, only the exit handler can bring the tree back,
    // since an empty editor side shows the tree on its own.
    function openFileAndGoBack() {
      fireEvent.click(screen.getByTestId("select-file-button"));
      expect(shown()).toBe("editor");
      fireEvent.click(screen.getByTestId("back-button"));
      expect(shown()).toBe("tree");
    }

    it("should swap the tree for review in single mode and back on exit", () => {
      mockLayout.mockReturnValue("single");
      renderPane();
      openFileAndGoBack();

      fireEvent.click(screen.getByTestId("review-changes-button"));
      expect(shown()).toBe("editor");

      fireEvent.click(screen.getByTestId("exit-review-button"));
      expect(shown()).toBe("tree");
    });

    it.each(["view-commit-button", "select-commit-file-button"])(
      "should swap the tree for a commit in single mode and back on exit (%s)",
      (openCommit) => {
        mockLayout.mockReturnValue("single");
        renderPane();
        openFileAndGoBack();

        fireEvent.click(screen.getByTestId(openCommit));
        expect(shown()).toBe("editor");

        fireEvent.click(screen.getByTestId("exit-commit-button"));
        expect(shown()).toBe("tree");
      },
    );

    it("should return to the tree in single mode when the open file is committed away, and tell the parent", async () => {
      mockLayout.mockReturnValue("single");
      const onClearFile = vi.fn();
      await renderDirty({ onClearFile });

      fireEvent.click(screen.getByTestId("select-changes-file-button"));
      await waitFor(() => {
        expect(shown()).toBe("editor");
      });

      await commitAway();

      await waitFor(() => {
        expect(text("editor-file-path")).toBe("no-file");
        // So its tab stops naming the file. The pane tells it from an effect,
        // which can run after the render that cleared the file.
        expect(onClearFile).toHaveBeenCalledTimes(1);
      });
      expect(shown()).toBe("tree");
    });

    it("should show the tree in split mode when the open file goes away while it's collapsed", async () => {
      await renderDirty();

      fireEvent.click(screen.getByTestId("select-changes-file-button"));
      await waitFor(() => {
        expect(text("editor-file-path")).toBe("/project/test.ts");
      });
      fireEvent.click(screen.getByTestId("collapse-toggle-button"));
      expect(shown()).toBe("editor");

      await commitAway();

      await waitFor(() => {
        expect(shown()).toBe("both");
      });
    });

    it("should keep the tree in split mode while there's no file to show instead", async () => {
      renderPane();

      expect(screen.queryByTestId("collapse-toggle-button")).toBeNull();
      await runEditorCommand("toggleSidebar");
      expect(shown()).toBe("both");

      // Opening a file doesn't collapse a tree that the toggle above left
      fireEvent.click(screen.getByTestId("select-file-button"));
      expect(shown()).toBe("both");
    });

    it("should toggle and reveal the tree in single mode", async () => {
      mockLayout.mockReturnValue("single");
      renderPane();
      fireEvent.click(screen.getByTestId("select-file-button"));
      await waitFor(() => {
        expect(shown()).toBe("editor");
      });

      await runEditorCommand("toggleSidebar");
      expect(shown()).toBe("tree");

      await runEditorCommand("toggleSidebar");
      expect(shown()).toBe("editor");

      await runEditorCommand("revealActiveFile");
      expect(shown()).toBe("tree");
    });
  });

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
      renderPane();
      await openFileFromTree();

      expect(document.activeElement).toBe(screen.getByTestId("editor-input"));
    });

    it("returns focus to where it was in the tree on back", async () => {
      renderPane();
      const treeButton = await openFileFromTree();

      const back = screen.getByTestId("back-button");
      back.focus();
      fireEvent.click(back);

      await waitFor(() => {
        expect(document.activeElement).toBe(treeButton);
      });
    });

    it("returns focus to the row of a hover-only button that opened a commit", async () => {
      renderPane();
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
      await renderDirty();
      const treeButton = await openFileFromTree("select-changes-file-button");

      await commitAway();

      await waitFor(() => {
        expect(document.activeElement).toBe(treeButton);
      });
    });

    it("leaves focus alone when it isn't on the side that hid", async () => {
      const outside = document.body.appendChild(
        document.createElement("input"),
      );
      renderPane();
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
      renderPane();

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
        renderPane();
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

  describe("callback props", () => {
    it("should call onFileChange with file content when file is selected", async () => {
      const onFileChange = vi.fn();
      renderPane({}, { onFileChange });

      fireEvent.click(screen.getByTestId("select-file-button"));

      // Monaco's model registry loads the content, so it isn't passed
      await waitFor(() => {
        expect(onFileChange).toHaveBeenCalledWith({
          file: "/project/test.ts",
          language: "typescript",
        });
      });
    });

    it("should call onTreeModeChange when tree mode changes", () => {
      const onTreeModeChange = vi.fn();
      renderPane({}, { onTreeModeChange });

      fireEvent.click(screen.getByTestId("toggle-tree-mode"));

      expect(onTreeModeChange).toHaveBeenCalledWith("changes");
    });

    it("should call onTreeModeChange with 'all' when switching back to files", () => {
      const onTreeModeChange = vi.fn();
      renderPane({ treeMode: "changes" }, { onTreeModeChange });

      fireEvent.click(screen.getByTestId("toggle-tree-mode"));

      expect(onTreeModeChange).toHaveBeenCalledWith("all");
    });
  });

  describe("git-derived editor mode", () => {
    it("should fetch git status on mount", async () => {
      renderPane();

      await waitFor(() => {
        expect(reads.getStatus).toHaveBeenCalledWith("/project");
      });
    });
  });

  describe("non-git CWD recovery", () => {
    const notARepo = () => {
      reads.getStatus.mockResolvedValue(null);
      reads.getCurrentBranch.mockResolvedValue(null);
    };

    it("should auto-switch from changes to files view when CWD is not a git repo", async () => {
      notARepo();

      renderPane({ treeMode: "changes" });
      expect(text("tree-view-mode")).toBe("changes");

      // Once the status shows it's not a repository
      await waitFor(() => {
        expect(text("tree-view-mode")).toBe("files");
      });
    });

    it("should stay in changes view when CWD is a git repo", async () => {
      renderPane({ treeMode: "changes" });

      await waitFor(() => {
        expect(reads.getStatus).toHaveBeenCalledWith("/project");
      });

      expect(text("tree-view-mode")).toBe("changes");
    });

    it("should auto-switch when the status becomes null", async () => {
      renderPane({ treeMode: "changes" });
      await waitFor(() => {
        expect(reads.getStatus).toHaveBeenCalledWith("/project");
      });
      expect(text("tree-view-mode")).toBe("changes");

      // The repository goes away
      await reportStatus(null);

      await waitFor(() => {
        expect(text("tree-view-mode")).toBe("files");
      });
    });

    it("should not switch when already in files view and CWD is not a git repo", async () => {
      notARepo();

      renderPane();
      await waitFor(() => {
        expect(reads.getStatus).toHaveBeenCalledWith("/project");
      });

      expect(text("tree-view-mode")).toBe("files");
    });
  });

  describe("pane.cwd prop sync", () => {
    it("should follow pane.cwd prop changes", async () => {
      const { rerender } = renderPane({ cwd: "/project/initial" });
      expect(text("tree-cwd")).toBe("/project/initial");

      await act(async () => {
        rerender(
          <EditorPane pane={{ ...TEST_PANE, cwd: "/project/updated" }} />,
        );
      });

      expect(text("tree-cwd")).toBe("/project/updated");
    });
  });

  describe("git action failures", () => {
    const hang = () => {
      let fail!: (error: Error) => void;
      const promise = new Promise((_, reject) => (fail = reject));
      return { promise, fail: (error: Error) => act(async () => fail(error)) };
    };

    let writes: ReturnType<typeof mockGitWrites>;

    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      writes = mockGitWrites();
    });

    it("can retry a failed commit", async () => {
      const staged = statusWith(changed("a.ts", true));
      reads.getStatus.mockResolvedValue(staged);
      const call = hang();
      writes.commit.mockReturnValueOnce(call.promise);
      renderPane();
      await reportStatus(staged);

      fireEvent.change(screen.getByTestId("commit-message-input"), {
        target: { value: "Fix bug" },
      });
      fireEvent.click(screen.getByTestId("commit-button"));
      await waitFor(() => expect(writes.commit).toHaveBeenCalledTimes(1));
      await call.fail(new Error("boom"));

      fireEvent.click(screen.getByTestId("commit-button"));
      await waitFor(() => {
        expect(writes.commit).toHaveBeenNthCalledWith(2, "/project", "Fix bug");
      });
    });
  });

  describe("branch comparison", () => {
    it("refreshes the comparison instead of showing HEAD status when files change", async () => {
      reads.getStatusFromBranch
        .mockResolvedValueOnce(new Map([changed("feature.ts")]))
        .mockResolvedValueOnce(
          new Map([changed("feature.ts"), changed("saved.ts")]),
        );

      renderPane();
      fireEvent.click(screen.getByTestId("select-branch-button"));
      await waitFor(() => {
        expect(text("tree-git-status")).toBe("feature.ts");
      });

      await reportStatus(statusWith(changed("saved.ts")));

      await waitFor(() => {
        expect(text("tree-git-status")).toBe("feature.ts,saved.ts");
      });
      expect(reads.getStatusFromBranch).toHaveBeenLastCalledWith(
        "/project",
        "test-branch",
      );
    });

    it("keeps listing HEAD's changes until the comparison loads", async () => {
      reads.getStatus.mockResolvedValue(statusWith(changed("head.ts")));
      let resolveComparison!: (files: Map<string, GitFileStatus>) => void;
      reads.getStatusFromBranch.mockReturnValueOnce(
        new Promise((resolve) => (resolveComparison = resolve)),
      );

      renderPane();
      await waitFor(() => {
        expect(text("tree-git-status")).toBe("head.ts");
      });

      fireEvent.click(screen.getByTestId("select-branch-button"));
      await waitFor(() => {
        expect(reads.getStatusFromBranch).toHaveBeenCalledWith(
          "/project",
          "test-branch",
        );
      });
      expect(text("tree-git-status")).toBe("head.ts");

      await act(async () => {
        resolveComparison(new Map([changed("feature.ts")]));
      });
      await waitFor(() => {
        expect(text("tree-git-status")).toBe("feature.ts");
      });
    });

    it("keeps an agent pane's comparison when HEAD status loads after it", async () => {
      let resolveHeadStatus!: (status: GitStatus) => void;
      reads.getStatus.mockReturnValueOnce(
        new Promise((resolve) => (resolveHeadStatus = resolve)),
      );
      reads.getStatusFromBranch.mockResolvedValueOnce(
        new Map([changed("feature.ts")]),
      );

      renderPane({ agentBaseBranch: "main" });
      await waitFor(() => {
        expect(text("tree-git-status")).toBe("feature.ts");
      });

      await act(async () => {
        resolveHeadStatus(statusWith(changed("saved.ts")));
      });

      expect(text("tree-git-status")).toBe("feature.ts");
    });
  });

  describe("pane.file prop sync", () => {
    it("opens an image in preview when the pane mounts on it", () => {
      renderPane({ file: "/project/pixel.png" });

      expect(text("editor-view-mode")).toBe("preview");
    });

    it("switches to preview when pane.file changes to an image", async () => {
      const { rerender } = renderPane({ file: "/project/src/index.ts" });
      expect(text("editor-view-mode")).toBe("editor");

      await act(async () => {
        rerender(
          <EditorPane pane={{ ...TEST_PANE, file: "/project/pixel.png" }} />,
        );
      });

      expect(text("editor-file-path")).toBe("/project/pixel.png");
      expect(text("editor-view-mode")).toBe("preview");
    });

    // Markdown supports preview too, so only an explicit reset keeps the
    // image's preview mode from carrying over to it
    it("opens the next file in the editor after an image", async () => {
      const { rerender } = renderPane({ file: "/project/pixel.png" });
      expect(text("editor-view-mode")).toBe("preview");

      await act(async () => {
        rerender(
          <EditorPane pane={{ ...TEST_PANE, file: "/project/notes.md" }} />,
        );
      });

      expect(text("editor-file-path")).toBe("/project/notes.md");
      expect(text("editor-view-mode")).toBe("editor");
    });

    // Tabs and the quick pane write the selection back to pane.file, which
    // must not be mistaken for an external open that resets the view
    it("keeps a modified file's diff when the parent echoes the selection", async () => {
      reads.getStatus.mockResolvedValue(DIRTY);
      function EchoingParent() {
        const [file, setFile] = useState<string>();
        return (
          <EditorPane
            pane={{ ...TEST_PANE, file }}
            onFileChange={(change) => setFile(change.file)}
          />
        );
      }

      render(<EchoingParent />);
      await waitFor(() => {
        expect(text("tree-git-status")).toBe("test.ts");
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("select-file-button"));
      });

      expect(text("editor-file-path")).toBe("/project/test.ts");
      expect(text("editor-view-mode")).toBe("diff");
    });
  });
});

describe("EditorPane in a tab", () => {
  const agentSession = {
    agentSessionId: "agent-1",
    agentBranchName: "agent/agent-1",
    agentBaseBranch: "main",
    agentRepoRoot: "/project",
    agentWorktreePath: "/worktrees/agent-1",
  };
  const editor: EditorPaneConfig = {
    id: "editor",
    type: "editor",
    cwd: "/worktrees/agent-1",
    ...agentSession,
  };
  const terminal = (
    id: string,
    fields: Partial<TerminalPane> = agentSession,
  ): TerminalPane => ({
    id,
    type: "terminal",
    sessionId: `session-${id}`,
    cwd: fields.agentWorktreePath ?? "/project",
    ...fields,
  });
  const row = (...paneIds: string[]): LayoutNode => ({
    id: "row",
    type: "split",
    direction: "row",
    children: paneIds.map((paneId) => ({
      id: `node-${paneId}`,
      type: "pane",
      paneId,
    })),
  });

  const setTab = (panes: Pane[], layout: LayoutNode) =>
    tabsAtom.set([
      {
        id: "tab-1",
        name: "Tab",
        panes: Object.fromEntries(panes.map((pane) => [pane.id, pane])),
        layout,
        activePaneId: panes[0]!.id,
      },
    ]);

  // Renders the tab the way the app does, with its editors in the global
  // container
  const renderTab = (panes: Pane[], layout: LayoutNode) => {
    setTab(panes, layout);
    activeTabIdAtom.set("tab-1");
    render(
      <TooltipProvider>
        <TabContentPortalProvider>
          <TabLayout
            handleContextMenu={vi.fn()}
            handleResizeStart={vi.fn()}
            resizingNode={null}
          />
          <GlobalEditorContainer />
        </TabContentPortalProvider>
      </TooltipProvider>,
    );
  };

  // Each agent pill has one Merge button
  const pills = () => document.querySelectorAll(".lucide-git-merge").length;
  const editorPills = () =>
    screen.getByTestId("editor-pane").querySelectorAll(".lucide-git-merge")
      .length;

  beforeEach(() => {
    EditorPaneRegistry.resetInstance();
  });

  afterEach(() => {
    tabsAtom.set([]);
    activeTabIdAtom.set(null);
  });

  it("shows one pill for a worktree copy laid out editor then terminal", () => {
    renderTab([editor, terminal("term")], row("editor", "term"));

    expect(pills()).toBe(1);
    expect(editorPills()).toBe(0);
  });

  it("shows one pill once a split puts a pane to the editor's right", () => {
    renderTab(
      [terminal("term"), editor, terminal("split")],
      row("term", "editor", "split"),
    );

    expect(pills()).toBe(1);
    expect(editorPills()).toBe(0);
  });

  it("shows the editor's own pill once the tab's panes stop sharing its session", () => {
    const layout = row("editor", "term");
    renderTab([editor, terminal("term")], layout);

    act(() => setTab([editor, terminal("term", { cwd: "/project" })], layout));

    expect(pills()).toBe(1);
    expect(editorPills()).toBe(1);
  });

  it("activates the editor's pane when the editor is clicked", () => {
    renderTab([terminal("term"), editor], row("term", "editor"));

    fireEvent.mouseDown(screen.getByTestId("editor-pane"));

    expect(tabsAtom.get()[0]!.activePaneId).toBe("editor");
  });

  it("merges from the editor's pill and closes the session's panes in its tab", async () => {
    const finalize = vi.fn().mockResolvedValue({ status: "merged" });
    Object.assign(window.conduit, { agents: { finalizeSession: finalize } });
    renderTab(
      [editor, terminal("term", { cwd: "/project" })],
      row("editor", "term"),
    );

    fireEvent.click(
      screen
        .getByTestId("editor-pane")
        .querySelector(".lucide-git-merge")!
        .closest("button")!,
    );

    await waitFor(() =>
      expect(Object.keys(tabsAtom.get()[0]!.panes)).toEqual(["term"]),
    );
    expect(finalize).toHaveBeenCalledWith("agent-1");
  });
});
