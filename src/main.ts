import { app, BrowserWindow } from "electron";
import started from "electron-squirrel-startup";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { initializeSessionHandlers } from "./ipc/session/handlers";
import {
  cleanupTerminalSessions,
  initializeTerminalHandlers,
} from "./ipc/terminal";
import { initializeAgentHandlers } from "./ipc/agent";
import { initializeUIHandlers, initializeUIPreferences } from "./ipc/ui";

// Build-time constants injected by @electron-forge/plugin-vite.
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// GUI-launched builds often miss PATH; hydrate env so spawned terminals see user tools.
function hydrateEnvFromLoginShell() {
  if (process.platform === "win32") {
    return;
  }

  const shell = process.env.SHELL ?? (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash");

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
    console.warn("Failed to read login shell environment, continuing with defaults.", error);
  }
}

hydrateEnvFromLoginShell();

function sendToRenderer(channel: string, payload: unknown) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  mainWindow.webContents.send(channel, payload);
}

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

  await initializeUIPreferences(mainWindow);

  initializeTerminalHandlers(sendToRenderer);
  initializeSessionHandlers();
  initializeUIHandlers(mainWindow);
  initializeAgentHandlers();

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  mainWindow.on("closed", () => {
    cleanupTerminalSessions();
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    cleanupTerminalSessions();
    app.quit();
  }
});
