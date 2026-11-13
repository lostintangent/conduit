/**
 * Path Utilities Tests
 *
 * Tests for case-insensitive path handling on macOS.
 */

import { describe, expect, it } from "vitest";
import {
  isPathOutside,
  normalizePathForComparison,
  pathEquals,
  pathStartsWith,
  safeRelativePath,
} from "../../../src/ipc/fs/pathUtils";

describe("pathUtils", () => {
  describe("normalizePathForComparison", () => {
    it("should lowercase the path on case-insensitive systems", () => {
      expect(normalizePathForComparison("/Users/Foo/Project")).toBe(
        "/users/foo/project",
      );
    });
  });

  describe("pathEquals", () => {
    it("should match identical paths", () => {
      expect(pathEquals("/users/foo/project", "/users/foo/project")).toBe(true);
    });

    it("should match paths with different case on case-insensitive systems", () => {
      expect(pathEquals("/Users/Foo/Project", "/users/foo/project")).toBe(true);
      expect(pathEquals("/users/foo/project", "/Users/Foo/Project")).toBe(true);
      expect(pathEquals("/USERS/FOO/PROJECT", "/users/foo/project")).toBe(true);
    });

    it("should not match different paths", () => {
      expect(pathEquals("/users/foo/project", "/users/bar/project")).toBe(
        false,
      );
    });
  });

  describe("pathStartsWith", () => {
    it("should match exact paths regardless of case on case-insensitive systems", () => {
      expect(pathStartsWith("/Users/Foo/Project", "/users/foo/project")).toBe(
        true,
      );
      expect(pathStartsWith("/users/foo/project", "/Users/Foo/Project")).toBe(
        true,
      );
    });

    it("should match child paths", () => {
      expect(
        pathStartsWith("/Users/Foo/Project/src", "/users/foo/project"),
      ).toBe(true);
    });

    it("should not match partial directory names", () => {
      // /project-old should not match prefix /project
      expect(
        pathStartsWith("/users/foo/project-old", "/users/foo/project"),
      ).toBe(false);
    });

    it("should not match unrelated paths", () => {
      expect(pathStartsWith("/users/bar/project", "/users/foo/project")).toBe(
        false,
      );
    });
  });

  describe("safeRelativePath", () => {
    it("should return relative path for child directories", () => {
      // Case difference should not matter
      const result = safeRelativePath(
        "/Users/Foo/Project",
        "/users/foo/project/src",
      );
      expect(result).toBe("src");
    });

    it("should return '..' for parent directories", () => {
      const result = safeRelativePath("/users/foo/project/src", "/users/foo");
      expect(result.startsWith("..")).toBe(true);
    });

    it("should return empty string for same path with different case", () => {
      const result = safeRelativePath(
        "/Users/Foo/Project",
        "/users/foo/project",
      );
      expect(result).toBe("");
    });
  });

  describe("isPathOutside", () => {
    it("should return true for paths starting with '..'", () => {
      expect(isPathOutside("..")).toBe(true);
      expect(isPathOutside("../foo")).toBe(true);
      expect(isPathOutside("../../bar")).toBe(true);
    });

    it("should return false for paths not starting with '..'", () => {
      expect(isPathOutside("")).toBe(false);
      expect(isPathOutside("foo")).toBe(false);
      expect(isPathOutside("foo/bar")).toBe(false);
      expect(isPathOutside("./foo")).toBe(false);
    });
  });
});
