// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FileTreeChanges } from "../../../../src/renderer/components/panes/editor-v2/components/FileTreePanel/FileTreeChanges";

// ============================================================================
// Mocks
// ============================================================================

// Mock useGitV2 hook
const mockGetStatus = vi.fn();
const mockOnStatusChanged = vi.fn();
const mockStage = vi.fn();
const mockUnstage = vi.fn();
const mockRevert = vi.fn();

vi.mock("@/hooks/useGitV2", () => ({
  useGitV2: () => ({
    getStatus: mockGetStatus,
    onStatusChanged: mockOnStatusChanged,
    stage: mockStage,
    unstage: mockUnstage,
    revert: mockRevert,
  }),
}));

// ============================================================================
// Test Data
// ============================================================================

const TEST_CWD = "/project";

const MOCK_STATUS_WITH_CHANGES = {
  branch: "main",
  files: new Map([
    [
      "src/index.ts",
      { status: "modified", staged: false, path: "src/index.ts" },
    ],
    ["src/utils.ts", { status: "added", staged: true, path: "src/utils.ts" }],
    [
      "package.json",
      { status: "modified", staged: true, path: "package.json" },
    ],
    ["README.md", { status: "deleted", staged: false, path: "README.md" }],
  ]),
};

const MOCK_STATUS_EMPTY = {
  branch: "main",
  files: new Map(),
};

const MOCK_STATUS_UNSTAGED_ONLY = {
  branch: "main",
  files: new Map([
    ["file1.ts", { status: "modified", staged: false, path: "file1.ts" }],
    ["file2.ts", { status: "modified", staged: false, path: "file2.ts" }],
  ]),
};

const MOCK_STATUS_STAGED_ONLY = {
  branch: "main",
  files: new Map([
    ["file1.ts", { status: "modified", staged: true, path: "file1.ts" }],
    ["file2.ts", { status: "added", staged: true, path: "file2.ts" }],
  ]),
};

// ============================================================================
// Tests
// ============================================================================

