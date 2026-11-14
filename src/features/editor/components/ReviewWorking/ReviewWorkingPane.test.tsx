import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GitSubscription } from "@features/git/client/GitSubscription";
import { gitKeys } from "@features/git/client/queries";
import type { GitFileStatus, GitStatus } from "@features/git/model";
import { createQueryClient } from "@/query";
import { ReviewWorkingPane } from "./ReviewWorkingPane";
import { FileEditor } from "../shared/FileEditor";
import { TooltipProvider } from "@/ui/tooltip";
import { queryWrapper } from "../../../../../tests/renderer/queryRender";
import { mockGitReads, mockGitWrites } from "../../../../../tests/renderer/git";

// ============================================================================
// Test Utilities
// ============================================================================

const TEST_CWD = "/project";

// The git subscription the pane gets as a prop
const git = {
  cwd: TEST_CWD,
  watchedSince: 0,
  whenReady: async () => {},
} as unknown as GitSubscription;

let reads: ReturnType<typeof mockGitReads>;
let writes: ReturnType<typeof mockGitWrites>;

beforeEach(() => {
  reads = mockGitReads();
  writes = mockGitWrites();
  // happy-dom has no window.confirm, so tests provide the revert confirmation
  window.confirm = vi.fn(() => true);
});

function renderWithProviders(ui: ReactElement, queryClient?: QueryClient) {
  return render(<TooltipProvider>{ui}</TooltipProvider>, {
    wrapper: queryWrapper(queryClient),
  });
}

function createMockStatus(files: GitFileStatus[]): GitStatus {
  return {
    branch: "main",
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    files: new Map(files.map((file) => [file.path, { ...file }])),
  };
}

const unstaged: GitFileStatus = {
  path: "src/file.ts",
  status: "modified",
  staged: false,
};
const staged: GitFileStatus = { ...unstaged, staged: true };

// Mock EditorPane components - we don't need to test the actual editors
vi.mock("../EditorPanel/DiffEditorWrapper", () => ({
  DiffEditorWrapper: ({ filePath, readOnly }: any) => (
    <div
      data-testid="mock-diff-editor"
      data-filepath={filePath}
      data-readonly={readOnly}
    >
      Mock Diff Editor for {filePath}
    </div>
  ),
}));

vi.mock("../EditorPanel/RegularEditorWrapper", () => ({
  RegularEditorWrapper: ({ filePath }: any) => (
    <div data-testid="mock-regular-editor" data-filepath={filePath}>
      Mock Regular Editor for {filePath}
    </div>
  ),
}));

vi.mock("../EditorPanel/constants", () => ({
  EDITOR_MAX_HEIGHT: 400,
}));

// ============================================================================
// FileEditor Tests (inline working mode)
// ============================================================================

