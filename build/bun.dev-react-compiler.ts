import type { BunPlugin } from "bun";

// Dev only: Bun's dev server can't run the React Compiler yet
// (oven-sh/bun#48669), so compile each component the way the production
// build does. Returning it as tsx keeps Bun's Fast Refresh transform, which
// skips the js loader. DevTools shows the compiled code, since the dev server
// drops a plugin's source map.
const devReactCompiler: BunPlugin = {
  name: "conduit-dev-react-compiler",
  setup(build) {
    build.onLoad({ filter: /\/src\/.*\.tsx$/ }, async (args) => {
      const result = await Bun.build({
        entrypoints: [args.path],
        external: ["*"],
        target: "browser",
        format: "esm",
        reactCompiler: true,
        throw: false,
      });
      // On a syntax error, hand back the source so the dev server reports it
      // with a code frame instead of a bare "Bundle failed".
      const contents = result.success
        ? await result.outputs[0].text()
        : await Bun.file(args.path).text();
      return { contents, loader: "tsx" };
    });
  },
};

export default devReactCompiler;
