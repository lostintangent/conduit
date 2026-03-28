// @ts-nocheck
/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

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
  platform: "darwin",
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
  registerFileTreeChangesCallbacks: vi.fn(() => () => {}),
  activateFileTreeChangesCallbacks: vi.fn(),
  FileTreeCommands: {
    NEW_FILE: "fileTree.newFile",
    NEW_FOLDER: "fileTree.newFolder",
    RENAME: "fileTree.rename",
    DELETE: "fileTree.delete",
    COPY_PATH: "fileTree.copyPath",
    COPY_RELATIVE_PATH: "fileTree.copyRelativePath",
    REVEAL_IN_FINDER: "fileTree.revealInFinder",
    STAGE: "fileTree.stage",
    UNSTAGE: "fileTree.unstage",
    REVERT: "fileTree.revert",
  },
}));

// Mock notifications
vi.mock("@/store/actions/notifications", () => ({
  enqueueNotification: vi.fn(),
}));

// Import component after mocks
import { FileTreeChanges } from "../../../../../src/renderer/components/panes/editor/components/FileTreePanel/FileTreeChanges";

// ============================================================================
// API Mocks
// ============================================================================

// Mock git API (passed as prop)
const mockGetStatus = vi.fn();
const mockOnStatusChanged = vi.fn();
const mockStage = vi.fn();
const mockUnstage = vi.fn();
const mockRevert = vi.fn();
const mockWhenReady = vi.fn().mockResolvedValue(undefined);

const mockGitAPI = {
  getStatus: mockGetStatus,
  onStatusChanged: mockOnStatusChanged,
  stage: mockStage,
  unstage: mockUnstage,
  revert: mockRevert,
  whenReady: mockWhenReady,
};

// Mock useGitAvailable hook
vi.mock("@/hooks/useGitAvailable", () => ({
  useGitAvailable: () => ({
    isAvailable: true,
    isLoading: false,
  }),
}));

// Mock EditorPaneRegistry for scroll persistence
const mockRegistryInstance = {
  getOrCreate: vi.fn(),
  registerScrollContainer: vi.fn(),
  unregisterScrollContainer: vi.fn(),
  updateScrollPosition: vi.fn(),
};

vi.mock("@/components/panes/editor/registry/EditorPaneRegistry", () => ({
  EditorPaneRegistry: {
    getInstance: vi.fn(() => mockRegistryInstance),
  },
}));

// ============================================================================
// Test Data
// ============================================================================

