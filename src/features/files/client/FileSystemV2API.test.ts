import { beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const { files, listening, deliver } = vi.hoisted(() => {
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  const files = {
    readDirectory: vi.fn(),
    readFile: vi.fn(),
    readTextFile: vi.fn(),
    stat: vi.fn(),
    exists: vi.fn(),
    writeFile: vi.fn(),
    delete: vi.fn(),
    rename: vi.fn(),
    createDirectory: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    // Not a mock, so clearing mocks keeps the listeners the client adds once
    on(event: string, handler: (payload: unknown) => void) {
      const eventHandlers = handlers.get(event) ?? new Set();
      handlers.set(event, eventHandlers);
      eventHandlers.add(handler);
      return () => eventHandlers.delete(handler);
    },
  };

  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).window.conduit = { files };

  return {
    files,
    /** How many IPC listeners each event has */
    listening: () =>
      Object.fromEntries(
        [...handlers].map(([event, eventHandlers]) => [
          event,
          eventHandlers.size,
        ]),
      ),
    /** Send an event from the main process */
    deliver: (event: string, payload: object) => {
      for (const handler of handlers.get(event) ?? []) handler(payload);
    },
  };
});

// Import after mocks are set up
import { FileSystemV2API } from "./FileSystemV2API";

/** Lets subscriptions the mocks resolve land. */
const settle = () => new Promise((resolve) => setTimeout(resolve));

// ============================================================================
// Tests
// ============================================================================

