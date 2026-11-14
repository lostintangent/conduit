import type { Events } from "@shared/rpc";
import { BrowserWindow } from "electron";

/**
 * Returns a typed `emit` for a feature's events. Each event is sent to every
 * window as `<feature>:<event>`, where `window.conduit.<feature>.on` hears it.
 */
export function emitter<Name extends keyof Events>(name: Name) {
  return <Event extends keyof Events[Name] & string>(
    event: Event,
    payload: Events[Name][Event],
  ) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(`${name}:${event}`, payload);
    }
  };
}
