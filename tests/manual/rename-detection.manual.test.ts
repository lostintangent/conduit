/**
 * Manual integration test for rename detection
 *
 * Run with: npm test -- tests/manual/rename-detection.manual.test.ts
 *
 * This test creates real files on the filesystem and verifies that
 * the FileWatcherService correctly detects file renames.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { FileWatcherService } from "../../src/ipc/fileWatcher/FileWatcherService";

// Mock electron
vi.mock("electron", () => ({
  BrowserWindow: {
    fromId: vi.fn(),
  },
}));

// Mock git
vi.mock("../../src/ipc/agent/git", () => ({
  findRepoRoot: vi.fn().mockResolvedValue(null),
}));

import { BrowserWindow } from "electron";

describe("FileWatcherService Rename Detection (Manual Integration Test)", () => {
  let testDir: string;
  let service: FileWatcherService;
  let mockWindow: any;
  let eventsReceived: Array<{ event: string; data: any }> = [];

  beforeEach(async () => {
    // Create temporary test directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), "conduit-rename-test-"));
    console.log(`\n📁 Test directory: ${testDir}`);

    // Reset events
    eventsReceived = [];

    // Setup mock window that captures events
    mockWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: {
        send: vi.fn((event: string, data: any) => {
          console.log(`[Event] ${event}:`, JSON.stringify(data, null, 2));
          eventsReceived.push({ event, data });
        }),
      },
    };

    (BrowserWindow.fromId as any).mockReturnValue(mockWindow);

    // Reset and get service instance
    // @ts-expect-error - Accessing private static field for testing
    FileWatcherService.instance = null;
    service = FileWatcherService.getInstance();

    // Subscribe to watch the test directory
    console.log("👀 Setting up file watcher...");
    await service.subscribe(testDir, "test-pane", 1);

    // Wait for watcher to be fully initialized
    await new Promise((resolve) => setTimeout(resolve, 500));
    console.log("✅ Watcher ready\n");

    // Clear any initialization events
    eventsReceived = [];
  });

  afterEach(() => {
    // Cleanup
    service.unsubscribe(testDir, "test-pane");

    // Remove test directory and contents
    try {
      if (fs.existsSync(testDir)) {
        fs.readdirSync(testDir).forEach((file) => {
          const filePath = path.join(testDir, file);
          fs.unlinkSync(filePath);
        });
        fs.rmdirSync(testDir);
        console.log(`🧹 Cleaned up: ${testDir}\n`);
      }
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  });

  it("should detect file rename in the same directory", async () => {
    // Create a test file
    const originalFile = path.join(testDir, "original.txt");
    console.log(`📄 Creating file: original.txt`);
    fs.writeFileSync(originalFile, "Test content for rename detection");

    // Wait for add event to be processed
    await new Promise((resolve) => setTimeout(resolve, 300));
    console.log(`📝 Add events processed: ${eventsReceived.length}`);

    // Clear events from file creation
    eventsReceived = [];

    // Rename the file
    const renamedFile = path.join(testDir, "renamed.txt");
    console.log(`🔄 Renaming: original.txt → renamed.txt`);
    const renameTime = Date.now();
    fs.renameSync(originalFile, renamedFile);

    // Wait for rename detection (500ms window + debounce + processing time)
    await new Promise((resolve) => setTimeout(resolve, 800));

    const detectionTime = Date.now() - renameTime;
    console.log(`⏱️  Time elapsed: ${detectionTime}ms`);

    // Check if rename event was detected
    const renameEvents = eventsReceived.filter(
      (e) => e.event === "file-watcher:file-renamed",
    );

    console.log(`\n📊 Events received: ${eventsReceived.length}`);
    console.log(`   - file-renamed: ${renameEvents.length}`);
    console.log(
      `   - file-changed: ${eventsReceived.filter((e) => e.event === "file-watcher:file-changed").length}`,
    );
    console.log(
      `   - tree-changed: ${eventsReceived.filter((e) => e.event === "file-watcher:tree-changed").length}`,
    );

    if (renameEvents.length > 0) {
      console.log(`\n✅ RENAME DETECTED!`);
      const renameData = renameEvents[0].data;
      console.log(`   Old: ${renameData.oldRelativePath}`);
      console.log(`   New: ${renameData.newRelativePath}`);
    } else {
      console.log(`\n❌ RENAME NOT DETECTED`);
      console.log(`   All events:`, eventsReceived);
    }

    // Assertions
    expect(renameEvents.length).toBeGreaterThan(0);
    expect(renameEvents[0].data).toMatchObject({
      cwd: testDir,
      oldPath: originalFile,
      newPath: renamedFile,
      oldRelativePath: "original.txt",
      newRelativePath: "renamed.txt",
    });
  }, 10000); // 10 second timeout for this test

  it("should still send tree-changed event on rename", async () => {
    // Create and rename a file
    const originalFile = path.join(testDir, "test.txt");
    fs.writeFileSync(originalFile, "Content");

    await new Promise((resolve) => setTimeout(resolve, 300));
    eventsReceived = [];

    const renamedFile = path.join(testDir, "test-renamed.txt");
    fs.renameSync(originalFile, renamedFile);

    await new Promise((resolve) => setTimeout(resolve, 800));

    // Should have both rename and tree-changed events
    const hasRename = eventsReceived.some(
      (e) => e.event === "file-watcher:file-renamed",
    );
    const hasTreeChange = eventsReceived.some(
      (e) => e.event === "file-watcher:tree-changed",
    );

    console.log(`\n✅ Has rename event: ${hasRename}`);
    console.log(`✅ Has tree-changed event: ${hasTreeChange}`);

    expect(hasTreeChange).toBe(true);
  }, 10000);
});
