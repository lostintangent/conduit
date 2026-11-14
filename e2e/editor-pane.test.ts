import fs from "node:fs";
import path from "node:path";
import type { Locator } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, git, launch, until } from "./app";

/**
 * An editor pane in a tab, next to the terminal that opened it, on a repo that
 * changes under it the way it does when an agent commits. Each test sets the
 * layout and tree mode it needs, so it can run on its own with `-t`.
 */
describe("editor pane", () => {
  let app: Conduit;
  let project: string;

  const write = (file: string, content: string) =>
    fs.writeFileSync(path.join(project, file), content);
  /** Commits every change from outside the app, like an agent would. */
  const commitAll = (message: string) => {
    git(project, "add", "-A");
    git(project, "commit", "-qm", message);
  };

  beforeAll(async () => {
    app = await launch({
      name: "editor-pane",
      files: {
        // The app's own commits need an identity, which CI runners lack.
        ".gitconfig": "[user]\n\tname = E2E\n\temail = e2e@example.com\n",
        "proj/README.md": "# Readme\n",
        "proj/src/a.ts": "export const a = 1;\n",
        "proj/src/b.ts": "export const b = 1;\n",
      },
    });
    project = path.join(app.home, "proj");
    git(project, "init", "-q");
    commitAll("Root commit");
    write("src/c.ts", "export const c = 1;\n");
    commitAll("Add c");

    const terminal = await app.terminal();
    if ((await terminal.run(`cd ${project}`)) !== 0) {
      throw new Error(`Couldn't cd into ${project}`);
    }
    await app.page.keyboard.press("Meta+Shift+p");
    const palette = app.page.getByTestId("command-palette");
    await palette.getByRole("textbox").fill(">Split Editor Right");
    await palette.getByText("Split Editor Right").waitFor();
    await app.page.keyboard.press("Enter");
    await fileTree().waitFor();
  });

  afterAll(() => app?.close());

  const pane = () => app.page.getByTestId("editor-pane-v2");
  const tree = () => pane().getByTestId("tree-container");
  const fileTree = () => pane().getByRole("tree", { name: "File tree" });
  const changes = () => pane().getByRole("navigation");
  const changed = (name: string) =>
    changes().getByRole("button", { name: new RegExp(`^${name}`) });
  const graph = () => pane().getByRole("list", { name: "Commit list" });
  const commit = (subject: string) =>
    graph().getByRole("button", { name: `Commit: ${subject}` });
  const editor = () =>
    pane()
      .locator(".monaco-editor:not(.monaco-diff-editor *)")
      .filter({ visible: true });
  const diffEditor = () =>
    pane().locator(".monaco-diff-editor").filter({ visible: true });
  const commitReview = () => pane().getByTestId("commit-changes-pane");

  /** Where keyboard focus is in the pane: its tree, an editor, or elsewhere. */
  const focusIn = () =>
    app.page.evaluate(() => {
      const focused = document.activeElement;
      if (!focused || focused === document.body) return "nothing";
      if (focused.closest('[data-testid="tree-container"]')) return "tree";
      if (focused.closest(".monaco-editor")) return "editor";
      return focused.outerHTML.slice(0, 80);
    });

  async function waitForFocusIn(where: "tree" | "editor", after: string) {
    await until(
      async () => (await focusIn()) === where,
      `focus in the ${where} after ${after} (it's in ${await focusIn()})`,
      5_000,
    );
  }

  async function waitForTextIn(target: Locator, text: string) {
    await until(async () => {
      const lines = await target.locator(".view-line").allTextContents();
      return lines.join("\n").replaceAll("\u00a0", " ").includes(text);
    }, `"${text}" in the editor`);
  }

  /**
   * Gives the pane the window's width with focus mode, which puts it past the
   * split layout's 600px breakpoint, or puts it back beside the terminal. The
   * tree should be showing, since the split layout's tree resizer is what says
   * the pane has settled into its layout.
   */
  async function setWide(wide: boolean) {
    const exit = app.page.getByRole("button", { name: "Exit focus mode" });
    const focused = await exit.isVisible();
    // Focus mode covers the toolbar's toggle, so it's left through its own button.
    if (focused && !wide) await exit.click();
    if (!focused && wide) {
      await app.page.getByRole("button", { name: "Toggle Focus Mode" }).click();
    }
    const resizer = pane().getByTestId("tree-resizer");
    await until(
      async () =>
        (await pane().boundingBox())!.width >= 600 === wide &&
        (await resizer.isVisible()) === wide,
      `a ${wide ? "wide" : "narrow"} pane`,
    );
  }

  async function setTreeMode(mode: "files" | "changes") {
    const toggle = pane().getByTestId("filter-toggle");
    const showsChanges = (await toggle.getAttribute("aria-pressed")) === "true";
    if (showsChanges !== (mode === "changes")) await toggle.click();
    await (mode === "changes" ? graph() : fileTree()).waitFor();
  }

  it("opens a changed file's diff on the first click, keeps it as the tree changes mode, and returns focus to the tree once it's committed", async () => {
    await setWide(true);
    await setTreeMode("changes");
    write("src/a.ts", "export const a = 2;\n");
    // Clicking used to open the editor, and only a second click the diff.
    await changed("a.ts").click();
    await waitForTextIn(diffEditor().locator(".editor.modified"), "a = 2");

    // A wide pane's tree is narrow, so its view options are in a menu.
    await pane().getByRole("button", { name: "More options" }).click();
    await app.page.getByRole("menuitem", { name: "Flat view" }).click();
    await changed("a.ts src").waitFor();
    // The tree's modes are only views of it, so the open diff stays.
    await setTreeMode("files");
    await fileTree()
      .getByRole("treeitem", { name: /^a\.ts/ })
      .waitFor();
    await pane()
      .getByRole("radio", { name: "Diff mode", checked: true })
      .waitFor();
    expect(await diffEditor().count()).toBe(1);

    await setTreeMode("changes");
    await pane().getByRole("button", { name: "More options" }).click();
    await app.page.getByRole("menuitem", { name: "Tree view" }).click();
    await changes().getByRole("button", { name: "src" }).waitFor();
    await diffEditor().locator(".editor.modified").click();
    await waitForFocusIn("editor", "clicking the diff");
    commitAll("Change a");
    await commit("Change a").waitFor();
    // The emptied editor side can't take focus, which used to fall to the page.
    await waitForFocusIn("tree", "the file left");
  });

  it("returns a narrow pane to its tree, with focus, once its file is committed elsewhere", async () => {
    await setWide(false);
    await setTreeMode("changes");
    write("src/b.ts", "export const b = 2;\n");
    await changed("b.ts").click();
    await tree().waitFor({ state: "hidden" });
    await diffEditor().locator(".editor.modified").click();
    await waitForFocusIn("editor", "clicking the diff");

    commitAll("Change b");
    // It used to stay on "Select a file to edit", with no way back.
    await tree().waitFor();
    await waitForFocusIn("tree", "the file left");
    await commit("Change b").waitFor();
  });

  it("switches a narrow pane to its tree and back with Cmd+B, and reveals its file with Cmd+Shift+T", async () => {
    await setWide(false);
    await setTreeMode("files");
    await fileTree()
      .getByRole("treeitem", { name: /^README\.md/ })
      .click();
    await waitForTextIn(editor(), "# Readme");
    await tree().waitFor({ state: "hidden" });
    await waitForFocusIn("editor", "opening a file");

    // Both used to do nothing from a narrow pane's editor.
    await app.page.keyboard.press("Meta+b");
    await tree().waitFor();
    await app.page.keyboard.press("Meta+b");
    await tree().waitFor({ state: "hidden" });
    await waitForFocusIn("editor", "hiding the tree");
    await app.page.keyboard.press("Meta+Shift+t");
    await tree().waitFor();
    await fileTree()
      .getByRole("treeitem", { name: /^README\.md/ })
      .locator(":focus")
      .waitFor();
  });

  it("lists a root commit's files, and leaves a commit for the tree in a narrow pane", async () => {
    await setWide(false);
    await setTreeMode("changes");
    await commit("Root commit").click();
    const files = graph().getByRole("list", { name: "Changed files" });
    // A repo's first commit used to list no files.
    await files.getByRole("button", { name: /^README\.md/ }).waitFor();
    expect(await files.getByRole("listitem").count()).toBe(3);

    await files.getByRole("button", { name: /^a\.ts/ }).click();
    await tree().waitFor({ state: "hidden" });
    await waitForTextIn(editor(), "export const a = 1;");
    await pane().getByRole("button", { name: "Back to file tree" }).click();
    await tree().waitFor();

    await commit("Root commit").hover();
    await commit("Root commit")
      .getByRole("button", { name: "View all changes in this commit" })
      .click();
    await tree().waitFor({ state: "hidden" });
    await commitReview().getByText("src/b.ts").waitFor();
    // Leaving used to stay on the editor side, which can be an empty state.
    await commitReview().getByTestId("back-button").click();
    await tree().waitFor();
    await waitForFocusIn("tree", "leaving the commit");
  });

  it("reviews every change, commits them from the review, and leaves the emptied review", async () => {
    await setWide(false);
    await setTreeMode("changes");
    write("src/a.ts", "export const a = 3;\n");
    write("notes.txt", "new\n");
    await changed("notes.txt").waitFor();
    await changed("a.ts").waitFor();

    // A hook that holds the commit open until the test lets it finish.
    const gate = path.join(project, ".git", "e2e-gate");
    write(
      ".git/hooks/pre-commit",
      `#!/bin/sh\nfor i in $(seq 300); do [ -f "${gate}" ] && exit 0; sleep 0.1; done\n`,
    );
    fs.chmodSync(path.join(project, ".git/hooks/pre-commit"), 0o755);
    try {
      await pane().getByTestId("review-button").click();
      // Review used to start behind a narrow pane's tree.
      await tree().waitFor({ state: "hidden" });
      const review = pane().getByTestId("changes-review-toolbar");
      await review.getByText("Review Changes (2)").waitFor();

      await pane().getByRole("button", { name: "Stage all" }).click();
      await until(
        () => git(project, "diff", "--cached", "--name-only").includes("notes"),
        "both files staged",
      );
      const message = review.getByRole("textbox", { name: "Commit message" });
      const commitButton = review.getByRole("button", { name: "Commit" });
      await message.fill("Commit from review");
      await commitButton.click();
      // While the hook runs, a second click can't start another commit.
      await until(
        async () =>
          (await commitButton.isDisabled()) && (await message.isDisabled()),
        "the commit button and message to disable while committing",
      );
      fs.writeFileSync(gate, "");

      await review.getByText("Review Changes (0)").waitFor();
      expect(git(project, "log", "-1", "--format=%s %an")).toBe(
        "Commit from review E2E\n",
      );
      expect(git(project, "status", "--porcelain")).toBe("");
      // An emptied review used to drop its header, and its only way out.
      await pane().getByTestId("exit-review-button").click();
      await tree().waitFor();
      await commit("Commit from review").waitFor();
    } finally {
      fs.writeFileSync(gate, "");
    }
  });

  it("expands every file of a commit when the review comes back to it", async () => {
    await setWide(true);
    await setTreeMode("changes");
    const viewAll = async (subject: string, files: number) => {
      await commit(subject).hover();
      await commit(subject)
        .getByRole("button", { name: "View all changes in this commit" })
        .click();
      await commitReview().getByText(subject, { exact: true }).waitFor();
      const headers = commitReview().getByRole("button", { expanded: true });
      await until(
        async () => (await headers.count()) === files,
        `${files} expanded files in "${subject}"`,
        5_000,
      );
      expect(
        await commitReview().getByRole("button", { expanded: false }).count(),
      ).toBe(0);
    };

    await viewAll("Root commit", 3);
    await viewAll("Add c", 1);
    // A commit already loaded used to keep the last commit's open files, so
    // its own showed collapsed.
    await viewAll("Root commit", 3);
    await commitReview().getByTestId("back-button").click();
  });

  it("moves focus to the file when Cmd+B hides a wide pane's tree, and shows the tree, with focus, once the file is committed", async () => {
    await setWide(true);
    await setTreeMode("changes");
    write("src/b.ts", "export const b = 3;\n");
    await changed("b.ts").click();
    await waitForTextIn(diffEditor().locator(".editor.modified"), "b = 3");
    await waitForFocusIn("tree", "clicking a row");

    // Hiding the tree used to drop focus to the page.
    await app.page.keyboard.press("Meta+b");
    await tree().waitFor({ state: "hidden" });
    await waitForFocusIn("editor", "hiding the tree");

    commitAll("Change b again");
    // It used to stay on "Select a file to edit", with the tree hidden.
    await tree().waitFor();
    await commit("Change b again").waitFor();
    await waitForFocusIn("tree", "the file left");
  });

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});
