import { EventEmitter } from "node:events";
import * as fsp from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

// Create hoisted mock functions
const mockSpawn = vi.hoisted(() => vi.fn());
const mockExistsSync = vi.hoisted(() => vi.fn());
const mockReadFileSync = vi.hoisted(() => vi.fn());

// Mock fs module
vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  },
}));

// Mock child_process.spawn
vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
  default: {
    spawn: mockSpawn,
  },
}));

// Import after mocking
import { GitIgnoreCache } from "../../../src/ipc/fs/GitIgnoreCache";

/** Helper to create file entries for testing */
const files = (...names: string[]) =>
  names.map((name) => ({ name, isDirectory: false }));

/** Helper to create directory entries for testing */
const dirs = (...names: string[]) =>
  names.map((name) => ({ name, isDirectory: true }));

/** Helper to create mixed entries for testing */
const entries = (...items: Array<{ name: string; isDirectory: boolean }>) =>
  items;

/**
 * Create a mock spawn that returns successful output.
 * Creates a new EventEmitter for each call to handle multiple spawns.
 */
function setupMockSpawnSuccess(output: string) {
  mockSpawn.mockImplementation(() => {
    const mockProcess = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stdin: { write: Mock; end: Mock };
    };
    mockProcess.stdout = new EventEmitter();
    mockProcess.stdin = { write: vi.fn(), end: vi.fn() };

    // Simulate async response
    setTimeout(() => {
      mockProcess.stdout.emit("data", output);
      mockProcess.emit("close", 0);
    }, 0);

    return mockProcess;
  });
}

/**
 * Create a mock spawn that fails.
 * Creates a new EventEmitter for each call to handle multiple spawns.
 */
function setupMockSpawnFailure() {
  mockSpawn.mockImplementation(() => {
    const mockProcess = new EventEmitter() as EventEmitter & {
      stdout: EventEmitter;
      stdin: { write: Mock; end: Mock };
    };
    mockProcess.stdout = new EventEmitter();
    mockProcess.stdin = { write: vi.fn(), end: vi.fn() };

    setTimeout(() => {
      mockProcess.emit("close", 1);
    }, 0);

    return mockProcess;
  });
}

