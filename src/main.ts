import { app, BrowserWindow, session } from "electron";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  cleanupTerminalSessions,
  initializeIpcHandlers,
  shutdownCliServer,
} from "./ipc";

// Build-time constants injected by @electron-forge/plugin-vite.
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

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
  const mainWindow = new BrowserWindow({
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

  mainWindow.on("close", (event) => {
    // Prevent the window from closing immediately
    // so that we can give the renderer time to save state
    event.preventDefault();

    // Notify the renderer to save state, and give
    // it 1s to do so before forcing the close.
    mainWindow.webContents.send("app:before-close");
    setTimeout(() => mainWindow?.destroy(), 1000);
  });

  // Whenever the window is closed, clean up
  // resources and then quit the app.
  mainWindow.on("closed", () => {
    cleanupTerminalSessions();
    shutdownCliServer();

    app.quit();
  });

  await initializeIpcHandlers(mainWindow);

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

app.whenReady().then(async () => {
  const extensionPath = MAIN_WINDOW_VITE_DEV_SERVER_URL
    ? path.join(__dirname, "../../.vite/extension")
    : path.join(__dirname, "../extension");

  await createWindow();

  const webviewSession = session.fromPartition("persist:webview");
  await webviewSession.extensions.loadExtension(extensionPath, {
    allowFileAccess: true,
  });
});
