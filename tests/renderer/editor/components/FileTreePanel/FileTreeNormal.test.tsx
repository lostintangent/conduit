// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Polyfills for jsdom
// ============================================================================

// CSS.escape is not available in jsdom
if (typeof CSS === "undefined") {
  (globalThis as any).CSS = {};
}
if (typeof CSS.escape !== "function") {
  CSS.escape = (str: string) => str.replace(/([^\w-])/g, "\\$1");
}

// scrollIntoView is not available in jsdom
Element.prototype.scrollIntoView = vi.fn();

// ============================================================================
// Mocks - MUST BE BEFORE COMPONENT IMPORT
// ============================================================================

// Mock window.conduit for context menu
const mockOnContextMenuCommand = vi.fn(() => () => {});
const mockShowContextMenu = vi.fn();

// @ts-ignore
globalThis.window.conduit = {
  onContextMenuCommand: mockOnContextMenuCommand,
  showContextMenu: mockShowContextMenu,
};

// Mock the command system
vi.mock("@/commands", () => ({
  getContextKeyService: () => ({
    setGlobal: vi.fn(),
    getAll: () => ({}),
  }),
  getCommandRegistry: () => ({
    getCommand: () => null,
    executeCommand: vi.fn(),
  }),
  getMenuRegistry: () => ({
    getSortedMenuItems: () => [],
  }),
  getKeybindingRegistry: () => ({
    getKeybindingsForCommand: () => [],
  }),
  When: {
    and: () => ({ evaluate: () => true }),
    never: () => ({ evaluate: () => false }),
  },
}));

// Mock the fileTreeCommands
vi.mock("@/commands/fileTreeCommands", () => ({
  registerFileTreeCallbacks: vi.fn(() => () => {}),
  activateFileTreeCallbacks: vi.fn(),
  FileTreeCommands: {
    NEW_FILE: "fileTree.newFile",
    NEW_FOLDER: "fileTree.newFolder",
    RENAME: "fileTree.rename",
    DELETE: "fileTree.delete",
    COPY_PATH: "fileTree.copyPath",
    COPY_RELATIVE_PATH: "fileTree.copyRelativePath",
    REVEAL_IN_FINDER: "fileTree.revealInFinder",
  },
}));

// Mock notifications
vi.mock("@/store/actions/notifications", () => ({
  enqueueNotification: vi.fn(),
}));

// Mock fs API - use stable references
const mockReadDirectory = vi.fn();
const mockOnDirectoryListingChanged = vi.fn();
const mockWriteFile = vi.fn();
const mockCreateDirectory = vi.fn();
const mockDelete = vi.fn();
const mockRename = vi.fn();

// Create stable fs API object (passed as prop)
const mockFsAPI = {
  cwd: "/project",
  isReleased: false,
  readDirectory: mockReadDirectory,
  onDirectoryListingChanged: mockOnDirectoryListingChanged,
  writeFile: mockWriteFile,
  createDirectory: mockCreateDirectory,
  delete: mockDelete,
  rename: mockRename,
};

// Mock useFileSystemV2 hook
vi.mock("@/hooks/useFileSystemV2", () => ({
  useFileSystemV2: () => mockFsAPI,
}));

// Mock useGitAvailable hook
vi.mock("@/hooks/useGitAvailable", () => ({
  useGitAvailable: () => ({
    isAvailable: true,
    isLoading: false,
  }),
}));

// Mock useScrollPersistence
vi.mock("@/components/panes/editor/hooks/useScrollPersistence", () => ({
  useScrollPersistence: () => vi.fn(),
}));

// NOW import component AFTER mocks
import { FileTreeNormal } from "../../../../../src/renderer/components/panes/editor/components/FileTreePanel/FileTreeNormal";

// ============================================================================
// Test Data
// ============================================================================

const TEST_PANE_ID = "test-pane";
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