describe("GitIgnoreCache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    GitIgnoreCache.clear();
  });

  describe("getGitRoot()", () => {
    it("should find git root and cache it", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnSuccess("/Users/me/project\n");

      const result = await cache.getGitRoot("/Users/me/project/src");

      expect(result).toBe("/Users/me/project");
      expect(mockSpawn).toHaveBeenCalledWith(
        "git",
        ["rev-parse", "--show-toplevel"],
        expect.objectContaining({ cwd: "/Users/me/project/src" }),
      );
    });

    it("should return cached git root on subsequent calls", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnSuccess("/Users/me/project\n");

      await cache.getGitRoot("/Users/me/project/src");
      const result = await cache.getGitRoot("/Users/me/project/src");

      expect(result).toBe("/Users/me/project");
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it("should cache parent directories up to git root", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnSuccess("/Users/me/project\n");

      await cache.getGitRoot("/Users/me/project/src/components");

      // Subsequent calls to parent dirs should hit cache
      const result1 = await cache.getGitRoot("/Users/me/project/src");
      const result2 = await cache.getGitRoot("/Users/me/project");

      expect(result1).toBe("/Users/me/project");
      expect(result2).toBe("/Users/me/project");
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });

    it("should return null for non-git directories", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnFailure();

      const result = await cache.getGitRoot("/tmp/not-a-repo");

      expect(result).toBeNull();
    });

    it("should cache null result for non-git directories", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnFailure();

      await cache.getGitRoot("/tmp/not-a-repo");
      const result = await cache.getGitRoot("/tmp/not-a-repo");

      expect(result).toBeNull();
      expect(mockSpawn).toHaveBeenCalledTimes(1);
    });
  });

  describe("symlinked folder", () => {
    it("should report the git root under the path the caller used", async () => {
      // git prints realpaths, like /private/tmp/x for a repo opened as /tmp/x.
      const real = await fsp.realpath(
        await fsp.mkdtemp(path.join(os.tmpdir(), "gitignore-real-")),
      );
      const link = `${real}-link`;
      await fsp.mkdir(path.join(real, "src"));
      await fsp.symlink(real, link);
      try {
        setupMockSpawnSuccess(`${real}\n`);
        mockExistsSync.mockReturnValue(true);
        mockReadFileSync.mockReturnValue("ignored.txt\n");

        expect(await GitIgnoreCache.getGitRoot(path.join(link, "src"))).toBe(
          link,
        );
        const ignored = await GitIgnoreCache.getIgnoredEntries(
          link,
          files("ignored.txt", "kept.txt"),
        );
        expect([...ignored]).toEqual(["ignored.txt"]);
      } finally {
        await fsp.rm(link);
        await fsp.rm(real, { recursive: true });
      }
    });
  });

  describe("getIgnoredEntries()", () => {
    it("should return empty set when not in a git repo", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnFailure();

      const result = await cache.getIgnoredEntries(
        "/tmp/not-a-repo",
        files("file.txt"),
      );

      expect(result.size).toBe(0);
    });

    it("should return empty set when no .gitignore exists", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnSuccess("/Users/me/project\n");
      mockExistsSync.mockReturnValue(false);

      const result = await cache.getIgnoredEntries(
        "/Users/me/project",
        files("file.txt"),
      );

      expect(result.size).toBe(0);
    });

    it("should identify ignored files and directories based on .gitignore", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnSuccess("/Users/me/project\n");
      mockExistsSync.mockReturnValue(true);
      // Using "dist/" pattern - requires trailing slash in PATH for directories
      mockReadFileSync.mockReturnValue("*.log\ndist/\n");

      const result = await cache.getIgnoredEntries("/Users/me/project", [
        { name: "src", isDirectory: true },
        { name: "dist", isDirectory: true },
        { name: "debug.log", isDirectory: false },
        { name: "README.md", isDirectory: false },
      ]);

      expect(result.has("dist")).toBe(true);
      expect(result.has("debug.log")).toBe(true);
      expect(result.has("src")).toBe(false);
      expect(result.has("README.md")).toBe(false);
    });

    it("should use provided gitRoot without lookup", async () => {
      const cache = GitIgnoreCache;
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("*.log\n");

      const result = await cache.getIgnoredEntries(
        "/Users/me/project/src",
        files("debug.log", "index.ts"),
        "/Users/me/project",
      );

      expect(result.has("debug.log")).toBe(true);
      expect(result.has("index.ts")).toBe(false);
      // Should not have spawned git for root lookup
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it("should handle subdirectory paths correctly", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnSuccess("/Users/me/project\n");
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("src/*.test.ts\n");

      const result = await cache.getIgnoredEntries(
        "/Users/me/project/src",
        files("index.ts", "index.test.ts", "utils.test.ts"),
      );

      expect(result.has("index.test.ts")).toBe(true);
      expect(result.has("utils.test.ts")).toBe(true);
      expect(result.has("index.ts")).toBe(false);
    });

    it("should handle negation patterns", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnSuccess("/Users/me/project\n");
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("*.log\n!important.log\n");

      const result = await cache.getIgnoredEntries(
        "/Users/me/project",
        files("debug.log", "important.log", "error.log"),
      );

      expect(result.has("debug.log")).toBe(true);
      expect(result.has("error.log")).toBe(true);
      expect(result.has("important.log")).toBe(false);
    });

    it("should skip comments in .gitignore", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnSuccess("/Users/me/project\n");
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        "# This is a comment\n*.log\n# Another comment\n",
      );

      const result = await cache.getIgnoredEntries(
        "/Users/me/project",
        files("debug.log", "# This is a comment"),
      );

      expect(result.has("debug.log")).toBe(true);
      expect(result.has("# This is a comment")).toBe(false);
    });
  });

  describe("nested .gitignore files", () => {
    it("should load nested .gitignore when reading subdirectory", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnSuccess("/Users/me/project\n");
      mockExistsSync.mockImplementation((path: string) => {
        return (
          path === "/Users/me/project/.gitignore" ||
          path === "/Users/me/project/src/.gitignore"
        );
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path === "/Users/me/project/.gitignore") {
          return "*.log\n";
        }
        if (path === "/Users/me/project/src/.gitignore") {
          return "*.generated.ts\n";
        }
        return "";
      });

      // First read root to load root .gitignore
      await cache.getIgnoredEntries("/Users/me/project", files("debug.log"));

      // Then read src to load nested .gitignore
      const result = await cache.getIgnoredEntries(
        "/Users/me/project/src",
        files("index.ts", "types.generated.ts", "debug.log"),
      );

      expect(result.has("types.generated.ts")).toBe(true);
      expect(result.has("debug.log")).toBe(true); // From root .gitignore
      expect(result.has("index.ts")).toBe(false);
    });

    it("should prefix nested .gitignore rules with relative path", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnSuccess("/Users/me/project\n");
      mockExistsSync.mockImplementation((path: string) => {
        return (
          path === "/Users/me/project/.gitignore" ||
          path === "/Users/me/project/packages/app/.gitignore"
        );
      });
      mockReadFileSync.mockImplementation((path: string) => {
        if (path === "/Users/me/project/packages/app/.gitignore") {
          return "build/\n";
        }
        return "";
      });

      // Read the nested directory - build is a directory
      await cache.getIgnoredEntries("/Users/me/project/packages/app", [
        { name: "build", isDirectory: true },
        { name: "src", isDirectory: true },
      ]);

      // The "build" pattern from packages/app/.gitignore should only match
      // files under packages/app, not at the root
      const rootResult = await cache.getIgnoredEntries("/Users/me/project", [
        { name: "build", isDirectory: true },
        { name: "packages", isDirectory: true },
      ]);

      expect(rootResult.has("build")).toBe(false); // Not ignored at root level
    });
  });

  describe("isIgnored()", () => {
    it("should return false for paths outside git root", async () => {
      const cache = GitIgnoreCache;
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("*.log\n");

      const result = cache.isIgnored(
        "/Users/me/project",
        "/Users/me/other/file.log",
      );

      expect(result).toBe(false);
    });

    it("should check if path is ignored synchronously", async () => {
      const cache = GitIgnoreCache;
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("*.log\ndist\n");

      // Trigger matcher creation
      cache.isIgnored("/Users/me/project", "/Users/me/project/debug.log");

      expect(
        cache.isIgnored("/Users/me/project", "/Users/me/project/debug.log"),
      ).toBe(true);
      expect(
        cache.isIgnored("/Users/me/project", "/Users/me/project/dist"),
      ).toBe(true);
      expect(
        cache.isIgnored("/Users/me/project", "/Users/me/project/src/index.ts"),
      ).toBe(false);
    });

    it("should create matcher if not exists", async () => {
      const cache = GitIgnoreCache;
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("*.log\n");

      // Call isIgnored without prior getIgnoredEntries
      const result = cache.isIgnored(
        "/Users/me/project",
        "/Users/me/project/debug.log",
      );

      expect(result).toBe(true);
      expect(mockReadFileSync).toHaveBeenCalledWith(
        "/Users/me/project/.gitignore",
        "utf-8",
      );
    });
  });

  describe("invalidateForGitignore()", () => {
    it("should clear matcher cache for affected git root", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnSuccess("/Users/me/project\n");
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync
        .mockReturnValueOnce("*.log\n") // First read
        .mockReturnValueOnce("*.log\n*.tmp\n"); // After invalidation

      // Initial read
      const result1 = await cache.getIgnoredEntries(
        "/Users/me/project",
        files("debug.log", "cache.tmp"),
      );
      expect(result1.has("cache.tmp")).toBe(false);

      // Invalidate
      cache.invalidateForGitignore("/Users/me/project/.gitignore");

      // Read again - should reload .gitignore
      const result2 = await cache.getIgnoredEntries(
        "/Users/me/project",
        files("debug.log", "cache.tmp"),
      );
      expect(result2.has("cache.tmp")).toBe(true);
    });

    it("should clear all matchers if git root unknown", async () => {
      const cache = GitIgnoreCache;
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("*.log\n");

      // Create a matcher
      cache.isIgnored("/Users/me/project", "/Users/me/project/test.log");

      // Invalidate with unknown git root
      cache.invalidateForGitignore("/unknown/path/.gitignore");

      // Stats should show 0 matchers
      const stats = cache.getStats();
      expect(stats.matcherCount).toBe(0);
    });
  });

  describe("clear()", () => {
    it("should clear all caches", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnSuccess("/Users/me/project\n");
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("*.log\n");

      // Populate caches
      await cache.getGitRoot("/Users/me/project");
      await cache.getIgnoredEntries("/Users/me/project", files("test.log"));

      const statsBefore = cache.getStats();
      expect(statsBefore.gitRootEntries).toBeGreaterThan(0);
      expect(statsBefore.matcherCount).toBeGreaterThan(0);

      cache.clear();

      const statsAfter = cache.getStats();
      expect(statsAfter.gitRootEntries).toBe(0);
      expect(statsAfter.matcherCount).toBe(0);
      expect(statsAfter.loadedGitignoreFiles).toBe(0);
    });
  });

  describe("getStats()", () => {
    it("should return correct statistics", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnSuccess("/Users/me/project\n");
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue("*.log\n");

      await cache.getGitRoot("/Users/me/project/src");
      await cache.getIgnoredEntries("/Users/me/project", files("test.log"));

      const stats = cache.getStats();

      expect(stats.gitRootEntries).toBeGreaterThan(0);
      expect(stats.matcherCount).toBe(1);
      expect(stats.loadedGitignoreFiles).toBe(1);
    });
  });

  describe("gitignore patterns", () => {
    beforeEach(() => {
      mockExistsSync.mockReturnValue(true);
    });

    it("should handle wildcard patterns", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnSuccess("/project\n");
      mockReadFileSync.mockReturnValue("*.log\n*.tmp\n");

      const result = await cache.getIgnoredEntries(
        "/project",
        files("debug.log", "cache.tmp", "index.ts"),
      );

      expect(result.has("debug.log")).toBe(true);
      expect(result.has("cache.tmp")).toBe(true);
      expect(result.has("index.ts")).toBe(false);
    });

    it("should handle directory patterns with trailing slash", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnSuccess("/project\n");
      // Directory patterns with trailing slash now work correctly
      mockReadFileSync.mockReturnValue("node_modules/\ndist/\n");

      const result = await cache.getIgnoredEntries("/project", [
        { name: "node_modules", isDirectory: true },
        { name: "dist", isDirectory: true },
        { name: "src", isDirectory: true },
      ]);

      expect(result.has("node_modules")).toBe(true);
      expect(result.has("dist")).toBe(true);
      expect(result.has("src")).toBe(false);
    });

    it("should handle double-star patterns", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnSuccess("/project\n");
      mockReadFileSync.mockReturnValue("**/*.test.ts\n");

      const result = await cache.getIgnoredEntries(
        "/project/src/utils",
        files("index.ts", "index.test.ts", "helpers.test.ts"),
      );

      expect(result.has("index.test.ts")).toBe(true);
      expect(result.has("helpers.test.ts")).toBe(true);
      expect(result.has("index.ts")).toBe(false);
    });

    it("should handle rooted patterns", async () => {
      const cache = GitIgnoreCache;
      setupMockSpawnSuccess("/project\n");
      mockReadFileSync.mockReturnValue("/build\n");

      // At root level - build is a directory
      const rootResult = await cache.getIgnoredEntries("/project", [
        { name: "build", isDirectory: true },
        { name: "src", isDirectory: true },
      ]);
      expect(rootResult.has("build")).toBe(true);

      // In subdirectory - rooted pattern should not match
      const subResult = await cache.getIgnoredEntries("/project/packages", [
        { name: "build", isDirectory: true },
        { name: "src", isDirectory: true },
      ]);
      expect(subResult.has("build")).toBe(false);
    });
  });
});
