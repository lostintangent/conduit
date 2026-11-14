/**
 * Tests for useUnseenTracking hook.
 */

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DISABLED_UNSEEN_TRACKING,
  useUnseenTracking,
} from "@/components/panes/editor/hooks/useUnseenTracking";

// Mock filesystem API with capturable callbacks
let fileContentChangedCallback: ((path: string) => void) | null = null;

vi.mock("@features/files/client/FileSystemSubscriptionPool", () => ({
  FileSystemSubscriptionPool: {
    getInstance: () => ({
      acquire: () => ({
        onAnyFileContentChanged: (callback: (path: string) => void) => {
          fileContentChangedCallback = callback;
          return () => {
            fileContentChangedCallback = null;
          };
        },
      }),
      release: () => {},
    }),
  },
}));

// Helper to trigger filesystem change events in tests
function triggerFileChange(fullPath: string) {
  fileContentChangedCallback?.(fullPath);
}

// Mock git API
function createMockGit() {
  const statusCallbacks: Array<
    (event: { status: unknown; added: string[]; modified: string[] }) => void
  > = [];
  return {
    onStatusChanged: (
      callback: (event: {
        status: unknown;
        added: string[];
        modified: string[];
      }) => void,
    ) => {
      statusCallbacks.push(callback);
      return () => {
        const index = statusCallbacks.indexOf(callback);
        if (index > -1) statusCallbacks.splice(index, 1);
      };
    },
    // Helper to trigger status change in tests
    _triggerStatusChange: (event: {
      status: unknown;
      added: string[];
      modified: string[];
    }) => {
      statusCallbacks.forEach((cb) => cb(event));
    },
  };
}

