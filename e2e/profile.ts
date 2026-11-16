// Profiles a realistic session in the packaged app: tab switches, a splitter
// drag, typing echo and output throughput in a terminal, scrolling a browser
// pane, and idle CPU and memory per process. It isn't a test, and CI doesn't
// run it. Run `bun run profile` after `bun run package`, before and after a
// change, and compare the summaries.
//
// It writes summary.md, results.json with every sample, and CPU profiles of
// the window during the tab switches and the splitter drag, which open in
// Chrome DevTools. They go to CONDUIT_PROFILE_OUT, or to a temporary folder.
//
// Where the noise comes from:
// - A click lands anywhere in a 16.7ms frame, so the time to the next paint
//   varies by up to a frame on its own, and so can a p50 between runs.
// - The browser panes load real sites, which change and come over the network,
//   so their memory, long frames and scrolling vary between runs.
// - Anything else running on the machine shows up in every number, and most in
//   idle CPU, which moves by a few points between launches. To check a small
//   change, compare several runs each side.
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  git,
  inWebview,
  launch,
  newHome,
  processTree,
  type Terminal,
  until,
} from "./app";

const repoRoot = path.resolve(import.meta.dirname, "..");
const out =
  process.env.CONDUIT_PROFILE_OUT ??
  fs.mkdtempSync(path.join(os.tmpdir(), "conduit-profile-"));
fs.mkdirSync(out, { recursive: true });
const rounds = 10;
const idleSeconds = 30;
const size = { width: 1440, height: 900 };

// A project of Conduit's own source, with a 27k-line file and a 20MB log.
const home = newHome();
const project = path.join(home, "project");
fs.cpSync(path.join(repoRoot, "src"), path.join(project, "src"), {
  recursive: true,
});
const bigFile = path.join(project, "types.d.ts");
fs.copyFileSync(
  path.join(repoRoot, "node_modules/playwright-core/types/types.d.ts"),
  bigFile,
);
git(project, "init", "-q");
git(project, "add", "-A");
git(project, "commit", "-qm", "init");
const logLines = Array.from(
  { length: 220_000 },
  (_, i) =>
    `2026-11-16T04:${String(i % 60).padStart(2, "0")}:00.${String(i % 1000).padStart(3, "0")}Z INFO [worker-${i % 16}] GET /api/items?page=${i} 200 ${i % 90}ms`,
);
fs.writeFileSync(path.join(project, "big.log"), `${logLines.join("\n")}\n`);

// The session: a shell, a dev server streaming logs beside an idle shell, a
// tab of four splits, two browser tabs, and an editor with the 27k-line file.
const streamLogs = `while [ ! -e ~/.stop-stream ]; do print -rP "%D{%H:%M:%S.%.} GET /api/items?page=$RANDOM 200 $((RANDOM % 90))ms"; sleep 0.1; done`;
const mdn = browser("https://developer.mozilla.org/en-US/docs/Web/API/Element");
const github = browser(
  "https://github.com/microsoft/vscode/blob/main/src/vs/editor/common/model/textModel.ts",
);
const docs = browser("https://www.electronjs.org/docs/latest/api/web-contents");
const tabs: Record<string, Layout> = {
  shell: terminal(),
  server: row(terminal(streamLogs), terminal()),
  split: row(column(terminal(), terminal()), column(mdn, editor())),
  github,
  docs,
  editor: editor(bigFile),
};

const app = await launch({
  name: "profile",
  home,
  files: {
    ".conduit/workspaces.json": JSON.stringify({
      workspaces: [],
      untitled: {
        lastModified: 0,
        activeTabId: "shell",
        tabs: Object.entries(tabs).map(([name, layout]) =>
          savedTab(name, layout),
        ),
      },
    }),
    // Where Electron restores the window's size from
    "ud/Local State": JSON.stringify({
      windowStates: {
        main: {
          left: 0,
          top: 0,
          right: size.width,
          bottom: size.height,
          workAreaLeft: 0,
          workAreaTop: 0,
          workAreaRight: size.width,
          workAreaBottom: size.height,
          maximized: false,
          fullscreen: false,
          kiosk: false,
        },
      },
    }),
  },
});
const { page } = app;
const cdp = await page.context().newCDPSession(page);
const results: Record<string, unknown> = {};
const measures: string[][] = [];
await watchLongFrames();

// Opens each tab once, which creates its panes, so the switches below go
// between tabs that already exist.
for (const name of ["server", "split", "github", "docs", "editor", "shell"]) {
  await open(name);
}
const renderers = await findRenderers();
const viewport = await page.evaluate(() => ({
  width: innerWidth,
  height: innerHeight,
}));
results.window = viewport;