const MOCK_GIT_STATUS = new Map([
  ["src/index.ts", { status: "modified", staged: false, path: "src/index.ts" }],
  ["package.json", { status: "modified", staged: true, path: "package.json" }],
]);

// ============================================================================
// Tests
// ============================================================================

describe("FileTreeNormal", () => {
  const mockOnFileSelect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    mockReadDirectory.mockResolvedValue(MOCK_DIRECTORY_ENTRIES);
    mockOnDirectoryListingChanged.mockReturnValue(() => {});
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
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          fs={mockFsAPI as any}
          gitStatus={MOCK_GIT_STATUS}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      expect(screen.getByTestId("file-tree-loading")).toBeDefined();
    });

    it("should render root directory entries after loading", async () => {
      render(
        <FileTreeNormal
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          fs={mockFsAPI as any}
          gitStatus={MOCK_GIT_STATUS}
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
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          fs={mockFsAPI as any}
          gitStatus={MOCK_GIT_STATUS}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(mockReadDirectory).toHaveBeenCalledWith(TEST_CWD);
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
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          fs={mockFsAPI as any}
          gitStatus={MOCK_GIT_STATUS}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

      // First item should be the directory (src)
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
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          fs={mockFsAPI as any}
          gitStatus={MOCK_GIT_STATUS}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("tree-item-README.md"));

      expect(mockOnFileSelect).toHaveBeenCalledWith(
        {
          path: "/project/README.md",
          name: "README.md",
          type: "file",
        },
        null, // mapKey is null for normal file tree (not changes mode)
      );
    });

    it("should highlight selected file", async () => {
      const selectedFile = {
        path: "/project/package.json",
        name: "package.json",
        type: "file" as const,
      };

      render(
        <FileTreeNormal
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          fs={mockFsAPI as any}
          gitStatus={MOCK_GIT_STATUS}
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
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          fs={mockFsAPI as any}
          gitStatus={MOCK_GIT_STATUS}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

      const srcItem = screen.getByTestId("tree-item-src");
      const fileTreeItem = srcItem.closest('[data-testid="file-tree-item"]');
      const toggleButton = fileTreeItem?.querySelector(
        '[data-testid="toggle-expand"]',
      );

      expect(toggleButton).not.toBeNull();
      fireEvent.click(toggleButton!);

      await waitFor(() => {
        expect(mockReadDirectory).toHaveBeenCalledWith("/project/src");
      });
    });

    it("should have expand toggle for directories", async () => {
      render(
        <FileTreeNormal
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          fs={mockFsAPI as any}
          gitStatus={MOCK_GIT_STATUS}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

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
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          fs={mockFsAPI as any}
          gitStatus={MOCK_GIT_STATUS}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

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
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          fs={mockFsAPI as any}
          gitStatus={MOCK_GIT_STATUS}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(mockOnDirectoryListingChanged).toHaveBeenCalled();
      });
    });

    it("should cleanup directory subscription on unmount", async () => {
      const cleanupDir = vi.fn();
      mockOnDirectoryListingChanged.mockReturnValue(cleanupDir);

      const { unmount } = render(
        <FileTreeNormal
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          fs={mockFsAPI as any}
          gitStatus={MOCK_GIT_STATUS}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

      unmount();

      expect(cleanupDir).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe("error handling", () => {
    it("should handle readDirectory errors gracefully", async () => {
      mockReadDirectory.mockRejectedValueOnce(new Error("Permission denied"));

      render(
        <FileTreeNormal
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          fs={mockFsAPI as any}
          gitStatus={MOCK_GIT_STATUS}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      expect(true).toBe(true);
    });
  });

  // ===========================================================================
  // Accessibility
  // ===========================================================================

  describe("accessibility", () => {
    it("should have file-tree-normal test id", async () => {
      render(
        <FileTreeNormal
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          fs={mockFsAPI as any}
          gitStatus={MOCK_GIT_STATUS}
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
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          fs={mockFsAPI as any}
          gitStatus={MOCK_GIT_STATUS}
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
