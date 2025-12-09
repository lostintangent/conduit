/**
 * Comprehensive test suite for sandbox-ipc-provider-go WebSocket server
 *
 * Run with: npx tsx test/client.test.ts
 *
 * Prerequisites:
 *   - Server running: ./sandbox-ipc --port 3002 --workspace /tmp/test-workspace
 *   - npm install ws (or use from parent workspace)
 */

import * as fs from "fs";
import * as path from "path";
import WebSocket from "ws";

// Configuration
const SERVER_URL = process.env.SERVER_URL || "ws://localhost:3002/ws";
const HEALTH_URL = process.env.HEALTH_URL || "http://localhost:3002/health";
// Use /private/tmp on macOS to avoid symlink issues with FSEvents
const TEST_WORKSPACE =
  process.env.TEST_WORKSPACE || "/private/tmp/sandbox-ipc-test";

// Test state
let ws: WebSocket;
let requestId = 0;
const pendingRequests = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: Error) => void }
>();
const receivedEvents: any[] = [];

// Types matching the server protocol
interface WebSocketMessage {
  type: "request" | "response" | "error" | "event";
  id?: number;
  method?: string;
  params?: any;
  result?: any;
  error?: { code: number; message: string };
  event?: string;
  data?: any;
}

interface FileStat {
  type: "file" | "directory";
  size: number;
  mtime: number;
  ctime: number;
  readonly: boolean;
}

interface DirectoryEntry {
  name: string;
  type: "file" | "directory";
}

// Helper functions
function log(message: string, ...args: any[]) {
  console.log(`[TEST] ${message}`, ...args);
}

function success(message: string) {
  console.log(`  ✅ ${message}`);
}

function fail(message: string) {
  console.log(`  ❌ ${message}`);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Send a request and wait for response
function sendRequest<T = any>(method: string, params?: any): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    pendingRequests.set(id, { resolve, reject });

    const message: WebSocketMessage = {
      type: "request",
      id,
      method,
      params,
    };

    ws.send(JSON.stringify(message));

    // Timeout after 10 seconds
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out`));
      }
    }, 10000);
  });
}

// Wait for a specific event type
function waitForEvent(eventType: string, timeout = 3000): Promise<any> {
  return new Promise((resolve, reject) => {
    const startIndex = receivedEvents.length;
    const startTime = Date.now();

    const checkEvents = () => {
      for (let i = startIndex; i < receivedEvents.length; i++) {
        if (receivedEvents[i].event === eventType) {
          resolve(receivedEvents[i]);
          return true;
        }
      }
      return false;
    };

    if (checkEvents()) return;

    const interval = setInterval(() => {
      if (checkEvents()) {
        clearInterval(interval);
      } else if (Date.now() - startTime > timeout) {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for event: ${eventType}`));
      }
    }, 50);
  });
}

// Setup test workspace
async function setupTestWorkspace(): Promise<void> {
  log("Setting up test workspace...");

  // DON'T delete the workspace - server needs to maintain its watches
  // Just ensure our test files exist
  if (!fs.existsSync(TEST_WORKSPACE)) {
    fs.mkdirSync(TEST_WORKSPACE, { recursive: true });
  }

  // Create some test files (these will trigger events that we'll ignore initially)
  fs.writeFileSync(path.join(TEST_WORKSPACE, "test.txt"), "Hello, World!");
  fs.writeFileSync(
    path.join(TEST_WORKSPACE, "data.json"),
    JSON.stringify({ key: "value" }),
  );
  fs.mkdirSync(path.join(TEST_WORKSPACE, "subdir"), { recursive: true });
  fs.writeFileSync(
    path.join(TEST_WORKSPACE, "subdir", "nested.txt"),
    "Nested content",
  );

  success("Test workspace created");
}

