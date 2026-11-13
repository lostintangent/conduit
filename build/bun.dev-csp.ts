import type { BunPlugin } from "bun";

// Dev only: Bun's HMR client applies hot updates as blob: scripts and injects
// one small inline script, both of which the renderer CSP blocks. Relax
// script-src for the dev server's copy of index.html. (Vite's dev preamble
// escapes the CSP by being injected above the meta tag.) Production builds
// never load this plugin.
const devCsp: BunPlugin = {
  name: "conduit-dev-csp",
  setup(build) {
    build.onLoad({ filter: /src\/renderer\/index\.html$/ }, async (args) => ({
      contents: (await Bun.file(args.path).text()).replace(
        "script-src 'self'",
        "script-src 'self' 'unsafe-inline' blob:",
      ),
      loader: "html",
    }));
  },
};

export default devCsp;
