// @ts-nocheck
/**
 * @vitest-environment jsdom
 *
 * BranchComparison tests - Tests for Phase 7 branch comparison functionality.
 *
 * Tests cover:
 * - BranchSelector component
 * - FileTreeNormal branch comparison mode
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { BranchSelector } from "../../../../../src/renderer/components/panes/editor-v2/components/FileTreePanel/BranchSelector";
import { FileTreeNormal } from "../../../../../src/renderer/components/panes/editor-v2/components/FileTreePanel/FileTreeNormal";
import type {
  GitBranch,
  GitStatus,
  GitFileStatus,
} from "../../../../src/ipc/gitv2/types";
import type { DirectoryEntry } from "../../../../src/ipc/fsv2/types";

// ============================================================================
// Mocks
// ============================================================================

// Mock useGitV2 hook
const mockGitApi = {
  getBranches: vi.fn(),
  getCurrentBranch: vi.fn(),
  getStatus: vi.fn(),
  getChangedFilesFromBranch: vi.fn(),
  onBranchChanged: vi.fn(),
  onStatusChanged: vi.fn(),
};

vi.mock("@/hooks/useGitV2", () => ({
  useGitV2: () => mockGitApi,
}));

// Mock useFileSystemV2 hook
const mockFsApi = {
  readDirectory: vi.fn(),
  onDirectoryListingChanged: vi.fn(),
};

vi.mock("@/hooks/useFileSystemV2", () => ({
  useFileSystemV2: () => mockFsApi,
}));

// ============================================================================
// Test Data
// ============================================================================

const mockBranches = [
  { name: "main", isRemote: false, isCurrent: false },
  { name: "feature/new-feature", isRemote: false, isCurrent: true },
  { name: "develop", isRemote: false, isCurrent: false },
  { name: "origin/main", isRemote: true, isCurrent: false },
  { name: "origin/develop", isRemote: true, isCurrent: false },
];

const mockGitStatus = {
  branch: "feature/new-feature",
  files: new Map([
    [
      "src/index.ts",
      { path: "src/index.ts", status: "modified", staged: false },
    ],
    ["src/utils.ts", { path: "src/utils.ts", status: "added", staged: true }],
  ]),
};

const mockDirectoryEntries = [
  { name: "src", type: "directory" },
  { name: "package.json", type: "file" },
  { name: "README.md", type: "file" },
];

const mockChangedFiles = [
  "src/components/Button.tsx",
  "src/utils/helpers.ts",
  "tests/Button.test.tsx",
];

// ============================================================================
// BranchSelector Tests
// ============================================================================

describe("BranchSelector", () => {
  const defaultProps = {
    cwd: "/test/project",
    baseBranch: null,
    onBaseBranchChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGitApi.getBranches.mockResolvedValue(mockBranches);
    mockGitApi.getCurrentBranch.mockResolvedValue("feature/new-feature");
    mockGitApi.onBranchChanged.mockReturnValue(() => {});
  });

  describe("Loading State", () => {
    it("shows loading indicator while fetching branches", () => {
      // Never resolve to keep loading state
      mockGitApi.getBranches.mockImplementation(() => new Promise(() => {}));

      render(<BranchSelector {...defaultProps} />);

      expect(screen.getByTestId("branch-selector-loading")).toBeDefined();
      expect(screen.getByText("Loading...")).toBeDefined();
    });
  });

  describe("Initial Render", () => {
    it("renders trigger button with placeholder text when no branch selected", async () => {
      render(<BranchSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector")).toBeDefined();
      });

      expect(screen.getByText("Compare to...")).toBeDefined();
    });

    it("renders trigger button with selected branch name when baseBranch is set", async () => {
      render(<BranchSelector {...defaultProps} baseBranch="main" />);

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector")).toBeDefined();
      });

      expect(screen.getByText("main")).toBeDefined();
    });

    it("shows clear button when a branch is selected", async () => {
      render(<BranchSelector {...defaultProps} baseBranch="main" />);

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector-clear")).toBeDefined();
      });
    });
  });

  describe("Dropdown Behavior", () => {
    it("opens dropdown when trigger is clicked", async () => {
      render(<BranchSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-selector-trigger"));
      });

      expect(screen.getByTestId("branch-selector-dropdown")).toBeDefined();
    });

    it("closes dropdown when clicking outside", async () => {
      render(<BranchSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-selector-trigger"));
      });

      expect(screen.getByTestId("branch-selector-dropdown")).toBeDefined();

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-selector-backdrop"));
      });

      expect(screen.queryByTestId("branch-selector-dropdown")).toBeNull();
    });

    it("excludes current branch from dropdown options", async () => {
      render(<BranchSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-selector-trigger"));
      });

      // Current branch is "feature/new-feature", should not be shown
      expect(
        screen.queryByTestId("branch-option-feature/new-feature"),
      ).toBeNull();

      // Other local branches should be shown
      expect(screen.getByTestId("branch-option-main")).toBeDefined();
      expect(screen.getByTestId("branch-option-develop")).toBeDefined();
    });

    it("shows both local and remote branches", async () => {
      render(<BranchSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-selector-trigger"));
      });

      expect(screen.getByText("Local Branches")).toBeDefined();
      expect(screen.getByText("Remote Branches")).toBeDefined();
      expect(screen.getByTestId("branch-option-origin/main")).toBeDefined();
    });
  });

  describe("Branch Selection", () => {
    it("calls onBaseBranchChange when a branch is selected", async () => {
      const onBaseBranchChange = vi.fn();
      render(
        <BranchSelector
          {...defaultProps}
          onBaseBranchChange={onBaseBranchChange}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-selector-trigger"));
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-option-main"));
      });

      expect(onBaseBranchChange).toHaveBeenCalledWith("main");
    });

    it("closes dropdown after selecting a branch", async () => {
      render(<BranchSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-selector-trigger"));
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-option-main"));
      });

      expect(screen.queryByTestId("branch-selector-dropdown")).toBeNull();
    });

    it("calls onBaseBranchChange with null when clear button is clicked", async () => {
      const onBaseBranchChange = vi.fn();
      render(
        <BranchSelector
          {...defaultProps}
          baseBranch="main"
          onBaseBranchChange={onBaseBranchChange}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector-clear")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-selector-clear"));
      });

      expect(onBaseBranchChange).toHaveBeenCalledWith(null);
    });
  });

  describe("Empty State", () => {
    it("shows empty message when no other branches available", async () => {
      // Only the current branch
      mockGitApi.getBranches.mockResolvedValue([
        { name: "feature/new-feature", isRemote: false, isCurrent: true },
      ]);

      render(<BranchSelector {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("branch-selector")).toBeDefined();
      });

      await act(async () => {
        fireEvent.click(screen.getByTestId("branch-selector-trigger"));
      });

      expect(screen.getByText("No other branches available")).toBeDefined();
    });
  });
});

// ============================================================================
// FileTreeNormal Branch Comparison Tests
// ============================================================================

describe("FileTreeNormal - Branch Comparison Mode", () => {
  const defaultProps = {
    cwd: "/test/project",
    selectedFile: null,
    onFileSelect: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockFsApi.readDirectory.mockResolvedValue(mockDirectoryEntries);
    mockFsApi.onDirectoryListingChanged.mockReturnValue(() => {});
    mockGitApi.getStatus.mockResolvedValue(mockGitStatus);
    mockGitApi.onStatusChanged.mockReturnValue(() => {});
    mockGitApi.getChangedFilesFromBranch.mockResolvedValue(mockChangedFiles);
  });

  describe("Normal Mode (no baseBranch)", () => {
    it("renders directory tree in normal mode", async () => {
      render(<FileTreeNormal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

      // Should show directory structure
      expect(screen.getByTestId("tree-item-src")).toBeDefined();
      expect(screen.getByTestId("tree-item-package.json")).toBeDefined();
    });

    it("does not call getChangedFilesFromBranch in normal mode", async () => {
      render(<FileTreeNormal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

      expect(mockGitApi.getChangedFilesFromBranch).not.toHaveBeenCalled();
    });
  });

  describe("Branch Comparison Mode", () => {
    it("shows loading state when loading changed files", async () => {
      // Never resolve to keep loading state
      mockGitApi.getChangedFilesFromBranch.mockImplementation(
        () => new Promise(() => {}),
      );

      render(<FileTreeNormal {...defaultProps} baseBranch="main" />);

      // Wait for initial load to complete
      await waitFor(() => {
        expect(screen.queryByTestId("file-tree-loading")).toBeNull();
      });

      expect(screen.getByTestId("branch-comparison-loading")).toBeDefined();
      expect(screen.getByText("Loading changes from main...")).toBeDefined();
    });

    it("renders flat list of changed files in comparison mode", async () => {
      render(<FileTreeNormal {...defaultProps} baseBranch="main" />);

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-branch-comparison")).toBeDefined();
      });

      // Should show changed files as flat list with relative paths
      expect(screen.getByText("src/components/Button.tsx")).toBeDefined();
      expect(screen.getByText("src/utils/helpers.ts")).toBeDefined();
      expect(screen.getByText("tests/Button.test.tsx")).toBeDefined();
    });

    it("calls getChangedFilesFromBranch with baseBranch", async () => {
      render(<FileTreeNormal {...defaultProps} baseBranch="main" />);

      await waitFor(() => {
        expect(mockGitApi.getChangedFilesFromBranch).toHaveBeenCalledWith(
          "main",
        );
      });
    });

    it("shows empty state when no files changed", async () => {
      mockGitApi.getChangedFilesFromBranch.mockResolvedValue([]);

      render(<FileTreeNormal {...defaultProps} baseBranch="main" />);

      await waitFor(() => {
        expect(screen.getByTestId("branch-comparison-empty")).toBeDefined();
      });

      expect(screen.getByText("No changes from main")).toBeDefined();
    });

    it("sorts files alphabetically", async () => {
      mockGitApi.getChangedFilesFromBranch.mockResolvedValue([
        "z-file.ts",
        "a-file.ts",
        "m-file.ts",
      ]);

      render(<FileTreeNormal {...defaultProps} baseBranch="main" />);

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-branch-comparison")).toBeDefined();
      });

      const items = screen.getAllByTestId("file-tree-item");
      const fileNames = items.map((item) => item.textContent);

      expect(fileNames[0]).toContain("a-file.ts");
      expect(fileNames[1]).toContain("m-file.ts");
      expect(fileNames[2]).toContain("z-file.ts");
    });

    it("allows selecting files in comparison mode", async () => {
      const onFileSelect = vi.fn();
      render(
        <FileTreeNormal
          {...defaultProps}
          baseBranch="main"
          onFileSelect={onFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-branch-comparison")).toBeDefined();
      });

      // Find and click the first file item - it should have a tree-item-* testid
      const fileItems = screen.getAllByTestId("file-tree-item");
      const firstFileRow = fileItems[0].querySelector(
        '[data-testid^="tree-item-"]',
      );

      if (firstFileRow) {
        await act(async () => {
          fireEvent.click(firstFileRow);
        });

        expect(onFileSelect).toHaveBeenCalled();
      }
    });
  });

  describe("Mode Switching", () => {
    it("switches from normal to comparison mode when baseBranch is set", async () => {
      const { rerender } = render(<FileTreeNormal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

      // Switch to comparison mode
      rerender(<FileTreeNormal {...defaultProps} baseBranch="main" />);

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-branch-comparison")).toBeDefined();
      });

      expect(screen.queryByTestId("file-tree-normal")).toBeNull();
    });

    it("switches from comparison to normal mode when baseBranch is cleared", async () => {
      const { rerender } = render(
        <FileTreeNormal {...defaultProps} baseBranch="main" />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-branch-comparison")).toBeDefined();
      });

      // Switch back to normal mode
      rerender(<FileTreeNormal {...defaultProps} baseBranch={undefined} />);

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

      expect(screen.queryByTestId("file-tree-branch-comparison")).toBeNull();
    });

    it("reloads changed files when baseBranch changes", async () => {
      const { rerender } = render(
        <FileTreeNormal {...defaultProps} baseBranch="main" />,
      );

      await waitFor(() => {
        expect(mockGitApi.getChangedFilesFromBranch).toHaveBeenCalledWith(
          "main",
        );
      });

      mockGitApi.getChangedFilesFromBranch.mockClear();

      // Change to different branch
      rerender(<FileTreeNormal {...defaultProps} baseBranch="develop" />);

      await waitFor(() => {
        expect(mockGitApi.getChangedFilesFromBranch).toHaveBeenCalledWith(
          "develop",
        );
      });
    });
  });

  describe("Error Handling", () => {
    it("handles error when loading changed files fails", async () => {
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      mockGitApi.getChangedFilesFromBranch.mockRejectedValue(
        new Error("Git error"),
      );

      render(<FileTreeNormal {...defaultProps} baseBranch="main" />);

      await waitFor(() => {
        expect(screen.getByTestId("branch-comparison-empty")).toBeDefined();
      });

      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });
});
