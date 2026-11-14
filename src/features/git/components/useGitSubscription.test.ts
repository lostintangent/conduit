import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

// Use vi.hoisted to define mocks before imports
const { MockGitSubscription, mockService, mockServiceInstance } = vi.hoisted(
  () => {
    // Track instances for verification
    const instances = new Map<
      string,
      { cwd: string; released: boolean; refCount: number }
    >();

    // Create a mock class that tracks instances
    class MockAPI {
      readonly cwd: string;
      private _released = false;

      constructor(cwd: string) {
        this.cwd = cwd;
      }

      release(): void {
        if (this._released) return;
        this._released = true;
        const entry = instances.get(this.cwd);
        if (entry) {
          entry.released = true;
        }
      }

      get isReleased(): boolean {
        return this._released;
      }
    }

    // Mock service instance
    const serviceInstance = {
      get: vi.fn((cwd: string) => {
        let entry = instances.get(cwd);
        if (!entry) {
          const api = new MockAPI(cwd);
          entry = { cwd, released: false, refCount: 0 };
          instances.set(cwd, entry);
          (entry as any).api = api;
        }
        return (entry as any).api;
      }),
      acquire: vi.fn((cwd: string) => {
        const api = serviceInstance.get(cwd);
        instances.get(cwd)!.refCount++;
        return api;
      }),
      release: vi.fn((cwd: string) => {
        const entry = instances.get(cwd);
        if (entry) {
          entry.refCount--;
        }
      }),
      getRefCount: vi.fn((cwd: string) => {
        return instances.get(cwd)?.refCount ?? 0;
      }),
      hasInstance: vi.fn((cwd: string) => {
        return instances.has(cwd);
      }),
      getStats: vi.fn(() => ({
        instanceCount: instances.size,
        totalRefCount: Array.from(instances.values()).reduce(
          (sum, e) => sum + e.refCount,
          0,
        ),
      })),
    };

    // Mock service class
    const service = {
      getInstance: vi.fn(() => serviceInstance),
      resetInstance: vi.fn(() => {
        instances.clear();
      }),
    };

    return {
      MockGitSubscription: MockAPI,
      mockService: service,
      mockServiceInstance: serviceInstance,
      getInstances: () => instances,
      clearInstances: () => {
        instances.clear();
      },
    };
  },
);

// Mock the GitSubscription class
vi.mock("../client/GitSubscription", () => ({
  GitSubscription: MockGitSubscription,
}));

// Mock the GitSubscriptionPool
vi.mock("../client/GitSubscriptionPool", () => ({
  GitSubscriptionPool: mockService,
}));

// Import after mocks are set up
import { useGitSubscription } from "./useGitSubscription";

// ============================================================================
// Tests
// ============================================================================

