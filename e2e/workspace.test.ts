import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type Conduit, launch, until } from "./app";
import { expectStartedAtPaneWidth, zshenv } from "./shells";

const terminalTab = (id: string, command?: string) => ({
  id,
  name: id,
  activePaneId: `${id}-pane`,
  panes: [{ id: `${id}-pane`, type: "terminal", cwd: null, command }],
  layout: { id: `${id}-layout`, type: "pane", paneId: `${id}-pane` },
});

/**
 * Its first tab's command prints until ~/agent-done exists, and it opens to
 * its second tab. zselect waits without forking, which CI's runners are slow
 * at.
 */
const agents = {
  name: "E2E Agents",
  lastModified: 0,
  activeTabId: "Shell",
  tabs: [
    terminalTab(
      "Agent",
      "zmodload zsh/zselect; until [[ -e ~/agent-done ]]; do print -n .; zselect -t 20; done",
    ),
    terminalTab("Shell"),
  ],
};

describe("workspaces", () => {
  let app: Conduit;

  beforeAll(async () => {
    app = await launch({
      name: "workspace",
      files: {
        ".zshenv": zshenv,
        "one/.keep": "",
        "two/.keep": "",
        ".conduit/workspaces.json": JSON.stringify({ workspaces: [agents] }),
      },
      // Large enough that a shell started at the default 80 columns would be
      // wider than its pane.
      settings: { terminalFontSize: 24 },
    });
  });

  afterAll(() => app?.close());

  const tabs = () => app.page.getByRole("tab");
  const menu = () => app.page.getByRole("menu");
  const menuItem = (name: string) => app.page.getByRole("menuitem", { name });
  const openMenu = () =>
    app.page.getByRole("button", { name: "Workspaces" }).click();

  /**
   * Waits for the menu to finish closing, because it moves focus back to its
   * button as it goes. Typing before then would go to the button instead.
   */
  const menuClosed = () => menu().waitFor({ state: "detached" });

  async function choose(item: string) {
    await openMenu();
    await menuItem(item).click();
    await menuClosed();
  }

  /**
   * Waits for the active terminal to take focus back after a menu or dialog
   * closes. Check before `run`, which focuses the terminal itself.
   */
  async function expectTerminalFocused(after: string) {
    const terminal = await app.terminal();
    await until(
      () => terminal.focused(),
      `the terminal to have focus after ${after}`,
      5_000,
    );
  }

  async function pwd(): Promise<string> {
    const terminal = await app.terminal();
    expect(await terminal.run('echo "pwd is $PWD"')).toBe(0);
    return (await terminal.text()).match(/^pwd is (.+)$/m)![1];
  }

  it("saves the window's tabs as a named workspace", async () => {
    expect(await (await app.terminal()).run("cd ~/one")).toBe(0);
    await app.page.getByRole("button", { name: "New Tab" }).click();
    await tabs()
      .nth(1)
      .and(app.page.getByRole("tab", { selected: true }))
      .waitFor();
    expect(await (await app.terminal()).run("cd ~/two")).toBe(0);

    await choose("Save Workspace");
    const dialog = app.page.getByRole("dialog", { name: "Save workspace" });
    await dialog.getByRole("textbox").fill("E2E Space");
    await dialog.getByRole("textbox").press("Enter");
    await dialog.waitFor({ state: "detached" });
    await expectTerminalFocused("saving");

    await openMenu();
    await menuItem("E2E Space").waitFor();
    await app.page.keyboard.press("Escape");
    await menuClosed();
    // In the isolated home, not yours.
    expect(
      fs.readFileSync(path.join(app.home, ".conduit/workspaces.json"), "utf8"),
    ).toContain("E2E Space");
  });

  it("renames the workspace, and keeps its name when renaming is cancelled", async () => {
    const dialog = app.page.getByRole("dialog", { name: "Rename workspace" });
    await choose("Rename Workspace");
    await dialog.getByRole("textbox").fill("E2E Renamed");
    await dialog.getByRole("textbox").press("Enter");
    await dialog.waitFor({ state: "detached" });
    await expectTerminalFocused("renaming");

    await choose("Rename Workspace");
    await dialog.getByRole("textbox").fill("E2E Cancelled");
    await dialog.getByRole("textbox").press("Escape");
    await dialog.waitFor({ state: "detached" });
    await expectTerminalFocused("cancelling a rename");

    const saved = fs.readFileSync(
      path.join(app.home, ".conduit/workspaces.json"),
      "utf8",
    );
    expect(saved).toContain("E2E Renamed");
    expect(saved).not.toContain("E2E Space");
    expect(saved).not.toContain("E2E Cancelled");
  });

  it("closes the workspace into a fresh window", async () => {
    await choose("Close Workspace");
    // Every terminal the test has used is tagged.
    await until(
      async () =>
        (await app.page.locator(".xterm[data-e2e-terminal]").count()) === 0,
      "the workspace's terminals to close",
    );
    await expectTerminalFocused("closing the workspace");
    expect(await pwd()).toBe(app.home);
    expect(await tabs().count()).toBe(1);
  });

  it("reopens the workspace's tabs in their directories", async () => {
    await choose("E2E Renamed");
    await tabs()
      .nth(1)
      .and(app.page.getByRole("tab", { selected: true }))
      .waitFor();
    await expectTerminalFocused("opening the workspace");
    expect(await tabs().count()).toBe(2);
    expect(await pwd()).toBe(path.join(app.home, "two"));
    await expectStartedAtPaneWidth(app, await app.terminal());

    await tabs().nth(0).click();
    await tabs()
      .nth(0)
      .and(app.page.getByRole("tab", { selected: true }))
      .waitFor();
    expect(await pwd()).toBe(path.join(app.home, "one"));
    await expectStartedAtPaneWidth(app, await app.terminal());
  });

  it("shows a tab running while its command prints, before it's been opened", async () => {
    await choose("E2E Agents");
    const agent = tabs().nth(0);
    await tabs()
      .nth(1)
      .and(app.page.getByRole("tab", { selected: true }))
      .waitFor();
    // Hovering a tab previews it, which would show its terminal.
    await (await app.terminal()).locator.hover();
    const running = agent.locator(".animate-shiny-text");
    await running.waitFor({ timeout: 10_000 });

    fs.writeFileSync(path.join(app.home, "agent-done"), "");
    const stopped = Date.now();
    await running.waitFor({ state: "detached", timeout: 10_000 });
    // It goes idle once its shell has printed nothing for 2 seconds.
    expect(Date.now() - stopped).toBeGreaterThan(1_500);
    expect(await agent.getAttribute("aria-selected")).toBe("false");
  });

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});
