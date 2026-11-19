// Launches the packaged app with its own HOME and user data directory, so a run
// can't read or change the state of a Conduit you're using, and drives its
// window over the Chrome DevTools Protocol with Playwright.
import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  type Browser,
  chromium,
  type Keyboard,
  type Locator,
  type Page,
} from "playwright-core";

const repoRoot = path.resolve(import.meta.dirname, "..");

const appPath =
  process.env.CONDUIT_E2E_APP ??
  path.join(repoRoot, "out", `Conduit-darwin-${process.arch}`, "Conduit.app");

// CI sets this to upload each launch's last screenshot, its app log, which has
// the window's console, and a Playwright trace of its window.
const artifactsDir = process.env.CONDUIT_E2E_ARTIFACTS;

// Variables that would point the app or its shells at your own config.
const leakyEnv = [
  "ZDOTDIR",
  "HISTFILE",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME",
  "XDG_STATE_HOME",
  "XDG_CACHE_HOME",
  "GIT_CONFIG_GLOBAL",
];

export interface LaunchOptions {
  /** Names the launch's artifacts. */
  name: string;
  /**
   * Files to create in the isolated home before launch, keyed by relative path.
   * Files that start with `#!` are made executable. A `.zshrc` here replaces
   * the default one, which sets a short prompt.
   */
  files?: Record<string, string>;
  /** Written to ~/.conduit/settings.json before launch. */
  settings?: Record<string, unknown>;
  /**
   * A home to start the app in, either one from `newHome()` that a run set up
   * first, or the home of a launch that crashed or quit.
   */
  home?: string;
  /**
   * Connects without Playwright's focus emulation, which tells the window it
   * has focus and keeps every page visible to Chromium, browser panes' too,
   * even parked off screen. Without it, a covered window hides its pages and
   * stops their animation frames, which Playwright's clicks wait for.
   */
  noDefaults?: boolean;
}

type Truthy<T> = Exclude<T, false | 0 | "" | null | undefined>;

/**
 * Polls `check` until it returns a truthy value, and returns that value. A
 * check that never settles, like a script waiting on a page that stopped
 * drawing, times out too.
 */
export async function until<T>(
  check: () => T | Promise<T>,
  what: string,
  timeout = 15_000,
): Promise<Truthy<T>> {
  const deadline = Date.now() + timeout;
  let last: unknown;
  while (Date.now() < deadline) {
    const pending = Promise.resolve().then(check);
    pending.catch(() => {});
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stalled = new Promise<typeof STALLED>((resolve) => {
      timer = setTimeout(() => resolve(STALLED), deadline - Date.now());
    });
    try {
      const value = await Promise.race([pending, stalled]);
      if (value === STALLED) {
        last = "a check still running at the deadline";
        break;
      }
      if (value) return value as Truthy<T>;
      last = value;
    } catch (error) {
      last = error;
    } finally {
      clearTimeout(timer);
    }
    await delay(100);
  }
  throw new Error(
    `Timed out after ${timeout}ms waiting for ${what} (last: ${last})`,
  );
}

const STALLED = Symbol("stalled");

/** Whether `check` comes true within a moment, for what shouldn't happen. */
export function happens(
  check: () => boolean | Promise<boolean>,
  what: string,
): Promise<boolean> {
  return until(check, what, 1_000).then(
    () => true,
    () => false,
  );
}

/**
 * Presses `keys`, like "Meta+w", and lets go once `done`, for keys that
 * navigate or close a focused page, or give a page the keys as it navigates.
 * Each takes away the frame with the keys, which never acknowledges a key let
 * go as it goes, so a whole press would never get its answer.
 */
export async function pressInPage(
  page: Page,
  keys: string,
  done: () => Promise<boolean>,
  what: string,
): Promise<void> {
  const held: string[] = [];
  try {
    for (const key of keys.split("+")) {
      await page.keyboard.down(key);
      held.push(key);
    }
    await until(done, what);
  } finally {
    for (const key of held.reverse()) await page.keyboard.up(key);
  }
}

// Far longer than the window takes to answer a key, even on a busy runner.
const keyAnswerTimeout = 10_000;

