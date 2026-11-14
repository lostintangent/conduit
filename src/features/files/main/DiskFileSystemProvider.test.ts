import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Stats, Dirent } from "node:fs";

/** Helper to create file entries for testing */
const fileEntry = (name: string, isSymlink = false) => ({
  name,
  type: "file" as const,
  isSymlink,
});

const dirEntry = (name: string, isSymlink = false) => ({
  name,
  type: "directory" as const,
  isSymlink,
});

// ============================================================================
// Mocks - Using vi.hoisted() to ensure proper hoisting
// ============================================================================

// Hoisted mock functions and state
const {
  mockStat,
  mockLstat,
  mockReaddir,
  mockReadFile,
  mockWriteFile,
  mockRm,
  mockRename,
  mockMkdir,
  mockAccess,
  mockCacheGet,
  mockCacheSet,
  mockCacheHas,
  mockCacheDelete,
  watcherCallbacks,
  mockWatcherMethods,
} = vi.hoisted(() => {
  const watcherCallbacks = {
    onCreated: null as
      ((event: { path: string; isDirectory: boolean }) => void) | null,
    onModified: null as ((event: { path: string }) => void) | null,
    onDeleted: null as
      ((event: { path: string; isDirectory: boolean }) => void) | null,
    onRenamed: null as
      | ((event: {
          oldPath: string;
          newPath: string;
          isDirectory: boolean;
        }) => void)
      | null,
  };

  const mockWatcherMethods = {
    watch: vi.fn().mockResolvedValue(undefined),
    unwatch: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn().mockResolvedValue(undefined),
    isWatching: vi.fn().mockReturnValue(false),
  };

  return {
    mockStat: vi.fn(),
    mockLstat: vi.fn(),
    mockReaddir: vi.fn(),
    mockReadFile: vi.fn(),
    mockWriteFile: vi.fn(),
    mockRm: vi.fn(),
    mockRename: vi.fn(),
    mockMkdir: vi.fn(),
    mockAccess: vi.fn(),
    mockCacheGet: vi.fn(),
    mockCacheSet: vi.fn(),
    mockCacheHas: vi.fn(),
    mockCacheDelete: vi.fn(),
    watcherCallbacks,
    mockWatcherMethods,
  };
});

vi.mock("node:fs/promises", () => ({
  stat: mockStat,
  lstat: mockLstat,
  readdir: mockReaddir,
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  rm: mockRm,
  rename: mockRename,
  mkdir: mockMkdir,
  access: mockAccess,
}));

vi.mock("node:fs", () => ({
  default: {
    statSync: vi.fn(),
  },
}));

vi.mock("./ParcelFileWatcher", () => {
  // Define mock class inside the factory function
  return {
    ParcelFileWatcher: class MockParcelFileWatcher {
      watch = mockWatcherMethods.watch;
      unwatch = mockWatcherMethods.unwatch;
      dispose = mockWatcherMethods.dispose;
      isWatching = mockWatcherMethods.isWatching;

      onCreated(cb: (event: { path: string; isDirectory: boolean }) => void) {
        watcherCallbacks.onCreated = cb;
        return { dispose: vi.fn() };
      }

      onModified(cb: (event: { path: string }) => void) {
        watcherCallbacks.onModified = cb;
        return { dispose: vi.fn() };
      }

      onDeleted(cb: (event: { path: string; isDirectory: boolean }) => void) {
        watcherCallbacks.onDeleted = cb;
        return { dispose: vi.fn() };
      }

      onRenamed(
        cb: (event: {
          oldPath: string;
          newPath: string;
          isDirectory: boolean;
        }) => void,
      ) {
        watcherCallbacks.onRenamed = cb;
        return { dispose: vi.fn() };
      }
    },
  };
});

