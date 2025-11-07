import { randomUUID } from "node:crypto";
import path from "node:path";

import { getTerminal, removeTerminal, storeTerminal } from ".";
import { detectPorts } from "../../../shared/portDetection";
import { createVM, getSSHConnectionInfo } from "../../vm/client";
import {
  getPrivateKeyPath,
  hasSSHKeys,
  setupSSHKeyInVM,
} from "../../vm/ssh-keys";
import { consumeOscSequences, normalizeCwd, startCwdPolling } from "../cwd";
import { resolveShell, spawnTerminalProcess } from "../pty";
import type {
  CreateTerminalOptions,
  SendToRendererFn,
  TerminalInstance,
} from "../types";

const disposeSessionResources = (session: TerminalInstance) => {
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
  session.bufferedOutput = [];
};

const describeProcess = (session: TerminalInstance) => {
  if (session.cloudEnvironment) {
    return `VM ${session.cloudEnvironment.vmId}`;
  }

  if (session.lastProcessName && session.lastProcessName.trim().length > 0) {
    return session.lastProcessName;
  }

  return path.parse(resolveShell()).name || "Shell";
};

export async function createTerminal(
  sendToRenderer: SendToRendererFn,
  options?: CreateTerminalOptions,
) {
  const id = randomUUID();

  // Check if this should be a remote VM session
  if (options?.isRemoteVM || options?.existingVMId) {
    console.log(
      options?.existingVMId
        ? `[VM] Connecting to existing VM ${options.existingVMId}`
        : "[VM] Creating remote VM terminal session",
    );

    try {
      let vm;

      if (options?.existingVMId) {
        // Connect to an existing VM
        const { getVM } = await import("../../vm/client");
        vm = await getVM(options.existingVMId);
        console.log(`[VM] Connected to existing VM ${vm.id}`);
      } else {
        // Create the VM with conduitVM label
        const labels = options.vmLabels
          ? [...options.vmLabels, "conduitVM"]
          : ["conduitVM"];
        vm = await createVM({
          image: options.vmImageId,
          labels: labels,
          idle_timeout: options.vmIdleTimeout,
          github_repo: options.githubRepo
            ? {
                owner: options.githubRepo.owner,
                name: options.githubRepo.name,
                branch_or_hash: options.githubRepo.branch,
              }
            : undefined,
        });
        console.log("[VM] VM created, setting up SSH access...");
      }

      // Check if we have SSH keys and set them up in the VM (only for new VMs)
      let useSSHKey = false;

      if (!options?.existingVMId) {
        const keysAvailable = await hasSSHKeys();

        if (keysAvailable) {
          console.log("[SSH] Found SSH keys, installing in VM...");
          const { loadConfig } = await import("../../vm/config");
          const config = await loadConfig();
          useSSHKey = await setupSSHKeyInVM(
            vm.id,
            config.managerUrl,
            config.token,
          );

          if (useSSHKey) {
            console.log("[SSH] SSH key authentication enabled");
          } else {
            console.log(
              "[SSH] Failed to setup SSH key, will use password authentication",
            );
          }
        } else {
          console.log(
            "[SSH] No SSH keys found in keys/ folder, will use password authentication",
          );
        }
      } else {
        // For existing VMs, assume SSH key is already set up if available
        const keysAvailable = await hasSSHKeys();
        useSSHKey = keysAvailable;
        console.log(
          `[SSH] Connecting to existing VM, SSH key auth: ${useSSHKey}`,
        );
      }

      // Get SSH connection info
      const sshInfo = getSSHConnectionInfo(vm);

      // Spawn a regular local shell
      const homeDirectory = process.env.HOME ?? process.cwd();
      const pty = spawnTerminalProcess(id, homeDirectory);

      const session: TerminalInstance = {
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
        bufferedOutput: [],
        cloudEnvironment: {
          vmId: vm.id,
          vmHost: sshInfo.host,
          sshPort: sshInfo.port,
          imageId: vm.image_id,
          useSSHKey,
          detectedPorts: new Set(),
          forwardedPorts: new Map(),
          diffPatch: options.diffPatch,
          repoName: options.githubRepo?.name,
        },
      };

      storeTerminal(session);
      setupTerminalListeners(session, sendToRenderer);

      return session;
    } catch (error) {
      console.error("[VM] Failed to create VM session:", error);
      throw error;
    }
  }

  // Regular local session
  const cwd = options?.cwd ?? path.resolve(process.env.HOME ?? process.cwd());
  const pty = spawnTerminalProcess(id, cwd);

  const terminal: TerminalInstance = {
    id,
    pty,
    lastProcessName: pty.process,
    cwd: normalizeCwd(cwd),

    oscBuffer: "",
    isPollingCwd: false,

    isRendererReady: false,
    bufferedOutput: [],
  };

  storeTerminal(terminal);
  setupTerminalListeners(terminal, sendToRenderer);

  return terminal;
}

