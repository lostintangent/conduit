import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { render } from "../../../../../tests/renderer/queryRender";
import { type ComponentProps, createRef, type Ref } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockFiles } from "../../../../../tests/renderer/files";
import type {
  DirectoryEntry,
  DirectoryListingChangedEvent,
} from "@features/files/model";
import type { GitFileStatus } from "@features/git/model";

// The context menu hook subscribes to its commands on mount
Object.assign(window, {
  conduit: {
    onContextMenuCommand: vi.fn(() => () => {}),
    showContextMenu: vi.fn(),
  },
});

vi.mock("@features/editor/client/fileTreeCommands", () => ({
  registerFileTreeCallbacks: vi.fn(() => () => {}),
  activateFileTreeCallbacks: vi.fn(),
}));

import { FileTreeNormal, type FileTreeNormalHandle } from "./FileTreeNormal";
import { registerFileTreeCallbacks } from "@features/editor/client/fileTreeCommands";
import { createQueryClient } from "@/query";
import { installFilesQueryBridge } from "@features/files/client/queries";

const TEST_CWD = "/project";

const dir = (name: string): DirectoryEntry => ({
  name,
  type: "directory",
  isSymlink: false,
});
const file = (name: string): DirectoryEntry => ({
  name,
  type: "file",
  isSymlink: false,
});

const MOCK_DIRECTORY_ENTRIES = [
  dir("src"),
  file("package.json"),
  file("README.md"),
];
const MOCK_SRC_ENTRIES = [file("index.ts"), dir("utils")];

const MOCK_GIT_STATUS = new Map<string, GitFileStatus>([
  ["src/index.ts", { status: "modified", staged: false, path: "src/index.ts" }],
  ["package.json", { status: "modified", staged: true, path: "package.json" }],
]);

const README = {
  path: "/project/README.md",
  name: "README.md",
  type: "file" as const,
};

type Props = ComponentProps<typeof FileTreeNormal>;

