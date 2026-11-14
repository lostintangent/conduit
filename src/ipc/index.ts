import { app, BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { initializeAgentHandlers } from "./agent";
import { initializeCliHandlers, shutdownCliServer } from "./cli";
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
import { initializeUIHandlers, initializeUserSettings } from "./ui";

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

  await initializeUserSettings(window, conduitStateDirectory);

  stopFeatures = await startFeatures();

  await initializeCliHandlers(sendToRenderer);

  initializeUIHandlers(window);
  await initializeAgentHandlers();

  // Initialize filesystem and git handlers (v2)
  initializeFileSystemV2Handlers();
  initializeGitV2Handlers();

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
 * Release everything the window's session left running: file watchers, the
 * CLI server, and each feature's startup disposer (the terminal's PTYs and
 * prompt processes, and the update timer).
 */
async function shutdownIpcHandlers(): Promise<void> {
  await Promise.race([
    Promise.allSettled([unwatchAll(), shutdownCliServer(), stopFeatures?.()]),
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
