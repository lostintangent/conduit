// The main-process composition root for features. A feature contributes by
// putting a file in the right place, keyed by its folder name:
//
// - `features/<name>/main/service.ts` default-exports a plain object of
//   methods, which the preload exposes as `window.conduit.<name>`.
// - `features/<name>/main/startup.ts` default-exports a function that runs
//   before the window loads, and may return a function that quit awaits.

import { ipcMain } from "electron";

// biome-ignore lint/suspicious/noExplicitAny: services accept any arguments
type Service = Record<string, (...args: any[]) => unknown>;
type Dispose = () => void | Promise<void>;
type Startup = () => void | Dispose | Promise<void | Dispose>;

// Bun declares `import.meta.glob` in bun-types, which the app's tsconfig
// leaves out so renderer code can't see Bun's globals.
declare global {
  interface ImportMeta {
    glob<Module>(
      pattern: string,
      options: { eager: true; import: "default" },
    ): Record<string, Module>;
  }
}

const services = byFeature(
  import.meta.glob<Service>("../features/*/main/service.ts", {
    eager: true,
    import: "default",
  }),
);

const startups = byFeature(
  import.meta.glob<Startup>("../features/*/main/startup.ts", {
    eager: true,
    import: "default",
  }),
);

/**
 * The preload can't import main code, so main hands it each service's method
 * names through `webPreferences.additionalArguments`, and it builds
 * `window.conduit` from them.
 */
export const featuresArgument = `--features=${JSON.stringify(
  Object.fromEntries(
    Object.entries(services).map(([name, service]) => [
      name,
      Object.keys(service),
    ]),
  ),
)}`;

/**
 * Runs every startup, then serves each method as `<feature>:<method>`.
 * Returns the disposer that quit awaits.
 */
export async function startFeatures(): Promise<() => Promise<void>> {
  const disposers = await Promise.all(
    Object.values(startups).map((startup) => startup()),
  );

  for (const [name, service] of Object.entries(services)) {
    for (const method of Object.keys(service)) {
      ipcMain.handle(`${name}:${method}`, (_event, ...args) =>
        service[method](...args),
      );
    }
  }

  return async () => {
    await Promise.allSettled(
      disposers.map((dispose) => (dispose ? dispose() : undefined)),
    );
  };
}

function byFeature<T>(modules: Record<string, T>): Record<string, T> {
  return Object.fromEntries(
    Object.entries(modules).map(([path, module]) => [
      path.split("/")[2],
      module,
    ]),
  );
}