// Connect to WebSocket server
async function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    log(`Connecting to ${SERVER_URL}...`);

    ws = new WebSocket(SERVER_URL);

    ws.on("open", () => {
      success("WebSocket connected");
    });

    ws.on("message", (data: WebSocket.Data) => {
      const message: WebSocketMessage = JSON.parse(data.toString());

      if (message.type === "event") {
        receivedEvents.push(message);

        if (message.event === "connected") {
          log(`Connected to workspace: ${message.data?.workspace}`);
          log(`Watcher ready: ${message.data?.watcherReady}`);

          // Server reports watcher is ready - no need to wait
          if (message.data?.watcherReady) {
            receivedEvents.length = 0; // Clear setup events
            resolve();
          } else {
            // Fallback: wait a short time for watcher to become ready
            setTimeout(() => {
              receivedEvents.length = 0;
              resolve();
            }, 200);
          }
        }
      } else if (message.type === "response" && message.id) {
        const pending = pendingRequests.get(message.id);
        if (pending) {
          pendingRequests.delete(message.id);
          pending.resolve(message.result);
        }
      } else if (message.type === "error" && message.id) {
        const pending = pendingRequests.get(message.id);
        if (pending) {
          pendingRequests.delete(message.id);
          pending.reject(new Error(message.error?.message || "Unknown error"));
        }
      }
    });

    ws.on("error", (err) => {
      reject(err);
    });

    ws.on("close", () => {
      log("WebSocket closed");
    });

    setTimeout(() => reject(new Error("Connection timeout")), 10000);
  });
}

// Test cases
async function testHealthEndpoint(): Promise<boolean> {
  log("Testing health endpoint...");
  try {
    const response = await fetch(HEALTH_URL);
    const data = await response.json();

    if (data.status !== "ok") {
      fail(`Health check failed: ${JSON.stringify(data)}`);
      return false;
    }

    success(`Health OK: watching=${data.watching}, clients=${data.clients}`);
    return true;
  } catch (err: any) {
    fail(`Health endpoint error: ${err.message}`);
    return false;
  }
}

async function testReadDirectory(): Promise<boolean> {
  log("Testing fs.readDirectory...");
  try {
    const result = await sendRequest<{ entries: DirectoryEntry[] }>(
      "fs.readDirectory",
      {
        path: TEST_WORKSPACE,
      },
    );

    if (!result.entries || !Array.isArray(result.entries)) {
      fail("Invalid response: missing entries array");
      return false;
    }

    // Just check that we got entries with correct structure
    if (result.entries.length === 0) {
      fail("Expected at least one entry");
      return false;
    }

    // Verify structure of first entry
    const first = result.entries[0];
    if (typeof first.name !== "string" || typeof first.type !== "string") {
      fail(`Invalid entry structure: ${JSON.stringify(first)}`);
      return false;
    }

    const names = result.entries.map((e) => e.name);
    success(
      `Read directory with ${result.entries.length} entries: ${names.slice(0, 5).join(", ")}${names.length > 5 ? "..." : ""}`,
    );
    return true;
  } catch (err: any) {
    fail(`readDirectory error: ${err.message}`);
    return false;
  }
}

async function testStat(): Promise<boolean> {
  log("Testing fs.stat...");
  try {
    const filePath = path.join(TEST_WORKSPACE, "test.txt");
    const result = await sendRequest<FileStat>("fs.stat", { path: filePath });

    if (result.type !== "file") {
      fail(`Expected type to be 'file', got '${result.type}'`);
      return false;
    }

    if (result.size !== 13) {
      // "Hello, World!" = 13 bytes
      fail(`Unexpected file size: ${result.size}`);
      return false;
    }

    success(
      `Stat OK: type=${result.type}, size=${result.size}, mtime=${new Date(result.mtime).toISOString()}`,
    );
    return true;
  } catch (err: any) {
    fail(`stat error: ${err.message}`);
    return false;
  }
}

