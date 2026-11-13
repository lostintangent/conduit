/**
 * Bun build for every Conduit bundle. Replaces @electron-forge/plugin-vite and
 * the five build/vite.*.config.ts files. Electron Forge still owns packaging.
 *
 *   bun build/bun.build.ts        production build into .vite/
 *   import { buildMain, ... }     used by build/bun.dev.ts for the dev loop
 *
 * Output layout is unchanged from plugin-vite, so main.ts, the CLI launcher
 * and forge.config.ts keep their existing paths.
 */
import type { BuildConfig } from "bun";
import tailwind from "./bun.tailwind";
import { rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
export const buildDir = path.join(root, ".vite/build");
export const rendererDir = path.join(root, ".vite/renderer/main_window");
export const monacoWorkerDir = path.join(rendererDir, "monaco");

// Native modules stay external and are resolved from
// node_modules at runtime (packageAfterCopy installs them into the app).
const nodeExternals = [
  "electron",
  "node-pty",
  "@parcel/watcher",
  "@vscode/ripgrep",
];

// Bun inlines `__dirname`/`__filename` as the build machine's source paths.
// Main code resolves preloads, the renderer and native binaries relative to
// the bundle at runtime, so route both through Node's own module wrapper.
const runtimePaths = {
  define: { __dirname: "__bundleDirname", __filename: "__bundleFilename" },
  banner: "var __bundleDirname = __dirname, __bundleFilename = __filename;",
};

type Options = { dev?: boolean; devServerUrl?: string };

async function run(name: string, config: BuildConfig) {
  const result = await Bun.build(config);
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    throw new Error(`Bun build failed for ${name}`);
  }
  return result;
}

// Main process and CLI: CommonJS for Electron's Node (same as plugin-vite).
export function buildMain({ dev = false, devServerUrl }: Options = {}) {
  return run("main", {
    entrypoints: [path.join(root, "src/main.ts")],
    outdir: buildDir,
    target: "node",
    format: "cjs",
    external: nodeExternals,
    minify: !dev,
    sourcemap: dev ? "inline" : "none",
    banner: runtimePaths.banner,
    define: {
      ...runtimePaths.define,
      MAIN_WINDOW_VITE_DEV_SERVER_URL: devServerUrl
        ? JSON.stringify(devServerUrl)
        : "undefined",
      MAIN_WINDOW_VITE_NAME: JSON.stringify("main_window"),
    },
  });
}

export function buildCli({ dev = false }: Options = {}) {
  return run("cli", {
    entrypoints: [path.join(root, "src/cli/index.ts")],
    outdir: buildDir,
    naming: "cli.js",
    target: "node",
    format: "cjs",
    external: ["electron"],
    minify: !dev,
    ...runtimePaths,
  });
}

// Sandboxed preloads: a single CommonJS file whose only require is electron.
export function buildPreloads({ dev = false }: Options = {}) {
  return Promise.all(
    [
      ["src/preload/window/index.ts", "preload.js"],
      ["src/preload/webview/index.ts", "webview-preload.js"],
    ].map(([entry, naming]) =>
      run(naming, {
        entrypoints: [path.join(root, entry)],
        outdir: buildDir,
        naming,
        target: "browser",
        format: "cjs",
        external: ["electron"],
        minify: !dev,
      }),
    ),
  );
}

// Monaco's language workers are built as standalone module workers and
// loaded by URL from monacoSetup.ts (replaces Vite's `?worker` imports).
export function buildMonacoWorkers({ dev = false }: Options = {}) {
  const workers = path.join(root, "node_modules/monaco-editor/esm/vs");
  return run("monaco workers", {
    entrypoints: [
      `${workers}/editor/editor.worker.js`,
      `${workers}/language/json/json.worker.js`,
      `${workers}/language/typescript/ts.worker.js`,
    ],
    outdir: monacoWorkerDir,
    naming: "[name].[ext]",
    target: "browser",
    format: "esm",
    minify: !dev,
    // TypeScript's Node host references these; keep build paths out of the app.
    define: { __dirname: "undefined", __filename: "undefined" },
  });
}

export function buildRenderer() {
  return run("renderer", {
    entrypoints: [path.join(root, "src/renderer/index.html")],
    outdir: rendererDir,
    target: "browser",
    format: "esm",
    splitting: true,
    minify: true,
    // Bun emits relative URLs (index.html is loaded from file:// in app.asar).
    // `[name]` also avoids a Bun error when katex.min.css is reached via two
    // import paths and yields two identical CSS chunks with the same hash.
    naming: {
      entry: "[dir]/[name].[ext]",
      chunk: "assets/[name]-[hash].[ext]",
      asset: "assets/[name]-[hash].[ext]",
    },
    plugins: [tailwind],
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
  });
}

if (import.meta.main) {
  const started = performance.now();
  await rm(path.join(root, ".vite"), { recursive: true, force: true });
  const results = await Promise.all([
    buildMain(),
    buildCli(),
    buildPreloads(),
    buildRenderer(),
  ]);
  await buildMonacoWorkers();
  const files = results.flat().flatMap((r) => r.outputs).length;
  console.log(
    `Built ${files} files in ${Math.round(performance.now() - started)}ms`,
  );
}
