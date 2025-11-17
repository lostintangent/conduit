/**
 * TypeScript configuration loading with caching
 * Loads tsconfig.json from user projects and converts to Monaco-compatible options
 */

import type * as monaco from "monaco-editor";
import {
  findTsConfig,
  parseTsConfig,
  type FileSystemApi,
} from "./tsconfigResolver";

// Monaco types reference for compiler options
type MonacoCompilerOptions = monaco.languages.typescript.CompilerOptions;

// We need to reference these enum values, but they come from monaco which might not be imported yet
// So we'll accept them as a dependency
interface MonacoTypeScriptApi {
  ScriptTarget: {
    ES2020: any;
  };
  ModuleKind: {
    ESNext: any;
  };
  ModuleResolutionKind: {
    NodeJs: any;
  };
  JsxEmit: {
    ReactJSX: any;
  };
}

// Cache for tsconfig.json per project directory
const tsconfigCache = new Map<string, MonacoCompilerOptions>();

/**
 * Default compiler options to use when no tsconfig.json is found
 */
export function getDefaultCompilerOptions(
  monacoApi: MonacoTypeScriptApi,
): MonacoCompilerOptions {
  return {
    target: monacoApi.ScriptTarget.ES2020,
    lib: ["ES2020", "DOM", "DOM.Iterable"],
    module: monacoApi.ModuleKind.ESNext,
    moduleResolution: monacoApi.ModuleResolutionKind.NodeJs,
    jsx: monacoApi.JsxEmit.ReactJSX,
    esModuleInterop: true,
  };
}

/**
 * Converts TypeScript compiler options to Monaco-compatible options
 * Handles incompatibilities like "bundler" moduleResolution
 */
export function convertToMonacoOptions(
  opts: any,
  monacoApi: MonacoTypeScriptApi,
): MonacoCompilerOptions {
  const options: MonacoCompilerOptions = {
    ...opts,
    // Override moduleResolution if it's "bundler" (not supported by Monaco)
    moduleResolution:
      opts.moduleResolution === "bundler"
        ? monacoApi.ModuleResolutionKind.NodeJs
        : opts.moduleResolution,
  };

  return options;
}

/**
 * Loads and parses tsconfig.json from the user's project directory
 * Uses TypeScript's upward search algorithm starting from cwd
 * Returns Monaco-compatible compiler options
 *
 * Results are cached per cwd to avoid repeated file system operations
 */
export async function loadTsConfigOptions(
  cwd: string,
  api: FileSystemApi,
  monacoApi: MonacoTypeScriptApi,
): Promise<MonacoCompilerOptions> {
  console.log("[Monaco TypeScript] Loading tsconfig.json from cwd:", cwd);

  // Check cache first
  if (tsconfigCache.has(cwd)) {
    console.log("[Monaco TypeScript] Using cached tsconfig for:", cwd);
    return tsconfigCache.get(cwd)!;
  }

  try {
    // Search for tsconfig.json starting from cwd
    const tsconfigPath = await findTsConfig(cwd, api);

    if (!tsconfigPath) {
      throw new Error("No tsconfig.json found");
    }

    // Read and parse tsconfig.json
    const content = await api.readFile(tsconfigPath);
    const opts: any = parseTsConfig(content);

    console.log("[Monaco TypeScript] Successfully loaded tsconfig.json:", opts);

    // Convert to Monaco-compatible options
    const options = convertToMonacoOptions(opts, monacoApi);

    // Cache the result
    tsconfigCache.set(cwd, options);

    console.log("[Monaco TypeScript] Configured compiler options:", options);
    return options;
  } catch (error) {
    console.warn(
      "[Monaco TypeScript] Could not load tsconfig.json from",
      cwd,
      ", using defaults:",
      error,
    );

    // Return sensible defaults if tsconfig.json is not found
    const defaults = getDefaultCompilerOptions(monacoApi);

    // Cache defaults too to avoid repeated lookups
    tsconfigCache.set(cwd, defaults);

    return defaults;
  }
}

/**
 * Clears the tsconfig cache for a specific cwd or all entries
 */
export function clearTsConfigCache(cwd?: string): void {
  if (cwd) {
    tsconfigCache.delete(cwd);
    console.log("[Monaco TypeScript] Cleared cache for:", cwd);
  } else {
    tsconfigCache.clear();
    console.log("[Monaco TypeScript] Cleared entire cache");
  }
}

/**
 * Gets the cached config for a cwd without loading
 */
export function getCachedConfig(
  cwd: string,
): MonacoCompilerOptions | undefined {
  return tsconfigCache.get(cwd);
}
