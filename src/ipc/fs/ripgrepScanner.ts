/**
 * Ripgrep-based file scanner - ultra-fast file listing
 * Uses the same ripgrep binary that VS Code uses
 */

import { spawn } from "child_process";
import * as path from "path";

// Resolve ripgrep path at runtime (Vite bundling breaks the import)
function resolveRipgrepPath(): string {
  const fs = require("fs");

  // Log environment info for debugging
  const isPackaged = !!(process as any).resourcesPath;
  console.log("[Ripgrep] === Resolving ripgrep path ===");
  console.log("[Ripgrep] isPackaged:", isPackaged);
  console.log("[Ripgrep] __dirname:", __dirname);
  console.log("[Ripgrep] process.cwd():", process.cwd());
  if (isPackaged) {
    console.log(
      "[Ripgrep] process.resourcesPath:",
      (process as any).resourcesPath,
    );
  }

  try {
    // Try the package import first
    const { rgPath } = require("@vscode/ripgrep");
    console.log(
      "[Ripgrep] require('@vscode/ripgrep') succeeded, rgPath:",
      rgPath,
    );
    if (rgPath && fs.existsSync(rgPath)) {
      console.log("[Ripgrep] ✅ Using path from @vscode/ripgrep:", rgPath);
      return rgPath;
    }
    console.warn("[Ripgrep] Path from @vscode/ripgrep doesn't exist:", rgPath);
  } catch (e) {
    console.warn("[Ripgrep] Failed to import @vscode/ripgrep:", e);
  }

  // Fallback: try multiple possible locations
  // For packaged Electron apps, unpacked native modules are in app.asar.unpacked
  const possiblePaths: string[] = [];

  // Electron packaged app paths (app.asar.unpacked)
  if (isPackaged) {
    const resourcesPath = (process as any).resourcesPath;
    possiblePaths.push(
      path.join(
        resourcesPath,
        "app.asar.unpacked",
        "node_modules",
        "@vscode",
        "ripgrep",
        "bin",
        "rg",
      ),
    );
  }

  // Development paths
  possiblePaths.push(
    path.join(
      __dirname,
      "..",
      "..",
      "node_modules",
      "@vscode",
      "ripgrep",
      "bin",
      "rg",
    ),
    path.join(process.cwd(), "node_modules", "@vscode", "ripgrep", "bin", "rg"),
    path.join(
      __dirname,
      "..",
      "..",
      "..",
      "node_modules",
      "@vscode",
      "ripgrep",
      "bin",
      "rg",
    ),
  );

  console.log("[Ripgrep] Trying fallback paths:", possiblePaths);

  for (const rgPath of possiblePaths) {
    const exists = fs.existsSync(rgPath);
    console.log(
      `[Ripgrep] Checking ${rgPath}: ${exists ? "EXISTS" : "NOT FOUND"}`,
    );
    if (exists) {
      console.log("[Ripgrep] ✅ Found binary at:", rgPath);
      return rgPath;
    }
  }

  console.error(
    "[Ripgrep] ❌ Could not find ripgrep binary in any expected location",
  );

  // Return first path as fallback (will fail but with better error message)
  return possiblePaths[0];
}

const rgPath = resolveRipgrepPath();

export interface RipgrepScanOptions {
  /** Maximum depth to traverse (default: 15) */
  maxDepth?: number;
  /** Maximum number of files to return (default: 50000) */
  maxFiles?: number;
  /** Include hidden files/directories (default: false) */
  includeHidden?: boolean;
  /** Custom exclude patterns (beyond default node_modules, .git, etc.) */
  excludePatterns?: string[];
}

export interface RipgrepScanResult {
  /** Array of absolute file paths */
  files: string[];
  /** Whether the scan was truncated due to limits */
  truncated: boolean;
  /** Number of files skipped due to limits */
  filesSkipped: number;
  /** Total time taken for the scan in ms */
  duration: number;
  /** Any errors encountered during scanning */
  errors: string[];
}

/**
 * Scan directory using ripgrep (ultra-fast)
 * This is the same tool VS Code uses and is 100x faster than Node.js fs.readdir
 */
