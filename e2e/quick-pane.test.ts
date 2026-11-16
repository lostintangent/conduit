import fs from "node:fs";
import path from "node:path";
import type { Locator } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, git, happens, launch, Terminal, until } from "./app";

/** The editor's rendered lines, joined with newlines. */
async function textOf(editor: Locator): Promise<string> {
  const lines = await editor.locator(".view-line").allTextContents();
  return lines.map((line) => line.replaceAll("\u00a0", " ")).join("\n");
}

describe("a quick pane", () => {
  let app: Conduit;
  let project: string;
  let shell: Terminal;
  let quickTerminals = 0;

  beforeAll(async () => {
    const tab = (id: string, pane: object) => ({
      id,
      name: id,
      activePaneId: `${id}-pane`,
      panes: [{ id: `${id}-pane`, ...pane }],
      layout: { id: `${id}-layout`, type: "pane", paneId: `${id}-pane` },
    });
    const state = {
      workspaces: [],
      untitled: {
        lastModified: 0,
        activeTabId: "One",
        tabs: [
          tab("One", { type: "terminal", cwd: null }),
          tab("Two", { type: "canvas" }),
        ],
      },
    };
    app = await launch({
      name: "quick-pane",
      files: {
        ".conduit/workspaces.json": JSON.stringify(state),
        "proj/a.txt": "alpha\n",
        "proj/b.txt": "bravo\n",
      },
    });
    project = path.join(app.home, "proj");
    git(project, "init", "-q");
    git(project, "config", "user.name", "E2E");
    git(project, "config", "user.email", "e2e@example.com");
    git(project, "add", "-A");
    git(project, "commit", "-qm", "Initial commit");

    shell = await app.terminal();
  });

  afterAll(() => app?.close());

  const quickPanes = () => app.page.locator("[data-quick-pane]");
  const front = () => quickPanes().last();
  // An editor's header has its own Close, which closes its pane
  const control = (name: string) =>
    front()
      .getByRole("toolbar", { name: "Quick Pane" })
      .getByRole("button", { name, exact: true });
  // The open quick pane is modal, which hides the strip from roles
  const stripTabs = () => app.page.getByRole("tab", { includeHidden: true });
  const selectedTab = () =>
    app.page.getByRole("tab", { selected: true, includeHidden: true });
  const selected = async () => (await selectedTab().textContent())?.trim();
  const lastCommit = () => git(project, "log", "-1", "--format=%s").trim();

  const quickPaneCount = (count: number) =>
    until(
      async () => (await quickPanes().count()) === count,
      `${count} quick panes`,
    );

  async function openQuickTerminal(): Promise<Terminal> {
    const before = await quickPanes().count();
    await app.page
      .getByRole("button", { name: "More quick terminal options" })
      .click();
    await app.page.getByRole("menuitem", { name: "Quick Terminal" }).click();
    await quickPaneCount(before + 1);
    const xterm = front().locator(".xterm");
    const tag = `quick-${++quickTerminals}`;
    await xterm.evaluate((element, tag) => {
      (element as HTMLElement).dataset.e2eTerminal = tag;
    }, tag);
    return new Terminal(
      app.page,
      app.page.locator(`.xterm[data-e2e-terminal="${tag}"]`),
    ).ready();
  }

  const frontEditor = () => front().locator(".monaco-editor");
  const editorFocused = (editor: Locator) =>
    editor.evaluate((element) => element.contains(document.activeElement));

  /** The front quick editor, once it shows `text` and has focus. */
  async function quickEditorWith(text: string): Promise<Locator> {
    const editor = frontEditor();
    await until(
      async () => (await textOf(editor)).includes(text),
      `"${text}" in the quick editor`,
    );
    await until(() => editorFocused(editor), "focus in the quick editor");
    return editor;
  }

  it("opens a quick terminal in front of the strip, with its prompt focused", async () => {
    expect(await shell.run("cd ~/proj")).toBe(0);
    const quick = await openQuickTerminal();

    await until(() => quick.focused(), "focus in the quick terminal");
    expect(await stripTabs().count()).toBe(2);
    expect(await selected()).toMatch(/^One/);
    expect(await quick.run('echo "pwd is $PWD"')).toBe(0);
    expect(await quick.text()).toContain(`pwd is ${project}`);
  });

  it("keeps the workspace behind it still", async () => {
    await app.page.keyboard.press("Meta+2");
    expect(
      await happens(
        async () => /^Two/.test((await selected()) ?? ""),
        "the strip to select Two",
      ),
    ).toBe(false);

    await app.page.keyboard.press("Meta+t");
    expect(
      await happens(
        async () => (await stripTabs().count()) > 2,
        "a new tab in the strip",
      ),
    ).toBe(false);
  });

  it("keeps a quick terminal open on Esc and on a click in it", async () => {
    const quick = new Terminal(app.page, front().locator(".xterm"));
    await app.page.keyboard.press("Escape");
    await quick.locator.click();
    expect(
      await happens(
        async () => (await quickPanes().count()) === 0,
        "the quick terminal to close",
      ),
    ).toBe(false);
    await until(() => quick.focused(), "focus in the quick terminal");
  });

  it("stacks a Quick Browser over a quick terminal with ⌘L, which Esc closes back to the terminal", async () => {
    const quick = new Terminal(app.page, front().locator(".xterm"));
    await app.page.keyboard.press("Meta+l");
    await quickPaneCount(2);
    expect(await stripTabs().count()).toBe(2);
    const address = front().getByPlaceholder("Search or enter address");
    await until(
      () => address.evaluate((input) => input === document.activeElement),
      "focus in the Quick Browser's address bar",
    );

    // With no pages seen yet, there's nothing to suggest for the first Escape
    // to close
    await app.page.keyboard.press("Escape");
    await quickPaneCount(1);
    await until(() => quick.focused(), "focus back in the quick terminal");
  });

  it("closes with ⌘W, and leaves the strip as it was with focus back in it", async () => {
    await app.page.keyboard.press("Meta+w");
    await quickPaneCount(0);

    expect(await stripTabs().count()).toBe(2);
    expect(await selected()).toMatch(/^One/);
    await until(() => shell.focused(), "focus back in the strip's terminal");
  });

  it("stacks a commit message over a quick terminal, which is back in front once it's saved", async () => {
    const quick = await openQuickTerminal();
    await quick.type("git commit --allow-empty\n");
    await quickPaneCount(2);
    const editor = await quickEditorWith("# Please enter the commit message");

    await app.page.keyboard.type("Commit from a quick terminal");
    // The first Esc may close suggestions, and the next one finds the
    // message unsaved
    await app.page.keyboard.press("Escape");
    await app.page.keyboard.press("Escape");
    expect(
      await happens(
        async () => (await quickPanes().count()) < 2,
        "the unsaved message to close",
      ),
    ).toBe(false);

    await editor.press("Meta+s");
    await quickPaneCount(1);
    await until(
      () => lastCommit() === "Commit from a quick terminal",
      "the commit",
    );
    await until(() => quick.focused(), "focus back in the quick terminal");

    await app.page.keyboard.press("Meta+w");
    await quickPaneCount(0);
  });

  it("waits on each of two quick editors, and saving the front one leaves the other", async () => {
    const wrappers = () =>
      app.page.locator("[data-editor-pane-wrapper]").count();
    const before = await wrappers();

    // Each echo is quoted so the command line doesn't show what it prints
    await shell.type(
      '(conduit --quick a.txt; echo a-""closed) & (conduit --quick b.txt; echo b-""closed) &\n',
    );
    await quickPaneCount(2);
    await until(
      async () => /alpha|bravo/.test(await textOf(frontEditor())),
      "a file in the front quick editor",
    );
    const [first, second] = (await textOf(frontEditor())).includes("alpha")
      ? ["a", "b"]
      : ["b", "a"];

    await quickEditorWith(first === "a" ? "alpha" : "bravo");
    await app.page.keyboard.type("saved ");
    await app.page.keyboard.press("Meta+s");
    await quickPaneCount(1);
    await shell.waitForText(`${first}-closed`);
    expect(fs.readFileSync(path.join(project, `${first}.txt`), "utf8")).toMatch(
      /^saved /,
    );

    await quickEditorWith(second === "a" ? "alpha" : "bravo");
    expect(await shell.text()).not.toContain(`${second}-closed`);

    await control("Close").click();
    await quickPaneCount(0);
    await shell.waitForText(`${second}-closed`);
    await until(
      async () => (await wrappers()) === before,
      "the closed editors to let go of their wrappers",
    );
  });

  it("closes a saved quick editor on Esc, but not on a click in it", async () => {
    await shell.type('conduit --quick b.txt; echo b-""done\n');
    await quickPaneCount(1);
    const editor = await quickEditorWith("bravo");

    await editor.locator(".view-lines").click();
    expect(
      await happens(
        async () => (await quickPanes().count()) === 0,
        "the click to close the quick editor",
      ),
    ).toBe(false);

    await app.page.keyboard.press("Escape");
    await quickPaneCount(0);
    await shell.waitForText("b-done");
    await until(() => shell.focused(), "focus back in the strip's terminal");
  });

  it("opens in a tab with its unsaved text, and git still waits for it", async () => {
    await shell.type("git commit --allow-empty\n");
    await quickPaneCount(1);
    const message = await quickEditorWith("# Please enter the commit message");
    // The last commit's message shows for a moment, until its cached model
    // finds that git rewrote the file
    await until(
      async () =>
        !(await textOf(message)).includes("Commit from a quick terminal"),
      "git's new message template",
    );
    await app.page.keyboard.type("Commit from a tab");
    // The same editor moves into the tab, so it keeps its tag
    await message.evaluate((element) => {
      (element as HTMLElement).dataset.e2eEditor = "commit";
    });
    const editor = app.page.locator('.monaco-editor[data-e2e-editor="commit"]');

    await control("Open in Tab").click();
    await quickPaneCount(0);
    expect(await stripTabs().count()).toBe(3);
    await stripTabs().nth(2).and(selectedTab()).waitFor({ state: "attached" });
    await until(() => editorFocused(editor), "focus in the editor's tab");
    expect(await textOf(editor)).toContain("Commit from a tab");
    expect(lastCommit()).not.toBe("Commit from a tab");

    await app.page.keyboard.press("Meta+s");
    await until(() => lastCommit() === "Commit from a tab", "the commit");
    await until(
      async () => (await stripTabs().count()) === 2,
      "the editor's tab to close",
    );
  });

  it("isn't saved with the workspace", async () => {
    await openQuickTerminal();
    await app.quit();

    const saved = JSON.parse(
      fs.readFileSync(path.join(app.home, ".conduit/workspaces.json"), "utf8"),
    );
    expect(
      saved.untitled.tabs.map((tab: { name: string }) => tab.name),
    ).toEqual(["One", "Two"]);
  });
});
