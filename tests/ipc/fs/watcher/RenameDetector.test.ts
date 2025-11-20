import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { RenameDetector } from "../../../../src/ipc/fs/watcher/RenameDetector";

describe("RenameDetector", () => {
  let detector: RenameDetector;

  beforeEach(() => {
    vi.useFakeTimers();
    detector = new RenameDetector();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("recordUnlink()", () => {
    it("should record a file deletion", () => {
      detector.recordUnlink("/test/path/file.txt");

      // Verify by checking if detectRenameFromCreate can find it
      const renamed = detector.detectRenameFromCreate("/test/path/renamed.txt");
      expect(renamed).toBe("/test/path/file.txt");
    });

    it("should auto-cleanup after 500ms", () => {
      detector.recordUnlink("/test/path/file.txt");

      // Advance time past the cleanup threshold
      vi.advanceTimersByTime(500);

      // Should no longer detect rename
      const renamed = detector.detectRenameFromCreate("/test/path/renamed.txt");
      expect(renamed).toBeNull();
    });
  });

  describe("detectRenameFromCreate()", () => {
    it("should detect rename in same directory within time window", () => {
      detector.recordUnlink("/test/path/old-name.txt");

      // Advance time but stay within 500ms window
      vi.advanceTimersByTime(100);

      const renamed = detector.detectRenameFromCreate(
        "/test/path/new-name.txt",
      );
      expect(renamed).toBe("/test/path/old-name.txt");
    });

    it("should not detect rename if files are in different directories", () => {
      detector.recordUnlink("/test/path/dir1/file.txt");

      vi.advanceTimersByTime(100);

      const renamed = detector.detectRenameFromCreate(
        "/test/path/dir2/file.txt",
      );
      expect(renamed).toBeNull();
    });

    it("should not detect rename if events are more than 500ms apart", () => {
      detector.recordUnlink("/test/path/old-name.txt");

      // Advance time beyond the 500ms window
      vi.advanceTimersByTime(600);

      const renamed = detector.detectRenameFromCreate(
        "/test/path/new-name.txt",
      );
      expect(renamed).toBeNull();
    });

    it("should remove tracking entry after successful rename detection", () => {
      detector.recordUnlink("/test/path/old-name.txt");

      // First detection should work
      const renamed1 = detector.detectRenameFromCreate(
        "/test/path/new-name.txt",
      );
      expect(renamed1).toBe("/test/path/old-name.txt");

      // Second detection should not find it (already consumed)
      const renamed2 = detector.detectRenameFromCreate(
        "/test/path/another-name.txt",
      );
      expect(renamed2).toBeNull();
    });

    it("should return null if no recent unlinks", () => {
      const renamed = detector.detectRenameFromCreate(
        "/test/path/new-file.txt",
      );
      expect(renamed).toBeNull();
    });

    it("should handle multiple unlinks and match correctly", () => {
      detector.recordUnlink("/test/path/file1.txt");
      detector.recordUnlink("/test/path/file2.txt");
      detector.recordUnlink("/test/other/file3.txt");

      vi.advanceTimersByTime(100);

      // Should match file1 (same directory)
      const renamed1 = detector.detectRenameFromCreate(
        "/test/path/renamed1.txt",
      );
      expect(renamed1).toBe("/test/path/file1.txt");

      // Should match file2 (file1 already consumed)
      const renamed2 = detector.detectRenameFromCreate(
        "/test/path/renamed2.txt",
      );
      expect(renamed2).toBe("/test/path/file2.txt");

      // Should not match file3 (different directory)
      const renamed3 = detector.detectRenameFromCreate(
        "/test/path/renamed3.txt",
      );
      expect(renamed3).toBeNull();
    });
  });

  describe("clear()", () => {
    it("should clear all tracked unlinks", () => {
      detector.recordUnlink("/test/path/file1.txt");
      detector.recordUnlink("/test/path/file2.txt");

      detector.clear();

      // Should not detect any renames after clear
      const renamed1 = detector.detectRenameFromCreate("/test/path/new1.txt");
      const renamed2 = detector.detectRenameFromCreate("/test/path/new2.txt");

      expect(renamed1).toBeNull();
      expect(renamed2).toBeNull();
    });

    it("should handle clearing when empty", () => {
      expect(() => {
        detector.clear();
      }).not.toThrow();
    });
  });

  describe("edge cases", () => {
    it("should handle paths with special characters", () => {
      detector.recordUnlink("/test/path/file with spaces.txt");

      vi.advanceTimersByTime(100);

      const renamed = detector.detectRenameFromCreate(
        "/test/path/renamed with spaces.txt",
      );
      expect(renamed).toBe("/test/path/file with spaces.txt");
    });

    it("should handle nested directory paths", () => {
      detector.recordUnlink("/test/path/deep/nested/dir/file.txt");

      vi.advanceTimersByTime(100);

      const renamed = detector.detectRenameFromCreate(
        "/test/path/deep/nested/dir/renamed.txt",
      );
      expect(renamed).toBe("/test/path/deep/nested/dir/file.txt");
    });

    it("should match first eligible unlink when multiple exist in same directory", () => {
      const now = Date.now();
      vi.setSystemTime(now);

      detector.recordUnlink("/test/path/file1.txt");

      vi.setSystemTime(now + 100);
      detector.recordUnlink("/test/path/file2.txt");

      vi.setSystemTime(now + 200);

      // Should match file1 (oldest in same directory)
      const renamed = detector.detectRenameFromCreate("/test/path/renamed.txt");
      expect(renamed).toBe("/test/path/file1.txt");
    });
  });
});
