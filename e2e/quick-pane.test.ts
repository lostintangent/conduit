import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { Locator } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type Conduit,
  git,
  happens,
  inWebview,
  launch,
  runCommand,
  Terminal,
  until,
} from "./app";

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
  let server: http.Server;
  let origin: string;

  beforeAll(async () => {
    server = http.createServer((request, response) => {
      response.writeHead(200, { "content-type": "text/html" });
      const name = request.url === "/one" ? "One" : "Two";
      response.end(`<!doctype html><title>Page ${name}</title><p>${name}</p>`);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

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

  afterAll(async () => {
    await app?.close();
    server?.close();
  });

  const quickPanes = () => app.page.locator("[data-quick-pane]");
  const front = () => quickPanes().last();
  const control = (name: string) =>
    front()
      .getByRole("toolbar", { name: "Quick Pane" })
      .getByRole("button", { name, exact: true });
  // The open quick pane is modal, which hides the strip from roles
  const stripTabs = () => app.page.getByRole("tab", { includeHidden: true });
  const selectedTab = () =>
    app.page.getByRole("tab", { selected: true, includeHidden: true });
  const selected = async () => (await selectedTab().textContent())?.trim();
  const pageUrl = () =>
    app.page
      .locator("webview")
      .last()
      .evaluate((webview: Electron.WebviewTag) => webview.getURL());
  const lastCommit = () => git(project, "log", "-1", "--format=%s").trim();

  const quickPaneCount = (count: number) =>
    until(
      async () => (await quickPanes().count()) === count,
      `${count} quick panes`,
    );

  async function openQuickTerminal(): Promise<Terminal> {
    const before = await quickPanes().count();
    await app.page
      .getByRole("button", { name: "More quick pane options" })
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

  // Not on the dialog around the pane, where keys do nothing
  const focusInPane = () =>
    front().evaluate(
      (dialog) =>
        dialog.contains(document.activeElement) &&
        document.activeElement !== dialog,
    );

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

  // First, while the shell is still at home, where the quick editor shows
  // the file only once Quick Open has closed
  it("keeps the keys in a Quick Editor that Quick Open picks a file in", async () => {
    await runCommand(app.page, "Quick Editor");
    await quickPaneCount(1);
    await until(focusInPane, "focus in the quick editor's pane");
    await app.page.keyboard.press("Meta+p");
    const palette = app.page.getByTestId("command-palette");
    await palette.getByRole("textbox").fill("b.txt");
    await palette
      .locator('[data-index="0"]')
      .filter({ hasText: "b.txt" })
      .waitFor();
    await app.page.keyboard.press("Enter");
    await palette.waitFor({ state: "hidden" });
    await until(
      async () => (await textOf(frontEditor())).includes("bravo"),
      "b.txt in the quick editor",
    );

    // Showing it redraws the pane while nothing has focus, which leaves focus
    // on the dialog around the pane, where keys go nowhere
    await until(focusInPane, "focus back in the quick editor's pane");

    await app.page.keyboard.press("Meta+w");
    await quickPaneCount(0);
  });

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

  it("moves a quick terminal to a Hyper Terminal from the palette, shell and all", async () => {
    const quick = await openQuickTerminal();
    expect(await quick.run("kept=moved")).toBe(0);
    // Its buttons are the same as every quick pane's
    expect(
      await front()
        .getByRole("toolbar", { name: "Quick Pane" })
        .getByRole("button")
        .evaluateAll((buttons) =>
          buttons.map((button) => button.getAttribute("aria-label")),
        ),
    ).toEqual(["Open in Tab", "Close"]);

    await runCommand(app.page, "Move to Hyper Terminal");
    await quickPaneCount(0);
    const hyper = app.page
      .locator(".fixed")
      .filter({ has: app.page.getByRole("button", { name: "Maximize" }) });
    const moved = new Terminal(app.page, hyper.locator(".xterm"));
    expect(await moved.run('echo "kept is $kept"')).toBe(0);
    expect(await moved.text()).toContain("kept is moved");

    await hyper.getByRole("button", { name: "Close", exact: true }).click();
    await hyper.waitFor({ state: "detached" });
  });

  it("opens a Quick Canvas from the palette, which keeps the Escape that cancels its text", async () => {
    await runCommand(app.page, "Quick Canvas");
    await quickPaneCount(1);
    expect(await stripTabs().count()).toBe(2);

    await front().locator(".lucide-type").click();
    await front()
      .locator('canvas[id^="canvas-"]')
      .click({ position: { x: 200, y: 200 } });
    const text = front().locator("input");
    await until(
      () => text.evaluate((input) => input === document.activeElement),
      "focus in the canvas's text",
    );
    await app.page.keyboard.press("Escape");
    await text.waitFor({ state: "detached" });
    expect(await quickPanes().count()).toBe(1);

    await app.page.keyboard.press("Escape");
    await quickPaneCount(0);
    await until(() => shell.focused(), "focus back in the strip's terminal");
  });

  it("keeps a Quick Canvas with a drawing open on Esc, which ⌘W still closes", async () => {
    await runCommand(app.page, "Quick Canvas");
    await quickPaneCount(1);
    const canvas = front().locator('canvas[id^="canvas-"]');
    const box = (await canvas.boundingBox())!;
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    const pixel = () =>
      canvas.evaluate(
        (canvas: HTMLCanvasElement, [x, y]) => {
          const box = canvas.getBoundingClientRect();
          const scale = canvas.width / box.width;
          return canvas
            .getContext("2d")!
            .getImageData(
              Math.round((x! - box.left) * scale),
              Math.round((y! - box.top) * scale),
              1,
              1,
            )
            .data.join();
        },
        [x, y],
      );
    const blank = await pixel();

    await app.page.mouse.move(x - 60, y);
    await app.page.mouse.down();
    await app.page.mouse.move(x, y, { steps: 5 });
    await app.page.mouse.move(x + 60, y, { steps: 5 });
    await app.page.mouse.up();
    await until(async () => (await pixel()) !== blank, "the line to show");

    await app.page.keyboard.press("Escape");
    await app.page.keyboard.press("Escape");
    expect(
      await happens(
        async () => (await quickPanes().count()) === 0,
        "the quick canvas to close",
      ),
    ).toBe(false);
    expect(await pixel()).not.toBe(blank);

    await app.page.keyboard.press("Meta+w");
    await quickPaneCount(0);
    await until(() => shell.focused(), "focus back in the strip's terminal");
  });

  it("opens a Quick Browser from the menu next to the hyper terminal", async () => {
    await app.page
      .getByRole("button", { name: "More quick pane options" })
      .click();
    await app.page.getByRole("menuitem", { name: "Quick Browser" }).click();
    await quickPaneCount(1);
    expect(await stripTabs().count()).toBe(2);
    const address = front().getByPlaceholder("Search or enter address");
    await until(
      () => address.evaluate((input) => input === document.activeElement),
      "focus in the Quick Browser's address bar",
    );

    await app.page.keyboard.press("Escape");
    await quickPaneCount(0);
  });

  it("goes to a suggestion clicked in a Quick Browser's address bar, staying open until a click outside it", async () => {
    await app.page.keyboard.press("Meta+l");
    await quickPaneCount(1);
    const address = front().getByPlaceholder("Search or enter address");
    for (const page of ["one", "two"]) {
      await address.fill(`${origin}/${page}`);
      await address.press("Enter");
      await until(
        async () => (await pageUrl()) === `${origin}/${page}`,
        `page ${page} to load`,
      );
    }

    await address.click();
    await address.fill("Page");
    await app.page.getByRole("option", { name: /Page One/ }).click();
    await until(
      async () => (await pageUrl()) === `${origin}/one`,
      "page one to load in the Quick Browser",
    );
    expect(await quickPanes().count()).toBe(1);

    const height = await app.page.evaluate(() => innerHeight);
    await app.page.mouse.click(4, height - 4);
    await quickPaneCount(0);
  });

  it("finds what's typed in a Quick Browser's find bar, and closes it from its own button", async () => {
    await app.page.keyboard.press("Meta+l");
    await quickPaneCount(1);
    const address = front().getByPlaceholder("Search or enter address");
    await address.fill(`${origin}/one`);
    await address.press("Enter");
    await until(
      async () => (await pageUrl()) === `${origin}/one`,
      "page one to load",
    );

    // Back to the page from the address bar, which the quick pane would hold
    // on to once it sees it take focus, past the suggestions for what was
    // typed. The page passes Cmd+F on once it has drawn with focus.
    await app.page.getByRole("listbox").waitFor({ state: "detached" });
    await address.click();
    const page = app.page.locator("webview").last();
    await until(async () => {
      const box = (await page.boundingBox())!;
      await app.page.mouse.click(box.x + 8, box.y + 8);
      return inWebview<boolean>(
        page,
        'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(document.title === "Page One" && document.hasFocus()))))',
      );
    }, "page one to have focus");

    await app.page.keyboard.press("Meta+f");
    const find = app.page.getByRole("search");
    const field = find.getByLabel("Find in page");
    await field.waitFor();
    await app.page.keyboard.type("One");
    await until(
      async () => (await find.getByRole("status").textContent()) === "1 of 1",
      "find to count what's typed",
    );
    expect(await address.inputValue()).toBe(`${origin}/one`);

    // Where the user clicks, rather than wherever Playwright can
    const box = (await find
      .getByRole("button", { name: "Close", exact: true })
      .boundingBox())!;
    await app.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await find.waitFor({ state: "detached" });
    expect(await quickPanes().count()).toBe(1);

    await app.page.keyboard.press("Meta+w");
    await quickPaneCount(0);
  });

  it("uses a menu in a Quick Canvas, and stays open", async () => {
    await runCommand(app.page, "Quick Canvas");
    await quickPaneCount(1);
    const actions = front().locator("button:has(.lucide-ellipsis)");
    const dotGrid = app.page.getByRole("menuitem", { name: "Show dot grid" });

    const isDotGridShown = async () => {
      await actions.click();
      await dotGrid.waitFor();
      return (await dotGrid.locator(".lucide-check").count()) === 1;
    };

    const wasShown = await isDotGridShown();
    await dotGrid.click();
    await dotGrid.waitFor({ state: "detached" });
    expect(await isDotGridShown()).toBe(!wasShown);
    await app.page.keyboard.press("Escape");
    await dotGrid.waitFor({ state: "detached" });
    expect(await quickPanes().count()).toBe(1);

    await app.page.keyboard.press("Meta+w");
    await quickPaneCount(0);
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

  it("opens in a tab with its unsaved text and its own Close, and git still waits for it", async () => {
    await shell.type("git commit --allow-empty\n");
    await quickPaneCount(1);
    const message = await quickEditorWith("# Please enter the commit message");
    // The quick pane's Close is the only one
    expect(await front().getByTestId("close-button").count()).toBe(0);
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
    await app.page
      .locator("[data-editor-pane-anchor]")
      .filter({ has: editor })
      .getByTestId("close-button")
      .waitFor();

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
