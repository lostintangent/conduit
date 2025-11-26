/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

// ============================================================================
// Mocks
// ============================================================================

// Use vi.hoisted to define mocks before imports
const { mockGitv2, MockGitV2API } = vi.hoisted(() => {
  // Mock window.conduit.gitv2
  const gitv2 = {
    getStatus: vi.fn(),
    getFileStatus: vi.fn(),
    isDirty: vi.fn(),
    hasUnpushed: vi.fn(),
    getDiff: vi.fn(),
    getFileAtRef: vi.fn(),
    stage: vi.fn(),
    unstage: vi.fn(),
    commit: vi.fn(),
    getCurrentBranch: vi.fn(),
    getBranches: vi.fn(),
    checkout: vi.fn(),
    findRoot: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    release: vi.fn(),
    onStatusChanged: vi.fn(() => vi.fn()),
    onBranchChanged: vi.fn(() => vi.fn()),
    onCommitCreated: vi.fn(() => vi.fn()),
    onHeadChanged: vi.fn(() => vi.fn()),
  };

  // Set up window.conduit
  (globalThis as any).window = (globalThis as any).window || {};
  (globalThis as any).window.conduit = { gitv2 };

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
    }

    get isReleased(): boolean {
      return this._released;
    }
  }

  return {
    mockGitv2: gitv2,
    MockGitV2API: MockAPI,
  };
});

// Mock the GitV2API class
vi.mock("../../../src/renderer/api/GitV2API", () => ({
  GitV2API: MockGitV2API,
}));

// Import after mocks are set up
import { useGitV2 } from "../../../src/renderer/hooks/useGitV2";

// ============================================================================
// Tests
// ============================================================================

describe("useGitV2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset window.conduit
    (globalThis as any).window.conduit = { gitv2: mockGitv2 };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // Basic Functionality
  // ===========================================================================

  describe("basic functionality", () => {
    it("should return a GitV2API instance", () => {
      const { result } = renderHook(() => useGitV2("/test/project"));

      expect(result.current).toBeDefined();
      expect(result.current.cwd).toBe("/test/project");
    });

    it("should return the same instance on re-renders with same cwd", () => {
      const { result, rerender } = renderHook(() => useGitV2("/test/project"));

      const firstInstance = result.current;
      rerender();
      const secondInstance = result.current;

      expect(firstInstance).toBe(secondInstance);
    });

    it("should not be released initially", () => {
      const { result } = renderHook(() => useGitV2("/test/project"));

      expect(result.current.isReleased).toBe(false);
    });
  });

  // ===========================================================================
  // CWD Changes
  // ===========================================================================

  describe("cwd changes", () => {
    it("should create new instance when cwd changes", () => {
      const { result, rerender } = renderHook(({ cwd }) => useGitV2(cwd), {
        initialProps: { cwd: "/project/a" },
      });

      const firstInstance = result.current;
      expect(firstInstance.cwd).toBe("/project/a");

      rerender({ cwd: "/project/b" });

      const secondInstance = result.current;
      expect(secondInstance.cwd).toBe("/project/b");
      expect(firstInstance).not.toBe(secondInstance);
    });

    it("should release old instance when cwd changes", () => {
      const { result, rerender } = renderHook(({ cwd }) => useGitV2(cwd), {
        initialProps: { cwd: "/project/a" },
      });

      const firstInstance = result.current;

      rerender({ cwd: "/project/b" });

      // The old instance should be released
      expect(firstInstance.isReleased).toBe(true);
    });

    it("should keep same instance when cwd stays the same", () => {
      const { result, rerender } = renderHook(({ cwd }) => useGitV2(cwd), {
        initialProps: { cwd: "/project/a" },
      });

      const firstInstance = result.current;

      // Rerender with same cwd
      rerender({ cwd: "/project/a" });

      expect(result.current).toBe(firstInstance);
      expect(firstInstance.isReleased).toBe(false);
    });
  });

  // ===========================================================================
  // Unmount Cleanup
  // ===========================================================================

  describe("unmount cleanup", () => {
    it("should release instance on unmount", () => {
      const { result, unmount } = renderHook(() => useGitV2("/test/project"));

      const instance = result.current;
      expect(instance.isReleased).toBe(false);

      unmount();

      expect(instance.isReleased).toBe(true);
    });

    it("should handle multiple CWD changes then unmount", () => {
      const { result, rerender, unmount } = renderHook(
        ({ cwd }) => useGitV2(cwd),
        {
          initialProps: { cwd: "/project/a" },
        },
      );

      const firstInstance = result.current;

      rerender({ cwd: "/project/b" });
      const secondInstance = result.current;

      rerender({ cwd: "/project/c" });
      const thirdInstance = result.current;

      // First two should already be released from CWD changes
      expect(firstInstance.isReleased).toBe(true);
      expect(secondInstance.isReleased).toBe(true);
      expect(thirdInstance.isReleased).toBe(false);

      unmount();

      // Now all should be released
      expect(thirdInstance.isReleased).toBe(true);
    });
  });

  // ===========================================================================
  // Edge Cases
  // ===========================================================================

  describe("edge cases", () => {
    it("should handle empty string cwd", () => {
      const { result } = renderHook(() => useGitV2(""));

      expect(result.current).toBeDefined();
      expect(result.current.cwd).toBe("");
    });

    it("should handle paths with special characters", () => {
      const { result } = renderHook(() =>
        useGitV2("/path/with spaces/and-dashes/and_underscores"),
      );

      expect(result.current.cwd).toBe(
        "/path/with spaces/and-dashes/and_underscores",
      );
    });

    it("should handle rapid CWD changes", () => {
      const { result, rerender } = renderHook(({ cwd }) => useGitV2(cwd), {
        initialProps: { cwd: "/project/1" },
      });

      // Store references to actual instances (not snapshots)
      type Instance = ReturnType<typeof useGitV2>;
      const instances: Instance[] = [];
      instances.push(result.current);

      for (let i = 2; i <= 10; i++) {
        rerender({ cwd: `/project/${i}` });
        instances.push(result.current);
      }

      // All previous instances should be released
      for (let i = 0; i < instances.length - 1; i++) {
        expect(instances[i].isReleased).toBe(true);
      }

      // Current instance should not be released
      expect(result.current.isReleased).toBe(false);
    });
  });
});