async function testStatDirectory(): Promise<boolean> {
  log("Testing fs.stat on directory...");
  try {
    const dirPath = path.join(TEST_WORKSPACE, "subdir");
    const result = await sendRequest<FileStat>("fs.stat", { path: dirPath });

    if (result.type !== "directory") {
      fail(`Expected type to be 'directory', got '${result.type}'`);
      return false;
    }

    success(`Stat directory OK: type=${result.type}`);
    return true;
  } catch (err: any) {
    fail(`stat directory error: ${err.message}`);
    return false;
  }
}

async function testReadFile(): Promise<boolean> {
  log("Testing fs.readFile...");
  try {
    const filePath = path.join(TEST_WORKSPACE, "test.txt");
    const result = await sendRequest<{ content: string }>("fs.readFile", {
      path: filePath,
    });

    // Content is base64 encoded
    const content = Buffer.from(result.content, "base64").toString("utf-8");

    if (content !== "Hello, World!") {
      fail(`Unexpected content: "${content}"`);
      return false;
    }

    success(`Read file OK: "${content}"`);
    return true;
  } catch (err: any) {
    fail(`readFile error: ${err.message}`);
    return false;
  }
}

async function testWriteFile(): Promise<boolean> {
  log("Testing fs.writeFile...");
  try {
    const filePath = path.join(TEST_WORKSPACE, "new-file.txt");
    const content = "Created via WebSocket!";

    // Content should be sent as-is (server handles encoding)
    const result = await sendRequest<{ success: boolean }>("fs.writeFile", {
      path: filePath,
      content: content,
    });

    if (!result.success) {
      fail("Write returned success=false");
      return false;
    }

    // Verify file was created
    await sleep(100); // Give filesystem time to sync
    const actual = fs.readFileSync(filePath, "utf-8");
    if (actual !== content) {
      fail(`File content mismatch: "${actual}"`);
      return false;
    }

    success(`Write file OK: created ${filePath}`);
    return true;
  } catch (err: any) {
    fail(`writeFile error: ${err.message}`);
    return false;
  }
}

async function testCreateDirectory(): Promise<boolean> {
  log("Testing fs.createDirectory...");
  try {
    const dirPath = path.join(TEST_WORKSPACE, "new-dir", "nested");

    const result = await sendRequest<{ success: boolean }>(
      "fs.createDirectory",
      {
        path: dirPath,
      },
    );

    if (!result.success) {
      fail("createDirectory returned success=false");
      return false;
    }

    // Verify directory was created
    if (!fs.existsSync(dirPath)) {
      fail("Directory was not created");
      return false;
    }

    success(`Create directory OK: ${dirPath}`);
    return true;
  } catch (err: any) {
    fail(`createDirectory error: ${err.message}`);
    return false;
  }
}

async function testExists(): Promise<boolean> {
  log("Testing fs.exists...");
  try {
    // Test existing file
    const existingPath = path.join(TEST_WORKSPACE, "test.txt");
    const result1 = await sendRequest<{ exists: boolean }>("fs.exists", {
      path: existingPath,
    });

    if (!result1.exists) {
      fail("Expected existing file to exist");
      return false;
    }

    // Test non-existing file
    const nonExistingPath = path.join(TEST_WORKSPACE, "does-not-exist.txt");
    const result2 = await sendRequest<{ exists: boolean }>("fs.exists", {
      path: nonExistingPath,
    });

    if (result2.exists) {
      fail("Expected non-existing file to not exist");
      return false;
    }

    success("Exists check OK");
    return true;
  } catch (err: any) {
    fail(`exists error: ${err.message}`);
    return false;
  }
}

async function testRename(): Promise<boolean> {
  log("Testing fs.rename...");
  try {
    const oldPath = path.join(TEST_WORKSPACE, "data.json");
    const newPath = path.join(TEST_WORKSPACE, "renamed-data.json");

    const result = await sendRequest<{ success: boolean }>("fs.rename", {
      oldPath,
      newPath,
    });

    if (!result.success) {
      fail("rename returned success=false");
      return false;
    }

    // Verify rename
    if (fs.existsSync(oldPath)) {
      fail("Old file still exists");
      return false;
    }
    if (!fs.existsSync(newPath)) {
      fail("New file does not exist");
      return false;
    }

    success(
      `Rename OK: ${path.basename(oldPath)} -> ${path.basename(newPath)}`,
    );
    return true;
  } catch (err: any) {
    fail(`rename error: ${err.message}`);
    return false;
  }
}