describe("FileEditor (inline working mode)", () => {
  function renderEditor({
    status = { path: "src/test.ts", status: "modified", staged: false },
    isExpanded = false,
    onToggle = () => {},
  }: {
    status?: GitFileStatus;
    isExpanded?: boolean;
    onToggle?: () => void;
  } = {}) {
    renderWithProviders(
      <FileEditor
        layout="inline"
        context="working"
        filePath="src/test.ts"
        cwd={TEST_CWD}
        git={git}
        status={status}
        isExpanded={isExpanded}
        onToggle={onToggle}
      />,
    );
  }

  describe("rendering", () => {
    it("should render the file header", () => {
      renderEditor();

      expect(screen.getByTestId("editor-toolbar")).toBeDefined();
      expect(screen.getByText("src/test.ts")).toBeDefined();
    });

    it("should show git status badge", () => {
      renderEditor();

      // Modified status shows "M" badge
      expect(screen.getByTitle("Modified")).toBeDefined();
    });

    it("should not show diff editor when collapsed", () => {
      renderEditor({ isExpanded: false });

      expect(screen.queryByTestId("file-editor-content")).toBeNull();
    });

    it("should show diff editor when expanded", () => {
      renderEditor({ isExpanded: true });

      expect(
        screen.getByText(/^Mock Diff Editor for .*\/src\/test\.ts$/),
      ).toBeDefined();
    });
  });

  describe("toggle", () => {
    it("should call onToggle when header is clicked", () => {
      const onToggle = vi.fn();
      renderEditor({ onToggle });

      // Click on the toolbar header (not the file path which copies to clipboard)
      fireEvent.click(screen.getByTestId("editor-toolbar"));

      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe("action buttons - unstaged file", () => {
    it("should call git.stage when stage button is clicked", async () => {
      renderEditor();

      fireEvent.click(screen.getByTestId("stage-button"));

      await waitFor(() => {
        expect(writes.stage).toHaveBeenCalledWith(TEST_CWD, ["src/test.ts"]);
      });
    });

    it("should call git.revert when revert button is clicked", async () => {
      renderEditor();

      fireEvent.click(screen.getByTestId("revert-button"));

      await waitFor(() => {
        expect(writes.revert).toHaveBeenCalledWith(TEST_CWD, ["src/test.ts"]);
      });
    });
  });

  describe("action buttons - staged file", () => {
    const status: GitFileStatus = {
      path: "src/test.ts",
      status: "modified",
      staged: true,
    };

    it("should not show stage or revert buttons for staged files", () => {
      renderEditor({ status });

      expect(screen.queryByTestId("stage-button")).toBeNull();
      expect(screen.queryByTestId("revert-button")).toBeNull();
    });

    it("should call git.unstage when unstage button is clicked", async () => {
      renderEditor({ status });

      fireEvent.click(screen.getByTestId("unstage-button"));

      await waitFor(() => {
        expect(writes.unstage).toHaveBeenCalledWith(TEST_CWD, ["src/test.ts"]);
      });
    });
  });

  describe("git status badges", () => {
    it.each([
      ["added", true, "Added (staged)"],
      ["deleted", false, "Deleted"],
      ["untracked", false, "Untracked"],
    ] as const)("should show %s status", (status, staged, title) => {
      renderEditor({ status: { path: "src/test.ts", status, staged } });

      expect(screen.getByTitle(title)).toBeDefined();
    });
  });
});

// ============================================================================
// ReviewWorkingPane Tests
// ============================================================================

describe("ReviewWorkingPane", () => {
  /** Render the pane over `files`, and wait for its list of them. */
  async function renderPane(files: GitFileStatus[], queryClient?: QueryClient) {
    reads.getStatus.mockResolvedValue(createMockStatus(files));
    renderWithProviders(
      <ReviewWorkingPane cwd={TEST_CWD} git={git} />,
      queryClient,
    );
    await screen.findByTestId("changes-list");
  }

  const commitInput = () =>
    screen.getByTestId<HTMLInputElement>("commit-message-input");
  const commitButton = () => screen.getByTestId("commit-button");
  const typeCommitMessage = (value: string) =>
    fireEvent.change(commitInput(), { target: { value } });

  describe("loading state", () => {
    it("should show loading state initially", async () => {
      reads.getStatus.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderWithProviders(<ReviewWorkingPane cwd={TEST_CWD} git={git} />);

      expect(screen.getByText("Loading changes...")).toBeDefined();
    });
  });

  describe("empty state", () => {
    it("should show empty state when no changes", async () => {
      reads.getStatus.mockResolvedValue(createMockStatus([]));

      renderWithProviders(<ReviewWorkingPane cwd={TEST_CWD} git={git} />);

      expect(await screen.findByText("No changes to review")).toBeDefined();
    });

    it.each([
      ["loading", () => new Promise(() => {}), "Loading changes..."],
      [
        "empty",
        () => Promise.resolve(createMockStatus([])),
        "No changes to review",
      ],
    ])("keeps the exit button while %s", async (_, getStatus, text) => {
      reads.getStatus.mockImplementation(getStatus);
      const onExitReview = vi.fn();

      renderWithProviders(
        <ReviewWorkingPane
          cwd={TEST_CWD}
          git={git}
          onExitReview={onExitReview}
        />,
      );

      expect(await screen.findByText(text)).toBeDefined();
      fireEvent.click(screen.getByTestId("exit-review-button"));
      expect(onExitReview).toHaveBeenCalledOnce();
    });
  });

  describe("listing changed files", () => {
    it("should list all changed files", async () => {
      await renderPane([
        { path: "src/file1.ts", status: "modified", staged: false },
        { path: "src/file2.ts", status: "added", staged: true },
        { path: "src/file3.ts", status: "deleted", staged: false },
      ]);

      expect(screen.getByText("src/file1.ts")).toBeDefined();
      expect(screen.getByText("src/file2.ts")).toBeDefined();
      expect(screen.getByText("src/file3.ts")).toBeDefined();
    });

    it("should group files by staged status", async () => {
      await renderPane([
        { path: "src/staged.ts", status: "modified", staged: true },
        { path: "src/unstaged.ts", status: "modified", staged: false },
      ]);

      expect(screen.getByTestId("section-staged-changes")).toBeDefined();
      expect(screen.getByTestId("section-changes")).toBeDefined();
      expect(screen.getByText("Staged Changes")).toBeDefined();
      expect(screen.getByText("Changes")).toBeDefined();
    });
  });

  describe("expand/collapse individual files", () => {
    it("should auto-expand files on mount and allow collapsing", async () => {
      await renderPane([unstaged]);

      expect(await screen.findByTestId("file-editor-content")).toBeDefined();

      // Click on toolbar header to collapse (not file path which copies to clipboard)
      fireEvent.click(screen.getByTestId("editor-toolbar"));

      await waitFor(() => {
        expect(screen.queryByTestId("file-editor-content")).toBeNull();
      });
    });

    it("should re-expand file when header is clicked after collapse", async () => {
      await renderPane([unstaged]);
      expect(await screen.findByTestId("file-editor-content")).toBeDefined();

      // Collapse (click toolbar, not file path which copies to clipboard)
      fireEvent.click(screen.getByTestId("editor-toolbar"));
      await waitFor(() => {
        expect(screen.queryByTestId("file-editor-content")).toBeNull();
      });

      // Re-expand
      fireEvent.click(screen.getByTestId("editor-toolbar"));
      expect(await screen.findByTestId("file-editor-content")).toBeDefined();
    });
  });

  describe("expand/collapse all", () => {
    it("should auto-expand all files on mount", async () => {
      await renderPane([
        { path: "src/file1.ts", status: "modified", staged: false },
        { path: "src/file2.ts", status: "added", staged: false },
      ]);

      await waitFor(() => {
        expect(screen.getAllByTestId("file-editor-content")).toHaveLength(2);
      });
    });
  });

  describe("section collapse", () => {
    it("should collapse staged section when header is clicked", async () => {
      await renderPane([staged]);
      expect(screen.getByText("src/file.ts")).toBeDefined();

      fireEvent.click(screen.getByText("Staged Changes"));

      await waitFor(() => {
        expect(screen.queryByText("src/file.ts")).toBeNull();
      });
    });
  });

  describe("stage/unstage from review pane", () => {
    it("should stage file from review pane", async () => {
      await renderPane([unstaged]);

      fireEvent.click(screen.getByTestId("stage-button"));

      await waitFor(() => {
        expect(writes.stage).toHaveBeenCalledWith(TEST_CWD, ["src/file.ts"]);
      });
    });

    it("should unstage file from review pane", async () => {
      await renderPane([staged]);

      fireEvent.click(screen.getByTestId("unstage-button"));

      await waitFor(() => {
        expect(writes.unstage).toHaveBeenCalledWith(TEST_CWD, ["src/file.ts"]);
      });
    });
  });

  describe("commit form", () => {
    it("should disable commit button when no staged files", async () => {
      await renderPane([unstaged]);
      typeCommitMessage("Test commit");

      expect(commitButton().hasAttribute("disabled")).toBe(true);
    });

    it("should disable commit button when message is empty", async () => {
      await renderPane([staged]);

      expect(commitButton().hasAttribute("disabled")).toBe(true);
    });

    it("should enable commit button when staged files and message exist", async () => {
      await renderPane([staged]);
      typeCommitMessage("Test commit");

      expect(commitButton().hasAttribute("disabled")).toBe(false);
    });

    it("should call git.commit and clear the message when commit button is clicked", async () => {
      await renderPane([staged]);
      typeCommitMessage("Test commit message");

      fireEvent.click(commitButton());

      await waitFor(() => {
        expect(writes.commit).toHaveBeenCalledWith(
          TEST_CWD,
          "Test commit message",
        );
      });
      await waitFor(() => expect(commitInput().value).toBe(""));
    });

    it("should re-enable commit and keep the message when commit fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      let fail!: (error: Error) => void;
      writes.commit.mockReturnValueOnce(
        new Promise((_, reject) => (fail = reject)),
      );
      await renderPane([staged]);
      typeCommitMessage("Test commit message");

      expect(commitButton().hasAttribute("disabled")).toBe(false);
      fireEvent.click(commitButton());
      await waitFor(() => {
        expect(commitButton().hasAttribute("disabled")).toBe(true);
      });

      await act(async () => fail(new Error("boom")));

      await waitFor(() => {
        expect(commitButton().hasAttribute("disabled")).toBe(false);
      });
      expect(commitInput().value).toBe("Test commit message");
    });

    it("should disable pull and push while committing", async () => {
      let finish!: () => void;
      writes.commit.mockReturnValueOnce(
        new Promise<void>((resolve) => (finish = resolve)),
      );
      await renderPane([staged]);
      typeCommitMessage("Test commit message");

      const remoteButtons = () =>
        ["pull-button", "push-button"].map((id) =>
          screen.getByTestId(id).hasAttribute("disabled"),
        );
      await waitFor(() => expect(remoteButtons()).toEqual([false, false]));
      fireEvent.click(commitButton());
      await waitFor(() => expect(remoteButtons()).toEqual([true, true]));

      await act(async () => finish());
      await waitFor(() => expect(remoteButtons()).toEqual([false, false]));
    });
  });

  describe("real-time updates", () => {
    it("lists the status the watcher writes to the shared cache", async () => {
      const queryClient = createQueryClient();
      await renderPane(
        [{ path: "src/before.ts", status: "modified", staged: false }],
        queryClient,
      );
      expect(screen.getByText("src/before.ts")).toBeDefined();

      act(() => {
        queryClient.setQueryData(
          gitKeys.status(TEST_CWD),
          createMockStatus([
            { path: "src/after.ts", status: "added", staged: true },
          ]),
        );
      });

      expect(await screen.findByText("src/after.ts")).toBeDefined();
      expect(screen.queryByText("src/before.ts")).toBeNull();
      expect(reads.getStatus).toHaveBeenCalledTimes(1);
      expect(reads.getStatus).toHaveBeenCalledWith(TEST_CWD);
    });
  });

  describe("error handling", () => {
    it("should handle stage errors gracefully", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      writes.stage.mockRejectedValue(new Error("Stage failed"));
      await renderPane([unstaged]);

      fireEvent.click(screen.getByTestId("stage-button"));

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          "[mutation] Failed",
          expect.arrayContaining(["stage"]),
          expect.any(Error),
        );
      });

      consoleSpy.mockRestore();
    });

    it("should handle commit errors gracefully", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      writes.commit.mockRejectedValue(new Error("Commit failed"));
      await renderPane([staged]);

      typeCommitMessage("Test");
      fireEvent.click(commitButton());

      expect(
        await screen.findByText("Failed to commit: Commit failed"),
      ).toBeDefined();

      consoleSpy.mockRestore();
    });
  });
});
