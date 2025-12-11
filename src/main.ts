import { app, BrowserWindow } from "electron";
import squirrelStartup from "electron-squirrel-startup";
import { execFileSync } from "node:child_process";
import path from "node:path";
import {
  cleanupTerminalSessions,
  cleanupUpdateHandlers,
  initializeIpcHandlers,
  shutdownCliServer,
} from "./ipc";

// Handle Squirrel events on Windows (install/uninstall/update)
if (squirrelStartup) {
  app.quit();
}

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
  const isWindows = process.platform === "win32";
  const isMac = process.platform === "darwin";

  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    // On macOS: hiddenInset gives traffic lights with custom titlebar area
    // On Windows/Linux: hidden allows custom titlebar with native window controls overlay
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
    // All platforms use frameless window with custom styling
    // Windows uses titleBarOverlay for native min/max/close buttons
    frame: false,
    transparent: !isWindows,
    backgroundColor: "#00000000",
    // Don't show until content is ready to avoid blank window flash
    show: false,
    // Windows: use native window controls overlay (like VSCode)
    // This gives us proper snap/resize behavior with custom titlebar
    ...(isWindows && {
      titleBarOverlay: {
        color: "rgba(0,0,0,0)",
        symbolColor: "#a1a1aa",
        height: 34,
      },
    }),
  });

  // Show window only when content is ready to avoid blank screen
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (e) => e.preventDefault());

  // Track whether we're in the process of closing to avoid duplicate close handling
  let isClosing = false;

  mainWindow.on("close", (event) => {
    // If already closing, don't prevent the close
    if (isClosing) {
      return;
    }

    // Prevent the window from closing immediately
    // so that we can give the renderer time to save state
    event.preventDefault();
    isClosing = true;

    // Notify the renderer to save state, and give
    // it 1s to do so before forcing the close.
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("app:before-close");
    }
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.destroy();
      }
    }, 1000);
  });

  // Whenever the window is closed, clean up
  // resources and then quit the app.
  mainWindow.on("closed", () => {
    cleanupTerminalSessions();
    cleanupUpdateHandlers();
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
  const webviewPreloadPath = app.isPackaged
    ? path.join(process.resourcesPath, "webview-preload.js")
    : path.join(__dirname, "webview-preload.js");

  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-attach-webview", (_attachEvent, webPreferences) => {
      webPreferences.preload = webviewPreloadPath;
      webPreferences.contextIsolation = true;
      webPreferences.nodeIntegration = false;
    });
  });

  await createWindow();
});