// Tab switches. Each tab is always reached from the one before it in `order`,
// so its row includes the cost of leaving that tab. That's why docs, which
// follows the editor, once looked slow.
const order = ["github", "shell", "editor", "docs", "split", "server"];
const kinds: Record<string, string[]> = {
  terminal: ["shell", "server"],
  split: ["split"],
  browser: ["github", "docs"],
  editor: ["editor"],
};
const switches: Record<string, Switch[]> = {};
await profiled("tab-switches", async () => {
  for (let round = 0; round < rounds; round++) {
    for (const name of order) {
      (switches[name] ??= []).push(await switchTab(name));
    }
  }
});
results.switches = switches;
for (const [kind, names] of Object.entries(kinds)) {
  const samples = names.flatMap((name) => switches[name]);
  const long = samples.flatMap((sample) => sample.longFrames);
  const longest = Math.max(0, ...long.map((frame) => frame.duration));
  measures.push([
    `Tab switch: ${kind}`,
    spread(samples.map((sample) => sample.paint)),
    `${long.length} long frames in ${samples.length} switches${long.length ? `, longest ${ms(longest)}` : ""}`,
  ]);
}

// Splitter drag: the split tab's splitter, beside MDN's page, 200px left and
// back 5 times. It has no role or name, and it comes before the empty
// editor's file tree handle, which has the same classes.
await switchTab("split");
const handle = (await page
  .locator("div.cursor-col-resize.w-1.h-full")
  .filter({ visible: true })
  .first()
  .boundingBox())!;
const drag = await profiled("splitter-drag", async () => {
  const stop = await recordFrames(inWindow);
  const x = handle.x + handle.width / 2;
  const y = handle.y + handle.height / 2;
  for (let i = 0; i < 5; i++) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (const offset of [
      ...Array.from({ length: 40 }, (_, step) => (step + 1) * 5),
      ...Array.from({ length: 40 }, (_, step) => 195 - step * 5),
    ]) {
      await page.mouse.move(x - offset, y);
      // About a move a frame, like a hand on a mouse
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    // A pause, so each drag is a gesture of its own
    await page.waitForTimeout(300);
  }
  return stop();
});
const dragLongFrames = await longFrames(drag.start);
results.drag = { ...drag, longFrames: dragLongFrames };
measures.push([
  "Splitter drag, frame interval",
  spread(drag.intervals),
  `${drag.dropped} of ${drag.frames} frames dropped, ${dragLongFrames.length} long frames`,
]);

// Terminal: typing echo, then output throughput
await switchTab("shell");
const shell = await app.terminal();
const keys = "echo the quick brown fox jumps over it";
await recordEchoes(shell);
await shell.locator.locator(".xterm-helper-textarea").focus();
// A fast typist's pace, slow enough that each key's echo paints on its own
await page.keyboard.type(keys, { delay: 80 });
await page.waitForFunction(
  (count) => window.conduitProfile.echoes.length === count,
  keys.length,
);
const echoes = await page.evaluate(() => window.conduitProfile.echoes);
await page.keyboard.press("Control+U");
results.echoes = echoes;
measures.push([
  "Terminal typing echo",
  spread(echoes),
  `${echoes.length} keys`,
]);

const throughput: Record<string, unknown> = {};
for (const [name, command] of [
  ["2M lines of yes", "yes | head -n 2000000"],
  ["cat of a 20MB log", "cat big.log"],
]) {
  const start = Date.now();
  // The shell times the command too, which tells its time from the terminal's
  const usage = await cpu(() =>
    shell.run(
      `zmodload zsh/datetime; s=$EPOCHREALTIME; ${command}; print "shell-ms $(( (EPOCHREALTIME - s) * 1000 ))"`,
      180_000,
    ),
  );
  const wallMs = Date.now() - start;
  const shellMs = Number((await shell.text()).match(/shell-ms ([\d.]+)/)![1]);
  throughput[name] = { wallMs, shellMs, cpu: usage };
  measures.push([
    `Terminal: ${name}`,
    `${ms(wallMs)} on screen`,
    `the shell took ${ms(shellMs)}, CPU window ${usage.window}%, main ${usage.main}%, GPU ${usage.gpu}%`,
  ]);
  await shell.run("clear");
}
results.throughput = throughput;

