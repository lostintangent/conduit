import { randomUUID } from "node:crypto";
import path from "node:path";

import {
  getSession,
  removeSession,
  storeSession,
} from ".";
import { consumeOscSequences, normalizeCwd, startCwdPolling } from "../cwd";
import { resolveShell, spawnTerminalProcess } from "../pty";
import type {
  CreateSessionOptions,
  SendToRendererFn,
  TerminalSession,
} from "../types";
import {
  createVM,
  getSSHConnectionInfo,
} from "../../vm/client";

const disposeSessionResources = (session: TerminalSession) => {
  session.oscBuffer = "";
  if (session.cwdPoller) {
    clearInterval(session.cwdPoller);
    session.cwdPoller = undefined;
  }
  if (session.pendingCwdPoll) {
    clearTimeout(session.pendingCwdPoll);
    session.pendingCwdPoll = undefined;
  }
  session.isPollingCwd = false;
  session.scheduleCwdPoll = undefined;
  session.pendingOutput = [];
  if (session.readyFallback) {
    clearTimeout(session.readyFallback);
    session.readyFallback = undefined;
  }
};

const describeProcess = (session: TerminalSession) => {
  if (session.vmMetadata) {
    return `VM ${session.vmMetadata.vmId}`;
  }

  if (session.lastProcessName && session.lastProcessName.trim().length > 0) {
    return session.lastProcessName;
  }

  return path.parse(resolveShell()).name || "Shell";
};

export const createSession = async (
  sendToRenderer: SendToRendererFn,
  options?: CreateSessionOptions
): Promise<TerminalSession> => {
  const id = randomUUID();

  // Check if this should be a remote VM session
  if (options?.isRemoteVM) {
    console.log("[VM] Creating remote VM terminal session");

    try {
      // Create the VM with conduitVM label
      const labels = options.vmLabels ? [...options.vmLabels, "conduitVM"] : ["conduitVM"];
      const vm = await createVM({
        image: options.vmImageId,
        labels: labels,
        idle_timeout: options.vmIdleTimeout,
      });

      // Get SSH connection info
      const sshInfo = getSSHConnectionInfo(vm);

      // Spawn a regular local shell
      const homeDirectory = process.env.HOME ?? process.cwd();
      const pty = spawnTerminalProcess(homeDirectory);

      const session: TerminalSession = {
        id,
        pty,
        lastProcessName: `VM ${vm.id}`,
        cwd: homeDirectory,
        oscBuffer: "",
        cwdPoller: undefined,
        isPollingCwd: false,
        pendingCwdPoll: undefined,
        scheduleCwdPoll: undefined,
        isRendererReady: false,
        pendingOutput: [],
        readyFallback: undefined,
        vmMetadata: {
          vmId: vm.id,
          vmHost: sshInfo.host,
          sshPort: sshInfo.port,
          imageId: vm.image_id,
        },
      };

      storeSession(session);
      setupSessionHandlers(session, sendToRenderer);
      
      return session;
    } catch (error) {
      console.error("[VM] Failed to create VM session:", error);
      throw error;
    }
  }

  // Regular local session
  const defaultDirectory = path.resolve(process.env.HOME ?? process.cwd());
  const normalizedOverride = options?.cwd ? normalizeCwd(options.cwd) : null;
  const initialDirectory = normalizedOverride ?? defaultDirectory;

  const pty = spawnTerminalProcess(initialDirectory);

  const session: TerminalSession = {
    id,
    pty,
    lastProcessName: pty.process,
    cwd: normalizeCwd(initialDirectory) ?? initialDirectory,
    oscBuffer: "",
    cwdPoller: undefined,
    isPollingCwd: false,
    pendingCwdPoll: undefined,
    scheduleCwdPoll: undefined,
    isRendererReady: false,
    pendingOutput: [],
    readyFallback: undefined,
  };

  storeSession(session);
  setupSessionHandlers(session, sendToRenderer);
  return session;
};

