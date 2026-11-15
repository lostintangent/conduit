import type { Events } from "@shared/rpc";
import { BrowserWindow } from "electron";

/**
 * Returns a typed `emit` for a feature's events. Each event is sent to
 * Conduit's window as `<feature>:<event>`, where `window.conduit.<feature>.on`
 * hears it.
 */
export function emitter<Name extends keyof Events>(name: Name) {
  return <Event extends keyof Events[Name] & string>(
    event: Event,
    payload: Events[Name][Event],
  ) => {
    getAppWindow()?.webContents.send(`${name}:${event}`, payload);
  };
}

/**
 * Conduit's one window. Popups that pages open are windows too, which the
 * browser's startup makes children of the window they came from.
 */
export function getAppWindow(): BrowserWindow | undefined {
  return BrowserWindow.getAllWindows().find(
    (window) => !window.getParentWindow(),
  );
}
