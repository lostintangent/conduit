import { ipcRenderer } from "electron";

export default {
  captureScreenshot: (webContentsId: number) =>
    ipcRenderer.invoke(
      "browser:capture-screenshot",
      webContentsId,
    ) as Promise<void>,

  showDevTools: (sourceWebContentsId: number, devToolsWebContentsId: number) =>
    ipcRenderer.invoke(
      "browser:show-devtools",
      sourceWebContentsId,
      devToolsWebContentsId,
    ) as Promise<void>,
};
