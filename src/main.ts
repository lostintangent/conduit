import { app, BrowserWindow } from "electron";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { initializeIpcHandlers, shutdownIpcHandlers } from "./ipc";

// Build-time constants injected by build/bun.build.ts.
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

// GUI-launched builds often miss PATH; hydrate env so spawned terminals see user tools.
function hydrateEnvFromLoginShell() {
  const shell = process.env.SHELL ?? "/bin/zsh";

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
    // hiddenInset keeps the traffic lights inside the custom titlebar area
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    // Don't show until content is ready to avoid blank window flash
    show: false,
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

  // Whenever the window is closed, quit the app.
  mainWindow.on("closed", () => {
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

// Native callbacks that land while Node is tearing down abort the process,
// so hold the quit until PTYs have exited and watchers have unsubscribed.
let shutdown: Promise<void> | undefined;
let isShutDown = false;
app.on("will-quit", (event) => {
  if (isShutDown) {
    return;
  }

  event.preventDefault();
  shutdown ??= shutdownIpcHandlers().then(() => {
    isShutDown = true;
    app.quit();
  });
});
