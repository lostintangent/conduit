import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClient } from "@/query";
import type { GitSubscription } from "@features/git/client/GitSubscription";
import {
  type GitFileStatus,
  type GitFileStatusCode,
  UNSTAGED_KEY_SUFFIX,
} from "@features/git/model";
import { render } from "../../../../../tests/renderer/queryRender";
import { mockFiles } from "../../../../../tests/renderer/files";
import { mockGitWrites } from "../../../../../tests/renderer/git";

// The tree checks git is installed, and its context menu hook subscribes to
// its commands on mount
const isGitAvailable = vi.fn(async () => true);
Object.assign(window, {
  conduit: {
    git: { isGitAvailable },
    workbench: { on: vi.fn(() => () => {}), showContextMenu: vi.fn() },
  },
});

vi.mock("@features/editor/client/fileTreeCommands", () => ({
  registerFileTreeChangesCallbacks: vi.fn(() => () => {}),
  activateFileTreeChangesCallbacks: vi.fn(),
  registerFileTreeCallbacks: vi.fn(() => () => {}),
  activateFileTreeCallbacks: vi.fn(),
}));

import { FileTreeChanges } from "./FileTreeChanges";
import { FileTreeNormal } from "./FileTreeNormal";
import { registerFileTreeChangesCallbacks } from "@features/editor/client/fileTreeCommands";

const TEST_CWD = "/project";

/** A git status keyed by path, each file modified unless given a status. */
const status = (
  ...files: Array<
    readonly [path: string, staged: boolean, code?: GitFileStatusCode]
  >
) =>
  new Map<string, GitFileStatus>(
    files.map(([path, staged, code = "modified"]) => [
      path,
      { path, status: code, staged },
    ]),
  );

const WITH_CHANGES = status(
  ["src/index.ts", false],
  ["src/utils.ts", true, "added"],
  ["package.json", true],
  ["README.md", false, "deleted"],
);
const UNSTAGED_ONLY = status(["file1.ts", false], ["file2.ts", false]);
const STAGED_ONLY = status(["file1.ts", true], ["file2.ts", true, "added"]);

const STAGED = "section-staged-changes";
const CHANGES = "section-changes";

type Props = ComponentProps<typeof FileTreeChanges>;

