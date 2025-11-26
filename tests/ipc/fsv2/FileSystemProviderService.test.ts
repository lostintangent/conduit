import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

// Track created instances for test verification
interface MockProviderInstance {
  cwd: string;
  dispose: ReturnType<typeof vi.fn>;
  startWatching: ReturnType<typeof vi.fn>;
  stat: ReturnType<typeof vi.fn>;
  readDirectory: ReturnType<typeof vi.fn>;
  readFile: ReturnType<typeof vi.fn>;
  writeFile: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  rename: ReturnType<typeof vi.fn>;
  createDirectory: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  isWatching: ReturnType<typeof vi.fn>;
  onDirectoryListingChanged: ReturnType<typeof vi.fn>;
  onFileContentChanged: ReturnType<typeof vi.fn>;
  onFileRenamed: ReturnType<typeof vi.fn>;
  onFileDeleted: ReturnType<typeof vi.fn>;
}

const createdInstances: MockProviderInstance[] = [];

vi.mock("../../../src/ipc/fsv2/providers/DiskFileSystemProvider", () => {
  return {
    DiskFileSystemProvider: class MockDiskFileSystemProvider {
      cwd: string;
      dispose = vi.fn().mockResolvedValue(undefined);
      startWatching = vi.fn().mockResolvedValue(undefined);
      stat = vi.fn();
      readDirectory = vi.fn();
      readFile = vi.fn();
      writeFile = vi.fn();
      delete = vi.fn();
      rename = vi.fn();
      createDirectory = vi.fn();
      exists = vi.fn();
      isWatching = vi.fn().mockReturnValue(true);
      onDirectoryListingChanged = vi.fn().mockReturnValue({ dispose: vi.fn() });
      onFileContentChanged = vi.fn().mockReturnValue({ dispose: vi.fn() });
      onFileRenamed = vi.fn().mockReturnValue({ dispose: vi.fn() });
      onFileDeleted = vi.fn().mockReturnValue({ dispose: vi.fn() });

      constructor(cwd: string) {
        this.cwd = cwd;
        createdInstances.push(this as MockProviderInstance);
      }
    },
  };
});

// ============================================================================
// Import after mocks
// ============================================================================

import { FileSystemProviderService } from "../../../src/ipc/fsv2/services/FileSystemProviderService";

// ============================================================================
// Tests
// ============================================================================

