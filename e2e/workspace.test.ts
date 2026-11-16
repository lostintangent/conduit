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

const printFor5Seconds =
  "zmodload zsh/zselect; repeat 25 { print -n .; zselect -t 20 }";

/**
 * Its first tab has a shell beside a collapsed pane, and its second tab has
 * one pane. Both print for 5 seconds. It opens to its third tab.
 */
const collapsed = {
  name: "E2E Collapsed",
  lastModified: 0,
  activeTabId: "Shell",
  tabs: [
    {
      ...terminalTab("Split"),
      panes: [
        { id: "Split-pane", type: "terminal", cwd: null },
        {
          id: "Split-agent",
          type: "terminal",
          cwd: null,
          command: printFor5Seconds,
        },
      ],
      layout: {
        id: "Split-layout",
        type: "split",
        direction: "row",
        children: [
          { id: "Split-pane-node", type: "pane", paneId: "Split-pane" },
          {
            id: "Split-agent-node",
            type: "pane",
            paneId: "Split-agent",
            collapsed: true,
          },
        ],
      },
    },
    terminalTab("Open", printFor5Seconds),
    terminalTab("Shell"),
  ],
};

/** Like a workspace whose worktree was deleted. */
const gone = {
  name: "E2E Gone",
  lastModified: 0,
  activeTabId: "Gone",
  tabs: [
    {
      ...terminalTab("Gone"),
      panes: [{ id: "Gone-pane", type: "terminal", cwd: "/conduit-e2e/gone" }],
    },
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
        ".conduit/workspaces.json": JSON.stringify({
          // Older versions saved the window's tabs as a workspace like this.
          workspaces: [
            agents,
            collapsed,
            gone,
            { ...gone, name: "__last_workspace__" },
          ],
        }),
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

  /** The workspace name the title bar shows, if any. */
  const title = () =>
    app.page.locator(":has(> svg.lucide-cable)").first().textContent();

  /**
   * The window's tabs swap only once the ones it had have saved, which can
   * take longer than the menu takes to close, and the title changes after
   * that. A terminal found any sooner could be one that's about to close.
   */
  async function switchWorkspace(item: string, shown: string) {
    await choose(item);
    await until(
      async () => (await title()) === shown,
      `the title to read "${shown}"`,
    );
  }
  const openWorkspace = (name: string) =>
    switchWorkspace(name, `Conduit (${name})`);
  const closeWorkspace = () => switchWorkspace("Close Workspace", "Conduit");

  const saved = () =>
    JSON.parse(
      fs.readFileSync(path.join(app.home, ".conduit/workspaces.json"), "utf8"),
    );

  async function pwd(): Promise<string> {
    const terminal = await app.terminal();
    expect(await terminal.run('echo "pwd is $PWD"')).toBe(0);
    return (await terminal.text()).match(/^pwd is (.+)$/m)![1];
  }

  it("saves the window's tabs as a named workspace", async () => {
    expect(await title()).toBe("Conduit");
    expect(await (await app.terminal()).run("cd ~/one")).toBe(0);
    await app.page
      .getByRole("button", { name: "New Tab", exact: true })
      .click();
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
    expect(await title()).toBe("Conduit (E2E Space)");

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
    expect(await title()).toBe("Conduit (E2E Renamed)");
  });

  it("closes the workspace into a fresh window", async () => {
    await closeWorkspace();
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

  it("saves the window's tabs as they change, without a name", async () => {
    expect(await (await app.terminal()).run("cd ~/two")).toBe(0);
    await until(
      () =>
        saved().untitled?.tabs[0]?.panes[0]?.cwd === path.join(app.home, "two"),
      "the window's tab to save in its new folder",
      10_000,
    );
    expect(saved().current).toBeUndefined();
  });

  it("reopens the workspace's tabs in their directories", async () => {
    await openWorkspace("E2E Renamed");
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
    await openWorkspace("E2E Agents");
    const agent = tabs().nth(0);
    await tabs()
      .nth(1)
      .and(app.page.getByRole("tab", { selected: true }))
      .waitFor();
    // Hovering a tab previews it, which would show its terminal.
    await (await app.terminal()).locator.hover();
    const running = agent.locator(".animate-shiny-text");
    await running.waitFor({ timeout: 10_000 });
    // The shimmer only moves layers, so the compositor runs it without repainting.
    const animated = await running.evaluate((shimmer) =>
      shimmer
        .getAnimations({ subtree: true })
        .flatMap((animation) =>
          (animation.effect as KeyframeEffect).getKeyframes(),
        )
        .flatMap((keyframe) => Object.keys(keyframe))
        .filter(
          (key) =>
            !["offset", "computedOffset", "easing", "composite"].includes(key),
        ),
    );
    expect([...new Set(animated)]).toEqual(["transform"]);

    fs.writeFileSync(path.join(app.home, "agent-done"), "");
    const stopped = Date.now();
    await running.waitFor({ state: "detached", timeout: 10_000 });
    // It goes idle once its shell has printed nothing for 2 seconds.
    expect(Date.now() - stopped).toBeGreaterThan(1_500);
    expect(await agent.getAttribute("aria-selected")).toBe("false");
  });

  it("keeps a collapsed pane's output out of its tab's state", async () => {
    await openWorkspace("E2E Collapsed");
    const [split, open] = [tabs().nth(0), tabs().nth(1)];
    await tabs()
      .nth(2)
      .and(app.page.getByRole("tab", { selected: true }))
      .waitFor();
    await (await app.terminal()).locator.hover();
    // The split tab's panes start first, so it would shimmer and go idle
    // before the other tab does.
    let shimmered = false;
    await until(
      async () => {
        shimmered ||= (await split.locator(".animate-shiny-text").count()) > 0;
        return (await open.locator(".bg-blue-400").count()) > 0;
      },
      "the uncollapsed pane's tab to go idle, unseen",
      20_000,
    );
    expect(shimmered).toBe(false);
    expect(await split.locator(".bg-blue-400").count()).toBe(0);
  });

  it("opens a pane whose folder is gone at home, and says why", async () => {
    await openWorkspace("E2E Gone");
    await expectTerminalFocused("opening the workspace");
    // The rest of the line wraps at this font size.
    const terminal = await app.terminal();
    await terminal.waitForText("/conduit-e2e/gone no longer exists");
    expect(await pwd()).toBe(app.home);
    expect(await tabs().count()).toBe(1);
  });

  it("goes back to the window's own tabs when the workspace closes", async () => {
    await closeWorkspace();
    await expectTerminalFocused("closing the workspace");
    expect(await tabs().count()).toBe(1);
    expect(await pwd()).toBe(path.join(app.home, "two"));
  });

  it("lists only named workspaces in the picker", async () => {
    await app.page.keyboard.press("Meta+K");
    await app.page.keyboard.press("Meta+O");
    const picker = app.page.getByRole("dialog", { name: "Open Workspace" });
    const options = picker.getByRole("option");
    await options.first().waitFor();

    expect(await options.count()).toBe(4);
    expect((await options.allTextContents()).join()).not.toContain(
      "__last_workspace__",
    );
    expect(
      saved()
        .workspaces.map((workspace: { name: string }) => workspace.name)
        .sort(),
    ).toEqual(["E2E Agents", "E2E Collapsed", "E2E Gone", "E2E Renamed"]);
    await app.page.keyboard.press("Escape");
    await picker.waitFor({ state: "detached" });
  });

  it("saves the window's tabs as it quits", async () => {
    await app.page
      .getByRole("button", { name: "New Tab", exact: true })
      .click();
    await tabs()
      .nth(1)
      .and(app.page.getByRole("tab", { selected: true }))
      .waitFor();
    const changed = Date.now();
    const closed = app.page.waitForEvent("close", { timeout: 10_000 });

    const quitting = app.quit();
    await closed;
    // Sooner than the change would have saved by itself.
    expect(Date.now() - changed).toBeLessThan(2_000);
    expect(saved().untitled.tabs).toHaveLength(2);
    await quitting;
  });

  /** Starts Conduit again in the same home, once it has quit. */
  async function relaunch(name: string) {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
    app = await launch({ name, home: app.home });
  }

  it("reopens the window's tabs as it starts again", async () => {
    await relaunch("workspace-relaunched");

    await tabs()
      .nth(1)
      .and(app.page.getByRole("tab", { selected: true }))
      .waitFor();
    expect(await tabs().count()).toBe(2);
    expect(await title()).toBe("Conduit");
    expect(await pwd()).toBe(path.join(app.home, "two"));
  });

  it("reopens the named workspace that was open as it starts again", async () => {
    await openWorkspace("E2E Renamed");
    await expectTerminalFocused("opening the workspace");
    await app.quit();
    await relaunch("workspace-relaunched-named");

    // It was last on its first tab.
    await tabs()
      .nth(0)
      .and(app.page.getByRole("tab", { selected: true }))
      .waitFor();
    expect(await tabs().count()).toBe(2);
    expect(await title()).toBe("Conduit (E2E Renamed)");
    expect(await pwd()).toBe(path.join(app.home, "one"));
  });

  it("keeps the window's tabs in the picker when they can't reopen, rather than saving over them", async () => {
    await closeWorkspace();
    await expectTerminalFocused("closing the workspace");
    await app.quit();
    // Hand-edited to a size its shell can't start at.
    const file = path.join(app.home, ".conduit/workspaces.json");
    const unrestorable = saved();
    unrestorable.untitled.tabs[0].panes[0].cols = "wide";
    fs.writeFileSync(file, JSON.stringify(unrestorable));
    await relaunch("workspace-unrestorable");

    const toast = app.page.locator(".pointer-events-auto", {
      has: app.page.getByText("Couldn't reopen your last session", {
        exact: true,
      }),
    });
    await until(() => toast.isVisible(), "the toast about the last session");
    const recovered = (await toast.textContent())!.match(
      /Your tabs are saved as “(Recovered [^”]+)”/,
    )?.[1];
    expect(recovered).toBeDefined();
    await app.page.getByRole("tab", { selected: true }).waitFor();
    expect(await tabs().count()).toBe(1);
    expect(await title()).toBe("Conduit");

    // The new tab saves as the window's tabs, beside the recovered ones.
    await app.quit();
    const kept = saved();
    expect(kept.current).toBeUndefined();
    expect(kept.untitled.tabs).toHaveLength(1);
    expect(
      kept.workspaces.find(({ name }: { name: string }) => name === recovered),
    ).toMatchObject({ tabs: unrestorable.untitled.tabs });
    await relaunch("workspace-recovered");

    await app.page.getByRole("tab", { selected: true }).waitFor();
    expect(await tabs().count()).toBe(1);
    await app.page.keyboard.press("Meta+K");
    await app.page.keyboard.press("Meta+O");
    const picker = app.page.getByRole("dialog", { name: "Open Workspace" });
    await picker.getByRole("option").filter({ hasText: recovered! }).waitFor();
    await app.page.keyboard.press("Escape");
    await picker.waitFor({ state: "detached" });
  });

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});
