import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const { MockGitSubscription } = vi.hoisted(() => {
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
    MockGitSubscription: MockAPI,
  };
});

// Mock the GitSubscription class
vi.mock("./GitSubscription", () => ({
  GitSubscription: MockGitSubscription,
}));

// Import after mocks are set up
import { GitSubscriptionPool } from "./GitSubscriptionPool";

const isReleased = (api: unknown) =>
  (api as InstanceType<typeof MockGitSubscription>).isReleased;
const isSuspended = (api: unknown) =>
  (api as InstanceType<typeof MockGitSubscription>).isSuspended;

// ============================================================================
// Tests
// ============================================================================

describe("GitSubscriptionPool", () => {
  beforeEach(() => {
    GitSubscriptionPool.resetInstance();
    vi.useFakeTimers();
  });

  afterEach(() => {
    GitSubscriptionPool.resetInstance();
    vi.useRealTimers();
  });

  // ===========================================================================
  // Singleton Pattern
  // ===========================================================================

  describe("singleton", () => {
    it("should return the same instance on multiple calls", () => {
      const instance1 = GitSubscriptionPool.getInstance();
      const instance2 = GitSubscriptionPool.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("should create new instance after reset", () => {
      const instance1 = GitSubscriptionPool.getInstance();
      GitSubscriptionPool.resetInstance();
      const instance2 = GitSubscriptionPool.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });

  // ===========================================================================
  // Acquire/Release
  // ===========================================================================

  describe("acquire", () => {
    it("should create a new instance for a cwd", () => {
      const service = GitSubscriptionPool.getInstance();
      const api = service.acquire("/test/project");

      expect(api).toBeDefined();
      expect(api.cwd).toBe("/test/project");
    });

    it("should return the same instance for the same cwd", () => {
      const service = GitSubscriptionPool.getInstance();
      const api1 = service.acquire("/test/project");
      const api2 = service.acquire("/test/project");

      expect(api1).toBe(api2);
    });

    it("should return different instances for different cwds", () => {
      const service = GitSubscriptionPool.getInstance();
      const api1 = service.acquire("/project/a");
      const api2 = service.acquire("/project/b");

      expect(api1).not.toBe(api2);
      expect(api1.cwd).toBe("/project/a");
      expect(api2.cwd).toBe("/project/b");
    });

    it("should increment refCount on each acquire", () => {
      const service = GitSubscriptionPool.getInstance();

      service.acquire("/test/project");
      expect(service.getRefCount("/test/project")).toBe(1);

      service.acquire("/test/project");
      expect(service.getRefCount("/test/project")).toBe(2);

      service.acquire("/test/project");
      expect(service.getRefCount("/test/project")).toBe(3);
    });

    it("should cancel a pending suspension when re-acquired", () => {
      const service = GitSubscriptionPool.getInstance();
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
      const service = GitSubscriptionPool.getInstance();

      service.acquire("/test/project");
      service.acquire("/test/project");
      expect(service.getRefCount("/test/project")).toBe(2);

      service.release("/test/project");
      expect(service.getRefCount("/test/project")).toBe(1);

      service.release("/test/project");
      expect(service.getRefCount("/test/project")).toBe(0);
    });

    it("should handle release of non-existent cwd gracefully", () => {
      const service = GitSubscriptionPool.getInstance();

      // Should not throw
      expect(() => {
        service.release("/non/existent");
      }).not.toThrow();
    });

    it("should suspend the instance once it's gone unheld for the grace period", () => {
      const service = GitSubscriptionPool.getInstance();
      const api = service.acquire("/test/project");

      service.release("/test/project");

      // Still watching during grace period
      expect(isSuspended(api)).toBe(false);

      // Fast forward past grace period (5 seconds)
      vi.advanceTimersByTime(5000);

      // Suspended, but kept rather than released
      expect(service.hasInstance("/test/project")).toBe(true);
      expect(isSuspended(api)).toBe(true);
      expect(isReleased(api)).toBe(false);
    });

    it("should not suspend the instance if re-acquired during grace period", () => {
      const service = GitSubscriptionPool.getInstance();
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
  });

  // ===========================================================================
  // Path Normalization
  // ===========================================================================

  describe("path normalization", () => {
    it("should normalize paths with trailing slashes", () => {
      const service = GitSubscriptionPool.getInstance();

      const api1 = service.acquire("/test/project/");
      const api2 = service.acquire("/test/project");

      expect(api1).toBe(api2);
    });

    it("should normalize paths with multiple trailing slashes", () => {
      const service = GitSubscriptionPool.getInstance();

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
      const service = GitSubscriptionPool.getInstance();

      const api1 = service.acquire("/project/a");
      const api2 = service.acquire("/project/b");

      GitSubscriptionPool.resetInstance();

      expect(isReleased(api1)).toBe(true);
      expect(isReleased(api2)).toBe(true);
    });

    it("should clear all pending suspensions on reset", () => {
      const service = GitSubscriptionPool.getInstance();

      const api = service.acquire("/test/project");
      service.release("/test/project");

      // Reset before it suspends
      GitSubscriptionPool.resetInstance();

      // Fast forward past grace period
      vi.advanceTimersByTime(10000);

      // API should have been released during reset, not by timer
      expect(isReleased(api)).toBe(true);
    });
  });
});
