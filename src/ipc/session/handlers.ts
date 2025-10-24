import { ipcMain } from "electron";
import { getAllSessions } from "../terminal/store";
import { deleteSession, hasSessions, loadSessions, saveSession } from "./index";

export function initializeSessionHandlers() {
  ipcMain.handle("session:has-sessions", async () => {
    return await hasSessions();
  });

  ipcMain.handle("session:load-sessions", async () => {
    return await loadSessions();
  });

  ipcMain.handle("session:save-session", async (_event, name, tabs) => {
    // Get terminal sessions from main process to access lastProcessName
    const terminalSessions = getAllSessions();
    return await saveSession(name, tabs, terminalSessions);
  });

  ipcMain.handle("session:delete-session", async (_event, timestamp) => {
    await deleteSession(timestamp);
  });
}
