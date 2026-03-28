/**
 * SandboxIPCClient - WebSocket client for connecting to the sandbox-ipc-provider
 * running inside a cloud VM.
 *
 * The sandbox-ipc server runs on port 9876 inside the VM and is automatically
 * forwarded with the label "sandbox-ipc server" when the VM is created.
 */

import WebSocket from "ws";
import { calculateBackoffWithJitter, withRetry } from "../utils/retry";
import type { VM } from "./client";

// ============================================================================
// Types matching sandbox-ipc-provider-go/types/types.go
// ============================================================================

export type PatchType = "staged" | "unstaged" | "untracked";

export interface ApplyPatchesRequest {
  staged?: string; // base64-encoded patch
  unstaged?: string; // base64-encoded patch
  untracked?: string; // base64-encoded patch
}

export interface ApplyPatchesResult {
  success: boolean;
  error?: string;
  applied?: string[];
  filesAffected?: number;
}

export interface ChunkedPatchInfo {
  patchType: PatchType;
  totalSize: number;
  totalChunks: number;
}

export interface StartChunkedPatchResponse {
  sessionId: string;
  ready: boolean;
  error?: string;
}

export interface PatchChunk {
  sessionId: string;
  patchType: PatchType;
  chunkIndex: number;
  totalChunks: number;
  data: string; // base64-encoded chunk data
  totalSize: number;
}

export interface PatchChunkAck {
  sessionId: string;
  chunkIndex: number;
  received: boolean;
  error?: string;
}

export interface GitStatus {
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  files: Record<string, GitFileStatus>;
}

export interface GitFileStatus {
  path: string;
  status: string;
  staged: boolean;
  originalPath?: string;
}

// ============================================================================
// WebSocket Message Types
// ============================================================================

interface WSRequest {
  id: number;
  method: string;
  params?: unknown;
}

interface WSResponse {
  type: "response" | "error" | "event";
  id?: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
  event?: string;
  data?: unknown;
}

// ============================================================================
// Constants
// ============================================================================

const SANDBOX_IPC_PORT = 9876;
const SANDBOX_IPC_LABEL = "sandbox-ipc server";
const DEFAULT_TIMEOUT_MS = 30000;
const CHUNK_SIZE = 64 * 1024; // 64KB chunks
const LARGE_PATCH_THRESHOLD = 512 * 1024; // 512KB - use chunked for larger

// Heartbeat configuration to keep WebSocket connection alive
// Note: The Go server also sends pings, so we're mainly tracking connection health here
const HEARTBEAT_INTERVAL_MS = 30000; // Send ping every 30 seconds
const HEARTBEAT_TIMEOUT_MS = 20000; // Wait 20 seconds for pong response (increased for cloud latency)
const MAX_MISSED_PONGS = 3; // Close connection after this many missed pongs

// Reconnection configuration
const RECONNECT_INITIAL_DELAY_MS = 1000; // Start with 1 second delay
const RECONNECT_MAX_DELAY_MS = 30000; // Max 30 seconds between attempts
const RECONNECT_MAX_ATTEMPTS = 10; // Give up after 10 attempts
const RECONNECT_BACKOFF_MULTIPLIER = 1.5; // Exponential backoff factor
const RECONNECT_JITTER_FACTOR = 0.2; // ±10% jitter to prevent thundering herd

// Operation queue configuration
const MAX_OPERATION_QUEUE_SIZE = 100; // Prevent unbounded queue growth during outages
const MIN_REMAINING_TIMEOUT_MS = 1000; // Minimum timeout for queued operations

// ============================================================================
// Connection State Types
// ============================================================================

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface ConnectionStatus {
  state: ConnectionState;
  lastConnectedAt?: Date;
  lastDisconnectedAt?: Date;
  reconnectAttempt?: number;
  reconnectMaxAttempts?: number;
  nextReconnectAt?: Date;
  error?: string;
}

// Queued operation during reconnection
interface QueuedOperation {
  method: string;
  params?: unknown;
  timeoutMs: number;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  queuedAt: number;
}

/**
 * Get the sandbox-ipc WebSocket URL from a VM's forwarded ports
 */
export function getSandboxIPCUrl(vm: VM): string | null {
  // Find the port with label "sandbox-ipc server"
  for (const [port, info] of Object.entries(vm.forwarded_ports)) {
    if (
      info.description === SANDBOX_IPC_LABEL ||
      port === SANDBOX_IPC_PORT.toString()
    ) {
      // Convert HTTP URL to WebSocket URL
      const wsUrl = info.connection_url
        .replace("https://", "wss://")
        .replace("http://", "ws://");
      return `${wsUrl}/ws`;
    }
  }
  return null;
}

