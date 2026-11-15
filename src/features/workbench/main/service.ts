import type { ContextMenuOptions } from "@shared/commands";
import { clipboard, dialog, shell } from "electron";
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

  /** The page saved after `beforeClose`, so the window can close. */
  readyToClose() {
    pageSaved?.();
  },
};

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
