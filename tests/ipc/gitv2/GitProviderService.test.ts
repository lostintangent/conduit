import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";

// ============================================================================
// Mocks
// ============================================================================

// Track created provider instances
interface MockProviderInstance {
  gitRoot: string;
  cwd: string;
  dispose: ReturnType<typeof vi.fn>;
  startWatching: ReturnType<typeof vi.fn>;
  getStatus: ReturnType<typeof vi.fn>;
}

const createdInstances: MockProviderInstance[] = [];

vi.mock("../../../src/ipc/gitv2/providers/DiskGitProvider", () => {
  return {
    DiskGitProvider: class MockDiskGitProvider {
      gitRoot: string;
      cwd: string;
      dispose = vi.fn();
      startWatching = vi.fn().mockResolvedValue(undefined);
      getStatus = vi
        .fn()
        .mockResolvedValue({ branch: "main", files: new Map() });

      constructor(gitRoot: string, cwd: string) {
        this.gitRoot = gitRoot;
        this.cwd = cwd;
        createdInstances.push(this as MockProviderInstance);
      }
    },
  };
});

// Mock fs.promises.access for git root detection
// Note: GitProviderService imports "node:fs" and uses fs.promises.access
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    promises: {
      ...actual.promises,
      access: vi.fn(),
    },
  };
});

// ============================================================================
// Import after mocks
// ============================================================================

import { GitProviderService } from "../../../src/ipc/gitv2/GitProviderService";

// ============================================================================
// Tests
// ============================================================================

// Helper to create a mock that finds .git in specified directories
function setupGitRootMock(gitRoots: string[]) {
  const normalizedRoots = gitRoots.map((r) => path.resolve(r));

  vi.mocked(fs.promises.access).mockImplementation(async (filePath) => {
    const pathStr = path.resolve(filePath.toString());

    for (const root of normalizedRoots) {
      const gitPath = path.join(root, ".git");
      if (pathStr === gitPath) {
        return undefined;
      }
    }
    throw new Error("ENOENT");
  });
}