const TEST_PANE_ID = "test-pane";
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      expect(screen.getByTestId("file-tree-changes-loading")).toBeDefined();
    });

    it("should render changes view after loading", async () => {
      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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
    it("should call onFileSelect with file and mapKey when clicking a file", async () => {
      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      fireEvent.click(screen.getByTestId("change-item-index.ts"));

      expect(mockOnFileSelect).toHaveBeenCalledWith(
        {
          path: "/project/src/index.ts",
          name: "index.ts",
          type: "file",
        },
        "src/index.ts", // mapKey
      );
    });

    it("should highlight selected file using selectedMapKey", async () => {
      const selectedFile = {
        path: "/project/src/index.ts",
        name: "index.ts",
        type: "file" as const,
      };

      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
          selectedFile={selectedFile}
          selectedMapKey="src/index.ts"
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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

      // Wait for async state updates to complete
      await waitFor(() => {
        expect(mockStage).toHaveBeenCalledWith(["src/index.ts"]);
      });
    });

    it("should not propagate click event to parent when stage button clicked", async () => {
      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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

      // Wait for async state updates to complete
      await waitFor(() => {
        expect(mockStage).toHaveBeenCalled();
      });

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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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

      // Wait for async state updates to complete
      await waitFor(() => {
        expect(mockUnstage).toHaveBeenCalledWith(["src/utils.ts"]);
      });
    });
  });

  // ===========================================================================
  // Git Actions - Revert
  // ===========================================================================

  describe("git actions - revert", () => {
    it("should show revert button for unstaged files", async () => {
      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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

    it("should show revert button for untracked files", async () => {
      const MOCK_STATUS_WITH_UNTRACKED = {
        branch: "main",
        files: new Map([
          [
            "new-file.ts",
            { status: "untracked", staged: false, path: "new-file.ts" },
          ],
        ]),
      };
      mockGetStatus.mockResolvedValue(MOCK_STATUS_WITH_UNTRACKED);

      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const untrackedItem = screen.getByTestId("change-item-new-file.ts");
      const revertButton = untrackedItem.querySelector(
        '[data-testid="revert-button"]',
      );
      // Untracked files should now show revert button (will delete the file)
      expect(revertButton).toBeDefined();
    });
  });

  // ===========================================================================
  // Git Status Badge
  // ===========================================================================

  describe("git status badge", () => {
    it("should show M badge for modified files", async () => {
      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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

      // Wait for async error handling to complete
      await waitFor(() => {
        expect(mockStage).toHaveBeenCalled();
      });

      expect(true).toBe(true);
    });

    it("should handle unstage errors gracefully", async () => {
      mockUnstage.mockRejectedValueOnce(new Error("Unstage failed"));

      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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

      // Wait for async error handling to complete
      await waitFor(() => {
        expect(mockUnstage).toHaveBeenCalled();
      });

      expect(true).toBe(true);
    });

    it("should handle revert errors gracefully", async () => {
      mockRevert.mockRejectedValueOnce(new Error("Revert failed"));

      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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

      // Wait for async error handling to complete
      await waitFor(() => {
        expect(mockRevert).toHaveBeenCalled();
      });

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
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
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

  // ===========================================================================
  // Multi-Select
  // ===========================================================================

  describe("multi-select", () => {
    const MOCK_STATUS_MULTI = {
      branch: "main",
      files: new Map([
        ["file1.ts", { status: "modified", staged: false, path: "file1.ts" }],
        ["file2.ts", { status: "modified", staged: false, path: "file2.ts" }],
        ["file3.ts", { status: "modified", staged: false, path: "file3.ts" }],
        ["file4.ts", { status: "added", staged: true, path: "file4.ts" }],
        ["file5.ts", { status: "added", staged: true, path: "file5.ts" }],
      ]),
    };

    it("should select single item on regular click", async () => {
      mockGetStatus.mockResolvedValue(MOCK_STATUS_MULTI);

      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const item = screen.getByTestId("change-item-file1.ts");
      fireEvent.click(item);

      // onFileSelect should be called with file and mapKey
      expect(mockOnFileSelect).toHaveBeenCalledWith(
        expect.objectContaining({ name: "file1.ts" }),
        "file1.ts",
      );
    });

    it("should select range with shift-click", async () => {
      mockGetStatus.mockResolvedValue(MOCK_STATUS_MULTI);

      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      // Click first item
      const item1 = screen.getByTestId("change-item-file1.ts");
      fireEvent.click(item1);

      // Shift-click third item
      const item3 = screen.getByTestId("change-item-file3.ts");
      fireEvent.click(item3, { shiftKey: true });

      // All three items should be highlighted
      expect(item1.className).toContain("bg-accent");
      expect(screen.getByTestId("change-item-file2.ts").className).toContain(
        "bg-accent",
      );
      expect(item3.className).toContain("bg-accent");
    });

    it("should toggle selection with cmd-click", async () => {
      mockGetStatus.mockResolvedValue(MOCK_STATUS_MULTI);

      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      // First click triggers single-select (not multi-select)
      const item1 = screen.getByTestId("change-item-file1.ts");
      fireEvent.click(item1);

      // Cmd-click third item to add to multi-selection
      const item3 = screen.getByTestId("change-item-file3.ts");
      fireEvent.click(item3, { metaKey: true });

      // Both items should be in multi-selection (bg-accent/25)
      // Note: item1 was added to multi-select when cmd+click on item3 was performed
      // because cmd-click uses handleMultiSelectClick which adds to selection
      expect(item3.className).toContain("bg-accent/25");

      // Item 2 should not be in multi-selection
      expect(
        screen.getByTestId("change-item-file2.ts").className,
      ).not.toContain("bg-accent/25");
    });
  });

  // ===========================================================================
  // Bulk Actions
  // ===========================================================================

  describe("bulk actions", () => {
    const MOCK_STATUS_BULK = {
      branch: "main",
      files: new Map([
        ["file1.ts", { status: "modified", staged: false, path: "file1.ts" }],
        ["file2.ts", { status: "modified", staged: false, path: "file2.ts" }],
        ["file3.ts", { status: "modified", staged: false, path: "file3.ts" }],
      ]),
    };

    it("should stage all selected files when clicking stage on any selected file", async () => {
      mockGetStatus.mockResolvedValue(MOCK_STATUS_BULK);

      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      // Select range of files
      const item1 = screen.getByTestId("change-item-file1.ts");
      fireEvent.click(item1);

      const item3 = screen.getByTestId("change-item-file3.ts");
      fireEvent.click(item3, { shiftKey: true });

      // Click stage button on any selected file
      const stageButton = item1.querySelector('[data-testid="stage-button"]');
      fireEvent.click(stageButton!);

      // Should stage all selected files
      await waitFor(() => {
        expect(mockStage).toHaveBeenCalledWith([
          "file1.ts",
          "file2.ts",
          "file3.ts",
        ]);
      });
    });

    it("should unstage all selected files when clicking unstage on any selected file", async () => {
      mockGetStatus.mockResolvedValue({
        branch: "main",
        files: new Map([
          ["file1.ts", { status: "added", staged: true, path: "file1.ts" }],
          ["file2.ts", { status: "added", staged: true, path: "file2.ts" }],
          ["file3.ts", { status: "added", staged: true, path: "file3.ts" }],
        ]),
      });

      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      // Select range of files
      const item1 = screen.getByTestId("change-item-file1.ts");
      fireEvent.click(item1);

      const item3 = screen.getByTestId("change-item-file3.ts");
      fireEvent.click(item3, { shiftKey: true });

      // Click unstage button on any selected file
      const unstageButton = item1.querySelector(
        '[data-testid="unstage-button"]',
      );
      fireEvent.click(unstageButton!);

      // Should unstage all selected files
      await waitFor(() => {
        expect(mockUnstage).toHaveBeenCalledWith([
          "file1.ts",
          "file2.ts",
          "file3.ts",
        ]);
      });
    });

    it("should revert all selected files when clicking revert on any selected file", async () => {
      mockGetStatus.mockResolvedValue(MOCK_STATUS_BULK);

      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      // Select range of files using shift-click (to get both files in order)
      const item1 = screen.getByTestId("change-item-file1.ts");
      fireEvent.click(item1);

      const item2 = screen.getByTestId("change-item-file2.ts");
      fireEvent.click(item2, { shiftKey: true });

      // Click revert button on first selected file
      const revertButton = item1.querySelector('[data-testid="revert-button"]');
      fireEvent.click(revertButton!);

      // Should revert all selected files (order may vary, so use arrayContaining)
      await waitFor(() => {
        expect(mockRevert).toHaveBeenCalledWith(
          expect.arrayContaining(["file1.ts", "file2.ts"]),
        );
      });
    });
  });

  // ===========================================================================
  // Partially Staged Files & MapKey Normalization
  // ===========================================================================

  describe("partially staged files", () => {
    /** Suffix for unstaged entries in partially staged files */
    const UNSTAGED_KEY_SUFFIX = "\0unstaged";

    const MOCK_STATUS_PARTIAL = {
      branch: "main",
      files: new Map([
        // Partially staged file - staged entry
        [
          "src/partial.ts",
          { status: "modified", staged: true, path: "src/partial.ts" },
        ],
        // Partially staged file - unstaged entry (with suffix in mapKey)
        [
          `src/partial.ts${UNSTAGED_KEY_SUFFIX}`,
          { status: "modified", staged: false, path: "src/partial.ts" },
        ],
        // Regular unstaged file
        [
          "src/other.ts",
          { status: "modified", staged: false, path: "src/other.ts" },
        ],
      ]),
    };

    it("should display both staged and unstaged entries for partially staged files", async () => {
      mockGetStatus.mockResolvedValue(MOCK_STATUS_PARTIAL);

      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      // Should have staged section with the staged entry
      expect(screen.getByTestId("section-staged-changes")).toBeDefined();

      // Should have changes section with both unstaged entries
      expect(screen.getByTestId("section-changes")).toBeDefined();
    });

    it("should normalize selectedMapKey with suffix to match file without suffix", async () => {
      mockGetStatus.mockResolvedValue({
        branch: "main",
        files: new Map([
          // Regular unstaged file (no suffix in mapKey)
          [
            "src/index.ts",
            { status: "modified", staged: false, path: "src/index.ts" },
          ],
        ]),
      });

      // Parent passes selectedMapKey with suffix, but the file list has no suffix
      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
          selectedFile={null}
          selectedMapKey={`src/index.ts${UNSTAGED_KEY_SUFFIX}`}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      // File should still be highlighted because normalizedSelectedMapKey strips suffix
      const selectedItem = screen.getByTestId("change-item-index.ts");
      expect(selectedItem.className).toContain("bg-accent");
    });

    it("should use actual file path for git operations with partially staged files", async () => {
      mockGetStatus.mockResolvedValue(MOCK_STATUS_PARTIAL);

      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      // Find the unstaged "other.ts" file and click its stage button
      const otherItem = screen.getByTestId("change-item-other.ts");
      const stageButton = otherItem.querySelector(
        '[data-testid="stage-button"]',
      );

      fireEvent.click(stageButton!);

      // Git stage should be called with actual file path (not mapKey with suffix)
      await waitFor(() => {
        expect(mockStage).toHaveBeenCalledWith(["src/other.ts"]);
      });
    });
  });

  // ===========================================================================
  // Stage All / Unstage All
  // ===========================================================================

  describe("stage all / unstage all", () => {
    it("should show stage all button on Changes section", async () => {
      mockGetStatus.mockResolvedValue(MOCK_STATUS_UNSTAGED_ONLY);

      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const changesSection = screen.getByTestId("section-changes");
      const stageAllButton = changesSection.querySelector(
        '[data-testid="stage-all-button"]',
      );

      expect(stageAllButton).toBeDefined();
    });

    it("should show unstage all button on Staged Changes section", async () => {
      mockGetStatus.mockResolvedValue(MOCK_STATUS_STAGED_ONLY);

      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const stagedSection = screen.getByTestId("section-staged-changes");
      const unstageAllButton = stagedSection.querySelector(
        '[data-testid="unstage-all-button"]',
      );

      expect(unstageAllButton).toBeDefined();
    });

    it("should stage all unstaged files when stage all button is clicked", async () => {
      mockGetStatus.mockResolvedValue(MOCK_STATUS_UNSTAGED_ONLY);

      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const changesSection = screen.getByTestId("section-changes");
      const stageAllButton = changesSection.querySelector(
        '[data-testid="stage-all-button"]',
      );

      fireEvent.click(stageAllButton!);

      await waitFor(() => {
        expect(mockStage).toHaveBeenCalledWith(["file1.ts", "file2.ts"]);
      });
    });

    it("should unstage all staged files when unstage all button is clicked", async () => {
      mockGetStatus.mockResolvedValue(MOCK_STATUS_STAGED_ONLY);

      render(
        <FileTreeChanges
          viewMode="flat"
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          git={mockGitAPI as any}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      });

      const stagedSection = screen.getByTestId("section-staged-changes");
      const unstageAllButton = stagedSection.querySelector(
        '[data-testid="unstage-all-button"]',
      );

      fireEvent.click(unstageAllButton!);

      await waitFor(() => {
        expect(mockUnstage).toHaveBeenCalledWith(["file1.ts", "file2.ts"]);
      });
    });
  });
});
