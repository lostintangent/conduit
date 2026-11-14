import { app, BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { releaseGitSubscriptions } from "@features/git/main/service";
import { closeTerminals } from "@features/terminal/main/startup";
import { initializeAgentHandlers } from "./agent";
import { initializeCliHandlers, shutdownCliServer } from "./cli";
import { startFeatures } from "./features";
import {
  cleanupFileSystemV2Handlers,
  initializeFileSystemV2Handlers,
  releaseFileSystemSubscriptions,
} from "@features/files/main/handlers";
import { unwatchAll } from "@features/files/main/ParcelFileWatcher";
import { initializeApplicationMenu, initializeUIHandlers } from "./ui";

async function ensureConduitDirectory() {
  await fs.mkdir(path.join(app.getPath("home"), ".conduit"), {
    recursive: true,
  });
}

let stopFeatures: (() => Promise<void>) | undefined;

async function initializeIpcHandlers(window: BrowserWindow) {
  const sendToRenderer = (channel: string, payload: unknown) => {
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  };

  await ensureConduitDirectory();
  await initializeApplicationMenu(window);

  stopFeatures = await startFeatures();

  await initializeCliHandlers(sendToRenderer);

  initializeUIHandlers(window);
  await initializeAgentHandlers();

  initializeFileSystemV2Handlers();

  // Captured now, since webContents is gone by the time the window closes.
  const windowId = window.webContents.id;
  const releaseSubscriptions = () => {
    releaseFileSystemSubscriptions(windowId);
    releaseGitSubscriptions();
  };
  window.on("closed", releaseSubscriptions);

  // A reloaded page starts its own shells and subscriptions and never
  // reattaches to the old page's, which would otherwise run unseen until quit.
  // Navigations that `will-navigate` blocks never commit, so they don't count.
  let hasLoaded = false;
  window.webContents.on("did-navigate", () => {
    if (hasLoaded) {
      releaseSubscriptions();
      closeTerminals().catch((error) =>
        console.error("Failed to close the reloaded page's terminals", error),
      );
    }
    hasLoaded = true;
  });
}

/** Native teardown gets this long before quit goes ahead anyway. */
const SHUTDOWN_TIMEOUT_MS = 2000;

/**
 * Release everything the window's session left running: file watchers, the
 * CLI server, and each feature's startup disposer (the terminal's PTYs and
 * prompt processes, the update timer, and the settings watcher).
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
  initializeIpcHandlers,
  shutdownIpcHandlers,
};