describe("useGitSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockService.resetInstance();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Basic Functionality
  // ===========================================================================

  describe("basic functionality", () => {
    it("should return a GitSubscription instance", () => {
      const { result } = renderHook(() => useGitSubscription("/test/project"));

      expect(result.current).toBeDefined();
      expect(result.current.cwd).toBe("/test/project");
    });

    it("should acquire instance from service", () => {
      renderHook(() => useGitSubscription("/test/project"));

      expect(mockServiceInstance.acquire).toHaveBeenCalledWith("/test/project");
    });

    it("should return the same instance on re-renders with same cwd", () => {
      const { result, rerender } = renderHook(() =>
        useGitSubscription("/test/project"),
      );

      const firstInstance = result.current;
      rerender();
      const secondInstance = result.current;

      expect(firstInstance).toBe(secondInstance);
      // Should only acquire once
      expect(mockServiceInstance.acquire).toHaveBeenCalledTimes(1);
    });

    it("should not be released initially", () => {
      const { result } = renderHook(() => useGitSubscription("/test/project"));

      expect(
        (result.current as unknown as InstanceType<typeof MockGitSubscription>)
          .isReleased,
      ).toBe(false);
    });
  });

  // ===========================================================================
  // CWD Changes
  // ===========================================================================

  describe("cwd changes", () => {
    it("should create new instance when cwd changes", () => {
      const { result, rerender } = renderHook(
        ({ cwd }) => useGitSubscription(cwd),
        {
          initialProps: { cwd: "/project/a" },
        },
      );

      const firstInstance = result.current;
      expect(firstInstance.cwd).toBe("/project/a");

      rerender({ cwd: "/project/b" });

      const secondInstance = result.current;
      expect(secondInstance.cwd).toBe("/project/b");
      expect(firstInstance).not.toBe(secondInstance);
    });

    it("should release old cwd via service when cwd changes", () => {
      const { rerender } = renderHook(({ cwd }) => useGitSubscription(cwd), {
        initialProps: { cwd: "/project/a" },
      });

      rerender({ cwd: "/project/b" });

      // Service should have been called to release the old cwd
      expect(mockServiceInstance.release).toHaveBeenCalledWith("/project/a");
      // And acquire the new cwd
      expect(mockServiceInstance.acquire).toHaveBeenCalledWith("/project/b");
    });

    it("should keep same instance when cwd stays the same", () => {
      const { result, rerender } = renderHook(
        ({ cwd }) => useGitSubscription(cwd),
        {
          initialProps: { cwd: "/project/a" },
        },
      );

      const firstInstance = result.current;

      // Rerender with same cwd
      rerender({ cwd: "/project/a" });

      expect(result.current).toBe(firstInstance);
      // Should not have released
      expect(mockServiceInstance.release).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Unmount Cleanup
  // ===========================================================================

  describe("unmount cleanup", () => {
    it("should release via service on unmount", () => {
      const { unmount } = renderHook(() => useGitSubscription("/test/project"));

      unmount();

      expect(mockServiceInstance.release).toHaveBeenCalledWith("/test/project");
    });

    it("should handle multiple CWD changes then unmount", () => {
      const { rerender, unmount } = renderHook(
        ({ cwd }) => useGitSubscription(cwd),
        {
          initialProps: { cwd: "/project/a" },
        },
      );

      rerender({ cwd: "/project/b" });
      rerender({ cwd: "/project/c" });

      // First two should have been released from CWD changes
      expect(mockServiceInstance.release).toHaveBeenCalledWith("/project/a");
      expect(mockServiceInstance.release).toHaveBeenCalledWith("/project/b");

      unmount();

      // The last cwd should be released on unmount
      expect(mockServiceInstance.release).toHaveBeenCalledWith("/project/c");
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("edge cases", () => {
    it("should handle empty string cwd", () => {
      const { result } = renderHook(() => useGitSubscription(""));

      expect(result.current).toBeDefined();
      expect(result.current.cwd).toBe("");
    });

    it("should handle paths with special characters", () => {
      const { result } = renderHook(() =>
        useGitSubscription("/path/with spaces/and-dashes/and_underscores"),
      );

      expect(result.current.cwd).toBe(
        "/path/with spaces/and-dashes/and_underscores",
      );
    });

    it("should normalize paths with trailing slashes", () => {
      const { result, rerender } = renderHook(
        ({ cwd }) => useGitSubscription(cwd),
        {
          initialProps: { cwd: "/project/foo/" },
        },
      );

      const firstInstance = result.current;

      // Rerender with same path but without trailing slash
      rerender({ cwd: "/project/foo" });

      // Should be the same instance (no release/acquire)
      expect(result.current).toBe(firstInstance);
      expect(mockServiceInstance.release).not.toHaveBeenCalled();
      expect(mockServiceInstance.acquire).toHaveBeenCalledTimes(1);
    });

    it("should normalize paths with multiple trailing slashes", () => {
      const { result, rerender } = renderHook(
        ({ cwd }) => useGitSubscription(cwd),
        {
          initialProps: { cwd: "/project/foo///" },
        },
      );

      const firstInstance = result.current;

      // Rerender with normalized path
      rerender({ cwd: "/project/foo" });

      // Should be the same instance
      expect(result.current).toBe(firstInstance);
      expect(mockServiceInstance.release).not.toHaveBeenCalled();
    });

    it("should handle rapid CWD changes", () => {
      const { rerender, unmount } = renderHook(
        ({ cwd }) => useGitSubscription(cwd),
        {
          initialProps: { cwd: "/project/1" },
        },
      );

      for (let i = 2; i <= 10; i++) {
        rerender({ cwd: `/project/${i}` });
      }

      // All previous cwds should have been released
      for (let i = 1; i < 10; i++) {
        expect(mockServiceInstance.release).toHaveBeenCalledWith(
          `/project/${i}`,
        );
      }

      unmount();

      // Final cwd should be released on unmount
      expect(mockServiceInstance.release).toHaveBeenCalledWith("/project/10");
    });
  });
});
