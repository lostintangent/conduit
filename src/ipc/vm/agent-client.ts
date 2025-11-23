/**
 * VM Agent Client
 *
 * Handles communication with the Conduit agent running in cloud VMs.
 * The agent provides filesystem operations, file watching, and git operations
 * over a WebSocket connection tunneled through SSH.
 */

import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import type {
  FSResponse,
  FileChangedEvent,
  FileRenamedEvent,
  TreeChangedEvent,
} from "../../../vm-agent/dist/protocol";
import type { CloudEnvironment } from "../terminal/types";

type FSRequest = {
  type: string;
  id: string;
  path?: string;
  content?: string;
  rootPath?: string;
  ignored?: string[];
  cwd?: string;
  baseBranch?: string | null;
  filePath?: string;
  files?: string[];
};

type PendingRequest = {
  resolve: (data: any) => void;
  reject: (error: Error) => void;
};

export type VMAgentEventListener = {
  onFileChanged?: (event: FileChangedEvent) => void;
  onFileRenamed?: (event: FileRenamedEvent) => void;
  onTreeChanged?: (event: TreeChangedEvent) => void;
};

/**
 * Client for communicating with VM agents
 */
export class VMAgentClient {
  private connections = new Map<string, WebSocket>();
  private pendingRequests = new Map<string, PendingRequest>();
  private eventListeners = new Map<string, VMAgentEventListener>();
  private reconnectTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Send a request to the VM agent and wait for response
   */
  async sendRequest(
    cloudEnv: CloudEnvironment,
    request: Omit<FSRequest, "id">,
  ): Promise<any> {
    const id = randomUUID();
    const fullRequest: FSRequest = { ...request, id } as FSRequest;

    const ws = await this.getConnection(cloudEnv);

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      // Set timeout for request
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          new Error(`VM agent request timeout for ${request.type} after 30s`),
        );
      }, 30000);

      // Clear timeout on response
      const originalResolve = resolve;
      this.pendingRequests.set(id, {
        resolve: (data) => {
          clearTimeout(timeout);
          originalResolve(data);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });

      ws.send(JSON.stringify(fullRequest));
    });
  }

  /**
   * Get or create a WebSocket connection to the VM agent
   */
  private async getConnection(cloudEnv: CloudEnvironment): Promise<WebSocket> {
    const key = this.getConnectionKey(cloudEnv);
    let ws = this.connections.get(key);

    if (ws && ws.readyState === WebSocket.OPEN) {
      return ws;
    }

    // Create new connection
    return this.createConnection(cloudEnv);
  }

  /**
   * Create a new WebSocket connection to the VM agent
   */
  private async createConnection(
    cloudEnv: CloudEnvironment,
  ): Promise<WebSocket> {
    const key = this.getConnectionKey(cloudEnv);

    // Use the forwarded agent port from cloudEnv, fallback to 3030 if not set
    const agentPort = cloudEnv.agentPort || 3030;
    const wsUrl = `ws://${cloudEnv.vmHost}:${agentPort}`;

    console.log(`[VM Agent] Connecting to ${wsUrl}`);

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);

      ws.on("open", () => {
        console.log(`[VM Agent] Connected to ${key}`);
        this.connections.set(key, ws);
        resolve(ws);
      });

      ws.on("message", (data: WebSocket.Data) => {
        try {
          const response = JSON.parse(data.toString()) as FSResponse;
          this.handleResponse(response);
        } catch (error) {
          console.error("[VM Agent] Failed to parse message:", error);
        }
      });

      ws.on("error", (error: Error) => {
        console.error(`[VM Agent] WebSocket error for ${key}:`, error);
        reject(error);
      });

      ws.on("close", () => {
        console.log(`[VM Agent] Connection closed for ${key}`);
        this.connections.delete(key);
        this.scheduleReconnect(cloudEnv);
      });
    });
  }

  /**
   * Handle responses from the VM agent
   */
  private handleResponse(response: FSResponse): void {
    switch (response.type) {
      case "response": {
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          pending.resolve(response.data);
          this.pendingRequests.delete(response.id);
        }
        break;
      }

      case "error": {
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          pending.reject(new Error(response.error));
          this.pendingRequests.delete(response.id);
        }
        break;
      }

      case "file-changed": {
        // Broadcast to all listeners for this VM
        this.eventListeners.forEach((listener) => {
          listener.onFileChanged?.(response);
        });
        break;
      }

      case "file-renamed": {
        this.eventListeners.forEach((listener) => {
          listener.onFileRenamed?.(response);
        });
        break;
      }

      case "tree-changed": {
        this.eventListeners.forEach((listener) => {
          listener.onTreeChanged?.(response);
        });
        break;
      }

      case "pong": {
        // Handle ping/pong for keep-alive
        const pending = this.pendingRequests.get(response.id);
        if (pending) {
          pending.resolve({ timestamp: response.timestamp });
          this.pendingRequests.delete(response.id);
        }
        break;
      }
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(cloudEnv: CloudEnvironment): void {
    const key = this.getConnectionKey(cloudEnv);
    if (this.reconnectTimers.has(key)) {
      return;
    }

    const timer = setTimeout(async () => {
      this.reconnectTimers.delete(key);
      try {
        await this.createConnection(cloudEnv);
      } catch (error) {
        console.error("[VM Agent] Reconnection failed:", error);
        // Will retry on next operation
      }
    }, 5000);

    this.reconnectTimers.set(key, timer);
  }

  /**
   * Register event listener for VM agent events
   */
  registerEventListener(vmId: string, listener: VMAgentEventListener): void {
    this.eventListeners.set(vmId, listener);
  }

  /**
   * Unregister event listener
   */
  unregisterEventListener(vmId: string): void {
    this.eventListeners.delete(vmId);
  }

  /**
   * Get connection key for a VM
   */
  private getConnectionKey(cloudEnv: CloudEnvironment): string {
    return cloudEnv.vmId;
  }

  /**
   * Close connection to a VM
   */
  async closeConnection(cloudEnv: CloudEnvironment): Promise<void> {
    const key = this.getConnectionKey(cloudEnv);
    const ws = this.connections.get(key);

    if (ws) {
      ws.close();
      this.connections.delete(key);
    }

    const timer = this.reconnectTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.reconnectTimers.delete(key);
    }
  }

  /**
   * Filesystem Operations
   */

  async readFile(cloudEnv: CloudEnvironment, path: string): Promise<string> {
    const response = await this.sendRequest(cloudEnv, {
      type: "read-file",
      path,
    });
    return response as string;
  }

  async writeFile(
    cloudEnv: CloudEnvironment,
    path: string,
    content: string,
  ): Promise<void> {
    await this.sendRequest(cloudEnv, {
      type: "write-file",
      path,
      content,
    });
  }

  async deleteFile(cloudEnv: CloudEnvironment, path: string): Promise<void> {
    await this.sendRequest(cloudEnv, {
      type: "delete-file",
      path,
    });
  }

  async fileExists(cloudEnv: CloudEnvironment, path: string): Promise<boolean> {
    const response = await this.sendRequest(cloudEnv, {
      type: "file-exists",
      path,
    });
    return response as boolean;
  }

  async getFileStats(
    cloudEnv: CloudEnvironment,
    path: string,
  ): Promise<{
    mtime: number;
    size: number;
    isFile: boolean;
    isDirectory: boolean;
  }> {
    const response = await this.sendRequest(cloudEnv, {
      type: "file-stats",
      path,
    });
    return response as {
      mtime: number;
      size: number;
      isFile: boolean;
      isDirectory: boolean;
    };
  }

  async listDirectory(
    cloudEnv: CloudEnvironment,
    path: string,
    rootPath?: string,
  ): Promise<any[]> {
    const response = await this.sendRequest(cloudEnv, {
      type: "list-directory",
      path,
      rootPath,
    });
    return response as any[];
  }

  async watchDirectory(
    cloudEnv: CloudEnvironment,
    path: string,
    ignored?: string[],
  ): Promise<void> {
    console.log(
      `[VM Agent] Requesting watch-directory for path: ${path}, vmId: ${cloudEnv.vmId}`,
    );
    await this.sendRequest(cloudEnv, {
      type: "watch-directory",
      path,
      ignored,
    });
  }

  async unwatchDirectory(
    cloudEnv: CloudEnvironment,
    path: string,
  ): Promise<void> {
    await this.sendRequest(cloudEnv, {
      type: "unwatch-directory",
      path,
    });
  }

  async ping(cloudEnv: CloudEnvironment): Promise<number> {
    const response = await this.sendRequest(cloudEnv, {
      type: "ping",
    });
    return response.timestamp;
  }

  /**
   * Git Operations
   */

  async getGitStatus(
    cloudEnv: CloudEnvironment,
    cwd: string,
    baseBranch?: string | null,
  ): Promise<Record<string, any>> {
    const response = await this.sendRequest(cloudEnv, {
      type: "git-status",
      cwd,
      baseBranch,
    });
    return response as Record<string, any>;
  }

  async getGitBranches(
    cloudEnv: CloudEnvironment,
    cwd: string,
  ): Promise<any[]> {
    const response = await this.sendRequest(cloudEnv, {
      type: "git-branches",
      cwd,
    });
    return response as any[];
  }

  async getFileDiff(
    cloudEnv: CloudEnvironment,
    cwd: string,
    filePath: string,
    baseBranch?: string | null,
  ): Promise<any> {
    const response = await this.sendRequest(cloudEnv, {
      type: "git-diff",
      cwd,
      filePath,
      baseBranch,
    });
    return response;
  }

  async findRepoRoot(
    cloudEnv: CloudEnvironment,
    cwd: string,
  ): Promise<string | null> {
    const response = await this.sendRequest(cloudEnv, {
      type: "git-repo-root",
      cwd,
    });
    return response as string | null;
  }

  async gitStage(
    cloudEnv: CloudEnvironment,
    cwd: string,
    files: string[],
  ): Promise<void> {
    await this.sendRequest(cloudEnv, {
      type: "git-stage",
      cwd,
      files,
    });
  }

  async gitUnstage(
    cloudEnv: CloudEnvironment,
    cwd: string,
    files: string[],
  ): Promise<void> {
    await this.sendRequest(cloudEnv, {
      type: "git-unstage",
      cwd,
      files,
    });
  }

  async gitRevert(
    cloudEnv: CloudEnvironment,
    cwd: string,
    files: string[],
  ): Promise<void> {
    await this.sendRequest(cloudEnv, {
      type: "git-revert",
      cwd,
      files,
    });
  }

  async getGitDiffStats(cloudEnv: CloudEnvironment, cwd: string): Promise<any> {
    const response = await this.sendRequest(cloudEnv, {
      type: "git-diff-stats",
      cwd,
    });
    return response;
  }

  async getMostRecentFile(
    cloudEnv: CloudEnvironment,
    cwd: string,
  ): Promise<string | null> {
    const response = await this.sendRequest(cloudEnv, {
      type: "git-most-recent-file",
      cwd,
    });
    return response as string | null;
  }
}

// Singleton instance
let vmAgentClientInstance: VMAgentClient | null = null;

export function getVMAgentClient(): VMAgentClient {
  if (!vmAgentClientInstance) {
    vmAgentClientInstance = new VMAgentClient();
  }
  return vmAgentClientInstance;
}