/**
 * Fails a press, or a key held or let go, that the window doesn't answer in
 * time, which is what happens to one whose frame closes or navigates before
 * it's let go. Playwright would wait for it forever, and time the test out
 * with nothing to say why. Lets go of the keys it held too, as Playwright
 * would otherwise hold a modifier like Meta down for every key after it.
 */
function answerKeys(keyboard: Keyboard): void {
  const down = keyboard.down.bind(keyboard);
  const up = keyboard.up.bind(keyboard);
  const press = keyboard.press.bind(keyboard);
  const answered = async (
    call: Promise<void>,
    what: string,
    held: string[] = [],
  ) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unanswered = new Promise<typeof STALLED>((resolve) => {
      timer = setTimeout(() => resolve(STALLED), keyAnswerTimeout);
    });
    try {
      if ((await Promise.race([call, unanswered])) !== STALLED) return;
    } finally {
      clearTimeout(timer);
    }
    call.catch(() => {});
    for (const key of held.reverse()) void up(key).catch(() => {});
    throw new Error(
      `${what} got no answer in ${keyAnswerTimeout}ms, so the frame with the keys probably closed or navigated before they were let go. Press keys like that with pressInPage.`,
    );
  };
  keyboard.down = (key) =>
    answered(down(key), `keyboard.down("${key}")`, [key]);
  keyboard.up = (key) => answered(up(key), `keyboard.up("${key}")`);
  keyboard.press = (key, options) =>
    answered(
      press(key, options),
      `keyboard.press("${key}")`,
      key.split("+").slice(0, -1),
    );
}

/** Runs the command with the title from the command palette. */
export async function runCommand(page: Page, title: string): Promise<void> {
  await page.keyboard.press("Meta+Shift+p");
  const palette = page.getByTestId("command-palette");
  await palette.getByRole("textbox").fill(`>${title}`);
  await palette
    .locator('[data-index="0"]')
    .filter({ hasText: title })
    .waitFor();
  await page.keyboard.press("Enter");
  await palette.waitFor({ state: "hidden" });
}

/**
 * A new temporary home. It's under /tmp so the CLI's socket path stays short,
 * and resolved because macOS reports /tmp paths as /private/tmp.
 */
export function newHome(): string {
  return fs.realpathSync(fs.mkdtempSync("/tmp/conduit-e2e-"));
}

/** Runs a script in a browser pane's page, and returns what it evaluates to. */
export function inWebview<T>(webview: Locator, script: string): Promise<T> {
  return webview.evaluate(
    (webview: Electron.WebviewTag, script) => webview.executeJavaScript(script),
    script,
  );
}

/**
 * Sends a browser pane's page to `url` from inside it, as a link would. The
 * page goes after its script has replied, since a page that commits in
 * another renderer, like another site's or an error page, would drop a reply
 * still on its way.
 */
export async function navigateInWebview(
  webview: Locator,
  url: string,
): Promise<void> {
  await inWebview(
    webview,
    `setTimeout(() => { location.href = ${JSON.stringify(url)} })`,
  );
}

/** Runs git in `cwd` without your global or system config. */
export function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    "git",
    ["-c", "user.name=E2E", "-c", "user.email=e2e@example.com", ...args],
    {
      cwd,
      env: {
        ...process.env,
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
      },
      encoding: "utf8",
    },
  );
}

let terminalCount = 0;
let commandCount = 0;

/**
 * One terminal pane. It stays bound to the same pane when its tab is hidden or
 * the layout changes, because it tags the pane's element.
 */
export class Terminal {
  constructor(
    private page: Page,
    readonly locator: Locator,
  ) {}

  /** The nth visible terminal in the active tab, in document order. */
  static async find(page: Page, index = 0): Promise<Terminal> {
    const id = String(++terminalCount);
    const xterm = page.locator(".xterm").filter({ visible: true }).nth(index);
    await xterm.evaluate((element, id) => {
      (element as HTMLElement).dataset.e2eTerminal ??= id;
    }, id);
    const tag = await xterm.getAttribute("data-e2e-terminal");
    return new Terminal(
      page,
      page.locator(`.xterm[data-e2e-terminal="${tag}"]`),
    );
  }

