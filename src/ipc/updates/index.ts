import type { UpdateState } from "@shared/types";
import { app, autoUpdater, ipcMain } from "electron";
import { SendToRendererFn } from "../terminal/types";

export type UpdateController = {
  checkForUpdate: () => void;
  installUpdate: () => void;
  getState: () => UpdateState;
};

const SUPPORTED_PLATFORMS = new Set(["darwin"]);
let currentState: UpdateState = {
  status: determineSupport() ? "idle" : "disabled",
};

let controllerInstance: UpdateController | null = null;
let sendToRenderer: SendToRendererFn;
let stateListener: () => void;

function determineSupport() {
  return app.isPackaged && SUPPORTED_PLATFORMS.has(process.platform);
}

function updateState(partial: Partial<UpdateState>) {
  currentState = {
    ...currentState,
    ...partial,
  };

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

  autoUpdater.on("update-downloaded", () =>
    updateState({
      status: "downloaded",
    }),
  );

  autoUpdater.on("error", () =>
    updateState({
      status: "idle",
    }),
  );
}

function checkForUpdate() {
  if (!determineSupport()) {
    updateState({
      status: "disabled",
    });
    return;
  }

  updateState({
    status: "checking",
  });

  autoUpdater.checkForUpdates();
}

function installUpdate() {
  updateState({
    status: "installing",
  });

  autoUpdater.quitAndInstall();
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

    ipcMain.handle("updates:install", installUpdate);

    checkForUpdate();
  }

  controllerInstance = {
    checkForUpdate,
    installUpdate,
    getState: () => currentState,
  };
}

export function getUpdateController() {
  return controllerInstance;
}
