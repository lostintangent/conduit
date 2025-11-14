import { clipboard, ipcMain, webContents } from "electron";

export function initializeBrowserHandlers() {
  ipcMain.handle(
    "browser:capture-screenshot",
    async (_, webContentsId: number) => {
      const contents = webContents.fromId(webContentsId);
      const image = await contents.capturePage();
      clipboard.writeImage(image);
    },
  );

  ipcMain.handle(
    "browser:show-devtools",
    (_, sourceWebContentsId: number, devToolsWebContentsId: number) => {
      const sourceContents = webContents.fromId(sourceWebContentsId);
      const devToolsContents = webContents.fromId(devToolsWebContentsId);

      sourceContents.setDevToolsWebContents(devToolsContents);
      sourceContents.openDevTools();

      // This is a needed workaround to ensure the DevTools reloads
      // properly when opened in a separate window. Unfortunately it's required :/
      devToolsContents.executeJavaScript("window.location.reload()");
    },
  );
}
