/**
 * Ripgrep-based file scanner - ultra-fast file listing
 * Uses the same ripgrep binary that VS Code uses
 */

import { spawn } from "child_process";
import * as fs from "node:fs";
import * as path from "path";

// The binary comes from @vscode/ripgrep's platform package, which the module
// throws without, so a missing one only disables scanning. Packaged, the path
// points into app.asar, but the binary is unpacked next to it.
const ripgrepPath: Promise<string | null> = import("@vscode/ripgrep").then(
  ({ rgPath }) =>
    rgPath.includes("app.asar.unpacked")
      ? rgPath
      : rgPath.replace("app.asar", "app.asar.unpacked"),
  (error: Error) => {
    console.error("[Ripgrep] Could not find the binary:", error.message);
    return null;
  },
);

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

  const rgPath = await ripgrepPath;
  if (!rgPath) {
    result.errors.push("Ripgrep isn't installed");
    return result;
  }

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

    // Pre-flight check: verify binary exists and is executable
    try {
      fs.accessSync(rgPath, fs.constants.X_OK);
    } catch (accessError: any) {
      console.error("[Ripgrep] Binary not executable:", accessError.message);
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
      console.error("[Ripgrep] Spawn error:", error.message);
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

      // code 0 = success, code 1 = no matches (which is fine for file listing)
      if (code !== null && code !== 0 && code !== 1) {
        if (result.files.length === 0) {
          result.errors.push(`Ripgrep exited with code ${code}`);
        }
      }

      result.duration = Date.now() - startTime;
      resolve(result);
    });
  });
}
