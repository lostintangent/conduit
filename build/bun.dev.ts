/**
 * Dev loop for `bun start` (replaces `electron-forge start` + plugin-vite).
 *
 *   - Renderer: Bun's dev server with HMR and React Fast Refresh. Tailwind
 *     comes from bunfig.toml's [serve.static] plugins.
 *   - Main, CLI and preloads: rebuilt on any change under src/ outside
 *     src/renderer, then Electron restarts. Type `rs` to restart manually.
 *
 * Arguments after `bun start` are passed through to Electron.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { watch } from "node:fs";
import path from "node:path";
import electronBinary from "electron";
import index from "../src/renderer/index.html";
import {
  buildCli,
  buildMain,
  buildMonacoWorkers,
  buildPreloads,
  copyKatex,
  katexDir,
  monacoWorkerDir,
} from "./bun.build";
import { makeSpawnHelperExecutable } from "./scripts/spawn-helper";

const root = path.resolve(import.meta.dir, "..");
// Outside Electron, the electron package exports the binary's path.
const electronPath = electronBinary as unknown as string;

makeSpawnHelperExecutable(root);

await Promise.all([buildMonacoWorkers({ dev: true }), copyKatex()]);

// Any free port, so concurrent dev loops don't collide.
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  development: { hmr: true, console: true },
  routes: {
    "/": index,
    "/monaco/:file": (req) =>
      new Response(
        Bun.file(path.join(monacoWorkerDir, path.basename(req.params.file))),
      ),
    "/katex/katex.min.css": () =>
      new Response(Bun.file(path.join(katexDir, "katex.min.css"))),
    "/katex/fonts/:file": (req) =>
      new Response(
        Bun.file(path.join(katexDir, "fonts", path.basename(req.params.file))),
      ),
  },
});
const devServerUrl = server.url.href;

// Returns a hash of the emitted code so unchanged rebuilds skip the restart.
async function buildBackend() {
  const results = await Promise.all([
    buildMain({ dev: true, devServerUrl }),
    buildCli({ dev: true }),
    buildPreloads({ dev: true }),
  ]);
  const outputs = results.flat().flatMap((result) => result.outputs);
  const code = await Promise.all(outputs.map((output) => output.text()));
  return Bun.hash(code.join("\0"));
}

let electron: ChildProcess | undefined;

function startElectron() {
  const child = spawn(electronPath, [root, ...process.argv.slice(2)], {
    stdio: "inherit",
  });
  child.on("exit", (code) => {
    if (electron !== child) return;
    server.stop();
    process.exit(code ?? 0);
  });
  electron = child;
}

async function restartElectron() {
  const previous = electron;
  electron = undefined;
  if (previous && previous.exitCode === null) {
    const exited = once(previous, "exit");
    previous.kill();
    await exited;
  }
  startElectron();
}

let builtHash: bigint | number | undefined;
let pending: Promise<void> = Promise.resolve();
function rebuildAndRestart(force = false) {
  pending = pending.then(async () => {
    const started = performance.now();
    let hash: bigint | number;
    try {
      hash = await buildBackend();
    } catch (error) {
      console.error(error);
      return;
    }
    if (hash === builtHash && !force) return;
    builtHash = hash;
    console.log(
      `[dev] main rebuilt in ${Math.round(performance.now() - started)}ms, restarting Electron`,
    );
    await restartElectron();
  });
}

let debounce: Timer | undefined;
watch(path.join(root, "src"), { recursive: true }, (_event, file) => {
  if (!file || file.startsWith(`renderer${path.sep}`)) return;
  if (/\.test\.tsx?$/.test(file)) return;
  clearTimeout(debounce);
  debounce = setTimeout(() => rebuildAndRestart(), 50);
});

process.stdin.on("data", (data) => {
  if (data.toString().trim() === "rs") rebuildAndRestart(true);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    electron?.kill(signal);
    process.exit(0);
  });
}

builtHash = await buildBackend();
startElectron();
console.log(`[dev] renderer at ${server.url}, watching src/ for main changes`);