// ============================================================================
// SandboxIPCClient
// ============================================================================

export class SandboxIPCClient {
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();
  private eventHandlers = new Map<string, Set<(data: unknown) => void>>();
  private connectionPromise: Promise<void> | null = null;

  // Heartbeat state
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private heartbeatTimeout: NodeJS.Timeout | null = null;
  private missedPongs = 0;

  // Disconnection callback for external notification
  private onDisconnectCallback:
    | ((vmId: string, reason: string) => void)
    | null = null;

  // Reconnection state
  private connectionState: ConnectionState = "disconnected";
  private reconnectAttempt = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private lastConnectedAt?: Date;
  private lastDisconnectedAt?: Date;
  private operationQueue: QueuedOperation[] = [];
  private isReconnectEnabled = true;
  private wasConnectedBefore = false;

  // Status change callback for UI updates
  private onStatusChangeCallback: ((status: ConnectionStatus) => void) | null =
    null;

  constructor(
    public readonly vmId: string,
    public readonly url: string,
  ) {}

  /**
   * Set a callback to be notified when the connection is lost.
   * This allows external code (like VM store) to react to disconnections.
   */
  onDisconnect(callback: (vmId: string, reason: string) => void): void {
    this.onDisconnectCallback = callback;
  }

  /**
   * Set a callback to be notified when connection status changes.
   * This enables UI to show reconnection progress.
   */
  onStatusChange(callback: (status: ConnectionStatus) => void): void {
    this.onStatusChangeCallback = callback;
  }

  /**
   * Get current connection status
   */
  getStatus(): ConnectionStatus {
    const status: ConnectionStatus = {
      state: this.connectionState,
      lastConnectedAt: this.lastConnectedAt,
      lastDisconnectedAt: this.lastDisconnectedAt,
    };

    if (this.connectionState === "reconnecting") {
      status.reconnectAttempt = this.reconnectAttempt;
      status.reconnectMaxAttempts = RECONNECT_MAX_ATTEMPTS;
    }

    return status;
  }

  /**
   * Enable or disable automatic reconnection
   */
  setReconnectEnabled(enabled: boolean): void {
    this.isReconnectEnabled = enabled;
    if (!enabled) {
      this.cancelReconnect();
    }
  }

  /**
   * Manually trigger a reconnection attempt.
   * Useful for UI "Reconnect" buttons.
   */
  async reconnect(): Promise<void> {
    // Cancel any pending automatic reconnect
    this.cancelReconnect();

    // Reset attempt counter for manual reconnection
    this.reconnectAttempt = 0;

    // Re-enable reconnection in case it was disabled
    this.isReconnectEnabled = true;

    // Close existing connection if any
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.cleanupConnection();

    // Attempt fresh connection
    this.updateConnectionState("reconnecting");
    await this.connect();
  }