describe("useUnseenTracking", () => {
  describe("DISABLED_UNSEEN_TRACKING", () => {
    it("should have no-op functions that don't throw", () => {
      expect(DISABLED_UNSEEN_TRACKING.isUnseen("any")).toBe(false);
      expect(DISABLED_UNSEEN_TRACKING.getTimestamp("any")).toBeNull();
      expect(DISABLED_UNSEEN_TRACKING.unseenCount).toBe(0);
      expect(DISABLED_UNSEEN_TRACKING.getUnseenCount()).toBe(0);
      expect(() => DISABLED_UNSEEN_TRACKING.markSeen("any")).not.toThrow();
      expect(() => DISABLED_UNSEEN_TRACKING.markAllSeen()).not.toThrow();
    });

    it("should return files unchanged from sortByTimestamp", () => {
      const files: Array<[string, { status: string }]> = [
        ["a.ts", { status: "modified" }],
        ["b.ts", { status: "modified" }],
      ];
      expect(DISABLED_UNSEEN_TRACKING.sortByTimestamp(files)).toBe(files);
    });
  });

  describe("when disabled", () => {
    let mockGit: ReturnType<typeof createMockGit>;

    beforeEach(() => {
      mockGit = createMockGit();
    });

    it("should return disabled tracking when enabled is false", () => {
      const { result } = renderHook(() =>
        useUnseenTracking({
          git: mockGit as any,
          cwd: "/test",
          enabled: false,
          currentlyOpenFile: null,
          gitChangedFiles: new Set(),
        }),
      );

      expect(result.current.isUnseen("any")).toBe(false);
      expect(result.current.unseenCount).toBe(0);
    });
  });

  describe("when enabled", () => {
    let mockGit: ReturnType<typeof createMockGit>;

    beforeEach(() => {
      mockGit = createMockGit();
    });

    it("should start with no unseen files", () => {
      const { result } = renderHook(() =>
        useUnseenTracking({
          git: mockGit as any,
          cwd: "/test",
          enabled: true,
          currentlyOpenFile: null,
          gitChangedFiles: new Set(),
        }),
      );

      expect(result.current.unseenCount).toBe(0);
    });

    it("should mark new files as unseen when git status changes", () => {
      const { result } = renderHook(() =>
        useUnseenTracking({
          git: mockGit as any,
          cwd: "/test",
          enabled: true,
          currentlyOpenFile: null,
          gitChangedFiles: new Set(),
        }),
      );

      act(() => {
        mockGit._triggerStatusChange({
          status: null,
          added: ["new-file.ts"],
          modified: [],
        });
      });

      expect(result.current.isUnseen("new-file.ts")).toBe(true);
      expect(result.current.unseenCount).toBe(1);
    });

    it("should NOT mark currently open file as unseen", () => {
      const { result } = renderHook(() =>
        useUnseenTracking({
          git: mockGit as any,
          cwd: "/test",
          enabled: true,
          currentlyOpenFile: "open-file.ts",
          gitChangedFiles: new Set(),
        }),
      );

      act(() => {
        mockGit._triggerStatusChange({
          status: null,
          added: ["open-file.ts", "other-file.ts"],
          modified: [],
        });
      });

      // Open file should NOT be marked unseen
      expect(result.current.isUnseen("open-file.ts")).toBe(false);
      // Other file should be marked unseen
      expect(result.current.isUnseen("other-file.ts")).toBe(true);
      expect(result.current.unseenCount).toBe(1);
    });

    it("should mark file as seen when markSeen is called", () => {
      const { result } = renderHook(() =>
        useUnseenTracking({
          git: mockGit as any,
          cwd: "/test",
          enabled: true,
          currentlyOpenFile: null,
          gitChangedFiles: new Set(),
        }),
      );

      // First, add a file as unseen
      act(() => {
        mockGit._triggerStatusChange({
          status: null,
          added: ["file.ts"],
          modified: [],
        });
      });

      expect(result.current.isUnseen("file.ts")).toBe(true);

      // Now mark it as seen
      act(() => {
        result.current.markSeen("file.ts");
      });

      expect(result.current.isUnseen("file.ts")).toBe(false);
    });

    it("should mark all files as seen when markAllSeen is called", () => {
      const { result } = renderHook(() =>
        useUnseenTracking({
          git: mockGit as any,
          cwd: "/test",
          enabled: true,
          currentlyOpenFile: null,
          gitChangedFiles: new Set(),
        }),
      );

      // Add multiple unseen files
      act(() => {
        mockGit._triggerStatusChange({
          status: null,
          added: ["file1.ts", "file2.ts", "file3.ts"],
          modified: [],
        });
      });

      expect(result.current.unseenCount).toBe(3);

      // Mark all as seen
      act(() => {
        result.current.markAllSeen();
      });

      expect(result.current.unseenCount).toBe(0);
      expect(result.current.isUnseen("file1.ts")).toBe(false);
      expect(result.current.isUnseen("file2.ts")).toBe(false);
      expect(result.current.isUnseen("file3.ts")).toBe(false);
    });

    it("should NOT mark modified files as unseen (only added)", () => {
      const { result } = renderHook(() =>
        useUnseenTracking({
          git: mockGit as any,
          cwd: "/test",
          enabled: true,
          currentlyOpenFile: null,
          gitChangedFiles: new Set(),
        }),
      );

      act(() => {
        mockGit._triggerStatusChange({
          status: null,
          added: [],
          modified: ["modified-file.ts"],
        });
      });

      // Modified files should NOT be marked unseen by git status changes
      // (they're handled by the filesystem watcher instead)
      expect(result.current.isUnseen("modified-file.ts")).toBe(false);
      expect(result.current.unseenCount).toBe(0);
    });
  });

  describe("filesystem watcher", () => {
    let mockGit: ReturnType<typeof createMockGit>;

    beforeEach(() => {
      mockGit = createMockGit();
      fileContentChangedCallback = null;
    });

    it("should mark file as unseen when filesystem reports a change for a git-tracked file", () => {
      const gitChangedFiles = new Set(["src/file.ts"]);

      const { result } = renderHook(() =>
        useUnseenTracking({
          git: mockGit as any,
          cwd: "/project",
          enabled: true,
          currentlyOpenFile: null,
          gitChangedFiles,
        }),
      );

      expect(result.current.unseenCount).toBe(0);

      // Simulate filesystem change event
      act(() => {
        triggerFileChange("/project/src/file.ts");
      });

      expect(result.current.isUnseen("src/file.ts")).toBe(true);
      expect(result.current.unseenCount).toBe(1);
    });

    it("should NOT mark file as unseen if not in gitChangedFiles", () => {
      const gitChangedFiles = new Set(["src/tracked.ts"]);

      const { result } = renderHook(() =>
        useUnseenTracking({
          git: mockGit as any,
          cwd: "/project",
          enabled: true,
          currentlyOpenFile: null,
          gitChangedFiles,
        }),
      );

      // Trigger change for an untracked file
      act(() => {
        triggerFileChange("/project/src/untracked.ts");
      });

      expect(result.current.isUnseen("src/untracked.ts")).toBe(false);
      expect(result.current.unseenCount).toBe(0);
    });

    it("should NOT mark currently open file as unseen from filesystem events", () => {
      const gitChangedFiles = new Set(["src/open-file.ts"]);

      const { result } = renderHook(() =>
        useUnseenTracking({
          git: mockGit as any,
          cwd: "/project",
          enabled: true,
          currentlyOpenFile: "src/open-file.ts",
          gitChangedFiles,
        }),
      );

      // Trigger change for the currently open file
      act(() => {
        triggerFileChange("/project/src/open-file.ts");
      });

      // Should NOT be marked unseen since user is already viewing it
      expect(result.current.isUnseen("src/open-file.ts")).toBe(false);
      expect(result.current.unseenCount).toBe(0);
    });

    it("should handle case-insensitive path matching on macOS", async () => {
      // Mock normalizePathForKey to simulate macOS case-insensitive behavior
      const pathUtils = await import("@/utils/pathUtils");
      const originalNormalize = pathUtils.normalizePathForKey;
      vi.spyOn(pathUtils, "normalizePathForKey").mockImplementation(
        (path: string) => path.toLowerCase(),
      );

      // gitChangedFiles has mixed case path (from git)
      const gitChangedFiles = new Set(["src/MyFile.ts"]);

      const { result } = renderHook(() =>
        useUnseenTracking({
          git: mockGit as any,
          cwd: "/Users/Test/Project",
          enabled: true,
          currentlyOpenFile: null,
          gitChangedFiles,
        }),
      );

      // Filesystem event comes with lowercase path (common on macOS)
      act(() => {
        triggerFileChange("/users/test/project/src/myfile.ts");
      });

      // Should still match and mark as unseen (using the original git path)
      expect(result.current.isUnseen("src/MyFile.ts")).toBe(true);
      expect(result.current.unseenCount).toBe(1);

      // Restore original
      vi.mocked(pathUtils.normalizePathForKey).mockImplementation(
        originalNormalize,
      );
    });

    it("should ignore files outside the cwd", () => {
      const gitChangedFiles = new Set(["src/file.ts"]);

      const { result } = renderHook(() =>
        useUnseenTracking({
          git: mockGit as any,
          cwd: "/project",
          enabled: true,
          currentlyOpenFile: null,
          gitChangedFiles,
        }),
      );

      // Trigger change for a file outside cwd
      act(() => {
        triggerFileChange("/other-project/src/file.ts");
      });

      expect(result.current.unseenCount).toBe(0);
    });
  });
});
