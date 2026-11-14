/**
 * Bun build for every Conduit bundle. Replaces @electron-forge/plugin-vite and
 * the five build/vite.*.config.ts files. Electron Forge still owns packaging.
 *
 *   bun build/bun.build.ts        production build into dist/
 *   import { buildMain, ... }     used by build/bun.dev.ts for the dev loop
 *
 * Main, the CLI and both preloads go to dist/main/, and the renderer to
 * dist/renderer/. main.ts, the CLI launcher and forge.config.ts depend on
 * this layout.
 */
import type { BuildConfig } from "bun";
import tailwind from "./bun.tailwind";
import { cp, rm } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const distDir = path.join(root, "dist");
const mainDir = path.join(distDir, "main");
const rendererDir = path.join(distDir, "renderer");
export const monacoWorkerDir = path.join(rendererDir, "monaco");
export const katexDir = path.join(rendererDir, "katex");

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
    outdir: mainDir,
    target: "node",
    format: "cjs",
    external: nodeExternals,
    minify: !dev,
    sourcemap: dev ? "inline" : "none",
    banner: runtimePaths.banner,
    define: {
      ...runtimePaths.define,
      RENDERER_DEV_SERVER_URL: devServerUrl
        ? JSON.stringify(devServerUrl)
        : "undefined",
    },
  });
}

export function buildCli({ dev = false }: Options = {}) {
  return run("cli", {
    entrypoints: [path.join(root, "src/cli/index.ts")],
    outdir: mainDir,
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
        outdir: mainDir,
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

// KaTeX's stylesheet and fonts are copied as plain files that MarkdownPreview
// links. Bun hoists every CSS import into the startup stylesheet, even behind
// import(), and inlines fonts under 128 KB, so importing it would put all 60
// fonts (1.4 MB) in front of first paint. Only the woff2 fonts are copied,
// since Chromium never falls back to the woff and ttf sources after them.
export async function copyKatex() {
  const katex = path.join(root, "node_modules/katex/dist");
  await cp(
    path.join(katex, "katex.min.css"),
    path.join(katexDir, "katex.min.css"),
  );
  await cp(path.join(katex, "fonts"), path.join(katexDir, "fonts"), {
    recursive: true,
    filter: (file) => !/\.(woff|ttf)$/.test(file),
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
    naming: {
      entry: "[dir]/[name].[ext]",
      chunk: "assets/[name]-[hash].[ext]",
      asset: "assets/[name]-[hash].[ext]",
    },
    plugins: [tailwind],
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    // Bun only compiles .tsx and .jsx files, and its dev server doesn't
    // compile yet, so dev runs the uncompiled components.
    reactCompiler: true,
  });
}

if (import.meta.main) {
  const started = performance.now();
  await rm(distDir, { recursive: true, force: true });
  const results = await Promise.all([
    buildMain(),
    buildCli(),
    buildPreloads(),
    buildRenderer(),
  ]);
  await Promise.all([buildMonacoWorkers(), copyKatex()]);
  const files = results.flat().flatMap((r) => r.outputs).length;
  console.log(
    `Built ${files} files in ${Math.round(performance.now() - started)}ms`,
  );
}
