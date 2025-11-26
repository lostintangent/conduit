import { describe, it, expect, beforeEach, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

// Mock providers are created inside the mock factory to avoid hoisting issues
const mockFsProvider = {
  readDirectory: vi.fn(),
  readFile: vi.fn(),
  stat: vi.fn(),
  exists: vi.fn(),
  writeFile: vi.fn(),
  delete: vi.fn(),
  rename: vi.fn(),
  createDirectory: vi.fn(),
  onDirectoryListingChanged: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  onFileContentChanged: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  onFileRenamed: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  onFileDeleted: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  dispose: vi.fn(),
};

const mockGitProvider = {
  getStatus: vi.fn(),
  stage: vi.fn(),
  unstage: vi.fn(),
  commit: vi.fn(),
  checkout: vi.fn(),
  dispose: vi.fn(),
};

const mockFsServiceInstance = {
  getProvider: vi.fn().mockResolvedValue(mockFsProvider),
  releaseProvider: vi.fn(),
};

const mockGitServiceInstance = {
  getProvider: vi.fn().mockResolvedValue({
    provider: mockGitProvider,
    gitRoot: "/test/repo",
  }),
  releaseProvider: vi.fn(),
};

vi.mock("../../../../src/ipc/fsv2/services/FileSystemProviderService", () => ({
  FileSystemProviderService: {
    getInstance: () => mockFsServiceInstance,
  },
}));

vi.mock("../../../../src/ipc/gitv2/services/GitProviderService", () => ({
  GitProviderService: {
    getInstance: () => mockGitServiceInstance,
  },
}));

// ============================================================================
// Import after mocks
// ============================================================================

import {
  getFileSystemProvider,
  releaseFileSystemProvider,
  addFileSystemSubscription,
  getGitProvider,
  releaseGitProvider,
  addGitSubscription,
  cleanupWindow,
  getTrackingStats,
  resetTracking,
} from "../../../../src/ipc/fsv2/main/windowTracking";

// ============================================================================
// Tests
// ============================================================================

describe("windowTracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetTracking();
  });

  // ===========================================================================
  // FileSystem Provider Tracking
  // ===========================================================================

  describe("FileSystem provider tracking", () => {
    it("should get a filesystem provider and track it", async () => {
      const provider = await getFileSystemProvider(1, "/test/project");

      expect(provider).toBe(mockFsProvider);
      expect(mockFsServiceInstance.getProvider).toHaveBeenCalledWith(
        "/test/project",
      );

      const stats = getTrackingStats();
      expect(stats.windowCount).toBe(1);
      expect(stats.providerCount).toBe(1);
    });

    it("should increment refCount on subsequent calls", async () => {
      await getFileSystemProvider(1, "/test/project");
      await getFileSystemProvider(1, "/test/project");

      // Service getProvider called twice
      expect(mockFsServiceInstance.getProvider).toHaveBeenCalledTimes(2);

      const stats = getTrackingStats();
      expect(stats.providerCount).toBe(1); // Same provider, tracked once
    });

    it("should track different providers separately", async () => {
      await getFileSystemProvider(1, "/test/project1");
      await getFileSystemProvider(1, "/test/project2");

      const stats = getTrackingStats();
      expect(stats.providerCount).toBe(2);
    });

    it("should release provider reference", async () => {
      await getFileSystemProvider(1, "/test/project");
      releaseFileSystemProvider(1, "/test/project");

      expect(mockFsServiceInstance.releaseProvider).toHaveBeenCalledWith(
        "/test/project",
      );
    });

    it("should clean up subscriptions on release", async () => {
      const cleanup = vi.fn();
      await getFileSystemProvider(1, "/test/project");
      addFileSystemSubscription(1, "/test/project", cleanup);

      releaseFileSystemProvider(1, "/test/project");

      expect(cleanup).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Git Provider Tracking
  // ===========================================================================

  describe("Git provider tracking", () => {
    it("should get a git provider and track it", async () => {
      const result = await getGitProvider(1, "/test/repo/src");

      expect(result).not.toBeNull();
      expect(result?.provider).toBe(mockGitProvider);
      expect(result?.gitRoot).toBe("/test/repo");
    });

    it("should release git provider reference", async () => {
      const result = await getGitProvider(1, "/test/repo/src");
      releaseGitProvider(1, result!.gitRoot);

      expect(mockGitServiceInstance.releaseProvider).toHaveBeenCalledWith(
        "/test/repo",
      );
    });

    it("should clean up subscriptions on release", async () => {
      const cleanup = vi.fn();
      const result = await getGitProvider(1, "/test/repo/src");
      addGitSubscription(1, result!.gitRoot, cleanup);

      releaseGitProvider(1, result!.gitRoot);

      expect(cleanup).toHaveBeenCalled();
    });

    it("should return null for non-git directories", async () => {
      mockGitServiceInstance.getProvider.mockRejectedValueOnce(
        new Error("Not a git repository"),
      );

      const result = await getGitProvider(1, "/not/a/repo");

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // Window Lifecycle
  // ===========================================================================

  describe("Window lifecycle", () => {
    it("should clean up all providers when window closes", async () => {
      const fsCleanup = vi.fn();
      const gitCleanup = vi.fn();

      await getFileSystemProvider(1, "/test/project");
      addFileSystemSubscription(1, "/test/project", fsCleanup);

      const gitResult = await getGitProvider(1, "/test/repo");
      addGitSubscription(1, gitResult!.gitRoot, gitCleanup);

      cleanupWindow(1);

      expect(fsCleanup).toHaveBeenCalled();
      expect(gitCleanup).toHaveBeenCalled();
      expect(mockFsServiceInstance.releaseProvider).toHaveBeenCalled();
      expect(mockGitServiceInstance.releaseProvider).toHaveBeenCalled();

      const stats = getTrackingStats();
      expect(stats.windowCount).toBe(0);
    });

    it("should handle cleanup for non-existent window", () => {
      // Should not throw
      cleanupWindow(999);

      const stats = getTrackingStats();
      expect(stats.windowCount).toBe(0);
    });

    it("should isolate providers between windows", async () => {
      await getFileSystemProvider(1, "/test/project");
      await getFileSystemProvider(2, "/test/project");

      const stats = getTrackingStats();
      expect(stats.windowCount).toBe(2);

      cleanupWindow(1);

      const statsAfter = getTrackingStats();
      expect(statsAfter.windowCount).toBe(1);
    });
  });

  // ===========================================================================
  // Statistics
  // ===========================================================================

  describe("Statistics", () => {
    it("should track subscription count", async () => {
      await getFileSystemProvider(1, "/test/project");
      addFileSystemSubscription(1, "/test/project", vi.fn());
      addFileSystemSubscription(1, "/test/project", vi.fn());

      const stats = getTrackingStats();
      expect(stats.subscriptionCount).toBe(2);
    });

    it("should reset all tracking state", async () => {
      await getFileSystemProvider(1, "/test/project");
      await getGitProvider(2, "/test/repo");

      resetTracking();

      const stats = getTrackingStats();
      expect(stats.windowCount).toBe(0);
      expect(stats.providerCount).toBe(0);
      expect(stats.subscriptionCount).toBe(0);
    });
  });
});
