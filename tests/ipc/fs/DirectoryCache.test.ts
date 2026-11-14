import { describe, it, expect, beforeEach, vi } from "vitest";

/** Helper to create file entries for testing */
const fileEntry = (name: string) => ({
  name,
  type: "file" as const,
  isSymlink: false,
});

const dirEntry = (name: string) => ({
  name,
  type: "directory" as const,
  isSymlink: false,
});

/**
 * We need to reset the module between tests since DirectoryCache is a singleton.
 * Using dynamic import and vi.resetModules() to get a fresh instance each time.
 */
async function getCleanCache() {
  vi.resetModules();
  const module = await import("../../../src/ipc/fs/DirectoryCache");
  return module.DirectoryCache;
}

describe("DirectoryCache", () => {
  describe("get() and set()", () => {
    it("should store and retrieve directory entries", async () => {
      const cache = await getCleanCache();

      const entries = [fileEntry("file1.ts"), dirEntry("src")];

      cache.set("/project", entries);
      const result = cache.get("/project");

      expect(result).toBeDefined();
      expect(result?.entries).toEqual(entries);
    });

    it("should return undefined for non-existent paths", async () => {
      const cache = await getCleanCache();

      const result = cache.get("/nonexistent");

      expect(result).toBeUndefined();
    });

    it("should include version and timestamp in cache entry", async () => {
      const cache = await getCleanCache();

      const entries = [fileEntry("file.ts")];
      const beforeSet = Date.now();

      cache.set("/project", entries);

      const result = cache.get("/project");
      expect(result?.version).toBe(1);
      expect(result?.timestamp).toBeGreaterThanOrEqual(beforeSet);
      expect(result?.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it("should increment version on each set", async () => {
      const cache = await getCleanCache();

      cache.set("/project", [fileEntry("v1")]);
      expect(cache.get("/project")?.version).toBe(1);

      cache.set("/project", [fileEntry("v2")]);
      expect(cache.get("/project")?.version).toBe(2);

      cache.set("/project", [fileEntry("v3")]);
      expect(cache.get("/project")?.version).toBe(3);
    });

    it("should update entries on set", async () => {
      const cache = await getCleanCache();

      cache.set("/project", [fileEntry("old.ts")]);
      cache.set("/project", [fileEntry("new.ts")]);

      const result = cache.get("/project");
      expect(result?.entries).toEqual([fileEntry("new.ts")]);
    });
  });

  describe("has()", () => {
    it("should return true for cached paths", async () => {
      const cache = await getCleanCache();

      cache.set("/project", []);

      expect(cache.has("/project")).toBe(true);
    });

    it("should return false for non-cached paths", async () => {
      const cache = await getCleanCache();

      expect(cache.has("/nonexistent")).toBe(false);
    });

    it("should return false after delete", async () => {
      const cache = await getCleanCache();

      cache.set("/project", []);
      cache.delete("/project");

      expect(cache.has("/project")).toBe(false);
    });
  });

  describe("getVersion()", () => {
    it("should return 0 for non-cached paths", async () => {
      const cache = await getCleanCache();

      expect(cache.getVersion("/nonexistent")).toBe(0);
    });

    it("should return current version for cached paths", async () => {
      const cache = await getCleanCache();

      cache.set("/project", []);
      expect(cache.getVersion("/project")).toBe(1);

      cache.set("/project", []);
      expect(cache.getVersion("/project")).toBe(2);
    });

    it("should increment version on invalidate", async () => {
      const cache = await getCleanCache();

      cache.set("/project", []);
      expect(cache.getVersion("/project")).toBe(1);

      cache.invalidate("/project");
      expect(cache.getVersion("/project")).toBe(2);

      cache.invalidate("/project");
      expect(cache.getVersion("/project")).toBe(3);
    });
  });

  describe("invalidate()", () => {
    it("should increment version without removing entry", async () => {
      const cache = await getCleanCache();

      const entries = [fileEntry("file.ts")];
      cache.set("/project", entries);

      cache.invalidate("/project");

      const result = cache.get("/project");
      expect(result).toBeDefined();
      expect(result?.entries).toEqual(entries); // Entries preserved
      expect(result?.version).toBe(2); // Version incremented
    });

    it("should update timestamp on invalidate", async () => {
      const cache = await getCleanCache();

      const now = vi.spyOn(Date, "now").mockReturnValue(1000);

      cache.set("/project", []);
      expect(cache.get("/project")?.timestamp).toBe(1000);

      now.mockReturnValue(2000);
      cache.invalidate("/project");
      expect(cache.get("/project")?.timestamp).toBe(2000);

      now.mockRestore();
    });

    it("should do nothing for non-existent paths", async () => {
      const cache = await getCleanCache();

      // Should not throw
      expect(() => cache.invalidate("/nonexistent")).not.toThrow();
      expect(cache.has("/nonexistent")).toBe(false);
    });
  });

  describe("delete()", () => {
    it("should remove entry from cache", async () => {
      const cache = await getCleanCache();

      cache.set("/project", []);
      expect(cache.has("/project")).toBe(true);

      cache.delete("/project");
      expect(cache.has("/project")).toBe(false);
      expect(cache.get("/project")).toBeUndefined();
    });

    it("should do nothing for non-existent paths", async () => {
      const cache = await getCleanCache();

      // Should not throw
      expect(() => cache.delete("/nonexistent")).not.toThrow();
    });

    it("should remove from LRU tracking", async () => {
      const cache = await getCleanCache();
      cache.setMaxSize(2);

      cache.set("/a", []);
      cache.set("/b", []);
      cache.delete("/a");
      cache.set("/c", []); // Should not evict /b

      expect(cache.has("/b")).toBe(true);
      expect(cache.has("/c")).toBe(true);
      expect(cache.size).toBe(2);
    });
  });

  describe("clear()", () => {
    it("should remove all entries", async () => {
      const cache = await getCleanCache();

      cache.set("/a", []);
      cache.set("/b", []);
      cache.set("/c", []);

      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.has("/a")).toBe(false);
      expect(cache.has("/b")).toBe(false);
      expect(cache.has("/c")).toBe(false);
    });

    it("should be safe to call on empty cache", async () => {
      const cache = await getCleanCache();

      expect(() => cache.clear()).not.toThrow();
      expect(cache.size).toBe(0);
    });
  });

  describe("LRU eviction", () => {
    it("should evict least recently used entry when at capacity", async () => {
      const cache = await getCleanCache();
      cache.setMaxSize(3);

      cache.set("/a", [fileEntry("a")]);
      cache.set("/b", [fileEntry("b")]);
      cache.set("/c", [fileEntry("c")]);

      // Cache is full, adding /d should evict /a (oldest)
      cache.set("/d", [fileEntry("d")]);

      expect(cache.has("/a")).toBe(false); // Evicted
      expect(cache.has("/b")).toBe(true);
      expect(cache.has("/c")).toBe(true);
      expect(cache.has("/d")).toBe(true);
      expect(cache.size).toBe(3);
    });

    it("should update LRU order on get", async () => {
      const cache = await getCleanCache();
      cache.setMaxSize(3);

      cache.set("/a", []);
      cache.set("/b", []);
      cache.set("/c", []);

      // Access /a, making it most recently used
      cache.get("/a");

      // Adding /d should now evict /b (oldest after /a was accessed)
      cache.set("/d", []);

      expect(cache.has("/a")).toBe(true); // Kept (was accessed)
      expect(cache.has("/b")).toBe(false); // Evicted
      expect(cache.has("/c")).toBe(true);
      expect(cache.has("/d")).toBe(true);
    });

    it("should update LRU order on set (existing entry)", async () => {
      const cache = await getCleanCache();
      cache.setMaxSize(3);

      cache.set("/a", []);
      cache.set("/b", []);
      cache.set("/c", []);

      // Update /a, making it most recently used
      cache.set("/a", [fileEntry("updated")]);

      // Adding /d should now evict /b (oldest after /a was updated)
      cache.set("/d", []);

      expect(cache.has("/a")).toBe(true); // Kept (was updated)
      expect(cache.has("/b")).toBe(false); // Evicted
      expect(cache.has("/c")).toBe(true);
      expect(cache.has("/d")).toBe(true);
    });

    it("should handle setMaxSize reducing cache size", async () => {
      const cache = await getCleanCache();

      cache.set("/a", []);
      cache.set("/b", []);
      cache.set("/c", []);
      cache.set("/d", []);
      cache.set("/e", []);

      expect(cache.size).toBe(5);

      // Reduce max size - should evict oldest entries
      cache.setMaxSize(2);

      expect(cache.size).toBe(2);
      // /d and /e should remain (most recent)
      expect(cache.has("/d")).toBe(true);
      expect(cache.has("/e")).toBe(true);
    });
  });

  describe("path normalization", () => {
    it("should treat paths with and without trailing slash as same", async () => {
      const cache = await getCleanCache();

      cache.set("/project/src/", [fileEntry("file.ts")]);

      expect(cache.has("/project/src")).toBe(true);
      expect(cache.has("/project/src/")).toBe(true);
      expect(cache.get("/project/src")?.entries).toEqual([
        fileEntry("file.ts"),
      ]);
    });

    it("should preserve root path as /", async () => {
      const cache = await getCleanCache();

      cache.set("/", [dirEntry("root")]);

      expect(cache.has("/")).toBe(true);
      expect(cache.get("/")?.entries).toEqual([dirEntry("root")]);
    });

    it("should normalize paths for all operations", async () => {
      const cache = await getCleanCache();

      // Set with trailing slash
      cache.set("/project/", []);

      // All operations should work with both formats
      expect(cache.has("/project")).toBe(true);
      expect(cache.has("/project/")).toBe(true);
      expect(cache.getVersion("/project")).toBe(1);
      expect(cache.getVersion("/project/")).toBe(1);

      cache.invalidate("/project/");
      expect(cache.getVersion("/project")).toBe(2);

      cache.delete("/project");
      expect(cache.has("/project/")).toBe(false);
    });
  });

  describe("subscribe()", () => {
    it("should notify listener on set", async () => {
      const cache = await getCleanCache();
      const listener = vi.fn();

      cache.subscribe("/project", listener);
      cache.set("/project", [fileEntry("file.ts")]);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        "/project",
        expect.objectContaining({
          entries: [fileEntry("file.ts")],
          version: 1,
        }),
      );
    });

    it("should notify listener on invalidate", async () => {
      const cache = await getCleanCache();
      const listener = vi.fn();

      cache.set("/project", []);
      cache.subscribe("/project", listener);
      cache.invalidate("/project");

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        "/project",
        expect.objectContaining({
          version: 2,
        }),
      );
    });

    it("should notify listener on delete with null", async () => {
      const cache = await getCleanCache();
      const listener = vi.fn();

      cache.set("/project", []);
      cache.subscribe("/project", listener);
      cache.delete("/project");

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith("/project", null);
    });

    it("should not notify listener for different paths", async () => {
      const cache = await getCleanCache();
      const listener = vi.fn();

      cache.subscribe("/project", listener);
      cache.set("/other", []);

      expect(listener).not.toHaveBeenCalled();
    });

    it("should support wildcard subscription for all paths", async () => {
      const cache = await getCleanCache();
      const listener = vi.fn();

      cache.subscribe("*", listener);
      cache.set("/a", []);
      cache.set("/b", []);
      cache.delete("/a");

      expect(listener).toHaveBeenCalledTimes(3);
    });

    it("should stop notifying after dispose", async () => {
      const cache = await getCleanCache();
      const listener = vi.fn();

      const subscription = cache.subscribe("/project", listener);
      cache.set("/project", []);
      expect(listener).toHaveBeenCalledTimes(1);

      subscription.dispose();
      cache.set("/project", []);
      expect(listener).toHaveBeenCalledTimes(1); // No additional calls
    });

    it("should handle multiple subscribers", async () => {
      const cache = await getCleanCache();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      cache.subscribe("/project", listener1);
      cache.subscribe("/project", listener2);
      cache.set("/project", []);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it("should continue notifying other listeners if one throws", async () => {
      const cache = await getCleanCache();
      const errorListener = vi.fn(() => {
        throw new Error("Listener error");
      });
      const normalListener = vi.fn();

      // Suppress console.error for this test
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      cache.subscribe("/project", errorListener);
      cache.subscribe("/project", normalListener);
      cache.set("/project", []);

      expect(errorListener).toHaveBeenCalled();
      expect(normalListener).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should notify on clear", async () => {
      const cache = await getCleanCache();
      const listener = vi.fn();

      cache.set("/a", []);
      cache.set("/b", []);
      cache.subscribe("*", listener);
      cache.clear();

      expect(listener).toHaveBeenCalledTimes(2);
      expect(listener).toHaveBeenCalledWith("/a", null);
      expect(listener).toHaveBeenCalledWith("/b", null);
    });

    it("should notify on LRU eviction", async () => {
      const cache = await getCleanCache();
      cache.setMaxSize(2);
      const listener = vi.fn();

      cache.set("/a", []);
      cache.set("/b", []);
      cache.subscribe("*", listener);
      cache.set("/c", []); // Evicts /a

      // Should be called for /c (set) and /a (evicted)
      expect(listener).toHaveBeenCalledWith("/a", null);
      expect(listener).toHaveBeenCalledWith(
        "/c",
        expect.objectContaining({
          version: 1,
        }),
      );
    });
  });

  describe("size property", () => {
    it("should return 0 for empty cache", async () => {
      const cache = await getCleanCache();

      expect(cache.size).toBe(0);
    });

    it("should track number of entries", async () => {
      const cache = await getCleanCache();

      cache.set("/a", []);
      expect(cache.size).toBe(1);

      cache.set("/b", []);
      expect(cache.size).toBe(2);

      cache.delete("/a");
      expect(cache.size).toBe(1);
    });
  });

  describe("edge cases", () => {
    it("should handle empty entries array", async () => {
      const cache = await getCleanCache();

      cache.set("/empty", []);
      const result = cache.get("/empty");

      expect(result?.entries).toEqual([]);
    });

    it("should handle large number of entries", async () => {
      const cache = await getCleanCache();

      const entries = Array.from({ length: 1000 }, (_, i) =>
        fileEntry(`file${i}.ts`),
      );

      cache.set("/large", entries);
      const result = cache.get("/large");

      expect(result?.entries.length).toBe(1000);
    });

    it("should handle special characters in paths", async () => {
      const cache = await getCleanCache();

      const paths = [
        "/path with spaces",
        "/path-with-dashes",
        "/path_with_underscores",
        "/path.with.dots",
        "/path/with/slashes",
      ];

      for (const path of paths) {
        cache.set(path, [fileEntry("file")]);
        expect(cache.has(path)).toBe(true);
        expect(cache.get(path)?.entries).toEqual([fileEntry("file")]);
      }
    });

    it("should handle deeply nested paths", async () => {
      const cache = await getCleanCache();

      const deepPath = "/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p";
      cache.set(deepPath, []);

      expect(cache.has(deepPath)).toBe(true);
    });
  });
});
