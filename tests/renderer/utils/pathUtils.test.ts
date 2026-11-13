/**
 * pathUtils Tests
 *
 * Conduit is macOS-only, so paths are compared case-insensitively.
 */

import { describe, it, expect } from "vitest";

import { normalizePathForKey, pathsEqual } from "@/utils/pathUtils";

describe("pathUtils", () => {
  describe("normalizePathForKey", () => {
    it("should lowercase paths", () => {
      expect(normalizePathForKey("/Users/Test/Project")).toBe(
        "/users/test/project",
      );
    });

    it("should handle mixed case paths", () => {
      expect(normalizePathForKey("/Foo/BAR/baz")).toBe("/foo/bar/baz");
    });

    it("should handle already lowercase paths", () => {
      expect(normalizePathForKey("/foo/bar")).toBe("/foo/bar");
    });

    it("should handle empty string", () => {
      expect(normalizePathForKey("")).toBe("");
    });
  });

  describe("pathsEqual", () => {
    it("should return true for same path with different casing", () => {
      expect(pathsEqual("/Users/Test/Project", "/users/test/project")).toBe(
        true,
      );
    });

    it("should return true for identical paths", () => {
      expect(pathsEqual("/Users/Test/Project", "/Users/Test/Project")).toBe(
        true,
      );
    });

    it("should return false for different paths", () => {
      expect(pathsEqual("/foo/bar", "/foo/baz")).toBe(false);
    });

    it("should return true when both paths are null", () => {
      expect(pathsEqual(null, null)).toBe(true);
    });

    it("should return true when both paths are undefined", () => {
      expect(pathsEqual(undefined, undefined)).toBe(true);
    });

    it("should return false when one path is null and other is string", () => {
      expect(pathsEqual(null, "/foo")).toBe(false);
      expect(pathsEqual("/foo", null)).toBe(false);
    });

    it("should return false when one path is undefined and other is string", () => {
      expect(pathsEqual(undefined, "/foo")).toBe(false);
      expect(pathsEqual("/foo", undefined)).toBe(false);
    });

    it("should NOT treat null and undefined as equal (strict equality)", () => {
      // null === undefined is false in JavaScript
      expect(pathsEqual(null, undefined)).toBe(false);
      expect(pathsEqual(undefined, null)).toBe(false);
    });
  });
});
