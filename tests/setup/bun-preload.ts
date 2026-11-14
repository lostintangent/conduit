import type { Window as HappyDOMWindow } from "happy-dom";
import path from "node:path";
import { plugin } from "bun";
import { afterAll, beforeEach } from "bun:test";
import { holdEarlyChildExits } from "./spawn";

// Monaco doesn't load in happy-dom, so tests get these mocks instead:
// monaco-mock.ts for the package itself and monaco-esm-mock.ts for any subpath
// (CSS, workers, language contributions).
const setupDir = import.meta.dir;
plugin({
  name: "monaco-mocks",
  setup(build) {
    build.onResolve({ filter: /^monaco-editor\/.+/ }, () => ({
      path: path.join(setupDir, "monaco-esm-mock.ts"),
    }));
    build.onResolve({ filter: /^monaco-editor$/ }, () => ({
      path: path.join(setupDir, "monaco-mock.ts"),
    }));
  },
});

// happy-dom doesn't load stylesheets, and by default it fails each one with an
// `error` event, which React reports as uncaught for the stylesheets it manages
// (MarkdownPreview's KaTeX CSS). Electron loads them, so count them as loaded.
(
  window as unknown as HappyDOMWindow
).happyDOM.settings.handleDisabledFileLoadingAsSuccess = true;

// See spawn.ts: a Bun bug can lose a fast child's exit and output.
holdEarlyChildExits();

// Mocks and module state leak between files that share a global, so each file
// needs its own. `bun run test` gets that from --parallel, but plain `bun test`
// runs every file in one global. Stop it before hundreds of tests fail for no
// visible reason.
const testFile = Bun.main;
beforeEach(() => {
  if (Bun.main === testFile) return;
  console.error(
    "\nThese tests need a fresh global for each file. Run `bun run test`, or `bun test --isolate`.\n",
  );
  process.exit(1);
});

// When each file gets a fresh global (--isolate or --parallel), Bun removes a
// happy-dom window's globals before it awaits the window's async close. A 0ms
// timer left by a file's last test, like a TanStack Query change notification,
// runs in that gap and throws "window is not defined". jsdom closes
// synchronously, so it has no gap. Seen on Bun 1.4.4 canary.
// To re-test on a newer Bun, delete this hook and run `bun test --isolate` on
// two files whose only test calls `setTimeout(() => window.event, 0)`. Each
// file reports "window is not defined" while the gap is there.
// This waits for the timers already queued, not for a fixed time.
// eslint-disable-next-line no-restricted-syntax
afterAll(() => new Promise((resolve) => setTimeout(resolve, 0)));