  /**
   * Connect to the sandbox-ipc server
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    // Cancel any pending reconnect
    this.cancelReconnect();

    this.updateConnectionState("connecting");

    this.connectionPromise = new Promise<void>((resolve, reject) => {
      console.log(`[SandboxIPC] Connecting to ${this.url}`);

      this.ws = new WebSocket(this.url);

      const timeout = setTimeout(() => {
        this.ws?.close();
        reject(new Error(`Connection timeout to ${this.url}`));
      }, 10000);

      // Track if we've resolved to avoid double resolution
      let resolved = false;

      this.ws.on("open", () => {
        // WebSocket is open, but wait for server's "connected" event
        // before considering the connection fully established
        console.log(
          `[SandboxIPC] WebSocket open to VM ${this.vmId}, waiting for server ready...`,
        );
      });

      this.ws.on("error", (error) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          console.error(`[SandboxIPC] WebSocket error:`, error);
          reject(error);
        }
      });

      this.ws.on("close", (code, reason) => {
        const reasonStr = reason?.toString() || "none";
        console.log(
          `[SandboxIPC] Disconnected from VM ${this.vmId} (code: ${code}, reason: ${reasonStr})`,
        );

        // Track disconnection time
        this.lastDisconnectedAt = new Date();

        // Notify external listeners about disconnection
        if (resolved && this.onDisconnectCallback) {
          this.onDisconnectCallback(
            this.vmId,
            `code: ${code}, reason: ${reasonStr}`,
          );
        }

        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          reject(new Error("Connection closed before server ready"));
        }

        // Clean up but don't reject queued operations yet - we might reconnect
        this.cleanupConnection();

        // Attempt reconnection if we were previously connected and it wasn't intentional
        const wasIntentionalClose = code === 1000 || code === 1001;
        if (
          this.wasConnectedBefore &&
          this.isReconnectEnabled &&
          !wasIntentionalClose
        ) {
          this.scheduleReconnect();
        } else {
          // No reconnection - reject all queued operations
          this.rejectQueuedOperations("Connection closed");
          this.updateConnectionState("disconnected");
        }
      });

      // Handle pong responses to our ping
      this.ws.on("pong", () => {
        this.missedPongs = 0;
        if (this.heartbeatTimeout) {
          clearTimeout(this.heartbeatTimeout);
          this.heartbeatTimeout = null;
        }
      });

      this.ws.on("message", (data) => {
        // Check for the "connected" event from the server
        try {
          const message = JSON.parse(data.toString());
          if (message.type === "event" && message.event === "connected") {
            if (!resolved) {
              resolved = true;
              clearTimeout(timeout);
              console.log(
                `[SandboxIPC] Connected to VM ${this.vmId}`,
                message.data?.hasGit ? "(git available)" : "(no git)",
              );
              // Mark successful connection
              this.lastConnectedAt = new Date();
              this.wasConnectedBefore = true;
              this.reconnectAttempt = 0;
              this.updateConnectionState("connected");

              // Start heartbeat after connection is established
              this.startHeartbeat();

              // Process any queued operations
              this.flushOperationQueue();

              resolve();
            }
            // Still process the event for any registered handlers
          }
        } catch {
          // Ignore parse errors during connection phase
        }

        // Always pass to the handler for proper event/response processing
        this.handleMessage(data);
      });
    });

    try {
      await this.connectionPromise;
    } finally {
      this.connectionPromise = null;
    }
  }

  /**
   * Disconnect from the server (intentional disconnect - no reconnection)
   */
  disconnect(): void {
    // Disable reconnection for intentional disconnects
    this.isReconnectEnabled = false;
    this.cancelReconnect();

    if (this.ws) {
      this.ws.close(1000, "Client disconnect");
      this.ws = null;
    }
    this.cleanup();
    this.updateConnectionState("disconnected");
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Check if currently reconnecting
   */
  isReconnecting(): boolean {
    return this.connectionState === "reconnecting";
  }

  /**
   * Make an RPC call to the sandbox-ipc server with automatic retry on transient errors.
   * If reconnecting, the operation will be queued and executed after reconnection.
   * Retries are attempted for timeout, connection, and network errors.
   */
  async call<T>(
    method: string,
    params?: unknown,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
    // If we're reconnecting, queue the operation
    if (this.connectionState === "reconnecting") {
      return this.queueOperation<T>(method, params, timeoutMs);
    }

    return withRetry(() => this.callOnce<T>(method, params, timeoutMs), {
      maxRetries: 3,
      onRetry: (attempt, error) => {
        console.log(
          `[SandboxIPC] Retrying ${method} (attempt ${attempt}/3): ${error.message}`,
        );
      },
    });
  }

  /**
   * Queue an operation to be executed after reconnection.
   * Rejects immediately if queue is full to prevent unbounded memory growth.
   */
  private queueOperation<T>(
    method: string,
    params: unknown,
    timeoutMs: number,
  ): Promise<T> {
    // Prevent unbounded queue growth during prolonged outages
    if (this.operationQueue.length >= MAX_OPERATION_QUEUE_SIZE) {
      return Promise.reject(
        new Error(
          `Operation queue full (${MAX_OPERATION_QUEUE_SIZE}). ` +
            `Cannot queue ${method} during reconnection.`,
        ),
      );
    }

    return new Promise<T>((resolve, reject) => {
      console.log(
        `[SandboxIPC] Queueing operation ${method} during reconnection ` +
          `(queue size: ${this.operationQueue.length + 1}/${MAX_OPERATION_QUEUE_SIZE})`,
      );
      this.operationQueue.push({
        method,
        params,
        timeoutMs,
        resolve: resolve as (value: unknown) => void,
        reject,
        queuedAt: Date.now(),
      });
    });
  }

  /**
   * Make a single RPC call without retry (internal use only).
   */
  private async callOnce<T>(
    method: string,
    params?: unknown,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
    // If reconnecting, queue the operation instead of failing immediately
    if (this.connectionState === "reconnecting") {
      return this.queueOperation<T>(method, params, timeoutMs);
    }

    if (!this.isConnected()) {
      throw new Error("Not connected to sandbox-ipc server");
    }

    const id = ++this.requestId;
    const request: WSRequest = { id, method };
    if (params !== undefined) {
      request.params = params;
    }

    const requestJson = JSON.stringify(request);

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      this.ws!.send(requestJson, (err) => {
        if (err) {
          console.error(`[SandboxIPC] Send error for ${method}:`, err);
          this.pendingRequests.delete(id);
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }

  /**
   * Subscribe to events from the server.
   */
  on(event: string, handler: (data: unknown) => void): () => void {
    let handlers = this.eventHandlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.eventHandlers.set(event, handlers);
    }
    handlers.add(handler);

    // Return unsubscribe function
    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  // ==========================================================================
  // Git Operations
  // ==========================================================================

  /**
   * Get git status
   */
  async getGitStatus(): Promise<GitStatus> {
    const result = await this.call<{ status: GitStatus }>("git.status");
    return result.status;
  }

  /**
   * Apply patches to the repository (for small patches)
   * Since patches are created in the main process, they are real Buffers - no IPC serialization issues
   */
  async applyPatches(patches: {
    staged?: Buffer | null;
    unstaged?: Buffer | null;
    untracked?: Buffer | null;
  }): Promise<ApplyPatchesResult> {
    // Convert buffers to base64 for JSON-RPC transmission
    const request: ApplyPatchesRequest = {};

    if (patches.staged) {
      request.staged = patches.staged.toString("base64");
    }
    if (patches.unstaged) {
      request.unstaged = patches.unstaged.toString("base64");
    }
    if (patches.untracked) {
      request.untracked = patches.untracked.toString("base64");
    }

    // Check if we need chunked transfer
    const totalSize =
      (patches.staged?.length || 0) +
      (patches.unstaged?.length || 0) +
      (patches.untracked?.length || 0);

    if (totalSize > LARGE_PATCH_THRESHOLD) {
      console.log(
        `[SandboxIPC] Patch size ${totalSize} exceeds threshold, using chunked transfer`,
      );
      return this.applyPatchesChunked(patches);
    }

    return this.call<ApplyPatchesResult>("git.applyPatches", request);
  }

  /**
   * Apply large patches using chunked transfer
   */
  async applyPatchesChunked(patches: {
    staged?: Buffer | null;
    unstaged?: Buffer | null;
    untracked?: Buffer | null;
  }): Promise<ApplyPatchesResult> {
    const sessionId = `${this.vmId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Build patch info for each type
    const patchInfos: ChunkedPatchInfo[] = [];
    const patchData: Array<{ type: PatchType; data: Buffer }> = [];

    if (patches.staged) {
      const chunks = Math.ceil(patches.staged.length / CHUNK_SIZE);
      patchInfos.push({
        patchType: "staged",
        totalSize: patches.staged.length,
        totalChunks: chunks,
      });
      patchData.push({ type: "staged", data: patches.staged });
    }

    if (patches.unstaged) {
      const chunks = Math.ceil(patches.unstaged.length / CHUNK_SIZE);
      patchInfos.push({
        patchType: "unstaged",
        totalSize: patches.unstaged.length,
        totalChunks: chunks,
      });
      patchData.push({ type: "unstaged", data: patches.unstaged });
    }

    if (patches.untracked) {
      const chunks = Math.ceil(patches.untracked.length / CHUNK_SIZE);
      patchInfos.push({
        patchType: "untracked",
        totalSize: patches.untracked.length,
        totalChunks: chunks,
      });
      patchData.push({ type: "untracked", data: patches.untracked });
    }

    // Step 1: Start session
    console.log(
      `[SandboxIPC] Starting chunked patch session ${sessionId} with ${patchInfos.length} patches`,
    );
    const startResponse = await this.call<StartChunkedPatchResponse>(
      "git.startChunkedPatch",
      {
        sessionId,
        patches: patchInfos,
      },
    );

    if (!startResponse.ready) {
      return {
        success: false,
        error: startResponse.error || "Failed to start chunked patch session",
      };
    }

    // Step 2: Send chunks for each patch type
    for (const { type, data } of patchData) {
      const totalChunks = Math.ceil(data.length / CHUNK_SIZE);
      console.log(
        `[SandboxIPC] Sending ${totalChunks} chunks for ${type} patch`,
      );

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, data.length);
        const chunkData = data.subarray(start, end);

        const chunk: PatchChunk = {
          sessionId,
          patchType: type,
          chunkIndex: i,
          totalChunks,
          data: chunkData.toString("base64"),
          totalSize: data.length,
        };

        const ack = await this.call<PatchChunkAck>("git.sendPatchChunk", chunk);

        if (!ack.received) {
          // Cancel session on error
          await this.call("git.cancelChunkedPatch", { sessionId }).catch(
            () => {},
          );
          return {
            success: false,
            error: ack.error || `Failed to send chunk ${i} for ${type}`,
          };
        }
      }
    }

    // Step 3: Finalize and apply
    console.log(`[SandboxIPC] Finalizing chunked patch session ${sessionId}`);
    const result = await this.call<ApplyPatchesResult>(
      "git.finalizeChunkedPatch",
      { sessionId },
    );

    return result;
  }

  /**
   * Stage files
   */
  async stageFiles(files: string[]): Promise<void> {
    await this.call("git.stage", { files });
  }

  /**
   * Unstage files
   */
  async unstageFiles(files: string[]): Promise<void> {
    await this.call("git.unstage", { files });
  }

  /**
   * Commit staged changes
   */
  async commit(
    message: string,
    options?: { all?: boolean },
  ): Promise<{ sha: string }> {
    return this.call("git.commit", { message, options });
  }

  /**
   * Check for uncommitted changes
   */
  async hasUncommittedChanges(): Promise<boolean> {
    const result = await this.call<{ hasChanges: boolean }>(
      "git.hasUncommittedChanges",
    );
    return result.hasChanges;
  }

  /**
   * Check for unpushed commits
   */
  async hasUnpushedCommits(): Promise<boolean> {
    const result = await this.call<{ hasUnpushed: boolean }>(
      "git.hasUnpushedCommits",
    );
    return result.hasUnpushed;
  }

  // ==========================================================================
  // Private methods
  // ==========================================================================

  private handleMessage(data: WebSocket.RawData): void {
    try {
      const message: WSResponse = JSON.parse(data.toString());

      // Handle response to a request
      if (message.type === "response" && message.id !== undefined) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(message.id);
          pending.resolve(message.result);
        }
        return;
      }

      // Handle error response
      if (message.type === "error" && message.id !== undefined) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          clearTimeout(pending.timeout);
          this.pendingRequests.delete(message.id);
          pending.reject(new Error(message.error?.message || "Unknown error"));
        }
        return;
      }

      // Handle event
      if (message.type === "event" && message.event) {
        const handlers = this.eventHandlers.get(message.event);
        if (handlers && handlers.size > 0) {
          for (const handler of handlers) {
            try {
              handler(message.data);
            } catch (error) {
              console.error(
                `[SandboxIPC] Event handler error for ${message.event}:`,
                error,
              );
            }
          }
        }
      }
    } catch (error) {
      console.error("[SandboxIPC] Failed to parse message:", error);
    }
  }

  /**
   * Start the heartbeat mechanism to keep the WebSocket connection alive.
   * Sends periodic pings and expects pongs back within a timeout.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat(); // Clear any existing heartbeat

    this.heartbeatInterval = setInterval(() => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.stopHeartbeat();
        return;
      }

      // Send ping - wrap in try-catch to handle race condition where
      // socket closes between readyState check and ping call
      try {
        this.ws.ping();
      } catch (error) {
        console.warn(
          `[SandboxIPC] Failed to send ping to VM ${this.vmId}:`,
          error,
        );
        this.stopHeartbeat();
        return;
      }

      // Set timeout for pong response
      this.heartbeatTimeout = setTimeout(() => {
        this.missedPongs++;
        console.warn(
          `[SandboxIPC] Missed pong from VM ${this.vmId} (missed: ${this.missedPongs}/${MAX_MISSED_PONGS})`,
        );

        // After MAX_MISSED_PONGS missed pongs, consider connection dead
        if (this.missedPongs >= MAX_MISSED_PONGS) {
          console.error(
            `[SandboxIPC] Connection to VM ${this.vmId} appears dead after ${this.missedPongs} missed pongs, closing`,
          );
          this.ws?.close(4000, "Heartbeat timeout");
        }
      }, HEARTBEAT_TIMEOUT_MS);
    }, HEARTBEAT_INTERVAL_MS);
  }

  /**
   * Stop the heartbeat mechanism
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
    this.missedPongs = 0;
  }

  /**
   * Clean up connection state without rejecting queued operations
   * Used when we might reconnect
   */
  private cleanupConnection(): void {
    // Stop heartbeat
    this.stopHeartbeat();

    // Reject pending requests (they were in-flight and won't get responses)
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Connection closed"));
    }
    this.pendingRequests.clear();
    this.connectionPromise = null;
    this.ws = null;
  }

  /**
   * Full cleanup including queued operations
   * Used when not reconnecting
   */
  private cleanup(): void {
    this.cleanupConnection();
    this.rejectQueuedOperations("Connection closed");
    this.cancelReconnect();
  }

  /**
   * Update connection state and notify listeners
   */
  private updateConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(this.getStatus());
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    if (!this.isReconnectEnabled) {
      return;
    }

    if (this.reconnectAttempt >= RECONNECT_MAX_ATTEMPTS) {
      console.error(
        `[SandboxIPC] Max reconnection attempts (${RECONNECT_MAX_ATTEMPTS}) reached for VM ${this.vmId}`,
      );
      this.rejectQueuedOperations("Max reconnection attempts reached");
      this.updateConnectionState("disconnected");
      return;
    }

    this.reconnectAttempt++;
    this.updateConnectionState("reconnecting");

    // Calculate delay with exponential backoff and jitter to prevent thundering herd
    const delay = calculateBackoffWithJitter(this.reconnectAttempt, {
      initialDelayMs: RECONNECT_INITIAL_DELAY_MS,
      maxDelayMs: RECONNECT_MAX_DELAY_MS,
      multiplier: RECONNECT_BACKOFF_MULTIPLIER,
      jitterFactor: RECONNECT_JITTER_FACTOR,
    });

    console.log(
      `[SandboxIPC] Scheduling reconnection attempt ${this.reconnectAttempt}/${RECONNECT_MAX_ATTEMPTS} for VM ${this.vmId} in ${Math.round(delay)}ms`,
    );

    this.reconnectTimeout = setTimeout(() => {
      this.attemptReconnect();
    }, delay);
  }

  /**
   * Attempt to reconnect to the server
   */
  private async attemptReconnect(): Promise<void> {
    console.log(
      `[SandboxIPC] Attempting reconnection ${this.reconnectAttempt}/${RECONNECT_MAX_ATTEMPTS} to VM ${this.vmId}`,
    );

    try {
      await this.connect();
      console.log(
        `[SandboxIPC] Successfully reconnected to VM ${this.vmId} after ${this.reconnectAttempt} attempts`,
      );
    } catch (error) {
      console.error(
        `[SandboxIPC] Reconnection attempt ${this.reconnectAttempt} failed:`,
        error,
      );
      // Schedule next attempt
      this.scheduleReconnect();
    }
  }

  /**
   * Cancel any pending reconnection attempt
   */
  private cancelReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * Flush the operation queue after successful reconnection.
   *
   * Uses callOnce instead of call to avoid:
   * 1. Re-queueing if connection drops mid-flush (call checks reconnecting state)
   * 2. Unnecessary retry wrapping (operations may have their own retry logic)
   */
  private async flushOperationQueue(): Promise<void> {
    if (this.operationQueue.length === 0) {
      return;
    }

    console.log(
      `[SandboxIPC] Flushing ${this.operationQueue.length} queued operations after reconnection`,
    );

    // Take a copy and clear the queue
    const queue = [...this.operationQueue];
    this.operationQueue = [];

    for (const op of queue) {
      // Check if operation has expired (queued too long)
      const elapsed = Date.now() - op.queuedAt;
      if (elapsed > op.timeoutMs) {
        console.log(
          `[SandboxIPC] Queued operation ${op.method} expired after ${elapsed}ms`,
        );
        op.reject(
          new Error(`Operation ${op.method} expired while reconnecting`),
        );
        continue;
      }

      // Calculate remaining timeout, ensuring a minimum to avoid edge cases
      const remainingTimeout = Math.max(
        MIN_REMAINING_TIMEOUT_MS,
        op.timeoutMs - elapsed,
      );

      // Execute the operation using callOnce to avoid:
      // - Re-queueing if we disconnect mid-flush (call() checks reconnecting state)
      // - Double retry wrapping (the original caller may retry on failure)
      try {
        const result = await this.callOnce(
          op.method,
          op.params,
          remainingTimeout,
        );
        op.resolve(result);
      } catch (error) {
        op.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * Reject all queued operations
   */
  private rejectQueuedOperations(reason: string): void {
    for (const op of this.operationQueue) {
      op.reject(new Error(reason));
    }
    this.operationQueue = [];
  }
}
