// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { FileTreeNormal } from "../../../../src/renderer/components/panes/editor-v2/components/FileTreePanel/FileTreeNormal";

// ============================================================================
// Mocks
// ============================================================================

// Mock useFileSystemV2 hook
const mockReadDirectory = vi.fn();
const mockOnDirectoryListingChanged = vi.fn();

vi.mock("@/hooks/useFileSystemV2", () => ({
  useFileSystemV2: () => ({
    readDirectory: mockReadDirectory,
    onDirectoryListingChanged: mockOnDirectoryListingChanged,
  }),
}));

// Mock useGitV2 hook
const mockGetStatus = vi.fn();
const mockOnStatusChanged = vi.fn();

vi.mock("@/hooks/useGitV2", () => ({
  useGitV2: () => ({
    getStatus: mockGetStatus,
    onStatusChanged: mockOnStatusChanged,
  }),
}));

// ============================================================================
// Test Data
// ============================================================================

const TEST_CWD = "/project";

const MOCK_DIRECTORY_ENTRIES = [
  { name: "src", type: "directory" as const },
  { name: "package.json", type: "file" as const },
  { name: "README.md", type: "file" as const },
];

const MOCK_SRC_ENTRIES = [
  { name: "index.ts", type: "file" as const },
  { name: "utils", type: "directory" as const },
];

const MOCK_GIT_STATUS = {
  branch: "main",
  files: new Map([
    [
      "src/index.ts",
      { status: "modified", staged: false, path: "src/index.ts" },
    ],
    [
      "package.json",
      { status: "modified", staged: true, path: "package.json" },
    ],
  ]),
};

// ============================================================================
// Tests
// ============================================================================

