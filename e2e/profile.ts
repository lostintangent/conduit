// Profiles a realistic session in the packaged app: tab switches, a splitter
// drag, terminal echo and throughput, scrolling a browser pane, and idle CPU
// and memory per process. It isn't a test, and CI doesn't run it. Run it with
// `bun run profile` after `bun run package`, before and after a change. Its
// browser panes load real sites, so expect some noise from the network.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { git, launch, Terminal } from "./app";

const repoRoot = path.resolve(import.meta.dirname, "..");
const out =
  process.env.CONDUIT_PROFILE_OUT ??
  fs.mkdtempSync(path.join(os.tmpdir(), "conduit-profile-"));
fs.mkdirSync(out, { recursive: true });
const idleSeconds = Number(process.env.CONDUIT_PROFILE_IDLE_SECONDS ?? 30);
const rounds = 10;
const size = { width: 1440, height: 900 };

// The session: a shell, a dev server streaming logs next to an idle shell, a
// tab of four splits, two browser tabs, and an editor with a 27k-line file.
const home = fs.realpathSync(fs.mkdtempSync("/tmp/conduit-e2e-"));
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

let paneCount = 0;
const pane = (fields: object) => ({ id: `pane${++paneCount}`, ...fields });
const terminal = (command?: string) =>
  pane({ type: "terminal", cwd: project, ...(command ? { command } : {}) });
const browser = (url: string) => pane({ type: "browser", url });
const editor = (file?: string) =>
  pane({ type: "editor", cwd: project, ...(file ? { file } : {}) });
const leaf = (p: { id: string }) => ({
  id: `leaf-${p.id}`,
  type: "pane",
  paneId: p.id,
});
const split = (direction: "row" | "column", children: object[]) => ({
  id: `split${++paneCount}`,
  type: "split",
  direction,
  children,
});
const tab = (name: string, panes: { id: string }[], layout?: object) => ({
  id: name,
  name,
  panes,
  activePaneId: panes[0].id,
  layout: layout ?? leaf(panes[0]),
});

const stream = `while [ ! -e ~/.stop-stream ]; do print -rP "%D{%H:%M:%S.%.} GET /api/items?page=$RANDOM 200 $((RANDOM % 90))ms"; sleep 0.1; done`;
const shell = terminal();
const server = [terminal(stream), terminal()];
const splits = [
  terminal(),
  terminal(),
  browser("https://developer.mozilla.org/en-US/docs/Web/API/Element"),
  editor(),
];
const github = browser(
  "https://github.com/microsoft/vscode/blob/main/src/vs/editor/common/model/textModel.ts",
);
const docs = browser("https://www.electronjs.org/docs/latest/api/web-contents");
const tabs = [
  tab("shell", [shell]),
  tab("server", server, split("row", server.map(leaf))),
  tab(
    "split",
    splits,
    split("row", [
      split("column", splits.slice(0, 2).map(leaf)),
      split("column", splits.slice(2).map(leaf)),
    ]),
  ),
  tab("github", [github]),
  tab("docs", [docs]),
  tab("editor", [editor(bigFile)]),
];
const webviews: Record<string, string> = {
  github: github.id,
  docs: docs.id,
  mdn: splits[2].id,
};

