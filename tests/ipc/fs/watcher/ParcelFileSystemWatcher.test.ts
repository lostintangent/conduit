import {
  describe,
  it,
  expect,
  beforeEach,
  vi,
  afterEach,
  MockedFunction,
} from "vitest";
import type { AsyncSubscription } from "@parcel/watcher";
import fs from "node:fs";

// Mock @parcel/watcher
vi.mock("@parcel/watcher", () => ({
  default: {
    subscribe: vi.fn(),
  },
}));

// Mock fs for realpath and stat
vi.mock("node:fs", () => ({
  default: {
    realpathSync: vi.fn((path: string) => path),
    statSync: vi.fn((path: string) => ({
      isDirectory: () => false,
      isFile: () => true,
    })),
  },
}));

import watcher from "@parcel/watcher";
import { ParcelFileSystemWatcher } from "../../../../src/ipc/fs/watcher/ParcelFileSystemWatcher";

describe("ParcelFileSystemWatcher", () => {
  let fsWatcher: ParcelFileSystemWatcher;
  let mockSubscription: AsyncSubscription;
  let capturedCallback: ((err: Error | null, events: any[]) => void) | null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    capturedCallback = null;

    mockSubscription = {
      unsubscribe: vi.fn(),
    };

    (watcher.subscribe as any).mockImplementation(
      (path: string, callback: any) => {
        capturedCallback = callback;
        return Promise.resolve(mockSubscription);
      },
    );

    (
      fs.realpathSync as MockedFunction<typeof fs.realpathSync>
    ).mockImplementation((path) => path as string);

    fsWatcher = new ParcelFileSystemWatcher("/test/path", {
      ignored: ["**/node_modules/**", "**/.git/**"],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should resolve real path for cwd", () => {
      (fs.realpathSync as any).mockReturnValueOnce("/real/test/path");

      const watcher = new ParcelFileSystemWatcher("/test/path");

      expect(fs.realpathSync).toHaveBeenCalledWith("/test/path");
    });

    it("should fallback to resolved path on realpath error", () => {
      (fs.realpathSync as any).mockImplementationOnce(() => {
        throw new Error("Realpath error");
      });

      expect(() => {
        new ParcelFileSystemWatcher("/test/path");
      }).not.toThrow();
    });
  });

  describe("watch()", () => {
    it("should setup watcher with correct options", async () => {
      await fsWatcher.watch();

      expect(watcher.subscribe).toHaveBeenCalledWith(
        "/test/path",
        expect.any(Function),
        expect.objectContaining({
          backend: expect.any(String),
          ignore: ["**/node_modules/**", "**/.git/**"],
        }),
      );
    });

    it("should use correct backend for macOS", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", {
        value: "darwin",
      });

      await fsWatcher.watch();

      expect(watcher.subscribe).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
        expect.objectContaining({
          backend: "fs-events",
        }),
      );

      Object.defineProperty(process, "platform", {
        value: originalPlatform,
      });
    });

    it("should use correct backend for Linux", async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, "platform", {
        value: "linux",
      });

      await fsWatcher.watch();

      expect(watcher.subscribe).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Function),
        expect.objectContaining({
          backend: "inotify",
        }),
      );

      Object.defineProperty(process, "platform", {
        value: originalPlatform,
      });
    });

    it("should not setup watcher if already watching", async () => {
      await fsWatcher.watch();
      await fsWatcher.watch();

      expect(watcher.subscribe).toHaveBeenCalledTimes(1);
    });

    it("should handle watch errors", async () => {
      const error = new Error("Watch error");
      (watcher.subscribe as any).mockRejectedValueOnce(error);

      await expect(fsWatcher.watch()).rejects.toThrow("Watch error");
    });
  });

  describe("unwatch()", () => {
    it("should unsubscribe from watcher", async () => {
      await fsWatcher.watch();
      await fsWatcher.unwatch();

      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    });

    it("should clear debounce timers", async () => {
      const callback = vi.fn();
      fsWatcher.onFileChanged(callback);

      await fsWatcher.watch();

      // Trigger file change to create debounce timer
      capturedCallback!(null, [
        { type: "update", path: "/test/path/file.txt" },
      ]);

      // Unwatch before debounce fires
      await fsWatcher.unwatch();

      vi.advanceTimersByTime(100);

      // Callback should not fire because timers were cleared
      expect(callback).not.toHaveBeenCalled();
    });

    it("should not error if not watching", async () => {
      await expect(fsWatcher.unwatch()).resolves.not.toThrow();
    });
  });

  describe("onFileChanged()", () => {
    it("should register callback for file changes", async () => {
      const callback = vi.fn();

      fsWatcher.onFileChanged(callback);
      await fsWatcher.watch();

      capturedCallback!(null, [
        { type: "update", path: "/test/path/file.txt" },
      ]);

      vi.advanceTimersByTime(50);

      expect(callback).toHaveBeenCalledWith({
        cwd: "/test/path",
        filePath: "/test/path/file.txt",
        relativePath: "file.txt",
        eventType: "changed",
      });
    });

    it("should debounce rapid file changes", async () => {
      const callback = vi.fn();

      fsWatcher.onFileChanged(callback);
      await fsWatcher.watch();

      // Rapid changes to same file
      capturedCallback!(null, [
        { type: "update", path: "/test/path/file.txt" },
      ]);
      vi.advanceTimersByTime(25);

      capturedCallback!(null, [
        { type: "update", path: "/test/path/file.txt" },
      ]);
      vi.advanceTimersByTime(25);

      capturedCallback!(null, [
        { type: "update", path: "/test/path/file.txt" },
      ]);

      // Advance full debounce period
      vi.advanceTimersByTime(50);

      // Should only call once despite multiple updates
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should handle file deletions", async () => {
      const callback = vi.fn();

      fsWatcher.onFileChanged(callback);
      await fsWatcher.watch();

      capturedCallback!(null, [
        { type: "delete", path: "/test/path/file.txt" },
      ]);

      vi.advanceTimersByTime(200);

      expect(callback).toHaveBeenCalledWith({
        cwd: "/test/path",
        filePath: "/test/path/file.txt",
        relativePath: "file.txt",
        eventType: "deleted",
      });
    });

    it("should support multiple callbacks", async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      fsWatcher.onFileChanged(callback1);
      fsWatcher.onFileChanged(callback2);
      await fsWatcher.watch();

      capturedCallback!(null, [
        { type: "update", path: "/test/path/file.txt" },
      ]);

      vi.advanceTimersByTime(50);

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });
  });

  describe("onFileRenamed()", () => {
    it("should detect rename in same directory", async () => {
      const callback = vi.fn();

      fsWatcher.onFileRenamed(callback);
      await fsWatcher.watch();

      // Simulate rename: delete old, add new
      capturedCallback!(null, [
        { type: "delete", path: "/test/path/old.txt" },
        { type: "create", path: "/test/path/new.txt" },
      ]);

      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledWith({
        cwd: "/test/path",
        oldPath: "/test/path/old.txt",
        newPath: "/test/path/new.txt",
        oldRelativePath: "old.txt",
        newRelativePath: "new.txt",
        isDirectory: false,
      });
    });

    it("should not detect rename if files in different directories", async () => {
      const callback = vi.fn();

      fsWatcher.onFileRenamed(callback);
      await fsWatcher.watch();

      capturedCallback!(null, [
        { type: "delete", path: "/test/path/dir1/file.txt" },
        { type: "create", path: "/test/path/dir2/file.txt" },
      ]);

      vi.advanceTimersByTime(100);

      expect(callback).not.toHaveBeenCalled();
    });

    it("should not detect rename if events too far apart", async () => {
      const callback = vi.fn();

      fsWatcher.onFileRenamed(callback);
      await fsWatcher.watch();

      capturedCallback!(null, [{ type: "delete", path: "/test/path/old.txt" }]);

      vi.advanceTimersByTime(600);

      capturedCallback!(null, [{ type: "create", path: "/test/path/new.txt" }]);

      vi.advanceTimersByTime(100);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("onTreeChanged()", () => {
    it("should trigger on file creation", async () => {
      const callback = vi.fn();

      fsWatcher.onTreeChanged(callback);
      await fsWatcher.watch();

      capturedCallback!(null, [
        { type: "create", path: "/test/path/newfile.txt" },
      ]);

      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledWith({
        cwd: "/test/path",
      });
    });

    it("should trigger on file deletion", async () => {
      const callback = vi.fn();

      fsWatcher.onTreeChanged(callback);
      await fsWatcher.watch();

      capturedCallback!(null, [
        { type: "delete", path: "/test/path/file.txt" },
      ]);

      vi.advanceTimersByTime(100);

      expect(callback).toHaveBeenCalledWith({
        cwd: "/test/path",
      });
    });

    it("should debounce multiple tree changes", async () => {
      const callback = vi.fn();

      fsWatcher.onTreeChanged(callback);
      await fsWatcher.watch();

      // Multiple creates
      capturedCallback!(null, [
        { type: "create", path: "/test/path/file1.txt" },
        { type: "create", path: "/test/path/file2.txt" },
        { type: "create", path: "/test/path/file3.txt" },
      ]);

      vi.advanceTimersByTime(100);

      // Should only call once despite multiple changes
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("should not trigger on file updates", async () => {
      const callback = vi.fn();

      fsWatcher.onTreeChanged(callback);
      await fsWatcher.watch();

      capturedCallback!(null, [
        { type: "update", path: "/test/path/file.txt" },
      ]);

      vi.advanceTimersByTime(100);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe("isWatching()", () => {
    it("should return false initially", () => {
      expect(fsWatcher.isWatching()).toBe(false);
    });

    it("should return true after watching", async () => {
      await fsWatcher.watch();
      expect(fsWatcher.isWatching()).toBe(true);
    });

    it("should return false after unwatching", async () => {
      await fsWatcher.watch();
      await fsWatcher.unwatch();
      expect(fsWatcher.isWatching()).toBe(false);
    });
  });

  describe("getPath()", () => {
    it("should return the cwd path", () => {
      expect(fsWatcher.getPath()).toBe("/test/path");
    });
  });

  describe("error handling", () => {
    it("should handle error in watcher callback", async () => {
      const callback = vi.fn();
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      fsWatcher.onFileChanged(callback);
      await fsWatcher.watch();

      const error = new Error("Watcher error");
      capturedCallback!(error, []);

      expect(callback).not.toHaveBeenCalled();
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe("path handling", () => {
    it("should compute correct relative paths", async () => {
      const callback = vi.fn();

      fsWatcher.onFileChanged(callback);
      await fsWatcher.watch();

      capturedCallback!(null, [
        { type: "update", path: "/test/path/subdir/file.txt" },
      ]);

      vi.advanceTimersByTime(50);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          relativePath: "subdir/file.txt",
        }),
      );
    });

    it("should handle symlinked paths correctly", async () => {
      (fs.realpathSync as any).mockReturnValueOnce("/real/test/path");

      const watcher = new ParcelFileSystemWatcher("/test/path");
      const callback = vi.fn();

      watcher.onFileChanged(callback);
      await watcher.watch();

      // Event comes with real path
      capturedCallback!(null, [
        { type: "update", path: "/real/test/path/file.txt" },
      ]);

      vi.advanceTimersByTime(50);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          relativePath: "file.txt",
        }),
      );
    });
  });

  describe("event batching", () => {
    it("should handle batched events from watcher", async () => {
      const fileCallback = vi.fn();
      const treeCallback = vi.fn();

      fsWatcher.onFileChanged(fileCallback);
      fsWatcher.onTreeChanged(treeCallback);
      await fsWatcher.watch();

      // Watcher sends multiple events in batch
      capturedCallback!(null, [
        { type: "create", path: "/test/path/file1.txt" },
        { type: "update", path: "/test/path/file2.txt" },
        { type: "delete", path: "/test/path/file3.txt" },
      ]);

      vi.advanceTimersByTime(200);

      // Tree change should fire once (debounced)
      expect(treeCallback).toHaveBeenCalledTimes(1);

      // File changes should be tracked
      expect(fileCallback).toHaveBeenCalled();
    });
  });
});
