import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import type { FSWatcher } from "chokidar";
import { FileWatcherService } from "../../../src/ipc/fileWatcher/FileWatcherService";

// Mock dependencies
vi.mock("chokidar", () => ({
  default: {
    watch: vi.fn(),
  },
}));

vi.mock("electron", () => ({
  BrowserWindow: {
    fromId: vi.fn(),
  },
}));

vi.mock("../../../src/ipc/agent/git", () => ({
  findRepoRoot: vi.fn(),
}));

// Create a holder for the mock function to avoid hoisting issues
// Initialize with a dummy function that will be replaced in tests
const mockHolder: {
  statSync: (path: any) => any;
} = {
  statSync: () => ({ size: 0, mtimeMs: 0 }),
};

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    default: actual.default || actual,
    ...actual,
    statSync: (path: any) => {
      // Delegate to the mock holder
      return mockHolder.statSync(path);
    },
  };
});

import chokidar from "chokidar";
import { BrowserWindow } from "electron";
import { findRepoRoot } from "../../../src/ipc/agent/git";

describe("FileWatcherService", () => {
  let service: FileWatcherService;
  let mockWatcher: Partial<FSWatcher>;
  let mockWindow: any;
  let mockStatSync: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset singleton instance before each test
    // @ts-expect-error - Accessing private static field for testing
    FileWatcherService.instance = null;

    // Get fresh service instance
    service = FileWatcherService.getInstance();

    // Reset and assign the mockStatSync reference
    mockHolder.statSync = vi.fn();
    mockStatSync = mockHolder.statSync;

    // Setup mock watcher
    mockWatcher = {
      close: vi.fn(),
      on: vi.fn().mockReturnThis(),
    };
    (chokidar.watch as any).mockReturnValue(mockWatcher);

    // Setup mock window
    mockWindow = {
      isDestroyed: vi.fn().mockReturnValue(false),
      webContents: {
        send: vi.fn(),
      },
    };
    (BrowserWindow.fromId as any).mockReturnValue(mockWindow);

    // Setup mock git root finder
    (findRepoRoot as any).mockResolvedValue("/mock/git/root");
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Singleton Pattern", () => {
    it("should return the same instance", () => {
      const instance1 = FileWatcherService.getInstance();
      const instance2 = FileWatcherService.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe("subscribe()", () => {
    it("should create a new watcher entry for new cwd", async () => {
      await service.subscribe("/test/path", "pane-1", 1);

      expect(chokidar.watch).toHaveBeenCalledWith("/test/path", {
        ignored: [/(^|[/\\])\../, "**/node_modules/**", "**/.git/**"],
        ignoreInitial: true,
        persistent: true,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 50,
        },
      });

      expect(findRepoRoot).toHaveBeenCalledWith("/test/path");
    });

    it("should add subscriber to existing watcher", async () => {
      await service.subscribe("/test/path", "pane-1", 1);
      await service.subscribe("/test/path", "pane-2", 1);

      // Watch should only be called once
      expect(chokidar.watch).toHaveBeenCalledTimes(1);

      // Both panes should be subscribed
      expect(service.isSubscribed("/test/path", "pane-1")).toBe(true);
      expect(service.isSubscribed("/test/path", "pane-2")).toBe(true);
    });

    it("should normalize paths before subscribing", async () => {
      await service.subscribe("/test/path/../path", "pane-1", 1);

      expect(service.isSubscribed("/test/path", "pane-1")).toBe(true);
    });

    it("should attach event handlers to watcher", async () => {
      await service.subscribe("/test/path", "pane-1", 1);

      expect(mockWatcher.on).toHaveBeenCalledWith(
        "change",
        expect.any(Function),
      );
      expect(mockWatcher.on).toHaveBeenCalledWith("add", expect.any(Function));
      expect(mockWatcher.on).toHaveBeenCalledWith(
        "unlink",
        expect.any(Function),
      );
      expect(mockWatcher.on).toHaveBeenCalledWith(
        "addDir",
        expect.any(Function),
      );
      expect(mockWatcher.on).toHaveBeenCalledWith(
        "unlinkDir",
        expect.any(Function),
      );
    });
  });

  describe("unsubscribe()", () => {
    it("should remove subscriber from watcher", async () => {
      await service.subscribe("/test/path", "pane-1", 1);
      expect(service.isSubscribed("/test/path", "pane-1")).toBe(true);

      service.unsubscribe("/test/path", "pane-1");
      expect(service.isSubscribed("/test/path", "pane-1")).toBe(false);
    });

    it("should cleanup watcher when last subscriber is removed", async () => {
      await service.subscribe("/test/path", "pane-1", 1);
      service.unsubscribe("/test/path", "pane-1");

      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it("should not cleanup watcher if other subscribers exist", async () => {
      await service.subscribe("/test/path", "pane-1", 1);
      await service.subscribe("/test/path", "pane-2", 1);

      service.unsubscribe("/test/path", "pane-1");

      expect(mockWatcher.close).not.toHaveBeenCalled();
      expect(service.isSubscribed("/test/path", "pane-2")).toBe(true);
    });

    it("should do nothing if unsubscribing from non-existent watcher", () => {
      expect(() => {
        service.unsubscribe("/non/existent", "pane-1");
      }).not.toThrow();
    });
  });

  describe("isSubscribed()", () => {
    it("should return true for subscribed pane", async () => {
      await service.subscribe("/test/path", "pane-1", 1);
      expect(service.isSubscribed("/test/path", "pane-1")).toBe(true);
    });

    it("should return false for non-subscribed pane", () => {
      expect(service.isSubscribed("/test/path", "pane-1")).toBe(false);
    });

    it("should return false for different path", async () => {
      await service.subscribe("/test/path1", "pane-1", 1);
      expect(service.isSubscribed("/test/path2", "pane-1")).toBe(false);
    });

    it("should handle normalized paths", async () => {
      await service.subscribe("/test/path", "pane-1", 1);
      expect(service.isSubscribed("/test/path/../path", "pane-1")).toBe(true);
    });
  });

  describe("Event Handling", () => {
    let changeHandler: (filePath: string) => void;
    let addHandler: (filePath: string) => void;
    let unlinkHandler: (filePath: string) => void;
    let addDirHandler: (dirPath: string) => void;
    let unlinkDirHandler: (dirPath: string) => void;

    beforeEach(async () => {
      await service.subscribe("/test/path", "pane-1", 1);

      // Extract event handlers
      const onCalls = (mockWatcher.on as any).mock.calls;
      changeHandler = onCalls.find((call: any[]) => call[0] === "change")[1];
      addHandler = onCalls.find((call: any[]) => call[0] === "add")[1];
      unlinkHandler = onCalls.find((call: any[]) => call[0] === "unlink")[1];
      addDirHandler = onCalls.find((call: any[]) => call[0] === "addDir")[1];
      unlinkDirHandler = onCalls.find(
        (call: any[]) => call[0] === "unlinkDir",
      )[1];
    });

    describe("file change events", () => {
      it("should debounce file change events", () => {
        changeHandler("/test/path/file.txt");
        changeHandler("/test/path/file.txt");
        changeHandler("/test/path/file.txt");

        expect(mockWindow.webContents.send).not.toHaveBeenCalled();

        vi.advanceTimersByTime(50);

        // Should only send once after debounce
        expect(mockWindow.webContents.send).toHaveBeenCalledTimes(1);
        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
          "file-watcher:file-changed",
          {
            cwd: "/test/path",
            filePath: "/test/path/file.txt",
            relativePath: "file.txt",
            eventType: "changed",
          },
        );
      });

      it("should compute relative paths correctly", () => {
        changeHandler("/test/path/subdir/file.txt");
        vi.advanceTimersByTime(50);

        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
          "file-watcher:file-changed",
          expect.objectContaining({
            relativePath: "subdir/file.txt",
          }),
        );
      });
    });

    describe("file add events", () => {
      it("should debounce file add events and trigger tree change", () => {
        addHandler("/test/path/file1.txt");
        addHandler("/test/path/file2.txt");
        addHandler("/test/path/file3.txt");

        expect(mockWindow.webContents.send).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);

        // Should send tree-changed event once
        expect(mockWindow.webContents.send).toHaveBeenCalledTimes(1);
        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
          "file-watcher:tree-changed",
          { cwd: "/test/path" },
        );
      });
    });

    describe("file delete events", () => {
      it("should send both file-changed and tree-changed events", () => {
        unlinkHandler("/test/path/file.txt");

        // File-changed event is now debounced by 200ms to allow rename detection
        expect(mockWindow.webContents.send).not.toHaveBeenCalled();

        // Advance past deletion notification debounce (200ms)
        vi.advanceTimersByTime(200);

        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
          "file-watcher:file-changed",
          {
            cwd: "/test/path",
            filePath: "/test/path/file.txt",
            relativePath: "file.txt",
            eventType: "deleted",
          },
        );

        // Tree-changed should also fire (debounced at 100ms)
        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
          "file-watcher:tree-changed",
          { cwd: "/test/path" },
        );
      });
    });

    describe("directory add events", () => {
      it("should debounce directory add events", () => {
        addDirHandler("/test/path/dir1");
        addDirHandler("/test/path/dir2");

        expect(mockWindow.webContents.send).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);

        expect(mockWindow.webContents.send).toHaveBeenCalledTimes(1);
        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
          "file-watcher:tree-changed",
          { cwd: "/test/path" },
        );
      });
    });

    describe("directory delete events", () => {
      it("should debounce directory delete events", () => {
        unlinkDirHandler("/test/path/dir1");
        unlinkDirHandler("/test/path/dir2");

        expect(mockWindow.webContents.send).not.toHaveBeenCalled();

        vi.advanceTimersByTime(100);

        expect(mockWindow.webContents.send).toHaveBeenCalledTimes(1);
        expect(mockWindow.webContents.send).toHaveBeenCalledWith(
          "file-watcher:tree-changed",
          { cwd: "/test/path" },
        );
      });
    });
  });

  describe("Broadcasting", () => {
    it("should broadcast to all subscribers", async () => {
      const mockWindow1 = {
        isDestroyed: vi.fn().mockReturnValue(false),
        webContents: { send: vi.fn() },
      };
      const mockWindow2 = {
        isDestroyed: vi.fn().mockReturnValue(false),
        webContents: { send: vi.fn() },
      };

      (BrowserWindow.fromId as any)
        .mockReturnValueOnce(mockWindow1)
        .mockReturnValueOnce(mockWindow2);

      await service.subscribe("/test/path", "pane-1", 1);
      await service.subscribe("/test/path", "pane-2", 2);

      // Trigger a change event
      const onCalls = (mockWatcher.on as any).mock.calls;
      const changeHandler = onCalls.find(
        (call: any[]) => call[0] === "change",
      )[1];
      changeHandler("/test/path/file.txt");
      vi.advanceTimersByTime(50);

      // Both windows should receive the event
      expect(mockWindow1.webContents.send).toHaveBeenCalledWith(
        "file-watcher:file-changed",
        expect.any(Object),
      );
      expect(mockWindow2.webContents.send).toHaveBeenCalledWith(
        "file-watcher:file-changed",
        expect.any(Object),
      );
    });

    it("should skip destroyed windows", async () => {
      const mockDestroyedWindow = {
        isDestroyed: vi.fn().mockReturnValue(true),
        webContents: { send: vi.fn() },
      };

      (BrowserWindow.fromId as any).mockReturnValue(mockDestroyedWindow);

      await service.subscribe("/test/path", "pane-1", 1);

      const onCalls = (mockWatcher.on as any).mock.calls;
      const changeHandler = onCalls.find(
        (call: any[]) => call[0] === "change",
      )[1];
      changeHandler("/test/path/file.txt");
      vi.advanceTimersByTime(50);

      expect(mockDestroyedWindow.webContents.send).not.toHaveBeenCalled();
    });

    it("should cleanup watcher when all subscribers have destroyed windows", async () => {
      const mockDestroyedWindow = {
        isDestroyed: vi.fn().mockReturnValue(true),
        webContents: { send: vi.fn() },
      };

      (BrowserWindow.fromId as any).mockReturnValue(mockDestroyedWindow);

      await service.subscribe("/test/path", "pane-1", 1);

      const onCalls = (mockWatcher.on as any).mock.calls;
      const changeHandler = onCalls.find(
        (call: any[]) => call[0] === "change",
      )[1];
      changeHandler("/test/path/file.txt");
      vi.advanceTimersByTime(50);

      // Watcher should be closed because all subscribers are dead
      expect(mockWatcher.close).toHaveBeenCalled();
    });

    it("should handle null window from BrowserWindow.fromId", async () => {
      (BrowserWindow.fromId as any).mockReturnValue(null);

      await service.subscribe("/test/path", "pane-1", 1);

      const onCalls = (mockWatcher.on as any).mock.calls;
      const changeHandler = onCalls.find(
        (call: any[]) => call[0] === "change",
      )[1];

      expect(() => {
        changeHandler("/test/path/file.txt");
        vi.advanceTimersByTime(50);
      }).not.toThrow();

      // Watcher should be closed because subscriber is invalid
      expect(mockWatcher.close).toHaveBeenCalled();
    });
  });

  describe("Debouncing", () => {
    let changeHandler: (filePath: string) => void;

    beforeEach(async () => {
      await service.subscribe("/test/path", "pane-1", 1);

      const onCalls = (mockWatcher.on as any).mock.calls;
      changeHandler = onCalls.find((call: any[]) => call[0] === "change")[1];
    });

    it("should reset debounce timer on rapid events", () => {
      changeHandler("/test/path/file.txt");
      vi.advanceTimersByTime(25); // Advance halfway

      changeHandler("/test/path/file.txt");
      vi.advanceTimersByTime(25); // Advance halfway again

      expect(mockWindow.webContents.send).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50); // Complete the debounce

      expect(mockWindow.webContents.send).toHaveBeenCalledTimes(1);
    });

    it("should handle different files independently", () => {
      changeHandler("/test/path/file1.txt");
      changeHandler("/test/path/file2.txt");

      vi.advanceTimersByTime(50);

      // Both files should trigger separate events
      expect(mockWindow.webContents.send).toHaveBeenCalledTimes(2);
      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        "file-watcher:file-changed",
        expect.objectContaining({ relativePath: "file1.txt" }),
      );
      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        "file-watcher:file-changed",
        expect.objectContaining({ relativePath: "file2.txt" }),
      );
    });
  });

  describe("Cleanup", () => {
    it("should clear debounce timers when cleaning up watcher", async () => {
      await service.subscribe("/test/path", "pane-1", 1);

      // Trigger an event to create a debounce timer
      const onCalls = (mockWatcher.on as any).mock.calls;
      const changeHandler = onCalls.find(
        (call: any[]) => call[0] === "change",
      )[1];
      changeHandler("/test/path/file.txt");

      // Unsubscribe before timer fires
      service.unsubscribe("/test/path", "pane-1");

      // Advance timers
      vi.advanceTimersByTime(50);

      // Event should not be sent because timer was cleared
      expect(mockWindow.webContents.send).not.toHaveBeenCalled();
      expect(mockWatcher.close).toHaveBeenCalled();
    });
  });

  describe("Error Handling", () => {
    it("should handle watcher setup errors gracefully", async () => {
      (chokidar.watch as any).mockImplementationOnce(() => {
        throw new Error("Mock watcher error");
      });

      // Should not throw
      await expect(
        service.subscribe("/test/path", "pane-1", 1),
      ).resolves.not.toThrow();
    });

    it("should handle git root detection errors gracefully", async () => {
      (findRepoRoot as any).mockRejectedValueOnce(new Error("Git not found"));

      // Should not throw even when git root detection fails
      await expect(
        service.subscribe("/test/path", "pane-1", 1),
      ).resolves.not.toThrow();

      // Watcher should NOT be created because git detection failed
      // (error is caught in try-catch, preventing watcher creation)
      expect(chokidar.watch).not.toHaveBeenCalled();
    });
  });

  describe("Rename Detection", () => {
    let addHandler: (filePath: string) => void;
    let unlinkHandler: (filePath: string) => void;

    beforeEach(async () => {
      await service.subscribe("/test/path", "pane-1", 1);

      // Extract event handlers
      const onCalls = (mockWatcher.on as any).mock.calls;
      addHandler = onCalls.find((call: any[]) => call[0] === "add")[1];
      unlinkHandler = onCalls.find((call: any[]) => call[0] === "unlink")[1];

      vi.clearAllMocks();

      // Setup default mock behavior for statSync (using the holder reference)
      mockHolder.statSync.mockReturnValue({
        size: 1024,
        mtimeMs: Date.now(),
      });
    });

    it("should cancel deletion notification when rename is detected", () => {
      // This test verifies that when a rename is detected,
      // the pending deletion notification is cancelled to prevent
      // a brief "file deleted" flash in the UI

      // Simulate file unlink
      unlinkHandler("/test/path/old-name.txt");

      // Advance time slightly (within 500ms window and before deletion notification fires)
      vi.advanceTimersByTime(100);

      // Deletion notification should NOT have fired yet (it's debounced by 200ms)
      expect(mockWindow.webContents.send).not.toHaveBeenCalledWith(
        "file-watcher:file-changed",
        expect.objectContaining({ eventType: "deleted" }),
      );

      // Simulate file add in same directory - this triggers rename detection
      addHandler("/test/path/new-name.txt");

      // Advance past all debounce timers
      vi.advanceTimersByTime(200);

      // Should broadcast rename event
      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        "file-watcher:file-renamed",
        expect.objectContaining({
          oldPath: "/test/path/old-name.txt",
          newPath: "/test/path/new-name.txt",
        }),
      );

      // Should NOT broadcast deletion event (it was cancelled)
      expect(mockWindow.webContents.send).not.toHaveBeenCalledWith(
        "file-watcher:file-changed",
        expect.objectContaining({ eventType: "deleted" }),
      );
    });

    it("should not detect rename if events are more than 500ms apart", () => {
      // Simulate file unlink
      unlinkHandler("/test/path/old-name.txt");

      // Advance time beyond 500ms window
      vi.advanceTimersByTime(600);

      // Simulate file add
      addHandler("/test/path/new-name.txt");

      // Advance debounce timers
      vi.advanceTimersByTime(150);

      // Should NOT broadcast rename event
      expect(mockWindow.webContents.send).not.toHaveBeenCalledWith(
        "file-watcher:file-renamed",
        expect.anything(),
      );

      // Should broadcast tree change instead
      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        "file-watcher:tree-changed",
        expect.anything(),
      );
    });

    it("should not detect rename if files are in different directories", () => {
      // Simulate file unlink in one directory
      unlinkHandler("/test/path/dir1/file.txt");

      vi.advanceTimersByTime(100);

      // Simulate file add in different directory
      addHandler("/test/path/dir2/file.txt");

      vi.advanceTimersByTime(150);

      // Should NOT broadcast rename event (different directories)
      expect(mockWindow.webContents.send).not.toHaveBeenCalledWith(
        "file-watcher:file-renamed",
        expect.anything(),
      );
    });

    it("should clean up rename tracking after 500ms", () => {
      // Simulate file unlink
      unlinkHandler("/test/path/old-name.txt");

      // Advance time to trigger cleanup timeout
      vi.advanceTimersByTime(500);

      // Now add a file
      addHandler("/test/path/new-name.txt");

      vi.advanceTimersByTime(150);

      // Should NOT detect rename (tracking entry was cleaned up)
      expect(mockWindow.webContents.send).not.toHaveBeenCalledWith(
        "file-watcher:file-renamed",
        expect.anything(),
      );
    });

    it("should broadcast tree-changed even when rename detection fails", () => {
      // Note: This test verifies that tree-changed events are still sent
      // even if rename detection encounters an error

      // Simulate rename (unlink + add)
      unlinkHandler("/test/path/old-name.txt");
      vi.advanceTimersByTime(100);
      addHandler("/test/path/new-name.txt");

      // Advance debounce timers
      vi.advanceTimersByTime(150);

      // Should still broadcast tree-changed even if rename detection fails
      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        "file-watcher:tree-changed",
        expect.objectContaining({
          cwd: "/test/path",
        }),
      );
    });
  });
});
