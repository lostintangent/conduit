import { ipcRenderer } from "electron";
import automation from "./automation";

ipcRenderer.on("automation:invoke", async (_event, payload) => {
  const { id, command, args } = payload ?? {};
  if (!id || !command || !(command in automation)) {
    return;
  }

  try {
    // @ts-ignore dynamic lookup
    const result = await automation[command](args);
    ipcRenderer.sendToHost("automation:result", { id, result });
  } catch (error: any) {
    ipcRenderer.sendToHost("automation:result", {
      id,
      error: error?.message ?? String(error),
    });
  }
});
