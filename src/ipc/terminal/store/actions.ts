import { randomUUID } from "node:crypto";
import path from "node:path";

import type { TerminalCreateOptions } from "@shared/types";
import { detectPorts } from "@shared/utils/portDetection";
import { getTerminal, removeTerminal, storeTerminal } from ".";
import { createVM, getSSHConnectionInfo } from "../../vm/client";
import {
  getPrivateKeyPath,
  hasSSHKeys,
  setupSSHKeyInVM,
} from "../../vm/ssh-keys";
import {
  acquireVM,
  releaseVM,
  syncGitStateToVM,
  type VMGitSyncState,
} from "../../vm/store";
import { resolveShell, spawnTerminalProcess } from "../pty";
import type { SendToRendererFn, TerminalInstance } from "../types";

export async function createTerminal(
  sendToRenderer: SendToRendererFn,
  options?: TerminalCreateOptions,
) {
  const id = randomUUID();

  // Check if this should be a remote VM session
  if (options?.isRemoteVM || options?.existingSandboxId) {
    try {
      let vm;

      if (options?.existingSandboxId) {
        // Connect to an existing VM
        const { getVM } = await import("../../vm/client");
        vm = await getVM(options.existingSandboxId);
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
                // If local branch doesn't exist on remote, clone default branch instead
                // We'll create the local branch and apply commits after cloning
                branch_or_hash: options.githubRepo.branchExistsOnRemote
                  ? options.githubRepo.branch
                  : options.githubRepo.defaultBranch,
              }
            : undefined,
        });
        console.log("[VM] VM created, setting up SSH access...");
      }

      // Check if we have SSH keys and set them up in the VM (only for new VMs)
      let useSSHKey = false;

      if (!options?.existingSandboxId) {
        const keysAvailable = await hasSSHKeys();
        if (keysAvailable) {
          const { loadConfig } = await import("../../vm/config");
          const config = await loadConfig();
          useSSHKey = await setupSSHKeyInVM(
            vm.id,
            config.managerUrl,
            config.token,
          );
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

      // Prepare git sync state for VM store
      const gitSyncState: VMGitSyncState | undefined =
        options.localRepoCwd ||
        options.syncLocalGitState ||
        options.hasUnpushedCommits
          ? {
              localRepoCwd: options.localRepoCwd,
              syncLocalGitState: options.syncLocalGitState,
              hasUnpushedCommits: options.hasUnpushedCommits,
              repoName: options.githubRepo?.name,
              localBranch: options.githubRepo?.branch,
              branchExistsOnRemote: options.githubRepo?.branchExistsOnRemote,
            }
          : undefined;

      // Register this terminal as a consumer of the VM in the VM store
      const vmSession = await acquireVM(vm.id, {
        consumerId: id,
        consumerType: "terminal",
        useSSHKey,
        gitSyncState,
        connectSandbox: false, // Will connect later when repo is ready
      });

      // Spawn a regular local shell
      const homeDirectory =
        process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
      const pty = spawnTerminalProcess(id, homeDirectory);

      // For VM terminals, the cwd is the remote workspace path on the VM
      // The sandbox-ipc server runs with workspace at /workspace by default
      const remoteCwd = "/workspace";

      const session: TerminalInstance = {
        id,
        pty,
        lastProcessName: `VM ${vm.id}`,
        isRendererReady: false,
        bufferedOutput: [],
        cwd: remoteCwd,
        cloudEnvironment: {
          vmId: vm.id,
          vmHost: sshInfo.host,
          sshPort: vmSession.sshPort, // Use port from VM store
          imageId: vm.image_id,
          useSSHKey,
          connectionState: "connecting",
          connectionStartTime: Date.now(),
          detectedPorts: new Set(),
          forwardedPorts: new Map(vmSession.forwardedPorts), // Copy from VM store
          localRepoCwd: options.localRepoCwd,
          syncLocalGitState: options.syncLocalGitState,
          hasUnpushedCommits: options.hasUnpushedCommits,
          repoName: options.githubRepo?.name,
          localBranch: options.githubRepo?.branch,
          branchExistsOnRemote: options.githubRepo?.branchExistsOnRemote,
        },
      };

      storeTerminal(session);
      setupTerminalListeners(session, sendToRenderer);

      // Send initial connecting state to renderer
      sendToRenderer("terminal:ssh-state", {
        sessionId: session.id,
        state: "connecting",
      });

      return session;
    } catch (error) {
      console.error("[VM] Failed to create VM session:", error);
      throw error;
    }
  }

  // Regular local session
  const cwd =
    options?.cwd ??
    path.resolve(process.env.HOME ?? process.env.USERPROFILE ?? process.cwd());
  const pty = spawnTerminalProcess(id, cwd);

  let pendingCommand = options?.command;
  const shell = resolveShell();

  // If the command is the same as the shell, we don't need to run it
  // This happens when restoring a terminal that was just a shell
  if (
    pendingCommand &&
    (pendingCommand === shell || pendingCommand === path.basename(shell))
  ) {
    pendingCommand = undefined;
  }

  const terminal: TerminalInstance = {
    id,
    pty,
    lastProcessName: pty.process,
    isRendererReady: false,
    bufferedOutput: [],
    pendingCommand,
    cwd,
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
    // Handle SSH connection state tracking for cloud terminals
    if (terminal.cloudEnvironment) {
      const currentState = terminal.cloudEnvironment.connectionState;

      // Check for successful connection
      // We use a hybrid approach: check if the SSH process is running AND we see a shell prompt
      if (currentState === "connecting") {
        const processName = pty.process;
        const isSSHRunning = processName === "ssh";
        const hasShellPrompt =
          (data.includes("ace@") &&
            (data.includes("$") || data.includes("#"))) ||
          data.includes("/workspace");

        // SSH is connected when the ssh process is running AND we see a remote shell prompt
        if (isSSHRunning && hasShellPrompt) {
          console.log(
            "[VM] SSH connection established (ssh process + remote prompt detected)",
          );
          terminal.cloudEnvironment.connectionState = "connected";
          sendToRenderer("terminal:ssh-state", {
            sessionId: id,
            state: "connected",
          });
          // Now that we're connected, send this data (the prompt) to the terminal
          if (terminal.isRendererReady) {
            sendToRenderer("terminal:data", { sessionId: id, data });
          } else {
            terminal.bufferedOutput.push(data);
          }
          return;
        }
        return;
      }
    }

    // Normal data handling for connected cloud terminals or local terminals
    if (terminal.isRendererReady) {
      sendToRenderer("terminal:data", { sessionId: id, data });
    } else {
      terminal.bufferedOutput.push(data);
    }

    const processName = pty.process;
    if (processName && processName !== terminal.lastProcessName) {
      const previousProcess = terminal.lastProcessName;
      terminal.lastProcessName = processName;

      // For cloud terminals, detect SSH disconnection via process change
      if (terminal.cloudEnvironment) {
        const currentState = terminal.cloudEnvironment.connectionState;

        // SSH session ended when process changes from 'ssh' to something else (local shell)
        // This is more reliable than text parsing
        if (
          currentState === "connected" &&
          previousProcess === "ssh" &&
          processName !== "ssh"
        ) {
          console.log(
            `[VM] SSH process ended (changed from ssh to ${processName}), terminal disconnected`,
          );

          terminal.cloudEnvironment.connectionState = "disconnected";
          sendToRenderer("terminal:ssh-state", {
            sessionId: id,
            state: "disconnected",
          });
        }
      }
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
  });

  pty.onExit(async ({ exitCode, signal }) => {
    removeTerminal(id);

    // Release VM consumer if this was a VM session
    // The VM store will handle cleanup and deletion when no consumers remain
    if (terminal.cloudEnvironment) {
      console.log(
        `[VM] Terminal exited, releasing VM ${terminal.cloudEnvironment.vmId}`,
      );
      await releaseVM(terminal.cloudEnvironment.vmId, id);
    }

    sendToRenderer("terminal:exit", {
      sessionId: id,
      exitCode: exitCode ?? null,
      signal: signal ?? null,
    });
  });
}

