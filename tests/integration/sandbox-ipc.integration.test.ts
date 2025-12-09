/**
 * Integration tests for sandbox-ipc-provider running in Docker container
 *
 * These tests communicate with a running sandbox-ipc server via WebSocket
 * to test the full end-to-end flow.
 *
 * Prerequisites:
 *   npm run test:sandbox:start  (starts the container)
 *   npm run test:sandbox        (runs these tests)
 *   npm run test:sandbox:stop   (stops the container)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";

const SANDBOX_URL = process.env.SANDBOX_URL || "ws://localhost:3000/ws";
const WORKSPACE_PATH = process.env.WORKSPACE_PATH || "/workspace";

interface WebSocketMessage {
  type: "request" | "response" | "error" | "event";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
  event?: string;
  data?: unknown;
}

interface DirectoryEntry {
  name: string;
  type: number; // 1 = file, 2 = directory
  size?: number;
  mtime?: number;
}

interface ReadDirectoryResult {
  entries: DirectoryEntry[];
}

interface ReadFileResult {
  content: string; // base64 encoded
}

interface ExistsResult {
  exists: boolean;
}

interface StatResult {
  type: string; // "file" or "directory"
  size: number;
  mtime: number;
}

// Helper to decode base64
function decodeBase64(base64: string): string {
  return Buffer.from(base64, "base64").toString("utf-8");
}

class SandboxClient {
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pendingRequests = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private events: WebSocketMessage[] = [];

  async connect(url: string = SANDBOX_URL): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        resolve();
      });

      this.ws.on("error", (error) => {
        reject(error);
      });

      this.ws.on("message", (data) => {
        const message: WebSocketMessage = JSON.parse(data.toString());

        if (message.type === "response" && message.id !== undefined) {
          const pending = this.pendingRequests.get(message.id);
          if (pending) {
            this.pendingRequests.delete(message.id);
            pending.resolve(message.result);
          }
        } else if (message.type === "error" && message.id !== undefined) {
          const pending = this.pendingRequests.get(message.id);
          if (pending) {
            this.pendingRequests.delete(message.id);
            pending.reject(
              new Error(message.error?.message || "Unknown error"),
            );
          }
        } else if (message.type === "event") {
          this.events.push(message);
        }
      });

      this.ws.on("close", () => {
        // Reject all pending requests
        for (const [, pending] of this.pendingRequests) {
          pending.reject(new Error("Connection closed"));
        }
        this.pendingRequests.clear();
      });
    });
  }

  async request<T>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected");
    }

    const id = ++this.requestId;
    const message: WebSocketMessage = {
      type: "request",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      });

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, 10000);

      this.ws!.send(JSON.stringify(message), (error) => {
        if (error) {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          reject(error);
        }
      });

      // Clear timeout on response (handled in resolve/reject)
      const originalResolve = this.pendingRequests.get(id)?.resolve;
      const originalReject = this.pendingRequests.get(id)?.reject;
      if (originalResolve && originalReject) {
        this.pendingRequests.set(id, {
          resolve: (value) => {
            clearTimeout(timeout);
            originalResolve(value);
          },
          reject: (err) => {
            clearTimeout(timeout);
            originalReject(err);
          },
        });
      }
    });
  }

  getEvents(): WebSocketMessage[] {
    return [...this.events];
  }

  clearEvents(): void {
    this.events = [];
  }

  close(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

describe("Sandbox IPC Integration Tests", () => {
  let client: SandboxClient;

  beforeAll(async () => {
    client = new SandboxClient();
    try {
      await client.connect();
    } catch (error) {
      console.error(
        "Failed to connect to sandbox. Make sure the container is running:",
      );
      console.error("  npm run test:sandbox:start");
      throw error;
    }
  }, 30000);

  afterAll(() => {
    client.close();
  });

  describe("File System Operations", () => {
    it("should read a directory", async () => {
      const result = await client.request<ReadDirectoryResult>(
        "fs.readDirectory",
        {
          path: WORKSPACE_PATH,
        },
      );

      expect(result).toBeDefined();
      expect(result.entries).toBeDefined();
      expect(Array.isArray(result.entries)).toBe(true);
      // Should contain our test file
      const testFile = result.entries.find(
        (entry) => entry.name === "test-file.txt",
      );
      expect(testFile).toBeDefined();
    });

    it("should stat a file", async () => {
      const result = await client.request<StatResult>("fs.stat", {
        path: `${WORKSPACE_PATH}/test-file.txt`,
      });

      expect(result).toBeDefined();
      expect(result.type).toBe("file");
      expect(typeof result.size).toBe("number");
    });

    it("should read a file", async () => {
      const result = await client.request<ReadFileResult>("fs.readFile", {
        path: `${WORKSPACE_PATH}/test-file.txt`,
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      // Content is base64 encoded
      const decoded = decodeBase64(result.content);
      expect(decoded).toContain("Hello from integration test");
    });

    it("should write a file", async () => {
      const testContent = `Test content written at ${Date.now()}`;

      await client.request("fs.writeFile", {
        path: `${WORKSPACE_PATH}/write-test.txt`,
        content: testContent,
      });

      // Verify by reading it back
      const result = await client.request<ReadFileResult>("fs.readFile", {
        path: `${WORKSPACE_PATH}/write-test.txt`,
      });

      const decoded = decodeBase64(result.content);
      expect(decoded).toBe(testContent);
    });

    it("should create a directory", async () => {
      await client.request("fs.createDirectory", {
        path: `${WORKSPACE_PATH}/new-test-dir`,
      });

      const result = await client.request<StatResult>("fs.stat", {
        path: `${WORKSPACE_PATH}/new-test-dir`,
      });

      expect(result.type).toBe("directory");
    });

    it("should check if a file exists", async () => {
      const existsResult = await client.request<ExistsResult>("fs.exists", {
        path: `${WORKSPACE_PATH}/test-file.txt`,
      });
      expect(existsResult.exists).toBe(true);

      const notExistsResult = await client.request<ExistsResult>("fs.exists", {
        path: `${WORKSPACE_PATH}/non-existent-file.txt`,
      });
      expect(notExistsResult.exists).toBe(false);
    });

    it("should rename a file", async () => {
      // Create a file to rename
      await client.request("fs.writeFile", {
        path: `${WORKSPACE_PATH}/to-rename.txt`,
        content: "rename me",
      });

      // Rename it
      await client.request("fs.rename", {
        oldPath: `${WORKSPACE_PATH}/to-rename.txt`,
        newPath: `${WORKSPACE_PATH}/renamed.txt`,
      });

      // Verify old path doesn't exist
      const oldExists = await client.request<ExistsResult>("fs.exists", {
        path: `${WORKSPACE_PATH}/to-rename.txt`,
      });
      expect(oldExists.exists).toBe(false);

      // Verify new path exists
      const newExists = await client.request<ExistsResult>("fs.exists", {
        path: `${WORKSPACE_PATH}/renamed.txt`,
      });
      expect(newExists.exists).toBe(true);
    });

    it("should delete a file", async () => {
      // Create a file to delete
      await client.request("fs.writeFile", {
        path: `${WORKSPACE_PATH}/to-delete.txt`,
        content: "delete me",
      });

      // Delete it
      await client.request("fs.delete", {
        path: `${WORKSPACE_PATH}/to-delete.txt`,
      });

      // Verify it's gone
      const exists = await client.request<ExistsResult>("fs.exists", {
        path: `${WORKSPACE_PATH}/to-delete.txt`,
      });
      expect(exists.exists).toBe(false);
    });

    it("should read nested directory structure", async () => {
      const result = await client.request<ReadDirectoryResult>(
        "fs.readDirectory",
        {
          path: `${WORKSPACE_PATH}/test-dir`,
        },
      );

      expect(result).toBeDefined();
      expect(result.entries).toBeDefined();
      expect(Array.isArray(result.entries)).toBe(true);
      const nestedFile = result.entries.find(
        (entry) => entry.name === "nested.txt",
      );
      expect(nestedFile).toBeDefined();
    });
  });

  describe("Error Handling", () => {
    it("should return error for non-existent file read", async () => {
      await expect(
        client.request("fs.readFile", {
          path: `${WORKSPACE_PATH}/definitely-does-not-exist.txt`,
        }),
      ).rejects.toThrow();
    });

    it("should return error for invalid path stat", async () => {
      await expect(
        client.request("fs.stat", {
          path: "/this/path/does/not/exist",
        }),
      ).rejects.toThrow();
    });

    it("should return error for invalid method", async () => {
      await expect(client.request("fs.invalidMethod", {})).rejects.toThrow(
        /Method not found|unknown method/i,
      );
    });
  });

  describe("Advanced File Operations", () => {
    it("should stat a directory", async () => {
      const result = await client.request<StatResult>("fs.stat", {
        path: `${WORKSPACE_PATH}/test-dir`,
      });

      expect(result).toBeDefined();
      expect(result.type).toBe("directory");
    });

    it("should delete a directory recursively", async () => {
      // Create directory structure to delete
      await client.request("fs.createDirectory", {
        path: `${WORKSPACE_PATH}/dir-to-delete/nested`,
      });

      await client.request("fs.writeFile", {
        path: `${WORKSPACE_PATH}/dir-to-delete/file1.txt`,
        content: "content1",
      });

      await client.request("fs.writeFile", {
        path: `${WORKSPACE_PATH}/dir-to-delete/nested/file2.txt`,
        content: "content2",
      });

      // Delete recursively
      await client.request("fs.delete", {
        path: `${WORKSPACE_PATH}/dir-to-delete`,
        recursive: true,
      });

      // Verify it's gone
      const exists = await client.request<ExistsResult>("fs.exists", {
        path: `${WORKSPACE_PATH}/dir-to-delete`,
      });
      expect(exists.exists).toBe(false);
    });
  });

  describe("Git Operations", () => {
    // Note: These tests expect the workspace to NOT be a git repo,
    // so they verify proper error handling. In a real git repo,
    // they would test the actual git functionality.

    it("should handle git.status on non-git workspace", async () => {
      try {
        await client.request("git.status", {});
        // If we get here, it's a git repo - that's also fine
      } catch (error) {
        // Expected: not a git repository
        expect((error as Error).message).toMatch(/not a git repository/i);
      }
    });

    it("should handle git.branch on non-git workspace", async () => {
      try {
        await client.request("git.branch", {});
      } catch (error) {
        expect((error as Error).message).toMatch(/not a git repository/i);
      }
    });

    it("should handle git.branches on non-git workspace", async () => {
      try {
        await client.request("git.branches", {});
      } catch (error) {
        expect((error as Error).message).toMatch(/not a git repository/i);
      }
    });

    it("should handle git.hasUncommittedChanges on non-git workspace", async () => {
      try {
        await client.request("git.hasUncommittedChanges", {});
      } catch (error) {
        expect((error as Error).message).toMatch(/not a git repository/i);
      }
    });

    it("should handle git.diff on non-git workspace", async () => {
      try {
        await client.request("git.diff", { path: "test.txt", staged: false });
      } catch (error) {
        expect((error as Error).message).toMatch(/not a git repository/i);
      }
    });

    it("should handle git.fileAtRef on non-git workspace", async () => {
      try {
        await client.request("git.fileAtRef", {
          path: "test.txt",
          ref: "HEAD",
        });
      } catch (error) {
        expect((error as Error).message).toMatch(/not a git repository/i);
      }
    });

    it("should handle git.stage on non-git workspace", async () => {
      try {
        await client.request("git.stage", { files: ["test.txt"] });
      } catch (error) {
        expect((error as Error).message).toMatch(/not a git repository/i);
      }
    });

    it("should handle git.unstage on non-git workspace", async () => {
      try {
        await client.request("git.unstage", { files: ["test.txt"] });
      } catch (error) {
        expect((error as Error).message).toMatch(/not a git repository/i);
      }
    });

    it("should handle git.commit on non-git workspace", async () => {
      try {
        await client.request("git.commit", { message: "Test commit" });
      } catch (error) {
        expect((error as Error).message).toMatch(
          /not a git repository|nothing to commit/i,
        );
      }
    });

    it("should handle git.checkout on non-git workspace", async () => {
      try {
        await client.request("git.checkout", { ref: "main" });
      } catch (error) {
        expect((error as Error).message).toMatch(/not a git repository/i);
      }
    });

    it("should handle git.revert on non-git workspace", async () => {
      try {
        await client.request("git.revert", { files: ["test.txt"] });
      } catch (error) {
        expect((error as Error).message).toMatch(/not a git repository/i);
      }
    });
  });
});
