// @ts-nocheck
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { gitKeys } from "@/api/gitQueries";
import type { GitFileStatus, GitStatus } from "@/api/GitV2API";
import { createQueryClient } from "@/query";
import { ReviewWorkingPane } from "../../../../../src/renderer/components/panes/editor/components/ReviewWorking/ReviewWorkingPane";
import { FileEditor } from "../../../../../src/renderer/components/panes/editor/components/shared/FileEditor";
import { TooltipProvider } from "../../../../../src/renderer/components/ui/tooltip";
import { queryWrapper } from "../../../queryRender";

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Custom render that wraps components with required providers.
 */
function renderWithProviders(
  ui: React.ReactElement,
  queryClient?: QueryClient,
) {
  return render(<TooltipProvider>{ui}</TooltipProvider>, {
    wrapper: queryWrapper(queryClient),
  });
}

// ============================================================================
// Mocks
// ============================================================================

// Mock git API (passed as prop)
const mockGetStatus = vi.fn();
const mockStage = vi.fn();
const mockUnstage = vi.fn();
const mockRevert = vi.fn();
const mockCommit = vi.fn();

const mockGitApi = {
  cwd: "/project",
  watchedSince: 0,
  whenReady: vi.fn().mockResolvedValue(undefined),
  getStatus: mockGetStatus,
  stage: mockStage,
  unstage: mockUnstage,
  revert: mockRevert,
  commit: mockCommit,
  getFileContent: vi.fn(),
  getOriginalContent: vi.fn(),
};

// Mock EditorPane components - we don't need to test the actual editors
vi.mock(
  "../../../../../src/renderer/components/panes/editor/components/EditorPane",
  () => ({
    DiffEditorWrapper: ({ filePath, readOnly }: any) => (
      <div
        data-testid="mock-diff-editor"
        data-filepath={filePath}
        data-readonly={readOnly}
      >
        Mock Diff Editor for {filePath}
      </div>
    ),
    RegularEditorWrapper: ({ filePath }: any) => (
      <div data-testid="mock-regular-editor" data-filepath={filePath}>
        Mock Regular Editor for {filePath}
      </div>
    ),
    EDITOR_MAX_HEIGHT: 400,
  }),
);

// ============================================================================
// Test Data
// ============================================================================

function createMockStatus(
  files: Array<{
    path: string;
    status: GitFileStatus["status"];
    staged: boolean;
  }>,
): GitStatus {
  const fileMap = new Map<string, GitFileStatus>();
  for (const file of files) {
    fileMap.set(file.path, {
      path: file.path,
      status: file.status,
      staged: file.staged,
    });
  }
  return {
    branch: "main",
    upstream: "origin/main",
    ahead: 0,
    behind: 0,
    files: fileMap,
  };
}

const TEST_CWD = "/project";

// ============================================================================
// FileEditor Tests (inline working mode)
// ============================================================================

