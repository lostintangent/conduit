import { ipcRenderer } from "electron";
import type { CliRequest, CliResponse } from "@shared/cli/types";
import { createEventListener } from "../utils";

export default {
  onRequest: (listener: (request: CliRequest) => void) =>
    createEventListener("cli:request", listener),

  respondToRequest: <T>(payload: CliResponse<T>) =>
    ipcRenderer.invoke("cli:respond", payload) as Promise<void>,

  completeCaptureBrowserRequest: (payload: {
    requestId: string;
    webContentsId: number;
    clip?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }) =>
    ipcRenderer.invoke(
      "cli:complete-capture-browser",
      payload,
    ) as Promise<void>,
};
