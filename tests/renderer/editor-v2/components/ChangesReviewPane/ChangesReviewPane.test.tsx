// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { ChangesReviewPane } from "../../../../../src/renderer/components/panes/editor-v2/components/ChangesReviewPane/ChangesReviewPane";
import { FileChangeDiff } from "../../../../../src/renderer/components/panes/editor-v2/components/ChangesReviewPane/FileChangeDiff";
import type {
  GitFileStatus,
  GitStatus,
} from "../../../../../src/ipc/gitv2/types";

// ============================================================================
// Mocks
// ============================================================================

// Mock useGitV2 hook
const mockGetStatus = vi.fn();
const mockOnStatusChanged = vi.fn();
const mockStage = vi.fn();
const mockUnstage = vi.fn();
const mockRevert = vi.fn();
const mockCommit = vi.fn();

vi.mock("../../../../../src/renderer/hooks/useGitV2", () => ({
  useGitV2: () => ({
    whenReady: vi.fn().mockResolvedValue(undefined),
    getStatus: mockGetStatus,
    onStatusChanged: mockOnStatusChanged,
    stage: mockStage,
    unstage: mockUnstage,
    revert: mockRevert,
    commit: mockCommit,
    getFileContent: vi.fn(),
    getOriginalContent: vi.fn(),
  }),
}));

