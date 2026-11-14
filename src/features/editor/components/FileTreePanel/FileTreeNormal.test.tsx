// @ts-nocheck
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { render } from "../../../../../tests/renderer/queryRender";
import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockFiles } from "../../../../../tests/renderer/files";

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
vi.mock("@features/editor/client/fileTreeCommands", () => ({
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
vi.mock("@features/workbench/client/actions/notifications", () => ({
  enqueueNotification: vi.fn(),
}));

// Mock useScrollPersistence
vi.mock("@features/editor/components/hooks/useScrollPersistence", () => ({
  useScrollPersistence: () => vi.fn(),
}));

// NOW import component AFTER mocks
import { FileTreeNormal } from "./FileTreeNormal";
import { registerFileTreeCallbacks } from "@features/editor/client/fileTreeCommands";
import { createQueryClient } from "@/query";
import { installFilesQueryBridge } from "@features/files/client/queries";

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
  let files: ReturnType<typeof mockFiles>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    files = mockFiles();
    files.readDirectory.mockResolvedValue(MOCK_DIRECTORY_ENTRIES);
  });

  // ===========================================================================
  // Initial Rendering
  // ===========================================================================

  describe("initial rendering", () => {
    it("should show loading state initially", () => {
      // Don't resolve the promise immediately
      files.readDirectory.mockReturnValue(new Promise(() => {}));

      render(
        <FileTreeNormal
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          gitStatus={MOCK_GIT_STATUS}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      expect(screen.getByText("Loading...")).toBeDefined();
    });

    it("should render root directory entries after loading", async () => {
      render(
        <FileTreeNormal
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
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
          gitStatus={MOCK_GIT_STATUS}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(files.readDirectory).toHaveBeenCalledWith(TEST_CWD, TEST_CWD);
      });
    });
  });

  // ===========================================================================
  // Directory Sorting
  // ===========================================================================

  describe("directory sorting", () => {
    it("should show directories before files", async () => {
      files.readDirectory.mockResolvedValue([
        { name: "a.txt", type: "file" },
        { name: "src", type: "directory" },
      ]);

      render(
        <FileTreeNormal
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          gitStatus={MOCK_GIT_STATUS}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

      const items = screen.getAllByRole("treeitem");
      expect(items[0].textContent).toContain("src");
      expect(items[1].textContent).toContain("a.txt");
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
          gitStatus={MOCK_GIT_STATUS}
          selectedFile={selectedFile}
          onFileSelect={mockOnFileSelect}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId("file-tree-normal")).toBeDefined();
      });

      const selected = screen.getByRole("treeitem", { selected: true });
      expect(selected.textContent).toContain("package.json");
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
        expect(files.readDirectory).toHaveBeenCalledWith(
          TEST_CWD,
          "/project/src",
        );
      });
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
  // Shared Listings
  // ===========================================================================

  describe("shared listings", () => {
    /** Two trees on the folder, as when its pane is split. */
    async function renderTwoTrees() {
      render(
        <>
          {["left", "right"].map((paneId) => (
            <FileTreeNormal
              key={paneId}
              paneId={paneId}
              cwd={TEST_CWD}
              gitStatus={MOCK_GIT_STATUS}
              selectedFile={null}
              onFileSelect={mockOnFileSelect}
            />
          ))}
        </>,
      );
      await waitFor(() => {
        expect(screen.getAllByTestId("tree-item-README.md")).toHaveLength(2);
      });
      const [left, right] = screen.getAllByTestId("file-tree-normal");
      // The left tree mounts first, so it registers first
      const commands = vi.mocked(registerFileTreeCallbacks).mock.calls[0][0];
      return { left, right, commands };
    }

    /** Type a name into the tree's inline input, and commit it. */
    function enterName(tree: HTMLElement, name: string) {
      const input = within(tree).getByTestId("file-tree-rename-input");
      fireEvent.change(input, { target: { value: name } });
      fireEvent.keyDown(input, { key: "Enter" });
    }

    it("shows a rename in the other tree at once", async () => {
      const { left, right, commands } = await renderTwoTrees();
      const reads = files.readDirectory.mock.calls.length;

      act(() => commands.onRename("/project/README.md"));
      enterName(left, "GUIDE.md");

      expect(
        await within(right).findByTestId("tree-item-GUIDE.md"),
      ).toBeDefined();
      expect(within(right).queryByTestId("tree-item-README.md")).toBeNull();
      expect(files.rename).toHaveBeenCalledWith(
        TEST_CWD,
        "/project/README.md",
        "/project/GUIDE.md",
      );
      expect(files.readDirectory).toHaveBeenCalledTimes(reads);
    });

    it("shows a new file in the other tree at once", async () => {
      const { left, right, commands } = await renderTwoTrees();
      const reads = files.readDirectory.mock.calls.length;

      await act(() => commands.onNewFile(TEST_CWD));
      enterName(left, "notes.md");

      expect(
        await within(right).findByTestId("tree-item-notes.md"),
      ).toBeDefined();
      expect(files.writeFile).toHaveBeenCalledWith(
        TEST_CWD,
        "/project/notes.md",
        new Uint8Array(0),
      );
      expect(mockOnFileSelect).toHaveBeenCalledWith(
        { path: "/project/notes.md", name: "notes.md", type: "file" },
        null,
      );
      expect(files.readDirectory).toHaveBeenCalledTimes(reads);
    });

    it("shows a delete in the other tree at once", async () => {
      const { right, commands } = await renderTwoTrees();
      const reads = files.readDirectory.mock.calls.length;

      act(() => commands.onDelete("/project/README.md"));
      fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

      await waitFor(() => {
        expect(within(right).queryByTestId("tree-item-README.md")).toBeNull();
      });
      expect(files.delete).toHaveBeenCalledWith(
        TEST_CWD,
        "/project/README.md",
        {
          recursive: false,
        },
      );
      expect(files.readDirectory).toHaveBeenCalledTimes(reads);
    });

    it("shows the listing the folder's watcher reports", async () => {
      let report: (payload: unknown) => void = () => {};
      window.conduit.files.on = vi.fn((_event, handler) => {
        report = handler;
        return () => {};
      });
      const queryClient = createQueryClient();
      installFilesQueryBridge(queryClient);
      render(
        <FileTreeNormal
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          gitStatus={MOCK_GIT_STATUS}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
        { queryClient },
      );
      await screen.findByTestId("tree-item-README.md");

      act(() =>
        report({
          subscriptionId: "sub",
          path: TEST_CWD,
          entries: [
            ...MOCK_DIRECTORY_ENTRIES,
            { name: "new.ts", type: "file" },
          ],
        }),
      );

      expect(await screen.findByTestId("tree-item-new.ts")).toBeDefined();
      expect(window.conduit.files.on).toHaveBeenCalledWith(
        "directoryListingChanged",
        expect.any(Function),
      );
    });

    it("reads a folder again when it's expanded after its listing goes stale", async () => {
      files.readDirectory.mockImplementation(async (_cwd, dir) =>
        dir === "/project/src" ? MOCK_SRC_ENTRIES : MOCK_DIRECTORY_ENTRIES,
      );
      render(
        <FileTreeNormal
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          gitStatus={MOCK_GIT_STATUS}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );
      await screen.findByTestId("tree-item-src");
      const toggle = () =>
        fireEvent.click(
          screen
            .getByTestId("tree-item-src")
            .closest('[data-testid="file-tree-item"]')!
            .querySelector('[data-testid="toggle-expand"]')!,
        );
      const srcReads = () =>
        files.readDirectory.mock.calls.filter(
          ([, dir]) => dir === "/project/src",
        ).length;

      toggle();
      await waitFor(() => expect(srcReads()).toBe(1));
      toggle();
      // A folder its watcher ignores (node_modules, say) only catches up when
      // it's read, so a listing kept from before isn't trusted for long
      const now = Date.now();
      const clock = vi.spyOn(Date, "now").mockReturnValue(now + 3000);
      toggle();

      await waitFor(() => expect(srcReads()).toBe(2));
      clock.mockRestore();
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe("error handling", () => {
    it("should handle readDirectory errors gracefully", async () => {
      files.readDirectory.mockRejectedValueOnce(new Error("Permission denied"));
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      render(
        <FileTreeNormal
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
          gitStatus={MOCK_GIT_STATUS}
          selectedFile={null}
          onFileSelect={mockOnFileSelect}
        />,
      );

      expect(
        await screen.findByRole("tree", { name: "File tree" }),
      ).toBeDefined();
      expect(screen.queryByText("Loading...")).toBeNull();
      expect(screen.queryAllByRole("treeitem")).toHaveLength(0);
      expect(consoleError).toHaveBeenCalledWith(
        "[query] Failed to load",
        ["files", "listing", TEST_CWD],
        expect.any(Error),
      );
      consoleError.mockRestore();
    });
  });

  // ===========================================================================
  // Accessibility
  // ===========================================================================

  describe("accessibility", () => {
    it("should have data-path attributes on items", async () => {
      render(
        <FileTreeNormal
          paneId={TEST_PANE_ID}
          cwd={TEST_CWD}
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

  // ===========================================================================
  // Keyboard Focus
  // ===========================================================================

  describe("keyboard focus", () => {
    it.each([
      [
        "an arrow key",
        (tree: HTMLElement) => fireEvent.keyDown(tree, { key: "ArrowDown" }),
        "/project/src",
      ],
      [
        "reveal",
        (_tree: HTMLElement, handle: { revealActiveFile: () => void }) =>
          act(() => handle.revealActiveFile()),
        "/project/README.md",
      ],
    ])(
      "focuses its own row after %s when another tree shows the same folder",
      async (_trigger, focusRow, expectedPath) => {
        const handle = createRef<{ revealActiveFile: () => void }>();
        const selectedFile = {
          path: "/project/README.md",
          name: "README.md",
          type: "file" as const,
        };
        render(
          <>
            {["left", "right"].map((paneId) => (
              <FileTreeNormal
                key={paneId}
                ref={paneId === "right" ? handle : undefined}
                paneId={paneId}
                cwd={TEST_CWD}
                gitStatus={MOCK_GIT_STATUS}
                selectedFile={selectedFile}
                onFileSelect={mockOnFileSelect}
              />
            ))}
          </>,
        );
        await waitFor(() => {
          expect(screen.getAllByTestId("file-tree-normal")).toHaveLength(2);
        });
        const rightTree = screen.getAllByTestId("file-tree-normal")[1];

        focusRow(rightTree, handle.current);

        await waitFor(() => {
          expect(document.activeElement?.getAttribute("data-path")).toBe(
            expectedPath,
          );
        });
        expect(rightTree.contains(document.activeElement)).toBe(true);
      },
    );
  });
});
