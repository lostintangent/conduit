/**
 * VM Store - Centralized management of VM sessions and connections.
 *
 * This store decouples VM connection management from terminal panes,
 * allowing multiple pane types (terminal, editor, agent, browser) to
 * independently interact with VMs.
 *
 * Design:
 * - Each VM has a single VMSession that tracks its state
 * - Panes "acquire" a VM session and "release" when done
 * - The conduit-server WebSocket connection is shared across all consumers
 * - VMs are cleaned up when no consumers remain (with optional grace period)
 */

import { withRetry } from "../utils/retry";
import type { VM } from "./client";
import { getVM } from "./client";
import { getSandboxIPCUrl, SandboxIPCClient } from "./sandbox-ipc-client";

// ============================================================================
// Types
// ============================================================================

/**
 * Type of pane/component consuming a VM session
 */
export type VMConsumerType =
  | "terminal"
  | "editor"
  | "agent"
  | "browser"
  | "other";

/**
 * Connection state for a VM session
 */
export type VMConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"
  | "disposed";

/**
 * Information about a consumer using this VM
 */
export interface VMConsumer {
  id: string; // Unique consumer ID (usually paneId or sessionId)
  type: VMConsumerType;
  acquiredAt: number;
  metadata?: Record<string, unknown>; // Optional consumer-specific data
}

/**
 * Git sync state that needs to be applied when VM is ready
 * Patches are created in the main process when needed (not passed through IPC)
 */
export interface VMGitSyncState {
  localRepoCwd?: string; // Local repo path for creating patches and SSH push
  syncLocalGitState?: boolean; // Whether to sync uncommitted changes
  hasUnpushedCommits?: boolean; // Whether to push commits via SSH
  repoName?: string;
  localBranch?: string;
  branchExistsOnRemote?: boolean;
}

/**
 * A VM session represents an active connection to a cloud VM.
 * Multiple consumers (panes) can share the same VM session.
 */
export interface VMSession {
  // Core identity
  vmId: string;
  vm: VM;

  // Connection state
  connectionState: VMConnectionState;
  sandboxClient: SandboxIPCClient | null;
  sandboxUrl: string | null;
  lastError?: string;

  // SSH info (for terminal connections)
  sshHost: string;
  sshPort: number;
  useSSHKey: boolean;

  // Port forwarding (shared across all consumers)
  forwardedPorts: Map<number, string>; // internal port -> connection URL
  detectedPorts: Set<number>; // ports detected but not yet forwarded

  // Consumer tracking
  consumers: Map<string, VMConsumer>;

  // Git sync state (for initial sync when terminal connects)
  gitSyncState?: VMGitSyncState;
  gitSyncCompleted: boolean;

  // Lifecycle
  createdAt: number;
  lastActivityAt: number;
}

/**
 * Options for acquiring a VM session
 */