// Browser: wheel-scroll GitHub's page down and back up, with its frames timed
// inside the page.
await switchTab("github");
const box = (await webviewOf(github).boundingBox())!;
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
const scrolls: Record<string, unknown> = {};
for (const [direction, delta] of [
  ["down", 60],
  ["up", -60],
] as const) {
  const stop = await recordFrames(inPage(github));
  for (let i = 0; i < 120; i++) {
    await page.mouse.wheel(0, delta);
    // About a notch a frame, like a quick spin of the wheel
    await page.waitForTimeout(16);
  }
  const frames = await stop();
  scrolls[direction] = frames;
  measures.push([
    `Browser: wheel ${direction} GitHub, frame interval`,
    spread(frames.intervals),
    `${frames.dropped} of ${frames.frames} frames dropped, scrolled ${frames.scrolled}px`,
  ]);
}
results.scrolls = scrolls;

// Idle, on the shell tab while the server tab streams, then once it's quiet
await switchTab("shell");
// So what the scenarios started, like a page loading what scrolling showed,
// has finished and doesn't count as idle
await page.waitForTimeout(3000);
const idle: Record<string, Record<string, number>> = {};
idle.streaming = await idleFor(idleSeconds);
fs.writeFileSync(path.join(home, ".stop-stream"), "");
// The server's tab shows it's running until 2s after its last output
await page.waitForTimeout(2500);
idle.quiet = await idleFor(idleSeconds);
results.idle = idle;

const memory = footprints();
results.memory = memory;

const summary = [
  `Window ${viewport.width}x${viewport.height}`,
  "",
  ...table(["Measure", "p50 / p95", "Notes"], measures),
  "",
  ...table(
    ["Process", "Idle CPU, streaming", "Idle CPU, quiet", "Memory"],
    Object.keys(memory)
      .sort()
      .map((name) => [
        name,
        `${idle.streaming[name] ?? 0}%`,
        `${idle.quiet[name] ?? 0}%`,
        `${Math.round(memory[name])}MB`,
      ]),
  ),
].join("\n");
fs.writeFileSync(
  path.join(out, "results.json"),
  JSON.stringify(results, null, 2),
);
fs.writeFileSync(path.join(out, "summary.md"), `${summary}\n`);
console.log(`${summary}\n\nResults and CPU profiles are in ${out}`);
await app.close();

// The session's tabs, as workspaces.json saves them

interface Pane {
  id: string;
  type: "terminal" | "browser" | "editor";
  cwd?: string;
  command?: string;
  url?: string;
  file?: string;
}
type Layout = Pane | { direction: "row" | "column"; children: Layout[] };

function terminal(command?: string): Pane {
  return { id: randomUUID(), type: "terminal", cwd: project, command };
}

function browser(url: string): Pane {
  return { id: randomUUID(), type: "browser", url };
}

function editor(file?: string): Pane {
  return { id: randomUUID(), type: "editor", cwd: project, file };
}

function row(...children: Layout[]): Layout {
  return { direction: "row", children };
}

function column(...children: Layout[]): Layout {
  return { direction: "column", children };
}

/** A layout's panes, in the order they show. */
function panesIn(layout: Layout): Pane[] {
  return "children" in layout ? layout.children.flatMap(panesIn) : [layout];
}

function savedTab(name: string, layout: Layout) {
  const node = (layout: Layout): object =>
    "children" in layout
      ? {
          id: randomUUID(),
          type: "split",
          direction: layout.direction,
          children: layout.children.map(node),
        }
      : { id: `leaf-${layout.id}`, type: "pane", paneId: layout.id };
  const panes = panesIn(layout);
  return {
    id: name,
    name,
    panes,
    activePaneId: panes[0].id,
    layout: node(layout),
  };
}

// Driving the window

function tabNamed(name: string) {
  return page.getByRole("tab", { name: new RegExp(`^${name}\\b`) });
}

function webviewOf(pane: Pane) {
  // A UUID can start with a digit, which an #id selector can't
  return page.locator(`webview[id="${pane.id}"]`);
}

/** Runs a script in the window or a page, and returns what it evaluates to. */
type Run = <T>(script: string) => Promise<T>;

function inWindow<T>(script: string): Promise<T> {
  return page.evaluate(script) as Promise<T>;
}

function inPage(pane: Pane): Run {
  return (script) => inWebview(webviewOf(pane), script);
}

