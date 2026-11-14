import type { ContextMenuOptions } from "@shared/commands";
import { BrowserWindow, clipboard, dialog, shell } from "electron";
import { showContextMenu } from "../../../main/ui/contextMenu";

/** Conduit has one window, which context menus and dialogs attach to. */
const getWindow = () => BrowserWindow.getAllWindows()[0];

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
};

export default service;

declare module "@shared/rpc" {
  interface Services {
    workbench: typeof service;
  }
}