async function testDelete(): Promise<boolean> {
  log("Testing fs.delete...");
  try {
    // Create a file to delete
    const filePath = path.join(TEST_WORKSPACE, "to-delete.txt");
    fs.writeFileSync(filePath, "Delete me");

    const result = await sendRequest<{ success: boolean }>("fs.delete", {
      path: filePath,
      recursive: false,
    });

    if (!result.success) {
      fail("delete returned success=false");
      return false;
    }

    // Verify deletion
    if (fs.existsSync(filePath)) {
      fail("File still exists after delete");
      return false;
    }

    success(`Delete file OK`);
    return true;
  } catch (err: any) {
    fail(`delete error: ${err.message}`);
    return false;
  }
}

async function testDeleteRecursive(): Promise<boolean> {
  log("Testing fs.delete (recursive)...");
  try {
    // Create directory structure to delete
    const dirPath = path.join(TEST_WORKSPACE, "dir-to-delete");
    fs.mkdirSync(dirPath, { recursive: true });
    fs.writeFileSync(path.join(dirPath, "file1.txt"), "content1");
    fs.mkdirSync(path.join(dirPath, "nested"));
    fs.writeFileSync(path.join(dirPath, "nested", "file2.txt"), "content2");

    const result = await sendRequest<{ success: boolean }>("fs.delete", {
      path: dirPath,
      recursive: true,
    });

    if (!result.success) {
      fail("delete recursive returned success=false");
      return false;
    }

    // Verify deletion
    if (fs.existsSync(dirPath)) {
      fail("Directory still exists after recursive delete");
      return false;
    }

    success(`Delete recursive OK`);
    return true;
  } catch (err: any) {
    fail(`delete recursive error: ${err.message}`);
    return false;
  }
}

async function testFileCreatedEvent(): Promise<boolean> {
  log("Testing fileCreated event...");
  try {
    // Wait for any pending events from previous operations to settle
    await sleep(500);

    // Clear old events
    receivedEvents.length = 0;

    // Create file externally with unique name
    const uniqueName = `event-created-${Date.now()}.txt`;
    const filePath = path.join(TEST_WORKSPACE, uniqueName);

    const eventPromise = waitForEvent("fileCreated", 3000);

    // Create the file
    fs.writeFileSync(filePath, "Event test");

    await eventPromise;

    // The event might be for our file or a different one that was debounced
    // Check if our file is in any of the received events
    const foundOurEvent = receivedEvents.some(
      (e) => e.event === "fileCreated" && e.data?.path?.includes(uniqueName),
    );

    if (!foundOurEvent) {
      // If not found directly, it might have been the first event but for a different file
      // This can happen due to timing - let's wait a bit more
      await sleep(500);
      const foundAfterWait = receivedEvents.some(
        (e) => e.event === "fileCreated" && e.data?.path?.includes(uniqueName),
      );
      if (!foundAfterWait) {
        fail(
          `Event for ${uniqueName} not received. Got events: ${receivedEvents.map((e) => e.data?.path).join(", ")}`,
        );
        return false;
      }
    }

    success(`fileCreated event received for: ${uniqueName}`);
    return true;
  } catch (err: any) {
    fail(`fileCreated event error: ${err.message}`);
    return false;
  }
}

