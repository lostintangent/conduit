import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getDefaultCompilerOptions,
  convertToMonacoOptions,
  loadTsConfigOptions,
  clearTsConfigCache,
  getCachedConfig,
  type FileSystemApi,
} from "../../../../../../src/renderer/components/panes/editor/monaco/tsconfigLoader";

// Mock Monaco TypeScript API
const createMockMonacoApi = () => ({
  ScriptTarget: {
    ES2020: 7,
    ES2022: 9,
  },
  ModuleKind: {
    ESNext: 99,
    CommonJS: 1,
  },
  ModuleResolutionKind: {
    NodeJs: 2,
    Bundler: 100,
  },
  JsxEmit: {
    ReactJSX: 4,
  },
});

// Mock FileSystemApi for testing
function createMockFileApi(existingPaths: Map<string, string>): FileSystemApi {
  // Normalize paths in the map to handle different separators
  const normalizedPaths = new Map<string, string>();
  for (const [path, content] of existingPaths.entries()) {
    const normalized = path.replace(/[\\/\\]+/g, "/");
    normalizedPaths.set(normalized, content);
  }

  return {
    fileExists: vi.fn(async (path: string) => {
      const normalized = path.replace(/[\\/\\]+/g, "/");
      return normalizedPaths.has(normalized);
    }),
    readFile: vi.fn(async (path: string) => {
      const normalized = path.replace(/[\\/\\]+/g, "/");
      const content = normalizedPaths.get(normalized);
      if (!content) {
        throw new Error(`File not found: ${path}`);
      }
      return content;
    }),
  };
}

