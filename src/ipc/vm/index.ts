import { ipcMain } from "electron";
import type {
  CreateVMPayload,
  ListVMsPayload,
  DeleteVMPayload,
} from "../../shared/types";
import {
  createVM as createVMClient,
  listVMs as listVMsClient,
  deleteVM as deleteVMClient,
  getVM as getVMClient,
  reloadConfig,
} from "./client";

/**
 * Initialize IPC handlers for VM operations
 */
export function initializeVMHandlers() {
  // Create a new VM
  ipcMain.handle("vm:create", async (_, payload: CreateVMPayload) => {
    return createVMClient(payload);
  });

  // List all VMs
  ipcMain.handle("vm:list", async (_, payload?: ListVMsPayload) => {
    return listVMsClient(payload?.labels);
  });

  // Get VM details
  ipcMain.handle("vm:get", async (_, vmId: string) => {
    return getVMClient(vmId);
  });

  // Delete a VM
  ipcMain.handle("vm:delete", async (_, payload: DeleteVMPayload) => {
    return deleteVMClient(payload.vmId);
  });

  // Reload VM configuration
  ipcMain.handle("vm:reload-config", async () => {
    reloadConfig();
    return { success: true };
  });
}