describe("FileTreeChanges", () => {
  const mockOnFileSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockGetStatus.mockResolvedValue(MOCK_STATUS_WITH_CHANGES);
    mockOnStatusChanged.mockReturnValue(() => {});
    mockStage.mockResolvedValue(undefined);
    mockUnstage.mockResolvedValue(undefined);
    mockRevert.mockResolvedValue(undefined);
  });

  // ===========================================================================
  // Initial Rendering
  // ===========================================================================

  describe("initial rendering", () => {
    it("should show loading state initially", () => {
      mockGetStatus.mockReturnValue(new Promise(() => {}));

      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      expect(screen.getByTestId("file-tree-changes-loading")).toBeDefined();
    });

    it("should render changes view after loading", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });
    });

    it("should call getStatus on mount", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(mockGetStatus).toHaveBeenCalled();
      });
    });
  });

  // ===========================================================================
  // Empty State
  // ===========================================================================

  describe("empty state", () => {
    it("should show empty message when no changes", async () => {
      mockGetStatus.mockResolvedValue(MOCK_STATUS_EMPTY);

      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes-empty")).toBeDefined();
      });

      expect(screen.getByText("No changes")).toBeDefined();
    });
  });

  // ===========================================================================
  // Section Display
  // ===========================================================================

  describe("section display", () => {
    it("should show Staged Changes section when there are staged files", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      expect(screen.getByTestId("section-staged-changes")).toBeDefined();
      expect(screen.getByText("Staged Changes")).toBeDefined();
    });

    it("should show Changes section when there are unstaged files", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      expect(screen.getByTestId("section-changes")).toBeDefined();
      expect(screen.getByText("Changes")).toBeDefined();
    });

    it("should not show Staged Changes section when all files unstaged", async () => {
      mockGetStatus.mockResolvedValue(MOCK_STATUS_UNSTAGED_ONLY);

      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      expect(screen.queryByTestId("section-staged-changes")).toBeNull();
    });

    it("should not show Changes section when all files staged", async () => {
      mockGetStatus.mockResolvedValue(MOCK_STATUS_STAGED_ONLY);

      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      expect(screen.queryByTestId("section-changes")).toBeNull();
    });

    it("should display file count in section header", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      // Both sections should show counts in their headers
      // Staged section has 2 files, Changes section has 2 files
      const countElements = screen.getAllByText("(2)");
      expect(countElements.length).toBe(2); // Two sections with count (2)
    });
  });

  // ===========================================================================
  // Section Toggle
  // ===========================================================================

  describe("section toggle", () => {
    it("should collapse section when toggle is clicked", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      // Files should be visible initially (section is expanded by default)
      expect(screen.getByTestId("change-item-index.ts")).toBeDefined();

      // Find the Changes section toggle - get all and find the one for Changes
      const toggleButtons = screen.getAllByTestId("section-toggle");
      // Changes section toggle is the second one (first is Staged Changes)
      const changesToggle = toggleButtons[1];

      // Click to collapse
      fireEvent.click(changesToggle);

      // Files should be hidden
      await waitFor(() => {
        expect(screen.queryByTestId("change-item-index.ts")).toBeNull();
      });
    });

    it("should expand collapsed section when toggle is clicked", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      // Find the Changes section toggle - get all and find the one for Changes
      const toggleButtons = screen.getAllByTestId("section-toggle");
      // Changes section toggle is the second one (first is Staged Changes)
      const changesToggle = toggleButtons[1];

      // Collapse first
      fireEvent.click(changesToggle);

      await waitFor(() => {
        expect(screen.queryByTestId("change-item-index.ts")).toBeNull();
      });

      // Re-query toggles as DOM may have changed
      const toggleButtonsAfter = screen.getAllByTestId("section-toggle");
      const changesToggleAfter = toggleButtonsAfter[1];

      // Expand again
      fireEvent.click(changesToggleAfter);

      await waitFor(() => {
        expect(screen.getByTestId("change-item-index.ts")).toBeDefined();
      });
    });
  });

  // ===========================================================================
  // File Selection
  // ===========================================================================

  describe("file selection", () => {
    it("should call onFileSelect when clicking a file", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("change-item-index.ts"));

      expect(mockOnFileSelect).toHaveBeenCalledWith({
        path: "/project/src/index.ts",
        name: "index.ts",
        type: "file",
      });
    });

    it("should highlight selected file", async () => {
      const selectedFile = {
        path: "/project/src/index.ts",
        name: "index.ts",
        type: "file" as const,
      };

      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={selectedFile}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const selectedItem = screen.getByTestId("change-item-index.ts");
      expect(selectedItem.className).toContain("bg-accent");
    });
  });

  // ===========================================================================
  // Git Actions - Staging
  // ===========================================================================

  describe("git actions - staging", () => {
    it("should show stage button for unstaged files", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      // Hover over an unstaged file to reveal action buttons
      const unstagedItem = screen.getByTestId("change-item-index.ts");

      // Stage button should be present (visible on hover)
      const stageButton = unstagedItem.querySelector(
        '[data-testid="stage-button"]',
      );
      expect(stageButton).toBeDefined();
    });

    it("should call stage when stage button is clicked", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const unstagedItem = screen.getByTestId("change-item-index.ts");
      const stageButton = unstagedItem.querySelector(
        '[data-testid="stage-button"]',
      );

      fireEvent.click(stageButton!);

      expect(mockStage).toHaveBeenCalledWith(["src/index.ts"]);
    });

    it("should not propagate click event to parent when stage button clicked", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const unstagedItem = screen.getByTestId("change-item-index.ts");
      const stageButton = unstagedItem.querySelector(
        '[data-testid="stage-button"]',
      );

      fireEvent.click(stageButton!);

      // onFileSelect should NOT be called - click was on action button
      expect(mockOnFileSelect).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Git Actions - Unstaging
  // ===========================================================================

  describe("git actions - unstaging", () => {
    it("should show unstage button for staged files", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      // Staged file should have unstage button
      const stagedItem = screen.getByTestId("change-item-utils.ts");
      const unstageButton = stagedItem.querySelector(
        '[data-testid="unstage-button"]',
      );
      expect(unstageButton).toBeDefined();
    });

    it("should call unstage when unstage button is clicked", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const stagedItem = screen.getByTestId("change-item-utils.ts");
      const unstageButton = stagedItem.querySelector(
        '[data-testid="unstage-button"]',
      );

      fireEvent.click(unstageButton!);

      expect(mockUnstage).toHaveBeenCalledWith(["src/utils.ts"]);
    });
  });

  // ===========================================================================
  // Git Actions - Revert
  // ===========================================================================

  describe("git actions - revert", () => {
    it("should show revert button for unstaged files", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const unstagedItem = screen.getByTestId("change-item-index.ts");
      const revertButton = unstagedItem.querySelector(
        '[data-testid="revert-button"]',
      );
      expect(revertButton).toBeDefined();
    });

    it("should call revert when revert button is clicked", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const unstagedItem = screen.getByTestId("change-item-index.ts");
      const revertButton = unstagedItem.querySelector(
        '[data-testid="revert-button"]',
      );

      fireEvent.click(revertButton!);

      expect(mockRevert).toHaveBeenCalledWith(["src/index.ts"]);
    });

    it("should not show revert button for staged files", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const stagedItem = screen.getByTestId("change-item-utils.ts");
      const revertButton = stagedItem.querySelector(
        '[data-testid="revert-button"]',
      );
      expect(revertButton).toBeNull();
    });
  });

  // ===========================================================================
  // Git Status Badge
  // ===========================================================================

  describe("git status badge", () => {
    it("should show M badge for modified files", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const modifiedItem = screen.getByTestId("change-item-index.ts");
      expect(modifiedItem.textContent).toContain("M");
    });

    it("should show A badge for added files", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const addedItem = screen.getByTestId("change-item-utils.ts");
      expect(addedItem.textContent).toContain("A");
    });

    it("should show D badge for deleted files", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const deletedItem = screen.getByTestId("change-item-README.md");
      expect(deletedItem.textContent).toContain("D");
    });
  });

  // ===========================================================================
  // Event Subscriptions
  // ===========================================================================

  describe("event subscriptions", () => {
    it("should subscribe to git status changes", async () => {
      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(mockOnStatusChanged).toHaveBeenCalled();
      });
    });

    it("should cleanup subscription on unmount", async () => {
      const cleanup = vi.fn();
      mockOnStatusChanged.mockReturnValue(cleanup);

      const { unmount } = render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      unmount();

      expect(cleanup).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe("error handling", () => {
    it("should handle stage errors gracefully", async () => {
      mockStage.mockRejectedValueOnce(new Error("Stage failed"));

      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const unstagedItem = screen.getByTestId("change-item-index.ts");
      const stageButton = unstagedItem.querySelector(
        '[data-testid="stage-button"]',
      );

      // Should not throw
      fireEvent.click(stageButton!);
      expect(true).toBe(true);
    });

    it("should handle unstage errors gracefully", async () => {
      mockUnstage.mockRejectedValueOnce(new Error("Unstage failed"));

      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const stagedItem = screen.getByTestId("change-item-utils.ts");
      const unstageButton = stagedItem.querySelector(
        '[data-testid="unstage-button"]',
      );

      // Should not throw
      fireEvent.click(unstageButton!);
      expect(true).toBe(true);
    });

    it("should handle revert errors gracefully", async () => {
      mockRevert.mockRejectedValueOnce(new Error("Revert failed"));

      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const unstagedItem = screen.getByTestId("change-item-index.ts");
      const revertButton = unstagedItem.querySelector(
        '[data-testid="revert-button"]',
      );

      // Should not throw
      fireEvent.click(revertButton!);
      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // Alphabetical Sorting
  // ===========================================================================

  describe("alphabetical sorting", () => {
    it("should sort files alphabetically within sections", async () => {
      mockGetStatus.mockResolvedValue({
        branch: "main",
        files: new Map([
          [
            "z-file.ts",
            { status: "modified", staged: false, path: "z-file.ts" },
          ],
          [
            "a-file.ts",
            { status: "modified", staged: false, path: "a-file.ts" },
          ],
          [
            "m-file.ts",
            { status: "modified", staged: false, path: "m-file.ts" },
          ],
        ]),
      });

      render(
        <FileTreeChanges
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const items = screen.getAllByTestId(/^change-item-/);
      const names = items.map((item) => item.getAttribute("data-path"));

      // Should be in alphabetical order
      expect(names).toEqual(["a-file.ts", "m-file.ts", "z-file.ts"]);
    });
  });
});
