import { describe, it, expect, vi } from "vitest";
import {
  findProjectRoot,
  findTsConfig,
  parseTsConfig,
  type FileSystemApi,
} from "../../../../../../src/renderer/components/panes/editor/monaco/tsconfigResolver";

// Mock FileSystemApi for testing
function createMockApi(existingPaths: Set<string>): FileSystemApi {
  // Normalize paths in the set to handle different separators
  const normalizedPaths = new Set(
    Array.from(existingPaths).map((p) => p.replace(/[\/\\]+/g, "/")),
  );

  return {
    fileExists: vi.fn(async (path: string) => {
      const normalized = path.replace(/[\/\\]+/g, "/");
      return normalizedPaths.has(normalized);
    }),
    readFile: vi.fn(async (path: string) => {
      const normalized = path.replace(/[\/\\]+/g, "/");
      if (!normalizedPaths.has(normalized)) {
        throw new Error(`File not found: ${path}`);
      }
      // Return mock tsconfig content
      return JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "ESNext",
          strict: true,
        },
      });
    }),
  };
}

describe("tsconfigResolver", () => {
  describe("findProjectRoot", () => {
    it("should find project root with .git", async () => {
      const existingPaths = new Set(["/home/user/project/.git"]);
      const api = createMockApi(existingPaths);

      const result = await findProjectRoot(
        "/home/user/project/src/nested",
        api,
      );

      expect(result).toBe("/home/user/project");
    });

    it("should find project root with package.json", async () => {
      const existingPaths = new Set(["/home/user/project/package.json"]);
      const api = createMockApi(existingPaths);

      const result = await findProjectRoot(
        "/home/user/project/src/components",
        api,
      );

      expect(result).toBe("/home/user/project");
    });

    it("should find project root with .vscode", async () => {
      const existingPaths = new Set(["/home/user/project/.vscode"]);
      const api = createMockApi(existingPaths);

      const result = await findProjectRoot("/home/user/project/src", api);

      expect(result).toBe("/home/user/project");
    });

    it("should find project root with .idea", async () => {
      const existingPaths = new Set(["/home/user/project/.idea"]);
      const api = createMockApi(existingPaths);

      const result = await findProjectRoot("/home/user/project/src", api);

      expect(result).toBe("/home/user/project");
    });

    it("should return startDir when no project root found", async () => {
      const existingPaths = new Set<string>();
      const api = createMockApi(existingPaths);

      const result = await findProjectRoot("/home/user/random", api);

      expect(result).toBe("/home/user/random");
    });

    it("should stop after max levels up", async () => {
      // No project indicators exist
      const existingPaths = new Set<string>();
      const api = createMockApi(existingPaths);

      const deepPath = "/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q/r/s/t/u/v/w/x/y/z";
      const result = await findProjectRoot(deepPath, api);

      // Should return the start directory since it didn't find any indicators
      expect(result).toBe(deepPath);
    });

    it("should handle Windows paths", async () => {
      const existingPaths = new Set(["C:\\Users\\user\\project\\.git"]);
      const api = createMockApi(existingPaths);

      const result = await findProjectRoot(
        "C:\\Users\\user\\project\\src\\nested",
        api,
      );

      expect(result).toBe("C:\\Users\\user\\project");
    });

    it("should find closest project root when nested", async () => {
      const existingPaths = new Set([
        "/home/user/monorepo/.git",
        "/home/user/monorepo/packages/app/package.json",
      ]);
      const api = createMockApi(existingPaths);

      const result = await findProjectRoot(
        "/home/user/monorepo/packages/app/src",
        api,
      );

      // Should find the closest one (packages/app)
      expect(result).toBe("/home/user/monorepo/packages/app");
    });
  });

  describe("findTsConfig", () => {
    it("should find tsconfig.json in the same directory", async () => {
      const existingPaths = new Set([
        "/home/user/project/.git",
        "/home/user/project/tsconfig.json",
      ]);
      const api = createMockApi(existingPaths);

      const result = await findTsConfig("/home/user/project", api);

      expect(result).toBe("/home/user/project/tsconfig.json");
    });

    it("should find tsconfig.json in parent directory", async () => {
      const existingPaths = new Set([
        "/home/user/project/.git",
        "/home/user/project/tsconfig.json",
      ]);
      const api = createMockApi(existingPaths);

      const result = await findTsConfig("/home/user/project/src/nested", api);

      expect(result).toBe("/home/user/project/tsconfig.json");
    });

    it("should stop search at project root", async () => {
      const existingPaths = new Set([
        "/home/user/project/.git",
        "/home/tsconfig.json", // This should NOT be found
      ]);
      const api = createMockApi(existingPaths);

      const result = await findTsConfig("/home/user/project/src", api);

      expect(result).toBeNull();
    });

    it("should return null when no tsconfig found", async () => {
      const existingPaths = new Set(["/home/user/project/.git"]);
      const api = createMockApi(existingPaths);

      const result = await findTsConfig("/home/user/project/src", api);

      expect(result).toBeNull();
    });

    it("should handle Windows paths", async () => {
      const existingPaths = new Set([
        "C:\\Users\\user\\project\\.git",
        "C:\\Users\\user\\project\\tsconfig.json",
      ]);
      const api = createMockApi(existingPaths);

      const result = await findTsConfig(
        "C:\\Users\\user\\project\\src\\components",
        api,
      );

      expect(result).toBe("C:\\Users\\user\\project\\tsconfig.json");
    });

    it("should find tsconfig in nested monorepo structure", async () => {
      const existingPaths = new Set([
        "/home/user/monorepo/.git",
        "/home/user/monorepo/packages/app/.vscode",
        "/home/user/monorepo/packages/app/tsconfig.json",
      ]);
      const api = createMockApi(existingPaths);

      const result = await findTsConfig(
        "/home/user/monorepo/packages/app/src/components",
        api,
      );

      expect(result).toBe("/home/user/monorepo/packages/app/tsconfig.json");
    });

    it("should prefer closest tsconfig when multiple exist", async () => {
      const existingPaths = new Set([
        "/home/user/project/.git",
        "/home/user/project/tsconfig.json",
        "/home/user/project/src/tsconfig.json",
      ]);
      const api = createMockApi(existingPaths);

      const result = await findTsConfig("/home/user/project/src/nested", api);

      // Should find the closest one
      expect(result).toBe("/home/user/project/src/tsconfig.json");
    });

    it("should handle mixed path separators", async () => {
      const existingPaths = new Set([
        "/home/user/project/.git",
        "/home/user/project/tsconfig.json",
      ]);
      const api = createMockApi(existingPaths);

      // Mixed separators should be normalized
      const result = await findTsConfig("/home/user/project/src\\nested", api);

      expect(result).toBe("/home/user/project/tsconfig.json");
    });
  });

  describe("parseTsConfig", () => {
    it("should parse valid tsconfig content", () => {
      const content = JSON.stringify({
        compilerOptions: {
          target: "ES2020",
          module: "ESNext",
          strict: true,
        },
      });

      const result = parseTsConfig(content);

      expect(result).toEqual({
        target: "ES2020",
        module: "ESNext",
        strict: true,
      });
    });

    it("should return empty object when compilerOptions missing", () => {
      const content = JSON.stringify({
        extends: "./base.json",
      });

      const result = parseTsConfig(content);

      expect(result).toEqual({});
    });

    it("should throw on invalid JSON", () => {
      const content = "{ invalid json }";

      expect(() => parseTsConfig(content)).toThrow();
    });

    it("should throw on empty content", () => {
      const content = "";

      expect(() => parseTsConfig(content)).toThrow();
    });

    it("should extract compilerOptions from complex config", () => {
      const content = JSON.stringify({
        extends: "./base.json",
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM"],
          jsx: "react-jsx",
          moduleResolution: "bundler",
        },
        include: ["src/**/*"],
        exclude: ["node_modules"],
      });

      const result = parseTsConfig(content);

      expect(result).toEqual({
        target: "ES2022",
        lib: ["ES2022", "DOM"],
        jsx: "react-jsx",
        moduleResolution: "bundler",
      });
    });
  });

  describe("integration scenarios", () => {
    it("should handle typical React project structure", async () => {
      const existingPaths = new Set([
        "/Users/dev/my-app/.git",
        "/Users/dev/my-app/package.json",
        "/Users/dev/my-app/tsconfig.json",
      ]);
      const api = createMockApi(existingPaths);

      const result = await findTsConfig(
        "/Users/dev/my-app/src/components/Button",
        api,
      );

      expect(result).toBe("/Users/dev/my-app/tsconfig.json");
    });

    it("should handle monorepo with multiple tsconfigs", async () => {
      const existingPaths = new Set([
        "/workspace/monorepo/.git",
        "/workspace/monorepo/tsconfig.base.json",
        "/workspace/monorepo/apps/web/.vscode",
        "/workspace/monorepo/apps/web/tsconfig.json",
        "/workspace/monorepo/packages/ui/package.json",
        "/workspace/monorepo/packages/ui/tsconfig.json",
      ]);
      const api = createMockApi(existingPaths);

      // Should find the web app's tsconfig
      const webResult = await findTsConfig(
        "/workspace/monorepo/apps/web/src/pages",
        api,
      );
      expect(webResult).toBe("/workspace/monorepo/apps/web/tsconfig.json");

      // Should find the UI package's tsconfig
      const uiResult = await findTsConfig(
        "/workspace/monorepo/packages/ui/src/components",
        api,
      );
      expect(uiResult).toBe("/workspace/monorepo/packages/ui/tsconfig.json");
    });

    it("should handle Windows development environment", async () => {
      const existingPaths = new Set([
        "C:\\Dev\\MyProject\\.git",
        "C:\\Dev\\MyProject\\tsconfig.json",
      ]);
      const api = createMockApi(existingPaths);

      const result = await findTsConfig(
        "C:\\Dev\\MyProject\\src\\features\\auth",
        api,
      );

      expect(result).toBe("C:\\Dev\\MyProject\\tsconfig.json");
    });
  });
});