async function testFileChangedEvent(): Promise<boolean> {
  log("Testing fileChanged event...");
  try {
    // First create the file
    const uniqueName = `event-changed-${Date.now()}.txt`;
    const filePath = path.join(TEST_WORKSPACE, uniqueName);
    fs.writeFileSync(filePath, "Initial content");
    await sleep(500); // Wait for initial creation event to complete

    // Clear old events
    receivedEvents.length = 0;

    const eventPromise = waitForEvent("fileChanged", 3000);

    // Small delay to ensure we're listening first
    await sleep(100);

    // Modify file
    fs.writeFileSync(filePath, "Modified content");

    const event = await eventPromise;

    if (!event.data?.path?.includes(uniqueName)) {
      fail(
        `Event path mismatch: expected *${uniqueName}*, got ${event.data?.path}`,
      );
      return false;
    }

    success(`fileChanged event received: ${event.data?.path}`);
    return true;
  } catch (err: any) {
    fail(`fileChanged event error: ${err.message}`);
    return false;
  }
}

async function testFileDeletedEvent(): Promise<boolean> {
  log("Testing fileDeleted event...");
  try {
    // First create a file
    const uniqueName = `event-deleted-${Date.now()}.txt`;
    const filePath = path.join(TEST_WORKSPACE, uniqueName);
    fs.writeFileSync(filePath, "Delete me");
    await sleep(500); // Wait for create event to complete

    // Clear old events
    receivedEvents.length = 0;

    const eventPromise = waitForEvent("fileDeleted", 3000);

    // Small delay to ensure we're listening first
    await sleep(100);

    // Delete file
    fs.unlinkSync(filePath);

    const event = await eventPromise;

    if (!event.data?.path?.includes(uniqueName)) {
      fail(
        `Event path mismatch: expected *${uniqueName}*, got ${event.data?.path}`,
      );
      return false;
    }

    success(`fileDeleted event received: ${event.data?.path}`);
    return true;
  } catch (err: any) {
    fail(`fileDeleted event error: ${err.message}`);
    return false;
  }
}

async function testDirectoryChangedEvent(): Promise<boolean> {
  log("Testing directoryChanged event...");
  try {
    // Clear old events
    receivedEvents.length = 0;

    const eventPromise = waitForEvent("directoryChanged", 3000);

    // Small delay to ensure we're listening first
    await sleep(100);

    // Create a new file to trigger directory change
    const uniqueName = `trigger-dir-change-${Date.now()}.txt`;
    const filePath = path.join(TEST_WORKSPACE, uniqueName);
    fs.writeFileSync(filePath, "Trigger");

    const event = await eventPromise;

    if (!event.data?.entries || !Array.isArray(event.data.entries)) {
      fail("directoryChanged event missing entries array");
      return false;
    }

    success(
      `directoryChanged event received: ${event.data.entries.length} entries`,
    );
    return true;
  } catch (err: any) {
    fail(`directoryChanged event error: ${err.message}`);
    return false;
  }
}

async function testInvalidMethod(): Promise<boolean> {
  log("Testing invalid method handling...");
  try {
    await sendRequest("fs.invalidMethod", {});
    fail("Expected error for invalid method");
    return false;
  } catch (err: any) {
    if (err.message.includes("Method not found")) {
      success("Invalid method correctly rejected");
      return true;
    }
    fail(`Unexpected error: ${err.message}`);
    return false;
  }
}

async function testInvalidPath(): Promise<boolean> {
  log("Testing invalid path handling...");
  try {
    await sendRequest("fs.stat", { path: "/nonexistent/path/file.txt" });
    fail("Expected error for invalid path");
    return false;
  } catch (err: any) {
    success(`Invalid path correctly rejected: ${err.message}`);
    return true;
  }
}

// ============================================================================
// Git Tests
// ============================================================================

async function testGitStatus(): Promise<boolean> {
  log("Testing git.status...");
  try {
    const result = await sendRequest<{
      branch: string;
      files: Record<string, any>;
      ahead: number;
      behind: number;
    }>("git.status", {});

    if (!result.branch) {
      fail("git.status missing branch");
      return false;
    }

    success(
      `Git status OK: branch=${result.branch}, files=${Object.keys(result.files || {}).length}`,
    );
    return true;
  } catch (err: any) {
    // Not a git repo is expected for test workspace
    if (err.message.includes("not a git repository")) {
      success("Git not available (expected for test workspace)");
      return true;
    }
    fail(`git.status error: ${err.message}`);
    return false;
  }
}