export interface AcquireVMOptions {
  /** Consumer ID (usually paneId) */
  consumerId: string;
  /** Type of consumer */
  consumerType: VMConsumerType;
  /** Whether to connect conduit-server immediately */
  connectSandbox?: boolean;
  /** Whether SSH key auth should be used */
  useSSHKey?: boolean;
  /** Git sync state to apply when ready */
  gitSyncState?: VMGitSyncState;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Store State
// ============================================================================

const vmSessions = new Map<string, VMSession>();

/** Pending connection promises to prevent duplicate connections */
const pendingConnections = new Map<string, Promise<SandboxIPCClient>>();

// Event listeners for session state changes
type SessionEventType =
  | "created"
  | "updated"
  | "disposed"
  | "connectionStateChanged";
type SessionEventHandler = (
  vmId: string,
  session: VMSession | null,
  event: SessionEventType,
) => void;
const sessionEventHandlers = new Set<SessionEventHandler>();

// ============================================================================
// Event Handling
// ============================================================================

/**
 * Subscribe to VM session events
 */
export function onSessionEvent(handler: SessionEventHandler): () => void {
  sessionEventHandlers.add(handler);
  return () => sessionEventHandlers.delete(handler);
}

/**
 * Emit a session event to all listeners
 */
function emitSessionEvent(
  vmId: string,
  session: VMSession | null,
  event: SessionEventType,
): void {
  for (const handler of sessionEventHandlers) {
    try {
      handler(vmId, session, event);
    } catch (error) {
      console.error("[VMStore] Event handler error:", error);
    }
  }
}

// ============================================================================
// Core API
// ============================================================================

/**
 * Get an existing VM session by ID
 */
export function getVMSession(vmId: string): VMSession | undefined {
  return vmSessions.get(vmId);
}

/**
 * Get all active VM sessions
 */
export function getAllVMSessions(): Map<string, VMSession> {
  return new Map(vmSessions);
}

/**
 * Check if a VM session exists
 */
export function hasVMSession(vmId: string): boolean {
  return vmSessions.has(vmId);
}

/**
 * Acquire a VM session. Creates a new session if one doesn't exist,
 * or adds the consumer to an existing session.
 */
export async function acquireVM(
  vmId: string,
  options: AcquireVMOptions,
): Promise<VMSession> {
  let session = vmSessions.get(vmId);

  if (session) {
    // Add consumer to existing session
    console.log(
      `[VMStore] Adding consumer ${options.consumerId} (${options.consumerType}) to existing session for VM ${vmId}`,
    );

    session.consumers.set(options.consumerId, {
      id: options.consumerId,
      type: options.consumerType,
      acquiredAt: Date.now(),
      metadata: options.metadata,
    });

    // Update git sync state if provided and not already synced
    if (options.gitSyncState && !session.gitSyncCompleted) {
      session.gitSyncState = options.gitSyncState;
    }

    session.lastActivityAt = Date.now();
    emitSessionEvent(vmId, session, "updated");

    // Connect sandbox if requested and not already connected
    if (options.connectSandbox && !session.sandboxClient?.isConnected()) {
      await connectSandbox(vmId);
    }

    return session;
  }

  // Fetch VM info from API
  console.log(`[VMStore] Creating new session for VM ${vmId}`);
  const vm = await getVM(vmId);

  // Extract SSH connection info
  const sshPort = vm.forwarded_ports["22"];
  if (!sshPort) {
    throw new Error(`VM ${vmId} does not have SSH port forwarded`);
  }

  // Parse port from connection URL
  let port: number;
  const url = sshPort.connection_url;
  if (url.includes("://")) {
    const hostname = url.split("://")[1].split(".")[0];
    const portStr = hostname.length === 12 ? hostname.slice(-4) : undefined;
    port = parseInt(portStr || "", 10);
  } else {
    const portStr = url.split(":")[1];
    port = parseInt(portStr, 10);
  }

  if (isNaN(port)) {
    throw new Error(`Could not parse SSH port from ${url}`);
  }

  // Create new session
  session = {
    vmId,
    vm,
    connectionState: "disconnected",
    sandboxClient: null,
    sandboxUrl: getSandboxIPCUrl(vm),
    sshHost: vm.ip_address,
    sshPort: port,
    useSSHKey: options.useSSHKey ?? true,
    forwardedPorts: new Map(),
    detectedPorts: new Set(),
    consumers: new Map(),
    gitSyncState: options.gitSyncState,
    gitSyncCompleted: false,
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };

  // Populate forwarded ports from VM data
  for (const [portStr, info] of Object.entries(vm.forwarded_ports)) {
    const portNum = parseInt(portStr, 10);
    if (!isNaN(portNum)) {
      session.forwardedPorts.set(portNum, info.connection_url);
    }
  }

  // Add the initial consumer
  session.consumers.set(options.consumerId, {
    id: options.consumerId,
    type: options.consumerType,
    acquiredAt: Date.now(),
    metadata: options.metadata,
  });

  vmSessions.set(vmId, session);
  emitSessionEvent(vmId, session, "created");

  // Connect sandbox if requested
  if (options.connectSandbox) {
    await connectSandbox(vmId);
  }

  return session;
}

/**
 * Release a consumer from a VM session.
 * If no consumers remain, the session will be disposed and the VM deleted.
 */
export async function releaseVM(
  vmId: string,
  consumerId: string,
  options?: { immediate?: boolean; deleteVM?: boolean },
): Promise<void> {
  const session = vmSessions.get(vmId);
  if (!session) {
    console.warn(
      `[VMStore] Attempted to release non-existent session: ${vmId}`,
    );
    return;
  }

  const consumer = session.consumers.get(consumerId);
  if (!consumer) {
    console.warn(
      `[VMStore] Consumer ${consumerId} not found in session ${vmId}`,
    );
    return;
  }

  console.log(
    `[VMStore] Releasing consumer ${consumerId} (${consumer.type}) from VM ${vmId}`,
  );
  session.consumers.delete(consumerId);
  session.lastActivityAt = Date.now();

  if (session.consumers.size === 0) {
    if (options?.immediate) {
      await disposeSession(vmId, { deleteVM: options?.deleteVM ?? true });
    } else {
      // Grace period before disposing (could be configurable)
      console.log(
        `[VMStore] No consumers remaining for VM ${vmId}, disposing immediately`,
      );
      await disposeSession(vmId, { deleteVM: options?.deleteVM ?? true });
    }
  } else {
    console.log(
      `[VMStore] VM ${vmId} still has ${session.consumers.size} consumers, keeping alive`,
    );
    emitSessionEvent(vmId, session, "updated");
  }
}

/**
 * Dispose of a VM session, closing all connections and optionally deleting the VM
 */
export async function disposeSession(
  vmId: string,
  options?: { deleteVM?: boolean },
): Promise<void> {
  const session = vmSessions.get(vmId);
  if (!session) {
    return;
  }

  console.log(`[VMStore] Disposing session for VM ${vmId}`);

  // Close sandbox connection
  if (session.sandboxClient) {
    session.sandboxClient.disconnect();
    session.sandboxClient = null;
  }

  session.connectionState = "disposed";
  vmSessions.delete(vmId);
  emitSessionEvent(vmId, null, "disposed");

  // Delete the VM if requested (default: true)
  if (options?.deleteVM !== false) {
    console.log(`[VMStore] Deleting VM ${vmId}`);
    try {
      const { deleteVM } = await import("./client");
      await deleteVM(vmId);
      console.log(`[VMStore] Successfully deleted VM ${vmId}`);
    } catch (error) {
      // Ignore 404 errors - VM was already deleted (e.g., by idle timeout)
      if (error instanceof Error && error.message.includes("404")) {
        console.log(`[VMStore] VM ${vmId} was already deleted`);
      } else {
        console.error(`[VMStore] Failed to delete VM ${vmId}:`, error);
      }
    }
  }
}

/**
 * Dispose all VM sessions
 */
export function disposeAllSessions(): void {
  for (const vmId of vmSessions.keys()) {
    disposeSession(vmId);
  }
}

// ============================================================================
// Sandbox Connection Management
// ============================================================================

/**
 * Connect to the conduit-server server for a VM
 *
 * Uses a pending connection map to prevent duplicate concurrent connections
 * to the same VM. Includes retry logic with exponential backoff for transient
 * network failures.
 */
export async function connectSandbox(vmId: string): Promise<SandboxIPCClient> {
  const session = vmSessions.get(vmId);
  if (!session) {
    throw new Error(`No session exists for VM ${vmId}`);
  }

  // Return existing connection if available
  if (session.sandboxClient?.isConnected()) {
    return session.sandboxClient;
  }

  // Check if there's already a pending connection for this VM
  const pending = pendingConnections.get(vmId);
  if (pending) {
    console.log(
      `[VMStore] Waiting for existing connection attempt for VM ${vmId}`,
    );
    return pending;
  }

  if (!session.sandboxUrl) {
    throw new Error(
      `VM ${vmId} does not have conduit-server port forwarded. ` +
        `Expected port 9876 with label "conduit-server server"`,
    );
  }

  console.log(`[VMStore] Connecting to conduit-server for VM ${vmId}`);
  updateConnectionState(vmId, "connecting");

  // Create and track the connection promise with retries
  const connectionPromise = withRetry(
    async () => {
      // Check if session was disposed while we were retrying
      const currentSession = vmSessions.get(vmId);
      if (!currentSession || currentSession.connectionState === "disposed") {
        throw new Error(`VM ${vmId} session was disposed`);
      }

      const client = new SandboxIPCClient(vmId, session.sandboxUrl!);

      // Set up disconnection callback to update state when connection drops
      client.onDisconnect((disconnectedVmId, reason) => {
        console.log(
          `[VMStore] Sandbox connection lost for VM ${disconnectedVmId}: ${reason}`,
        );
        const currentState = vmSessions.get(disconnectedVmId);
        if (currentState && currentState.connectionState !== "disposed") {
          updateConnectionState(disconnectedVmId, "disconnected");
        }
      });

      await client.connect();

      session.sandboxClient = client;
      updateConnectionState(vmId, "connected");

      return client;
    },
    {
      maxRetries: 3,
      shouldAbort: () => {
        const s = vmSessions.get(vmId);
        return !s || s.connectionState === "disposed";
      },
      onRetry: (attempt, error) => {
        console.log(
          `[VMStore] Connection attempt ${attempt}/3 failed for VM ${vmId}: ${error.message}. Retrying...`,
        );
      },
    },
  ).catch((error) => {
    // Handle final failure
    const message = error instanceof Error ? error.message : String(error);
    session.lastError = message;
    updateConnectionState(vmId, "error");
    console.error(`[VMStore] Failed to connect to VM ${vmId}: ${message}`);
    throw error;
  });

  pendingConnections.set(vmId, connectionPromise);

  // Clean up pending connection when done (success or failure)
  connectionPromise.finally(() => {
    pendingConnections.delete(vmId);
  });

  return connectionPromise;
}

/**
 * Get the sandbox client for a VM, connecting if necessary
 */
export async function getSandboxClient(
  vmId: string,
): Promise<SandboxIPCClient | null> {
  const session = vmSessions.get(vmId);
  if (!session) {
    return null;
  }

  if (session.sandboxClient?.isConnected()) {
    return session.sandboxClient;
  }

  // Try to connect
  try {
    return await connectSandbox(vmId);
  } catch {
    return null;
  }
}

/**
 * Disconnect conduit-server for a VM (but keep session alive)
 */
export function disconnectSandbox(vmId: string): void {
  const session = vmSessions.get(vmId);
  if (!session?.sandboxClient) {
    return;
  }

  console.log(`[VMStore] Disconnecting conduit-server for VM ${vmId}`);
  session.sandboxClient.disconnect();
  session.sandboxClient = null;
  updateConnectionState(vmId, "disconnected");
}

// ============================================================================
// Session Updates
// ============================================================================

/**
 * Update the connection state for a VM session
 */
function updateConnectionState(vmId: string, state: VMConnectionState): void {
  const session = vmSessions.get(vmId);
  if (!session) {
    return;
  }

  const previousState = session.connectionState;
  session.connectionState = state;
  session.lastActivityAt = Date.now();

  if (previousState !== state) {
    console.log(
      `[VMStore] VM ${vmId} connection state: ${previousState} -> ${state}`,
    );
    emitSessionEvent(vmId, session, "connectionStateChanged");
  }
}

/**
 * Update VM info (e.g., after refreshing from API)
 */
export async function refreshVMInfo(vmId: string): Promise<VMSession | null> {
  const session = vmSessions.get(vmId);
  if (!session) {
    return null;
  }

  try {
    const vm = await getVM(vmId);
    session.vm = vm;

    // Update forwarded ports
    session.forwardedPorts.clear();
    for (const [portStr, info] of Object.entries(vm.forwarded_ports)) {
      const portNum = parseInt(portStr, 10);
      if (!isNaN(portNum)) {
        session.forwardedPorts.set(portNum, info.connection_url);
      }
    }

    // Update sandbox URL in case it changed
    session.sandboxUrl = getSandboxIPCUrl(vm);

    session.lastActivityAt = Date.now();
    emitSessionEvent(vmId, session, "updated");

    return session;
  } catch (error) {
    console.error(`[VMStore] Failed to refresh VM ${vmId}:`, error);
    return session;
  }
}

/**
 * Mark git sync as completed for a VM session
 */
export function markGitSyncCompleted(vmId: string): void {
  const session = vmSessions.get(vmId);
  if (session) {
    session.gitSyncCompleted = true;
    session.gitSyncState = undefined; // Clear the pending state
    session.lastActivityAt = Date.now();
    emitSessionEvent(vmId, session, "updated");
  }
}

/**
 * Sync local git state to a VM.
 * This handles:
 * - Waiting for repo clone to complete
 * - Creating local branch if it doesn't exist on remote
 * - Pushing unpushed commits via SSH
 * - Applying working tree patches (staged/unstaged/untracked)
 *
 * @param vmId - The VM to sync to
 * @param sendNotification - Callback to send notifications to renderer
 * @returns Promise that resolves when sync is complete (or fails)
 */
export async function syncGitStateToVM(
  vmId: string,
  sendNotification: (type: "success" | "error", message: string) => void,
): Promise<boolean> {
  const session = vmSessions.get(vmId);
  if (!session) {
    console.error(`[VMStore] No session for VM ${vmId}`);
    return false;
  }

  if (session.gitSyncCompleted) {
    console.log(`[VMStore] Git sync already completed for VM ${vmId}`);
    return true;
  }

  const gitState = session.gitSyncState;
  if (!gitState) {
    console.log(`[VMStore] No git state to sync for VM ${vmId}`);
    return true;
  }

  const {
    localRepoCwd,
    syncLocalGitState,
    hasUnpushedCommits,
    localBranch,
    branchExistsOnRemote,
  } = gitState;
  const repoPath = "/workspace";

  // Wait for repo clone to complete
  const repoReady = await waitForRepoClone(vmId);
  if (!repoReady) {
    sendNotification("error", "Timeout waiting for repo clone");
    return false;
  }

  try {
    const { executeInVM, configureVMForGitPush } = await import("./client");

    // Step 0: Create local branch if it doesn't exist on remote
    if (!branchExistsOnRemote && localBranch) {
      console.log(`[VMStore] Creating branch "${localBranch}" on VM ${vmId}`);

      const createBranchResult = await executeInVM(
        vmId,
        "bash",
        ["-c", `cd ${repoPath} && git checkout -b ${localBranch}`],
        10,
      );

      if (createBranchResult.exit_code !== 0) {
        console.error(
          `[VMStore] Failed to create branch:`,
          createBranchResult.stderr,
        );
        sendNotification(
          "error",
          `Failed to create branch: ${createBranchResult.stderr}`,
        );
        return false;
      }

      console.log(`[VMStore] Created branch "${localBranch}" on VM`);
    }

    // Step 1: Push unpushed commits via SSH
    if (hasUnpushedCommits && localRepoCwd && session.useSSHKey) {
      console.log(`[VMStore] Configuring git to accept pushes on VM ${vmId}`);

      const configResult = await configureVMForGitPush(vmId, repoPath);
      if (!configResult.success) {
        console.error(`[VMStore] Failed to configure git:`, configResult.error);
        sendNotification(
          "error",
          `Failed to configure git: ${configResult.error}`,
        );
        return false;
      }

      console.log(`[VMStore] Pushing commits via SSH from ${localRepoCwd}`);

      const { pushCommitsViaSSH } = await import("../agent/git");
      const { getPrivateKeyPath } = await import("./ssh-keys");

      const sshKeyPath = getPrivateKeyPath();
      const pushSuccess = await pushCommitsViaSSH(
        localRepoCwd,
        session.sshHost,
        session.sshPort,
        sshKeyPath,
        repoPath,
      );

      if (!pushSuccess) {
        console.error(`[VMStore] Failed to push commits via SSH`);
        sendNotification("error", "Failed to push commits to VM");
        return false;
      }

      console.log(`[VMStore] Successfully pushed commits via SSH`);
    }

    // Step 2: Apply working tree patches
    if (syncLocalGitState && localRepoCwd) {
      console.log(
        `[VMStore] Creating patches from local repo: ${localRepoCwd}`,
      );

      const { createDiffPatch } = await import("../agent/git");
      const patches = await createDiffPatch(localRepoCwd);

      if (!patches) {
        console.warn(
          `[VMStore] No patches created despite syncLocalGitState flag`,
        );
      } else {
        const patchSummary = [];
        if (patches.stagedPatch)
          patchSummary.push(`staged: ${patches.stagedPatch.length}b`);
        if (patches.unstagedPatch)
          patchSummary.push(`unstaged: ${patches.unstagedPatch.length}b`);
        if (patches.untrackedPatch)
          patchSummary.push(`untracked: ${patches.untrackedPatch.length}b`);
        console.log(`[VMStore] Applying patches: ${patchSummary.join(", ")}`);

        const sandboxClient = await connectSandbox(vmId);

        const patchResult = await sandboxClient.applyPatches({
          staged: patches.stagedPatch,
          unstaged: patches.unstagedPatch,
          untracked: patches.untrackedPatch,
        });

        if (!patchResult.success) {
          console.error(
            `[VMStore] Failed to apply patches:`,
            patchResult.error,
          );
          sendNotification(
            "error",
            `Failed to sync working tree: ${patchResult.error}`,
          );
          return false;
        }

        console.log(
          `[VMStore] Successfully applied patches via conduit-server`,
          patchResult.applied ? `(${patchResult.applied.join(", ")})` : "",
        );
      }
    }

    // Mark sync as completed
    markGitSyncCompleted(vmId);
    sendNotification("success", "Local changes synced to VM");
    return true;
  } catch (error) {
    console.error(`[VMStore] Error syncing git state:`, error);
    sendNotification("error", "Error syncing local changes");
    return false;
  }
}

/**
 * Wait for repo clone to complete on a VM
 */
async function waitForRepoClone(vmId: string): Promise<boolean> {
  const maxAttempts = 6; // 6 attempts * 5 seconds each = 30 seconds max

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { executeInVM } = await import("./client");

      const startTime = Date.now();
      const checkResult = await executeInVM(
        vmId,
        "bash",
        [
          "-c",
          `cd /workspace || exit 1; for i in {1..5}; do if git status > /dev/null 2>&1; then echo "ready"; exit 0; fi; sleep 1; done; echo "not-ready"; exit 1`,
        ],
        7,
      );
      const elapsed = Date.now() - startTime;

      const status = checkResult.stdout?.trim() || "unknown";
      console.log(
        `[VMStore] Repo check attempt ${attempt}: status="${status}", exit=${checkResult.exit_code}, elapsed=${elapsed}ms`,
      );

      if (checkResult.exit_code === 0 && status === "ready") {
        console.log(`[VMStore] Repository ready after attempt ${attempt}`);
        return true;
      }
    } catch (error) {
      console.log(`[VMStore] Repo check attempt ${attempt} failed:`, error);
    }
  }

  console.warn(
    `[VMStore] Timeout waiting for repo clone after ${maxAttempts} attempts`,
  );
  return false;
}