export async function killTerminal(terminalId: string) {
  const terminal = getTerminal(terminalId);
  if (!terminal) return;

  // Release VM consumer if this is a VM session
  // The VM store will handle cleanup and deletion when no consumers remain
  if (terminal.cloudEnvironment) {
    await releaseVM(terminal.cloudEnvironment.vmId, terminalId);
  }

  removeTerminal(terminalId);

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

  // Flush all buffered output as a single message to avoid race conditions
  if (terminal.bufferedOutput.length > 0) {
    const data = terminal.bufferedOutput.join("");
    sendToRenderer("terminal:data", { sessionId: terminal.id, data });
    terminal.bufferedOutput = [];
  }

  // Execute any pending command (from workspace restore)
  if (terminal.pendingCommand) {
    terminal.pty.write(`${terminal.pendingCommand}\r`);
    terminal.pendingCommand = undefined;
  }

  // If this is a VM session, send the SSH command now that the terminal is ready
  if (terminal.cloudEnvironment) {
    let sshCommand: string;

    if (terminal.cloudEnvironment.useSSHKey) {
      // Use SSH key authentication with the Conduit key
      const keyPath = getPrivateKeyPath();
      sshCommand = `ssh -q -o LogLevel=QUIET -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i "${keyPath}" -p ${terminal.cloudEnvironment.sshPort} ace@${terminal.cloudEnvironment.vmHost}\n`;
    } else {
      // Use password authentication
      sshCommand = `ssh -q -o LogLevel=QUIET -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p ${terminal.cloudEnvironment.sshPort} ace@${terminal.cloudEnvironment.vmHost}\n`;
      console.log(
        `[VM] Terminal ready, sending SSH command: ${sshCommand.trim()}`,
      );
    }

    terminal.pty.write(sshCommand);

    // If there's git state to apply, delegate to VM store
    const hasGitSync =
      (terminal.cloudEnvironment.syncLocalGitState ||
        terminal.cloudEnvironment.hasUnpushedCommits) &&
      terminal.cloudEnvironment.repoName;

    if (hasGitSync) {
      // Sync git state asynchronously via VM store
      syncGitStateToVM(terminal.cloudEnvironment.vmId, (type, message) => {
        sendToRenderer("notification:show", {
          type,
          message,
          timeout: type === "error" ? 5000 : 3000,
        });
      });
    }
  }
}
