/**
 * SandboxIPCClient - WebSocket client for connecting to the sandbox-ipc-provider
 * running inside a cloud VM.
 *
 * The sandbox-ipc server runs on port 9876 inside the VM and is automatically
 * forwarded with the label "sandbox-ipc server" when the VM is created.
 */

import WebSocket from "ws";
import { withRetry } from "../utils/retry";
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
   * Connect to the sandbox-ipc server
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.connectionPromise) {
      return this.connectionPromise;
    }

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
        this.cleanup();
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
              // Start heartbeat after connection is established
              this.startHeartbeat();
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
   * Disconnect from the server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.cleanup();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Make an RPC call to the sandbox-ipc server with automatic retry on transient errors.
   * Retries are attempted for timeout, connection, and network errors.
   */
  async call<T>(
    method: string,
    params?: unknown,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
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
   * Make a single RPC call without retry (internal use only).
   */
  private async callOnce<T>(
    method: string,
    params?: unknown,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
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

      // Send ping
      this.ws.ping();

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

  private cleanup(): void {
    // Stop heartbeat
    this.stopHeartbeat();

    // Reject all pending requests
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Connection closed"));
    }
    this.pendingRequests.clear();
    this.connectionPromise = null;
  }
}
