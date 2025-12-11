/**
 * Integration tests for conduit-server
 *
 * By default, tests run against Docker container.
 *
 * NOTE: Go server direct testing requires the `workspace` Go package which is
 * currently not in the repository. Once added, set SANDBOX_USE_GO=1 for faster tests.
 *
 * Usage:
 *   npm run test:sandbox          # Docker container (default)
 *   npm run test:sandbox:docker   # Explicitly Docker
 *
 * Or start the server manually first:
 *   npm run test:sandbox:start    # Start Docker container
 */

import { execSync, spawn } from "child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";

// Configuration - Docker is default since Go workspace package is not in repo
const USE_DOCKER = process.env.SANDBOX_USE_GO !== "1";
const CONTAINER_NAME = "conduit-sandbox-test";
const IMAGE_NAME = "conduit-sandbox";
const PORT = 9876;
const SANDBOX_URL = `ws://localhost:${PORT}/ws`;

// Dynamic workspace path - set during test setup
let WORKSPACE_PATH = "/workspace";

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

// Helper to encode to base64
function encodeBase64(text: string): string {
  return Buffer.from(text, "utf-8").toString("base64");
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

// Build the Docker image
async function buildDockerImage(): Promise<void> {
  console.log("🔨 Building sandbox Docker image...");
  return new Promise((resolve, reject) => {
    const build = spawn(
      "docker",
      ["build", "-t", IMAGE_NAME, "-f", "build/sandbox/Dockerfile", "."],
      { stdio: "inherit" },
    );
    build.on("close", (code) => {
      if (code === 0) {
        console.log("✅ Docker image built successfully");
        resolve();
      } else {
        reject(new Error(`Docker build failed with code ${code}`));
      }
    });
    build.on("error", reject);
  });
}

// Start the sandbox container
async function startContainer(workspaceDir: string): Promise<void> {
  // Stop and remove existing container if it exists
  try {
    execSync(`docker stop ${CONTAINER_NAME}`, { stdio: "ignore" });
    execSync(`docker rm ${CONTAINER_NAME}`, { stdio: "ignore" });
  } catch {
    // Container doesn't exist, that's fine
  }

  console.log("🚀 Starting sandbox container...");
  return new Promise((resolve, reject) => {
    const run = spawn(
      "docker",
      [
        "run",
        "-d",
        "--name",
        CONTAINER_NAME,
        "-p",
        `${PORT}:${PORT}`,
        "-v",
        `${workspaceDir}:/workspace`,
        IMAGE_NAME,
      ],
      { stdio: "inherit" },
    );
    run.on("close", (code) => {
      if (code === 0) {
        console.log("✅ Container started");
        resolve();
      } else {
        reject(new Error(`Docker run failed with code ${code}`));
      }
    });
    run.on("error", reject);
  });
}

// Wait for the sandbox to be ready
async function waitForSandbox(
  maxRetries = 30,
  delayMs = 1000,
): Promise<boolean> {
  console.log("⏳ Waiting for sandbox to be ready...");
  for (let i = 0; i < maxRetries; i++) {
    const isReady = await new Promise<boolean>((resolve) => {
      const ws = new WebSocket(SANDBOX_URL);
      const timeout = setTimeout(() => {
        ws.close();
        resolve(false);
      }, 2000);

      ws.on("open", () => {
        clearTimeout(timeout);
        ws.close();
        resolve(true);
      });

      ws.on("error", () => {
        clearTimeout(timeout);
        resolve(false);
      });
    });

    if (isReady) {
      console.log("✅ Sandbox is ready");
      return true;
    }

    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

// Stop and remove the container
function stopContainer(): void {
  console.log("🛑 Stopping sandbox container...");
  try {
    execSync(`docker stop ${CONTAINER_NAME}`, { stdio: "ignore" });
    execSync(`docker rm ${CONTAINER_NAME}`, { stdio: "ignore" });
    console.log("✅ Container stopped and removed");
  } catch {
    // Ignore errors
  }
}

// Create a temporary workspace with test files
function createTestWorkspace(): string {
  const workspaceDir = mkdtempSync(join(tmpdir(), "sandbox-test-"));
  writeFileSync(
    join(workspaceDir, "test-file.txt"),
    "Hello from integration test",
  );
  mkdirSync(join(workspaceDir, "test-dir"));
  writeFileSync(
    join(workspaceDir, "test-dir", "nested.txt"),
    "Nested file content",
  );
  console.log(`📁 Created test workspace: ${workspaceDir}`);
  return workspaceDir;
}

// ============================================================================
// Go Server Functions (default - fast)
// ============================================================================

let goServerProcess: ReturnType<typeof spawn> | null = null;

// Build and start the Go server directly
async function startGoServer(workspaceDir: string): Promise<void> {
  const serverDir = join(
    __dirname,
    "../../build/sandbox/sandbox-conduit-server",
  );

  console.log("🔨 Building Go server...");

  // Build the server
  try {
    execSync("go build -o conduit-server .", {
      cwd: serverDir,
      stdio: "inherit",
    });
  } catch {
    throw new Error("Failed to build Go server. Is Go installed?");
  }

  console.log("🚀 Starting Go server...");

  // Kill any existing process on the port
  try {
    execSync(`lsof -ti :${PORT} | xargs kill -9`, { stdio: "ignore" });
  } catch {
    // No process to kill
  }

  // Start the server
  goServerProcess = spawn(
    "./conduit-server",
    ["-port", String(PORT), "-workspace", workspaceDir],
    {
      cwd: serverDir,
      stdio: "inherit",
      detached: false,
    },
  );

  goServerProcess.on("error", (err) => {
    console.error("Go server error:", err);
  });
}

// Stop the Go server
function stopGoServer(): void {
  console.log("🛑 Stopping Go server...");
  if (goServerProcess) {
    goServerProcess.kill("SIGTERM");
    goServerProcess = null;
  }
  // Also kill by port as backup
  try {
    execSync(`lsof -ti :${PORT} | xargs kill -9`, { stdio: "ignore" });
  } catch {
    // Ignore
  }
  console.log("✅ Go server stopped");
}

// ============================================================================
// Test Suite
// ============================================================================

describe("Sandbox IPC Integration Tests", () => {
  let client: SandboxClient;
  let workspaceDir: string;
  let weStartedServer = false;

  beforeAll(async () => {
    console.log(
      `\n🧪 Running in ${USE_DOCKER ? "Docker" : "Go server"} mode\n`,
    );

    // Check if server is already running
    const serverRunning = await waitForSandbox(3, 500);

    if (!serverRunning) {
      // Create test workspace
      workspaceDir = createTestWorkspace();
      weStartedServer = true;

      if (USE_DOCKER) {
        // Docker mode
        await buildDockerImage();
        await startContainer(workspaceDir);
        WORKSPACE_PATH = "/workspace";
      } else {
        // Go server mode (default)
        await startGoServer(workspaceDir);
        WORKSPACE_PATH = workspaceDir;
      }

      // Wait for server to be ready
      const ready = await waitForSandbox();
      if (!ready) {
        throw new Error("Server failed to start within timeout");
      }
    } else {
      console.log("✅ Using already running server");
      // When server is pre-started, use /workspace for Docker or detect workspace
      if (USE_DOCKER) {
        WORKSPACE_PATH = "/workspace";
      } else {
        // For pre-started Go server, assume /workspace or temp dir
        WORKSPACE_PATH = process.env.SANDBOX_WORKSPACE || "/workspace";
      }
    }

    // Connect the client
    client = new SandboxClient();
    await client.connect();
  }, 300000); // 5 minute timeout for build + start

  afterAll(() => {
    client?.close();
    // Only stop server if we started it
    if (weStartedServer) {
      if (USE_DOCKER) {
        stopContainer();
      } else {
        stopGoServer();
      }
    }
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
        content: encodeBase64(testContent),
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
        content: encodeBase64("rename me"),
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
        content: encodeBase64("delete me"),
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

  describe("WebSocket Keepalive", () => {
    /**
     * Creates a WebSocket client that tracks ping frames received from the server.
     * This allows us to verify that the server's keepalive mechanism is working.
     */
    function createPingTrackingClient(): {
      ws: WebSocket;
      pingCount: number;
      pongCount: number;
      lastPingTime: number | null;
      connectionClosed: boolean;
      closeCode: number | null;
      closeReason: string;
    } {
      const state = {
        ws: null as unknown as WebSocket,
        pingCount: 0,
        pongCount: 0,
        lastPingTime: null as number | null,
        connectionClosed: false,
        closeCode: null as number | null,
        closeReason: "",
      };

      state.ws = new WebSocket(SANDBOX_URL);

      // Track ping frames from server
      state.ws.on("ping", () => {
        state.pingCount++;
        state.lastPingTime = Date.now();
      });

      // Track pong frames (response to our pings, if any)
      state.ws.on("pong", () => {
        state.pongCount++;
      });

      state.ws.on("close", (code, reason) => {
        state.connectionClosed = true;
        state.closeCode = code;
        state.closeReason = reason?.toString() || "";
      });

      return state;
    }

    it("should receive ping frames from server at expected intervals", async () => {
      // Server pings every 15 seconds. Wait 20 seconds to ensure we receive at least 1 ping.
      const testDuration = 20000; // 20 seconds
      const expectedMinPings = 1;

      const tracker = createPingTrackingClient();

      // Wait for connection to open
      await new Promise<void>((resolve, reject) => {
        tracker.ws.on("open", resolve);
        tracker.ws.on("error", reject);
      });

      console.log(`⏳ Monitoring for pings over ${testDuration / 1000}s...`);
      const startTime = Date.now();

      // Wait for test duration
      await new Promise((resolve) => setTimeout(resolve, testDuration));

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(
        `📊 Results after ${elapsed}s: ${tracker.pingCount} pings received`,
      );

      // Verify we received expected pings
      expect(tracker.connectionClosed).toBe(false);
      expect(tracker.pingCount).toBeGreaterThanOrEqual(expectedMinPings);

      // Clean up
      tracker.ws.close(1000, "Test complete");
    }, 30000);

    it("should maintain connection through multiple ping cycles", async () => {
      // Test 35 seconds - should receive at least 2 pings (at 15s and 30s)
      const testDuration = 35000;
      const expectedMinPings = 2;

      const tracker = createPingTrackingClient();

      await new Promise<void>((resolve, reject) => {
        tracker.ws.on("open", resolve);
        tracker.ws.on("error", reject);
      });

      console.log(
        `⏳ Testing ${testDuration / 1000}s idle period (expect ${expectedMinPings}+ pings)...`,
      );

      await new Promise((resolve) => setTimeout(resolve, testDuration));

      console.log(
        `📊 Pings received: ${tracker.pingCount}, Connection alive: ${!tracker.connectionClosed}`,
      );

      // Assertions
      expect(tracker.connectionClosed).toBe(false);
      expect(tracker.pingCount).toBeGreaterThanOrEqual(expectedMinPings);

      tracker.ws.close(1000, "Test complete");
    }, 45000);

    it("should survive past the old 60-second timeout boundary", async () => {
      // This test specifically validates the fix for the 60-second disconnect bug.
      // Previously, coder/websocket would close the connection at exactly 60s.
      const testDuration = 70000; // 70 seconds - past the danger zone
      const expectedMinPings = 4; // At 15s, 30s, 45s, 60s

      const tracker = createPingTrackingClient();

      await new Promise<void>((resolve, reject) => {
        tracker.ws.on("open", resolve);
        tracker.ws.on("error", reject);
      });

      console.log(
        "⏳ Testing 70s idle period (regression test for 60s timeout bug)...",
      );

      await new Promise((resolve) => setTimeout(resolve, testDuration));

      console.log(
        `📊 Results: ${tracker.pingCount} pings, closed=${tracker.connectionClosed}, code=${tracker.closeCode}`,
      );

      // Critical assertions - connection must survive past 60s
      expect(tracker.connectionClosed).toBe(false);
      expect(tracker.pingCount).toBeGreaterThanOrEqual(expectedMinPings);

      // If we got here, the 60s bug is fixed!
      console.log("✅ Connection survived past 60-second boundary");

      tracker.ws.close(1000, "Test complete");
    }, 90000);

    it("should allow requests after extended idle period", async () => {
      // Verify the connection is fully functional after being idle
      const idleDuration = 35000; // 35 seconds

      const idleClient = new SandboxClient();
      await idleClient.connect();

      console.log(
        `⏳ Idle for ${idleDuration / 1000}s, then verify request works...`,
      );

      await new Promise((resolve) => setTimeout(resolve, idleDuration));

      // Make a real request to verify connection is functional
      const result = await idleClient.request<ExistsResult>("fs.exists", {
        path: `${WORKSPACE_PATH}/test-file.txt`,
      });

      expect(result.exists).toBe(true);
      console.log("✅ Request succeeded after idle period");

      idleClient.close();
    }, 50000);
  });
});
