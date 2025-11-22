import { ipcMain } from "electron";
import type {
  CreateVMPayload,
  DeleteVMPayload,
  ForkVMPayload,
  ListVMsPayload,
} from "../../shared/types";
import {
  applyDiffToVM,
  configureVMForGitPush,
  createVM as createVMClient,
  deleteVM as deleteVMClient,
  executeInVM,
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

  // Execute command in VM
  ipcMain.handle(
    "vm:execute",
    async (
      _,
      {
        vmId,
        command,
        args,
        timeoutSeconds,
      }: {
        vmId: string;
        command: string;
        args?: string[];
        timeoutSeconds?: number;
      },
    ) => {
      return await executeInVM(vmId, command, args, undefined, timeoutSeconds);
    },
  );

  // Apply commit bundle to VM
  // Configure VM to accept git pushes
  ipcMain.handle(
    "vm:configure-git-push",
    async (_, { vmId, repoPath }: { vmId: string; repoPath: string }) => {
      return await configureVMForGitPush(vmId, repoPath);
    },
  );

  // Apply diff patch to VM
  ipcMain.handle(
    "vm:apply-diff",
    async (
      _,
      {
        vmId,
        diffPatch,
        repoPath,
      }: { vmId: string; diffPatch: Buffer; repoPath: string },
    ) => {
      return await applyDiffToVM(vmId, diffPatch, repoPath);
    },
  );

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