describe("FileTreeNormal", () => {
  const mockOnFileSelect = vi.fn();
  let files: ReturnType<typeof mockFiles>;

  beforeEach(() => {
    vi.clearAllMocks();
    files = mockFiles();
    files.readDirectory.mockImplementation(async (_cwd, path) =>
      path === "/project/src" ? MOCK_SRC_ENTRIES : MOCK_DIRECTORY_ENTRIES,
    );
  });

  const baseProps: Props = {
    paneId: "test-pane",
    cwd: TEST_CWD,
    gitStatus: MOCK_GIT_STATUS,
    selectedFile: null,
    onFileSelect: mockOnFileSelect,
  };
  const tree = (props: Partial<Props> = {}) => (
    <FileTreeNormal {...baseProps} {...props} />
  );

  /** Render a tree and wait for the folder's listing. */
  async function renderTree(
    props?: Partial<Props>,
    options?: Parameters<typeof render>[1],
  ) {
    render(tree(props), options);
    return screen.findByTestId("file-tree-normal");
  }

  /** Two trees on the folder, as when its pane is split. */
  async function renderTwoTrees(
    props: Partial<Props> = {},
    rightRef?: Ref<FileTreeNormalHandle>,
  ) {
    render(
      <>
        {["left", "right"].map((paneId) => (
          <FileTreeNormal
            key={paneId}
            {...baseProps}
            {...props}
            paneId={paneId}
            ref={paneId === "right" ? rightRef : undefined}
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

  const toggleFolder = (name: string) =>
    fireEvent.click(
      within(screen.getByTestId(`tree-item-${name}`)).getByTestId(
        "toggle-expand",
      ),
    );

  describe("initial rendering", () => {
    it("should show loading state initially", () => {
      files.readDirectory.mockReturnValue(new Promise(() => {}));

      render(tree());

      expect(screen.getByText("Loading...")).toBeDefined();
    });

    it("should render root directory entries after loading", async () => {
      await renderTree();

      expect(screen.getByTestId("tree-item-src")).toBeDefined();
      expect(screen.getByTestId("tree-item-package.json")).toBeDefined();
      expect(screen.getByTestId("tree-item-README.md")).toBeDefined();
    });

    it("should call readDirectory with cwd on mount", async () => {
      await renderTree();

      expect(files.readDirectory).toHaveBeenCalledWith(TEST_CWD, TEST_CWD);
    });
  });

  describe("directory sorting", () => {
    it("should show directories before files", async () => {
      files.readDirectory.mockResolvedValue([file("a.txt"), dir("src")]);

      await renderTree();

      const items = screen.getAllByRole("treeitem");
      expect(items[0].textContent).toContain("src");
      expect(items[1].textContent).toContain("a.txt");
    });
  });

  describe("file selection", () => {
    it("should call onFileSelect when clicking a file", async () => {
      await renderTree();

      fireEvent.click(screen.getByTestId("tree-item-README.md"));

      // The normal tree has no staged and unstaged copies, so no map key
      expect(mockOnFileSelect).toHaveBeenCalledWith(README, null);
    });

    it("should highlight selected file", async () => {
      await renderTree({
        selectedFile: {
          path: "/project/package.json",
          name: "package.json",
          type: "file",
        },
      });

      const selected = screen.getByRole("treeitem", { selected: true });
      expect(selected.textContent).toContain("package.json");
    });
  });

  describe("directory expansion", () => {
    it("should load subdirectory contents when expanding", async () => {
      await renderTree();

      toggleFolder("src");

      expect(await screen.findByTestId("tree-item-index.ts")).toBeDefined();
      expect(files.readDirectory).toHaveBeenCalledWith(
        TEST_CWD,
        "/project/src",
      );
    });
  });

  describe("git status display", () => {
    it("should show git status badges for modified files", async () => {
      await renderTree();

      const packageItem = screen.getByTestId("tree-item-package.json");
      expect(packageItem.textContent).toContain("M");
    });
  });

  describe("shared listings", () => {
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
        { recursive: false },
      );
      expect(files.readDirectory).toHaveBeenCalledTimes(reads);
    });

    it("shows the listing the folder's watcher reports", async () => {
      let report: (event: DirectoryListingChangedEvent) => void = () => {};
      const on = vi.fn((_event: string, handler: typeof report) => {
        report = handler;
        return () => {};
      });
      Object.assign(window.conduit.files, { on });
      const queryClient = createQueryClient();
      installFilesQueryBridge(queryClient);
      await renderTree({}, { queryClient });

      act(() =>
        report({
          path: TEST_CWD,
          entries: [...MOCK_DIRECTORY_ENTRIES, file("new.ts")],
        }),
      );

      expect(await screen.findByTestId("tree-item-new.ts")).toBeDefined();
      expect(on).toHaveBeenCalledWith(
        "directoryListingChanged",
        expect.any(Function),
      );
    });

    it("reads a folder again when it's expanded after its listing goes stale", async () => {
      await renderTree();
      const srcReads = () =>
        files.readDirectory.mock.calls.filter(
          ([, path]) => path === "/project/src",
        ).length;

      toggleFolder("src");
      await waitFor(() => expect(srcReads()).toBe(1));
      toggleFolder("src");
      // A folder its watcher ignores (node_modules, say) only catches up when
      // it's read, so a listing kept from before isn't trusted for long
      const now = Date.now();
      const clock = vi.spyOn(Date, "now").mockReturnValue(now + 3000);
      toggleFolder("src");

      await waitFor(() => expect(srcReads()).toBe(2));
      clock.mockRestore();
    });
  });

  describe("error handling", () => {
    it("should handle readDirectory errors gracefully", async () => {
      files.readDirectory.mockRejectedValueOnce(new Error("Permission denied"));
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      render(tree());

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

  describe("accessibility", () => {
    it("should have data-path attributes on items", async () => {
      await renderTree();

      const readmeItem = screen.getByTestId("tree-item-README.md");
      expect(readmeItem.getAttribute("data-path")).toBe("/project/README.md");
    });
  });

  describe("keyboard focus", () => {
    it.each([
      [
        "an arrow key",
        (tree: HTMLElement) => fireEvent.keyDown(tree, { key: "ArrowDown" }),
        "/project/src",
      ],
      [
        "reveal",
        (_tree: HTMLElement, handle: FileTreeNormalHandle) =>
          act(() => handle.revealActiveFile()),
        "/project/README.md",
      ],
    ])(
      "focuses its own row after %s when another tree shows the same folder",
      async (_trigger, focusRow, expectedPath) => {
        const handle = createRef<FileTreeNormalHandle>();
        const { right } = await renderTwoTrees(
          { selectedFile: README },
          handle,
        );

        focusRow(right, handle.current!);

        await waitFor(() => {
          expect(document.activeElement?.getAttribute("data-path")).toBe(
            expectedPath,
          );
        });
        expect(right.contains(document.activeElement)).toBe(true);
      },
    );
  });
});
