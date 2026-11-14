import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Locator } from "playwright-core";
import { type Conduit, git, launch, type Terminal, until } from "./app";

/** The part of the window's API that watches files and repos. */
interface Watching {
  fs: {
    subscribe(cwd: string, type: "file"): Promise<string>;
    onFileContentChanged(listener: (event: SubscriptionEvent) => void): void;
  };
  git: {
    subscribe(cwd: string): Promise<string | null>;
    onStatusChanged(listener: (event: SubscriptionEvent) => void): void;
  };
}
type SubscriptionEvent = { subscriptionId: string };

describe("terminal and CLI", () => {
  let app: Conduit;
  let terminal: Terminal;

  beforeAll(async () => {
    app = await launch({ name: "terminal" });
    terminal = await app.terminal();
  });

  afterAll(() => app?.close());

  const visibleTerminals = () =>
    app.page.locator(".xterm").filter({ visible: true });
  const tabs = () => app.page.getByRole("tab");
  const count = (locator: Locator, expected: number, what: string) =>
    until(
      async () => (await locator.count()) === expected,
      `${expected} ${what}`,
    );

  it("runs its shell in the isolated home", async () => {
    expect(await terminal.run('echo "home is $HOME"')).toBe(0);
    expect(await terminal.text()).toContain(`home is ${app.home}\n`);
  });

  it("puts a conduit CLI on the PATH that controls this window", async () => {
    expect(await terminal.run("conduit --help | head -3")).toBe(0);
    expect(await terminal.text()).toContain(
      "Interact with Conduit, from within Conduit!",
    );

    await terminal.type("conduit tab-new --title E2E-CLI-TAB\n");
    await app.page
      .getByRole("tab", { name: /E2E-CLI-TAB/, selected: true })
      .waitFor();
  });

  // The CLI's pane commands act on the active pane, and only a click
  // activates one, so each test clicks the terminal it types into first.
  it("splits, focuses and closes the active pane from the CLI", async () => {
    const pane = await app.terminal();
    expect(await pane.run("conduit split right")).toBe(0);
    await count(visibleTerminals(), 2, "visible terminals after a split");

    await pane.locator.click();
    expect(await pane.run("conduit focus")).toBe(0);
    await app.page.getByRole("button", { name: "Exit focus mode" }).waitFor();
    await count(visibleTerminals(), 1, "visible terminal in focus mode");
    expect(await pane.locator.isVisible()).toBe(true);

    expect(await pane.run("conduit focus")).toBe(0);
    await count(visibleTerminals(), 2, "visible terminals after focus mode");

    await pane.type("conduit close\n");
    await count(visibleTerminals(), 1, "visible terminal after a close");
    expect(await pane.locator.count()).toBe(0);
  });

  it("moves, duplicates and closes tabs from the CLI", async () => {
    const before = await tabs().count();
    const panes = await visibleTerminals().count();
    const pane = await app.terminal();
    expect(await pane.run("conduit split bottom")).toBe(0);
    await count(
      visibleTerminals(),
      panes + 1,
      "visible terminals after a split",
    );

    await pane.locator.click();
    expect(await pane.run("conduit move tab")).toBe(0);
    await count(tabs(), before + 1, "tabs after moving a pane to a new one");
    await count(visibleTerminals(), 1, "visible terminal in the new tab");
    expect(await pane.locator.isVisible()).toBe(true);

    await pane.type("conduit duplicate\n");
    await count(tabs(), before + 2, "tabs after a duplicate");
    // A shell, not a replay of the running `conduit duplicate`.
    const copy = await app.terminal();
    expect(await pane.locator.isVisible()).toBe(false);

    await copy.type("conduit close --tab\n");
    await count(tabs(), before + 1, "tabs after closing the duplicate");
    expect(await copy.locator.count()).toBe(0);
  });

  it("closes the page's shells when it reloads", async () => {
    const pid = await shellPid(await app.terminal());
    expect(isRunning(pid)).toBe(true);

    await app.page.reload();
    await app.terminal();
    await until(() => !isRunning(pid), "the old page's shell to exit");
  });

  it("stops notifying the page's file and git subscriptions when it reloads", async () => {
    const repo = path.join(app.home, "watched");
    fs.mkdirSync(repo);
    git(repo, "init", "-q");
    const subscribe = () =>
      app.page.evaluate(async (cwd) => {
        const { conduit } = window as unknown as { conduit: Watching };
        return [
          await conduit.fs.subscribe(cwd, "file"),
          await conduit.git.subscribe(cwd),
        ];
      }, repo);
    const before = await subscribe();

    await app.page.reload();
    await app.page.waitForFunction(() => "conduit" in window);
    await app.page.evaluate(() => {
      const scope = window as unknown as {
        conduit: Watching;
        notified: string[];
      };
      scope.notified = [];
      const record = ({ subscriptionId }: SubscriptionEvent) =>
        scope.notified.push(subscriptionId);
      scope.conduit.fs.onFileContentChanged(record);
      scope.conduit.git.onStatusChanged(record);
    });
    const after = await subscribe();

    // The old page's subscriptions listen to the same watchers, ahead of the
    // new page's, so they'd have been notified by the time those are.
    fs.writeFileSync(path.join(repo, "new.txt"), "");
    const notified = await until(async () => {
      const ids = await app.page.evaluate(
        () => (window as unknown as { notified: string[] }).notified,
      );
      return after.every((id) => ids.includes(id!)) && ids;
    }, "the new page's subscriptions to see a new file");
    expect(notified).not.toContain(before[0]);
    expect(notified).not.toContain(before[1]);
  });

  it("reloads the page when it crashes, and closes the dead page's shells", async () => {
    const pid = await shellPid(await app.terminal());
    expect(isRunning(pid)).toBe(true);

    const devtools = await app.page.context().newCDPSession(app.page);
    // The crash takes the reply with it.
    void devtools.send("Page.crash").catch(() => {});
    await until(() => !isRunning(pid), "the crashed page's shell to exit");
    await app.reconnect();
    expect(await (await app.terminal()).run("true")).toBe(0);
  });

  it("had no uncaught errors or failed loads", () => {
    expect(app.pageErrors).toEqual([]);
    expect(app.failedRequests).toEqual([]);
  });
});

async function shellPid(shell: Terminal) {
  expect(await shell.run("echo pid-$$")).toBe(0);
  return Number((await shell.text()).match(/^pid-(\d+)$/m)?.[1]);
}

function isRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
