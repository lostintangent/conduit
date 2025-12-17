/**
 * Tests for useFollowMode hook.
 */

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useFollowMode } from "@/components/panes/editor-v2/components/ChangesReviewPane/hooks/useFollowMode";

describe("useFollowMode", () => {
  describe("initial state", () => {
    it("should start with no unseen files", () => {
      const { result } = renderHook(() => useFollowMode());

      expect(result.current.unseenCount).toBe(0);
    });

    it("should return false for isUnseen on unknown files", () => {
      const { result } = renderHook(() => useFollowMode());

      expect(result.current.isUnseen("unknown.ts")).toBe(false);
    });

    it("should return null for getTimestamp on unknown files", () => {
      const { result } = renderHook(() => useFollowMode());

      expect(result.current.getTimestamp("unknown.ts")).toBeNull();
    });
  });

  describe("initializeFiles", () => {
    it("should initialize files as seen", () => {
      const { result } = renderHook(() => useFollowMode());

      act(() => {
        result.current.initializeFiles(["file1.ts", "file2.ts"]);
      });

      expect(result.current.isUnseen("file1.ts")).toBe(false);
      expect(result.current.isUnseen("file2.ts")).toBe(false);
      expect(result.current.unseenCount).toBe(0);
    });

    it("should not set timestamps for initialized files without timestamp map", () => {
      const { result } = renderHook(() => useFollowMode());

      act(() => {
        result.current.initializeFiles(["file1.ts"]);
      });

      // Initial files have null timestamp when no timestamp map provided
      expect(result.current.getTimestamp("file1.ts")).toBeNull();
    });

    it("should set timestamps from provided timestamp map", () => {
      const { result } = renderHook(() => useFollowMode());

      const timestampMap = new Map<string, number>();
      timestampMap.set("file1.ts", 1700000000000);
      timestampMap.set("file2.ts", 1700000001000);

      act(() => {
        result.current.initializeFiles(["file1.ts", "file2.ts"], timestampMap);
      });

      expect(result.current.getTimestamp("file1.ts")).toBe(1700000000000);
      expect(result.current.getTimestamp("file2.ts")).toBe(1700000001000);
    });

    it("should only initialize once", () => {
      const { result } = renderHook(() => useFollowMode());

      act(() => {
        result.current.initializeFiles(["file1.ts"]);
      });

      // First file is tracked (seen, no timestamp)
      expect(result.current.isUnseen("file1.ts")).toBe(false);

      // Second call should be ignored
      act(() => {
        result.current.initializeFiles(["file2.ts"]);
      });

      // file1.ts still tracked, file2.ts not tracked
      expect(result.current.isUnseen("file1.ts")).toBe(false);
      expect(result.current.getTimestamp("file2.ts")).toBeNull();
    });
  });

  describe("processStatusChange", () => {
    it("should mark changed files as unseen", () => {
      const { result } = renderHook(() => useFollowMode());

      act(() => {
        result.current.processStatusChange(["file1.ts", "file2.ts"]);
      });

      expect(result.current.isUnseen("file1.ts")).toBe(true);
      expect(result.current.isUnseen("file2.ts")).toBe(true);
      expect(result.current.unseenCount).toBe(2);
    });

    it("should set timestamps when files change", () => {
      const { result } = renderHook(() => useFollowMode());

      act(() => {
        result.current.initializeFiles(["file1.ts"]);
      });

      // Initial files have no timestamp
      expect(result.current.getTimestamp("file1.ts")).toBeNull();

      // Process a change - should set timestamp
      act(() => {
        result.current.processStatusChange(["file1.ts"]);
      });

      // Now it should have a timestamp
      expect(result.current.getTimestamp("file1.ts")).toBeTypeOf("number");
    });

    it("should call expandFile callback for previously seen files", () => {
      const { result } = renderHook(() => useFollowMode());
      const expandFile = vi.fn();

      // Initialize file as seen
      act(() => {
        result.current.initializeFiles(["file1.ts"]);
      });

      // Process change should call expandFile
      act(() => {
        result.current.processStatusChange(["file1.ts"], expandFile);
      });

      expect(expandFile).toHaveBeenCalledWith("file1.ts");
    });

    it("should not call expandFile for new files", () => {
      const { result } = renderHook(() => useFollowMode());
      const expandFile = vi.fn();

      act(() => {
        result.current.processStatusChange(["newfile.ts"], expandFile);
      });

      expect(expandFile).not.toHaveBeenCalled();
    });
  });

  describe("markSeen", () => {
    it("should mark a file as seen", () => {
      const { result } = renderHook(() => useFollowMode());

      act(() => {
        result.current.processStatusChange(["file1.ts"]);
      });

      expect(result.current.isUnseen("file1.ts")).toBe(true);

      act(() => {
        result.current.markSeen("file1.ts");
      });

      expect(result.current.isUnseen("file1.ts")).toBe(false);
      expect(result.current.unseenCount).toBe(0);
    });

    it("should not affect other files", () => {
      const { result } = renderHook(() => useFollowMode());

      act(() => {
        result.current.processStatusChange(["file1.ts", "file2.ts"]);
      });

      act(() => {
        result.current.markSeen("file1.ts");
      });

      expect(result.current.isUnseen("file1.ts")).toBe(false);
      expect(result.current.isUnseen("file2.ts")).toBe(true);
      expect(result.current.unseenCount).toBe(1);
    });
  });

  describe("markAllSeen", () => {
    it("should mark all files as seen", () => {
      const { result } = renderHook(() => useFollowMode());

      act(() => {
        result.current.processStatusChange([
          "file1.ts",
          "file2.ts",
          "file3.ts",
        ]);
      });

      expect(result.current.unseenCount).toBe(3);

      act(() => {
        result.current.markAllSeen();
      });

      expect(result.current.isUnseen("file1.ts")).toBe(false);
      expect(result.current.isUnseen("file2.ts")).toBe(false);
      expect(result.current.isUnseen("file3.ts")).toBe(false);
      expect(result.current.unseenCount).toBe(0);
    });
  });

  describe("getUnseenCount", () => {
    it("should return count for specific paths", () => {
      const { result } = renderHook(() => useFollowMode());

      act(() => {
        result.current.processStatusChange([
          "file1.ts",
          "file2.ts",
          "file3.ts",
        ]);
      });

      expect(result.current.getUnseenCount(["file1.ts", "file2.ts"])).toBe(2);
      expect(result.current.getUnseenCount(["file1.ts"])).toBe(1);
      expect(result.current.getUnseenCount(["other.ts"])).toBe(0);
    });

    it("should return total count when no paths provided", () => {
      const { result } = renderHook(() => useFollowMode());

      act(() => {
        result.current.processStatusChange(["file1.ts", "file2.ts"]);
      });

      expect(result.current.getUnseenCount()).toBe(2);
    });
  });

  describe("sortByTimestamp", () => {
    it("should sort files by timestamp (most recent first)", () => {
      const { result } = renderHook(() => useFollowMode());

      vi.useFakeTimers();

      // Add files at different times
      act(() => {
        result.current.processStatusChange(["older.ts"]);
      });

      vi.advanceTimersByTime(100);

      act(() => {
        result.current.processStatusChange(["newer.ts"]);
      });

      vi.useRealTimers();

      const files: Array<[string, unknown]> = [
        ["older.ts", {}],
        ["newer.ts", {}],
      ];

      const sorted = result.current.sortByTimestamp(files);

      expect(sorted[0][0]).toBe("newer.ts");
      expect(sorted[1][0]).toBe("older.ts");
    });

    it("should sort alphabetically for same timestamp", () => {
      const { result } = renderHook(() => useFollowMode());

      // Add files at same time
      act(() => {
        result.current.processStatusChange(["b.ts", "a.ts"]);
      });

      const files: Array<[string, unknown]> = [
        ["b.ts", {}],
        ["a.ts", {}],
      ];

      const sorted = result.current.sortByTimestamp(files);

      expect(sorted[0][0]).toBe("a.ts");
      expect(sorted[1][0]).toBe("b.ts");
    });

    it("should sort files without timestamps to the end", () => {
      const { result } = renderHook(() => useFollowMode());

      act(() => {
        result.current.processStatusChange(["tracked.ts"]);
      });

      const files: Array<[string, unknown]> = [
        ["untracked.ts", {}],
        ["tracked.ts", {}],
      ];

      const sorted = result.current.sortByTimestamp(files);

      expect(sorted[0][0]).toBe("tracked.ts");
      expect(sorted[1][0]).toBe("untracked.ts");
    });
  });

  describe("reset", () => {
    it("should clear all tracking data", () => {
      const { result } = renderHook(() => useFollowMode());

      act(() => {
        result.current.processStatusChange(["file1.ts", "file2.ts"]);
      });

      expect(result.current.unseenCount).toBe(2);

      act(() => {
        result.current.reset();
      });

      expect(result.current.unseenCount).toBe(0);
      expect(result.current.getTimestamp("file1.ts")).toBeNull();
    });
  });
});
