import { ipcMain } from "electron";
import type {
  CreateVMPayload,
  DeleteVMPayload,
  ForkVMPayload,
  ListVMsPayload,
} from "../../shared/types";
import {
  configureVMForGitPush,
  createVM as createVMClient,
  deleteVM as deleteVMClient,
  executeInVM,
  forkVM as forkVMClient,
  getVM as getVMClient,
  listVMs as listVMsClient,
  reloadConfig,
} from "./client";
import { getSandboxIPCUrl } from "./sandbox-ipc-client";
import {
  acquireVM,
  addForwardedPort,
  connectSandbox,
  disconnectSandbox,
  disposeAllSessions,
  getAllVMSessions,
  getVMSession,
  releaseVM,
  type VMConsumerType,
} from "./store";

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
      return await executeInVM(vmId, command, args, timeoutSeconds);
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
      const { addPortForward: addPortForwardAPI } = await import("./client");

      // Call the VM API to forward the port
      const result = await addPortForwardAPI(vmId, port, description);

      // Update the VM store's forwarded ports
      addForwardedPort(vmId, port, result.connection_url);

      // Also update terminal's forwarded ports for backward compatibility
      const terminals = (await import("../terminal/store")).getAllTerminals();
      for (const [_, term] of terminals) {
        if (term.cloudEnvironment?.vmId === vmId) {
          term.cloudEnvironment.forwardedPorts.set(port, result.connection_url);
          break;
        }
      }

      return result;
    },
  );

  // ============================================================================
  // VM Store Handlers
  // ============================================================================

  // Acquire a VM session (for panes that want to connect to a VM)
  ipcMain.handle(
    "vm:acquire",
    async (
      _,
      {
        vmId,
        consumerId,
        consumerType,
        connectSandbox: shouldConnect,
      }: {
        vmId: string;
        consumerId: string;
        consumerType: VMConsumerType;
        connectSandbox?: boolean;
      },
    ) => {
      try {
        const session = await acquireVM(vmId, {
          consumerId,
          consumerType,
          connectSandbox: shouldConnect,
        });
        return {
          success: true,
          vmId: session.vmId,
          connectionState: session.connectionState,
          sshHost: session.sshHost,
          sshPort: session.sshPort,
          forwardedPorts: Object.fromEntries(session.forwardedPorts),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
      }
    },
  );

  // Release a VM session
  ipcMain.handle(
    "vm:release",
    async (_, { vmId, consumerId }: { vmId: string; consumerId: string }) => {
      releaseVM(vmId, consumerId);
      return { success: true };
    },
  );

  // Get VM session info
  ipcMain.handle("vm:session", async (_, vmId: string) => {
    const session = getVMSession(vmId);
    if (!session) {
      return { success: false, error: "No session found" };
    }
    return {
      success: true,
      vmId: session.vmId,
      connectionState: session.connectionState,
      sshHost: session.sshHost,
      sshPort: session.sshPort,
      consumerCount: session.consumers.size,
      forwardedPorts: Object.fromEntries(session.forwardedPorts),
    };
  });

  // List all active VM sessions
  ipcMain.handle("vm:sessions", async () => {
    const sessions = getAllVMSessions();
    return Array.from(sessions.values()).map((s) => ({
      vmId: s.vmId,
      connectionState: s.connectionState,
      consumerCount: s.consumers.size,
    }));
  });

  // ============================================================================
  // Sandbox IPC Handlers
  // ============================================================================

  // Get sandbox-ipc WebSocket URL for a VM
  ipcMain.handle("vm:sandbox-ipc-url", async (_, vmId: string) => {
    const vm = await getVMClient(vmId);
    const url = getSandboxIPCUrl(vm);
    return { url, available: !!url };
  });

  // Apply patches via conduit-server (preferred method)
  ipcMain.handle(
    "vm:sandbox-apply-patches",
    async (
      _,
      {
        vmId,
        patches,
      }: {
        vmId: string;
        patches: {
          staged?: Buffer | null;
          unstaged?: Buffer | null;
          untracked?: Buffer | null;
        };
      },
    ) => {
      try {
        const client = await connectSandbox(vmId);
        return await client.applyPatches(patches);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: message };
      }
    },
  );

  // Get git status via conduit-server
  ipcMain.handle("vm:sandbox-git-status", async (_, vmId: string) => {
    try {
      const client = await connectSandbox(vmId);
      const status = await client.getGitStatus();
      return { success: true, status };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  });

  // Close conduit-server connection for a VM (but keep session alive)
  ipcMain.handle("vm:sandbox-disconnect", async (_, vmId: string) => {
    disconnectSandbox(vmId);
    return { success: true };
  });
}

/**
 * Cleanup all VM-related resources
 */
export function cleanupVMHandlers(): void {
  disposeAllSessions();
}