vi.mock("./DirectoryCache", () => ({
  DirectoryCache: {
    get: mockCacheGet,
    set: mockCacheSet,
    has: mockCacheHas,
    delete: mockCacheDelete,
    clear: vi.fn(),
    addEntry: vi.fn(),
    removeEntry: vi.fn(),
  },
}));

// ============================================================================
// Imports (after mocks)
// ============================================================================

import { DiskFileSystemProvider } from "./DiskFileSystemProvider";

// ============================================================================
// Test Helpers
// ============================================================================

function createMockStats(overrides: Partial<Stats> = {}): Stats {
  return {
    isDirectory: () => false,
    isFile: () => true,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    size: 1024,
    mtimeMs: 1700000000000,
    ctimeMs: 1699000000000,
    mode: 0o644,
    ...overrides,
  } as Stats;
}

function createMockDirent(name: string, isDir: boolean): Dirent {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
  } as Dirent;
}

// ============================================================================
// Tests
// ============================================================================

describe("DiskFileSystemProvider", () => {
  let provider: DiskFileSystemProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Reset callback captures
    watcherCallbacks.onCreated = null;
    watcherCallbacks.onModified = null;
    watcherCallbacks.onDeleted = null;
    watcherCallbacks.onRenamed = null;

    // Reset cache mock defaults
    mockCacheGet.mockReturnValue(undefined);
    mockCacheHas.mockReturnValue(false);

    // Reset watcher mock
    mockWatcherMethods.isWatching.mockReturnValue(false);

    provider = new DiskFileSystemProvider("/test/project");
  });

  afterEach(async () => {
    if (provider) {
      await provider.dispose();
    }
    vi.useRealTimers();
  });

  // ===========================================================================
  // Constructor
  // ===========================================================================

  describe("constructor", () => {
    it("should resolve the working directory path", () => {
      expect(provider.cwd).toBe("/test/project");
    });

    it("should create a ParcelFileWatcher for the directory", () => {
      // The watcher is created in constructor
      // We verify this by checking that callbacks were registered
      expect(watcherCallbacks.onCreated).not.toBeNull();
    });

    it("should setup watcher event handlers", () => {
      // Verify callbacks were registered during construction
      expect(watcherCallbacks.onCreated).not.toBeNull();
      expect(watcherCallbacks.onModified).not.toBeNull();
      expect(watcherCallbacks.onDeleted).not.toBeNull();
      expect(watcherCallbacks.onRenamed).not.toBeNull();
    });
  });

  // ===========================================================================
  // stat()
  // ===========================================================================

  describe("stat()", () => {
    it("should return file stats for a file", async () => {
      mockStat.mockResolvedValue(createMockStats({ isDirectory: () => false }));

      const result = await provider.stat("/test/project/file.ts");

      expect(result).toEqual({
        type: "file",
        size: 1024,
        mtime: 1700000000000,
        ctime: 1699000000000,
        readonly: false,
      });
    });

    it("should return directory stats for a directory", async () => {
      mockStat.mockResolvedValue(
        createMockStats({
          isDirectory: () => true,
          size: 4096,
        }),
      );

      const result = await provider.stat("/test/project/src");

      expect(result).toEqual({
        type: "directory",
        size: 4096,
        mtime: 1700000000000,
        ctime: 1699000000000,
        readonly: false,
      });
    });

    it("should detect readonly files", async () => {
      mockStat.mockResolvedValue(
        createMockStats({
          mode: 0o444, // Read-only
        }),
      );

      const result = await provider.stat("/test/project/readonly.ts");

      expect(result.readonly).toBe(true);
    });

    it("should throw on non-existent paths", async () => {
      mockStat.mockRejectedValue(
        new Error("ENOENT: no such file or directory"),
      );

      await expect(provider.stat("/test/project/missing.ts")).rejects.toThrow(
        "ENOENT",
      );
    });
  });

  // ===========================================================================
  // readDirectory()
  // ===========================================================================

  describe("readDirectory()", () => {
    it("should return sorted entries (directories first, then files)", async () => {
      mockReaddir.mockResolvedValue([
        createMockDirent("zebra.ts", false),
        createMockDirent("src", true),
        createMockDirent("alpha.ts", false),
        createMockDirent("lib", true),
      ]);

      const entries = await provider.readDirectory("/test/project");

      expect(entries).toEqual([
        dirEntry("lib"),
        dirEntry("src"),
        fileEntry("alpha.ts"),
        fileEntry("zebra.ts"),
      ]);
    });

    it("should return cached entries on cache hit", async () => {
      const cachedEntries = [{ name: "cached.ts", type: "file" as const }];

      mockCacheGet.mockReturnValue({
        entries: cachedEntries,
        version: 1,
        timestamp: Date.now(),
      });

      // Set up fresh entries for background verification
      mockReaddir.mockResolvedValue([createMockDirent("cached.ts", false)]);

      const entries = await provider.readDirectory("/test/project");

      // Should return cached entries immediately
      expect(entries).toEqual(cachedEntries);

      // Background verification will call readdir, but that's expected behavior
      // The important thing is that we returned the cached entries synchronously
      await vi.advanceTimersByTimeAsync(100);
    });

    it("should cache results on cache miss", async () => {
      mockReaddir.mockResolvedValue([createMockDirent("file.ts", false)]);

      await provider.readDirectory("/test/project");

      expect(mockCacheSet).toHaveBeenCalledWith("/test/project", [
        fileEntry("file.ts"),
      ]);
    });

    it("should sort case-insensitively", async () => {
      mockReaddir.mockResolvedValue([
        createMockDirent("Zebra.ts", false),
        createMockDirent("alpha.ts", false),
        createMockDirent("Beta.ts", false),
      ]);

      const entries = await provider.readDirectory("/test/project");

      expect(entries.map((e) => e.name)).toEqual([
        "alpha.ts",
        "Beta.ts",
        "Zebra.ts",
      ]);
    });
  });

  // ===========================================================================
  // readFile()
  // ===========================================================================

  describe("readFile()", () => {
    it("should return file contents as Uint8Array", async () => {
      const content = Buffer.from("const x = 1;");
      mockReadFile.mockResolvedValue(content);

      const result = await provider.readFile("/test/project/file.ts");

      expect(result).toBeInstanceOf(Uint8Array);
      expect(Buffer.from(result).toString()).toBe("const x = 1;");
    });

    it("should handle binary files", async () => {
      const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xff]);
      mockReadFile.mockResolvedValue(binaryContent);

      const result = await provider.readFile("/test/project/image.png");

      expect(result).toEqual(new Uint8Array([0x00, 0x01, 0x02, 0xff]));
    });

    it("should throw on non-existent files", async () => {
      mockReadFile.mockRejectedValue(new Error("ENOENT"));

      await expect(
        provider.readFile("/test/project/missing.ts"),
      ).rejects.toThrow("ENOENT");
    });
  });

  // ===========================================================================
  // writeFile()
  // ===========================================================================

  describe("writeFile()", () => {
    it("should write content to file", async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const content = new Uint8Array(Buffer.from("new content"));
      await provider.writeFile("/test/project/file.ts", content);

      expect(mockWriteFile).toHaveBeenCalledWith(
        "/test/project/file.ts",
        content,
      );
    });

    it("should create parent directories if they don't exist", async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);

      const content = new Uint8Array(Buffer.from("content"));
      await provider.writeFile("/test/project/deep/nested/file.ts", content);

      expect(mockMkdir).toHaveBeenCalledWith("/test/project/deep/nested", {
        recursive: true,
      });
    });
  });

  // ===========================================================================
  // delete()
  // ===========================================================================

  describe("delete()", () => {
    it("should delete a file", async () => {
      mockRm.mockResolvedValue(undefined);

      await provider.delete("/test/project/file.ts");

      expect(mockRm).toHaveBeenCalledWith("/test/project/file.ts", {
        recursive: false,
        force: false,
      });
    });

    it("should delete a directory recursively when option is set", async () => {
      mockRm.mockResolvedValue(undefined);

      await provider.delete("/test/project/src", { recursive: true });

      expect(mockRm).toHaveBeenCalledWith("/test/project/src", {
        recursive: true,
        force: false,
      });
    });

    it("should throw when deleting non-empty directory without recursive", async () => {
      mockRm.mockRejectedValue(new Error("ENOTEMPTY"));

      await expect(provider.delete("/test/project/src")).rejects.toThrow(
        "ENOTEMPTY",
      );
    });
  });

  // ===========================================================================
  // rename()
  // ===========================================================================

  describe("rename()", () => {
    it("should rename a file", async () => {
      mockLstat.mockResolvedValue(
        createMockStats({ isDirectory: () => false }),
      );
      mockMkdir.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);

      await provider.rename("/test/project/old.ts", "/test/project/new.ts");

      expect(mockRename).toHaveBeenCalledWith(
        "/test/project/old.ts",
        "/test/project/new.ts",
      );
    });

    it("should create parent directory of new path if needed", async () => {
      mockLstat.mockResolvedValue(
        createMockStats({ isDirectory: () => false }),
      );
      mockMkdir.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);

      await provider.rename(
        "/test/project/file.ts",
        "/test/project/new/dir/file.ts",
      );

      expect(mockMkdir).toHaveBeenCalledWith("/test/project/new/dir", {
        recursive: true,
      });
    });

    it("should throw on non-existent source", async () => {
      mockMkdir.mockResolvedValue(undefined);
      mockRename.mockRejectedValue(new Error("ENOENT"));

      await expect(
        provider.rename("/test/project/missing.ts", "/test/project/new.ts"),
      ).rejects.toThrow("ENOENT");
    });
  });

  // ===========================================================================
  // createDirectory()
  // ===========================================================================

  describe("createDirectory()", () => {
    it("should create a directory", async () => {
      mockMkdir.mockResolvedValue(undefined);

      await provider.createDirectory("/test/project/newdir");

      expect(mockMkdir).toHaveBeenCalledWith("/test/project/newdir", {
        recursive: true,
      });
    });

    it("should create nested directories", async () => {
      mockMkdir.mockResolvedValue(undefined);

      await provider.createDirectory("/test/project/deep/nested/dir");

      expect(mockMkdir).toHaveBeenCalledWith("/test/project/deep/nested/dir", {
        recursive: true,
      });
    });
  });

  // ===========================================================================
  // exists()
  // ===========================================================================

  describe("exists()", () => {
    it("should return true for existing files", async () => {
      mockAccess.mockResolvedValue(undefined);

      const result = await provider.exists("/test/project/file.ts");

      expect(result).toBe(true);
    });

    it("should return false for non-existent files", async () => {
      mockAccess.mockRejectedValue(new Error("ENOENT"));

      const result = await provider.exists("/test/project/missing.ts");

      expect(result).toBe(false);
    });
  });

  // ===========================================================================
  // Watching
  // ===========================================================================

  describe("watching", () => {
    it("should start watching via startWatching()", async () => {
      await provider.startWatching();

      expect(mockWatcherMethods.watch).toHaveBeenCalled();
    });

    it("should report watching status", () => {
      mockWatcherMethods.isWatching.mockReturnValue(true);

      expect(provider.isWatching()).toBe(true);
    });

    it("should not start watching after dispose", async () => {
      await provider.dispose();
      mockWatcherMethods.watch.mockClear();

      await provider.startWatching();

      expect(mockWatcherMethods.watch).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Events
  // ===========================================================================

  describe("events", () => {
    it("should expose onDirectoryListingChanged event", () => {
      const listener = vi.fn();
      const subscription = provider.onDirectoryListingChanged(listener);

      expect(subscription).toHaveProperty("dispose");
    });

    it("should expose onFileContentChanged event", () => {
      const listener = vi.fn();
      const subscription = provider.onFileContentChanged(listener);

      expect(subscription).toHaveProperty("dispose");
    });

    it("should expose onFileRenamed event", () => {
      const listener = vi.fn();
      const subscription = provider.onFileRenamed(listener);

      expect(subscription).toHaveProperty("dispose");
    });

    it("should expose onFileDeleted event", () => {
      const listener = vi.fn();
      const subscription = provider.onFileDeleted(listener);

      expect(subscription).toHaveProperty("dispose");
    });
  });

  // ===========================================================================
  // dispose()
  // ===========================================================================

  describe("dispose()", () => {
    it("should stop the watcher", async () => {
      await provider.dispose();

      expect(mockWatcherMethods.dispose).toHaveBeenCalled();
    });

    it("should be safe to call multiple times", async () => {
      await provider.dispose();
      await provider.dispose();
      await provider.dispose();

      // Should only dispose watcher once
      expect(mockWatcherMethods.dispose).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // Watcher Event Handling
  // ===========================================================================

  describe("watcher event handling", () => {
    it("should schedule directory refresh on file created", async () => {
      mockReaddir.mockResolvedValue([createMockDirent("new.ts", false)]);
      mockAccess.mockResolvedValue(undefined);

      const listener = vi.fn();
      provider.onDirectoryListingChanged(listener);

      // Simulate file created event from watcher
      watcherCallbacks.onCreated!({
        path: "/test/project/new.ts",
        isDirectory: false,
      });

      // Not called immediately (debounced)
      expect(listener).not.toHaveBeenCalled();

      // Advance past debounce delay (50ms)
      await vi.advanceTimersByTimeAsync(100);

      expect(listener).toHaveBeenCalledWith({
        path: "/test/project",
        entries: [fileEntry("new.ts")],
      });
    });

    it("should forward file modified events", () => {
      const listener = vi.fn();
      provider.onFileContentChanged(listener);

      watcherCallbacks.onModified!({ path: "/test/project/file.ts" });

      expect(listener).toHaveBeenCalledWith({ path: "/test/project/file.ts" });
    });

    it("should forward file deleted events and invalidate cache", () => {
      const listener = vi.fn();
      provider.onFileDeleted(listener);

      watcherCallbacks.onDeleted!({
        path: "/test/project/deleted.ts",
        isDirectory: false,
      });

      expect(listener).toHaveBeenCalledWith({
        path: "/test/project/deleted.ts",
        isDirectory: false,
      });
      expect(mockCacheDelete).toHaveBeenCalledWith("/test/project/deleted.ts");
    });

    it("should forward rename events and invalidate old directory cache", () => {
      const listener = vi.fn();
      provider.onFileRenamed(listener);

      watcherCallbacks.onRenamed!({
        oldPath: "/test/project/olddir",
        newPath: "/test/project/newdir",
        isDirectory: true,
      });

      expect(listener).toHaveBeenCalledWith({
        oldPath: "/test/project/olddir",
        newPath: "/test/project/newdir",
        isDirectory: true,
      });
      expect(mockCacheDelete).toHaveBeenCalledWith("/test/project/olddir");
    });

    it("should debounce multiple changes to same directory", async () => {
      mockReaddir.mockResolvedValue([createMockDirent("file.ts", false)]);
      mockAccess.mockResolvedValue(undefined);

      const listener = vi.fn();
      provider.onDirectoryListingChanged(listener);

      // Multiple rapid creates in same directory
      watcherCallbacks.onCreated!({
        path: "/test/project/a.ts",
        isDirectory: false,
      });
      await vi.advanceTimersByTimeAsync(25);
      watcherCallbacks.onCreated!({
        path: "/test/project/b.ts",
        isDirectory: false,
      });
      await vi.advanceTimersByTimeAsync(25);
      watcherCallbacks.onCreated!({
        path: "/test/project/c.ts",
        isDirectory: false,
      });

      // Advance past debounce
      await vi.advanceTimersByTimeAsync(100);

      // Should only emit once (due to debouncing)
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should fire onFileContentChanged when a file is created", async () => {
      mockReaddir.mockResolvedValue([createMockDirent("new.ts", false)]);
      mockAccess.mockResolvedValue(undefined);

      const contentListener = vi.fn();
      provider.onFileContentChanged(contentListener);

      // Simulate file created event from watcher (file, not directory)
      watcherCallbacks.onCreated!({
        path: "/test/project/new.ts",
        isDirectory: false,
      });

      // Should be called immediately (not debounced like directory refresh)
      expect(contentListener).toHaveBeenCalledWith({
        path: "/test/project/new.ts",
      });
    });

    it("should NOT fire onFileContentChanged when a directory is created", async () => {
      mockReaddir.mockResolvedValue([createMockDirent("newdir", true)]);
      mockAccess.mockResolvedValue(undefined);

      const contentListener = vi.fn();
      provider.onFileContentChanged(contentListener);

      // Simulate directory created event from watcher
      watcherCallbacks.onCreated!({
        path: "/test/project/newdir",
        isDirectory: true,
      });

      // Should NOT be called for directories
      expect(contentListener).not.toHaveBeenCalled();
    });

    it("should fire onFileContentChanged when a file is deleted", () => {
      const contentListener = vi.fn();
      provider.onFileContentChanged(contentListener);

      // Simulate file deleted event from watcher
      watcherCallbacks.onDeleted!({
        path: "/test/project/deleted.ts",
        isDirectory: false,
      });

      // Should be called for deleted file
      expect(contentListener).toHaveBeenCalledWith({
        path: "/test/project/deleted.ts",
      });
    });

    it("should fire onFileContentChanged when a directory is deleted", () => {
      const contentListener = vi.fn();
      provider.onFileContentChanged(contentListener);

      // Simulate directory deleted event from watcher
      watcherCallbacks.onDeleted!({
        path: "/test/project/deleteddir",
        isDirectory: true,
      });

      // Should be called for directories too (triggers git status refresh)
      expect(contentListener).toHaveBeenCalledWith({
        path: "/test/project/deleteddir",
      });
    });

    it("should fire onFileContentChanged when a file is renamed", () => {
      const contentListener = vi.fn();
      provider.onFileContentChanged(contentListener);

      // Simulate file renamed event from watcher
      watcherCallbacks.onRenamed!({
        oldPath: "/test/project/old.ts",
        newPath: "/test/project/new.ts",
        isDirectory: false,
      });

      // Should be called with the new path
      expect(contentListener).toHaveBeenCalledWith({
        path: "/test/project/new.ts",
      });
    });

    it("should fire onFileContentChanged when a directory is renamed", () => {
      const contentListener = vi.fn();
      provider.onFileContentChanged(contentListener);

      // Simulate directory renamed event from watcher
      watcherCallbacks.onRenamed!({
        oldPath: "/test/project/olddir",
        newPath: "/test/project/newdir",
        isDirectory: true,
      });

      // Should be called for directories too (triggers git status refresh)
      expect(contentListener).toHaveBeenCalledWith({
        path: "/test/project/newdir",
      });
    });
  });

  // ===========================================================================
  // Cache Verification
  // ===========================================================================

  describe("cache verification", () => {
    it("should verify cache in background on cache hit", async () => {
      const cachedEntries = [{ name: "old.ts", type: "file" as const }];
      const freshEntries = [
        createMockDirent("old.ts", false),
        createMockDirent("new.ts", false),
      ];

      mockCacheGet.mockReturnValue({
        entries: cachedEntries,
        version: 1,
        timestamp: Date.now(),
      });

      mockReaddir.mockResolvedValue(freshEntries);

      const listener = vi.fn();
      provider.onDirectoryListingChanged(listener);

      // First read returns cached
      const entries = await provider.readDirectory("/test/project");
      expect(entries).toEqual(cachedEntries);

      // Wait for background verification
      await vi.advanceTimersByTimeAsync(100);

      // Cache was stale, so cache should be updated and event fired
      expect(mockCacheSet).toHaveBeenCalled();
      expect(listener).toHaveBeenCalled();
    });

    it("should have cooldown on cache verification", async () => {
      const cachedEntries = [{ name: "file.ts", type: "file" as const }];

      mockCacheGet.mockReturnValue({
        entries: cachedEntries,
        version: 1,
        timestamp: Date.now(),
      });

      mockReaddir.mockResolvedValue([createMockDirent("file.ts", false)]);

      // Multiple rapid reads
      await provider.readDirectory("/test/project");
      await provider.readDirectory("/test/project");
      await provider.readDirectory("/test/project");

      // Wait for verification to complete
      await vi.advanceTimersByTimeAsync(100);

      // Only one verification should run (cooldown is 2000ms)
      expect(mockReaddir).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // Prefetching
  // ===========================================================================

  describe("prefetching", () => {
    it("should prefetch child directories after reading parent", async () => {
      mockReaddir
        .mockResolvedValueOnce([
          createMockDirent("src", true),
          createMockDirent("lib", true),
          createMockDirent("file.ts", false),
        ])
        .mockResolvedValue([createMockDirent("index.ts", false)]);

      await provider.readDirectory("/test/project");

      // Wait for prefetch to complete
      await vi.advanceTimersByTimeAsync(100);

      // Should have called readdir multiple times (parent + children)
      expect(mockReaddir).toHaveBeenCalledTimes(3); // parent + 2 children
    });

    it("should not prefetch already cached directories", async () => {
      mockReaddir.mockResolvedValue([createMockDirent("cached-dir", true)]);
      mockCacheHas.mockImplementation(
        (path) => path === "/test/project/cached-dir",
      );

      await provider.readDirectory("/test/project");

      // Wait for potential prefetch
      await vi.advanceTimersByTimeAsync(100);

      // readdir called only once (for parent, not for cached child)
      expect(mockReaddir).toHaveBeenCalledTimes(1);
    });

    it("should limit concurrent prefetch operations", async () => {
      // Create 15 directories (more than MAX_CONCURRENT_PREFETCH = 10)
      const manyDirs = Array.from({ length: 15 }, (_, i) =>
        createMockDirent(`dir${i}`, true),
      );

      mockReaddir.mockResolvedValue(manyDirs);

      await provider.readDirectory("/test/project");

      // Wait for prefetch to complete
      await vi.advanceTimersByTimeAsync(100);

      // Should have called readdir for parent + at most 10 children
      expect(mockReaddir.mock.calls.length).toBeLessThanOrEqual(11);
    });
  });

  // ===========================================================================
  // Hidden File Filtering
  // ===========================================================================

  describe("hidden file filtering", () => {
    it("should filter out .git directory", async () => {
      mockReaddir.mockResolvedValue([
        createMockDirent(".git", true),
        createMockDirent("src", true),
        createMockDirent("file.ts", false),
      ]);

      const entries = await provider.readDirectory("/test/project");

      // .git should be filtered out
      expect(entries).toEqual([dirEntry("src"), fileEntry("file.ts")]);
    });

    it("should filter out node_modules directory", async () => {
      mockReaddir.mockResolvedValue([
        createMockDirent("src", true),
        createMockDirent("node_modules", true),
        createMockDirent("file.ts", false),
      ]);

      const entries = await provider.readDirectory("/test/project");

      // node_modules should be filtered out
      expect(entries).toEqual([dirEntry("src"), fileEntry("file.ts")]);
    });
  });

  // Note: Gitignore filtering tests require complex child_process mocking
  // and are better tested through integration tests
});
