/**
 * pathUtils Tests
 *
 * Tests for cross-platform path handling utilities.
 * These utilities handle case sensitivity differences between
 * macOS/Windows (case-insensitive) and Linux (case-sensitive).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ============================================================================
// Test Setup
// ============================================================================

// We need to test both case-sensitive and case-insensitive behavior.
// Since isCaseInsensitiveFs is computed at module load time, we need to
// mock navigator.platform before importing.

describe("pathUtils", () => {
  // ==========================================================================
  // Case-Insensitive Platform (macOS)
  // ==========================================================================

  describe("on case-insensitive platform (macOS)", () => {
    let pathUtils: typeof import("@/utils/pathUtils");

    beforeEach(async () => {
      // Mock navigator.platform to macOS
      vi.stubGlobal("navigator", { platform: "MacIntel" });

      // Clear module cache and re-import
      vi.resetModules();
      pathUtils = await import("@/utils/pathUtils");
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    describe("isCaseInsensitiveFs", () => {
      it("should be true on macOS", () => {
        expect(pathUtils.isCaseInsensitiveFs).toBe(true);
      });
    });

    describe("normalizePathForKey", () => {
      it("should lowercase paths", () => {
        expect(pathUtils.normalizePathForKey("/Users/Test/Project")).toBe(
          "/users/test/project",
        );
      });

      it("should handle mixed case paths", () => {
        expect(pathUtils.normalizePathForKey("/Foo/BAR/baz")).toBe(
          "/foo/bar/baz",
        );
      });

      it("should handle already lowercase paths", () => {
        expect(pathUtils.normalizePathForKey("/foo/bar")).toBe("/foo/bar");
      });

      it("should handle empty string", () => {
        expect(pathUtils.normalizePathForKey("")).toBe("");
      });
    });

    describe("pathsEqual", () => {
      it("should return true for same path with different casing", () => {
        expect(
          pathUtils.pathsEqual("/Users/Test/Project", "/users/test/project"),
        ).toBe(true);
      });

      it("should return true for identical paths", () => {
        expect(
          pathUtils.pathsEqual("/Users/Test/Project", "/Users/Test/Project"),
        ).toBe(true);
      });

      it("should return false for different paths", () => {
        expect(pathUtils.pathsEqual("/foo/bar", "/foo/baz")).toBe(false);
      });

      it("should return true when both paths are null", () => {
        expect(pathUtils.pathsEqual(null, null)).toBe(true);
      });

      it("should return true when both paths are undefined", () => {
        expect(pathUtils.pathsEqual(undefined, undefined)).toBe(true);
      });

      it("should return false when one path is null and other is string", () => {
        expect(pathUtils.pathsEqual(null, "/foo")).toBe(false);
        expect(pathUtils.pathsEqual("/foo", null)).toBe(false);
      });

      it("should return false when one path is undefined and other is string", () => {
        expect(pathUtils.pathsEqual(undefined, "/foo")).toBe(false);
        expect(pathUtils.pathsEqual("/foo", undefined)).toBe(false);
      });

      it("should NOT treat null and undefined as equal (strict equality)", () => {
        // null === undefined is false in JavaScript
        expect(pathUtils.pathsEqual(null, undefined)).toBe(false);
        expect(pathUtils.pathsEqual(undefined, null)).toBe(false);
      });
    });
  });

  // ==========================================================================
  // Case-Insensitive Platform (Windows)
  // ==========================================================================

  describe("on case-insensitive platform (Windows)", () => {
    let pathUtils: typeof import("@/utils/pathUtils");

    beforeEach(async () => {
      // Mock navigator.platform to Windows
      vi.stubGlobal("navigator", { platform: "Win32" });

      // Clear module cache and re-import
      vi.resetModules();
      pathUtils = await import("@/utils/pathUtils");
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    describe("isCaseInsensitiveFs", () => {
      it("should be true on Windows", () => {
        expect(pathUtils.isCaseInsensitiveFs).toBe(true);
      });
    });

    describe("normalizePathForKey", () => {
      it("should lowercase paths", () => {
        expect(pathUtils.normalizePathForKey("C:\\Users\\Test")).toBe(
          "c:\\users\\test",
        );
      });
    });

    describe("pathsEqual", () => {
      it("should return true for same path with different casing", () => {
        expect(pathUtils.pathsEqual("C:\\Users\\Test", "c:\\users\\test")).toBe(
          true,
        );
      });
    });
  });

  // ==========================================================================
  // Case-Sensitive Platform (Linux)
  // ==========================================================================

  describe("on case-sensitive platform (Linux)", () => {
    let pathUtils: typeof import("@/utils/pathUtils");

    beforeEach(async () => {
      // Mock navigator.platform to Linux
      vi.stubGlobal("navigator", { platform: "Linux x86_64" });

      // Clear module cache and re-import
      vi.resetModules();
      pathUtils = await import("@/utils/pathUtils");
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    describe("isCaseInsensitiveFs", () => {
      it("should be false on Linux", () => {
        expect(pathUtils.isCaseInsensitiveFs).toBe(false);
      });
    });

    describe("normalizePathForKey", () => {
      it("should preserve case on Linux", () => {
        expect(pathUtils.normalizePathForKey("/home/User/Project")).toBe(
          "/home/User/Project",
        );
      });

      it("should preserve mixed case", () => {
        expect(pathUtils.normalizePathForKey("/Foo/BAR/baz")).toBe(
          "/Foo/BAR/baz",
        );
      });
    });

    describe("pathsEqual", () => {
      it("should return false for same path with different casing", () => {
        expect(
          pathUtils.pathsEqual("/home/User/Project", "/home/user/project"),
        ).toBe(false);
      });

      it("should return true for identical paths", () => {
        expect(
          pathUtils.pathsEqual("/home/User/Project", "/home/User/Project"),
        ).toBe(true);
      });

      it("should return false for different paths", () => {
        expect(pathUtils.pathsEqual("/foo/bar", "/foo/baz")).toBe(false);
      });

      it("should handle null/undefined correctly", () => {
        expect(pathUtils.pathsEqual(null, null)).toBe(true);
        expect(pathUtils.pathsEqual(null, "/foo")).toBe(false);
      });
    });
  });
});
