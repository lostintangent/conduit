import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  type MockedFunction,
} from "vitest";
import type { AsyncSubscription } from "@parcel/watcher";
import fs from "node:fs";

// Mock @parcel/watcher
vi.mock("@parcel/watcher", () => ({
  default: {
    subscribe: vi.fn(),
  },
}));

// Mock fs for realpathSync and statSync
vi.mock("node:fs", () => ({
  default: {
    realpathSync: vi.fn((p: string) => p),
    statSync: vi.fn(() => ({
      isDirectory: () => false,
      isFile: () => true,
    })),
  },
}));

import watcher from "@parcel/watcher";
import { ParcelFileWatcher } from "../../../src/ipc/fsv2/watcher/ParcelFileWatcher";

describe("ParcelFileWatcher", () => {
  let fileWatcher: ParcelFileWatcher;
  let mockSubscription: AsyncSubscription;
  let capturedCallback:
    | ((
        err: Error | null,
        events: Array<{ type: "create" | "update" | "delete"; path: string }>,
      ) => void)
    | null;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    capturedCallback = null;

    mockSubscription = {
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    };

    (
      watcher.subscribe as MockedFunction<typeof watcher.subscribe>
    ).mockImplementation(async (_path, callback) => {
      capturedCallback = callback;
      return mockSubscription;
    });

    (
      fs.realpathSync as MockedFunction<typeof fs.realpathSync>
    ).mockImplementation((p) => p as string);

    (fs.statSync as MockedFunction<typeof fs.statSync>).mockImplementation(
      () =>
        ({
          isDirectory: () => false,
          isFile: () => true,
        }) as fs.Stats,
    );

    fileWatcher = new ParcelFileWatcher("/test/project", {
      ignored: ["**/node_modules/**"],
    });
  });

  afterEach(async () => {
    await fileWatcher.dispose();
    vi.useRealTimers();
  });

  describe("constructor", () => {
    it("should resolve real path for symlinks", () => {
      (
        fs.realpathSync as MockedFunction<typeof fs.realpathSync>
      ).mockReturnValueOnce("/real/path");

      new ParcelFileWatcher("/symlink/path");

      expect(fs.realpathSync).toHaveBeenCalledWith("/symlink/path");
    });

    it("should fallback to resolved path on realpath error", () => {
      (
        fs.realpathSync as MockedFunction<typeof fs.realpathSync>
      ).mockImplementationOnce(() => {
        throw new Error("Realpath error");
      });

      expect(() => new ParcelFileWatcher("/test/path")).not.toThrow();
    });

    it("should use default ignored patterns when not specified", async () => {
      const w = new ParcelFileWatcher("/test/path");
      await w.watch();

      expect(watcher.subscribe).toHaveBeenCalledWith(
        "/test/path",
        expect.any(Function),
        expect.objectContaining({
          ignore: expect.arrayContaining([
            "**/node_modules/**",
            "**/.git/**",
            "**/dist/**",
          ]),
        }),
      );

      await w.dispose();
    });
  });

  describe("watch()", () => {
    it("should setup watcher with correct options", async () => {
      await fileWatcher.watch();

      expect(watcher.subscribe).toHaveBeenCalledWith(
        "/test/project",
        expect.any(Function),
        expect.objectContaining({
          backend: expect.any(String),
          ignore: ["**/node_modules/**"],
        }),
      );
    });

    it("should set watching to true after successful watch", async () => {
      expect(fileWatcher.isWatching()).toBe(false);

      await fileWatcher.watch();

      expect(fileWatcher.isWatching()).toBe(true);
    });

    it("should not start watching twice", async () => {
      await fileWatcher.watch();
      await fileWatcher.watch();

      expect(watcher.subscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe("unwatch()", () => {
    it("should unsubscribe and set watching to false", async () => {
      await fileWatcher.watch();
      expect(fileWatcher.isWatching()).toBe(true);

      await fileWatcher.unwatch();

      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
      expect(fileWatcher.isWatching()).toBe(false);
    });

    it("should be safe to call when not watching", async () => {
      await expect(fileWatcher.unwatch()).resolves.not.toThrow();
    });
  });

  describe("onCreated event", () => {
    it("should fire for new files after debounce", async () => {
      const listener = vi.fn();
      fileWatcher.onCreated(listener);

      await fileWatcher.watch();

      capturedCallback!(null, [
        { type: "create", path: "/test/project/new.ts" },
      ]);

      // Event is debounced (200ms to allow rename detection)
      expect(listener).not.toHaveBeenCalled();

      // Advance past debounce delay
      vi.advanceTimersByTime(200);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        path: "/test/project/new.ts",
        isDirectory: false,
      });
    });

    it("should detect directories", async () => {
      (
        fs.statSync as MockedFunction<typeof fs.statSync>
      ).mockImplementationOnce(
        () =>
          ({
            isDirectory: () => true,
            isFile: () => false,
          }) as fs.Stats,
      );

      const listener = vi.fn();
      fileWatcher.onCreated(listener);

      await fileWatcher.watch();

      capturedCallback!(null, [
        { type: "create", path: "/test/project/newdir" },
      ]);
      vi.advanceTimersByTime(200);

      expect(listener).toHaveBeenCalledWith({
        path: "/test/project/newdir",
        isDirectory: true,
      });
    });
  });

  describe("onModified event", () => {
    it("should fire for changed files after debounce", async () => {
      const listener = vi.fn();
      fileWatcher.onModified(listener);

      await fileWatcher.watch();

      capturedCallback!(null, [
        { type: "update", path: "/test/project/file.ts" },
      ]);

      expect(listener).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        path: "/test/project/file.ts",
      });
    });

    it("should debounce rapid updates", async () => {
      const listener = vi.fn();
      fileWatcher.onModified(listener);

      await fileWatcher.watch();

      // Rapid updates to same file
      capturedCallback!(null, [
        { type: "update", path: "/test/project/file.ts" },
      ]);
      vi.advanceTimersByTime(25);
      capturedCallback!(null, [
        { type: "update", path: "/test/project/file.ts" },
      ]);
      vi.advanceTimersByTime(25);
      capturedCallback!(null, [
        { type: "update", path: "/test/project/file.ts" },
      ]);
      vi.advanceTimersByTime(50);

      // Only one event should fire
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("onDeleted event", () => {
    it("should fire for deleted files after debounce", async () => {
      const listener = vi.fn();
      fileWatcher.onDeleted(listener);

      await fileWatcher.watch();

      capturedCallback!(null, [
        { type: "delete", path: "/test/project/old.ts" },
      ]);

      // Delete has longer debounce to allow rename detection
      vi.advanceTimersByTime(199);
      expect(listener).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({
        path: "/test/project/old.ts",
        isDirectory: false,
      });
    });
  });

  describe("onRenamed event", () => {
    it("should detect rename when DELETE comes before CREATE", async () => {
      const renameListener = vi.fn();
      const deleteListener = vi.fn();
      const createListener = vi.fn();

      fileWatcher.onRenamed(renameListener);
      fileWatcher.onDeleted(deleteListener);
      fileWatcher.onCreated(createListener);

      await fileWatcher.watch();

      // DELETE followed by CREATE within 500ms window
      capturedCallback!(null, [
        { type: "delete", path: "/test/project/old.ts" },
      ]);

      vi.advanceTimersByTime(100);

      capturedCallback!(null, [
        { type: "create", path: "/test/project/new.ts" },
      ]);

      // Rename should fire immediately on CREATE
      expect(renameListener).toHaveBeenCalledTimes(1);
      expect(renameListener).toHaveBeenCalledWith({
        oldPath: "/test/project/old.ts",
        newPath: "/test/project/new.ts",
        isDirectory: false,
      });

      // No separate delete or create events
      vi.advanceTimersByTime(200);
      expect(deleteListener).not.toHaveBeenCalled();
      expect(createListener).not.toHaveBeenCalled();
    });

    it("should detect rename when CREATE comes before DELETE", async () => {
      const renameListener = vi.fn();
      const deleteListener = vi.fn();
      const createListener = vi.fn();

      fileWatcher.onRenamed(renameListener);
      fileWatcher.onDeleted(deleteListener);
      fileWatcher.onCreated(createListener);

      await fileWatcher.watch();

      // CREATE followed by DELETE within 500ms window
      capturedCallback!(null, [
        { type: "create", path: "/test/project/new.ts" },
      ]);

      vi.advanceTimersByTime(100);

      capturedCallback!(null, [
        { type: "delete", path: "/test/project/old.ts" },
      ]);

      // Rename should fire immediately on DELETE
      expect(renameListener).toHaveBeenCalledTimes(1);
      expect(renameListener).toHaveBeenCalledWith({
        oldPath: "/test/project/old.ts",
        newPath: "/test/project/new.ts",
        isDirectory: false,
      });

      // No separate delete or create events
      vi.advanceTimersByTime(200);
      expect(deleteListener).not.toHaveBeenCalled();
      expect(createListener).not.toHaveBeenCalled();
    });

    it("should NOT detect rename if events are in different directories", async () => {
      const renameListener = vi.fn();
      const deleteListener = vi.fn();
      const createListener = vi.fn();

      fileWatcher.onRenamed(renameListener);
      fileWatcher.onDeleted(deleteListener);
      fileWatcher.onCreated(createListener);

      await fileWatcher.watch();

      // DELETE and CREATE in different directories
      capturedCallback!(null, [
        { type: "delete", path: "/test/project/src/old.ts" },
      ]);

      vi.advanceTimersByTime(100);

      capturedCallback!(null, [
        { type: "create", path: "/test/project/lib/new.ts" },
      ]);

      vi.advanceTimersByTime(200);

      // Should NOT be detected as rename
      expect(renameListener).not.toHaveBeenCalled();

      // Separate events should fire
      expect(deleteListener).toHaveBeenCalledWith({
        path: "/test/project/src/old.ts",
        isDirectory: false,
      });
      expect(createListener).toHaveBeenCalledWith({
        path: "/test/project/lib/new.ts",
        isDirectory: false,
      });
    });

    it("should NOT detect rename if events are more than 500ms apart", async () => {
      const renameListener = vi.fn();
      const deleteListener = vi.fn();
      const createListener = vi.fn();

      fileWatcher.onRenamed(renameListener);
      fileWatcher.onDeleted(deleteListener);
      fileWatcher.onCreated(createListener);

      await fileWatcher.watch();

      // DELETE event
      capturedCallback!(null, [
        { type: "delete", path: "/test/project/old.ts" },
      ]);

      // Wait past the 500ms correlation window
      vi.advanceTimersByTime(600);

      // CREATE event (too late for rename detection)
      capturedCallback!(null, [
        { type: "create", path: "/test/project/new.ts" },
      ]);

      vi.advanceTimersByTime(200);

      // Should NOT be detected as rename
      expect(renameListener).not.toHaveBeenCalled();

      // Separate events should fire
      expect(deleteListener).toHaveBeenCalled();
      expect(createListener).toHaveBeenCalled();
    });

    it("should detect directory rename", async () => {
      (fs.statSync as MockedFunction<typeof fs.statSync>).mockImplementation(
        () =>
          ({
            isDirectory: () => true,
            isFile: () => false,
          }) as fs.Stats,
      );

      const renameListener = vi.fn();
      fileWatcher.onRenamed(renameListener);

      await fileWatcher.watch();

      capturedCallback!(null, [
        { type: "delete", path: "/test/project/olddir" },
      ]);
      vi.advanceTimersByTime(100);
      capturedCallback!(null, [
        { type: "create", path: "/test/project/newdir" },
      ]);

      expect(renameListener).toHaveBeenCalledWith({
        oldPath: "/test/project/olddir",
        newPath: "/test/project/newdir",
        isDirectory: true,
      });
    });
  });

  describe("dispose()", () => {
    it("should stop watching and dispose emitters", async () => {
      const listener = vi.fn();
      fileWatcher.onCreated(listener);

      await fileWatcher.watch();
      await fileWatcher.dispose();

      expect(fileWatcher.isWatching()).toBe(false);

      // Emitter should be disposed - new events should not fire
      // (The EventEmitter.dispose() makes fire() a no-op)
    });

    it("should be safe to call multiple times", async () => {
      await fileWatcher.watch();

      await expect(fileWatcher.dispose()).resolves.not.toThrow();
      await expect(fileWatcher.dispose()).resolves.not.toThrow();
    });
  });

  describe("error handling", () => {
    it("should handle watcher errors gracefully", async () => {
      const listener = vi.fn();
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      fileWatcher.onCreated(listener);
      await fileWatcher.watch();

      // Simulate an error from @parcel/watcher
      capturedCallback!(new Error("Watcher error"), []);

      expect(consoleSpy).toHaveBeenCalled();
      expect(listener).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should handle stat errors gracefully", async () => {
      (
        fs.statSync as MockedFunction<typeof fs.statSync>
      ).mockImplementationOnce(() => {
        throw new Error("Stat error");
      });

      const listener = vi.fn();
      fileWatcher.onCreated(listener);

      await fileWatcher.watch();

      capturedCallback!(null, [
        { type: "create", path: "/test/project/new.ts" },
      ]);
      vi.advanceTimersByTime(200);

      // Should still emit event with isDirectory: false as fallback
      expect(listener).toHaveBeenCalledWith({
        path: "/test/project/new.ts",
        isDirectory: false,
      });
    });
  });

  describe("subscription cleanup", () => {
    it("should stop receiving events after dispose", async () => {
      const listener = vi.fn();
      fileWatcher.onCreated(listener);

      await fileWatcher.watch();
      await fileWatcher.dispose();

      // Try to fire an event after dispose
      capturedCallback!(null, [
        { type: "create", path: "/test/project/new.ts" },
      ]);
      vi.advanceTimersByTime(200);

      expect(listener).not.toHaveBeenCalled();
    });

    it("should return disposable from event subscription", async () => {
      const listener = vi.fn();
      const subscription = fileWatcher.onCreated(listener);

      await fileWatcher.watch();

      // Dispose the subscription
      subscription.dispose();

      capturedCallback!(null, [
        { type: "create", path: "/test/project/new.ts" },
      ]);
      vi.advanceTimersByTime(200);

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
