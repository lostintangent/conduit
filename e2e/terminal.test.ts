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
    on(
      event: "statusChanged",
      listener: (event: SubscriptionEvent) => void,
    ): void;
  };
}
type SubscriptionEvent = { subscriptionId: string };

/** Each message of shell output since a test started recording them. */
interface Output {
  conduit: {
    terminal: {
      on(event: "data", listener: (event: { data: string }) => void): void;
    };
  };
  output?: string[];
  /** Whether the hidden-output step's pane was last seen on screen. */
  onScreen?: boolean;
}

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
  const recordOutput = () =>
    app.page.evaluate(() => {
      const scope = window as unknown as Output;
      if (scope.output) return;
      const output: string[] = (scope.output = []);
      scope.conduit.terminal.on("data", ({ data }) => output.push(data));
    });
  const recorded = () =>
    app.page.evaluate(() => (window as unknown as Output).output ?? []);

  it("runs its shell in the isolated home", async () => {
    expect(await terminal.run('echo "home is $HOME"')).toBe(0);
    expect(await terminal.text()).toContain(`home is ${app.home}\n`);
  });

  it("pauses a shell while the page falls behind its output", async () => {
    const flooded = path.join(app.home, "flooded");
    await terminal.type(
      `sleep 1; yes 0123456789 | head -n 450000; touch ${flooded}; echo E2E-FLOODED\n`,
    );
    // A busy page parses nothing, so its paused shell can't write 5 MB yet.
    await app.page.evaluate(() => {
      const end = Date.now() + 5_000;
      while (Date.now() < end) continue;
    });
    expect(fs.existsSync(flooded)).toBe(false);
    await terminal.waitForText(/^E2E-FLOODED$/m, 30_000);
  });

  for (const where of ["shown", "hidden"]) {
    it(`sends the last line a paused shell prints before it exits, in a ${where} tab`, async () => {
      // The tab closes with its shell, so this listens to the shell's output.
      await recordOutput();
      await terminal.type(`conduit tab-new --title E2E-EXIT-${where}\n`);
      const tab = app.page.getByRole("tab", {
        name: new RegExp(`E2E-EXIT-${where}`),
      });
      await tab.and(app.page.getByRole("tab", { selected: true })).waitFor();
      const shell = await app.terminal();

      // 93,000 characters stay under the 100,000 that pause a shell, even with
      // the few thousand the page hasn't acknowledged yet. The next 7,500 go
      // over, and are read before the pause since they're one burst. So the
      // last line waits in the pty when the shell exits.
      await shell.type(
        `sleep 1; head -c 93000 /dev/zero | tr '\\0' x; sleep 0.2; head -c 7500 /dev/zero | tr '\\0' y; sleep 0.3; printf 'E2E-%s\\n' TAIL-${where}; exit\n`,
      );
      if (where === "hidden") await app.page.getByRole("tab").first().click();
      // node-pty closes a pty 200 ms after its shell exits, read or not.
      await app.page.evaluate(() => {
        const end = Date.now() + 3_000;
        while (Date.now() < end) continue;
      });
      await count(tab, 0, `E2E-EXIT-${where} tabs once its shell exits`);
      expect((await recorded()).join("")).toContain(`E2E-TAIL-${where}\r\n`);
    });
  }

  it("holds a hidden tab's output for a moment, and not a shown tab's", async () => {
    await recordOutput();
    await terminal.type("conduit tab-new --title E2E-HIDDEN\n");
    const tab = app.page.getByRole("tab", { name: /E2E-HIDDEN/ });
    await tab.and(app.page.getByRole("tab", { selected: true })).waitFor();
    const shell = await app.terminal();
    // A pane's IntersectionObserver tells main when it leaves or comes back
    // on screen. Every observer in a page hears in the same task, so once this
    // one has heard, main has been told.
    await shell.locator.evaluate((element) => {
      const scope = window as unknown as Output;
      new IntersectionObserver((entries) => {
        scope.onScreen = entries.at(-1)?.isIntersecting;
      }).observe(element);
    });
    const onScreen = (expected: boolean) =>
      until(
        async () =>
          (await app.page.evaluate(
            () => (window as unknown as Output).onScreen,
          )) === expected,
        `the pane ${expected ? "on" : "off"} screen`,
      );
    // Two lines 120 ms apart, about half of what main holds a hidden tab's
    // output for. `zselect` waits without forking a slow `sleep`.
    const twoLines = (name: string) =>
      `printf 'E2E-${name}-%s\\n' A; zselect -t 12; printf 'E2E-${name}-%s\\n' B`;
    const messageWith = (line: string) =>
      until(
        async () => (await recorded()).find((data) => data.includes(line)),
        line,
      );

    // The shell waits until main has heard that its tab hid.
    const hid = path.join(app.home, "tab-hid");
    await shell.type(
      `zmodload zsh/zselect; until [[ -e ${hid} ]]; do zselect -t 5; done; ${twoLines("HELD")}\n`,
    );
    await onScreen(true);
    await app.page.getByRole("tab").first().click();
    await onScreen(false);
    fs.writeFileSync(hid, "");
    expect(await messageWith("E2E-HELD-A\r\n")).toContain("E2E-HELD-B\r\n");

    await tab.click();
    await onScreen(true);
    await shell.type(`${twoLines("SHOWN")}\n`);
    expect(await messageWith("E2E-SHOWN-A\r\n")).not.toContain(
      "E2E-SHOWN-B\r\n",
    );
    await shell.type("exit\n");
    await count(tab, 0, "E2E-HIDDEN tabs once its shell exits");
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

  it("shows a tab again after its repo's shared watchers were released while it was hidden", async () => {
    const repo = path.join(app.home, "stats");
    fs.mkdirSync(repo);
    fs.writeFileSync(path.join(repo, "a.txt"), "a\n");
    git(repo, "init", "-q");
    git(repo, "add", ".");
    git(repo, "commit", "-qm", "init");
    fs.appendFileSync(path.join(repo, "a.txt"), "b\n");

    const tab = (title: string) =>
      app.page.getByRole("tab", { name: new RegExp(title), selected: true });
    const shortcut = async (title: string) => {
      const names = await tabs().allTextContents();
      return `Meta+${names.findIndex((name) => name.includes(title)) + 1}`;
    };
    const stats = () =>
      app.page
        .getByRole("tabpanel")
        .filter({ visible: true })
        .getByRole("button", { name: /\+\d/ });

    await (await app.terminal()).type("conduit tab-new --title E2E-AWAY\n");
    await tab("E2E-AWAY").waitFor();
    await (await app.terminal()).type("conduit tab-new --title E2E-STATS\n");
    await tab("E2E-STATS").waitFor();
    expect(await (await app.terminal()).run(`cd ${repo}`)).toBe(0);
    await stats().waitFor();

    const ours = await app.page.evaluate(async (cwd) => {
      const scope = window as unknown as {
        conduit: Watching;
        notified: string[];
      };
      scope.notified = [];
      scope.conduit.git.on("statusChanged", ({ subscriptionId }) =>
        scope.notified.push(subscriptionId),
      );
      return scope.conduit.git.subscribe(cwd);
    }, repo);
    // Main tells a repo's subscriptions of a change oldest first, so once ours
    // hears of one, every other subscription to the repo has too.
    let changes = 0;
    const othersNotified = async () => {
      await app.page.evaluate(() => {
        (window as unknown as { notified: string[] }).notified = [];
      });
      fs.writeFileSync(path.join(repo, `change-${++changes}.txt`), "");
      return until(async () => {
        const ids = await app.page.evaluate(
          () => (window as unknown as { notified: string[] }).notified,
        );
        return ids.includes(ours!) && ids.filter((id) => id !== ours);
      }, "our subscription to see a change");
    };
    await until(
      async () => (await othersNotified()).length > 0,
      "the tab's subscription to see a change",
    );

    await app.page.keyboard.press(await shortcut("E2E-AWAY"));
    await tab("E2E-AWAY").waitFor();
    await until(
      async () => (await othersNotified()).length === 0,
      "the hidden tab's subscription to be released",
    );

    await app.page.keyboard.press(await shortcut("E2E-STATS"));
    await until(
      async () =>
        app.pageErrors.length > 0 ||
        ((await tab("E2E-STATS").isVisible()) && (await stats().isVisible())),
      "the shown tab's git stats, or a page error",
    );
    expect(app.pageErrors).toEqual([]);
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
      scope.conduit.git.on("statusChanged", record);
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
