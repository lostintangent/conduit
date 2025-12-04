import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const { MockFileSystemV2API } = vi.hoisted(() => {
  // Mock window.conduit.fsv2
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
    release: vi.fn(),
    onDirectoryChanged: vi.fn(() => vi.fn()),
    onFileChanged: vi.fn(() => vi.fn()),
    onFileDeleted: vi.fn(() => vi.fn()),
    onFileRenamed: vi.fn(() => vi.fn()),
  };

  // Set up window.conduit
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).window.conduit = { fsv2 };

  // Create a mock class that tracks instances
  class MockAPI {
    readonly cwd: string;
    private _released = false;

    constructor(cwd: string) {
      this.cwd = cwd;
    }

    release(): void {
      this._released = true;
    }

    get isReleased(): boolean {
      return this._released;
    }
  }

  return {
    MockFileSystemV2API: MockAPI,
  };
});

// Mock the FileSystemV2API class
vi.mock("../../../src/renderer/api/FileSystemV2API", () => ({
  FileSystemV2API: MockFileSystemV2API,
}));

// Import after mocks are set up
import { FileSystemV2APIService } from "../../../src/renderer/services/FileSystemV2APIService";

// ============================================================================
// Tests
// ============================================================================

describe("FileSystemV2APIService", () => {
  beforeEach(() => {
    FileSystemV2APIService.resetInstance();
    vi.useFakeTimers();
  });

  afterEach(() => {
    FileSystemV2APIService.resetInstance();
    vi.useRealTimers();
  });

  // ===========================================================================
  // Singleton Pattern
  // ===========================================================================

  describe("singleton", () => {
    it("should return the same instance on multiple calls", () => {
      const instance1 = FileSystemV2APIService.getInstance();
      const instance2 = FileSystemV2APIService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", () => {
      const instance1 = FileSystemV2APIService.getInstance();
      FileSystemV2APIService.resetInstance();
      const instance2 = FileSystemV2APIService.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  // ===========================================================================
  // Acquire/Release
  // ===========================================================================

  describe("acquire", () => {
    it("should create a new API instance for a cwd", () => {
      const service = FileSystemV2APIService.getInstance();
      const api = service.acquire("/test/project");

      expect(api).toBeDefined();
      expect(api.cwd).toBe("/test/project");
    });

    it("should return the same instance for the same cwd", () => {
      const service = FileSystemV2APIService.getInstance();
      const api1 = service.acquire("/test/project");
      const api2 = service.acquire("/test/project");

      expect(api1).toBe(api2);
    });

    it("should return different instances for different cwds", () => {
      const service = FileSystemV2APIService.getInstance();
      const api1 = service.acquire("/project/a");
      const api2 = service.acquire("/project/b");

      expect(api1).not.toBe(api2);
      expect(api1.cwd).toBe("/project/a");
      expect(api2.cwd).toBe("/project/b");
    });

    it("should increment refCount on each acquire", () => {
      const service = FileSystemV2APIService.getInstance();

      service.acquire("/test/project");
      expect(service.getRefCount("/test/project")).toBe(1);

      service.acquire("/test/project");
      expect(service.getRefCount("/test/project")).toBe(2);

      service.acquire("/test/project");
      expect(service.getRefCount("/test/project")).toBe(3);
    });

    it("should cancel pending disposal when re-acquired", () => {
      const service = FileSystemV2APIService.getInstance();
      const api = service.acquire("/test/project");

      // Release to start disposal timer
      service.release("/test/project");
      expect(service.getRefCount("/test/project")).toBe(0);

      // Re-acquire before disposal
      const api2 = service.acquire("/test/project");
      expect(api).toBe(api2);
      expect(service.getRefCount("/test/project")).toBe(1);

      // Fast forward past grace period
      vi.advanceTimersByTime(10000);

      // Instance should still exist
      expect(service.hasInstance("/test/project")).toBe(true);
      expect(api.isReleased).toBe(false);
    });
  });

  describe("release", () => {
    it("should decrement refCount on release", () => {
      const service = FileSystemV2APIService.getInstance();

      service.acquire("/test/project");
      service.acquire("/test/project");
      expect(service.getRefCount("/test/project")).toBe(2);

      service.release("/test/project");
      expect(service.getRefCount("/test/project")).toBe(1);

      service.release("/test/project");
      expect(service.getRefCount("/test/project")).toBe(0);
    });

    it("should handle release of non-existent cwd gracefully", () => {
      const service = FileSystemV2APIService.getInstance();

      // Should not throw
      expect(() => {
        service.release("/non/existent");
      }).not.toThrow();
    });

    it("should start grace period when refCount reaches 0", () => {
      const service = FileSystemV2APIService.getInstance();
      const api = service.acquire("/test/project");

      service.release("/test/project");

      // Instance should still exist during grace period
      expect(service.hasInstance("/test/project")).toBe(true);
      expect(api.isReleased).toBe(false);

      // Fast forward past grace period (5 seconds)
      vi.advanceTimersByTime(5000);

      // Instance should now be disposed
      expect(service.hasInstance("/test/project")).toBe(false);
      expect(api.isReleased).toBe(true);
    });

    it("should not dispose instance if re-acquired during grace period", () => {
      const service = FileSystemV2APIService.getInstance();
      const api = service.acquire("/test/project");

      service.release("/test/project");

      // Advance time but not past grace period
      vi.advanceTimersByTime(2000);

      // Re-acquire
      service.acquire("/test/project");

      // Fast forward past original grace period
      vi.advanceTimersByTime(5000);

      // Instance should still exist
      expect(service.hasInstance("/test/project")).toBe(true);
      expect(api.isReleased).toBe(false);
    });
  });

  // ===========================================================================
  // Path Normalization
  // ===========================================================================

  describe("path normalization", () => {
    it("should normalize paths with trailing slashes", () => {
      const service = FileSystemV2APIService.getInstance();

      const api1 = service.acquire("/test/project/");
      const api2 = service.acquire("/test/project");

      expect(api1).toBe(api2);
    });

    it("should normalize paths with multiple trailing slashes", () => {
      const service = FileSystemV2APIService.getInstance();

      const api1 = service.acquire("/test/project///");
      const api2 = service.acquire("/test/project");

      expect(api1).toBe(api2);
    });
  });

  // ===========================================================================
  // Case Sensitivity (macOS/Windows)
  // ===========================================================================

  // Note: These tests verify case-insensitive behavior on macOS/Windows.
  // The isCaseInsensitiveFs flag is computed at module load time based on
  // navigator.platform. On macOS/Windows, paths are case-insensitive.
  // Skip on Linux where paths are case-sensitive.

  describe("case sensitivity on case-insensitive platforms", () => {
    // Import the flag to check if we're on a case-insensitive platform
    // This happens after vi.hoisted so the module is already loaded
    let isCaseInsensitiveFs: boolean;

    beforeEach(async () => {
      const pathUtils = await import("../../../src/renderer/utils/pathUtils");
      isCaseInsensitiveFs = pathUtils.isCaseInsensitiveFs;
    });

    it("should treat paths with different casing as the same instance", () => {
      if (!isCaseInsensitiveFs) {
        console.log(
          "Skipping case sensitivity test on case-sensitive platform",
        );
        return;
      }
      const service = FileSystemV2APIService.getInstance();

      const api1 = service.acquire("/Test/Project");
      const api2 = service.acquire("/test/project");

      expect(api1).toBe(api2);
    });

    it("should share refCount across case variations", () => {
      if (!isCaseInsensitiveFs) {
        console.log(
          "Skipping case sensitivity test on case-sensitive platform",
        );
        return;
      }
      const service = FileSystemV2APIService.getInstance();

      service.acquire("/Test/Project");
      expect(service.getRefCount("/test/project")).toBe(1);

      service.acquire("/TEST/PROJECT");
      expect(service.getRefCount("/Test/Project")).toBe(2);
    });

    it("should release correctly with different case", () => {
      if (!isCaseInsensitiveFs) {
        console.log(
          "Skipping case sensitivity test on case-sensitive platform",
        );
        return;
      }
      const service = FileSystemV2APIService.getInstance();

      service.acquire("/Test/Project");
      service.acquire("/TEST/PROJECT");
      expect(service.getRefCount("/test/project")).toBe(2);

      service.release("/tEsT/pRoJeCt");
      expect(service.getRefCount("/Test/Project")).toBe(1);
    });

    it("should report hasInstance correctly with different case", () => {
      if (!isCaseInsensitiveFs) {
        console.log(
          "Skipping case sensitivity test on case-sensitive platform",
        );
        return;
      }
      const service = FileSystemV2APIService.getInstance();

      service.acquire("/Test/Project");

      expect(service.hasInstance("/test/project")).toBe(true);
      expect(service.hasInstance("/TEST/PROJECT")).toBe(true);
      expect(service.hasInstance("/Test/Project")).toBe(true);
    });

    it("should combine trailing slash and case normalization", () => {
      if (!isCaseInsensitiveFs) {
        console.log(
          "Skipping case sensitivity test on case-sensitive platform",
        );
        return;
      }
      const service = FileSystemV2APIService.getInstance();

      const api1 = service.acquire("/Test/Project/");
      const api2 = service.acquire("/test/project");

      expect(api1).toBe(api2);
    });
  });

  // ===========================================================================
  // Stats
  // ===========================================================================

  describe("getStats", () => {
    it("should return correct stats for empty service", () => {
      const service = FileSystemV2APIService.getInstance();
      const stats = service.getStats();

      expect(stats.instanceCount).toBe(0);
      expect(stats.totalRefCount).toBe(0);
    });

    it("should return correct stats with instances", () => {
      const service = FileSystemV2APIService.getInstance();

      service.acquire("/project/a");
      service.acquire("/project/a");
      service.acquire("/project/b");

      const stats = service.getStats();

      expect(stats.instanceCount).toBe(2);
      expect(stats.totalRefCount).toBe(3);
    });
  });

  // ===========================================================================
  // Reset
  // ===========================================================================

  describe("resetInstance", () => {
    it("should dispose all instances on reset", () => {
      const service = FileSystemV2APIService.getInstance();

      const api1 = service.acquire("/project/a");
      const api2 = service.acquire("/project/b");

      FileSystemV2APIService.resetInstance();

      expect(api1.isReleased).toBe(true);
      expect(api2.isReleased).toBe(true);
    });

    it("should clear all pending disposal timers on reset", () => {
      const service = FileSystemV2APIService.getInstance();

      const api = service.acquire("/test/project");
      service.release("/test/project");

      // Reset before disposal
      FileSystemV2APIService.resetInstance();

      // Fast forward past grace period
      vi.advanceTimersByTime(10000);

      // API should have been released during reset, not by timer
      expect(api.isReleased).toBe(true);
    });
  });
});
