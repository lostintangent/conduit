/**
 * Tailwind CSS v4 for Bun, built directly on @tailwindcss/node and
 * @tailwindcss/oxide so it always uses the project's own Tailwind version
 * (bun-plugin-tailwind bundles a frozen copy). Used by build/bun.build.ts and,
 * through bunfig.toml, by the dev server.
 *
 * Mirrors @tailwindcss/vite: compile each Tailwind root stylesheet, scan the
 * project for candidates (respecting `@source` and .gitignore), and emit CSS.
 */
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import type { BunPlugin } from "bun";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dir, "..");
// The Features bits @tailwindcss/vite uses to spot a Tailwind root (AtApply |
// JsPluginCompat | ThemeFunction | Utilities). Tailwind declares Features as an
// ambient const enum, which isolatedModules won't let us read.
const tailwindFeatures = 1 | 4 | 8 | 16;

type Root = {
  source: string;
  compiler: Awaited<ReturnType<typeof compile>>;
  scanner: Scanner;
  candidates: Set<string>;
};

const tailwind: BunPlugin = {
  name: "conduit-tailwind",
  setup(build) {
    const roots = new Map<string, Root>();

    build.onLoad({ filter: /\.css$/ }, async (args) => {
      if (args.path.includes(`${path.sep}node_modules${path.sep}`)) return;
      const source = await Bun.file(args.path).text();

      let root = roots.get(args.path);
      if (root?.source !== source) {
        const compiler = await compile(source, {
          base: path.dirname(args.path),
          shouldRewriteUrls: true,
          onDependency: () => {},
        });
        if (!(compiler.features & tailwindFeatures)) return;
        const sources = [
          ...(compiler.root === "none"
            ? []
            : compiler.root === null
              ? [{ base: projectRoot, pattern: "**/*", negated: false }]
              : [{ ...compiler.root, negated: false }]),
          ...compiler.sources,
        ];
        root = {
          source,
          compiler,
          scanner: new Scanner({ sources }),
          candidates: new Set(),
        };
        roots.set(args.path, root);
      }

      // Rescans are incremental. Candidates accumulate for the root's
      // lifetime, as in @tailwindcss/vite, so HMR never drops a class.
      for (const candidate of root.scanner.scan()) {
        root.candidates.add(candidate);
      }
      return {
        contents: root.compiler.build([...root.candidates]),
        loader: "css",
      };
    });
  },
};

export default tailwind;