const app = await launch({
  name: "profile",
  home,
  files: {
    ".conduit/workspaces.json": JSON.stringify({
      workspaces: [],
      untitled: { lastModified: 0, activeTabId: "shell", tabs },
    }),
    // Where Electron restores the window from.
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
const page = app.page;
const results: Record<string, unknown> = {};
const summary: string[] = [];

// Statistics

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length
    ? sorted[
        Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
      ]
    : Number.NaN;
};
const ms = (value: number) => `${Math.round(value)}ms`;
const spread = (values: number[]) =>
  `${ms(percentile(values, 50))} / ${ms(percentile(values, 95))}`;
/** Frame intervals, and how many frames they missed at 60Hz. */
function frames(times: number[]) {
  const intervals = times.slice(1).map((t, i) => t - times[i]);
  const dropped = intervals.reduce(
    (sum, interval) => sum + Math.max(0, Math.round(interval / 16.7) - 1),
    0,
  );
  return {
    intervals,
    dropped,
    text: `${spread(intervals)}, ${dropped} of ${intervals.length + dropped} frames dropped`,
  };
}

// Processes, by walking the tree from the app's main process

interface Process {
  pid: number;
  ppid: number;
  cpu: number;
  rss: number;
  command: string;
}

let mainPid: number | undefined;
function processes(): Process[] {
  const rows = execFileSync(
    "ps",
    ["-axwwo", "pid=,ppid=,time=,rss=,command="],
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .map((line) => {
      const [, pid, ppid, time, rss, command] = line
        .trim()
        .match(/^(\d+)\s+(\d+)\s+(\S+)\s+(\d+)\s+(.*)$/)!;
      const cpu = time
        .split(":")
        .reduce((sum, part) => sum * 60 + Number(part), 0);
      return { pid: +pid, ppid: +ppid, cpu, rss: +rss * 1024, command };
    });
  mainPid ??= rows.find(
    (row) =>
      row.command.includes("Contents/MacOS/Conduit --") &&
      row.command.includes(home),
  )!.pid;
  const tree = new Set([mainPid]);
  for (let grew = true; grew;) {
    grew = false;
    for (const row of rows) {
      if (tree.has(row.ppid) && !tree.has(row.pid)) {
        tree.add(row.pid);
        grew = true;
      }
    }
  }
  return rows.filter((row) => tree.has(row.pid));
}

/** Renderers by what they host, found by keeping each one busy in turn. */
const labels = new Map<number, string>();
function label({ pid, command }: Process) {
  if (pid === mainPid) return "main";
  if (command.includes("--type=gpu-process")) return "gpu";
  if (command.includes("NetworkService")) return "network";
  if (command.includes("--type=renderer")) {
    return labels.get(pid) ?? "renderer (other)";
  }
  if (command.includes("--type=")) return "utility";
  return "shells";
}

async function labelRenderers() {
  const busy = async (name: string, run: () => Promise<unknown>) => {
    const before = processes();
    await run();
    for (const after of processes()) {
      const was = before.find((p) => p.pid === after.pid);
      if (was && after.cpu - was.cpu > 0.4) labels.set(after.pid, name);
    }
  };
  const spin = `{ const end = performance.now() + 700; while (performance.now() < end); 1 }`;
  await busy("window", () =>
    page.evaluate(() => {
      const end = performance.now() + 700;
      while (performance.now() < end);
    }),
  );
  for (const [name, id] of Object.entries(webviews)) {
    await busy(`browser: ${name}`, () =>
      page
        .locator(`webview[id="${id}"]`)
        .evaluate(
          (webview: any, code: string) => webview.executeJavaScript(code),
          spin,
        ),
    );
  }
}

/** CPU % of each kind of process while `during` runs, 100% being one core. */
async function cpu(during: () => Promise<unknown>) {
  const before = processes();
  const start = Date.now();
  await during();
  const elapsed = (Date.now() - start) / 1000;
  const usage: Record<string, number> = {};
  for (const after of processes()) {
    const was = before.find((p) => p.pid === after.pid);
    const name = label(after);
    usage[name] =
      (usage[name] ?? 0) +
      ((after.cpu - (was?.cpu ?? after.cpu)) / elapsed) * 100;
  }
  for (const name in usage) usage[name] = +usage[name].toFixed(1);
  return usage;
}
const idleFor = (seconds: number) =>
  cpu(() => page.waitForTimeout(seconds * 1000));

const cdp = await page.context().newCDPSession(page);
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

async function tabCenter(name: string) {
  const box = (await page
    .getByRole("tab", { name: new RegExp(`^${name}\\b`) })
    .boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// In-page probes. Times are from the input event to the next frame painted
// after it, and long animation frames are the ones over 50ms.

await page.getByRole("tab").first().waitFor();
await page.evaluate(() => {
  const state = { loafs: [] as object[] };
  (globalThis as any).__profile = state;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries() as any[]) {
      state.loafs.push({
        start: entry.startTime,
        duration: entry.duration,
        // From the start of style and layout to the end of the frame
        rendering: entry.styleAndLayoutStart
          ? entry.startTime + entry.duration - entry.styleAndLayoutStart
          : 0,
        scripts: entry.scripts.map((script: any) => ({
          invoker: script.invoker,
          function: script.sourceFunctionName,
          file: script.sourceURL.split("/").pop(),
          at: script.sourceCharPosition,
          duration: Math.round(script.duration),
        })),
      });
    }
  }).observe({ type: "long-animation-frame" });
});

interface Interaction {
  paint: number;
  placed?: number;
  loafs: { duration: number; rendering: number }[];
}

/**
 * Arms a probe for the next `event`, which resolves with the time to the next
 * paint, the time until `webview` is on screen, and the long frames in the
 * second after the event.
 */
async function arm(event: "click", webview?: string) {
  await page.evaluate(
    ({ event, webview }) => {
      const afterPaint = () =>
        new Promise<number>((resolve) =>
          requestAnimationFrame(() => {
            const channel = new MessageChannel();
            channel.port1.onmessage = () => resolve(performance.now());
            channel.port2.postMessage(0);
          }),
        );
      const state = (globalThis as any).__profile;
      state.pending = new Promise((resolve) => {
        addEventListener(
          event,
          async (input) => {
            const at = input.timeStamp;
            const paint = (await afterPaint()) - at;
            let placed: number | undefined;
            const element = webview && document.getElementById(webview);
            while (element && performance.now() - at < 2000) {
              // Checked after each paint, so it was on screen in that one
              if (element.getBoundingClientRect().left >= 0) {
                placed = performance.now() - at;
                break;
              }
              await afterPaint();
            }
            await new Promise((done) => setTimeout(done, 1000));
            const loafs = state.loafs.filter(
              (loaf: any) =>
                loaf.start + loaf.duration > at && loaf.start < at + 1000,
            );
            resolve({ paint, placed, loafs });
          },
          { capture: true, once: true },
        );
      });
    },
    { event, webview },
  );
  return () =>
    page.evaluate(
      () => (globalThis as any).__profile.pending,
    ) as Promise<Interaction>;
}

async function switchTab(name: string) {
  const result = await arm("click", webviews[name]);
  const { x, y } = await tabCenter(name);
  await page.mouse.click(x, y);
  return result();
}

// First visits, which create each tab's panes

const firstVisits: Record<string, unknown> = {};
for (const name of ["server", "split", "github", "docs", "editor", "shell"]) {
  firstVisits[name] = await switchTab(name);
  // Lets the pages load before the next tab hides them.
  await page.waitForTimeout(
    ["split", "github", "docs"].includes(name) ? 6000 : 2000,
  );
}
results.firstVisits = firstVisits;
await labelRenderers();
const viewport = await page.evaluate(() => ({
  width: innerWidth,
  height: innerHeight,
}));
results.window = viewport;
summary.push(
  `Window ${viewport.width}x${viewport.height}`,
  "",
  "| Measure | p50 / p95 | Notes |",
  "|---|---|---|",
);

// Tab switches, to each kind of tab from a different one each time

const kinds: Record<string, string[]> = {
  terminal: ["shell", "server"],
  split: ["split"],
  browser: ["github", "docs"],
  editor: ["editor"],
};
const order = ["github", "shell", "editor", "docs", "split", "server"];
const switches: Record<string, Interaction[]> = {};
await profiled("tab-switches", async () => {
  for (let round = 0; round < rounds; round++) {
    for (const name of order) {
      (switches[name] ??= []).push(await switchTab(name));
      await page.waitForTimeout(300);
    }
  }
});
results.switches = switches;
for (const [kind, names] of Object.entries(kinds)) {
  const samples = names.flatMap((name) => switches[name]);
  const loafs = samples.flatMap((sample) => sample.loafs);
  const placed = samples.flatMap((sample) => sample.placed ?? []);
  const longest = loafs.reduce(
    (max, loaf) => (loaf.duration > max.duration ? loaf : max),
    { duration: 0, rendering: 0 },
  );
  summary.push(
    `| Tab switch: ${kind} | ${spread(samples.map((s) => s.paint))} | ${loafs.length} long frames in ${samples.length} switches${loafs.length ? `, longest ${ms(longest.duration)} with ${ms(longest.rendering)} in style, layout and paint` : ""}${placed.length ? `, page on screen ${spread(placed)}` : ""} |`,
  );
}

// Splitter drag, 200px and back at 60 moves a second

await switchTab("split");
await page.waitForTimeout(1000);
const handle = (await page
  .locator("div.cursor-col-resize.w-1.h-full")
  .filter({ visible: true })
  .first()
  .boundingBox())!;
const drag = await profiled("splitter-drag", async () => {
  await page.evaluate(() => {
    const state = (globalThis as any).__profile;
    state.frames = [];
    state.dragging = true;
    state.dragStart = performance.now();
    const tick = (time: number) => {
      state.frames.push(time);
      if (state.dragging) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
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
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);
  }
  return page.evaluate(() => {
    const state = (globalThis as any).__profile;
    state.dragging = false;
    return {
      frames: state.frames as number[],
      loafs: state.loafs.filter(
        (loaf: any) => loaf.start + loaf.duration > state.dragStart,
      ),
    };
  });
});
const dragFrames = frames(drag.frames);
results.drag = { ...dragFrames, loafs: drag.loafs };
summary.push(
  `| Splitter drag, frame interval | ${dragFrames.text.replace(", ", " | ")}, ${drag.loafs.length} long frames |`,
);

// Terminal: typing echo, then throughput

await switchTab("shell");
const term = await (await Terminal.find(page)).ready();
await term.locator.evaluate((element) => {
  const state = (globalThis as any).__profile;
  state.echoes = [];
  let pending = 0;
  addEventListener("keydown", (event) => (pending = event.timeStamp), true);
  // xterm renders rows in an animation frame, so a task posted from there
  // runs once that frame has painted.
  new MutationObserver(() => {
    if (!pending) return;
    const at = pending;
    pending = 0;
    const channel = new MessageChannel();
    channel.port1.onmessage = () => state.echoes.push(performance.now() - at);
    channel.port2.postMessage(0);
  }).observe(element.querySelector(".xterm-rows")!, {
    subtree: true,
    childList: true,
    characterData: true,
  });
});
await term.locator.locator(".xterm-helper-textarea").focus();
await page.keyboard.type("echo the quick brown fox jumps over it", {
  delay: 80,
});
await page.waitForTimeout(500);
const echoes: number[] = await page.evaluate(
  () => (globalThis as any).__profile.echoes,
);
await page.keyboard.press("Control+U");
results.echoes = echoes;
summary.push(
  `| Terminal typing echo | ${spread(echoes)} | ${echoes.length} keys |`,
);

const throughput: Record<string, unknown> = {};
for (const [name, command] of [
  ["2M lines of yes", "yes | head -n 2000000"],
  ["cat of a 20MB log", "cat big.log"],
]) {
  const start = Date.now();
  let shellMs = 0;
  const percent = await cpu(async () => {
    await term.run(
      `zmodload zsh/datetime; s=$EPOCHREALTIME; ${command}; print "shell-ms $(( (EPOCHREALTIME - s) * 1000 ))"`,
      180_000,
    );
    shellMs = Number((await term.text()).match(/shell-ms ([\d.]+)/)![1]);
  });
  const wallMs = Date.now() - start;
  throughput[name] = { wallMs, shellMs, cpu: percent };
  summary.push(
    `| Terminal: ${name} | ${ms(wallMs)} on screen | the shell took ${ms(shellMs)}, CPU window ${percent.window}%, main ${percent.main}%, GPU ${percent.gpu}% |`,
  );
  await term.run("clear");
}
results.throughput = throughput;

// Browser: scroll the GitHub page with the wheel, measured inside the page

await switchTab("github");
await page.waitForTimeout(1500);
const view = page.locator(`webview[id="${github.id}"]`);
const box = (await view.boundingBox())!;
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
const scrolls: Record<string, unknown> = {};
for (const [direction, delta] of [
  ["down", 60],
  ["up", -60],
] as const) {
  await view.evaluate((webview: any) =>
    webview.executeJavaScript(`{
      window.__frames = []; window.__from = scrollY; const run = window.__run = {};
      const tick = (time) => { __frames.push(time); if (__run === run) requestAnimationFrame(tick); };
      requestAnimationFrame(tick); 1 }`),
  );
  for (let i = 0; i < 120; i++) {
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(300);
  const result: { frames: number[]; scrolled: number } = await view.evaluate(
    (webview: any) =>
      webview.executeJavaScript(
        `__run = null; ({ frames: __frames, scrolled: scrollY - __from })`,
      ),
  );
  const scrolled = frames(result.frames);
  scrolls[direction] = { ...scrolled, scrolled: result.scrolled };
  summary.push(
    `| Browser: wheel ${direction} GitHub, frame interval | ${scrolled.text.replace(", ", " | ")}, scrolled ${result.scrolled}px |`,
  );
}
results.scrolls = scrolls;

// Idle, on the shell tab with the server tab streaming, then with it quiet,
// then with the window just wide enough for the tabs but not the buttons after
// them, which is where the tab strip can keep changing its mind.

await switchTab("shell");
await page.waitForTimeout(3000);
const idle: Record<string, Record<string, number>> = {};
idle.streaming = await idleFor(idleSeconds);
fs.writeFileSync(path.join(home, ".stop-stream"), "");
await page.waitForTimeout(2000);
idle.quiet = await idleFor(idleSeconds);
await profiled("idle", () => page.waitForTimeout(10_000));

const edge = await page.evaluate(() => {
  const strip = document.querySelector('[role="tablist"]')!;
  const left = strip.getBoundingClientRect().left;
  const tabs = [...strip.querySelectorAll('[role="tab"]')];
  const tabsEnd = tabs.at(-1)!.getBoundingClientRect().right - left;
  const end = strip.lastElementChild!.getBoundingClientRect().right - left;
  return innerWidth - strip.clientWidth + Math.round((tabsEnd + end) / 2);
});
await cdp.send("Emulation.setDeviceMetricsOverride", {
  width: edge,
  height: viewport.height,
  deviceScaleFactor: 0,
  mobile: false,
});
await page.waitForTimeout(2000);
const churn: number = await page.evaluate(async () => {
  let mutations = 0;
  const observer = new MutationObserver((list) => (mutations += list.length));
  observer.observe(document.querySelector('[role="tablist"]')!.parentElement!, {
    subtree: true,
    childList: true,
  });
  await new Promise((done) => setTimeout(done, 2000));
  observer.disconnect();
  return mutations / 2;
});
idle.edge = await idleFor(Math.min(idleSeconds, 15));
await cdp.send("Emulation.clearDeviceMetricsOverride");

const memory: Record<string, number> = {};
const footprints = new Map<number, number>();
const running = processes();
const report = execFileSync(
  "footprint",
  [
    "--noCategories",
    "-f",
    "bytes",
    ...running.flatMap(({ pid }) => ["-p", String(pid)]),
  ],
  { encoding: "utf8" },
);
for (const [, pid, bytes] of report.matchAll(
  /\[(\d+)\]: .*?Footprint: (\d+) B/g,
)) {
  footprints.set(Number(pid), Number(bytes));
}
for (const proc of running) {
  const name = label(proc);
  memory[name] =
    (memory[name] ?? 0) + (footprints.get(proc.pid) ?? 0) / 2 ** 20;
}
results.idle = { ...idle, edgeWidth: edge, edgeMutationsPerSecond: churn };
results.memory = memory;
summary.push(
  "",
  `| Process | Idle CPU, streaming | Idle CPU, quiet | Idle CPU at the tab strip's edge, ${edge}px | Memory |`,
  "|---|---|---|---|---|",
);
for (const name of Object.keys(memory).sort()) {
  const percent = (phase: string) => `${idle[phase][name] ?? 0}%`;
  summary.push(
    `| ${name} | ${percent("streaming")} | ${percent("quiet")} | ${percent("edge")} | ${Math.round(memory[name])}MB |`,
  );
}
summary.push(
  "",
  `At ${edge}px wide the tab strip changed ${churn} times a second while idle.`,
);

fs.writeFileSync(
  path.join(out, "results.json"),
  JSON.stringify(results, null, 2),
);
fs.writeFileSync(path.join(out, "summary.md"), `${summary.join("\n")}\n`);
console.log(`${summary.join("\n")}\n\nResults and CPU profiles are in ${out}`);
await app.close();
