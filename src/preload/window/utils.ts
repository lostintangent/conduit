import { ipcRenderer } from "electron";

export function createEventListener<T>(
  channel: string,
  listener: (payload: T) => void,
) {
  const handler = (_: Electron.IpcRendererEvent, payload: T) =>
    listener(payload);

  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}
