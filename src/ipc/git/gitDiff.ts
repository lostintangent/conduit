import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { findRepoRoot, runGit } from "../agent/git";

export interface FileDiffResult {
  originalContent: string;
  modifiedContent: string;
  status: "modified" | "added" | "deleted" | "binary";
  isBinary: boolean;
}

// Common text file extensions
const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".json",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
  ".htm",
  ".xml",
  ".svg",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".conf",
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".py",
  ".rb",
  ".rs",
  ".go",
  ".java",
  ".kt",
  ".swift",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".cs",
  ".php",
  ".pl",
  ".lua",
  ".vim",
  ".sql",
  ".graphql",
  ".proto",
]);

/**
 * Check if a file is binary by extension first, then content
 */
async function isBinaryFile(filePath: string): Promise<boolean> {
  // Fast path: Check extension first
  const ext = path.extname(filePath).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) {
    return false;
  }

  // For unknown extensions, check file content
  try {
    const buffer = await readFile(filePath);
    // Check for null bytes in first 512 bytes (much faster than 8000)
    const bytesToCheck = Math.min(buffer.length, 512);
    for (let i = 0; i < bytesToCheck; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }
    return false;
  } catch {
    // If we can't read the file, assume it's not binary
    return false;
  }
}

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the content of a file at HEAD
 */
async function getFileAtHead(
  gitRoot: string,
  relativePath: string,
): Promise<string | null> {
  try {
    const { stdout } = await runGit(gitRoot, ["show", `HEAD:${relativePath}`]);
    return stdout;
  } catch (error: any) {
    // Only return null for "does not exist" errors
    const errorMessage = error?.message || String(error);
    if (
      errorMessage.includes("does not exist") ||
      errorMessage.includes("exists on disk, but not in") ||
      errorMessage.includes("Path") ||
      errorMessage.includes("fatal: path")
    ) {
      return null; // File doesn't exist at HEAD (new file)
    }
    // Re-throw unexpected errors
    console.error(`[gitDiff] Unexpected error fetching file at HEAD:`, error);
    throw error;
  }
}

/**
 * Get the content of a file at a specific branch
 */
async function getFileAtBranch(
  gitRoot: string,
  relativePath: string,
  branch: string,
): Promise<string | null> {
  try {
    const { stdout } = await runGit(gitRoot, [
      "show",
      `${branch}:${relativePath}`,
    ]);
    return stdout;
  } catch (error: any) {
    // Only return null for "does not exist" errors
    const errorMessage = error?.message || String(error);
    if (
      errorMessage.includes("does not exist") ||
      errorMessage.includes("exists on disk, but not in") ||
      errorMessage.includes("Path") ||
      errorMessage.includes("fatal: path")
    ) {
      return null; // File doesn't exist at this branch
    }
    // Re-throw unexpected errors
    console.error(
      `[gitDiff] Unexpected error fetching file at branch ${branch}:`,
      error,
    );
    throw error;
  }
}

/**
 * Get the diff for a specific file
 *
 * @param cwd - Current working directory
 * @param filePath - Absolute path to the file
 * @param baseBranch - Optional base branch to compare against
 * @returns File diff result with original and modified content
 */
export async function getFileDiff(
  cwd: string,
  filePath: string,
  baseBranch?: string | null,
): Promise<FileDiffResult | null> {
  try {
    const gitRoot = await findRepoRoot(cwd);
    if (!gitRoot) {
      return null;
    }

    // Get relative path from git root
    const relativePath = path.relative(gitRoot, filePath);
    if (relativePath.startsWith("..")) {
      // File is outside git repo
      return null;
    }

    // Convert to forward slashes for git
    const gitPath = relativePath.split(path.sep).join("/");

    // Check if file exists first
    const exists = await fileExists(filePath);

    // Get current file content (might not exist if deleted)
    let modifiedContent = "";
    let isBinary = false;

    if (exists) {
      // File exists - check if it's binary
      isBinary = await isBinaryFile(filePath);

      if (isBinary) {
        return {
          originalContent: "",
          modifiedContent: "",
          status: "binary",
          isBinary: true,
        };
      }

      // Read text file content
      try {
        modifiedContent = await readFile(filePath, "utf-8");
      } catch (error) {
        console.error(`[gitDiff] Failed to read file ${filePath}:`, error);
        throw error;
      }
    } else {
      // File doesn't exist - it's been deleted
      const originalContent = baseBranch
        ? await getFileAtBranch(gitRoot, gitPath, baseBranch)
        : await getFileAtHead(gitRoot, gitPath);

      return {
        originalContent: originalContent || "",
        modifiedContent: "",
        status: "deleted",
        isBinary: false,
      };
    }

    // Get original content (from HEAD or base branch)
    const originalContent = baseBranch
      ? await getFileAtBranch(gitRoot, gitPath, baseBranch)
      : await getFileAtHead(gitRoot, gitPath);

    // Determine status
    let status: "modified" | "added" | "deleted" = "modified";
    if (originalContent === null) {
      status = "added";
    } else if (!modifiedContent) {
      status = "deleted";
    }

    return {
      originalContent: originalContent || "",
      modifiedContent,
      status,
      isBinary: false,
    };
  } catch (error) {
    console.error(`[gitDiff] Failed to get diff for file ${filePath}:`, error);
    return null;
  }
}