const setupSessionHandlers = (
  session: TerminalSession,
  sendToRenderer: SendToRendererFn
) => {
  const { id, pty } = session;

  pty.onData((data) => {
    if (session.isRendererReady) {
      sendToRenderer("terminal:data", { sessionId: id, data });
    } else {
      session.pendingOutput.push(data);
    }

    const processName = pty.process;
    if (processName && processName !== session.lastProcessName) {
      session.lastProcessName = processName;
      sendToRenderer("terminal:title", { sessionId: id, title: processName });
    }

    // Only consume OSC sequences for local sessions
    if (!session.vmMetadata) {
      consumeOscSequences(session, data, sendToRenderer);
    }
  });

  pty.onExit(async ({ exitCode, signal }) => {
    disposeSessionResources(session);

    // Clean up VM if this was a VM session
    if (session.vmMetadata) {
      console.log(`[VM] Terminal exited, cleaning up VM ${session.vmMetadata.vmId}`);
      try {
        const { deleteVM } = await import("../../vm/client");
        await deleteVM(session.vmMetadata.vmId);
        console.log(`[VM] Successfully deleted VM ${session.vmMetadata.vmId}`);
      } catch (error) {
        // Ignore 404 errors - VM was already deleted (e.g., by idle timeout)
        if (error instanceof Error && error.message.includes("404")) {
          console.log(`[VM] VM ${session.vmMetadata.vmId} was already deleted`);
        } else {
          console.error(`[VM] Failed to delete VM ${session.vmMetadata.vmId}:`, error);
        }
      }
    }

    sendToRenderer("terminal:exit", {
      sessionId: id,
      exitCode: exitCode ?? null,
      signal: signal ?? null,
    });

    setTimeout(() => {
      const current = getSession(id);
      if (current && current.pty === session.pty) {
        removeSession(id);
      }
    }, 2000);
  });

  const title = describeProcess(session);
  session.lastProcessName = title;
  sendToRenderer("terminal:title", {
    sessionId: id,
    title,
  });
  sendToRenderer("terminal:cwd", {
    sessionId: id,
    cwd: session.cwd,
  });

  // Only start CWD polling for local sessions
  if (!session.vmMetadata) {
    startCwdPolling(session, sendToRenderer);
  }

  session.readyFallback = setTimeout(() => {
    if (!session.isRendererReady) {
      console.log(
        `[main] Fallback timeout triggered for session ${id}, marking ready`
      );
      session.isRendererReady = true;
      if (session.pendingOutput.length > 0) {
        session.pendingOutput.forEach((data) => {
          sendToRenderer("terminal:data", { sessionId: session.id, data });
        });
        session.pendingOutput = [];
      }
    }
  }, 750);
};

export const closeSession = async (sessionId: string) => {
  const session = getSession(sessionId);
  if (!session) {
    return;
  }

  // Clean up VM if this is a VM session
  if (session.vmMetadata) {
    console.log(`[VM] Closing session, deleting VM ${session.vmMetadata.vmId}`);
    try {
      const { deleteVM } = await import("../../vm/client");
      await deleteVM(session.vmMetadata.vmId);
      console.log(`[VM] Successfully deleted VM ${session.vmMetadata.vmId}`);
    } catch (error) {
      // Ignore 404 errors - VM was already deleted (e.g., by idle timeout)
      if (error instanceof Error && error.message.includes("404")) {
        console.log(`[VM] VM ${session.vmMetadata.vmId} was already deleted`);
      } else {
        console.error(`[VM] Failed to delete VM ${session.vmMetadata.vmId}:`, error);
      }
    }
  }

  removeSession(sessionId);
  disposeSessionResources(session);
  try {
    session.pty.kill();
  } catch (error) {
    console.error("Failed to terminate PTY session", error);
  }
};

export const markSessionReady = (
  sessionId: string,
  sendToRenderer: SendToRendererFn
) => {
  const session = getSession(sessionId);
  if (!session) {
    return;
  }

  session.isRendererReady = true;
  if (session.readyFallback) {
    clearTimeout(session.readyFallback);
    session.readyFallback = undefined;
  }
  if (session.pendingOutput.length > 0) {
    session.pendingOutput.forEach((data) =>
      sendToRenderer("terminal:data", { sessionId: session.id, data }));

    session.pendingOutput = [];
  }

  // If this is a VM session, send the SSH command now that the terminal is ready
  if (session.vmMetadata) {
    const sshCommand = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${session.vmMetadata.sshPort} ace@${session.vmMetadata.vmHost}\n`;
    console.log(`[VM] Terminal ready, sending SSH command: ${sshCommand.trim()}`);
    session.pty.write(sshCommand);
  }
};