describe("FileSystemProviderService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Clear tracked instances
    createdInstances.length = 0;
    // Reset singleton before each test
    FileSystemProviderService.resetInstance();
  });

  afterEach(() => {
    // Clean up singleton after each test
    FileSystemProviderService.resetInstance();
    vi.useRealTimers();
  });

  // ===========================================================================
  // Singleton Pattern
  // ===========================================================================

  describe("singleton pattern", () => {
    it("should return the same instance on multiple calls to getInstance", () => {
      const instance1 = FileSystemProviderService.getInstance();
      const instance2 = FileSystemProviderService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("should create new instance after resetInstance", () => {
      const instance1 = FileSystemProviderService.getInstance();
      FileSystemProviderService.resetInstance();
      const instance2 = FileSystemProviderService.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  // ===========================================================================
  // getProvider
  // ===========================================================================

  describe("getProvider()", () => {
    it("should create a new provider on first call", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider = await service.getProvider("/test/project");

      expect(createdInstances.length).toBe(1);
      expect(provider).toBeDefined();
      expect(provider.cwd).toBe("/test/project");
    });

    it("should start watching on the new provider", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider = await service.getProvider("/test/project");

      expect(provider.startWatching).toHaveBeenCalled();
    });

    it("should return the same provider instance for the same path", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider1 = await service.getProvider("/test/project");
      const provider2 = await service.getProvider("/test/project");

      expect(provider1).toBe(provider2);
      expect(createdInstances.length).toBe(1);
    });

    it("should create different providers for different paths", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider1 = await service.getProvider("/test/project1");
      const provider2 = await service.getProvider("/test/project2");

      expect(provider1).not.toBe(provider2);
      expect(createdInstances.length).toBe(2);
    });

    it("should increment refCount on each getProvider call", async () => {
      const service = FileSystemProviderService.getInstance();

      await service.getProvider("/test/project");
      expect(service.getRefCount("/test/project")).toBe(1);

      await service.getProvider("/test/project");
      expect(service.getRefCount("/test/project")).toBe(2);

      await service.getProvider("/test/project");
      expect(service.getRefCount("/test/project")).toBe(3);
    });
  });

  // ===========================================================================
  // releaseProvider
  // ===========================================================================

  describe("releaseProvider()", () => {
    it("should decrement refCount on release", async () => {
      const service = FileSystemProviderService.getInstance();

      await service.getProvider("/test/project");
      await service.getProvider("/test/project");
      expect(service.getRefCount("/test/project")).toBe(2);

      service.releaseProvider("/test/project");
      expect(service.getRefCount("/test/project")).toBe(1);
    });

    it("should not immediately dispose when refCount reaches 0", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider = await service.getProvider("/test/project");
      service.releaseProvider("/test/project");

      // Provider should still exist
      expect(service.hasProvider("/test/project")).toBe(true);
      expect(provider.dispose).not.toHaveBeenCalled();
    });

    it("should dispose provider after grace period when refCount is 0", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider = await service.getProvider("/test/project");
      service.releaseProvider("/test/project");

      // Advance past grace period (5 seconds)
      await vi.advanceTimersByTimeAsync(5000);

      expect(provider.dispose).toHaveBeenCalled();
      expect(service.hasProvider("/test/project")).toBe(false);
    });

    it("should not dispose before grace period expires", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider = await service.getProvider("/test/project");
      service.releaseProvider("/test/project");

      // Advance just before grace period expires
      await vi.advanceTimersByTimeAsync(4999);

      expect(provider.dispose).not.toHaveBeenCalled();
      expect(service.hasProvider("/test/project")).toBe(true);
    });

    it("should warn when releasing unknown provider", async () => {
      const service = FileSystemProviderService.getInstance();
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      service.releaseProvider("/unknown/path");

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
      const service = FileSystemProviderService.getInstance();

      const provider = await service.getProvider("/test/project");
      service.releaseProvider("/test/project");

      // Advance part way through grace period
      await vi.advanceTimersByTimeAsync(3000);

      // Re-acquire provider
      const provider2 = await service.getProvider("/test/project");

      // Should be same instance
      expect(provider2).toBe(provider);

      // Advance past original grace period
      await vi.advanceTimersByTimeAsync(3000);

      // Should NOT be disposed (timer was cancelled)
      expect(provider.dispose).not.toHaveBeenCalled();
      expect(service.hasProvider("/test/project")).toBe(true);
    });

    it("should reset refCount when reacquiring during grace period", async () => {
      const service = FileSystemProviderService.getInstance();

      await service.getProvider("/test/project");
      service.releaseProvider("/test/project");
      expect(service.getRefCount("/test/project")).toBe(0);

      // Advance part way through grace period
      await vi.advanceTimersByTimeAsync(2000);

      // Re-acquire
      await service.getProvider("/test/project");
      expect(service.getRefCount("/test/project")).toBe(1);
    });
  });

  // ===========================================================================
  // Path Normalization
  // ===========================================================================

  describe("path normalization", () => {
    it("should normalize relative paths", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider1 = await service.getProvider("/test/project");
      const provider2 = await service.getProvider("/test/project/../project");

      expect(provider1).toBe(provider2);
      expect(createdInstances.length).toBe(1);
    });

    it("should normalize paths with trailing slashes", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider1 = await service.getProvider("/test/project");
      const provider2 = await service.getProvider("/test/project/");

      expect(provider1).toBe(provider2);
      expect(createdInstances.length).toBe(1);
    });

    it("should normalize paths with double slashes", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider1 = await service.getProvider("/test/project");
      const provider2 = await service.getProvider("/test//project");

      expect(provider1).toBe(provider2);
      expect(createdInstances.length).toBe(1);
    });
  });

  // ===========================================================================
  // forceDispose
  // ===========================================================================

  describe("forceDispose()", () => {
    it("should immediately dispose provider without grace period", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider = await service.getProvider("/test/project");

      await service.forceDispose("/test/project");

      expect(provider.dispose).toHaveBeenCalled();
      expect(service.hasProvider("/test/project")).toBe(false);
    });

    it("should cancel pending grace period timer", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider = await service.getProvider("/test/project");
      service.releaseProvider("/test/project");

      // Grace period started
      await vi.advanceTimersByTimeAsync(2000);

      // Force dispose
      await service.forceDispose("/test/project");

      expect(provider.dispose).toHaveBeenCalledTimes(1);

      // Advance past original grace period
      await vi.advanceTimersByTimeAsync(5000);

      // Should not try to dispose again
      expect(provider.dispose).toHaveBeenCalledTimes(1);
    });

    it("should handle force dispose of non-existent provider", async () => {
      const service = FileSystemProviderService.getInstance();

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
      const service = FileSystemProviderService.getInstance();

      expect(service.hasProvider("/unknown/path")).toBe(false);
    });

    it("should return true for known paths", async () => {
      const service = FileSystemProviderService.getInstance();

      await service.getProvider("/test/project");

      expect(service.hasProvider("/test/project")).toBe(true);
    });

    it("should track providerCount correctly", async () => {
      const service = FileSystemProviderService.getInstance();

      expect(service.providerCount).toBe(0);

      await service.getProvider("/test/project1");
      expect(service.providerCount).toBe(1);

      await service.getProvider("/test/project2");
      expect(service.providerCount).toBe(2);

      await service.forceDispose("/test/project1");
      expect(service.providerCount).toBe(1);
    });
  });

  // ===========================================================================
  // getRefCount
  // ===========================================================================

  describe("getRefCount()", () => {
    it("should return 0 for unknown paths", () => {
      const service = FileSystemProviderService.getInstance();

      expect(service.getRefCount("/unknown/path")).toBe(0);
    });

    it("should return current refCount for known paths", async () => {
      const service = FileSystemProviderService.getInstance();

      await service.getProvider("/test/project");
      await service.getProvider("/test/project");

      expect(service.getRefCount("/test/project")).toBe(2);

      service.releaseProvider("/test/project");

      expect(service.getRefCount("/test/project")).toBe(1);
    });
  });

  // ===========================================================================
  // resetInstance
  // ===========================================================================

  describe("resetInstance()", () => {
    it("should dispose all providers", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider1 = await service.getProvider("/test/project1");
      const provider2 = await service.getProvider("/test/project2");

      FileSystemProviderService.resetInstance();

      expect(provider1.dispose).toHaveBeenCalled();
      expect(provider2.dispose).toHaveBeenCalled();
    });

    it("should clear all pending timers", async () => {
      const service = FileSystemProviderService.getInstance();

      const provider = await service.getProvider("/test/project");
      service.releaseProvider("/test/project");

      // Grace period timer started
      FileSystemProviderService.resetInstance();

      // Advance past grace period
      await vi.advanceTimersByTimeAsync(10000);

      // Dispose should only have been called once (during reset, not by timer)
      expect(provider.dispose).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // Multiple Providers
  // ===========================================================================

  describe("multiple providers", () => {
    it("should manage multiple providers independently", async () => {
      const service = FileSystemProviderService.getInstance();

      await service.getProvider("/test/project1");
      await service.getProvider("/test/project1");
      await service.getProvider("/test/project2");

      expect(service.getRefCount("/test/project1")).toBe(2);
      expect(service.getRefCount("/test/project2")).toBe(1);

      service.releaseProvider("/test/project1");
      expect(service.getRefCount("/test/project1")).toBe(1);
      expect(service.getRefCount("/test/project2")).toBe(1);
    });

    it("should dispose providers independently based on their grace periods", async () => {
      const service = FileSystemProviderService.getInstance();

      await service.getProvider("/test/project1");
      await service.getProvider("/test/project2");

      service.releaseProvider("/test/project1");

      // Advance 3 seconds
      await vi.advanceTimersByTimeAsync(3000);

      // Release project2
      service.releaseProvider("/test/project2");

      // Advance 2 more seconds (5 total for project1)
      await vi.advanceTimersByTimeAsync(2000);

      // Project1 should be disposed
      expect(createdInstances[0].dispose).toHaveBeenCalled();
      // Project2 should not be disposed yet (only 2 seconds into grace)
      expect(createdInstances[1].dispose).not.toHaveBeenCalled();

      // Advance 3 more seconds (5 total for project2)
      await vi.advanceTimersByTimeAsync(3000);

      // Now project2 should be disposed
      expect(createdInstances[1].dispose).toHaveBeenCalled();
    });
  });
});
