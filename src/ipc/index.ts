import { BrowserWindow } from "electron";
import { initializeAgentHandlers } from "./agent";
import { initializeBrowserHandlers } from "./browser";
import { initializeCliHandlers, shutdownCliServer } from "./cli";
import { initializeFsHandlers } from "./fs";
import { initializeFileWatcherHandlers } from "./fs/watcher";
import {
  cleanupTerminalSessions,
  initializeTerminalHandlers,
} from "./terminal";
import { initializeUIHandlers, initializeUserSettings } from "./ui";
import { initializeUpdateHandlers, type UpdateController } from "./updates";
import { initializeVMHandlers } from "./vm";
import { initializeWorkspaceHandlers } from "./workspace";

async function initializeIpcHandlers(window: BrowserWindow) {
  const sendToRenderer = (channel: string, payload: unknown) => {
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  };

  const { refreshMenu } = await initializeUserSettings(window);

  await initializeCliHandlers(sendToRenderer);
  initializeTerminalHandlers(sendToRenderer);
  initializeWorkspaceHandlers(refreshMenu, window);
  initializeUIHandlers(window);
  initializeFsHandlers();
  await initializeAgentHandlers();
  initializeFileWatcherHandlers();
  initializeVMHandlers();
  initializeBrowserHandlers();

  initializeUpdateHandlers(sendToRenderer, refreshMenu);
}

export { cleanupTerminalSessions, initializeIpcHandlers, shutdownCliServer };
export type { UpdateController };