  /** The terminal's visible rows, without trailing blanks. */
  async text(): Promise<string> {
    const rows = await this.locator
      .locator(".xterm-rows > div")
      .evaluateAll((divs) => divs.map((div) => div.textContent.trimEnd()));
    return rows.join("\n").trimEnd();
  }

  async waitForText(
    pattern: string | RegExp,
    timeout = 15_000,
  ): Promise<string> {
    const matches = (text: string) =>
      typeof pattern === "string" ? text.includes(pattern) : pattern.test(text);
    return until(
      async () => {
        const text = await this.text();
        return matches(text) && text;
      },
      `${pattern} in the terminal`,
      timeout,
    );
  }

  /** Whether keystrokes go to this terminal, without clicking it first. */
  async focused(): Promise<boolean> {
    return this.locator
      .locator(".xterm-helper-textarea")
      .evaluate((element) => element === document.activeElement);
  }

  /** Waits for the shell's first prompt. */
  async ready(): Promise<this> {
    await this.waitForText(/%\s*$/m, 30_000);
    return this;
  }

  /**
   * Types into the terminal like a user would. Fails if something takes focus
   * while it types, because the rest of the keys went somewhere else.
   */
  async type(text: string): Promise<void> {
    const input = this.locator.locator(".xterm-helper-textarea");
    const enter = text.endsWith("\n");
    await input.focus();
    await this.page.keyboard.type(enter ? text.slice(0, -1) : text);
    // Before Enter, since a command like `conduit open` moves focus on purpose.
    const focused = await input.evaluate((element) =>
      element === document.activeElement
        ? undefined
        : (document.activeElement?.getAttribute("aria-label") ??
          document.activeElement?.outerHTML.slice(0, 80) ??
          "nothing"),
    );
    if (focused !== undefined) {
      throw new Error(
        `Focus moved to ${focused} while typing ${JSON.stringify(text)}`,
      );
    }
    if (enter) await this.page.keyboard.press("Enter");
  }

  /**
   * Types `command` and Enter, waits for the shell to finish it, and returns
   * its exit code. The marker only matches the output, because the typed line
   * shows `%s` where the output shows the numbers.
   */
  async run(command: string, timeout = 15_000): Promise<number> {
    const id = ++commandCount;
    const marker = new RegExp(`^E2E-${id}-(\\d+)$`, "m");
    await this.type(`${command}; printf 'E2E-%s-%s\\n' ${id} $?\n`);
    const text = await this.waitForText(marker, timeout);
    return Number(text.match(marker)![1]);
  }
}

export interface Conduit {
  /** The isolated home, with symlinks resolved. */
  home: string;
  /** The app's main process, which every other process it starts descends from. */
  pid: number;
  /** The window's page, which is a new object after `reconnect()`. */
  readonly page: Page;
  /** The nth visible terminal in the active tab, once its shell is ready. */
  terminal(index?: number): Promise<Terminal>;
  /**
   * Connects to the window's page again. Playwright can't use a page whose
   * renderer crashed, even once the app has reloaded it.
   */
  reconnect(): Promise<void>;
  /** Uncaught exceptions in the window since launch. */
  pageErrors: string[];
  /** Requests from the window that failed since launch, like a missing asset. */
  failedRequests: string[];
  close(): Promise<void>;
  /**
   * Stops the app the way a crash would, so it saves nothing on its way out,
   * and keeps its home for `launch({ home })`.
   */
  crash(): Promise<void>;
  /**
   * Quits the way ⌘Q does, since Electron handles SIGTERM with `app.quit()`,
   * and keeps its home for `launch({ home })`.
   */
  quit(): Promise<void>;
}

/**
 * `pid` and every process under it. Shells are among them, in sessions of
 * their own outside the app's process group, and only their parentage ties
 * them to the app, since macOS hides a system binary's environment from ps.
 */
export function processTree(pid: number): number[] {
  const pairs = execFileSync("ps", ["-axo", "pid=,ppid="], { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number));
  const tree = [pid];
  for (const parent of tree) {
    for (const [child, ppid] of pairs) if (ppid === parent) tree.push(child!);
  }
  return tree;
}

