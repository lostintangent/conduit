import type { ContextMenuOptions } from "@shared/commands";
import { type BrowserWindow, clipboard, dialog, screen, shell } from "electron";
import { setTimeout as delay } from "node:timers/promises";
import { reloadedAfterCrashLoop } from "../../../main/crashRecovery";
import { emitter, getAppWindow } from "../../../main/events";
import { showContextMenu } from "../../../main/ui/contextMenu";

/** Conduit has one window, which context menus and dialogs attach to. */
function getWindow() {
  const window = getAppWindow();
  if (!window) throw new Error("Conduit's window is closed");
  return window;
}

const service = {
  /** A click comes back as the `contextMenuCommand` event. */
  showContextMenu(options: ContextMenuOptions) {
    showContextMenu(getWindow(), options);
  },

  openExternal: (url: string) => shell.openExternal(url),

  /** Resolves to the folder picked, or null if the picker was cancelled. */
  async showFolderPicker(defaultPath?: string) {
    const { canceled, filePaths } = await dialog.showOpenDialog(getWindow(), {
      properties: ["openDirectory"],
      defaultPath,
    });
    return canceled ? null : (filePaths[0] ?? null);
  },

  showItemInFolder: (path: string) => shell.showItemInFolder(path),

  writeClipboard: (text: string) => clipboard.writeText(text),

  reloadedAfterCrashLoop,

  /** The page painted the tabs it opens with, so the window can show. */
  opened() {
    pageOpened?.();
  },

  /** The page saved after `beforeClose`, so the window can close. */
  readyToClose() {
    pageSaved?.();
  },
};

let pageOpened: (() => void) | undefined;

/**
 * The window's size, made to fit the screen's work area. macOS only shrinks a
 * window that's too big as it shows it, and `showWhenOpened` keeps it hidden
 * until its first shells have started at their panes' sizes.
 */
export function fitScreen(width: number, height: number) {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  return {
    width: Math.min(width, workArea.width),
    height: Math.min(height, workArea.height),
  };
}

/**
 * Shows the window once its page has painted the tabs it opens with, so it
 * doesn't open on an empty workbench, or `limitMs` after its first paint when
 * the page doesn't say so.
 */
export function showWhenOpened(window: BrowserWindow, limitMs: number) {
  const opened = new Promise<void>((resolve) => (pageOpened = resolve));
  window.once("ready-to-show", () => {
    void Promise.race([opened, delay(limitMs)]).then(() => {
      if (!window.isDestroyed()) window.show();
    });
  });
}

let pageSaved: (() => void) | undefined;

/**
 * Asks the page to save before the window closes. Resolves once it has, or
 * after `limitMs` when it doesn't answer, like while it's reloading.
 */
export function pageSavedBeforeClose(limitMs: number): Promise<void> {
  return new Promise((resolve) => {
    const limit = setTimeout(resolve, limitMs);
    pageSaved = () => {
      clearTimeout(limit);
      resolve();
    };
    emitter("workbench")("beforeClose", undefined);
  });
}

export default service;

declare module "@shared/rpc" {
  interface Services {
    workbench: typeof service;
  }
}
