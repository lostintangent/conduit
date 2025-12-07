/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { usePackageJsonScripts } from "@/hooks/usePackageJsonScripts";

// Mock window.conduit
const mockReadFile = vi.fn();
global.window = {
  conduit: {
    fsv2: {
      readFile: mockReadFile,
    },
  },
} as any;

describe("usePackageJsonScripts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return null when no cwd provided", async () => {
    const { result } = renderHook(() => usePackageJsonScripts(undefined));

    // Wait a bit for the effect to run
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.loading).toBe(false);
    expect(result.current.scripts).toBeUndefined();
    expect(result.current.packageJsonPath).toBeUndefined();
  });

  it("should find and parse package.json in current directory", async () => {
    const mockPackageJson = {
      name: "test-project",
      scripts: {
        start: "node index.js",
        test: "vitest",
        build: "tsc",
      },
    };

    mockReadFile.mockResolvedValue(
      new TextEncoder().encode(JSON.stringify(mockPackageJson)),
    );

    const { result } = renderHook(() =>
      usePackageJsonScripts("/path/to/project"),
    );

    // Wait for async operation
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.loading).toBe(false);
    expect(result.current.scripts).toEqual(mockPackageJson.scripts);
    expect(result.current.packageJsonPath).toBe(
      "/path/to/project/package.json",
    );
  });

  it("should search parent directories when not found in current", async () => {
    // First call fails (not in current dir)
    mockReadFile.mockRejectedValueOnce(new Error("File not found"));

    // Second call succeeds (found in parent)
    const mockPackageJson = {
      scripts: {
        dev: "npm run watch",
      },
    };
    mockReadFile.mockResolvedValueOnce(
      new TextEncoder().encode(JSON.stringify(mockPackageJson)),
    );

    const { result } = renderHook(() =>
      usePackageJsonScripts("/path/to/project/subdir"),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.loading).toBe(false);
    expect(result.current.scripts).toEqual(mockPackageJson.scripts);
  });

  it("should return null when package.json not found", async () => {
    mockReadFile.mockRejectedValue(new Error("File not found"));

    const { result } = renderHook(() =>
      usePackageJsonScripts("/path/to/project"),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.loading).toBe(false);
    expect(result.current.scripts).toBeUndefined();
    expect(result.current.packageJsonPath).toBeUndefined();
  });

  it("should return null when package.json has no scripts", async () => {
    const mockPackageJson = {
      name: "test-project",
      version: "1.0.0",
    };

    mockReadFile.mockResolvedValue(
      new TextEncoder().encode(JSON.stringify(mockPackageJson)),
    );

    const { result } = renderHook(() =>
      usePackageJsonScripts("/path/to/project"),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.loading).toBe(false);
    expect(result.current.scripts).toBeUndefined();
  });

  it("should handle invalid JSON gracefully", async () => {
    mockReadFile.mockResolvedValue(
      new TextEncoder().encode("{ invalid json }"),
    );

    const { result } = renderHook(() =>
      usePackageJsonScripts("/path/to/project"),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(result.current.loading).toBe(false);
    expect(result.current.scripts).toBeUndefined();
  });
});
