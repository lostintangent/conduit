import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

// Use vi.hoisted to define mocks before imports
const { mockFsv2 } = vi.hoisted(() => {
  const fsv2 = {
    readDirectory: vi.fn(),
    readFile: vi.fn(),
    stat: vi.fn(),
    exists: vi.fn(),
    writeFile: vi.fn(),
    delete: vi.fn(),
    rename: vi.fn(),
    createDirectory: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    onDirectoryListingChanged: vi.fn(() => vi.fn()),
    onFileContentChanged: vi.fn(() => vi.fn()),
    onFileDeleted: vi.fn(() => vi.fn()),
    onFileRenamed: vi.fn(() => vi.fn()),
  };

  // Set up window.conduit before any modules load
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).window.conduit = {
    fsv2,
  };

  return { mockFsv2: fsv2 };
});

// Import after mocks are set up
import { FileSystemV2API } from "../../../src/renderer/api/FileSystemV2API";

// ============================================================================
// Tests
// ============================================================================

describe("FileSystemV2API", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Ensure window.conduit is available
    (globalThis as any).window.conduit = { fsv2: mockFsv2 };

    // Reset mock implementations
    mockFsv2.subscribe.mockResolvedValue("test-sub-id");
    mockFsv2.unsubscribe.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Construction and Properties
  // ===========================================================================

  describe("construction", () => {
    it("should create instance with cwd", () => {
      const api = new FileSystemV2API("/test/project");
      expect(api.cwd).toBe("/test/project");
      api.release();
    });

    it("should not be released initially", () => {
      const api = new FileSystemV2API("/test/project");
      expect(api.isReleased).toBe(false);
      api.release();
    });
  });

  // ===========================================================================
  // Read Operations
  // ===========================================================================

  describe("readDirectory", () => {
    it("should call IPC with correct params", async () => {
      const entries = [
        { name: "file.txt", type: "file" as const },
        { name: "folder", type: "directory" as const },
      ];
      mockFsv2.readDirectory.mockResolvedValue(entries);

      const api = new FileSystemV2API("/test/project");
      const result = await api.readDirectory("/test/project/src");

      expect(mockFsv2.readDirectory).toHaveBeenCalledWith("/test/project/src");
      expect(result).toEqual(entries);

      api.release();
    });

    it("should throw if released", async () => {
      const api = new FileSystemV2API("/test/project");
      api.release();

      await expect(api.readDirectory("/test")).rejects.toThrow(
        "FileSystemV2API has been released",
      );
    });
  });

  describe("readFile", () => {
    it("should return binary data", async () => {
      const content = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      mockFsv2.readFile.mockResolvedValue(content);

      const api = new FileSystemV2API("/test/project");
      const result = await api.readFile("/test/project/file.txt");

      expect(mockFsv2.readFile).toHaveBeenCalledWith("/test/project/file.txt");
      expect(result).toEqual(content);

      api.release();
    });
  });

  describe("readTextFile", () => {
    it("should decode binary data as UTF-8", async () => {
      const content = new TextEncoder().encode("Hello, World!");
      mockFsv2.readFile.mockResolvedValue(content);

      const api = new FileSystemV2API("/test/project");
      const result = await api.readTextFile("/test/project/file.txt");

      expect(result).toBe("Hello, World!");

      api.release();
    });
  });

  describe("stat", () => {
    it("should return file stats", async () => {
      const stats = {
        type: "file" as const,
        size: 1024,
        mtime: Date.now(),
        ctime: Date.now(),
      };
      mockFsv2.stat.mockResolvedValue(stats);

      const api = new FileSystemV2API("/test/project");
      const result = await api.stat("/test/project/file.txt");

      expect(result).toEqual(stats);

      api.release();
    });
  });

  describe("exists", () => {
    it("should return true for existing path", async () => {
      mockFsv2.exists.mockResolvedValue(true);

      const api = new FileSystemV2API("/test/project");
      const result = await api.exists("/test/project/file.txt");

      expect(result).toBe(true);

      api.release();
    });

    it("should return false for non-existing path", async () => {
      mockFsv2.exists.mockResolvedValue(false);

      const api = new FileSystemV2API("/test/project");
      const result = await api.exists("/test/project/missing.txt");

      expect(result).toBe(false);

      api.release();
    });
  });

  // ===========================================================================
  // Write Operations
  // ===========================================================================

  describe("writeFile", () => {
    it("should call IPC with correct params", async () => {
      mockFsv2.writeFile.mockResolvedValue(undefined);
      const content = new Uint8Array([1, 2, 3]);

      const api = new FileSystemV2API("/test/project");
      await api.writeFile("/test/project/file.txt", content);

      expect(mockFsv2.writeFile).toHaveBeenCalledWith(
        "/test/project/file.txt",
        content,
      );

      api.release();
    });
  });

  describe("writeTextFile", () => {
    it("should encode string as UTF-8", async () => {
      mockFsv2.writeFile.mockResolvedValue(undefined);

      const api = new FileSystemV2API("/test/project");
      await api.writeTextFile("/test/project/file.txt", "Hello");

      expect(mockFsv2.writeFile).toHaveBeenCalled();
      const [, content] = mockFsv2.writeFile.mock.calls[0];
      expect(new TextDecoder().decode(content)).toBe("Hello");

      api.release();
    });
  });

  describe("delete", () => {
    it("should call IPC with path", async () => {
      mockFsv2.delete.mockResolvedValue(undefined);

      const api = new FileSystemV2API("/test/project");
      await api.delete("/test/project/file.txt");

      expect(mockFsv2.delete).toHaveBeenCalledWith(
        "/test/project/file.txt",
        undefined,
      );

      api.release();
    });

    it("should pass recursive option", async () => {
      mockFsv2.delete.mockResolvedValue(undefined);

      const api = new FileSystemV2API("/test/project");
      await api.delete("/test/project/folder", { recursive: true });

      expect(mockFsv2.delete).toHaveBeenCalledWith("/test/project/folder", {
        recursive: true,
      });

      api.release();
    });
  });

  describe("rename", () => {
    it("should call IPC with old and new paths", async () => {
      mockFsv2.rename.mockResolvedValue(undefined);

      const api = new FileSystemV2API("/test/project");
      await api.rename("/test/project/old.txt", "/test/project/new.txt");

      expect(mockFsv2.rename).toHaveBeenCalledWith(
        "/test/project/old.txt",
        "/test/project/new.txt",
      );

      api.release();
    });
  });

  describe("createDirectory", () => {
    it("should call IPC with path", async () => {
      mockFsv2.createDirectory.mockResolvedValue(undefined);

      const api = new FileSystemV2API("/test/project");
      await api.createDirectory("/test/project/new-folder");

      expect(mockFsv2.createDirectory).toHaveBeenCalledWith(
        "/test/project/new-folder",
      );

      api.release();
    });
  });

  // ===========================================================================
  // Event Subscriptions
  // ===========================================================================

  describe("onDirectoryListingChanged", () => {
    it("should subscribe to events", async () => {
      const api = new FileSystemV2API("/test/project");
      const callback = vi.fn();

      const cleanup = api.onDirectoryListingChanged(
        "/test/project/src",
        callback,
      );

      // Should trigger IPC subscription
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockFsv2.subscribe).toHaveBeenCalledWith("/test/project", "all");

      // Cleanup should work
      expect(typeof cleanup).toBe("function");
      cleanup();

      api.release();
    });

    it("should call callback when directory changes", async () => {
      // Capture the listener function
      let directoryListener: ((payload: unknown) => void) | null = null;
      mockFsv2.onDirectoryListingChanged.mockImplementation(
        (listener: (payload: unknown) => void) => {
          directoryListener = listener;
          return vi.fn();
        },
      );

      const api = new FileSystemV2API("/test/project");

      // Re-setup to capture listener
      const callback = vi.fn();
      api.onDirectoryListingChanged("/test/project/src", callback);

      // Wait for subscription
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate event from main process
      if (directoryListener) {
        directoryListener({
          subscriptionId: "test-sub-id",
          path: "/test/project/src",
          entries: [{ name: "file.txt", type: "file" }],
        });
      }

      expect(callback).toHaveBeenCalledWith([
        { name: "file.txt", type: "file" },
      ]);

      api.release();
    });

    it("should filter events by subscription ID", async () => {
      let directoryListener: ((payload: unknown) => void) | null = null;
      mockFsv2.onDirectoryListingChanged.mockImplementation(
        (listener: (payload: unknown) => void) => {
          directoryListener = listener;
          return vi.fn();
        },
      );

      const api = new FileSystemV2API("/test/project");
      const callback = vi.fn();
      api.onDirectoryListingChanged("/test/project/src", callback);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Event with different subscription ID should be ignored
      if (directoryListener) {
        directoryListener({
          subscriptionId: "different-sub-id",
          path: "/test/project/src",
          entries: [],
        });
      }

      expect(callback).not.toHaveBeenCalled();

      api.release();
    });
  });

  describe("onAnyDirectoryListingChanged", () => {
    it("should receive events for any path", async () => {
      let directoryListener: ((payload: unknown) => void) | null = null;
      mockFsv2.onDirectoryListingChanged.mockImplementation(
        (listener: (payload: unknown) => void) => {
          directoryListener = listener;
          return vi.fn();
        },
      );

      const api = new FileSystemV2API("/test/project");
      const callback = vi.fn();
      api.onAnyDirectoryListingChanged(callback);

      await new Promise((resolve) => setTimeout(resolve, 10));

      if (directoryListener) {
        directoryListener({
          subscriptionId: "test-sub-id",
          path: "/test/project/any/path",
          entries: [{ name: "test.txt", type: "file" }],
        });
      }

      expect(callback).toHaveBeenCalledWith("/test/project/any/path", [
        { name: "test.txt", type: "file" },
      ]);

      api.release();
    });
  });

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  describe("release", () => {
    it("should mark instance as released", () => {
      const api = new FileSystemV2API("/test/project");
      expect(api.isReleased).toBe(false);

      api.release();

      expect(api.isReleased).toBe(true);
    });

    it("should unsubscribe from main process", async () => {
      const api = new FileSystemV2API("/test/project");

      // Trigger subscription
      api.onDirectoryListingChanged("/test", vi.fn());
      await new Promise((resolve) => setTimeout(resolve, 10));

      api.release();

      // Wait for async cleanup
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockFsv2.unsubscribe).toHaveBeenCalledWith("test-sub-id");
    });

    it("should be idempotent", async () => {
      const api = new FileSystemV2API("/test/project");

      // Trigger subscription
      api.onDirectoryListingChanged("/test", vi.fn());
      await new Promise((resolve) => setTimeout(resolve, 10));

      api.release();
      api.release();
      api.release();

      // Wait for async cleanup
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should only call unsubscribe once
      expect(mockFsv2.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("should prevent further operations", async () => {
      const api = new FileSystemV2API("/test/project");
      api.release();

      await expect(api.readDirectory("/test")).rejects.toThrow();
      await expect(api.readFile("/test")).rejects.toThrow();
      await expect(api.stat("/test")).rejects.toThrow();
      await expect(api.exists("/test")).rejects.toThrow();
      await expect(api.writeFile("/test", new Uint8Array())).rejects.toThrow();
      await expect(api.delete("/test")).rejects.toThrow();
      await expect(api.rename("/old", "/new")).rejects.toThrow();
      await expect(api.createDirectory("/test")).rejects.toThrow();
    });

    it("should unsubscribe if released while subscription is pending (race condition)", async () => {
      // Set up a delayed subscription that we can control
      let resolveSubscription: ((value: string) => void) | null = null;
      mockFsv2.subscribe.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSubscription = resolve;
          }),
      );

      const api = new FileSystemV2API("/test/project");

      // Release BEFORE the subscription completes - this is the race condition
      api.release();

      expect(api.isReleased).toBe(true);
      // At this point, subscriptionId is still null because promise hasn't resolved
      expect(mockFsv2.unsubscribe).not.toHaveBeenCalled();

      // Now complete the subscription (simulates IPC finally returning)
      resolveSubscription!("late-subscription-id");

      // Wait for the promise chain to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // The fix should have detected that we're already released
      // and immediately unsubscribed
      expect(mockFsv2.unsubscribe).toHaveBeenCalledWith("late-subscription-id");
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe("error handling", () => {
    it("should propagate IPC errors", async () => {
      mockFsv2.readFile.mockRejectedValue(new Error("File not found"));

      const api = new FileSystemV2API("/test/project");

      await expect(api.readFile("/test/missing")).rejects.toThrow(
        "File not found",
      );

      api.release();
    });

    it("should isolate listener errors", async () => {
      let directoryListener: ((payload: unknown) => void) | null = null;
      mockFsv2.onDirectoryListingChanged.mockImplementation(
        (listener: (payload: unknown) => void) => {
          directoryListener = listener;
          return vi.fn();
        },
      );

      const api = new FileSystemV2API("/test/project");

      const badCallback = vi.fn(() => {
        throw new Error("Listener error");
      });
      const goodCallback = vi.fn();

      api.onDirectoryListingChanged("/test/project/src", badCallback);
      api.onDirectoryListingChanged("/test/project/src", goodCallback);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should not throw when listener errors
      if (directoryListener) {
        expect(() => {
          directoryListener!({
            subscriptionId: "test-sub-id",
            path: "/test/project/src",
            entries: [],
          });
        }).not.toThrow();
      }

      // Good callback should still be called
      expect(goodCallback).toHaveBeenCalled();

      api.release();
    });
  });
});