describe("GitProviderService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Clear tracked instances
    createdInstances.length = 0;
    // Reset singleton before each test
    GitProviderService.resetInstance();

    // Default: /test/repo has .git
    setupGitRootMock(["/test/repo"]);
  });

  afterEach(() => {
    GitProviderService.resetInstance();
    vi.useRealTimers();
  });

  // ===========================================================================
  // Singleton Pattern
  // ===========================================================================

  describe("singleton pattern", () => {
    it("should return the same instance on multiple calls to getInstance", () => {
      const instance1 = GitProviderService.getInstance();
      const instance2 = GitProviderService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("should create new instance after resetInstance", () => {
      const instance1 = GitProviderService.getInstance();
      GitProviderService.resetInstance();
      const instance2 = GitProviderService.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  // ===========================================================================
  // findGitRoot
  // ===========================================================================

  describe("findGitRoot()", () => {
    it("should find git root in current directory", async () => {
      setupGitRootMock(["/test/repo"]);

      const service = GitProviderService.getInstance();
      const gitRoot = await service.findGitRoot("/test/repo");

      expect(gitRoot).toBe("/test/repo");
    });

    it("should find git root in parent directory", async () => {
      setupGitRootMock(["/test/repo"]);

      const service = GitProviderService.getInstance();
      const gitRoot = await service.findGitRoot("/test/repo/src/components");

      expect(gitRoot).toBe("/test/repo");
    });

    it("should return null if not in a git repository", async () => {
      vi.mocked(fs.promises.access).mockRejectedValue(new Error("ENOENT"));

      const service = GitProviderService.getInstance();
      const gitRoot = await service.findGitRoot("/not/a/repo");

      expect(gitRoot).toBeNull();
    });
  });

  // ===========================================================================
  // getProvider
  // ===========================================================================

  describe("getProvider()", () => {
    it("should create a new provider on first call", async () => {
      setupGitRootMock(["/test/repo"]);
      const service = GitProviderService.getInstance();

      const { provider, gitRoot } = await service.getProvider("/test/repo/src");

      expect(createdInstances.length).toBe(1);
      expect(provider).toBeDefined();
      expect(gitRoot).toBe(path.resolve("/test/repo"));
    });

    it("should start watching on the new provider", async () => {
      setupGitRootMock(["/test/repo"]);
      const service = GitProviderService.getInstance();

      const { provider } = await service.getProvider("/test/repo");

      expect(provider.startWatching).toHaveBeenCalled();
    });

    it("should return the same provider instance for paths in same repo", async () => {
      setupGitRootMock(["/test/repo"]);
      const service = GitProviderService.getInstance();

      const result1 = await service.getProvider("/test/repo/src");
      const result2 = await service.getProvider("/test/repo/tests");

      expect(result1.provider).toBe(result2.provider);
      expect(createdInstances.length).toBe(1);
    });

    it("should throw if path is not in a git repository", async () => {
      vi.mocked(fs.promises.access).mockRejectedValue(new Error("ENOENT"));

      const service = GitProviderService.getInstance();

      await expect(service.getProvider("/not/a/repo")).rejects.toThrow(
        "Not a git repository",
      );
    });

    it("should increment refCount on each getProvider call", async () => {
      setupGitRootMock(["/test/repo"]);
      const service = GitProviderService.getInstance();
      const gitRoot = path.resolve("/test/repo");

      await service.getProvider("/test/repo");
      expect(service.getRefCount(gitRoot)).toBe(1);

      await service.getProvider("/test/repo/src");
      expect(service.getRefCount(gitRoot)).toBe(2);

      await service.getProvider("/test/repo/tests");
      expect(service.getRefCount(gitRoot)).toBe(3);
    });
  });

  // ===========================================================================
  // releaseProvider
  // ===========================================================================

  describe("releaseProvider()", () => {
    it("should decrement refCount on release", async () => {
      setupGitRootMock(["/test/repo"]);
      const service = GitProviderService.getInstance();
      const gitRoot = path.resolve("/test/repo");

      await service.getProvider("/test/repo");
      await service.getProvider("/test/repo/src");
      expect(service.getRefCount(gitRoot)).toBe(2);

      service.releaseProvider(gitRoot);
      expect(service.getRefCount(gitRoot)).toBe(1);
    });

    it("should not immediately dispose when refCount reaches 0", async () => {
      setupGitRootMock(["/test/repo"]);
      const service = GitProviderService.getInstance();
      const gitRoot = path.resolve("/test/repo");

      const { provider } = await service.getProvider("/test/repo");
      service.releaseProvider(gitRoot);

      // Provider should still exist
      expect(service.hasProvider(gitRoot)).toBe(true);
      expect(provider.dispose).not.toHaveBeenCalled();
    });

    it("should dispose provider after grace period when refCount is 0", async () => {
      setupGitRootMock(["/test/repo"]);
      const service = GitProviderService.getInstance();
      const gitRoot = path.resolve("/test/repo");

      const { provider } = await service.getProvider("/test/repo");
      service.releaseProvider(gitRoot);

      // Advance past grace period (5 seconds)
      await vi.advanceTimersByTimeAsync(5000);

      expect(provider.dispose).toHaveBeenCalled();
      expect(service.hasProvider(gitRoot)).toBe(false);
    });

    it("should not dispose before grace period expires", async () => {
      setupGitRootMock(["/test/repo"]);
      const service = GitProviderService.getInstance();
      const gitRoot = path.resolve("/test/repo");

      const { provider } = await service.getProvider("/test/repo");
      service.releaseProvider(gitRoot);

      // Advance just before grace period expires
      await vi.advanceTimersByTimeAsync(4999);

      expect(provider.dispose).not.toHaveBeenCalled();
      expect(service.hasProvider(gitRoot)).toBe(true);
    });

    it("should warn when releasing unknown provider", async () => {
      const service = GitProviderService.getInstance();
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      service.releaseProvider("/unknown/repo");

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Attempted to release unknown provider"),
      );

      consoleSpy.mockRestore();
    });
  });

  // ===========================================================================
  // Grace Period Cancellation
  // ===========================================================================

  describe("grace period cancellation", () => {
    it("should cancel grace period if getProvider is called before expiry", async () => {
      setupGitRootMock(["/test/repo"]);
      const service = GitProviderService.getInstance();
      const gitRoot = path.resolve("/test/repo");

      const { provider } = await service.getProvider("/test/repo");
      service.releaseProvider(gitRoot);

      // Advance part way through grace period
      await vi.advanceTimersByTimeAsync(3000);

      // Re-acquire provider
      const result2 = await service.getProvider("/test/repo");

      // Should be same instance
      expect(result2.provider).toBe(provider);

      // Advance past original grace period
      await vi.advanceTimersByTimeAsync(3000);

      // Should NOT be disposed (timer was cancelled)
      expect(provider.dispose).not.toHaveBeenCalled();
      expect(service.hasProvider(gitRoot)).toBe(true);
    });

    it("should reset refCount when reacquiring during grace period", async () => {
      setupGitRootMock(["/test/repo"]);
      const service = GitProviderService.getInstance();
      const gitRoot = path.resolve("/test/repo");

      await service.getProvider("/test/repo");
      service.releaseProvider(gitRoot);
      expect(service.getRefCount(gitRoot)).toBe(0);

      // Advance part way through grace period
      await vi.advanceTimersByTimeAsync(2000);

      // Re-acquire
      await service.getProvider("/test/repo");
      expect(service.getRefCount(gitRoot)).toBe(1);
    });
  });

  // ===========================================================================
  // forceDispose
  // ===========================================================================

  describe("forceDispose()", () => {
    it("should immediately dispose provider without grace period", async () => {
      setupGitRootMock(["/test/repo"]);
      const service = GitProviderService.getInstance();
      const gitRoot = path.resolve("/test/repo");

      const { provider } = await service.getProvider("/test/repo");

      await service.forceDispose(gitRoot);

      expect(provider.dispose).toHaveBeenCalled();
      expect(service.hasProvider(gitRoot)).toBe(false);
    });

    it("should cancel pending grace period timer", async () => {
      setupGitRootMock(["/test/repo"]);
      const service = GitProviderService.getInstance();
      const gitRoot = path.resolve("/test/repo");

      const { provider } = await service.getProvider("/test/repo");
      service.releaseProvider(gitRoot);

      // Grace period started
      await vi.advanceTimersByTimeAsync(2000);

      // Force dispose
      await service.forceDispose(gitRoot);

      expect(provider.dispose).toHaveBeenCalledTimes(1);

      // Advance past original grace period
      await vi.advanceTimersByTimeAsync(5000);

      // Should not try to dispose again
      expect(provider.dispose).toHaveBeenCalledTimes(1);
    });

    it("should handle force dispose of non-existent provider", async () => {
      const service = GitProviderService.getInstance();

      // Should not throw
      await expect(
        service.forceDispose("/non/existent"),
      ).resolves.not.toThrow();
    });
  });

  // ===========================================================================
  // hasProvider and providerCount
  // ===========================================================================

  describe("hasProvider() and providerCount", () => {
    it("should return false for unknown paths", () => {
      const service = GitProviderService.getInstance();

      expect(service.hasProvider("/unknown/repo")).toBe(false);
    });

    it("should return true for known git roots", async () => {
      setupGitRootMock(["/test/repo"]);
      const service = GitProviderService.getInstance();
      const gitRoot = path.resolve("/test/repo");

      await service.getProvider("/test/repo");

      expect(service.hasProvider(gitRoot)).toBe(true);
    });

    it("should track providerCount correctly", async () => {
      // Setup: two different repos
      setupGitRootMock(["/test/repo1", "/test/repo2"]);

      const service = GitProviderService.getInstance();

      expect(service.providerCount).toBe(0);

      await service.getProvider("/test/repo1");
      expect(service.providerCount).toBe(1);

      await service.getProvider("/test/repo2");
      expect(service.providerCount).toBe(2);

      await service.forceDispose(path.resolve("/test/repo1"));
      expect(service.providerCount).toBe(1);
    });
  });

  // ===========================================================================
  // getRefCount
  // ===========================================================================

  describe("getRefCount()", () => {
    it("should return 0 for unknown paths", () => {
      const service = GitProviderService.getInstance();

      expect(service.getRefCount("/unknown/repo")).toBe(0);
    });

    it("should return current refCount for known paths", async () => {
      const service = GitProviderService.getInstance();
      const gitRoot = path.resolve("/test/repo");

      await service.getProvider("/test/repo");
      await service.getProvider("/test/repo/src");

      expect(service.getRefCount(gitRoot)).toBe(2);

      service.releaseProvider(gitRoot);

      expect(service.getRefCount(gitRoot)).toBe(1);
    });
  });

  // ===========================================================================
  // getExistingProvider
  // ===========================================================================

  describe("getExistingProvider()", () => {
    it("should return null for unknown git roots", () => {
      const service = GitProviderService.getInstance();

      expect(service.getExistingProvider("/unknown/repo")).toBeNull();
    });

    it("should return provider without incrementing refCount", async () => {
      setupGitRootMock(["/test/repo"]);
      const service = GitProviderService.getInstance();
      const gitRoot = path.resolve("/test/repo");

      const { provider: originalProvider } =
        await service.getProvider("/test/repo");
      expect(service.getRefCount(gitRoot)).toBe(1);

      const existingProvider = service.getExistingProvider(gitRoot);

      expect(existingProvider).toBe(originalProvider);
      expect(service.getRefCount(gitRoot)).toBe(1); // RefCount should not change
    });
  });

  // ===========================================================================
  // getExistingProviderByCwd
  // ===========================================================================

  describe("getExistingProviderByCwd()", () => {
    it("should return null for paths not in a git repo", async () => {
      vi.mocked(fs.promises.access).mockRejectedValue(new Error("ENOENT"));

      const service = GitProviderService.getInstance();
      const result = await service.getExistingProviderByCwd("/not/a/repo");

      expect(result).toBeNull();
    });

    it("should return null if no provider exists for the git root", async () => {
      setupGitRootMock(["/test/repo"]);
      const service = GitProviderService.getInstance();

      // Don't create a provider first
      const result = await service.getExistingProviderByCwd("/test/repo/src");

      expect(result).toBeNull();
    });

    it("should return provider and git root without incrementing refCount", async () => {
      setupGitRootMock(["/test/repo"]);
      const service = GitProviderService.getInstance();
      const gitRoot = path.resolve("/test/repo");

      // Create a provider first
      const { provider: originalProvider } =
        await service.getProvider("/test/repo");
      expect(service.getRefCount(gitRoot)).toBe(1);

      // Get existing provider via cwd
      const result = await service.getExistingProviderByCwd(
        "/test/repo/src/components",
      );

      expect(result).not.toBeNull();
      expect(result!.provider).toBe(originalProvider);
      expect(result!.gitRoot).toBe(gitRoot);
      expect(service.getRefCount(gitRoot)).toBe(1); // RefCount should not change
    });
  });

  // ===========================================================================
  // resetInstance
  // ===========================================================================

  describe("resetInstance()", () => {
    it("should dispose all providers", async () => {
      // Setup: two different repos
      setupGitRootMock(["/test/repo1", "/test/repo2"]);

      const service = GitProviderService.getInstance();

      const result1 = await service.getProvider("/test/repo1");
      const result2 = await service.getProvider("/test/repo2");

      GitProviderService.resetInstance();

      expect(result1.provider.dispose).toHaveBeenCalled();
      expect(result2.provider.dispose).toHaveBeenCalled();
    });

    it("should clear all pending timers", async () => {
      const service = GitProviderService.getInstance();
      const gitRoot = path.resolve("/test/repo");

      const { provider } = await service.getProvider("/test/repo");
      service.releaseProvider(gitRoot);

      // Grace period timer started
      GitProviderService.resetInstance();

      // Advance past grace period
      await vi.advanceTimersByTimeAsync(10000);

      // Dispose should only have been called once (during reset, not by timer)
      expect(provider.dispose).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // Path Normalization
  // ===========================================================================

  describe("path normalization", () => {
    it("should normalize paths for consistent lookup", async () => {
      const service = GitProviderService.getInstance();

      const result1 = await service.getProvider("/test/repo");
      const result2 = await service.getProvider("/test/repo/");

      expect(result1.provider).toBe(result2.provider);
      expect(createdInstances.length).toBe(1);
    });
  });
});
