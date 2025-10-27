import { BrowserWindow } from "electron";
import { initializeAgentHandlers } from "./agent";
import { initializeFsHandlers } from "./fs";
import {
    cleanupTerminalSessions,
    initializeTerminalHandlers,
} from "./terminal";
import { initializeUIHandlers, initializeUserSettings } from "./ui";
import { initializeWorkspaceHandlers } from "./workspace";

export async function initializeIpcHandlers(window: BrowserWindow) {
    const sendToRenderer = (channel: string, payload: unknown) => {
        if (window && !window.isDestroyed()) {
            window.webContents.send(channel, payload);
        }
    };

    const { refreshMenu } = await initializeUserSettings(window);

    initializeTerminalHandlers(sendToRenderer);
    initializeWorkspaceHandlers(refreshMenu);
    initializeUIHandlers(window);
    initializeFsHandlers();
    initializeAgentHandlers();
}

export { cleanupTerminalSessions };
