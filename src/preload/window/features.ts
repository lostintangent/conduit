import type { FeatureApis } from "@shared/rpc";
import { ipcRenderer } from "electron";
import { createEventListener } from "./utils";

// Electron rejects a failed invoke with "Error invoking remote method
// '<channel>': Error: <message>", so callers see the message the service threw.
const REMOTE_ERROR_PREFIX =
  /^Error invoking remote method '[^']*': (\w*Error: )?/;

/**
 * Builds each feature's `window.conduit.<name>` API from the method names
 * main passes as `--features=` (see `src/ipc/features.ts`). Every method
 * invokes `<name>:<method>`, and `on(event)` listens to `<name>:<event>`.
 */
export function createFeatureApis(): FeatureApis {
  const argument = process.argv.find((arg) => arg.startsWith("--features="));
  const features: Record<string, string[]> = JSON.parse(
    argument?.slice("--features=".length) ?? "{}",
  );

  return Object.fromEntries<unknown>(
    Object.entries(features).map(([name, methods]) => [
      name,
      {
        ...Object.fromEntries(
          methods.map((method) => [
            method,
            (...args: unknown[]) =>
              ipcRenderer
                .invoke(`${name}:${method}`, ...args)
                .catch((error: Error) => {
                  throw new Error(
                    error.message.replace(REMOTE_ERROR_PREFIX, ""),
                  );
                }),
          ]),
        ),
        on: (event: string, listener: (payload: unknown) => void) =>
          createEventListener(`${name}:${event}`, listener),
      },
    ]),
  ) as FeatureApis;
}