export async function scanDirectoryWithRipgrep(
  directoryPath: string,
  options: RipgrepScanOptions = {},
): Promise<RipgrepScanResult> {
  const startTime = Date.now();

  const {
    maxDepth = 15,
    maxFiles = 50000,
    includeHidden = false,
    excludePatterns = [],
  } = options;

  const result: RipgrepScanResult = {
    files: [],
    truncated: false,
    filesSkipped: 0,
    duration: 0,
    errors: [],
  };

  return new Promise((resolve) => {
    const args: string[] = [
      "--files", // List files only (don't search content)
      "--color",
      "never", // No color codes in output
      "--follow", // Follow symbolic links
    ];

    // Add max-depth
    if (maxDepth) {
      args.push("--max-depth", maxDepth.toString());
    }

    // Add hidden files flag
    if (includeHidden) {
      args.push("--hidden");
    }

    // Add default exclude patterns
    // ripgrep automatically excludes .git, but we can add more
    const defaultExcludes = [
      "node_modules",
      ".git",
      "dist",
      "build",
      "out",
      ".next",
      "coverage",
      ".turbo",
      ".vercel",
      ".cache",
      "tmp",
      ".tmp",
      "temp",
      ".temp",
      "logs",
      "*.log",
      ".DS_Store",
      "Thumbs.db",
      "__pycache__",
      ".pytest_cache",
      ".tox",
      ".eggs",
      "*.egg-info",
      ".bundle",
      "vendor",
      ".terraform",
      "target",
      ".gradle",
      ".mvn",
      "bin",
      "obj",
      ".sass-cache",
      "bower_components",
    ];

    const allExcludes = [...defaultExcludes, ...excludePatterns];
    allExcludes.forEach((pattern) => {
      args.push("--glob", `!${pattern}`);
    });

    // Add the directory to scan
    args.push(directoryPath);

    console.log(`[Ripgrep] Scanning ${directoryPath} with ripgrep`);
    console.log(`[Ripgrep] Binary path:`, rgPath);

    // Pre-flight check: verify binary exists and is executable
    const fs = require("fs");
    try {
      fs.accessSync(rgPath, fs.constants.X_OK);
      console.log(`[Ripgrep] ✅ Binary is executable`);
    } catch (accessError: any) {
      console.error(
        `[Ripgrep] ❌ Binary access check failed:`,
        accessError.message,
      );
      console.error(
        `[Ripgrep] This usually means wrong architecture or missing permissions`,
      );
      result.errors.push(`Binary not executable: ${accessError.message}`);
      resolve(result);
      return;
    }

    const rg = spawn(rgPath, args, {
      cwd: directoryPath,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    rg.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();

      // Stop reading if we've hit the file limit
      // This prevents memory issues with huge projects
      if (result.files.length >= maxFiles) {
        rg.kill();
      }
    });

    rg.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    rg.on("error", (error: any) => {
      console.error("[Ripgrep] ❌ Process spawn error:", error.message);
      console.error("[Ripgrep] Error code:", error.code);
      console.error("[Ripgrep] Error path:", error.path);
      if (error.code === "ENOENT") {
        console.error("[Ripgrep] Binary not found at path");
      } else if (error.code === "EACCES") {
        console.error("[Ripgrep] Permission denied - binary not executable");
      }
      result.errors.push(
        `Ripgrep process error: ${error.message} (${error.code})`,
      );
      resolve(result);
    });

    rg.on("close", (code) => {
      // Parse output - ripgrep returns one file per line
      const lines = stdout.split("\n").filter((line) => line.trim().length > 0);

      // Convert relative paths to absolute paths
      for (const line of lines) {
        if (result.files.length >= maxFiles) {
          result.truncated = true;
          result.filesSkipped = lines.length - result.files.length;
          break;
        }

        // ripgrep returns paths relative to the search directory
        const absolutePath = path.isAbsolute(line)
          ? line
          : path.resolve(directoryPath, line);

        result.files.push(absolutePath);
      }

      // Log any errors from stderr
      if (stderr && stderr.trim().length > 0) {
        console.warn("[Ripgrep] Warnings:", stderr);
        // Don't add to errors array unless it's a critical error
        // ripgrep may output warnings that aren't failures
      }

      // code 0 = success, code 1 = no matches (which is fine for file listing)
      if (code !== null && code !== 0 && code !== 1) {
        console.warn(`[Ripgrep] Exited with code ${code}`);
        if (result.files.length === 0) {
          result.errors.push(`Ripgrep exited with code ${code}`);
        }
      }

      result.duration = Date.now() - startTime;

      console.log(
        `[Ripgrep] Scan complete: ${result.files.length} files in ${result.duration}ms`,
      );

      resolve(result);
    });
  });
}

/**
 * Get the ripgrep binary path (for debugging/logging)
 */
export function getRipgrepPath(): string {
  return rgPath;
}

/**
 * Test if ripgrep is available
 */
export async function testRipgrep(): Promise<boolean> {
  return new Promise((resolve) => {
    const rg = spawn(rgPath, ["--version"]);

    rg.on("close", (code) => {
      resolve(code === 0);
    });

    rg.on("error", () => {
      resolve(false);
    });
  });
}