/** Opens a tab, and waits for its shells' prompts and its pages to load. */
async function open(name: string) {
  await tabNamed(name).click();
  const panes = panesIn(tabs[name]);
  const terminals = panes.filter((pane) => pane.type === "terminal");
  for (const [index, pane] of terminals.entries()) {
    // A shell running a command shows its output instead of a prompt
    if (!pane.command) await app.terminal(index);
  }
  for (const pane of panes.filter((pane) => pane.type === "browser")) {
    await until(
      () => inPage(pane)("document.readyState === 'complete'"),
      `${pane.url} to load`,
      30_000,
    );
  }
  if (panes.some((pane) => pane.file)) {
    await page
      .locator(".view-line")
      .filter({ visible: true })
      .first()
      .waitFor();
  }
}

// Measuring in the window and its pages

/** A long animation frame, over 50ms, as the window's observer saw it. */
interface LongFrame {
  startTime: number;
  duration: number;
}

interface Switch {
  /** From the click to the next frame painted after it. */
  paint: number;
  longFrames: LongFrame[];
}

declare global {
  interface Window {
    conduitProfile: {
      longFrames: LongFrame[];
      click?: Promise<{ at: number; paint: number }>;
      echoes: number[];
    };
  }
}

/** Keeps the window's long animation frames, with the scripts that ran in them. */
function watchLongFrames() {
  return page.evaluate(() => {
    const probe: Window["conduitProfile"] = { longFrames: [], echoes: [] };
    window.conduitProfile = probe;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        probe.longFrames.push(entry.toJSON());
      }
    }).observe({ type: "long-animation-frame" });
  });
}

/** The window's long frames that overlap `from` to `to`, in its clock. */
function longFrames(from: number, to = Infinity): Promise<LongFrame[]> {
  return page.evaluate(
    ([from, to]) =>
      window.conduitProfile.longFrames.filter(
        (frame) =>
          frame.startTime + frame.duration > from && frame.startTime < to,
      ),
    [from, to],
  );
}

/**
 * Clicks a tab, and returns the time from the click to the next frame painted
 * after it, and the long frames in the second after the click, which is long
 * enough for anything the switch started.
 */
async function switchTab(name: string): Promise<Switch> {
  // Listens before clicking, so it can't miss the click
  await page.evaluate(() => {
    window.conduitProfile.click = new Promise((resolve) => {
      addEventListener(
        "click",
        (event) =>
          requestAnimationFrame(() => {
            // A task posted from an animation frame runs once it has painted
            const channel = new MessageChannel();
            channel.port1.onmessage = () => {
              const at = event.timeStamp;
              const paint = performance.now() - at;
              setTimeout(
                () => resolve({ at, paint }),
                at + 1000 - performance.now(),
              );
            };
            channel.port2.postMessage(0);
          }),
        { capture: true, once: true },
      );
    });
  });
  // A hand's click lands anywhere in a frame. Playwright's checks would wait
  // for the tab to hold still for two frames and land every click just after
  // one starts, adding most of a frame to every switch.
  await page.waitForTimeout(Math.random() * 16.7);
  await tabNamed(name).click({ force: true });
  const { at, paint } = await page.evaluate(() => window.conduitProfile.click!);
  return { paint, longFrames: await longFrames(at, at + 1000) };
}

/**
 * Starts timing every frame in the window or a page, and returns a function
 * that stops at the first frame that didn't scroll, so a smooth scroll's last
 * frames count. It returns the frame intervals, how many frames they missed
 * at 60Hz, and how far the page scrolled.
 */
async function recordFrames(run: Run) {
  await run(`(() => {
    const recording = (window.__frames = { times: [], from: scrollY });
    const tick = (time) => {
      if (window.__frames !== recording) return;
      recording.times.push(time);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  })()`);
  return async () => {
    const { times, scrolled } = await run<{
      times: number[];
      scrolled: number;
    }>(`new Promise((done) => {
      const recording = window.__frames;
      let y = scrollY;
      const check = () => requestAnimationFrame(() => {
        if (scrollY !== y) return (y = scrollY), check();
        window.__frames = undefined;
        done({ times: recording.times, scrolled: scrollY - recording.from });
      });
      check();
    })`);
    const intervals = times.slice(1).map((time, i) => time - times[i]);
    const dropped = intervals.reduce(
      (sum, interval) => sum + Math.max(0, Math.round(interval / 16.7) - 1),
      0,
    );
    const frames = intervals.length + dropped;
    return { start: times[0], intervals, dropped, frames, scrolled };
  };
}

/**
 * Times each key typed into a terminal to the frame that paints its echo.
 * xterm renders its rows in an animation frame, so a task posted from the
 * first change to them after a keydown runs once that frame has painted.
 */
