import path from "node:path";
import { plugin } from "bun";

// Monaco doesn't load in jsdom, so tests get these mocks instead: monaco-mock.ts
// for the package itself and monaco-esm-mock.ts for any subpath (CSS, workers,
// language contributions).
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
