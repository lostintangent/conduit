import { readFile } from "node:fs/promises";
import path from "node:path";
import { findRepoRoot, runGit } from "../agent/git";

export interface FileDiffResult {
  originalContent: string;
  modifiedContent: string;
  status: "modified" | "added" | "deleted" | "binary";
  isBinary: boolean;
}

/**
 * Check if a file is binary by reading its first few bytes
 */
async function isBinaryFile(filePath: string): Promise<boolean> {
  try {
    const buffer = await readFile(filePath);
    // Check for null bytes in first 8000 bytes
    const bytesToCheck = Math.min(buffer.length, 8000);
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
 * Get the content of a file at HEAD
 */
async function getFileAtHead(
  gitRoot: string,
  relativePath: string,
): Promise<string | null> {
  try {
    const { stdout } = await runGit(gitRoot, ["show", `HEAD:${relativePath}`]);
    return stdout;
  } catch (error) {
    // File doesn't exist at HEAD (might be a new file)
    return null;
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
  } catch (error) {
    // File doesn't exist at this branch
    return null;
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

    // Check if file is binary
    let isBinary = false;
    try {
      isBinary = await isBinaryFile(filePath);
    } catch {
      // If file doesn't exist, it might be deleted
    }

    if (isBinary) {
      return {
        originalContent: "",
        modifiedContent: "",
        status: "binary",
        isBinary: true,
      };
    }

    // Get current file content (might not exist if deleted)
    let modifiedContent = "";
    try {
      modifiedContent = await readFile(filePath, "utf-8");
    } catch {
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