function recordEchoes(terminal: Terminal) {
  return terminal.locator.evaluate((element) => {
    const { echoes } = window.conduitProfile;
    let typedAt = 0;
    addEventListener("keydown", (event) => (typedAt = event.timeStamp), true);
    new MutationObserver(() => {
      if (!typedAt) return;
      const at = typedAt;
      typedAt = 0;
      const channel = new MessageChannel();
      channel.port1.onmessage = () => echoes.push(performance.now() - at);
      channel.port2.postMessage(0);
    }).observe(element.querySelector(".xterm-rows")!, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
}

/** Writes a CPU profile of the window while `run` runs. */
async function profiled<T>(name: string, run: () => Promise<T>) {
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.start");
  const result = await run();
  const { profile } = await cdp.send("Profiler.stop");
  fs.writeFileSync(
    path.join(out, `${name}.cpuprofile`),
    JSON.stringify(profile),
  );
  return result;
}

// Measuring processes

interface Process {
  pid: number;
  /** CPU time so far, in seconds. */
  cpu: number;
  command: string;
}

/** The app's processes, its shells among them. */
function processes(): Process[] {
  const pids = processTree(app.pid).join(",");
  return execFileSync("ps", ["-ww", "-o", "pid=,time=,command=", "-p", pids], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .map((line) => {
      const [, pid, time, command] = line
        .trim()
        .match(/^(\d+)\s+(\S+)\s+(.*)$/)!;
      const cpu = time
        .split(":")
        .reduce((sum, part) => sum * 60 + Number(part), 0);
      return { pid: +pid, cpu, command };
    });
}

function label({ pid, command }: Process) {
  if (pid === app.pid) return "main";
  if (command.includes("--type=gpu-process")) return "gpu";
  if (command.includes("NetworkService")) return "network";
  if (command.includes("--type=renderer")) {
    return renderers.get(pid) ?? "renderer (other)";
  }
  if (command.includes("--type=")) return "utility";
  return "shells";
}

/**
 * Finds which renderer hosts the window and each page by keeping each busy in
 * turn, since nothing maps a page to its process.
 */
async function findRenderers() {
  const renderers = new Map<number, string>();
  const spin = `(() => { const end = performance.now() + 700; while (performance.now() < end); })()`;
  for (const [name, run] of [
    ["window", inWindow],
    ["browser: github", inPage(github)],
    ["browser: docs", inPage(docs)],
    ["browser: mdn", inPage(mdn)],
  ] as [string, Run][]) {
    const before = processes();
    await run(spin);
    for (const after of processes()) {
      const was = before.find((proc) => proc.pid === after.pid);
      if (was && after.cpu - was.cpu > 0.4) renderers.set(after.pid, name);
    }
  }
  return renderers;
}

/** CPU % of each kind of process while `during` runs, 100% being one core. */
async function cpu(during: () => Promise<unknown>) {
  const before = processes();
  const start = Date.now();
  await during();
  const seconds = (Date.now() - start) / 1000;
  const usage: Record<string, number> = {};
  for (const after of processes()) {
    const was = before.find((proc) => proc.pid === after.pid);
    const name = label(after);
    usage[name] =
      (usage[name] ?? 0) +
      ((after.cpu - (was?.cpu ?? after.cpu)) / seconds) * 100;
  }
  for (const name in usage) usage[name] = +usage[name].toFixed(1);
  return usage;
}

function idleFor(seconds: number) {
  return cpu(() => page.waitForTimeout(seconds * 1000));
}

/** Each kind of process's memory in MB, as Activity Monitor shows it. */
function footprints() {
  const running = processes();
  const pids = running.flatMap(({ pid }) => ["-p", String(pid)]);
  const report = execFileSync(
    "footprint",
    ["--noCategories", "-f", "bytes", ...pids],
    { encoding: "utf8" },
  );
  const memory: Record<string, number> = {};
  for (const [, pid, bytes] of report.matchAll(
    /\[(\d+)\]: .*?Footprint: (\d+) B/g,
  )) {
    const name = label(running.find((proc) => proc.pid === Number(pid))!);
    memory[name] = (memory[name] ?? 0) + Number(bytes) / 2 ** 20;
  }
  return memory;
}

// Statistics

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil((p / 100) * sorted.length) - 1];
}

function ms(value: number) {
  return `${Math.round(value)}ms`;
}

/** The p50 and p95. */
function spread(values: number[]) {
  return `${ms(percentile(values, 50))} / ${ms(percentile(values, 95))}`;
}

function table(header: string[], rows: string[][]) {
  return [header, header.map(() => "---"), ...rows].map(
    (cells) => `| ${cells.join(" | ")} |`,
  );
}