async function testGitBranch(): Promise<boolean> {
  log("Testing git.branch...");
  try {
    const result = await sendRequest<{ branch: string }>("git.branch", {});

    if (!result.branch) {
      fail("git.branch missing branch");
      return false;
    }

    success(`Git branch OK: ${result.branch}`);
    return true;
  } catch (err: any) {
    if (err.message.includes("not a git repository")) {
      success("Git not available (expected for test workspace)");
      return true;
    }
    fail(`git.branch error: ${err.message}`);
    return false;
  }
}

async function testGitBranches(): Promise<boolean> {
  log("Testing git.branches...");
  try {
    const result = await sendRequest<{ branches: any[] }>("git.branches", {});

    if (!Array.isArray(result.branches)) {
      fail("git.branches missing branches array");
      return false;
    }

    success(`Git branches OK: ${result.branches.length} branches`);
    return true;
  } catch (err: any) {
    if (err.message.includes("not a git repository")) {
      success("Git not available (expected for test workspace)");
      return true;
    }
    fail(`git.branches error: ${err.message}`);
    return false;
  }
}

async function testGitHasUncommittedChanges(): Promise<boolean> {
  log("Testing git.hasUncommittedChanges...");
  try {
    const result = await sendRequest<{ hasChanges: boolean }>(
      "git.hasUncommittedChanges",
      {},
    );

    if (typeof result.hasChanges !== "boolean") {
      fail("git.hasUncommittedChanges missing hasChanges");
      return false;
    }

    success(`Git hasUncommittedChanges OK: ${result.hasChanges}`);
    return true;
  } catch (err: any) {
    if (err.message.includes("not a git repository")) {
      success("Git not available (expected for test workspace)");
      return true;
    }
    fail(`git.hasUncommittedChanges error: ${err.message}`);
    return false;
  }
}

async function testGitUncommittedDiffStats(): Promise<boolean> {
  log("Testing git.uncommittedDiffStats...");
  try {
    const result = await sendRequest<{
      added: number;
      removed: number;
      files: number;
    }>("git.uncommittedDiffStats", {});

    if (
      typeof result.added !== "number" ||
      typeof result.removed !== "number"
    ) {
      fail("git.uncommittedDiffStats missing stats");
      return false;
    }

    success(
      `Git uncommittedDiffStats OK: +${result.added}/-${result.removed} in ${result.files} files`,
    );
    return true;
  } catch (err: any) {
    if (err.message.includes("not a git repository")) {
      success("Git not available (expected for test workspace)");
      return true;
    }
    fail(`git.uncommittedDiffStats error: ${err.message}`);
    return false;
  }
}

async function testGitStatusFromBranch(): Promise<boolean> {
  log("Testing git.statusFromBranch...");
  try {
    const result = await sendRequest<{
      added: string[];
      modified: string[];
      deleted: string[];
    }>("git.statusFromBranch", { baseBranch: "main" });

    if (
      !Array.isArray(result.added) ||
      !Array.isArray(result.modified) ||
      !Array.isArray(result.deleted)
    ) {
      fail("git.statusFromBranch missing file arrays");
      return false;
    }

    success(
      `Git statusFromBranch OK: +${result.added.length} added, ~${result.modified.length} modified, -${result.deleted.length} deleted`,
    );
    return true;
  } catch (err: any) {
    if (err.message.includes("not a git repository")) {
      success("Git not available (expected for test workspace)");
      return true;
    }
    fail(`git.statusFromBranch error: ${err.message}`);
    return false;
  }
}

