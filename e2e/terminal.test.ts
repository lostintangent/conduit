import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Locator } from "playwright-core";
import { type Conduit, git, launch, type Terminal, until } from "./app";

/** The part of the window's API that watches files and repos. */
interface Watching {
  files: {
    subscribe(cwd: string): Promise<string>;
    on(
      event: "fileContentChanged",
      listener: (event: SubscriptionEvent) => void,
    ): void;
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
  /** When each message arrived, from `Date.now()`. */
  arrivals?: number[];
  /** Whether the hidden-output step's pane was last seen on screen. */
  onScreen?: boolean;
}

/** The part of the window's API that closes a pane's shell. */
interface Closing {
  conduit: { terminal: { close(sessionId: string): Promise<void> } };
}

/** Each time the cursor showed or hid, or the typed key reached its row. */
interface CursorFrame {
  /** From the first frame, in ms. */
  at: number;
  shown: boolean;
  typed: boolean;
}
interface Blinking {
  cursorFrames?: CursorFrame[];
  cursorWatched?: Promise<CursorFrame[]>;
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
      const arrivals: number[] = (scope.arrivals = []);
      scope.conduit.terminal.on("data", ({ data }) => {
        output.push(data);
        arrivals.push(Date.now());
      });
    });
  const recorded = () =>
    app.page.evaluate(() => (window as unknown as Output).output ?? []);

  it("runs its shell in the isolated home", async () => {
    expect(await terminal.run('echo "home is $HOME"')).toBe(0);
    expect(await terminal.text()).toContain(`home is ${app.home}\n`);
  });

  it("blinks a focused cursor without running an animation every frame", async () => {
    await terminal.type("");
    await until(
      () =>
        terminal.locator
          .locator(".xterm-rows.xterm-focus .xterm-cursor.xterm-cursor-blink")
          .count(),
      "a blinking cursor",
    );
    const running = await terminal.locator.evaluate((xterm) =>
      xterm
        .getAnimations({ subtree: true })
        .filter((animation) => animation.playState === "running")
        .map((animation) => (animation as CSSAnimation).animationName),
    );
    expect(running).toEqual([]);
  });

  it("blinks a focused cursor every half second, and shows it on each keystroke", async () => {
    await terminal.type("");
    // Records each frame the cursor shows or hides, until a second after the
    // typed key reaches its row.
    await terminal.locator.evaluate((xterm) => {
      const scope = window as unknown as Blinking;
      const pixel = document
        .createElement("canvas")
        .getContext("2d", { willReadFrequently: true })!;
      const opaque = (color: string) => {
        pixel.clearRect(0, 0, 1, 1);
        pixel.fillStyle = color;
        pixel.fillRect(0, 0, 1, 1);
        return pixel.getImageData(0, 0, 1, 1).data[3] > 0;
      };
      const frames: CursorFrame[] = (scope.cursorFrames = []);
      const start = performance.now();
      scope.cursorWatched = new Promise((resolve) => {
        const frame = () => {
          const at = performance.now() - start;
          const cursor = xterm.querySelector(".xterm-rows .xterm-cursor");
          const shown =
            !!cursor && opaque(getComputedStyle(cursor).backgroundColor);
          const typed = !!cursor?.parentElement?.textContent.includes("@");
          const last = frames.at(-1);
          if (last?.shown !== shown || last.typed !== typed) {
            frames.push({ at, shown, typed });
          }
          const typedAt = frames.find((frame) => frame.typed)?.at;
          if (typedAt === undefined ? at < 15_000 : at < typedAt + 1000) {
            requestAnimationFrame(frame);
          } else resolve(frames);
        };
        requestAnimationFrame(frame);
      });
    });
    await until(
      () =>
        app.page.evaluate(
          () => (window as unknown as Blinking).cursorFrames!.length > 4,
        ),
      "the cursor to blink a few times",
    );
    await app.page.keyboard.type("@");
    const frames = await app.page.evaluate(
      () => (window as unknown as Blinking).cursorWatched!,
    );
    await app.page.keyboard.press("Backspace");

    const typed = frames.findIndex((frame) => frame.typed);
    expect(typed).toBeGreaterThan(4);
    const blinks = frames.slice(1, typed);
    for (const [index, blink] of blinks.entries()) {
      if (index === 0) continue;
      expect(blink.shown).toBe(!blinks[index - 1].shown);
      expect(blink.at - blinks[index - 1].at).toBeGreaterThan(350);
      expect(blink.at - blinks[index - 1].at).toBeLessThan(650);
    }
    // Shown as the key lands, and for a full half second after it.
    expect(frames[typed].shown).toBe(true);
    const hidden = frames.slice(typed).find((frame) => !frame.shown);
    expect(hidden).toBeDefined();
    expect(hidden!.at - frames[typed].at).toBeGreaterThan(400);
    expect(hidden!.at - frames[typed].at).toBeLessThan(650);
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
      // Anchored, because the tab that runs `conduit tab-new` is named for
      // that command, title and all, until it finishes.
      const tab = app.page.getByRole("tab", {
        name: new RegExp(`^E2E-EXIT-${where}`),
      });
      await tab.and(app.page.getByRole("tab", { selected: true })).waitFor();
      const shell = await app.terminal();

      // 93,000 characters stay under the 100,000 that pause a shell, even with
      // the few thousand the page hasn't acknowledged yet. The next 7,500 go
      // over. A paused pty is read once more, which takes the blank line, so
      // the last line waits in the pty when the shell exits.
      await shell.type(
        `sleep 1; head -c 93000 /dev/zero | tr '\\0' x; sleep 0.2; head -c 7500 /dev/zero | tr '\\0' y; sleep 0.3; echo; sleep 0.2; printf 'E2E-%s\\n' TAIL-${where}; exit\n`,
      );
      if (where === "hidden") await app.page.getByRole("tab").first().click();
      // Longer than the 600 ms macOS keeps an exited shell's unread output.
      await app.page.evaluate(() => {
        const end = Date.now() + 3_000;
        while (Date.now() < end) continue;
      });
      await count(tab, 0, `E2E-EXIT-${where} tabs once its shell exits`);
      expect((await recorded()).join("")).toContain(`E2E-TAIL-${where}\r\n`);
    });
  }

  it("ends a paused shell when its pane closes", async () => {
    await terminal.type("conduit tab-new --title E2E-CLOSE-PAUSED\n");
    const tab = app.page.getByRole("tab", { name: /^E2E-CLOSE-PAUSED/ });
    await tab.and(app.page.getByRole("tab", { selected: true })).waitFor();
    const shell = await app.terminal();
    const ids = path.join(app.home, "paused-shell");
    await shell.type(
      `echo $CONDUIT_SESSION_ID $$ > ${ids}; sleep 1; yes 0123456789\n`,
    );
    const [sessionId, pid] = await until(
      async () => fs.readFileSync(ids, "utf8").trim().split(" "),
      "the shell's session and pid",
    );
    // A busy page parses nothing, so its shell pauses, and the pane closes
    // before the page catches up.
    await app.page.evaluate(async (sessionId) => {
      const end = Date.now() + 3_000;
      while (Date.now() < end) continue;
      await (window as unknown as Closing).conduit.terminal.close(sessionId);
    }, sessionId);
    await until(
      () => !isRunning(Number(pid)),
      "the paused shell to end",
      5_000,
    );
  });

  it("holds a hidden tab's output for a moment, and not a shown tab's", async () => {
    await recordOutput();
    await terminal.type("conduit tab-new --title E2E-HIDDEN\n");
    const tab = app.page.getByRole("tab", { name: /^E2E-HIDDEN/ });
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
    // Two lines 120 ms apart. `zselect` waits without forking a slow `sleep`.
    const twoLines = (name: string) =>
      `printf 'E2E-${name}-%s\\n' A; zselect -t 12; printf 'E2E-${name}-%s\\n' B`;
    const messageWith = (line: string) =>
      until(
        async () => (await recorded()).find((data) => data.includes(line)),
        line,
      );

    // Once main has heard that its tab hid, the shell prints the time it
    // printed. A busy runner can only make that line arrive later, never
    // sooner than main holds it for.
    const hid = path.join(app.home, "tab-hid");
    await shell.type(
      `zmodload zsh/zselect zsh/datetime; until [[ -e ${hid} ]]; do zselect -t 5; done; printf 'E2E-HELD %s\\n' $EPOCHREALTIME\n`,
    );
    await onScreen(true);
    await app.page.getByRole("tab").first().click();
    await onScreen(false);
    fs.writeFileSync(hid, "");
    const held = await until(
      () =>
        app.page.evaluate(() => {
          const { output = [], arrivals = [] } = window as unknown as Output;
          const index = output.findIndex((data) =>
            /E2E-HELD \d+\.\d+\r\n/.test(data),
          );
          return index >= 0 && { data: output[index], at: arrivals[index] };
        }),
      "E2E-HELD",
    );
    const printed = Number(held.data.match(/E2E-HELD (\d+\.\d+)/)![1]);
    expect(held.at - printed * 1_000).toBeGreaterThanOrEqual(200);

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
      .getByRole("tab", { name: /^E2E-CLI-TAB/, selected: true })
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
      app.page.getByRole("tab", {
        name: new RegExp(`^${title}`),
        selected: true,
      });
    const shortcut = async (title: string) => {
      const names = await tabs().allTextContents();
      return `Meta+${names.findIndex((name) => name.startsWith(title)) + 1}`;
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
          await conduit.files.subscribe(cwd),
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
      scope.conduit.files.on("fileContentChanged", record);
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
