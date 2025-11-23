import type { UpdateState } from "@shared/types";
import { app, autoUpdater, ipcMain } from "electron";
import { SendToRendererFn } from "../terminal/types";

const SUPPORTED_PLATFORMS = new Set(["darwin"]);
const CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

let currentState: UpdateState = {
  status: determineSupport() ? "idle" : "disabled",
};

let sendToRenderer: SendToRendererFn;
let stateListener: () => void;
let updateCheckTimer: NodeJS.Timeout | null = null;

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
  autoUpdater.on("checking-for-update", () =>
    updateState({
      status: "checking",
    }),
  );

  autoUpdater.on("update-not-available", () =>
    updateState({
      status: "idle",
    }),
  );

  autoUpdater.on("update-available", () =>
    updateState({
      status: "downloading",
    }),
  );

  autoUpdater.on("update-downloaded", (_, releaseNotes, releaseName) =>
    updateState({
      status: "downloaded",
      releaseName,
      releaseNotes,
    }),
  );

  autoUpdater.on("before-quit-for-update", () =>
    updateState({
      status: "installing",
    }),
  );

  autoUpdater.on("error", () =>
    updateState({
      status: "idle",
    }),
  );
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
      autoUpdater.checkForUpdates();
    }, CHECK_INTERVAL_MS);
  }
}

export function getUpdateStatus() {
  return currentState.status;
}

export function cleanupUpdateHandlers() {
  if (updateCheckTimer) {
    clearInterval(updateCheckTimer);
    updateCheckTimer = null;
  }
}
