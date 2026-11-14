import type { CliRequest, CliResponse } from "@shared/cli/types";
import type { FeatureApis } from "@shared/rpc";
import { contextBridge, ipcRenderer } from "electron";
import { createFeatureApis } from "./features";
import { createEventListener } from "./utils";

/** The CLI's requests travel through the page, which answers each one. */
const cli = {
  onRequest: (listener: (request: CliRequest) => void) =>
    createEventListener("cli:request", listener),

  respondToRequest: <T>(response: CliResponse<T>) =>
    ipcRenderer.invoke("cli:respond", response) as Promise<void>,
};

export type ConduitAPI = { cli: typeof cli } & FeatureApis;

contextBridge.exposeInMainWorld("conduit", { cli, ...createFeatureApis() });
