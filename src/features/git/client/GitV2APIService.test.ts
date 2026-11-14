import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const { MockGitV2API } = vi.hoisted(() => {
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
    MockGitV2API: MockAPI,
  };
});

// Mock the GitV2API class
vi.mock("./GitV2API", () => ({
  GitV2API: MockGitV2API,
}));

// Import after mocks are set up
import { GitV2APIService } from "./GitV2APIService";

const isReleased = (api: unknown) =>
  (api as InstanceType<typeof MockGitV2API>).isReleased;

// ============================================================================
// Tests
// ============================================================================

describe("GitV2APIService", () => {
  beforeEach(() => {
    GitV2APIService.resetInstance();
    vi.useFakeTimers();
  });

  afterEach(() => {
    GitV2APIService.resetInstance();
    vi.useRealTimers();
  });

  // ===========================================================================
  // Singleton Pattern
  // ===========================================================================

  describe("singleton", () => {
    it("should return the same instance on multiple calls", () => {
      const instance1 = GitV2APIService.getInstance();
      const instance2 = GitV2APIService.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", () => {
      const instance1 = GitV2APIService.getInstance();
      GitV2APIService.resetInstance();
      const instance2 = GitV2APIService.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  // ===========================================================================
  // Acquire/Release
  // ===========================================================================

  describe("acquire", () => {
    it("should create a new API instance for a cwd", () => {
      const service = GitV2APIService.getInstance();
      const api = service.acquire("/test/project");

      expect(api).toBeDefined();
      expect(api.cwd).toBe("/test/project");
    });

    it("should return the same instance for the same cwd", () => {
      const service = GitV2APIService.getInstance();
      const api1 = service.acquire("/test/project");
      const api2 = service.acquire("/test/project");

      expect(api1).toBe(api2);
    });

    it("should return different instances for different cwds", () => {
      const service = GitV2APIService.getInstance();
      const api1 = service.acquire("/project/a");
      const api2 = service.acquire("/project/b");

      expect(api1).not.toBe(api2);
      expect(api1.cwd).toBe("/project/a");
      expect(api2.cwd).toBe("/project/b");
    });

    it("should increment refCount on each acquire", () => {
      const service = GitV2APIService.getInstance();

      service.acquire("/test/project");
      expect(service.getRefCount("/test/project")).toBe(1);

      service.acquire("/test/project");
      expect(service.getRefCount("/test/project")).toBe(2);

      service.acquire("/test/project");
      expect(service.getRefCount("/test/project")).toBe(3);
    });

    it("should cancel pending disposal when re-acquired", () => {
      const service = GitV2APIService.getInstance();
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
      expect(isReleased(api)).toBe(false);
    });
  });

  describe("release", () => {
    it("should decrement refCount on release", () => {
      const service = GitV2APIService.getInstance();

      service.acquire("/test/project");
      service.acquire("/test/project");
      expect(service.getRefCount("/test/project")).toBe(2);

      service.release("/test/project");
      expect(service.getRefCount("/test/project")).toBe(1);

      service.release("/test/project");
      expect(service.getRefCount("/test/project")).toBe(0);
    });

    it("should handle release of non-existent cwd gracefully", () => {
      const service = GitV2APIService.getInstance();

      // Should not throw
      expect(() => {
        service.release("/non/existent");
      }).not.toThrow();
    });

    it("should start grace period when refCount reaches 0", () => {
      const service = GitV2APIService.getInstance();
      const api = service.acquire("/test/project");

      service.release("/test/project");

      // Instance should still exist during grace period
      expect(service.hasInstance("/test/project")).toBe(true);
      expect(isReleased(api)).toBe(false);

      // Fast forward past grace period (5 seconds)
      vi.advanceTimersByTime(5000);

      // Instance should now be disposed
      expect(service.hasInstance("/test/project")).toBe(false);
      expect(isReleased(api)).toBe(true);
    });

    it("should not dispose instance if re-acquired during grace period", () => {
      const service = GitV2APIService.getInstance();
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
      expect(isReleased(api)).toBe(false);
    });
  });

  // ===========================================================================
  // Path Normalization
  // ===========================================================================

  describe("path normalization", () => {
    it("should normalize paths with trailing slashes", () => {
      const service = GitV2APIService.getInstance();

      const api1 = service.acquire("/test/project/");
      const api2 = service.acquire("/test/project");

      expect(api1).toBe(api2);
    });

    it("should normalize paths with multiple trailing slashes", () => {
      const service = GitV2APIService.getInstance();

      const api1 = service.acquire("/test/project///");
      const api2 = service.acquire("/test/project");

      expect(api1).toBe(api2);
    });
  });

  // ===========================================================================
  // Reset
  // ===========================================================================

  describe("resetInstance", () => {
    it("should dispose all instances on reset", () => {
      const service = GitV2APIService.getInstance();

      const api1 = service.acquire("/project/a");
      const api2 = service.acquire("/project/b");

      GitV2APIService.resetInstance();

      expect(isReleased(api1)).toBe(true);
      expect(isReleased(api2)).toBe(true);
    });

    it("should clear all pending disposal timers on reset", () => {
      const service = GitV2APIService.getInstance();

      const api = service.acquire("/test/project");
      service.release("/test/project");

      // Reset before disposal
      GitV2APIService.resetInstance();

      // Fast forward past grace period
      vi.advanceTimersByTime(10000);

      // API should have been released during reset, not by timer
      expect(isReleased(api)).toBe(true);
    });
  });
});