describe("FileSystemV2API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).window.conduit = { files };
    files.subscribe.mockResolvedValue("test-sub-id");
    files.unsubscribe.mockResolvedValue(undefined);
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
      files.readDirectory.mockResolvedValue(entries);

      const api = new FileSystemV2API("/test/project");
      const result = await api.readDirectory("/test/project/src");

      expect(files.readDirectory).toHaveBeenCalledWith(
        "/test/project",
        "/test/project/src",
      );
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
      files.readFile.mockResolvedValue(content);

      const api = new FileSystemV2API("/test/project");
      const result = await api.readFile("/test/project/file.txt");

      expect(files.readFile).toHaveBeenCalledWith("/test/project/file.txt");
      expect(result).toEqual(content);

      api.release();
    });
  });

  describe("readTextFile", () => {
    it("should return text content directly", async () => {
      files.readTextFile.mockResolvedValue("Hello, World!");

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
      files.stat.mockResolvedValue(stats);

      const api = new FileSystemV2API("/test/project");
      const result = await api.stat("/test/project/file.txt");

      expect(result).toEqual(stats);

      api.release();
    });
  });

  describe("exists", () => {
    it("should return true for existing path", async () => {
      files.exists.mockResolvedValue(true);

      const api = new FileSystemV2API("/test/project");
      const result = await api.exists("/test/project/file.txt");

      expect(result).toBe(true);

      api.release();
    });

    it("should return false for non-existing path", async () => {
      files.exists.mockResolvedValue(false);

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
      files.writeFile.mockResolvedValue(undefined);
      const content = new Uint8Array([1, 2, 3]);

      const api = new FileSystemV2API("/test/project");
      await api.writeFile("/test/project/file.txt", content);

      expect(files.writeFile).toHaveBeenCalledWith(
        "/test/project",
        "/test/project/file.txt",
        content,
      );

      api.release();
    });
  });

  describe("writeTextFile", () => {
    it("should encode string as UTF-8", async () => {
      files.writeFile.mockResolvedValue(undefined);

      const api = new FileSystemV2API("/test/project");
      await api.writeTextFile("/test/project/file.txt", "Hello");

      expect(files.writeFile).toHaveBeenCalled();
      const [, , content] = files.writeFile.mock.calls[0];
      expect(new TextDecoder().decode(content)).toBe("Hello");

      api.release();
    });
  });

  describe("delete", () => {
    it("should call IPC with path", async () => {
      files.delete.mockResolvedValue(undefined);

      const api = new FileSystemV2API("/test/project");
      await api.delete("/test/project/file.txt");

      expect(files.delete).toHaveBeenCalledWith(
        "/test/project",
        "/test/project/file.txt",
        undefined,
      );

      api.release();
    });

    it("should pass recursive option", async () => {
      files.delete.mockResolvedValue(undefined);

      const api = new FileSystemV2API("/test/project");
      await api.delete("/test/project/folder", { recursive: true });

      expect(files.delete).toHaveBeenCalledWith(
        "/test/project",
        "/test/project/folder",
        {
          recursive: true,
        },
      );

      api.release();
    });
  });

  describe("rename", () => {
    it("should call IPC with old and new paths", async () => {
      files.rename.mockResolvedValue(undefined);

      const api = new FileSystemV2API("/test/project");
      await api.rename("/test/project/old.txt", "/test/project/new.txt");

      expect(files.rename).toHaveBeenCalledWith(
        "/test/project",
        "/test/project/old.txt",
        "/test/project/new.txt",
      );

      api.release();
    });
  });

  describe("createDirectory", () => {
    it("should call IPC with path", async () => {
      files.createDirectory.mockResolvedValue(undefined);

      const api = new FileSystemV2API("/test/project");
      await api.createDirectory("/test/project/new-folder");

      expect(files.createDirectory).toHaveBeenCalledWith(
        "/test/project",
        "/test/project/new-folder",
      );

      api.release();
    });
  });

  // ===========================================================================
  // Event Subscriptions
  // ===========================================================================

  describe("onDirectoryListingChanged", () => {
    it("calls back when its directory changes", async () => {
      const api = new FileSystemV2API("/test/project");
      const callback = vi.fn();
      api.onDirectoryListingChanged("/test/project/src", callback);
      await settle();

      deliver("directoryListingChanged", {
        subscriptionId: "test-sub-id",
        path: "/test/project/src",
        entries: [{ name: "file.txt", type: "file" }],
      });
      deliver("directoryListingChanged", {
        subscriptionId: "test-sub-id",
        path: "/test/project/other",
        entries: [],
      });

      expect(files.subscribe).toHaveBeenCalledWith("/test/project");
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith([
        { name: "file.txt", type: "file" },
      ]);

      api.release();
    });

    it("stops calling a callback after its cleanup, and keeps the path's other callbacks", async () => {
      const api = new FileSystemV2API("/test/project");
      const removed = vi.fn();
      const kept = vi.fn();
      const cleanup = api.onDirectoryListingChanged(
        "/test/project/src",
        removed,
      );
      api.onDirectoryListingChanged("/test/project/src", kept);
      await settle();

      cleanup();
      deliver("directoryListingChanged", {
        subscriptionId: "test-sub-id",
        path: "/test/project/src",
        entries: [],
      });

      expect(removed).not.toHaveBeenCalled();
      expect(kept).toHaveBeenCalledWith([]);

      api.release();
    });
  });

  describe("routing", () => {
    it("listens once per event however many folders are open, and hears only its own", async () => {
      let lastId = 0;
      files.subscribe.mockImplementation(async () => `sub-${++lastId}`);
      const callbacks = Array.from({ length: 20 }, () => ({
        content: vi.fn(),
        deleted: vi.fn(),
        renamed: vi.fn(),
      }));
      const apis = callbacks.map((callback, index) => {
        const api = new FileSystemV2API(`/project-${index}`);
        api.onAnyFileContentChanged(callback.content);
        api.onAnyFileDeleted(callback.deleted);
        api.onAnyFileRenamed(callback.renamed);
        return api;
      });
      await settle();

      deliver("fileContentChanged", { subscriptionId: "sub-3", path: "/a" });
      deliver("fileDeleted", { subscriptionId: "sub-3", path: "/b" });
      deliver("fileRenamed", {
        subscriptionId: "sub-3",
        oldPath: "/c",
        newPath: "/d",
      });

      expect(listening()).toEqual({
        directoryListingChanged: 1,
        fileContentChanged: 1,
        fileDeleted: 1,
        fileRenamed: 1,
      });
      expect(callbacks[2].content).toHaveBeenCalledWith("/a");
      expect(callbacks[2].deleted).toHaveBeenCalledWith("/b");
      expect(callbacks[2].renamed).toHaveBeenCalledWith("/c", "/d");
      for (const callback of callbacks.filter((_, index) => index !== 2)) {
        expect(callback.content).not.toHaveBeenCalled();
        expect(callback.deleted).not.toHaveBeenCalled();
        expect(callback.renamed).not.toHaveBeenCalled();
      }

      for (const api of apis) api.release();
      deliver("fileContentChanged", { subscriptionId: "sub-3", path: "/a" });
      expect(callbacks[2].content).toHaveBeenCalledTimes(1);
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

      await settle();

      api.release();

      expect(files.unsubscribe).toHaveBeenCalledWith("test-sub-id");
    });

    it("should be idempotent", async () => {
      const api = new FileSystemV2API("/test/project");

      await settle();

      api.release();
      api.release();
      api.release();

      // Should only call unsubscribe once
      expect(files.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("should prevent further operations", async () => {
      const api = new FileSystemV2API("/test/project");
      api.release();

      await expect(api.readDirectory("/test")).rejects.toThrow(
        "FileSystemV2API has been released",
      );
      await expect(api.readFile("/test")).rejects.toThrow(
        "FileSystemV2API has been released",
      );
      await expect(api.stat("/test")).rejects.toThrow(
        "FileSystemV2API has been released",
      );
      await expect(api.exists("/test")).rejects.toThrow(
        "FileSystemV2API has been released",
      );
      await expect(api.writeFile("/test", new Uint8Array())).rejects.toThrow(
        "FileSystemV2API has been released",
      );
      await expect(api.delete("/test")).rejects.toThrow(
        "FileSystemV2API has been released",
      );
      await expect(api.rename("/old", "/new")).rejects.toThrow(
        "FileSystemV2API has been released",
      );
      await expect(api.createDirectory("/test")).rejects.toThrow(
        "FileSystemV2API has been released",
      );
    });

    it("should unsubscribe if released while subscription is pending (race condition)", async () => {
      // Set up a delayed subscription that we can control
      let resolveSubscription: ((value: string) => void) | null = null;
      files.subscribe.mockImplementation(
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
      expect(files.unsubscribe).not.toHaveBeenCalled();

      // Now complete the subscription (simulates IPC finally returning)
      resolveSubscription!("late-subscription-id");

      await settle();

      // The fix should have detected that we're already released
      // and immediately unsubscribed
      expect(files.unsubscribe).toHaveBeenCalledWith("late-subscription-id");
    });
  });

  describe("suspend", () => {
    it("unsubscribes until it resumes, and keeps its listeners", async () => {
      const api = new FileSystemV2API("/test/project");
      const callback = vi.fn();
      api.onAnyFileContentChanged(callback);
      await settle();

      api.suspend();
      deliver("fileContentChanged", {
        subscriptionId: "test-sub-id",
        path: "/test/project/a.ts",
      });
      expect(files.unsubscribe).toHaveBeenCalledWith("test-sub-id");
      expect(() => api.onAnyFileContentChanged(vi.fn())).not.toThrow();
      expect(files.subscribe).toHaveBeenCalledTimes(1);
      expect(callback).not.toHaveBeenCalled();

      files.subscribe.mockResolvedValue("resumed-sub-id");
      api.resume();
      await settle();
      deliver("fileContentChanged", {
        subscriptionId: "resumed-sub-id",
        path: "/test/project/a.ts",
      });

      expect(files.subscribe).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledTimes(1);

      api.release();
    });

    it("unsubscribes a subscription that arrives after it suspends", async () => {
      let resolveSubscription: ((value: string) => void) | null = null;
      files.subscribe.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSubscription = resolve;
          }),
      );

      const api = new FileSystemV2API("/test/project");
      api.suspend();
      resolveSubscription!("late-subscription-id");
      await settle();

      expect(files.unsubscribe).toHaveBeenCalledWith("late-subscription-id");

      api.release();
    });
  });

  // ===========================================================================
  // Error Handling
  // ===========================================================================

  describe("error handling", () => {
    it("should propagate IPC errors", async () => {
      files.readFile.mockRejectedValue(new Error("File not found"));

      const api = new FileSystemV2API("/test/project");

      await expect(api.readFile("/test/missing")).rejects.toThrow(
        "File not found",
      );

      api.release();
    });

    it("should isolate listener errors", async () => {
      const api = new FileSystemV2API("/test/project");
      const consoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      const badCallback = vi.fn(() => {
        throw new Error("Listener error");
      });
      const goodCallback = vi.fn();
      api.onDirectoryListingChanged("/test/project/src", badCallback);
      api.onDirectoryListingChanged("/test/project/src", goodCallback);
      await settle();

      expect(() =>
        deliver("directoryListingChanged", {
          subscriptionId: "test-sub-id",
          path: "/test/project/src",
          entries: [],
        }),
      ).not.toThrow();

      expect(goodCallback).toHaveBeenCalled();

      consoleError.mockRestore();
      api.release();
    });
  });
});