describe("FileTreeChanges", () => {
  const onFileSelect = vi.fn();
  let git: ReturnType<typeof mockGitWrites>;

  beforeEach(() => {
    vi.clearAllMocks();
    git = mockGitWrites();
  });

  const tree = (props: Partial<Props> = {}) => (
    <FileTreeChanges
      viewMode="flat"
      paneId="test-pane"
      cwd={TEST_CWD}
      git={{ cwd: TEST_CWD } as GitSubscription}
      selectedFile={null}
      onFileSelect={onFileSelect}
      gitStatus={WITH_CHANGES}
      {...props}
    />
  );

  /** Render the tree, and return a way to report a new status, as the watcher does. */
  function renderTree(props: Partial<Props> = {}, queryClient?: QueryClient) {
    const { rerender } = render(tree(props), { queryClient });
    return (gitStatus: Props["gitStatus"]) =>
      rerender(tree({ ...props, gitStatus }));
  }

  const section = (testId: string) => within(screen.getByTestId(testId));
  /** A row, in the section with test id `inSection` when given. */
  const row = (testId: string, inSection?: string) =>
    (inSection ? section(inSection) : screen).getByTestId(testId);
  /** One of a row's actions, like stage-button. */
  const action = (testId: string, name: string, inSection?: string) =>
    within(row(testId, inSection)).getByTestId(name);

  describe("empty state", () => {
    it("should show empty message when no changes", () => {
      renderTree({ gitStatus: new Map() });

      expect(screen.getByTestId("file-tree-changes-empty")).toBeDefined();
      expect(screen.getByText("No changes")).toBeDefined();
    });

    it("should say git isn't installed when it isn't", async () => {
      isGitAvailable.mockResolvedValueOnce(false);
      renderTree();

      expect(await screen.findByText("Git is not installed")).toBeDefined();
      expect(screen.queryByTestId(STAGED)).toBeNull();
    });
  });

  describe("section display", () => {
    it("should show Staged Changes section when there are staged files", () => {
      renderTree();

      expect(screen.getByTestId(STAGED)).toBeDefined();
      expect(screen.getByText("Staged Changes")).toBeDefined();
    });

    it("should show Changes section when there are unstaged files", () => {
      renderTree();

      expect(screen.getByTestId(CHANGES)).toBeDefined();
      expect(screen.getByText("Changes")).toBeDefined();
    });

    it("should not show Staged Changes section when all files unstaged", () => {
      renderTree({ gitStatus: UNSTAGED_ONLY });

      expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      expect(screen.queryByTestId(STAGED)).toBeNull();
    });

    it("should not show Changes section when all files staged", () => {
      renderTree({ gitStatus: STAGED_ONLY });

      expect(screen.getByTestId("file-tree-changes")).toBeDefined();
      expect(screen.queryByTestId(CHANGES)).toBeNull();
    });

    it("should display file count in section header", () => {
      renderTree();

      // Two files staged, and two not
      expect(screen.getAllByText("(2)")).toHaveLength(2);
    });
  });

  describe("section toggle", () => {
    it("should collapse section when toggle is clicked", () => {
      renderTree();
      expect(screen.getByTestId("change-item-index.ts")).toBeDefined();

      fireEvent.click(
        screen.getByRole("button", { name: /^Changes/, expanded: true }),
      );

      expect(screen.queryByTestId("change-item-index.ts")).toBeNull();
      expect(
        screen.getByRole("button", { name: /^Changes/, expanded: false }),
      ).toBeDefined();
    });

    it("should expand collapsed section when toggle is clicked", () => {
      renderTree();
      const toggle = () => fireEvent.click(row("section-toggle", CHANGES));

      toggle();
      expect(screen.queryByTestId("change-item-index.ts")).toBeNull();
      toggle();
      expect(screen.getByTestId("change-item-index.ts")).toBeDefined();
    });

    it("should collapse a nested folder from its name button", () => {
      renderTree({ viewMode: "nested" });
      const changes = section(CHANGES);
      expect(changes.getByTestId("nested-file-index.ts")).toBeDefined();

      fireEvent.click(
        changes.getByRole("button", { name: "src", expanded: true }),
      );

      expect(
        changes.getByRole("button", { name: "src", expanded: false }),
      ).toBeDefined();
      expect(changes.queryByTestId("nested-file-index.ts")).toBeNull();
    });
  });

  describe("file selection", () => {
    it("should call onFileSelect with file and mapKey when clicking a file", () => {
      renderTree();

      fireEvent.click(row("change-item-index.ts"));

      expect(onFileSelect).toHaveBeenCalledWith(
        { path: "/project/src/index.ts", name: "index.ts", type: "file" },
        "src/index.ts",
      );
    });

    it("should keep the row's actions out of its file button", () => {
      renderTree();
      const item = within(row("change-item-index.ts"));
      const fileButton = item.getByRole("button", {
        name: /^index\.ts/,
        description: "M",
      });

      // HTML doesn't allow a button inside a button, and assistive tech folds it into the name
      expect(
        fileButton.contains(item.getByRole("button", { name: "Stage" })),
      ).toBe(false);

      fireEvent.click(fileButton);
      expect(onFileSelect).toHaveBeenCalledTimes(1);
    });

    it("should highlight selected file using selectedMapKey", () => {
      renderTree({
        selectedFile: {
          path: "/project/src/index.ts",
          name: "index.ts",
          type: "file",
        },
        selectedMapKey: "src/index.ts",
      });

      expect(
        screen.getByRole("button", { current: true }).textContent,
      ).toContain("index.ts");
    });
  });

  describe("git actions - staging", () => {
    it("should call stage and mark the file seen when stage button is clicked", async () => {
      const markSeen = vi.fn();
      renderTree({ markSeen });

      fireEvent.click(action("change-item-index.ts", "stage-button"));

      await waitFor(() => {
        expect(git.stage).toHaveBeenCalledWith(TEST_CWD, ["src/index.ts"]);
      });
      expect(markSeen).toHaveBeenCalledWith("src/index.ts");
    });

    it("should not propagate click event to parent when stage button clicked", async () => {
      renderTree();

      fireEvent.click(action("change-item-index.ts", "stage-button"));

      await waitFor(() => expect(git.stage).toHaveBeenCalled());
      // The click was on the row's action, not the row
      expect(onFileSelect).not.toHaveBeenCalled();
    });
  });

  describe("git actions - unstaging", () => {
    it("should call unstage and mark the file seen when unstage button is clicked", async () => {
      const markSeen = vi.fn();
      renderTree({ markSeen });

      fireEvent.click(action("change-item-utils.ts", "unstage-button"));

      await waitFor(() => {
        expect(git.unstage).toHaveBeenCalledWith(TEST_CWD, ["src/utils.ts"]);
      });
      expect(markSeen).toHaveBeenCalledWith("src/utils.ts");
    });

    it("should unstage only after an earlier stage finishes", async () => {
      let finishStage!: () => void;
      git.stage.mockReturnValueOnce(
        new Promise<void>((resolve) => (finishStage = resolve)),
      );
      const queryClient = createQueryClient();
      renderTree({}, queryClient);

      fireEvent.click(action("change-item-index.ts", "stage-button"));
      await waitFor(() => expect(git.stage).toHaveBeenCalled());
      fireEvent.click(action("change-item-utils.ts", "unstage-button"));
      await waitFor(() => expect(queryClient.isMutating()).toBe(2));
      expect(git.unstage).not.toHaveBeenCalled();

      await act(async () => finishStage());
      await waitFor(() => {
        expect(git.unstage).toHaveBeenCalledWith(TEST_CWD, ["src/utils.ts"]);
      });
    });
  });

  describe("git actions - revert", () => {
    it("should call revert when revert button is clicked", async () => {
      const markSeen = vi.fn();
      renderTree({ markSeen });

      fireEvent.click(action("change-item-index.ts", "revert-button"));

      await waitFor(() => {
        expect(git.revert).toHaveBeenCalledWith(TEST_CWD, ["src/index.ts"]);
      });
      expect(markSeen).toHaveBeenCalledWith("src/index.ts");
    });

    it("should not show revert button for staged files", () => {
      renderTree();

      expect(
        within(row("change-item-utils.ts")).queryByTestId("revert-button"),
      ).toBeNull();
    });

    it("should show revert button for untracked files", async () => {
      renderTree({ gitStatus: status(["new-file.ts", false, "untracked"]) });

      // Reverting an untracked file deletes it
      fireEvent.click(action("change-item-new-file.ts", "revert-button"));

      await waitFor(() => {
        expect(git.revert).toHaveBeenCalledWith(TEST_CWD, ["new-file.ts"]);
      });
    });
  });

  describe("focus after a git write", () => {
    const button = (inSection: string, testId: string) =>
      row(testId, inSection).querySelector("button")!;
    // Enter on a focused button clicks it
    const press = (inSection: string, testId: string, name: string) => {
      const target = action(testId, name, inSection);
      target.focus();
      fireEvent.click(target);
    };

    it("follows a file staged, then unstaged, to its new row", async () => {
      const report = renderTree({
        gitStatus: status(["a.ts", false], ["b.ts", false]),
      });

      press(CHANGES, "change-item-a.ts", "stage-button");
      await waitFor(() =>
        expect(git.stage).toHaveBeenCalledWith(TEST_CWD, ["a.ts"]),
      );
      report(status(["a.ts", true], ["b.ts", false]));
      await waitFor(() => {
        expect(document.activeElement).toBe(button(STAGED, "change-item-a.ts"));
      });

      // This time the watcher reports before the write resolves
      let finishUnstage!: () => void;
      git.unstage.mockReturnValueOnce(
        new Promise<void>((resolve) => (finishUnstage = resolve)),
      );
      press(STAGED, "change-item-a.ts", "unstage-button");
      await waitFor(() =>
        expect(git.unstage).toHaveBeenCalledWith(TEST_CWD, ["a.ts"]),
      );
      report(status(["a.ts", false], ["b.ts", false]));
      await act(async () => finishUnstage());
      await waitFor(() => {
        expect(document.activeElement).toBe(
          button(CHANGES, "change-item-a.ts"),
        );
      });
    });

    it("follows a row however long the watcher takes to report it", async () => {
      const queryClient = createQueryClient();
      const report = renderTree(
        { gitStatus: status(["a.ts", false], ["b.ts", false]) },
        queryClient,
      );
      const realNow = performance.now.bind(performance);
      let later = 0;
      const now = vi
        .spyOn(performance, "now")
        .mockImplementation(() => realNow() + later);

      press(CHANGES, "change-item-a.ts", "stage-button");
      await waitFor(() =>
        expect(git.stage).toHaveBeenCalledWith(TEST_CWD, ["a.ts"]),
      );
      await waitFor(() => expect(queryClient.isMutating()).toBe(0));
      // A push holds the watcher's reports until it finishes
      later = 10_000;
      report(status(["a.ts", true], ["b.ts", false]));
      await waitFor(() => {
        expect(document.activeElement).toBe(button(STAGED, "change-item-a.ts"));
      });
      now.mockRestore();
    });

    it("lands on the nearest row left when a file is reverted or its new section is collapsed", async () => {
      const report = renderTree({
        gitStatus: status(
          ["a.ts", false],
          ["b.ts", false],
          ["c.ts", false],
          ["s.ts", true],
        ),
      });

      press(CHANGES, "change-item-a.ts", "revert-button");
      await waitFor(() =>
        expect(git.revert).toHaveBeenCalledWith(TEST_CWD, ["a.ts"]),
      );
      report(status(["b.ts", false], ["c.ts", false], ["s.ts", true]));
      await waitFor(() => {
        expect(document.activeElement).toBe(
          button(CHANGES, "change-item-b.ts"),
        );
      });

      fireEvent.click(row("section-toggle", STAGED));
      press(CHANGES, "change-item-c.ts", "stage-button");
      await waitFor(() =>
        expect(git.stage).toHaveBeenCalledWith(TEST_CWD, ["c.ts"]),
      );
      report(status(["b.ts", false], ["c.ts", true], ["s.ts", true]));
      await waitFor(() => {
        expect(document.activeElement).toBe(
          button(CHANGES, "change-item-b.ts"),
        );
      });
    });

    it("follows a folder staged in the nested view", async () => {
      const report = renderTree({
        gitStatus: status(["lib/a.ts", false], ["src/b.ts", false]),
        viewMode: "nested",
      });

      press(CHANGES, "folder-toggle-lib", "stage-button");
      await waitFor(() =>
        expect(git.stage).toHaveBeenCalledWith(TEST_CWD, ["lib/a.ts"]),
      );
      report(status(["lib/a.ts", true], ["src/b.ts", false]));
      await waitFor(() => {
        expect(document.activeElement).toBe(
          button(STAGED, "folder-toggle-lib"),
        );
      });
    });

    it("lands on Staged Changes after Stage All", async () => {
      const report = renderTree({
        gitStatus: status(["a.ts", false], ["b.ts", false]),
      });

      const stageAll = row("stage-all-button", CHANGES);
      stageAll.focus();
      fireEvent.click(stageAll);
      await waitFor(() => expect(git.stage).toHaveBeenCalled());
      report(status(["a.ts", true], ["b.ts", true]));
      await waitFor(() => {
        expect(document.activeElement).toBe(row("section-toggle", STAGED));
      });
    });

    it("leaves focus alone once it moves on", async () => {
      const report = renderTree({
        gitStatus: status(["a.ts", false], ["b.ts", false]),
      });

      press(CHANGES, "change-item-a.ts", "stage-button");
      await waitFor(() => expect(git.stage).toHaveBeenCalled());
      const elsewhere = button(CHANGES, "change-item-b.ts");
      elsewhere.focus();
      report(status(["a.ts", true], ["b.ts", false]));

      await waitFor(() => {
        expect(button(STAGED, "change-item-a.ts")).toBeDefined();
      });
      expect(document.activeElement).toBe(elsewhere);
    });
  });

  describe("git status badge", () => {
    it.each([
      ["should show M badge for modified files", "change-item-index.ts", "M"],
      ["should show A badge for added files", "change-item-utils.ts", "A"],
      ["should show D badge for deleted files", "change-item-README.md", "D"],
    ])("%s", (_title, testId, letter) => {
      renderTree();

      expect(within(row(testId)).getByTestId("git-badge").textContent).toBe(
        letter,
      );
    });
  });

  describe("error handling", () => {
    it.each([
      ["should handle stage errors gracefully", "stage", "index.ts"],
      ["should handle unstage errors gracefully", "unstage", "utils.ts"],
      ["should handle revert errors gracefully", "revert", "index.ts"],
    ] as const)("%s", async (_title, write, name) => {
      git[write].mockRejectedValueOnce(new Error(`${write} failed`));
      renderTree();

      // A failed write shouldn't throw out of the click
      fireEvent.click(action(`change-item-${name}`, `${write}-button`));

      await waitFor(() => expect(git[write]).toHaveBeenCalled());
    });
  });

  describe("alphabetical sorting", () => {
    it("should sort files alphabetically within sections", () => {
      renderTree({
        gitStatus: status(
          ["z-file.ts", false],
          ["a-file.ts", false],
          ["m-file.ts", false],
        ),
      });

      const paths = screen
        .getAllByTestId(/^change-item-/)
        .map((item) => item.getAttribute("data-path"));
      expect(paths).toEqual(["a-file.ts", "m-file.ts", "z-file.ts"]);
    });
  });

  describe("multi-select", () => {
    beforeEach(() => {
      renderTree({
        gitStatus: status(
          ["file1.ts", false],
          ["file2.ts", false],
          ["file3.ts", false],
          ["file4.ts", true, "added"],
          ["file5.ts", true, "added"],
        ),
      });
    });

    it("should select single item on regular click", () => {
      fireEvent.click(row("change-item-file1.ts"));

      expect(onFileSelect).toHaveBeenCalledWith(
        expect.objectContaining({ name: "file1.ts" }),
        "file1.ts",
      );
    });

    it("should select range with shift-click", () => {
      fireEvent.click(row("change-item-file1.ts"));
      fireEvent.click(row("change-item-file3.ts"), { shiftKey: true });

      for (const name of ["file1.ts", "file2.ts", "file3.ts"]) {
        expect(row(`change-item-${name}`).className).toContain("bg-accent");
      }
    });

    it("should toggle selection with cmd-click", () => {
      // A plain click selects one file, and anchors the selection
      fireEvent.click(row("change-item-file1.ts"));
      fireEvent.click(row("change-item-file3.ts"), { metaKey: true });

      expect(row("change-item-file3.ts").className).toContain("bg-accent/25");
      expect(row("change-item-file2.ts").className).not.toContain(
        "bg-accent/25",
      );
    });
  });

  describe("bulk actions", () => {
    it.each([
      [
        "should stage all selected files when clicking stage on any selected file",
        "stage",
        false,
      ],
      [
        "should unstage all selected files when clicking unstage on any selected file",
        "unstage",
        true,
      ],
      [
        "should revert all selected files when clicking revert on any selected file",
        "revert",
        false,
      ],
    ] as const)("%s", async (_title, write, staged) => {
      const files = ["file1.ts", "file2.ts", "file3.ts"];
      renderTree({
        gitStatus: status(...files.map((path) => [path, staged] as const)),
      });

      fireEvent.click(row("change-item-file1.ts"));
      fireEvent.click(row("change-item-file3.ts"), { shiftKey: true });
      fireEvent.click(action("change-item-file1.ts", `${write}-button`));

      await waitFor(() => {
        expect(git[write]).toHaveBeenCalledWith(TEST_CWD, files);
      });
    });
  });

  describe("partially staged files", () => {
    // A file with staged and unstaged changes has an entry in each section
    const PARTIAL = new Map([
      ...status(["src/partial.ts", true], ["src/other.ts", false]),
      [
        `src/partial.ts${UNSTAGED_KEY_SUFFIX}`,
        { status: "modified", staged: false, path: "src/partial.ts" },
      ],
    ]);

    it("should display both staged and unstaged entries for partially staged files", () => {
      renderTree({ gitStatus: PARTIAL });

      expect(section(STAGED).getByText("partial.ts")).toBeDefined();
      expect(section(CHANGES).getByText("partial.ts")).toBeDefined();
      expect(section(CHANGES).getByText("other.ts")).toBeDefined();
      expect(section(STAGED).queryByText("other.ts")).toBeNull();
    });

    it("should normalize selectedMapKey with suffix to match file without suffix", () => {
      // The parent passes an unstaged entry's key, for a file with one entry
      renderTree({
        gitStatus: status(["src/index.ts", false]),
        selectedMapKey: `src/index.ts${UNSTAGED_KEY_SUFFIX}`,
      });

      expect(
        screen.getByRole("button", { current: true }).textContent,
      ).toContain("index.ts");
    });

    it("should use actual file path for git operations with partially staged files", async () => {
      renderTree({ gitStatus: PARTIAL });

      // The unstaged entry's key has a suffix, which git can't take
      fireEvent.click(
        action("change-item-partial.ts", "stage-button", CHANGES),
      );

      await waitFor(() => {
        expect(git.stage).toHaveBeenCalledWith(TEST_CWD, ["src/partial.ts"]);
      });
    });
  });

  describe("stage all / unstage all", () => {
    it.each([
      [
        "should stage all unstaged files when stage all button is clicked",
        "stage",
        UNSTAGED_ONLY,
        CHANGES,
      ],
      [
        "should unstage all staged files when unstage all button is clicked",
        "unstage",
        STAGED_ONLY,
        STAGED,
      ],
    ] as const)("%s", async (_title, write, gitStatus, inSection) => {
      renderTree({ gitStatus });

      fireEvent.click(row(`${write}-all-button`, inSection));

      await waitFor(() => {
        expect(git[write]).toHaveBeenCalledWith(TEST_CWD, [
          "file1.ts",
          "file2.ts",
        ]);
      });
    });
  });

  describe("writes shown in the Files tree", () => {
    let files: ReturnType<typeof mockFiles>;

    beforeEach(() => {
      files = mockFiles();
      files.readDirectory.mockImplementation(async (_cwd, dir) =>
        dir === TEST_CWD
          ? [{ name: "src", type: "directory" }]
          : [{ name: "index.ts", type: "file" }],
      );
    });

    /** The Changes tree beside a Files tree showing src, in one window. */
    async function renderBothTrees() {
      render(
        <>
          {tree({
            paneId: "changes",
            viewMode: "nested",
            gitStatus: status(["src/index.ts", false]),
          })}
          <FileTreeNormal
            paneId="files"
            cwd={TEST_CWD}
            gitStatus={null}
            selectedFile={{
              path: "/project/src/index.ts",
              name: "index.ts",
              type: "file",
            }}
            onFileSelect={onFileSelect}
          />
        </>,
      );
      const changesTree = screen.getByTestId("file-tree-changes");
      const filesTree = await screen.findByTestId("file-tree-normal");
      await within(filesTree).findByTestId("tree-item-index.ts");
      const commands = vi.mocked(registerFileTreeChangesCallbacks).mock
        .calls[0][0];
      return { changesTree, filesTree, commands };
    }

    /** Type a name into the tree's inline input, and commit it. */
    function enterName(tree: HTMLElement, name: string) {
      const input = within(tree).getByTestId("file-tree-rename-input");
      fireEvent.change(input, { target: { value: name } });
      fireEvent.keyDown(input, { key: "Enter" });
    }

    it("shows a rename at once", async () => {
      const { changesTree, filesTree, commands } = await renderBothTrees();

      act(() => commands.onRename("/project/src/index.ts"));
      enterName(changesTree, "main.ts");

      expect(
        await within(filesTree).findByTestId("tree-item-main.ts"),
      ).toBeDefined();
      expect(within(filesTree).queryByTestId("tree-item-index.ts")).toBeNull();
      expect(files.rename).toHaveBeenCalledWith(
        TEST_CWD,
        "/project/src/index.ts",
        "/project/src/main.ts",
      );
    });

    it("shows a new file at once", async () => {
      const { changesTree, filesTree, commands } = await renderBothTrees();

      act(() => commands.onNewFile("/project/src"));
      enterName(changesTree, "notes.ts");

      expect(
        await within(filesTree).findByTestId("tree-item-notes.ts"),
      ).toBeDefined();
      expect(files.writeFile).toHaveBeenCalledWith(
        TEST_CWD,
        "/project/src/notes.ts",
        new Uint8Array(0),
      );
    });

    it("shows a delete at once", async () => {
      const { filesTree, commands } = await renderBothTrees();

      act(() => commands.onDelete("/project/src/index.ts"));
      fireEvent.click(await screen.findByRole("button", { name: "Confirm" }));

      await waitFor(() => {
        expect(
          within(filesTree).queryByTestId("tree-item-index.ts"),
        ).toBeNull();
      });
      expect(files.delete).toHaveBeenCalledWith(
        TEST_CWD,
        "/project/src/index.ts",
        { recursive: true },
      );
    });
  });
});
