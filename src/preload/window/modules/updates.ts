import { ipcRenderer } from "electron";
import type { UpdateState } from "../../shared/types";
import { createEventListener } from "../utils";

export default {
  onStatusChanged: (listener: (state: UpdateState) => void) =>
    createEventListener<UpdateState>("updates:event", listener),

  installAndRestart: () => ipcRenderer.invoke("updates:install"),
};
