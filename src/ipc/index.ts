import { app, BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
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
import { initializeUpdateHandlers, cleanupUpdateHandlers } from "./updates";
import { initializeVMHandlers } from "./vm";
import initializeWorkspaceHandlers from "./workspace";

async function ensureConduitDirectory(): Promise<string> {
  const homeDir = app.getPath("home");
  const conduitDir = path.join(homeDir, ".conduit");

  try {
    await fs.access(conduitDir);
  } catch {
    await fs.mkdir(conduitDir, { recursive: true });
  }

  return conduitDir;
}

async function initializeIpcHandlers(window: BrowserWindow) {
  const sendToRenderer = (channel: string, payload: unknown) => {
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  };

  const conduitStateDirectory = await ensureConduitDirectory();

  const { refreshMenu } = await initializeUserSettings(
    window,
    conduitStateDirectory,
  );

  await initializeWorkspaceHandlers(conduitStateDirectory, refreshMenu);

  await initializeCliHandlers(sendToRenderer);
  initializeTerminalHandlers(sendToRenderer);

  initializeUIHandlers(window);
  initializeFsHandlers();
  await initializeAgentHandlers();
  initializeFileWatcherHandlers();
  initializeVMHandlers();
  initializeBrowserHandlers();

  initializeUpdateHandlers(sendToRenderer, refreshMenu);
}

export {
  cleanupTerminalSessions,
  cleanupUpdateHandlers,
  initializeIpcHandlers,
  shutdownCliServer,
};