describe("FileEditor (inline working mode)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStage.mockResolvedValue(undefined);
    mockUnstage.mockResolvedValue(undefined);
    mockRevert.mockResolvedValue(undefined);
    // happy-dom has no window.confirm, so tests provide the revert confirmation
    window.confirm = vi.fn(() => true);
  });

  const defaultProps = {
    layout: "inline" as const,
    context: "working" as const,
    filePath: "src/test.ts",
    cwd: TEST_CWD,
    git: mockGitApi as any,
    status: { path: "src/test.ts", status: "modified" as const, staged: false },
    isExpanded: false,
    onToggle: vi.fn(),
  };

  describe("rendering", () => {
    it("should render the file header", () => {
      renderWithProviders(<FileEditor {...defaultProps} />);

      expect(screen.getByTestId("editor-toolbar")).toBeDefined();
      expect(screen.getByText("src/test.ts")).toBeDefined();
    });

    it("should show git status badge", () => {
      renderWithProviders(<FileEditor {...defaultProps} />);

      // Modified status shows "M" badge
      expect(screen.getByTitle("Modified")).toBeDefined();
    });

    it("should not show diff editor when collapsed", () => {
      renderWithProviders(<FileEditor {...defaultProps} isExpanded={false} />);

      expect(screen.queryByTestId("file-editor-content")).toBeNull();
    });

    it("should show diff editor when expanded", () => {
      renderWithProviders(<FileEditor {...defaultProps} isExpanded={true} />);

      expect(
        screen.getByText(/^Mock Diff Editor for .*\/src\/test\.ts$/),
      ).toBeDefined();
    });
  });

  describe("toggle", () => {
    it("should call onToggle when header is clicked", () => {
      const onToggle = vi.fn();
      renderWithProviders(<FileEditor {...defaultProps} onToggle={onToggle} />);

      // Click on the toolbar header (not the file path which copies to clipboard)
      fireEvent.click(screen.getByTestId("editor-toolbar"));

      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe("action buttons - unstaged file", () => {
    it("should call git.stage when stage button is clicked", async () => {
      renderWithProviders(<FileEditor {...defaultProps} />);

      fireEvent.click(screen.getByTestId("stage-button"));

      await waitFor(() => {
        expect(mockStage).toHaveBeenCalledWith(["src/test.ts"]);
      });
    });

    it("should call git.revert when revert button is clicked", async () => {
      renderWithProviders(<FileEditor {...defaultProps} />);

      fireEvent.click(screen.getByTestId("revert-button"));

      await waitFor(() => {
        expect(mockRevert).toHaveBeenCalledWith(["src/test.ts"]);
      });
    });
  });

  describe("action buttons - staged file", () => {
    const stagedProps = {
      ...defaultProps,
      status: {
        path: "src/test.ts",
        status: "modified" as const,
        staged: true,
      },
    };

    it("should not show stage or revert buttons for staged files", () => {
      renderWithProviders(<FileEditor {...stagedProps} />);

      expect(screen.queryByTestId("stage-button")).toBeNull();
      expect(screen.queryByTestId("revert-button")).toBeNull();
    });

    it("should call git.unstage when unstage button is clicked", async () => {
      renderWithProviders(<FileEditor {...stagedProps} />);

      fireEvent.click(screen.getByTestId("unstage-button"));

      await waitFor(() => {
        expect(mockUnstage).toHaveBeenCalledWith(["src/test.ts"]);
      });
    });
  });

  describe("git status badges", () => {
    it("should show added status", () => {
      renderWithProviders(
        <FileEditor
          {...defaultProps}
          status={{ path: "src/new.ts", status: "added", staged: true }}
        />,
      );

      expect(screen.getByTitle("Added (staged)")).toBeDefined();
    });

    it("should show deleted status", () => {
      renderWithProviders(
        <FileEditor
          {...defaultProps}
          status={{ path: "src/old.ts", status: "deleted", staged: false }}
        />,
      );

      expect(screen.getByTitle("Deleted")).toBeDefined();
    });

    it("should show untracked status", () => {
      renderWithProviders(
        <FileEditor
          {...defaultProps}
          status={{
            path: "src/untracked.ts",
            status: "untracked",
            staged: false,
          }}
        />,
      );

      expect(screen.getByTitle("Untracked")).toBeDefined();
    });
  });
});

// ============================================================================
// ReviewWorkingPane Tests
// ============================================================================

describe("ReviewWorkingPane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetStatus.mockReset();
    mockStage.mockResolvedValue(undefined);
    mockUnstage.mockResolvedValue(undefined);
    mockRevert.mockResolvedValue(undefined);
    mockCommit.mockResolvedValue({
      hash: "abc123",
      shortHash: "abc",
      message: "test",
    });
  });

  describe("loading state", () => {
    it("should show loading state initially", async () => {
      mockGetStatus.mockImplementation(() => new Promise(() => {})); // Never resolves

      renderWithProviders(
        <ReviewWorkingPane cwd={TEST_CWD} git={mockGitApi as any} />,
      );

      expect(screen.getByText("Loading changes...")).toBeDefined();
    });
  });

  describe("empty state", () => {
    it("should show empty state when no changes", async () => {
      mockGetStatus.mockResolvedValue(createMockStatus([]));

      renderWithProviders(
        <ReviewWorkingPane cwd={TEST_CWD} git={mockGitApi as any} />,
      );

      await waitFor(() => {
        expect(screen.getByText("No changes to review")).toBeDefined();
      });
    });

    it.each([
      ["loading", () => new Promise(() => {}), "Loading changes..."],
      [
        "empty",
        () => Promise.resolve(createMockStatus([])),
        "No changes to review",
      ],
    ])("keeps the exit button while %s", async (_, getStatus, text) => {
      mockGetStatus.mockImplementation(getStatus);
      const onExitReview = vi.fn();

      renderWithProviders(
        <ReviewWorkingPane
          cwd={TEST_CWD}
          git={mockGitApi as any}
          onExitReview={onExitReview}
        />,
      );

      await waitFor(() => {
        expect(screen.getByText(text)).toBeDefined();
      });
      fireEvent.click(screen.getByTestId("exit-review-button"));
      expect(onExitReview).toHaveBeenCalledOnce();
    });
  });

  describe("listing changed files", () => {
    it("should list all changed files", async () => {
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file1.ts", status: "modified", staged: false },
          { path: "src/file2.ts", status: "added", staged: true },
          { path: "src/file3.ts", status: "deleted", staged: false },
        ]),
      );

      renderWithProviders(
        <ReviewWorkingPane cwd={TEST_CWD} git={mockGitApi as any} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("changes-list")).toBeDefined();
      });

      // Check files are listed
      expect(screen.getByText("src/file1.ts")).toBeDefined();
      expect(screen.getByText("src/file2.ts")).toBeDefined();
      expect(screen.getByText("src/file3.ts")).toBeDefined();
    });

    it("should group files by staged status", async () => {
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/staged.ts", status: "modified", staged: true },
          { path: "src/unstaged.ts", status: "modified", staged: false },
        ]),
      );

      renderWithProviders(
        <ReviewWorkingPane cwd={TEST_CWD} git={mockGitApi as any} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("section-staged-changes")).toBeDefined();
        expect(screen.getByTestId("section-changes")).toBeDefined();
      });

      // Check section headers
      expect(screen.getByText("Staged Changes")).toBeDefined();
      expect(screen.getByText("Changes")).toBeDefined();
    });
  });

  describe("expand/collapse individual files", () => {
    it("should auto-expand files on mount and allow collapsing", async () => {
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file.ts", status: "modified", staged: false },
        ]),
      );

      renderWithProviders(
        <ReviewWorkingPane cwd={TEST_CWD} git={mockGitApi as any} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("changes-list")).toBeDefined();
      });

      // Files should auto-expand on mount
      await waitFor(() => {
        expect(screen.getByTestId("file-editor-content")).toBeDefined();
      });

      // Click on toolbar header to collapse (not file path which copies to clipboard)
      fireEvent.click(screen.getByTestId("editor-toolbar"));

      // Wait for collapse to occur
      await waitFor(() => {
        expect(screen.queryByTestId("file-editor-content")).toBeNull();
      });
    });

    it("should re-expand file when header is clicked after collapse", async () => {
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file.ts", status: "modified", staged: false },
        ]),
      );

      renderWithProviders(
        <ReviewWorkingPane cwd={TEST_CWD} git={mockGitApi as any} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("changes-list")).toBeDefined();
      });

      // Files start expanded
      await waitFor(() => {
        expect(screen.getByTestId("file-editor-content")).toBeDefined();
      });

      // Collapse (click toolbar, not file path which copies to clipboard)
      fireEvent.click(screen.getByTestId("editor-toolbar"));
      await waitFor(() => {
        expect(screen.queryByTestId("file-editor-content")).toBeNull();
      });

      // Re-expand
      fireEvent.click(screen.getByTestId("editor-toolbar"));
      await waitFor(() => {
        expect(screen.getByTestId("file-editor-content")).toBeDefined();
      });
    });
  });

  describe("expand/collapse all", () => {
    it("should auto-expand all files on mount", async () => {
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file1.ts", status: "modified", staged: false },
          { path: "src/file2.ts", status: "added", staged: false },
        ]),
      );

      renderWithProviders(
        <ReviewWorkingPane cwd={TEST_CWD} git={mockGitApi as any} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("changes-list")).toBeDefined();
      });

      // All files should auto-expand on mount
      await waitFor(() => {
        expect(screen.getAllByTestId("file-editor-content")).toHaveLength(2);
      });
    });
  });

  describe("section collapse", () => {
    it("should collapse staged section when header is clicked", async () => {
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/staged.ts", status: "modified", staged: true },
        ]),
      );

      renderWithProviders(
        <ReviewWorkingPane cwd={TEST_CWD} git={mockGitApi as any} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("section-staged-changes")).toBeDefined();
      });

      // File should be visible (auto-expanded)
      await waitFor(() => {
        expect(screen.getByText("src/staged.ts")).toBeDefined();
      });

      // Click section header text to collapse (find toggle by text "Staged Changes")
      fireEvent.click(screen.getByText("Staged Changes"));

      // Wait for file to be hidden
      await waitFor(() => {
        expect(screen.queryByText("src/staged.ts")).toBeNull();
      });
    });
  });

  describe("stage/unstage from review pane", () => {
    it("should stage file from review pane", async () => {
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file.ts", status: "modified", staged: false },
        ]),
      );

      renderWithProviders(
        <ReviewWorkingPane cwd={TEST_CWD} git={mockGitApi as any} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("changes-list")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("stage-button"));

      await waitFor(() => {
        expect(mockStage).toHaveBeenCalledWith(["src/file.ts"]);
      });
    });

    it("should unstage file from review pane", async () => {
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file.ts", status: "modified", staged: true },
        ]),
      );

      renderWithProviders(
        <ReviewWorkingPane cwd={TEST_CWD} git={mockGitApi as any} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("changes-list")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("unstage-button"));

      await waitFor(() => {
        expect(mockUnstage).toHaveBeenCalledWith(["src/file.ts"]);
      });
    });
  });

  describe("commit form", () => {
    it("should disable commit button when no staged files", async () => {
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file.ts", status: "modified", staged: false },
        ]),
      );

      renderWithProviders(
        <ReviewWorkingPane cwd={TEST_CWD} git={mockGitApi as any} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("commit-message-input")).toBeDefined();
      });

      const commitButton = screen.getByTestId("commit-button");
      expect(commitButton.hasAttribute("disabled")).toBe(true);
    });

    it("should disable commit button when message is empty", async () => {
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file.ts", status: "modified", staged: true },
        ]),
      );

      renderWithProviders(
        <ReviewWorkingPane cwd={TEST_CWD} git={mockGitApi as any} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("commit-message-input")).toBeDefined();
      });

      const commitButton = screen.getByTestId("commit-button");
      expect(commitButton.hasAttribute("disabled")).toBe(true);
    });

    it("should enable commit button when staged files and message exist", async () => {
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file.ts", status: "modified", staged: true },
        ]),
      );

      renderWithProviders(
        <ReviewWorkingPane cwd={TEST_CWD} git={mockGitApi as any} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("commit-message-input")).toBeDefined();
      });

      // Enter commit message
      fireEvent.change(screen.getByTestId("commit-message-input"), {
        target: { value: "Test commit" },
      });

      const commitButton = screen.getByTestId("commit-button");
      expect(commitButton.hasAttribute("disabled")).toBe(false);
    });

    it("should call git.commit when commit button is clicked", async () => {
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file.ts", status: "modified", staged: true },
        ]),
      );

      renderWithProviders(
        <ReviewWorkingPane cwd={TEST_CWD} git={mockGitApi as any} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("commit-message-input")).toBeDefined();
      });

      // Enter commit message
      fireEvent.change(screen.getByTestId("commit-message-input"), {
        target: { value: "Test commit message" },
      });

      // Click commit
      fireEvent.click(screen.getByTestId("commit-button"));

      await waitFor(() => {
        expect(mockCommit).toHaveBeenCalledWith("Test commit message");
      });
    });

    it("should re-enable commit and keep the message when commit fails", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file.ts", status: "modified", staged: true },
        ]),
      );
      let fail!: (error: Error) => void;
      mockCommit.mockReturnValueOnce(
        new Promise((_, reject) => (fail = reject)),
      );

      renderWithProviders(
        <ReviewWorkingPane cwd={TEST_CWD} git={mockGitApi as any} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("commit-message-input")).toBeDefined();
      });
      fireEvent.change(screen.getByTestId("commit-message-input"), {
        target: { value: "Test commit message" },
      });

      const commitButton = () => screen.getByTestId("commit-button");
      await waitFor(() => {
        expect(commitButton().hasAttribute("disabled")).toBe(false);
      });
      fireEvent.click(commitButton());
      await waitFor(() => {
        expect(commitButton().hasAttribute("disabled")).toBe(true);
      });

      await act(async () => fail(new Error("boom")));

      await waitFor(() => {
        expect(commitButton().hasAttribute("disabled")).toBe(false);
      });
      expect(
        (screen.getByTestId("commit-message-input") as HTMLTextAreaElement)
          .value,
      ).toBe("Test commit message");
    });
  });

  describe("real-time updates", () => {
    it("lists the status the watcher writes to the shared cache", async () => {
      const queryClient = createQueryClient();
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/before.ts", status: "modified", staged: false },
        ]),
      );

      renderWithProviders(
        <ReviewWorkingPane cwd={TEST_CWD} git={mockGitApi as any} />,
        queryClient,
      );
      await waitFor(() => {
        expect(screen.getByText("src/before.ts")).toBeDefined();
      });

      act(() => {
        queryClient.setQueryData(
          gitKeys.status(TEST_CWD),
          createMockStatus([
            { path: "src/after.ts", status: "added", staged: true },
          ]),
        );
      });

      await waitFor(() => {
        expect(screen.getByText("src/after.ts")).toBeDefined();
      });
      expect(screen.queryByText("src/before.ts")).toBeNull();
      expect(mockGetStatus).toHaveBeenCalledTimes(1);
    });
  });

  describe("error handling", () => {
    it("should handle stage errors gracefully", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file.ts", status: "modified", staged: false },
        ]),
      );
      mockStage.mockRejectedValue(new Error("Stage failed"));

      renderWithProviders(
        <ReviewWorkingPane cwd={TEST_CWD} git={mockGitApi as any} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("changes-list")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("stage-button"));

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          "Failed to stage file:",
          expect.any(Error),
        );
      });

      consoleSpy.mockRestore();
    });

    it("should handle commit errors gracefully", async () => {
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file.ts", status: "modified", staged: true },
        ]),
      );
      mockCommit.mockRejectedValue(new Error("Commit failed"));

      renderWithProviders(
        <ReviewWorkingPane cwd={TEST_CWD} git={mockGitApi as any} />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("commit-message-input")).toBeDefined();
      });

      fireEvent.change(screen.getByTestId("commit-message-input"), {
        target: { value: "Test" },
      });
      fireEvent.click(screen.getByTestId("commit-button"));

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          "Failed to commit:",
          expect.any(Error),
        );
      });

      consoleSpy.mockRestore();
    });
  });
});