// Mock DiffEditorWrapper - we don't need to test the actual diff editor
vi.mock(
  "../../../../../src/renderer/components/panes/editor-v2/components/EditorViewPanel",
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
// FileChangeDiff Tests
// ============================================================================

describe("FileChangeDiff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStage.mockResolvedValue(undefined);
    mockUnstage.mockResolvedValue(undefined);
    mockRevert.mockResolvedValue(undefined);
  });

  const defaultProps = {
    filePath: "src/test.ts",
    cwd: TEST_CWD,
    status: { path: "src/test.ts", status: "modified" as const, staged: false },
    isExpanded: false,
    onToggle: vi.fn(),
  };

  describe("rendering", () => {
    it("should render the file header", () => {
      render(<FileChangeDiff {...defaultProps} />);

      expect(screen.getByTestId("file-change-diff-header")).toBeDefined();
      expect(screen.getByText("src/test.ts")).toBeDefined();
    });

    it("should show git status badge", () => {
      render(<FileChangeDiff {...defaultProps} />);

      // Modified status shows "M" badge
      expect(screen.getByTitle("Modified")).toBeDefined();
    });

    it("should not show diff editor when collapsed", () => {
      render(<FileChangeDiff {...defaultProps} isExpanded={false} />);

      expect(screen.queryByTestId("file-change-diff-content")).toBeNull();
    });

    it("should show diff editor when expanded", () => {
      render(<FileChangeDiff {...defaultProps} isExpanded={true} />);

      expect(screen.getByTestId("file-change-diff-content")).toBeDefined();
      expect(screen.getByTestId("mock-diff-editor")).toBeDefined();
    });

    it("should pass readOnly=true to diff editor", () => {
      render(<FileChangeDiff {...defaultProps} isExpanded={true} />);

      const diffEditor = screen.getByTestId("mock-diff-editor");
      expect(diffEditor.getAttribute("data-readonly")).toBe("true");
    });
  });

  describe("toggle", () => {
    it("should call onToggle when header is clicked", () => {
      const onToggle = vi.fn();
      render(<FileChangeDiff {...defaultProps} onToggle={onToggle} />);

      // Click on the file path text area (clickable part of header)
      fireEvent.click(screen.getByText("src/test.ts"));

      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe("action buttons - unstaged file", () => {
    it("should show stage button for unstaged files", () => {
      render(<FileChangeDiff {...defaultProps} />);

      expect(screen.getByTestId("stage-button")).toBeDefined();
    });

    it("should show revert button for unstaged files", () => {
      render(<FileChangeDiff {...defaultProps} />);

      expect(screen.getByTestId("revert-button")).toBeDefined();
    });

    it("should call git.stage when stage button is clicked", async () => {
      render(<FileChangeDiff {...defaultProps} />);

      fireEvent.click(screen.getByTestId("stage-button"));

      await waitFor(() => {
        expect(mockStage).toHaveBeenCalledWith(["src/test.ts"]);
      });
    });

    it("should call git.revert when revert button is clicked", async () => {
      render(<FileChangeDiff {...defaultProps} />);

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

    it("should show unstage button for staged files", () => {
      render(<FileChangeDiff {...stagedProps} />);

      expect(screen.getByTestId("unstage-button")).toBeDefined();
    });

    it("should not show stage or revert buttons for staged files", () => {
      render(<FileChangeDiff {...stagedProps} />);

      expect(screen.queryByTestId("stage-button")).toBeNull();
      expect(screen.queryByTestId("revert-button")).toBeNull();
    });

    it("should call git.unstage when unstage button is clicked", async () => {
      render(<FileChangeDiff {...stagedProps} />);

      fireEvent.click(screen.getByTestId("unstage-button"));

      await waitFor(() => {
        expect(mockUnstage).toHaveBeenCalledWith(["src/test.ts"]);
      });
    });
  });

  describe("git status badges", () => {
    it("should show added status", () => {
      render(
        <FileChangeDiff
          {...defaultProps}
          status={{ path: "src/new.ts", status: "added", staged: true }}
        />,
      );

      expect(screen.getByTitle("Added (staged)")).toBeDefined();
    });

    it("should show deleted status", () => {
      render(
        <FileChangeDiff
          {...defaultProps}
          status={{ path: "src/old.ts", status: "deleted", staged: false }}
        />,
      );

      expect(screen.getByTitle("Deleted")).toBeDefined();
    });

    it("should show untracked status", () => {
      render(
        <FileChangeDiff
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
// ChangesReviewPane Tests
// ============================================================================

describe("ChangesReviewPane", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnStatusChanged.mockReturnValue(() => {});
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

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      expect(screen.getByTestId("changes-review-pane-loading")).toBeDefined();
    });
  });

  describe("empty state", () => {
    it("should show empty state when no changes", async () => {
      mockGetStatus.mockResolvedValue(createMockStatus([]));

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      await waitFor(() => {
        expect(screen.getByTestId("changes-review-pane-empty")).toBeDefined();
      });
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

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      await waitFor(() => {
        expect(screen.getByTestId("changes-review-pane")).toBeDefined();
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

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      await waitFor(() => {
        expect(screen.getByTestId("staged-section")).toBeDefined();
        expect(screen.getByTestId("unstaged-section")).toBeDefined();
      });

      // Check section headers
      expect(screen.getByText("Staged Changes")).toBeDefined();
      expect(screen.getByText("Changes")).toBeDefined();
    });
  });

  describe("expand/collapse individual files", () => {
    it("should expand file when header is clicked", async () => {
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file.ts", status: "modified", staged: false },
        ]),
      );

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      await waitFor(() => {
        expect(screen.getByTestId("changes-review-pane")).toBeDefined();
      });

      // File should start collapsed
      expect(screen.queryByTestId("file-change-diff-content")).toBeNull();

      // Click on file path to expand (the clickable area)
      fireEvent.click(screen.getByText("src/file.ts"));

      // Wait for expansion to occur
      await waitFor(() => {
        expect(screen.getByTestId("file-change-diff-content")).toBeDefined();
      });
    });

    it("should collapse file when header is clicked again", async () => {
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file.ts", status: "modified", staged: false },
        ]),
      );

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      await waitFor(() => {
        expect(screen.getByTestId("changes-review-pane")).toBeDefined();
      });

      // Expand
      fireEvent.click(screen.getByText("src/file.ts"));
      await waitFor(() => {
        expect(screen.getByTestId("file-change-diff-content")).toBeDefined();
      });

      // Collapse
      fireEvent.click(screen.getByText("src/file.ts"));
      await waitFor(() => {
        expect(screen.queryByTestId("file-change-diff-content")).toBeNull();
      });
    });
  });

  describe("expand/collapse all", () => {
    it("should expand all files when Expand All is clicked", async () => {
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file1.ts", status: "modified", staged: false },
          { path: "src/file2.ts", status: "added", staged: false },
        ]),
      );

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      await waitFor(() => {
        expect(screen.getByTestId("changes-review-pane")).toBeDefined();
      });

      // All files start collapsed
      expect(screen.queryAllByTestId("file-change-diff-content")).toHaveLength(
        0,
      );

      // Click expand all
      fireEvent.click(screen.getByTestId("toggle-all-button"));

      // Wait for all files to be expanded
      await waitFor(() => {
        expect(screen.getAllByTestId("file-change-diff-content")).toHaveLength(
          2,
        );
      });
    });

    it("should collapse all files when Collapse All is clicked", async () => {
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file1.ts", status: "modified", staged: false },
          { path: "src/file2.ts", status: "added", staged: false },
        ]),
      );

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      await waitFor(() => {
        expect(screen.getByTestId("changes-review-pane")).toBeDefined();
      });

      // Expand all first
      fireEvent.click(screen.getByTestId("toggle-all-button"));
      await waitFor(() => {
        expect(screen.getAllByTestId("file-change-diff-content")).toHaveLength(
          2,
        );
      });

      // Click collapse all
      fireEvent.click(screen.getByTestId("toggle-all-button"));

      // Wait for all files to be collapsed
      await waitFor(() => {
        expect(
          screen.queryAllByTestId("file-change-diff-content"),
        ).toHaveLength(0);
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

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      await waitFor(() => {
        expect(screen.getByTestId("staged-section")).toBeDefined();
      });

      // File should be visible
      expect(screen.getByText("src/staged.ts")).toBeDefined();

      // Click section header to collapse
      fireEvent.click(screen.getByTestId("section-staged-changes"));

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

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      await waitFor(() => {
        expect(screen.getByTestId("changes-review-pane")).toBeDefined();
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

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      await waitFor(() => {
        expect(screen.getByTestId("changes-review-pane")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("unstage-button"));

      await waitFor(() => {
        expect(mockUnstage).toHaveBeenCalledWith(["src/file.ts"]);
      });
    });
  });

  describe("commit form", () => {
    it("should show commit form", async () => {
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file.ts", status: "modified", staged: true },
        ]),
      );

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      await waitFor(() => {
        expect(screen.getByTestId("commit-form")).toBeDefined();
      });

      expect(screen.getByTestId("commit-message-input")).toBeDefined();
      expect(screen.getByTestId("commit-button")).toBeDefined();
    });

    it("should disable commit button when no staged files", async () => {
      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file.ts", status: "modified", staged: false },
        ]),
      );

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      await waitFor(() => {
        expect(screen.getByTestId("commit-form")).toBeDefined();
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

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      await waitFor(() => {
        expect(screen.getByTestId("commit-form")).toBeDefined();
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

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      await waitFor(() => {
        expect(screen.getByTestId("commit-form")).toBeDefined();
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

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      await waitFor(() => {
        expect(screen.getByTestId("commit-form")).toBeDefined();
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

    it("should show committing state when committing", async () => {
      // Use a promise that stays pending to test loading state
      mockCommit.mockReturnValue(new Promise(() => {}));

      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file.ts", status: "modified", staged: true },
        ]),
      );

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      await waitFor(() => {
        expect(screen.getByTestId("commit-form")).toBeDefined();
      });

      // Enter commit message
      fireEvent.change(screen.getByTestId("commit-message-input"), {
        target: { value: "Test commit" },
      });

      // Click commit
      fireEvent.click(screen.getByTestId("commit-button"));

      // Wait for committing state
      await waitFor(() => {
        expect(screen.getByText(/Committing/)).toBeDefined();
      });
    });
  });

  describe("real-time updates", () => {
    it("should subscribe to git status changes", async () => {
      mockGetStatus.mockResolvedValue(createMockStatus([]));

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      await waitFor(() => {
        expect(mockOnStatusChanged).toHaveBeenCalled();
      });
    });

    it("should register callback with onStatusChanged", async () => {
      // Store the callback that gets passed to onStatusChanged
      let capturedCallback:
        | ((event: { status: GitStatus }) => void)
        | undefined;
      mockOnStatusChanged.mockImplementation((callback) => {
        capturedCallback = callback;
        return () => {};
      });

      mockGetStatus.mockResolvedValue(
        createMockStatus([
          { path: "src/file.ts", status: "modified", staged: false },
        ]),
      );

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      // Wait for component to render
      await waitFor(() => {
        expect(screen.getByTestId("changes-review-pane")).toBeDefined();
      });

      // Verify the callback was registered
      expect(capturedCallback).toBeDefined();
      expect(typeof capturedCallback).toBe("function");
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

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      await waitFor(() => {
        expect(screen.getByTestId("changes-review-pane")).toBeDefined();
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

      render(<ChangesReviewPane cwd={TEST_CWD} />);

      await waitFor(() => {
        expect(screen.getByTestId("commit-form")).toBeDefined();
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