/**
 * Add a forwarded port to a VM session
 */
export function addForwardedPort(
  vmId: string,
  internalPort: number,
  connectionUrl: string,
): void {
  const session = vmSessions.get(vmId);
  if (session) {
    session.forwardedPorts.set(internalPort, connectionUrl);
    session.detectedPorts.delete(internalPort); // Remove from detected
    session.lastActivityAt = Date.now();
    emitSessionEvent(vmId, session, "updated");
  }
}

/**
 * Add a detected port to a VM session
 */
export function addDetectedPort(vmId: string, port: number): void {
  const session = vmSessions.get(vmId);
  if (session && !session.forwardedPorts.has(port)) {
    session.detectedPorts.add(port);
    session.lastActivityAt = Date.now();
    emitSessionEvent(vmId, session, "updated");
  }
}

/**
 * Get consumers of a specific type for a VM
 */
export function getConsumersByType(
  vmId: string,
  type: VMConsumerType,
): VMConsumer[] {
  const session = vmSessions.get(vmId);
  if (!session) {
    return [];
  }

  return Array.from(session.consumers.values()).filter((c) => c.type === type);
}

/**
 * Check if a VM has any consumers of a specific type
 */
export function hasConsumerType(vmId: string, type: VMConsumerType): boolean {
  return getConsumersByType(vmId, type).length > 0;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a summary of all active VM sessions (for debugging/logging)
 */
export function getSessionsSummary(): Array<{
  vmId: string;
  state: VMConnectionState;
  consumerCount: number;
  consumerTypes: VMConsumerType[];
}> {
  return Array.from(vmSessions.values()).map((session) => ({
    vmId: session.vmId,
    state: session.connectionState,
    consumerCount: session.consumers.size,
    consumerTypes: Array.from(
      new Set(Array.from(session.consumers.values()).map((c) => c.type)),
    ),
  }));
}
