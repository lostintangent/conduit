import { app, autoUpdater } from "electron";
import { emitter } from "../../../ipc/events";
import { refreshApplicationMenu } from "../../../ipc/ui";
import type { UpdateState } from "../model";

const CHECK_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

const emit = emitter("updates");

let currentState: UpdateState = {
  status: app.isPackaged ? "idle" : "disabled",
};

/** The application menu's update item reflects this. */
export function getUpdateStatus() {
  return currentState.status;
}

function updateState(state: UpdateState) {
  currentState = state;
  emit("statusChanged", currentState);
  refreshApplicationMenu();
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

/**
 * Packaged builds check for updates now and every two hours. Quit stops the
 * timer.
 */
export default function startUpdates() {
  if (!app.isPackaged) return;

  const platform = `${process.platform}-${process.arch}`;
  const version = app.getVersion();
  const url = `https://update.electronjs.org/lostintangent/conduit/${platform}/${version}`;

  autoUpdater.setFeedURL({ url });
  wireAutoUpdaterEvents();

  // Check for updates immediately
  autoUpdater.checkForUpdates();

  const updateCheckTimer = setInterval(() => {
    try {
      autoUpdater.checkForUpdates();
    } catch (error) {
      console.error("Failed to check for updates:", error);
    }
  }, CHECK_INTERVAL_MS);

  return () => clearInterval(updateCheckTimer);
}
