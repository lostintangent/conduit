import { WebSocket, WebSocketServer } from "ws";
import {
  deleteFile,
  fileExists,
  getFileStats,
  listDirectory,
  readFile,
  writeFile,
} from "./file-operations.js";
import {
  findGitRoot,
  getFileDiff,
  getGitBranches,
  getGitDiffStats,
  getGitStatus,
  getMostRecentFile,
  gitRevert,
  gitStage,
  gitUnstage,
} from "./git-operations.js";
import type {
  ErrorResponse,
  FSRequest,
  FSResponse,
  SuccessResponse,
} from "./protocol.js";
import { DirectoryWatcher } from "./watcher.js";

const PORT = parseInt(process.env.PORT || "59432", 10);
const watchers = new Map<string, DirectoryWatcher>();

/**
 * Conduit VM File System Agent
 * WebSocket server that provides file system operations and real-time file watching
 */
class FileSystemAgent {
  private wss: WebSocketServer;

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    console.log(`[Agent] File System Agent started on port ${port}`);

    this.wss.on("connection", (ws: WebSocket) => {
      console.log("[Agent] Client connected");

      ws.on("message", async (data: Buffer) => {
        await this.handleMessage(ws, data.toString());
      });

      ws.on("close", () => {
        console.log("[Agent] Client disconnected");
        this.cleanupWatchers(ws);
      });

      ws.on("error", (error) => {
        console.error("[Agent] WebSocket error:", error);
      });
    });

