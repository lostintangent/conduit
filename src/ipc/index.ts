import { app, BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { initializeAgentHandlers } from "./agent";
import { initializeBrowserHandlers } from "./browser";
import { initializeCliHandlers, shutdownCliServer } from "./cli";
import { initialize as initializeDotfiles } from "./dotfiles";
import { startFeatures } from "./features";
import {
  cleanupFileSystemV2Handlers,
  handleWindowClose as handleFsWindowClose,
  initializeFileSystemV2Handlers,
} from "./fs/handlers";
import { unwatchAll } from "./fs/ParcelFileWatcher";
import {
  cleanupGitV2Handlers,
  handleGitWindowClose,
  initializeGitV2Handlers,
} from "./git/handlers";
import {
  cleanupTerminalSessions,
  initializeTerminalHandlers,
} from "@features/terminal/main";
import { initializeUIHandlers, initializeUserSettings } from "./ui";
import { cleanupUpdateHandlers, initializeUpdateHandlers } from "./updates";

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

let stopFeatures: (() => Promise<void>) | undefined;

async function initializeIpcHandlers(window: BrowserWindow) {
  const sendToRenderer = (channel: string, payload: unknown) => {
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  };

  const conduitStateDirectory = await ensureConduitDirectory();

  initializeDotfiles(conduitStateDirectory, app.getPath("home"), window);

  const { refreshMenu } = await initializeUserSettings(
    window,
    conduitStateDirectory,
  );

  stopFeatures = await startFeatures();

  await initializeCliHandlers(sendToRenderer);
  initializeTerminalHandlers(sendToRenderer);

  initializeUIHandlers(window);
  await initializeAgentHandlers();
  initializeBrowserHandlers();

  // Initialize filesystem and git handlers (v2)
  initializeFileSystemV2Handlers();
  initializeGitV2Handlers();

  initializeUpdateHandlers(sendToRenderer, refreshMenu);

  // Clean up providers when window closes
  // Capture windowId now since webContents won't be accessible in "closed" event
  const windowId = window.webContents.id;
  window.on("closed", () => {
    handleFsWindowClose(windowId);
    handleGitWindowClose(windowId);
  });
}

/** Native teardown gets this long before quit goes ahead anyway. */
const SHUTDOWN_TIMEOUT_MS = 2000;

/**
 * Release everything the window's session left running: PTYs, file watchers,
 * the CLI server, and the update timer.
 */
async function shutdownIpcHandlers(): Promise<void> {
  cleanupUpdateHandlers();

  await Promise.race([
    Promise.allSettled([
      cleanupTerminalSessions(),
      unwatchAll(),
      shutdownCliServer(),
      stopFeatures?.(),
    ]),
    delay(SHUTDOWN_TIMEOUT_MS),
  ]);
}

export { featuresArgument } from "./features";
export {
  cleanupFileSystemV2Handlers,
  cleanupGitV2Handlers,
  initializeIpcHandlers,
  shutdownIpcHandlers,
};
