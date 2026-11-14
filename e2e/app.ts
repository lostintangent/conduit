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
  type Locator,
  type Page,
} from "playwright-core";

const repoRoot = path.resolve(import.meta.dirname, "..");

export const appPath =
  process.env.CONDUIT_E2E_APP ??
  path.join(repoRoot, "out", `Conduit-darwin-${process.arch}`, "Conduit.app");

// CI sets this to upload each launch's last screenshot and app log.
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
}

type Truthy<T> = Exclude<T, false | 0 | "" | null | undefined>;

/** Polls `check` until it returns a truthy value, and returns that value. */
export async function until<T>(
  check: () => T | Promise<T>,
  what: string,
  timeout = 15_000,
): Promise<Truthy<T>> {
  const deadline = Date.now() + timeout;
  let last: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value as Truthy<T>;
      last = value;
    } catch (error) {
      last = error;
    }
    await delay(100);
  }
  throw new Error(
    `Timed out after ${timeout}ms waiting for ${what} (last: ${last})`,
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
}

/**
 * Every process whose environment has this home, including shells, which
 * node-pty starts in their own sessions outside the app's process group.
 */
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

  // Under /tmp so the CLI's socket path stays short, and resolved because
  // macOS reports /tmp paths as /private/tmp.
  const home = fs.realpathSync(fs.mkdtempSync("/tmp/conduit-e2e-"));
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
      "--remote-debugging-port=0",
      `--user-data-dir=${userData}`,
      "--use-mock-keychain",
    ],
    // A process group of its own, so close() can stop every helper it starts.
    { cwd: home, detached: true, env, stdio: ["ignore", log, log] },
  );
  fs.closeSync(log);

  let browser: Browser | undefined;
  let page: Page | undefined;
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  async function close() {
    if (artifactsDir && page) {
      fs.mkdirSync(artifactsDir, { recursive: true });
      await page
        .screenshot({ path: path.join(artifactsDir, `${options.name}.png`) })
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
    signalGroup("SIGTERM");
    await until(
      () => child.exitCode !== null || child.signalCode !== null,
      "app exit",
      5_000,
    ).catch(() => signalGroup("SIGKILL"));
    const exited = await until(
      () => processesUsing(home).length === 0,
      "the app's processes to exit",
      5_000,
    ).catch(() => false);
    if (!exited) {
      const leftovers = processesUsing(home);
      for (const pid of leftovers) process.kill(pid, "SIGKILL");
      throw new Error(`Processes outlived the app: ${leftovers.join(", ")}`);
    }
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
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
      const found = browser
        .contexts()
        .flatMap((context) => context.pages())
        .find((candidate) => candidate.url().startsWith("file:"))!;
      found.setDefaultTimeout(15_000);
      found.on("pageerror", (error) =>
        pageErrors.push(String(error.stack ?? error)),
      );
      found.on("requestfailed", (request) =>
        failedRequests.push(`${request.url()} ${request.failure()?.errorText}`),
      );
      await found.waitForFunction(() => "conduit" in window, null, {
        timeout: 30_000,
      });
      page = found;
    };
    await connect();
    return {
      home,
      get page() {
        return page!;
      },
      terminal: async (index = 0) =>
        (await Terminal.find(page!, index)).ready(),
      reconnect: connect,
      pageErrors,
      failedRequests,
      close,
    };
  } catch (error) {
    await close().catch(() => {});
    throw error;
  }
}
