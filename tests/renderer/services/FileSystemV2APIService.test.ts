import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const { MockFileSystemV2API } = vi.hoisted(() => {
  // Mock window.conduit.fs
  const fs = {
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
  (globalThis as any).window.conduit = { fs };

  // Create a mock class that tracks instances
  class MockAPI {
    readonly cwd: string;
    private _released = false;
    private _suspended = false;

    constructor(cwd: string) {
      this.cwd = cwd;
    }

    suspend(): void {
      this._suspended = true;
    }

    resume(): void {
      this._suspended = false;
    }

    release(): void {
      this._released = true;
    }

    get isReleased(): boolean {
      return this._released;
    }

    get isSuspended(): boolean {
      return this._suspended;
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

const isSuspended = (api: unknown) =>
  (api as InstanceType<typeof MockFileSystemV2API>).isSuspended;

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

    it("should cancel a pending suspension when re-acquired", () => {
      const service = FileSystemV2APIService.getInstance();
      const api = service.acquire("/test/project");

      // Release to start the suspension timer
      service.release("/test/project");
      expect(service.getRefCount("/test/project")).toBe(0);

      // Re-acquire before it suspends
      const api2 = service.acquire("/test/project");
      expect(api).toBe(api2);
      expect(service.getRefCount("/test/project")).toBe(1);

      // Fast forward past grace period
      vi.advanceTimersByTime(10000);

      expect(isSuspended(api)).toBe(false);
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

    it("should suspend the instance once it's gone unheld for the grace period", () => {
      const service = FileSystemV2APIService.getInstance();
      const api = service.acquire("/test/project");

      service.release("/test/project");

      // Still watching during grace period
      expect(isSuspended(api)).toBe(false);

      // Fast forward past grace period (5 seconds)
      vi.advanceTimersByTime(5000);

      // Suspended, but kept rather than released
      expect(service.hasInstance("/test/project")).toBe(true);
      expect(isSuspended(api)).toBe(true);
      expect(api.isReleased).toBe(false);
    });

    it("should not suspend the instance if re-acquired during grace period", () => {
      const service = FileSystemV2APIService.getInstance();
      const api = service.acquire("/test/project");

      service.release("/test/project");

      // Advance time but not past grace period
      vi.advanceTimersByTime(2000);

      // Re-acquire
      service.acquire("/test/project");

      // Fast forward past original grace period
      vi.advanceTimersByTime(5000);

      expect(isSuspended(api)).toBe(false);
    });

    it("should ignore extra releases so a later acquire keeps the instance", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const service = FileSystemV2APIService.getInstance();
      const api = service.acquire("/test/project");

      service.release("/test/project");
      service.release("/test/project");
      expect(warn).toHaveBeenCalledOnce();

      service.acquire("/test/project");
      vi.advanceTimersByTime(5000);

      expect(service.getRefCount("/test/project")).toBe(1);
      expect(isSuspended(api)).toBe(false);
      warn.mockRestore();
    });

    it("should resume the same instance when acquired after it suspends", () => {
      const service = FileSystemV2APIService.getInstance();
      const api = service.acquire("/test/project");

      service.release("/test/project");
      vi.advanceTimersByTime(5000);
      expect(isSuspended(api)).toBe(true);

      expect(service.acquire("/test/project")).toBe(api);
      expect(isSuspended(api)).toBe(false);
    });
  });

  describe("get", () => {
    it("should return the instance without holding it", () => {
      const service = FileSystemV2APIService.getInstance();
      const api = service.acquire("/test/project");

      expect(service.get("/test/project/")).toBe(api);
      expect(service.getRefCount("/test/project")).toBe(1);
    });

    it("should suspend an instance it creates unless something acquires it", () => {
      const service = FileSystemV2APIService.getInstance();
      const unheld = service.get("/project/a");
      const held = service.get("/project/b");
      service.acquire("/project/b");

      vi.advanceTimersByTime(5000);

      expect(isSuspended(unheld)).toBe(true);
      expect(isSuspended(held)).toBe(false);
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
  // Case Sensitivity (macOS)
  // ===========================================================================

  describe("case sensitivity", () => {
    it("should treat paths with different casing as the same instance", () => {
      const service = FileSystemV2APIService.getInstance();

      const api1 = service.acquire("/Test/Project");
      const api2 = service.acquire("/test/project");

      expect(api1).toBe(api2);
    });

    it("should share refCount across case variations", () => {
      const service = FileSystemV2APIService.getInstance();

      service.acquire("/Test/Project");
      expect(service.getRefCount("/test/project")).toBe(1);

      service.acquire("/TEST/PROJECT");
      expect(service.getRefCount("/Test/Project")).toBe(2);
    });

    it("should release correctly with different case", () => {
      const service = FileSystemV2APIService.getInstance();

      service.acquire("/Test/Project");
      service.acquire("/TEST/PROJECT");
      expect(service.getRefCount("/test/project")).toBe(2);

      service.release("/tEsT/pRoJeCt");
      expect(service.getRefCount("/Test/Project")).toBe(1);
    });

    it("should report hasInstance correctly with different case", () => {
      const service = FileSystemV2APIService.getInstance();

      service.acquire("/Test/Project");

      expect(service.hasInstance("/test/project")).toBe(true);
      expect(service.hasInstance("/TEST/PROJECT")).toBe(true);
      expect(service.hasInstance("/Test/Project")).toBe(true);
    });

    it("should combine trailing slash and case normalization", () => {
      const service = FileSystemV2APIService.getInstance();

      const api1 = service.acquire("/Test/Project/");
      const api2 = service.acquire("/test/project");

      expect(api1).toBe(api2);
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

    it("should clear all pending suspensions on reset", () => {
      const service = FileSystemV2APIService.getInstance();

      const api = service.acquire("/test/project");
      service.release("/test/project");

      // Reset before it suspends
      FileSystemV2APIService.resetInstance();

      // Fast forward past grace period
      vi.advanceTimersByTime(10000);

      // API should have been released during reset, not by timer
      expect(api.isReleased).toBe(true);
    });
  });
});