    this.wss.on("error", (error) => {
      console.error("[Agent] Server error:", error);
    });
  }

  private async handleMessage(ws: WebSocket, data: string): Promise<void> {
    try {
      const request: FSRequest = JSON.parse(data);
      console.log(`[Agent] Request: ${request.type} (${request.id})`);

      switch (request.type) {
        case "read-file":
          await this.handleReadFile(ws, request);
          break;

        case "write-file":
          await this.handleWriteFile(ws, request);
          break;

        case "delete-file":
          await this.handleDeleteFile(ws, request);
          break;

        case "file-exists":
          await this.handleFileExists(ws, request);
          break;

        case "file-stats":
          await this.handleFileStats(ws, request);
          break;

        case "list-directory":
          await this.handleListDirectory(ws, request);
          break;

        case "watch-directory":
          await this.handleWatchDirectory(ws, request);
          break;

        case "unwatch-directory":
          await this.handleUnwatchDirectory(ws, request);
          break;

        case "ping":
          this.handlePing(ws, request);
          break;

        case "git-status":
          await this.handleGitStatus(ws, request);
          break;

        case "git-branches":
          await this.handleGitBranches(ws, request);
          break;

        case "git-diff":
          await this.handleGitDiff(ws, request);
          break;

        case "git-diff-stats":
          await this.handleGitDiffStats(ws, request);
          break;

        case "git-most-recent-file":
          await this.handleGitMostRecentFile(ws, request);
          break;

        case "git-repo-root":
          await this.handleGitRepoRoot(ws, request);
          break;

        case "git-stage":
          await this.handleGitStage(ws, request);
          break;

        case "git-unstage":
          await this.handleGitUnstage(ws, request);
          break;

        case "git-revert":
          await this.handleGitRevert(ws, request);
          break;

        default:
          this.sendError(
            ws,
            (request as any).id || "unknown",
            `Unknown request type: ${(request as any).type}`,
          );
      }
    } catch (error) {
      console.error("[Agent] Error handling message:", error);
      this.sendError(
        ws,
        "unknown",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async handleReadFile(
    ws: WebSocket,
    request: Extract<FSRequest, { type: "read-file" }>,
  ): Promise<void> {
    try {
      const content = await readFile(request.path);
      this.sendSuccess(ws, request.id, content);
    } catch (error) {
      this.sendError(
        ws,
        request.id,
        error instanceof Error ? error.message : String(error),
        "READ_ERROR",
      );
    }
  }

  private async handleWriteFile(
    ws: WebSocket,
    request: Extract<FSRequest, { type: "write-file" }>,
  ): Promise<void> {
    try {
      await writeFile(request.path, request.content);
      this.sendSuccess(ws, request.id, { success: true });
    } catch (error) {
      this.sendError(
        ws,
        request.id,
        error instanceof Error ? error.message : String(error),
        "WRITE_ERROR",
      );
    }
  }

  private async handleDeleteFile(
    ws: WebSocket,
    request: Extract<FSRequest, { type: "delete-file" }>,
  ): Promise<void> {
    try {
      await deleteFile(request.path);
      this.sendSuccess(ws, request.id, { success: true });
    } catch (error) {
      this.sendError(
        ws,
        request.id,
        error instanceof Error ? error.message : String(error),
        "DELETE_ERROR",
      );
    }
  }

  private async handleFileExists(
    ws: WebSocket,
    request: Extract<FSRequest, { type: "file-exists" }>,
  ): Promise<void> {
    try {
      const exists = await fileExists(request.path);
      this.sendSuccess(ws, request.id, exists);
    } catch (error) {
      this.sendError(
        ws,
        request.id,
        error instanceof Error ? error.message : String(error),
        "FILE_EXISTS_ERROR",
      );
    }
  }

  private async handleFileStats(
    ws: WebSocket,
    request: Extract<FSRequest, { type: "file-stats" }>,
  ): Promise<void> {
    try {
      const stats = await getFileStats(request.path);
      this.sendSuccess(ws, request.id, stats);
    } catch (error) {
      this.sendError(
        ws,
        request.id,
        error instanceof Error ? error.message : String(error),
        "FILE_STATS_ERROR",
      );
    }
  }

  private async handleListDirectory(
    ws: WebSocket,
    request: Extract<FSRequest, { type: "list-directory" }>,
  ): Promise<void> {
    try {
      const tree = await listDirectory(request.path, request.rootPath);
      this.sendSuccess(ws, request.id, tree);
    } catch (error) {
      this.sendError(
        ws,
        request.id,
        error instanceof Error ? error.message : String(error),
        "LIST_ERROR",
      );
    }
  }

  private async handleWatchDirectory(
    ws: WebSocket,
    request: Extract<FSRequest, { type: "watch-directory" }>,
  ): Promise<void> {
    try {
      const watchKey = `${this.getClientId(ws)}:${request.path}`;

      // Stop existing watcher if any
      const existingWatcher = watchers.get(watchKey);
      if (existingWatcher) {
        await existingWatcher.unwatch();
      }

      // Create new watcher
      const watcher = new DirectoryWatcher(
        request.path,
        (event) => {
          // Forward file system events to the client
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(event));
          }
        },
        { ignored: request.ignored },
      );

      await watcher.watch();
      watchers.set(watchKey, watcher);

      // Associate watcher with this WebSocket
      if (!(ws as any).watchers) {
        (ws as any).watchers = new Set<string>();
      }
      (ws as any).watchers.add(watchKey);

      this.sendSuccess(ws, request.id, { watching: request.path });
    } catch (error) {
      this.sendError(
        ws,
        request.id,
        error instanceof Error ? error.message : String(error),
        "WATCH_ERROR",
      );
    }
  }

  private async handleUnwatchDirectory(
    ws: WebSocket,
    request: Extract<FSRequest, { type: "unwatch-directory" }>,
  ): Promise<void> {
    try {
      const watchKey = `${this.getClientId(ws)}:${request.path}`;
      const watcher = watchers.get(watchKey);

      if (watcher) {
        await watcher.unwatch();
        watchers.delete(watchKey);

        if ((ws as any).watchers) {
          (ws as any).watchers.delete(watchKey);
        }
      }

      this.sendSuccess(ws, request.id, { unwatched: request.path });
    } catch (error) {
      this.sendError(
        ws,
        request.id,
        error instanceof Error ? error.message : String(error),
        "UNWATCH_ERROR",
      );
    }
  }

  private handlePing(
    ws: WebSocket,
    request: Extract<FSRequest, { type: "ping" }>,
  ): void {
    const pong: FSResponse = {
      type: "pong",
      id: request.id,
      timestamp: Date.now(),
    };
    ws.send(JSON.stringify(pong));
  }

  private async handleGitStatus(
    ws: WebSocket,
    request: Extract<FSRequest, { type: "git-status" }>,
  ): Promise<void> {
    try {
      const status = await getGitStatus(request.cwd, request.baseBranch);
      this.sendSuccess(ws, request.id, status);
    } catch (error) {
      this.sendError(
        ws,
        request.id,
        error instanceof Error ? error.message : String(error),
        "GIT_STATUS_ERROR",
      );
    }
  }

  private async handleGitBranches(
    ws: WebSocket,
    request: Extract<FSRequest, { type: "git-branches" }>,
  ): Promise<void> {
    try {
      const branches = await getGitBranches(request.cwd);
      this.sendSuccess(ws, request.id, branches);
    } catch (error) {
      this.sendError(
        ws,
        request.id,
        error instanceof Error ? error.message : String(error),
        "GIT_BRANCHES_ERROR",
      );
    }
  }

  private async handleGitDiff(
    ws: WebSocket,
    request: Extract<FSRequest, { type: "git-diff" }>,
  ): Promise<void> {
    try {
      const diff = await getFileDiff(
        request.cwd,
        request.filePath,
        request.baseBranch,
      );
      this.sendSuccess(ws, request.id, diff);
    } catch (error) {
      this.sendError(
        ws,
        request.id,
        error instanceof Error ? error.message : String(error),
        "GIT_DIFF_ERROR",
      );
    }
  }

  private async handleGitDiffStats(
    ws: WebSocket,
    request: Extract<FSRequest, { type: "git-diff-stats" }>,
  ): Promise<void> {
    try {
      const stats = await getGitDiffStats(request.cwd);
      this.sendSuccess(ws, request.id, stats);
    } catch (error) {
      this.sendError(
        ws,
        request.id,
        error instanceof Error ? error.message : String(error),
        "GIT_DIFF_STATS_ERROR",
      );
    }
  }

  private async handleGitMostRecentFile(
    ws: WebSocket,
    request: Extract<FSRequest, { type: "git-most-recent-file" }>,
  ): Promise<void> {
    try {
      const file = await getMostRecentFile(request.cwd);
      this.sendSuccess(ws, request.id, file);
    } catch (error) {
      this.sendError(
        ws,
        request.id,
        error instanceof Error ? error.message : String(error),
        "GIT_RECENT_FILE_ERROR",
      );
    }
  }

  private async handleGitRepoRoot(
    ws: WebSocket,
    request: Extract<FSRequest, { type: "git-repo-root" }>,
  ): Promise<void> {
    try {
      const gitRoot = await findGitRoot(request.cwd);
      this.sendSuccess(ws, request.id, gitRoot);
    } catch (error) {
      this.sendError(
        ws,
        request.id,
        error instanceof Error ? error.message : String(error),
        "GIT_ROOT_ERROR",
      );
    }
  }

  private async handleGitStage(
    ws: WebSocket,
    request: Extract<FSRequest, { type: "git-stage" }>,
  ): Promise<void> {
    try {
      await gitStage(request.cwd, request.files);
      this.sendSuccess(ws, request.id, { success: true });
    } catch (error) {
      this.sendError(
        ws,
        request.id,
        error instanceof Error ? error.message : String(error),
        "GIT_STAGE_ERROR",
      );
    }
  }

  private async handleGitUnstage(
    ws: WebSocket,
    request: Extract<FSRequest, { type: "git-unstage" }>,
  ): Promise<void> {
    try {
      await gitUnstage(request.cwd, request.files);
      this.sendSuccess(ws, request.id, { success: true });
    } catch (error) {
      this.sendError(
        ws,
        request.id,
        error instanceof Error ? error.message : String(error),
        "GIT_UNSTAGE_ERROR",
      );
    }
  }

  private async handleGitRevert(
    ws: WebSocket,
    request: Extract<FSRequest, { type: "git-revert" }>,
  ): Promise<void> {
    try {
      await gitRevert(request.cwd, request.files);
      this.sendSuccess(ws, request.id, { success: true });
    } catch (error) {
      this.sendError(
        ws,
        request.id,
        error instanceof Error ? error.message : String(error),
        "GIT_REVERT_ERROR",
      );
    }
  }

  private sendSuccess(ws: WebSocket, id: string, data: unknown): void {
    const response: SuccessResponse = {
      type: "response",
      id,
      data,
    };
    ws.send(JSON.stringify(response));
  }

  private sendError(
    ws: WebSocket,
    id: string,
    error: string,
    code?: string,
  ): void {
    const response: ErrorResponse = {
      type: "error",
      id,
      error,
      code,
    };
    ws.send(JSON.stringify(response));
  }

  private getClientId(ws: WebSocket): string {
    // Use a unique identifier for each WebSocket connection
    if (!(ws as any).clientId) {
      (ws as any).clientId = `client-${Date.now()}-${Math.random()}`;
    }
    return (ws as any).clientId;
  }

  private cleanupWatchers(ws: WebSocket): void {
    const clientWatchers = (ws as any).watchers as Set<string> | undefined;
    if (clientWatchers) {
      for (const watchKey of clientWatchers) {
        const watcher = watchers.get(watchKey);
        if (watcher) {
          watcher.unwatch().catch((err) => {
            console.error(`[Agent] Error unwatching ${watchKey}:`, err);
          });
          watchers.delete(watchKey);
        }
      }
    }
  }

  close(): void {
    console.log("[Agent] Shutting down...");
    this.wss.close();
  }
}

// Start the agent
const agent = new FileSystemAgent(PORT);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[Agent] Received SIGINT, shutting down gracefully...");
  agent.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[Agent] Received SIGTERM, shutting down gracefully...");
  agent.close();
  process.exit(0);
});
