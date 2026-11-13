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

vi.mock("../../../src/ipc/git/DiskGitProvider", () => {
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

import { GitProviderService } from "../../../src/ipc/git/GitProviderService";

// ============================================================================
// Tests
// ============================================================================

// Helper to create a mock that finds .git in specified directories
function setupGitRootMock(gitRoots: string[]) {
  const normalizedRoots = gitRoots.map((r) => path.resolve(r));

  vi.mocked(fs.promises.access).mockImplementation(async (filePath) => {
    const pathStr = path.resolve(filePath.toString());
    const comparePath = pathStr.toLowerCase();

    for (const root of normalizedRoots) {
      const gitPath = path.join(root, ".git");
      if (comparePath === gitPath.toLowerCase()) {
        return undefined;
      }
    }
    throw new Error("ENOENT");
  });
}

describe("GitProviderService", () => {
  // Ref-counting, the grace period and path keys are ProviderPool's, tested in
  // tests/ipc/ProviderPool.test.ts. These cover what the service adds.
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
  });

  // ===========================================================================
  // releaseProvider
  // ===========================================================================

  describe("releaseProvider()", () => {
    it("should dispose the provider after the grace period when released by its gitRoot", async () => {
      const service = GitProviderService.getInstance();

      const { provider, gitRoot } = await service.getProvider("/test/repo/src");
      service.releaseProvider(gitRoot);
      await vi.advanceTimersByTimeAsync(5000);

      expect(provider.dispose).toHaveBeenCalled();
      expect(service.getExistingProvider(gitRoot)).toBeNull();
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

    it("should return the provider without taking a reference", async () => {
      setupGitRootMock(["/test/repo"]);
      const service = GitProviderService.getInstance();
      const gitRoot = path.resolve("/test/repo");

      const { provider: originalProvider } =
        await service.getProvider("/test/repo");

      expect(service.getExistingProvider(gitRoot)).toBe(originalProvider);

      // One release is enough to dispose it, so no second reference was taken
      service.releaseProvider(gitRoot);
      await vi.advanceTimersByTimeAsync(5000);
      expect(originalProvider.dispose).toHaveBeenCalled();
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

    it("should return provider and git root without taking a reference", async () => {
      setupGitRootMock(["/test/repo"]);
      const service = GitProviderService.getInstance();
      const gitRoot = path.resolve("/test/repo");

      // Create a provider first
      const { provider: originalProvider } =
        await service.getProvider("/test/repo");

      // Get existing provider via cwd
      const result = await service.getExistingProviderByCwd(
        "/test/repo/src/components",
      );

      expect(result).not.toBeNull();
      expect(result!.provider).toBe(originalProvider);
      expect(result!.gitRoot).toBe(gitRoot);

      // One release is enough to dispose it, so no second reference was taken
      service.releaseProvider(gitRoot);
      await vi.advanceTimersByTimeAsync(5000);
      expect(originalProvider.dispose).toHaveBeenCalled();
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
  });

  // ===========================================================================
  // Path Normalization
  // ===========================================================================

  describe("path normalization", () => {
    it("should share one provider across path case, releasable by any case", async () => {
      setupGitRootMock(["/test/repo"]);
      const service = GitProviderService.getInstance();

      const result1 = await service.getProvider("/test/repo");
      const result2 = await service.getProvider("/Test/Repo");

      expect(result2.provider).toBe(result1.provider);
      expect(createdInstances.length).toBe(1);
      expect(service.getExistingProvider("/TEST/REPO")).toBe(result1.provider);

      service.releaseProvider("/Test/Repo");
      service.releaseProvider("/test/repo");
      await vi.advanceTimersByTimeAsync(5000);
      expect(result1.provider.dispose).toHaveBeenCalledTimes(1);
    });
  });
});
