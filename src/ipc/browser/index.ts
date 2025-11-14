import { clipboard, ipcMain, webContents } from "electron";

export function initializeBrowserHandlers() {
  ipcMain.handle(
    "browser:capture-screenshot",
    async (_event, webContentsId: number) => {
      try {
        const contents = webContents.fromId(webContentsId);
        if (!contents) {
          throw new Error(`WebContents with ID ${webContentsId} not found`);
        }

        const image = await contents.capturePage();
        clipboard.writeImage(image);

        return { success: true };
      } catch (error) {
        console.error("Failed to capture screenshot:", error);
        throw error;
      }
    },
  );
}
