import { app, type BrowserWindow, dialog } from "electron";

/** A page that crashes again this soon after a recovery is crash-looping. */
const CRASH_LOOP_MS = 60_000;

/**
 * Reload the window's page whenever its renderer dies, which also closes the
 * dead page's shells and releases its watchers (see `initializeIpcHandlers`).
 * If it dies again within a minute of that, ask before reloading it again.
 */
export function reloadAfterCrashes(window: BrowserWindow) {
  let isClosing = false;
  window.on("close", () => {
    isClosing = true;
  });

  let lastReload = Number.NEGATIVE_INFINITY;
  window.webContents.on(
    "render-process-gone",
    async (_event, { reason, exitCode }) => {
      if (reason === "clean-exit" || isClosing) {
        return;
      }
      console.error(
        `The window's page died (${reason}, exit code ${exitCode})`,
      );

      if (Date.now() - lastReload < CRASH_LOOP_MS) {
        const { response } = await dialog.showMessageBox(window, {
          type: "error",
          message: "Conduit's window keeps crashing",
          detail: "It crashed again less than a minute after reloading.",
          buttons: ["Reload", "Quit"],
        });
        if (response === 1) {
          app.quit();
          return;
        }
        if (isClosing || window.isDestroyed()) {
          return;
        }
      }

      lastReload = Date.now();
      window.webContents.reload();
    },
  );
}
