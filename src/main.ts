import { app, BrowserWindow } from "electron";
import started from "electron-squirrel-startup";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  cleanupTerminalSessions,
  initializeIpcHandlers,
  shutdownCliServer,
  type UpdateController,
} from "./ipc";

// Build-time constants injected by @electron-forge/plugin-vite.
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
let updateController: UpdateController | null = null;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// GUI-launched builds often miss PATH; hydrate env so spawned terminals see user tools.
function hydrateEnvFromLoginShell() {
  if (process.platform === "win32") {
    return;
  }

  const shell =
    process.env.SHELL ??
    (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");

  try {
    const output = execFileSync(shell, ["-ilc", "printenv"], {
      encoding: "utf8",
    });

    output.split("\n").forEach((line) => {
      if (!line || !line.includes("=")) {
        return;
      }

      const index = line.indexOf("=");
      const key = line.slice(0, index);
      const value = line.slice(index + 1);

      if (key.length === 0 || value.length === 0) {
        return;
      }

      if (key === "PATH" || !(key in process.env)) {
        process.env[key] = value;
      }
    });
  } catch (error) {
    console.warn(
      "Failed to read login shell environment, continuing with defaults.",
      error,
    );
  }
}

hydrateEnvFromLoginShell();

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (e) => e.preventDefault());

  updateController = await initializeIpcHandlers(mainWindow);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Save last workspace before window closes
  mainWindow.on("close", (event) => {
    if (mainWindow) {
      event.preventDefault();

      // Request the renderer to save the last workspace
      mainWindow.webContents.send("app:before-close");

      // Give the renderer time to save, then close
      setTimeout(() => {
        if (mainWindow) {
          mainWindow.destroy();
        }
      }, 1000);
    }
  });

  mainWindow.on("closed", () => {
    cleanupTerminalSessions();
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await createWindow();

  // Uncommment this once we hook up the update server
  //updateController?.checkForUpdate();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("before-quit", () => {
  // Force close all windows without prompting
  if (mainWindow) {
    mainWindow.removeAllListeners("close");
  }

  shutdownCliServer();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    cleanupTerminalSessions();
    shutdownCliServer();

    app.quit();
  }
});
