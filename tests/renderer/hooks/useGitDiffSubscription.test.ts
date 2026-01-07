/**
 * @vitest-environment jsdom
 */
import { renderHook, act, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

const createMockGit = () => ({
  whenReady: vi.fn().mockResolvedValue(undefined),
  onStatusChanged: vi.fn().mockReturnValue(vi.fn()),
});

const createMockFs = () => ({
  onAnyFileContentChanged: vi.fn().mockReturnValue(vi.fn()),
});

// ============================================================================
// Import after mocks
// ============================================================================

import { useGitDiffSubscription } from "../../../src/renderer/hooks/useGitDiffSubscription";
import type { GitV2API } from "../../../src/renderer/api/GitV2API";
import type { FileSystemV2API } from "../../../src/renderer/api/FileSystemV2API";

// ============================================================================
// Tests
// ============================================================================

describe("useGitDiffSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ===========================================================================
  // Initial Fetch
  // ===========================================================================

  describe("initial fetch", () => {
    it("should wait for git to be ready before fetching", async () => {
      const mockGit = createMockGit();
      const mockFs = createMockFs();
      const fetchStats = vi.fn().mockResolvedValue(undefined);

      renderHook(() =>
        useGitDiffSubscription(
          mockGit as unknown as GitV2API,
          mockFs as unknown as FileSystemV2API,
          fetchStats,
        ),
      );

      // whenReady should be called
      expect(mockGit.whenReady).toHaveBeenCalled();

      // Wait for the async init
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // fetchStats should be called after whenReady resolves
      expect(fetchStats).toHaveBeenCalled();
    });

    it("should not fetch if cancelled before ready", async () => {
      let resolveReady: () => void;
      const mockGit = createMockGit();
      mockGit.whenReady.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveReady = resolve;
          }),
      );
      const mockFs = createMockFs();
      const fetchStats = vi.fn().mockResolvedValue(undefined);

      const { unmount } = renderHook(() =>
        useGitDiffSubscription(
          mockGit as unknown as GitV2API,
          mockFs as unknown as FileSystemV2API,
          fetchStats,
        ),
      );

      // Unmount before ready resolves
      unmount();

      // Now resolve ready
      await act(async () => {
        resolveReady!();
        await vi.runAllTimersAsync();
      });

      // fetchStats should NOT have been called (cancelled)
      expect(fetchStats).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Git Status Changes
  // ===========================================================================

  describe("git status changes", () => {
    it("should subscribe to git status changes", async () => {
      const mockGit = createMockGit();
      const mockFs = createMockFs();
      const fetchStats = vi.fn().mockResolvedValue(undefined);

      renderHook(() =>
        useGitDiffSubscription(
          mockGit as unknown as GitV2API,
          mockFs as unknown as FileSystemV2API,
          fetchStats,
        ),
      );

      expect(mockGit.onStatusChanged).toHaveBeenCalled();
    });

    it("should fetch stats immediately on git status change", async () => {
      const mockGit = createMockGit();
      let statusChangeHandler: (event: unknown) => void;
      mockGit.onStatusChanged.mockImplementation(
        (handler: (event: unknown) => void) => {
          statusChangeHandler = handler;
          return vi.fn();
        },
      );

      const mockFs = createMockFs();
      const fetchStats = vi.fn().mockResolvedValue(undefined);

      renderHook(() =>
        useGitDiffSubscription(
          mockGit as unknown as GitV2API,
          mockFs as unknown as FileSystemV2API,
          fetchStats,
        ),
      );

      // Wait for initial fetch
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const initialCallCount = fetchStats.mock.calls.length;

      // Trigger status change
      act(() => {
        statusChangeHandler!({});
      });

      // Should fetch immediately (no debounce)
      expect(fetchStats).toHaveBeenCalledTimes(initialCallCount + 1);
    });

    it("should pass event to fetchStats on git status change", async () => {
      const mockGit = createMockGit();
      let statusChangeHandler: (event: unknown) => void;
      mockGit.onStatusChanged.mockImplementation(
        (handler: (event: unknown) => void) => {
          statusChangeHandler = handler;
          return vi.fn();
        },
      );

      const mockFs = createMockFs();
      const fetchStats = vi.fn().mockResolvedValue(undefined);

      renderHook(() =>
        useGitDiffSubscription(
          mockGit as unknown as GitV2API,
          mockFs as unknown as FileSystemV2API,
          fetchStats,
        ),
      );

      // Wait for initial fetch
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Create mock event with status.files
      const mockEvent = {
        status: {
          files: new Map([
            ["src/file.ts", { status: "modified", staged: false }],
          ]),
        },
      };

      // Trigger status change with event
      act(() => {
        statusChangeHandler!(mockEvent);
      });

      // fetchStats should have been called with the event
      const lastCall = fetchStats.mock.calls[fetchStats.mock.calls.length - 1];
      expect(lastCall[0]).toBe(mockEvent);
    });

    it("should not fetch on status change if cancelled", async () => {
      const mockGit = createMockGit();
      let statusChangeHandler: (event: unknown) => void;
      mockGit.onStatusChanged.mockImplementation(
        (handler: (event: unknown) => void) => {
          statusChangeHandler = handler;
          return vi.fn();
        },
      );

      const mockFs = createMockFs();
      const fetchStats = vi.fn().mockResolvedValue(undefined);

      const { unmount } = renderHook(() =>
        useGitDiffSubscription(
          mockGit as unknown as GitV2API,
          mockFs as unknown as FileSystemV2API,
          fetchStats,
        ),
      );

      // Wait for initial fetch
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const callCountBeforeUnmount = fetchStats.mock.calls.length;

      // Unmount
      unmount();

      // Trigger status change after unmount
      act(() => {
        statusChangeHandler!({});
      });

      // Should NOT have been called again
      expect(fetchStats).toHaveBeenCalledTimes(callCountBeforeUnmount);
    });

    it("should not pass event on file content change (debounced)", async () => {
      const mockGit = createMockGit();
      let fileChangeHandler: () => void;
      const mockFs = createMockFs();
      mockFs.onAnyFileContentChanged.mockImplementation(
        (handler: () => void) => {
          fileChangeHandler = handler;
          return vi.fn();
        },
      );

      const fetchStats = vi.fn().mockResolvedValue(undefined);

      renderHook(() =>
        useGitDiffSubscription(
          mockGit as unknown as GitV2API,
          mockFs as unknown as FileSystemV2API,
          fetchStats,
        ),
      );

      // Wait for initial fetch
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Trigger file content change
      act(() => {
        fileChangeHandler!();
      });

      // Advance past debounce
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      // fetchStats should have been called without event (undefined)
      const lastCall = fetchStats.mock.calls[fetchStats.mock.calls.length - 1];
      expect(lastCall[0]).toBeUndefined();
    });
  });

  // ===========================================================================
  // File Content Changes (Debounced)
  // ===========================================================================

  describe("file content changes", () => {
    it("should subscribe to file content changes", async () => {
      const mockGit = createMockGit();
      const mockFs = createMockFs();
      const fetchStats = vi.fn().mockResolvedValue(undefined);

      renderHook(() =>
        useGitDiffSubscription(
          mockGit as unknown as GitV2API,
          mockFs as unknown as FileSystemV2API,
          fetchStats,
        ),
      );

      expect(mockFs.onAnyFileContentChanged).toHaveBeenCalled();
    });

    it("should debounce file content changes", async () => {
      const mockGit = createMockGit();
      let fileChangeHandler: () => void;
      const mockFs = createMockFs();
      mockFs.onAnyFileContentChanged.mockImplementation(
        (handler: () => void) => {
          fileChangeHandler = handler;
          return vi.fn();
        },
      );

      const fetchStats = vi.fn().mockResolvedValue(undefined);

      renderHook(() =>
        useGitDiffSubscription(
          mockGit as unknown as GitV2API,
          mockFs as unknown as FileSystemV2API,
          fetchStats,
        ),
      );

      // Wait for initial fetch
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const initialCallCount = fetchStats.mock.calls.length;

      // Trigger multiple rapid file changes
      act(() => {
        fileChangeHandler!();
        fileChangeHandler!();
        fileChangeHandler!();
      });

      // Should not have fetched yet (debouncing)
      expect(fetchStats).toHaveBeenCalledTimes(initialCallCount);

      // Advance timers past debounce delay (300ms)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      // Now should have fetched once (debounced)
      expect(fetchStats).toHaveBeenCalledTimes(initialCallCount + 1);
    });

    it("should reset debounce timer on each file change", async () => {
      const mockGit = createMockGit();
      let fileChangeHandler: () => void;
      const mockFs = createMockFs();
      mockFs.onAnyFileContentChanged.mockImplementation(
        (handler: () => void) => {
          fileChangeHandler = handler;
          return vi.fn();
        },
      );

      const fetchStats = vi.fn().mockResolvedValue(undefined);

      renderHook(() =>
        useGitDiffSubscription(
          mockGit as unknown as GitV2API,
          mockFs as unknown as FileSystemV2API,
          fetchStats,
        ),
      );

      // Wait for initial fetch
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const initialCallCount = fetchStats.mock.calls.length;

      // Trigger file change
      act(() => {
        fileChangeHandler!();
      });

      // Advance 200ms (not yet at 300ms threshold)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      // Trigger another change (should reset timer)
      act(() => {
        fileChangeHandler!();
      });

      // Advance another 200ms (total 400ms from first, 200ms from second)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      // Should not have fetched yet (timer was reset)
      expect(fetchStats).toHaveBeenCalledTimes(initialCallCount);

      // Advance final 100ms (now 300ms from second change)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Now should have fetched
      expect(fetchStats).toHaveBeenCalledTimes(initialCallCount + 1);
    });

    it("should handle missing onAnyFileContentChanged", async () => {
      const mockGit = createMockGit();
      const mockFs = {
        // No onAnyFileContentChanged method
      };
      const fetchStats = vi.fn().mockResolvedValue(undefined);

      // Should not throw
      renderHook(() =>
        useGitDiffSubscription(
          mockGit as unknown as GitV2API,
          mockFs as unknown as FileSystemV2API,
          fetchStats,
        ),
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      // Initial fetch should still work
      expect(fetchStats).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Cleanup
  // ===========================================================================

  describe("cleanup", () => {
    it("should cleanup git status subscription on unmount", async () => {
      const mockGit = createMockGit();
      const cleanupGitStatus = vi.fn();
      mockGit.onStatusChanged.mockReturnValue(cleanupGitStatus);

      const mockFs = createMockFs();
      const fetchStats = vi.fn().mockResolvedValue(undefined);

      const { unmount } = renderHook(() =>
        useGitDiffSubscription(
          mockGit as unknown as GitV2API,
          mockFs as unknown as FileSystemV2API,
          fetchStats,
        ),
      );

      unmount();

      expect(cleanupGitStatus).toHaveBeenCalled();
    });

    it("should cleanup file content subscription on unmount", async () => {
      const mockGit = createMockGit();
      const mockFs = createMockFs();
      const cleanupFileContent = vi.fn();
      mockFs.onAnyFileContentChanged.mockReturnValue(cleanupFileContent);

      const fetchStats = vi.fn().mockResolvedValue(undefined);

      const { unmount } = renderHook(() =>
        useGitDiffSubscription(
          mockGit as unknown as GitV2API,
          mockFs as unknown as FileSystemV2API,
          fetchStats,
        ),
      );

      unmount();

      expect(cleanupFileContent).toHaveBeenCalled();
    });

    it("should clear pending debounce timer on unmount", async () => {
      const mockGit = createMockGit();
      let fileChangeHandler: () => void;
      const mockFs = createMockFs();
      mockFs.onAnyFileContentChanged.mockImplementation(
        (handler: () => void) => {
          fileChangeHandler = handler;
          return vi.fn();
        },
      );

      const fetchStats = vi.fn().mockResolvedValue(undefined);

      const { unmount } = renderHook(() =>
        useGitDiffSubscription(
          mockGit as unknown as GitV2API,
          mockFs as unknown as FileSystemV2API,
          fetchStats,
        ),
      );

      // Wait for initial fetch
      await act(async () => {
        await vi.runAllTimersAsync();
      });

      const callCountAfterInit = fetchStats.mock.calls.length;

      // Trigger file change (starts debounce timer)
      act(() => {
        fileChangeHandler!();
      });

      // Unmount before debounce completes
      unmount();

      // Advance past debounce delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      // Should NOT have fetched (timer was cleared)
      expect(fetchStats).toHaveBeenCalledTimes(callCountAfterInit);
    });
  });
});
