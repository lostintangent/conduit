import { ipcMain } from "electron";
import type {
  CreateVMPayload,
  DeleteVMPayload,
  ForkVMPayload,
  ListVMsPayload,
} from "../../shared/types";
import {
  createVM as createVMClient,
  deleteVM as deleteVMClient,
  forkVM as forkVMClient,
  getVM as getVMClient,
  listVMs as listVMsClient,
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

  // Fork a VM
  ipcMain.handle("vm:fork", async (_, payload: ForkVMPayload) => {
    return forkVMClient(payload.vmId, {
      labels: payload.labels,
      idle_timeout: payload.idle_timeout,
    });
  });

  // Reload VM configuration
  ipcMain.handle("vm:reload-config", async () => {
    reloadConfig();
    return { success: true };
  });

  // Forward a port from a VM
  ipcMain.handle(
    "vm:forward-port",
    async (
      _,
      {
        vmId,
        port,
        description,
      }: { vmId: string; port: number; description?: string },
    ) => {
      const { addPortForward } = await import("./client");

      // Find the terminal session for this VM
      const terminals = (await import("../terminal/store")).getAllTerminals();
      let terminal;
      for (const [_, term] of terminals) {
        if (term.cloudEnvironment?.vmId === vmId) {
          terminal = term;
          break;
        }
      }

      // Call the VM API to forward the port
      const result = await addPortForward(vmId, port, description);

      // Update the terminal's forwarded ports map
      if (terminal?.cloudEnvironment) {
        terminal.cloudEnvironment.forwardedPorts.set(
          port,
          result.connection_url,
        );
      }

      return result;
    },
  );
}