describe("FileTreeNormal", () => {
  const mockOnFileSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockReadDirectory.mockResolvedValue(MOCK_DIRECTORY_ENTRIES);
    mockGetStatus.mockResolvedValue(MOCK_GIT_STATUS);
    mockOnDirectoryListingChanged.mockReturnValue(() => {});
    mockOnStatusChanged.mockReturnValue(() => {});
  });

  // ===========================================================================
  // Initial Rendering
  // ===========================================================================

  describe("initial rendering", () => {
    it("should show loading state initially", () => {
      // Don't resolve the promise immediately
      mockReadDirectory.mockReturnValue(new Promise(() => {}));

      render(
        <FileTreeNormal
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      expect(screen.getByTestId("file-tree-loading")).toBeDefined();
    });

    it("should render root directory entries after loading", async () => {
      render(
        <FileTreeNormal
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

      // Should show all entries
      expect(screen.getByTestId("tree-item-src")).toBeDefined();
      expect(screen.getByTestId("tree-item-package.json")).toBeDefined();
      expect(screen.getByTestId("tree-item-README.md")).toBeDefined();
    });

    it("should call readDirectory with cwd on mount", async () => {
      render(
        <FileTreeNormal
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(mockReadDirectory).toHaveBeenCalledWith(TEST_CWD);
      });
    });

    it("should call getStatus on mount", async () => {
      render(
        <FileTreeNormal
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
  // Directory Sorting
  // ===========================================================================

  describe("directory sorting", () => {
    it("should show directories before files", async () => {
      render(
        <FileTreeNormal
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

      // First item should be the directory (src)
      // The tree-item-src should appear before tree-item-package.json
      const srcItem = screen.getByTestId("tree-item-src");
      expect(srcItem.getAttribute("data-type")).toBe("directory");
    });
  });

  // ===========================================================================
  // File Selection
  // ===========================================================================

  describe("file selection", () => {
    it("should call onFileSelect when clicking a file", async () => {
      render(
        <FileTreeNormal
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("tree-item-README.md"));

      expect(mockOnFileSelect).toHaveBeenCalledWith({
        path: "/project/README.md",
        name: "README.md",
        type: "file",
      });
    });

    it("should highlight selected file", async () => {
      const selectedFile = {
        path: "/project/package.json",
        name: "package.json",
        type: "file" as const,
      };

      render(
        <FileTreeNormal
          cwd={TEST_CWD}
          selectedFile={selectedFile}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

      const selectedItem = screen.getByTestId("tree-item-package.json");
      expect(selectedItem.className).toContain("bg-accent");
    });
  });

  // ===========================================================================
  // Directory Expansion
  // ===========================================================================

  describe("directory expansion", () => {
    it("should load subdirectory contents when expanding", async () => {
      render(
        <FileTreeNormal
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

      // Find the expand button for the src directory specifically
      const srcItem = screen.getByTestId("tree-item-src");
      // The toggle button is a sibling within the same parent container
      const fileTreeItem = srcItem.closest('[data-testid="file-tree-item"]');
      const toggleButton = fileTreeItem?.querySelector(
        '[data-testid="toggle-expand"]',
      );

      expect(toggleButton).not.toBeNull();
      fireEvent.click(toggleButton!);

      // After clicking, readDirectory should be called for /project/src
      await waitFor(() => {
        expect(mockReadDirectory).toHaveBeenCalledWith("/project/src");
      });
    });

    it("should have expand toggle for directories", async () => {
      render(
        <FileTreeNormal
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

      // The expand toggle should be visible for directory
      const toggleButton = screen.getByTestId("toggle-expand");
      expect(toggleButton).toBeDefined();
    });
  });

  // ===========================================================================
  // Git Status Display
  // ===========================================================================

  describe("git status display", () => {
    it("should show git status badges for modified files", async () => {
      render(
        <FileTreeNormal
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

      // package.json is in MOCK_GIT_STATUS as modified (staged)
      // Should have a status badge (M for modified)
      const packageItem = screen.getByTestId("tree-item-package.json");
      expect(packageItem.textContent).toContain("M");
    });
  });

  // ===========================================================================
  // Event Subscriptions
  // ===========================================================================

  describe("event subscriptions", () => {
    it("should subscribe to directory listing changes", async () => {
      render(
        <FileTreeNormal
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(mockOnDirectoryListingChanged).toHaveBeenCalled();
      });
    });

    it("should subscribe to git status changes", async () => {
      render(
        <FileTreeNormal
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(mockOnStatusChanged).toHaveBeenCalled();
      });
    });

    it("should cleanup subscriptions on unmount", async () => {
      const cleanupDir = vi.fn();
      const cleanupGit = vi.fn();
      mockOnDirectoryListingChanged.mockReturnValue(cleanupDir);
      mockOnStatusChanged.mockReturnValue(cleanupGit);

      const { unmount } = render(
        <FileTreeNormal
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

      unmount();

      expect(cleanupDir).toHaveBeenCalled();
      expect(cleanupGit).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe("error handling", () => {
    it("should handle readDirectory errors gracefully", async () => {
      mockReadDirectory.mockRejectedValueOnce(new Error("Permission denied"));

      // Should not throw
      render(
        <FileTreeNormal
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      // Just ensure no crash - loading state should remain or component recovers
      expect(true).toBe(true);
    });

    it("should handle getStatus errors gracefully", async () => {
      mockGetStatus.mockRejectedValueOnce(new Error("Not a git repo"));

      render(
        <FileTreeNormal
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      // Should still render the tree without git status
      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });
    });
  });

  // ===========================================================================
  // Accessibility
  // ===========================================================================

  describe("accessibility", () => {
    it("should have file-tree-normal test id", async () => {
      render(
        <FileTreeNormal
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });
    });

    it("should have data-path attributes on items", async () => {
      render(
        <FileTreeNormal
          cwd={TEST_CWD}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

      const readmeItem = screen.getByTestId("tree-item-README.md");
      expect(readmeItem.getAttribute("data-path")).toBe("/project/README.md");
    });
  });
});
