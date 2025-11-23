import { ipcRenderer } from "electron";
import automation from "./api/automation";

ipcRenderer.on("automation:invoke", async (_, payload) => {
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
