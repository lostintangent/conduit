import type { UpdateState } from "@shared/types";
import { app, autoUpdater, ipcMain } from "electron";
import { SendToRendererFn } from "../terminal/types";

const SUPPORTED_PLATFORMS = new Set(["darwin", "win32"]);
const CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

let currentState: UpdateState = {
  status: determineSupport() ? "idle" : "disabled",
};

let sendToRenderer: SendToRendererFn;
let stateListener: () => void;
let updateCheckTimer: NodeJS.Timeout | null = null;

// Store event listener references for cleanup
let checkingForUpdateListener: (() => void) | null = null;
let updateNotAvailableListener: (() => void) | null = null;
let updateAvailableListener: (() => void) | null = null;
let updateDownloadedListener:
  | ((
      event: Electron.Event,
      releaseNotes: string,
      releaseName: string,
    ) => void)
  | null = null;
let beforeQuitForUpdateListener: (() => void) | null = null;
let errorListener: (() => void) | null = null;

function determineSupport() {
  return app.isPackaged && SUPPORTED_PLATFORMS.has(process.platform);
}

function updateState(state: UpdateState) {
  currentState = state;

  // Notify renderer process of update state change
  sendToRenderer("updates:event", currentState);

  // Notify any registered state listener
  stateListener();
}

function wireAutoUpdaterEvents() {
  checkingForUpdateListener = () =>
    updateState({
      status: "checking",
    });
  autoUpdater.on("checking-for-update", checkingForUpdateListener);

  updateNotAvailableListener = () =>
    updateState({
      status: "idle",
    });
  autoUpdater.on("update-not-available", updateNotAvailableListener);

  updateAvailableListener = () =>
    updateState({
      status: "downloading",
    });
  autoUpdater.on("update-available", updateAvailableListener);

  updateDownloadedListener = (_, releaseNotes, releaseName) =>
    updateState({
      status: "downloaded",
      releaseName,
      releaseNotes,
    });
  autoUpdater.on("update-downloaded", updateDownloadedListener);

  beforeQuitForUpdateListener = () =>
    updateState({
      status: "installing",
    });
  autoUpdater.on("before-quit-for-update", beforeQuitForUpdateListener);

  errorListener = () =>
    updateState({
      status: "idle",
    });
  autoUpdater.on("error", errorListener);
}

export function initializeUpdateHandlers(
  sendToRendererFn: SendToRendererFn,
  onStateChange: () => void,
) {
  sendToRenderer = sendToRendererFn;
  stateListener = onStateChange;

  const updatesSupported = determineSupport();
  if (updatesSupported) {
    const platform = `${process.platform}-${process.arch}`;
    const version = app.getVersion();
    const url = `https://update.electronjs.org/lostintangent/conduit-release/${platform}/${version}`;

    autoUpdater.setFeedURL({ url });
    wireAutoUpdaterEvents();

    ipcMain.handle("updates:install", () => autoUpdater.quitAndInstall());

    // Check for updates immediately
    autoUpdater.checkForUpdates();

    // Set up timer to check for updates every 2 hours
    updateCheckTimer = setInterval(() => {
      try {
        autoUpdater.checkForUpdates();
      } catch (error) {
        console.error("Failed to check for updates:", error);
      }
    }, CHECK_INTERVAL_MS);
  }
}

export function getUpdateStatus() {
  return currentState.status;
}

export function cleanupUpdateHandlers() {
  // Clear update check timer
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }

  // Remove all autoUpdater event listeners to prevent memory leaks
  if (checkingForUpdateListener) {
    autoUpdater.removeListener("checking-for-update", checkingForUpdateListener);
    checkingForUpdateListener = null;
  }
  if (updateNotAvailableListener) {
    autoUpdater.removeListener(
      "update-not-available",
      updateNotAvailableListener,
    );
    updateNotAvailableListener = null;
  }
  if (updateAvailableListener) {
    autoUpdater.removeListener("update-available", updateAvailableListener);
    updateAvailableListener = null;
  }
  if (updateDownloadedListener) {
    autoUpdater.removeListener("update-downloaded", updateDownloadedListener);
    updateDownloadedListener = null;
  }
  if (beforeQuitForUpdateListener) {
    autoUpdater.removeListener(
      "before-quit-for-update",
      beforeQuitForUpdateListener,
    );
    beforeQuitForUpdateListener = null;
  }
  if (errorListener) {
    autoUpdater.removeListener("error", errorListener);
    errorListener = null;
  }
}