function setupTerminalListeners(
  terminal: TerminalInstance,
  sendToRenderer: SendToRendererFn,
) {
  const { id, pty } = terminal;

  pty.onData((data) => {
    if (terminal.isRendererReady) {
      sendToRenderer("terminal:data", { sessionId: id, data });
    } else {
      terminal.bufferedOutput.push(data);
    }

    const processName = pty.process;
    if (processName && processName !== terminal.lastProcessName) {
      terminal.lastProcessName = processName;
      sendToRenderer("terminal:title", { sessionId: id, title: processName });
    }

    // Detect ports in terminal output for cloud VMs
    if (terminal.cloudEnvironment) {
      const detectedPorts = detectPorts(data);

      for (const port of detectedPorts) {
        if (
          !terminal.cloudEnvironment.detectedPorts.has(port) &&
          !terminal.cloudEnvironment.forwardedPorts.has(port)
        ) {
          terminal.cloudEnvironment.detectedPorts.add(port);
          sendToRenderer("terminal:port-detected", { sessionId: id, port });
        }
      }
    }

    // Only consume OSC sequences for local sessions
    if (!terminal.cloudEnvironment) {
      consumeOscSequences(terminal, data, sendToRenderer);
    }
  });

  pty.onExit(async ({ exitCode, signal }) => {
    disposeSessionResources(terminal);

    // Clean up VM if this was a VM session
    if (terminal.cloudEnvironment) {
      console.log(
        `[VM] Terminal exited, cleaning up VM ${terminal.cloudEnvironment.vmId}`,
      );
      try {
        const { deleteVM } = await import("../../vm/client");
        await deleteVM(terminal.cloudEnvironment.vmId);
        console.log(
          `[VM] Successfully deleted VM ${terminal.cloudEnvironment.vmId}`,
        );
      } catch (error) {
        // Ignore 404 errors - VM was already deleted (e.g., by idle timeout)
        if (error instanceof Error && error.message.includes("404")) {
          console.log(
            `[VM] VM ${terminal.cloudEnvironment.vmId} was already deleted`,
          );
        } else {
          console.error(
            `[VM] Failed to delete VM ${terminal.cloudEnvironment.vmId}:`,
            error,
          );
        }
      }
    }

    sendToRenderer("terminal:exit", {
      sessionId: id,
      exitCode: exitCode ?? null,
      signal: signal ?? null,
    });

    setTimeout(() => {
      const current = getTerminal(id);
      if (current && current.pty === terminal.pty) {
        removeTerminal(id);
      }
    }, 2000);
  });

  const title = describeProcess(terminal);
  terminal.lastProcessName = title;

  sendToRenderer("terminal:title", {
    sessionId: id,
    title,
  });

  sendToRenderer("terminal:cwd", {
    sessionId: id,
    cwd: terminal.cwd,
  });

  // Only start CWD polling for local sessions
  if (!terminal.cloudEnvironment) {
    startCwdPolling(terminal, sendToRenderer);
  }
}

export async function killTerminal(terminalId: string) {
  const terminal = getTerminal(terminalId);
  if (!terminal) return;

  // Clean up VM if this is a VM session
  if (terminal.cloudEnvironment) {
    console.log(
      `[VM] Closing session, deleting VM ${terminal.cloudEnvironment.vmId}`,
    );
    try {
      const { deleteVM } = await import("../../vm/client");
      await deleteVM(terminal.cloudEnvironment.vmId);
      console.log(
        `[VM] Successfully deleted VM ${terminal.cloudEnvironment.vmId}`,
      );
    } catch (error) {
      // Ignore 404 errors - VM was already deleted (e.g., by idle timeout)
      if (error instanceof Error && error.message.includes("404")) {
        console.log(
          `[VM] VM ${terminal.cloudEnvironment.vmId} was already deleted`,
        );
      } else {
        console.error(
          `[VM] Failed to delete VM ${terminal.cloudEnvironment.vmId}:`,
          error,
        );
      }
    }
  }

  removeTerminal(terminalId);
  disposeSessionResources(terminal);

  try {
    terminal.pty.kill();
  } catch (error) {
    console.error("Failed to terminate PTY session", error);
  }
}