export function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Every process whose environment has this home, wherever it's parented. */
function processesUsing(home: string): number[] {
  const ps = execFileSync("ps", ["-axwwE", "-o", "pid=,command="], {
    encoding: "utf8",
  });
  return ps
    .split("\n")
    .filter(
      (line) =>
        line.includes(` HOME=${home} `) || line.endsWith(` HOME=${home}`),
    )
    .map((line) => Number.parseInt(line, 10));
}

export async function launch(options: LaunchOptions): Promise<Conduit> {
  const executable = path.join(appPath, "Contents", "MacOS", "Conduit");
  if (!fs.existsSync(executable)) {
    throw new Error(
      `No packaged app at ${appPath}. Run \`bun run package\` first.`,
    );
  }

  const home = options.home ?? newHome();
  if (home === fs.realpathSync(os.homedir())) {
    throw new Error("Refusing to launch Conduit with your own home");
  }
  const files = {
    // A prompt without the host name, which is long on CI runners. zsh erases
    // the line above a prompt that wrapped before its pane resized, which
    // would erase a command's output when a split or focus mode resizes it.
    ".zshrc": "PROMPT='%1~ %# '\n",
    ...options.files,
  };
  for (const [file, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(home, file)), { recursive: true });
    fs.writeFileSync(path.join(home, file), content, {
      mode: content.startsWith("#!") ? 0o755 : 0o644,
    });
  }
  if (options.settings) {
    fs.mkdirSync(path.join(home, ".conduit"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".conduit", "settings.json"),
      JSON.stringify(options.settings),
    );
  }

  const userData = path.join(home, "ud");
  // A crashed launch leaves its port behind.
  fs.rmSync(path.join(userData, "DevToolsActivePort"), { force: true });
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    // Foundation reads this instead of HOME.
    CFFIXED_USER_HOME: home,
    ELECTRON_ENABLE_LOGGING: "1",
    // The scenarios rely on zsh, which CI runners don't always default to.
    SHELL: "/bin/zsh",
  };
  for (const name of leakyEnv) delete env[name];

  const log = fs.openSync(path.join(home, "app.log"), "a");
  const child: ChildProcess = spawn(
    executable,
    [
      // Also sets navigator.webdriver in every page, so Google and other
      // bot-checking sites answer with a CAPTCHA. Check those by hand.
      "--remote-debugging-port=0",
      `--user-data-dir=${userData}`,
      "--use-mock-keychain",
    ],
    // A process group of its own, so close() can stop every helper it starts.
    { cwd: home, detached: true, env, stdio: ["ignore", log, log] },
  );
  fs.closeSync(log);
  // Its group is out of reach of a Ctrl-C, and nothing stops it when this
  // process ends without closing it, after a timeout, a throw or a kill. So
  // a watchdog holds a pipe from this process, and kills the group when the
  // pipe closes, which happens however this process ends. The shells, in
  // sessions of their own, hang up with the app. The watchdog stops with the
  // app, so it can't kill a group that has since reused the app's pid.
  const watchdog = spawn(
    "/bin/sh",
    ["-c", `read _; kill -KILL -- -${child.pid}`],
    {
      detached: true,
      stdio: ["pipe", "ignore", "ignore"],
    },
  );
  child.once("exit", () => watchdog.kill());

  let browser: Browser | undefined;
  let page: Page | undefined;
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];
  /** Set once the app crashed or quit, which leaves its home for a relaunch. */
  let stopped = false;

  /**
   * Waits for the app's processes to exit, and kills any that don't. Takes
   * its tree from before it stopped, since a process leaves the tree once
   * its parent exits.
   */
  async function waitForExit(tree: number[]) {
    const running = () => [
      ...new Set([...tree.filter(isRunning), ...processesUsing(home)]),
    ];
    const exited = await until(
      () => running().length === 0,
      "the app's processes to exit",
      5_000,
    ).catch(() => false);
    if (!exited) {
      const leftovers = running();
      for (const pid of leftovers) process.kill(pid, "SIGKILL");
      throw new Error(`Processes outlived the app: ${leftovers.join(", ")}`);
    }
  }

  async function crash() {
    stopped = true;
    await browser?.close().catch(() => {});
    const tree = processTree(child.pid!);
    process.kill(-child.pid!, "SIGKILL");
    await waitForExit(tree);
  }

  async function quit() {
    stopped = true;
    const tree = processTree(child.pid!);
    child.kill("SIGTERM");
    await until(
      () => child.exitCode !== null || child.signalCode !== null,
      "the app to quit",
      10_000,
    );
    // Only once it has exited, so the page closes because its window did.
    await browser?.close().catch(() => {});
    await waitForExit(tree);
  }

  async function close() {
    if (stopped) return;
    if (artifactsDir && page) {
      fs.mkdirSync(artifactsDir, { recursive: true });
      await page
        .screenshot({ path: path.join(artifactsDir, `${options.name}.png`) })
        .catch(() => {});
      await page
        .context()
        .tracing.stop({
          path: path.join(artifactsDir, `${options.name}.trace.zip`),
        })
        .catch(() => {});
      fs.copyFileSync(
        path.join(home, "app.log"),
        path.join(artifactsDir, `${options.name}.log`),
      );
    }
    await browser?.close().catch(() => {});
    const signalGroup = (signal: NodeJS.Signals) => {
      try {
        process.kill(-child.pid!, signal);
      } catch {}
    };
    const tree = processTree(child.pid!);
    signalGroup("SIGTERM");
    await until(
      () => child.exitCode !== null || child.signalCode !== null,
      "app exit",
      5_000,
    ).catch(() => signalGroup("SIGKILL"));
    await waitForExit(tree);
    if (!process.env.CONDUIT_E2E_KEEP)
      fs.rmSync(home, { recursive: true, force: true });
  }

  try {
    const exitedEarly = new Promise<never>((_, reject) =>
      child.once("exit", (code, signal) =>
        reject(
          new Error(
            `Conduit exited during launch (${code ?? signal}). See ${home}/app.log`,
          ),
        ),
      ),
    );
    exitedEarly.catch(() => {});
    const port = await Promise.race([
      exitedEarly,
      until(
        () =>
          fs
            .readFileSync(path.join(userData, "DevToolsActivePort"), "utf8")
            .split("\n")[0],
        "DevToolsActivePort",
        30_000,
      ),
    ]);
    // Playwright never sees a page whose target appears after it connects, so
    // wait for the window's page first.
    await until(
      async () => {
        const response = await fetch(`http://127.0.0.1:${port}/json/list`);
        const targets = (await response.json()) as {
          type: string;
          url: string;
        }[];
        return targets.some(
          (target) => target.type === "page" && target.url.startsWith("file:"),
        );
      },
      "the window's page",
      30_000,
    );
    const connect = async () => {
      await browser?.close().catch(() => {});
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, {
        noDefaults: options.noDefaults,
      });
      const found = browser
        .contexts()
        .flatMap((context) => context.pages())
        .find((candidate) => candidate.url().startsWith("file:"))!;
      found.setDefaultTimeout(15_000);
      answerKeys(found.keyboard);
      found.on("pageerror", (error) =>
        pageErrors.push(String(error.stack ?? error)),
      );
      found.on("requestfailed", (request) =>
        failedRequests.push(`${request.url()} ${request.failure()?.errorText}`),
      );
      // Snapshots of the window before and after each step, and a video of it.
      // A reconnect starts a new trace, so it only has what follows a crash.
      if (artifactsDir) {
        await found
          .context()
          .tracing.start({ snapshots: true, screenshots: true });
      }
      await found.waitForFunction(() => "conduit" in window, null, {
        timeout: 30_000,
      });
      page = found;
    };
    await connect();
    // A feature whose startup throws no longer keeps the window from opening,
    // so the log is the only sign of it.
    const failedStartups = fs
      .readFileSync(path.join(home, "app.log"), "utf8")
      .split("\n")
      .filter((line) => /^Feature ".+" didn't start/.test(line));
    if (failedStartups.length > 0) {
      throw new Error(`${failedStartups.join("\n")}\nSee ${home}/app.log`);
    }
    return {
      home,
      pid: child.pid!,
      get page() {
        return page!;
      },
      terminal: async (index = 0) =>
        (await Terminal.find(page!, index)).ready(),
      reconnect: connect,
      pageErrors,
      failedRequests,
      close,
      crash,
      quit,
    };
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
}
