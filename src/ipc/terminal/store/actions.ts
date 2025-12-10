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
import { resolveShell, spawnTerminalProcess } from "../pty";
import type { SendToRendererFn, TerminalInstance } from "../types";

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
  options?: TerminalCreateOptions,
) {
  const id = randomUUID();

  // Check if this should be a remote VM session
  if (options?.isRemoteVM || options?.existingVMId) {
    try {
      let vm;

      if (options?.existingVMId) {
        // Connect to an existing VM
        const { getVM } = await import("../../vm/client");
        vm = await getVM(options.existingVMId);
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

      if (!options?.existingVMId) {
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

      // Spawn a regular local shell
      const homeDirectory =
        process.env.HOME ?? process.env.USERPROFILE ?? process.cwd();
      const pty = spawnTerminalProcess(id, homeDirectory);

      const session: TerminalInstance = {
        id,
        pty,
        lastProcessName: `VM ${vm.id}`,
        isRendererReady: false,
        bufferedOutput: [],
        cloudEnvironment: {
          vmId: vm.id,
          vmHost: sshInfo.host,
          sshPort: sshInfo.port,
          imageId: vm.image_id,
          useSSHKey,
          connectionState: "connecting",
          connectionStartTime: Date.now(),
          detectedPorts: new Set(),
          forwardedPorts: new Map(),
          localRepoCwd: options.localRepoCwd,
          diffPatches: options.diffPatches,
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
  });
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

    // If there's git state to apply (working tree changes), schedule it after repo clone
    const hasDiffPatch = terminal.cloudEnvironment.diffPatches;
    const hasLocalRepoCwd = terminal.cloudEnvironment.localRepoCwd;
    const hasGitSync =
      (hasDiffPatch || hasLocalRepoCwd) && terminal.cloudEnvironment.repoName;

    if (hasGitSync) {
      console.log(`[VM] Will apply git state after repo clone completes`);
      if (hasLocalRepoCwd) {
        console.log(
          `[VM] - Will push commits via SSH from: ${hasLocalRepoCwd}`,
        );
      }
      if (hasDiffPatch) {
        const patches = [];
        if (terminal.cloudEnvironment.diffPatches!.staged)
          patches.push(
            `staged: ${terminal.cloudEnvironment.diffPatches!.staged.length}b`,
          );
        if (terminal.cloudEnvironment.diffPatches!.unstaged)
          patches.push(
            `unstaged: ${terminal.cloudEnvironment.diffPatches!.unstaged.length}b`,
          );
        if (terminal.cloudEnvironment.diffPatches!.untracked)
          patches.push(
            `untracked: ${terminal.cloudEnvironment.diffPatches!.untracked.length}b`,
          );
        console.log(`[VM] - Working tree patches: ${patches.join(", ")}`);
      }

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
              [
                "-c",
                `cd /workspace || exit 1; for i in {1..5}; do if git status > /dev/null 2>&1; then echo "ready"; exit 0; fi; sleep 1; done; echo "not-ready"; exit 1`,
              ],
              7, // 5 seconds loop + 2 seconds buffer
            );
            const elapsed = Date.now() - startTime;

            const status = checkResult.stdout?.trim() || "unknown";
            console.log(
              `[VM] Repo check attempt ${attempt}: status="${status}", exit=${checkResult.exit_code}, elapsed=${elapsed}ms`,
            );

            if (checkResult.exit_code === 0 && status === "ready") {
              console.log(`[VM] Repository ready after attempt ${attempt}`);
              return true;
            }
          } catch (error) {
            console.log(`[VM] Repo check attempt ${attempt} failed:`, error);
          }
        }

        console.warn(
          `[VM] Timeout waiting for repo clone after ${maxAttempts} attempts`,
        );
        return false;
      };

      // Wait for repo, then apply bundle and patches
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

        const repoPath = `/workspace`;
        const { executeInVM } = await import("../../vm/client");

        try {
          // Step 0: If local branch doesn't exist on remote, create it on VM first
          if (
            !terminal.cloudEnvironment!.branchExistsOnRemote &&
            terminal.cloudEnvironment!.localBranch
          ) {
            console.log(
              `[VM] Local branch "${terminal.cloudEnvironment!.localBranch}" doesn't exist on remote, creating it on VM`,
            );

            // Create and checkout the new branch on VM
            const createBranchResult = await executeInVM(
              terminal.cloudEnvironment!.vmId,
              "bash",
              [
                "-c",
                `cd ${repoPath} && git checkout -b ${terminal.cloudEnvironment!.localBranch}`,
              ],
              10,
            );

            if (createBranchResult.exit_code !== 0) {
              console.error(
                `[VM] Failed to create branch:`,
                createBranchResult.stderr,
              );
              sendToRenderer("notification:show", {
                type: "error",
                message: `Failed to create branch: ${createBranchResult.stderr}`,
                timeout: 5000,
              });
              return;
            }

            console.log(
              `[VM] Created branch "${terminal.cloudEnvironment!.localBranch}" on VM`,
            );
          }

          // Step 1: Configure VM to accept git pushes, then push commits via SSH
          if (hasLocalRepoCwd && terminal.cloudEnvironment!.useSSHKey) {
            const { configureVMForGitPush } = await import("../../vm/client");
            console.log(`[VM] Configuring git to accept pushes`);

            const configResult = await configureVMForGitPush(
              terminal.cloudEnvironment!.vmId,
              repoPath,
            );

            if (!configResult.success) {
              console.error(
                `[VM] Failed to configure git:`,
                configResult.error,
              );
              sendToRenderer("notification:show", {
                type: "error",
                message: `Failed to configure git: ${configResult.error}`,
                timeout: 5000,
              });
              return;
            }

            console.log(`[VM] Pushing commits via SSH from ${hasLocalRepoCwd}`);

            // Import pushCommitsViaSSH from agent
            const { pushCommitsViaSSH } = await import("../../agent/git");
            const { getPrivateKeyPath } = await import("../../vm/ssh-keys");

            const sshKeyPath = getPrivateKeyPath();
            const pushSuccess = await pushCommitsViaSSH(
              hasLocalRepoCwd,
              terminal.cloudEnvironment!.vmHost,
              terminal.cloudEnvironment!.sshPort,
              sshKeyPath,
              repoPath,
            );

            if (!pushSuccess) {
              console.error(`[VM] Failed to push commits via SSH`);
              sendToRenderer("notification:show", {
                type: "error",
                message: `Failed to push commits to VM`,
                timeout: 5000,
              });
              return;
            }

            console.log(`[VM] Successfully pushed commits via SSH`);
          }

          // Step 2: Apply working tree patches (staged/unstaged/untracked)
          if (hasDiffPatch) {
            const { applyDiffToVM } = await import("../../vm/client");
            const patches = [];
            if (terminal.cloudEnvironment!.diffPatches!.staged)
              patches.push(
                `staged: ${terminal.cloudEnvironment!.diffPatches!.staged.length}b`,
              );
            if (terminal.cloudEnvironment!.diffPatches!.unstaged)
              patches.push(
                `unstaged: ${terminal.cloudEnvironment!.diffPatches!.unstaged.length}b`,
              );
            if (terminal.cloudEnvironment!.diffPatches!.untracked)
              patches.push(
                `untracked: ${terminal.cloudEnvironment!.diffPatches!.untracked.length}b`,
              );
            console.log(
              `[VM] Applying working tree patches: ${patches.join(", ")}`,
            );

            const patchResult = await applyDiffToVM(
              terminal.cloudEnvironment!.vmId,
              terminal.cloudEnvironment!.diffPatches!,
              repoPath,
            );

            if (!patchResult.success) {
              console.error(
                `[VM] Failed to apply working tree patch:`,
                patchResult.error,
              );
              sendToRenderer("notification:show", {
                type: "error",
                message: `Failed to sync working tree: ${patchResult.error}`,
                timeout: 5000,
              });
              return;
            }

            console.log(`[VM] Successfully applied working tree patch`);
          }

          // Success - all git state synced
          sendToRenderer("notification:show", {
            type: "success",
            message: "Local changes synced to VM",
            timeout: 3000,
          });
        } catch (error) {
          console.error(`[VM] Error syncing git state:`, error);
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
