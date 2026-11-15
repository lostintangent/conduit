import { app, type BrowserWindow, dialog } from "electron";

/** A page that crashes again this soon after a recovery is crash-looping. */
const CRASH_LOOP_MS = 60_000;

let reloadedAfterLoop = false;

/**
 * Whether the page last reloaded after crashing again within a minute, so it
 * starts with a new tab and keeps its last session aside, in case that's what
 * crashes it.
 */
export const reloadedAfterCrashLoop = () => reloadedAfterLoop;

/**
 * Reload the window's page whenever its renderer dies, which also closes the
 * dead page's shells and releases its watchers (see `initializeIpcHandlers`).
 * If it dies again within a minute of that, ask before reloading it again,
 * without the last session.
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

      const looping = Date.now() - lastReload < CRASH_LOOP_MS;
      if (looping) {
        const { response } = await dialog.showMessageBox(window, {
          type: "error",
          message: "Conduit's window keeps crashing",
          detail:
            "It crashed again less than a minute after reloading. Reload opens a new tab, and keeps your last session in File > Open Workspace, in case it's what crashes it.",
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

      reloadedAfterLoop = looping;
      lastReload = Date.now();
      window.webContents.reload();
    },
  );
}