async function testGitMostRecentCommittedFile(): Promise<boolean> {
  log("Testing git.mostRecentCommittedFile...");
  try {
    const result = await sendRequest<{ file: string | null }>(
      "git.mostRecentCommittedFile",
      { commitLimit: 10 },
    );

    // file can be null if no commits or string if found
    if (result.file !== null && typeof result.file !== "string") {
      fail("git.mostRecentCommittedFile invalid file type");
      return false;
    }

    success(`Git mostRecentCommittedFile OK: ${result.file || "(no commits)"}`);
    return true;
  } catch (err: any) {
    if (err.message.includes("not a git repository")) {
      success("Git not available (expected for test workspace)");
      return true;
    }
    fail(`git.mostRecentCommittedFile error: ${err.message}`);
    return false;
  }
}

// Main test runner
async function runTests(): Promise<void> {
  console.log("\n" + "=".repeat(60));
  console.log("  Sandbox IPC Provider - WebSocket Test Suite");
  console.log("=".repeat(60) + "\n");

  let passed = 0;
  let failed = 0;

  const tests = [
    { name: "Health Endpoint", fn: testHealthEndpoint },
    { name: "Read Directory", fn: testReadDirectory },
    { name: "Stat File", fn: testStat },
    { name: "Stat Directory", fn: testStatDirectory },
    { name: "Read File", fn: testReadFile },
    { name: "Write File", fn: testWriteFile },
    { name: "Create Directory", fn: testCreateDirectory },
    { name: "Exists", fn: testExists },
    { name: "Rename", fn: testRename },
    { name: "Delete File", fn: testDelete },
    { name: "Delete Recursive", fn: testDeleteRecursive },
    { name: "File Created Event", fn: testFileCreatedEvent },
    { name: "File Changed Event", fn: testFileChangedEvent },
    { name: "File Deleted Event", fn: testFileDeletedEvent },
    { name: "Directory Changed Event", fn: testDirectoryChangedEvent },
    { name: "Invalid Method", fn: testInvalidMethod },
    { name: "Invalid Path", fn: testInvalidPath },
    // Git tests
    { name: "Git Status", fn: testGitStatus },
    { name: "Git Branch", fn: testGitBranch },
    { name: "Git Branches", fn: testGitBranches },
    { name: "Git Has Uncommitted Changes", fn: testGitHasUncommittedChanges },
    { name: "Git Uncommitted Diff Stats", fn: testGitUncommittedDiffStats },
    { name: "Git Status From Branch", fn: testGitStatusFromBranch },
    {
      name: "Git Most Recent Committed File",
      fn: testGitMostRecentCommittedFile,
    },
  ];

  try {
    // Setup
    await setupTestWorkspace();
    await connect();

    console.log("\n" + "-".repeat(60) + "\n");

    // Run tests
    for (const test of tests) {
      try {
        const result = await test.fn();
        if (result) {
          passed++;
        } else {
          failed++;
        }
      } catch (err: any) {
        fail(`${test.name} threw: ${err.message}`);
        failed++;
      }
      console.log("");
    }
  } catch (err: any) {
    console.error("\nSetup failed:", err.message);
    process.exit(1);
  } finally {
    if (ws) {
      ws.close();
    }
  }

  // Summary
  console.log("=".repeat(60));
  console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
  console.log("=".repeat(60) + "\n");

  // Don't delete workspace - server needs it for subsequent runs
  // Just clean up test-created files
  const testFiles = fs.readdirSync(TEST_WORKSPACE);
  for (const file of testFiles) {
    // Keep basic files, delete test-generated ones
    if (
      file.startsWith("event-") ||
      file.startsWith("new-") ||
      file === "renamed-data.json"
    ) {
      const filePath = path.join(TEST_WORKSPACE, file);
      fs.rmSync(filePath, { recursive: true, force: true });
    }
  }
  log("Test files cleaned up (workspace preserved)");

  process.exit(failed > 0 ? 1 : 0);
}

// Run
runTests().catch(console.error);
