/**
 * Ripgrep-based file scanner - ultra-fast file listing
 * Uses the same ripgrep binary that VS Code uses
 */

import { spawn } from "child_process";
import * as path from "path";

// Resolve ripgrep path at runtime (Vite bundling breaks the import)
function resolveRipgrepPath(): string {
  const fs = require("fs");

  try {
    // Try the package import first
    const { rgPath } = require("@vscode/ripgrep");
    if (rgPath && fs.existsSync(rgPath)) {
      console.log("[Ripgrep] Using path from @vscode/ripgrep:", rgPath);
      return rgPath;
    }
    console.warn("[Ripgrep] Path from @vscode/ripgrep doesn't exist:", rgPath);
  } catch (e) {
    console.warn("[Ripgrep] Failed to import @vscode/ripgrep:", e);
  }

  // Fallback: try multiple possible locations
  const possiblePaths = [
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
  ];

  for (const rgPath of possiblePaths) {
    if (fs.existsSync(rgPath)) {
      console.log("[Ripgrep] Found binary at:", rgPath);
      return rgPath;
    }
  }

  console.error(
    "[Ripgrep] Could not find ripgrep binary in any expected location",
  );
  console.error("[Ripgrep] Tried:", possiblePaths);
  console.error("[Ripgrep] __dirname:", __dirname);
  console.error("[Ripgrep] process.cwd():", process.cwd());

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
    console.log(`[Ripgrep] rgPath from @vscode/ripgrep:`, rgPath);
    console.log(`[Ripgrep] Command: ${rgPath} ${args.join(" ")}`);

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

    rg.on("error", (error) => {
      console.error("[Ripgrep] Process error:", error);
      result.errors.push(`Ripgrep process error: ${error.message}`);
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