export function markTerminalReady(
  terminalId: string,
  sendToRenderer: SendToRendererFn,
) {
  const terminal = getTerminal(terminalId);
  if (!terminal) return;

  terminal.isRendererReady = true;

  if (terminal.bufferedOutput.length > 0) {
    terminal.bufferedOutput.forEach((data) =>
      sendToRenderer("terminal:data", { sessionId: terminal.id, data }),
    );

    terminal.bufferedOutput = [];
  }

  // If this is a VM session, send the SSH command now that the terminal is ready
  if (terminal.cloudEnvironment) {
    let sshCommand: string;

    if (terminal.cloudEnvironment.useSSHKey) {
      // Use SSH key authentication with the Conduit key
      const keyPath = getPrivateKeyPath();
      sshCommand = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i "${keyPath}" -p ${terminal.cloudEnvironment.sshPort} ace@${terminal.cloudEnvironment.vmHost}\n`;
      console.log(
        `[VM] Terminal ready, sending SSH command with key: ${sshCommand.trim()}`,
      );
    } else {
      // Use password authentication
      sshCommand = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${terminal.cloudEnvironment.sshPort} ace@${terminal.cloudEnvironment.vmHost}\n`;
      console.log(
        `[VM] Terminal ready, sending SSH command: ${sshCommand.trim()}`,
      );
    }

    terminal.pty.write(sshCommand);

    // If there's a diff patch to apply, schedule it after repo clone
    if (terminal.cloudEnvironment.diffPatch && terminal.cloudEnvironment.repoName) {
      console.log(`[VM] Will apply diff patch after repo clone completes`);
      
      // Poll for repo clone completion instead of using fixed delay
      const waitForRepo = async () => {
        const maxAttempts = 6; // 6 attempts * 5 seconds each = 30 seconds max
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            const { executeInVM } = await import("../../vm/client");
            
            // Use a bash loop that checks every second for 5 seconds
            // Check that git repo exists AND git status works (meaning clone is complete)
            const startTime = Date.now();
            const checkResult = await executeInVM(
              terminal.cloudEnvironment!.vmId,
              "bash",
              ["-c", `cd /workspace || exit 1; for i in {1..5}; do if git status > /dev/null 2>&1; then echo "ready"; exit 0; fi; sleep 1; done; echo "not-ready"; exit 1`],
              7  // 5 seconds loop + 2 seconds buffer
            );
            const elapsed = Date.now() - startTime;
            
            const status = checkResult.stdout?.trim() || "unknown";
            console.log(`[VM] Repo check attempt ${attempt}: status="${status}", exit=${checkResult.exit_code}, elapsed=${elapsed}ms`);
            
            if (checkResult.exit_code === 0 && status === "ready") {
              console.log(`[VM] Repository ready after attempt ${attempt}`);
              return true;
            }
          } catch (error) {
            console.log(`[VM] Repo check attempt ${attempt} failed:`, error);
          }
        }
        
        console.warn(`[VM] Timeout waiting for repo clone after ${maxAttempts} attempts`);
        return false;
      };
      
      // Wait for repo, then apply patch
      (async () => {
        const repoReady = await waitForRepo();
        
        if (!repoReady) {
          console.error(`[VM] Repo clone did not complete in time`);
          sendToRenderer("notification:show", {
            type: "error",
            message: "Timeout waiting for repo clone",
            timeout: 5000,
          });
          return;
        }
        
        try {
          const { applyDiffToVM } = await import("../../vm/client");
          const repoPath = `/workspace`;
          
          console.log(`[VM] Applying diff patch to ${repoPath} in VM ${terminal.cloudEnvironment!.vmId}`);
          
          const result = await applyDiffToVM(
            terminal.cloudEnvironment!.vmId,
            terminal.cloudEnvironment!.diffPatch!,
            repoPath
          );

          if (result.success) {
            console.log(`[VM] Successfully applied local changes to VM`);
            // Show success notification as toast
            sendToRenderer("notification:show", {
              type: "success",
              message: "Local changes synced to VM",
              timeout: 3000,
            });
          } else {
            console.error(`[VM] Failed to apply diff patch:`, result.error);
            // Show error notification as toast
            sendToRenderer("notification:show", {
              type: "error",
              message: `Failed to sync local changes: ${result.error}`,
              timeout: 5000,
            });
          }
        } catch (error) {
          console.error(`[VM] Error applying diff patch:`, error);
          sendToRenderer("notification:show", {
            type: "error",
            message: "Error syncing local changes",
            timeout: 5000,
          });
        }
      })();
    }
  }
}