describe("tsconfigLoader", () => {
  let monacoApi: ReturnType<typeof createMockMonacoApi>;

  beforeEach(() => {
    monacoApi = createMockMonacoApi();
    // Clear cache before each test
    clearTsConfigCache();
  });

  describe("getDefaultCompilerOptions", () => {
    it("should return default compiler options", () => {
      const defaults = getDefaultCompilerOptions(monacoApi);

      expect(defaults).toEqual({
        target: 7, // ES2020
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        module: 99, // ESNext
        moduleResolution: 2, // NodeJs
        jsx: 4, // ReactJSX
        esModuleInterop: true,
      });
    });

    it("should use Monaco API enum values", () => {
      const defaults = getDefaultCompilerOptions(monacoApi);

      expect(defaults.target).toBe(monacoApi.ScriptTarget.ES2020);
      expect(defaults.module).toBe(monacoApi.ModuleKind.ESNext);
      expect(defaults.moduleResolution).toBe(
        monacoApi.ModuleResolutionKind.NodeJs,
      );
      expect(defaults.jsx).toBe(monacoApi.JsxEmit.ReactJSX);
    });
  });

  describe("convertToMonacoOptions", () => {
    it("should pass through regular options unchanged", () => {
      const opts = {
        target: "ES2022",
        module: "ESNext",
        strict: true,
        esModuleInterop: true,
      };

      const result = convertToMonacoOptions(opts, monacoApi);

      expect(result).toEqual({
        target: "ES2022",
        module: "ESNext",
        strict: true,
        esModuleInterop: true,
        moduleResolution: undefined,
      });
    });

    it('should convert "bundler" moduleResolution to NodeJs', () => {
      const opts = {
        target: "ES2022",
        moduleResolution: "bundler",
      };

      const result = convertToMonacoOptions(opts, monacoApi);

      expect(result.moduleResolution).toBe(
        monacoApi.ModuleResolutionKind.NodeJs,
      );
    });

    it("should preserve non-bundler moduleResolution", () => {
      const opts = {
        target: "ES2022",
        moduleResolution: "node",
      };

      const result = convertToMonacoOptions(opts, monacoApi);

      expect(result.moduleResolution).toBe("node");
    });

    it("should handle complex tsconfig options", () => {
      const opts = {
        target: "ES2022",
        lib: ["ES2022", "DOM"],
        module: "ESNext",
        moduleResolution: "bundler",
        jsx: "react-jsx",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      };

      const result = convertToMonacoOptions(opts, monacoApi);

      expect(result).toMatchObject({
        target: "ES2022",
        lib: ["ES2022", "DOM"],
        module: "ESNext",
        moduleResolution: monacoApi.ModuleResolutionKind.NodeJs, // Converted from bundler
        jsx: "react-jsx",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      });
    });
  });

  describe("loadTsConfigOptions", () => {
    it("should load and parse valid tsconfig.json", async () => {
      const fileMap = new Map([
        ["/home/user/project/.git", ""],
        [
          "/home/user/project/tsconfig.json",
          JSON.stringify({
            compilerOptions: {
              target: "ES2022",
              module: "ESNext",
              strict: true,
            },
          }),
        ],
      ]);
      const api = createMockFileApi(fileMap);

      const result = await loadTsConfigOptions(
        "/home/user/project",
        api,
        monacoApi,
      );

      expect(result).toMatchObject({
        target: "ES2022",
        module: "ESNext",
        strict: true,
      });
    });

    it("should convert bundler moduleResolution when loading", async () => {
      const fileMap = new Map([
        ["/home/user/project/.git", ""],
        [
          "/home/user/project/tsconfig.json",
          JSON.stringify({
            compilerOptions: {
              target: "ES2022",
              moduleResolution: "bundler",
            },
          }),
        ],
      ]);
      const api = createMockFileApi(fileMap);

      const result = await loadTsConfigOptions(
        "/home/user/project",
        api,
        monacoApi,
      );

      expect(result.moduleResolution).toBe(
        monacoApi.ModuleResolutionKind.NodeJs,
      );
    });

    it("should return defaults when tsconfig.json not found", async () => {
      const fileMap = new Map([["/home/user/project/.git", ""]]);
      const api = createMockFileApi(fileMap);

      const result = await loadTsConfigOptions(
        "/home/user/project",
        api,
        monacoApi,
      );

      const expectedDefaults = getDefaultCompilerOptions(monacoApi);
      expect(result).toEqual(expectedDefaults);
    });

    it("should return defaults when tsconfig.json is invalid JSON", async () => {
      const fileMap = new Map([
        ["/home/user/project/.git", ""],
        ["/home/user/project/tsconfig.json", "{ invalid json }"],
      ]);
      const api = createMockFileApi(fileMap);

      const result = await loadTsConfigOptions(
        "/home/user/project",
        api,
        monacoApi,
      );

      const expectedDefaults = getDefaultCompilerOptions(monacoApi);
      expect(result).toEqual(expectedDefaults);
    });

    it("should handle tsconfig.json without compilerOptions", async () => {
      const fileMap = new Map([
        ["/home/user/project/.git", ""],
        [
          "/home/user/project/tsconfig.json",
          JSON.stringify({
            extends: "./base.json",
            include: ["src/**/*"],
          }),
        ],
      ]);
      const api = createMockFileApi(fileMap);

      const result = await loadTsConfigOptions(
        "/home/user/project",
        api,
        monacoApi,
      );

      // parseTsConfig returns {} when no compilerOptions
      // convertToMonacoOptions adds moduleResolution: undefined
      expect(result).toEqual({
        moduleResolution: undefined,
      });
    });

    it("should find tsconfig in parent directory", async () => {
      const fileMap = new Map([
        ["/home/user/project/.git", ""],
        [
          "/home/user/project/tsconfig.json",
          JSON.stringify({
            compilerOptions: {
              target: "ES2020",
              strict: true,
            },
          }),
        ],
      ]);
      const api = createMockFileApi(fileMap);

      const result = await loadTsConfigOptions(
        "/home/user/project/src/components",
        api,
        monacoApi,
      );

      expect(result).toMatchObject({
        target: "ES2020",
        strict: true,
      });
    });

    it("should handle monorepo with nested tsconfig", async () => {
      const fileMap = new Map([
        ["/workspace/monorepo/.git", ""],
        ["/workspace/monorepo/packages/app/.vscode", ""],
        [
          "/workspace/monorepo/packages/app/tsconfig.json",
          JSON.stringify({
            compilerOptions: {
              target: "ES2022",
              lib: ["ES2022", "DOM"],
              jsx: "react-jsx",
            },
          }),
        ],
      ]);
      const api = createMockFileApi(fileMap);

      const result = await loadTsConfigOptions(
        "/workspace/monorepo/packages/app/src",
        api,
        monacoApi,
      );

      expect(result).toMatchObject({
        target: "ES2022",
        lib: ["ES2022", "DOM"],
        jsx: "react-jsx",
      });
    });
  });

  describe("caching", () => {
    it("should cache loaded tsconfig options", async () => {
      const fileMap = new Map([
        ["/home/user/project/.git", ""],
        [
          "/home/user/project/tsconfig.json",
          JSON.stringify({
            compilerOptions: {
              target: "ES2022",
              strict: true,
            },
          }),
        ],
      ]);
      const api = createMockFileApi(fileMap);

      // First load
      await loadTsConfigOptions("/home/user/project", api, monacoApi);

      // Check cache
      const cached = getCachedConfig("/home/user/project");
      expect(cached).toBeDefined();
      expect(cached).toMatchObject({
        target: "ES2022",
        strict: true,
      });
    });

    it("should use cached config on subsequent calls", async () => {
      const fileMap = new Map([
        ["/home/user/project/.git", ""],
        [
          "/home/user/project/tsconfig.json",
          JSON.stringify({
            compilerOptions: {
              target: "ES2022",
              strict: true,
            },
          }),
        ],
      ]);
      const api = createMockFileApi(fileMap);

      // First load
      const result1 = await loadTsConfigOptions(
        "/home/user/project",
        api,
        monacoApi,
      );

      // Second load should use cache
      const result2 = await loadTsConfigOptions(
        "/home/user/project",
        api,
        monacoApi,
      );

      expect(result1).toBe(result2); // Same object reference
      expect(api.readFile).toHaveBeenCalledTimes(1); // Only called once
    });

    it("should cache defaults when tsconfig not found", async () => {
      const fileMap = new Map([["/home/user/project/.git", ""]]);
      const api = createMockFileApi(fileMap);

      // First load
      await loadTsConfigOptions("/home/user/project", api, monacoApi);

      // Check cache has defaults
      const cached = getCachedConfig("/home/user/project");
      expect(cached).toBeDefined();
      expect(cached).toEqual(getDefaultCompilerOptions(monacoApi));
    });

    it("should maintain separate cache entries for different cwds", async () => {
      const fileMap = new Map([
        ["/workspace/monorepo/.git", ""],
        ["/workspace/monorepo/packages/app/.vscode", ""],
        [
          "/workspace/monorepo/packages/app/tsconfig.json",
          JSON.stringify({
            compilerOptions: { target: "ES2022" },
          }),
        ],
        ["/workspace/monorepo/packages/lib/package.json", ""],
        [
          "/workspace/monorepo/packages/lib/tsconfig.json",
          JSON.stringify({
            compilerOptions: { target: "ES2020" },
          }),
        ],
      ]);
      const api = createMockFileApi(fileMap);

      // Load for two different projects
      const appConfig = await loadTsConfigOptions(
        "/workspace/monorepo/packages/app/src",
        api,
        monacoApi,
      );
      const libConfig = await loadTsConfigOptions(
        "/workspace/monorepo/packages/lib/src",
        api,
        monacoApi,
      );

      expect(appConfig.target).toBe("ES2022");
      expect(libConfig.target).toBe("ES2020");

      // Check both are cached separately
      const cachedApp = getCachedConfig("/workspace/monorepo/packages/app/src");
      const cachedLib = getCachedConfig("/workspace/monorepo/packages/lib/src");

      expect(cachedApp?.target).toBe("ES2022");
      expect(cachedLib?.target).toBe("ES2020");
    });
  });

  describe("clearTsConfigCache", () => {
    it("should clear specific cwd from cache", async () => {
      const fileMap = new Map([
        ["/home/user/project/.git", ""],
        [
          "/home/user/project/tsconfig.json",
          JSON.stringify({
            compilerOptions: { target: "ES2022" },
          }),
        ],
      ]);
      const api = createMockFileApi(fileMap);

      // Load and cache
      await loadTsConfigOptions("/home/user/project", api, monacoApi);

      expect(getCachedConfig("/home/user/project")).toBeDefined();

      // Clear specific cwd
      clearTsConfigCache("/home/user/project");

      expect(getCachedConfig("/home/user/project")).toBeUndefined();
    });

    it("should clear entire cache when no cwd specified", async () => {
      const fileMap = new Map([
        ["/workspace/monorepo/.git", ""],
        ["/workspace/monorepo/packages/app/.vscode", ""],
        [
          "/workspace/monorepo/packages/app/tsconfig.json",
          JSON.stringify({
            compilerOptions: { target: "ES2022" },
          }),
        ],
        ["/workspace/monorepo/packages/lib/package.json", ""],
        [
          "/workspace/monorepo/packages/lib/tsconfig.json",
          JSON.stringify({
            compilerOptions: { target: "ES2020" },
          }),
        ],
      ]);
      const api = createMockFileApi(fileMap);

      // Load multiple configs
      await loadTsConfigOptions(
        "/workspace/monorepo/packages/app/src",
        api,
        monacoApi,
      );
      await loadTsConfigOptions(
        "/workspace/monorepo/packages/lib/src",
        api,
        monacoApi,
      );

      expect(
        getCachedConfig("/workspace/monorepo/packages/app/src"),
      ).toBeDefined();
      expect(
        getCachedConfig("/workspace/monorepo/packages/lib/src"),
      ).toBeDefined();

      // Clear all
      clearTsConfigCache();

      expect(
        getCachedConfig("/workspace/monorepo/packages/app/src"),
      ).toBeUndefined();
      expect(
        getCachedConfig("/workspace/monorepo/packages/lib/src"),
      ).toBeUndefined();
    });

    it("should not affect other cached entries when clearing specific cwd", async () => {
      const fileMap = new Map([
        ["/workspace/monorepo/.git", ""],
        ["/workspace/monorepo/packages/app/.vscode", ""],
        [
          "/workspace/monorepo/packages/app/tsconfig.json",
          JSON.stringify({
            compilerOptions: { target: "ES2022" },
          }),
        ],
        ["/workspace/monorepo/packages/lib/package.json", ""],
        [
          "/workspace/monorepo/packages/lib/tsconfig.json",
          JSON.stringify({
            compilerOptions: { target: "ES2020" },
          }),
        ],
      ]);
      const api = createMockFileApi(fileMap);

      // Load multiple configs
      await loadTsConfigOptions(
        "/workspace/monorepo/packages/app/src",
        api,
        monacoApi,
      );
      await loadTsConfigOptions(
        "/workspace/monorepo/packages/lib/src",
        api,
        monacoApi,
      );

      // Clear only app
      clearTsConfigCache("/workspace/monorepo/packages/app/src");

      expect(
        getCachedConfig("/workspace/monorepo/packages/app/src"),
      ).toBeUndefined();
      expect(
        getCachedConfig("/workspace/monorepo/packages/lib/src"),
      ).toBeDefined();
    });
  });

  describe("getCachedConfig", () => {
    it("should return undefined for uncached cwd", () => {
      const cached = getCachedConfig("/some/random/path");

      expect(cached).toBeUndefined();
    });

    it("should return cached config for cached cwd", async () => {
      const fileMap = new Map([
        ["/home/user/project/.git", ""],
        [
          "/home/user/project/tsconfig.json",
          JSON.stringify({
            compilerOptions: {
              target: "ES2022",
              strict: true,
            },
          }),
        ],
      ]);
      const api = createMockFileApi(fileMap);

      await loadTsConfigOptions("/home/user/project", api, monacoApi);

      const cached = getCachedConfig("/home/user/project");

      expect(cached).toBeDefined();
      expect(cached).toMatchObject({
        target: "ES2022",
        strict: true,
      });
    });
  });

  describe("integration scenarios", () => {
    it("should handle typical React TypeScript project", async () => {
      const fileMap = new Map([
        ["/Users/dev/my-react-app/.git", ""],
        ["/Users/dev/my-react-app/package.json", ""],
        [
          "/Users/dev/my-react-app/tsconfig.json",
          JSON.stringify({
            compilerOptions: {
              target: "ES2020",
              lib: ["ES2020", "DOM", "DOM.Iterable"],
              jsx: "react-jsx",
              module: "ESNext",
              moduleResolution: "bundler",
              strict: true,
              esModuleInterop: true,
              skipLibCheck: true,
              allowImportingTsExtensions: true,
            },
          }),
        ],
      ]);
      const api = createMockFileApi(fileMap);

      const result = await loadTsConfigOptions(
        "/Users/dev/my-react-app/src/components/Button",
        api,
        monacoApi,
      );

      expect(result).toMatchObject({
        target: "ES2020",
        lib: ["ES2020", "DOM", "DOM.Iterable"],
        jsx: "react-jsx",
        module: "ESNext",
        moduleResolution: monacoApi.ModuleResolutionKind.NodeJs, // Converted from bundler
        strict: true,
        esModuleInterop: true,
      });
    });

    it("should handle Vite project with bundler resolution", async () => {
      const fileMap = new Map([
        ["/home/dev/vite-project/.git", ""],
        [
          "/home/dev/vite-project/tsconfig.json",
          JSON.stringify({
            compilerOptions: {
              target: "ES2022",
              useDefineForClassFields: true,
              lib: ["ES2022", "DOM", "DOM.Iterable"],
              module: "ESNext",
              skipLibCheck: true,
              moduleResolution: "bundler",
              allowImportingTsExtensions: true,
              resolveJsonModule: true,
              isolatedModules: true,
              noEmit: true,
              jsx: "react-jsx",
              strict: true,
            },
          }),
        ],
      ]);
      const api = createMockFileApi(fileMap);

      const result = await loadTsConfigOptions(
        "/home/dev/vite-project/src",
        api,
        monacoApi,
      );

      // Should convert bundler to NodeJs for Monaco compatibility
      expect(result.moduleResolution).toBe(
        monacoApi.ModuleResolutionKind.NodeJs,
      );
      expect(result.target).toBe("ES2022");
      expect(result.jsx).toBe("react-jsx");
    });

    it("should reload after cache clear", async () => {
      const fileMap = new Map([
        ["/home/user/project/.git", ""],
        [
          "/home/user/project/tsconfig.json",
          JSON.stringify({
            compilerOptions: { target: "ES2020" },
          }),
        ],
      ]);
      const api = createMockFileApi(fileMap);

      // First load
      await loadTsConfigOptions("/home/user/project", api, monacoApi);
      expect(api.readFile).toHaveBeenCalledTimes(1);

      // Clear cache
      clearTsConfigCache("/home/user/project");

      // Reload - should read file again
      await loadTsConfigOptions("/home/user/project", api, monacoApi);
      expect(api.readFile).toHaveBeenCalledTimes(2);
    });
  });
});
