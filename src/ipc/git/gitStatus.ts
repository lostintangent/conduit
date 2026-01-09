import type { Branch, GitFileStatus, GitStatusMap } from "@shared/types";
import { spawn } from "node:child_process";
import path from "node:path";
import { findRepoRoot, runGit } from "../agent/git";

/**
 * Parse a single line from git status --porcelain=v2 output
 */
function parseGitStatusLine(
  line: string,
  _gitRoot: string,
): GitFileStatus | null {
  if (!line || line.startsWith("#")) {
    return null;
  }

  // Format: <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
  // or: 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
  // or: 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path><sep><origPath>
  // or: u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
  // or: ? <path>

  const parts = line.split(" ");

  // Untracked file
  if (parts[0] === "?") {
    const relativePath = parts.slice(1).join(" ");
    return {
      status: "untracked",
      staged: false,
      relativePath,
    };
  }

  // Ignored file (we don't care about these)
  if (parts[0] === "!") {
    return null;
  }

  // Changed entry (1 = ordinary changed, 2 = renamed/copied, u = unmerged)
  if (parts[0] === "1" || parts[0] === "2" || parts[0] === "u") {
    const xy = parts[1]; // Status codes
    const filePath =
      parts[0] === "2" ? parts.slice(9).join(" ") : parts.slice(8).join(" ");

    // Parse the path (might have rename info)
    let relativePath = filePath;
    let originalPath: string | undefined;
    if (parts[0] === "2") {
      // Renamed/copied file - format is "<path><tab><origPath>"
      const pathParts = filePath.split("\t");
      relativePath = pathParts[0] || filePath;
      originalPath = pathParts[1];
    }

    // XY codes:
    // X = index status (staged)
    // Y = working tree status
    const indexStatus = xy[0];
    const wtStatus = xy[1];

    // Parse staged status (X)
    let stagedStatus: GitFileStatus["stagedStatus"] = undefined;
    if (indexStatus === "M") {
      stagedStatus = "modified";
    } else if (indexStatus === "A") {
      stagedStatus = "added";
    } else if (indexStatus === "D") {
      stagedStatus = "deleted";
    } else if (indexStatus === "R") {
      stagedStatus = "renamed";
    } else if (indexStatus === "C") {
      stagedStatus = "copied";
    }

    // Parse unstaged status (Y)
    let unstagedStatus: GitFileStatus["unstagedStatus"] = undefined;
    if (wtStatus === "M") {
      unstagedStatus = "modified";
    } else if (wtStatus === "A") {
      unstagedStatus = "added";
    } else if (wtStatus === "D") {
      unstagedStatus = "deleted";
    } else if (wtStatus === "?") {
      unstagedStatus = "untracked";
    }

    // Determine primary status and staged flag for backward compatibility
    let status: GitFileStatus["status"] = "modified";
    let staged = false;

    // If we have a staged change, use that as primary status
    if (stagedStatus) {
      status = stagedStatus;
      staged = true;
    } else if (unstagedStatus) {
      // Otherwise use unstaged status
      status = unstagedStatus;
      staged = false;
    }

    return {
      status,
      staged,
      relativePath,
      originalPath,
      stagedStatus,
      unstagedStatus,
    };
  }

  return null;
}

/**
 * Get git status for all files in the repository relative to HEAD
 *
 * @param gitRoot - Path to the git repository root
 * @returns Map of relative file paths to their git status
 */
export async function getGitStatusForHead(
  gitRoot: string,
): Promise<GitStatusMap> {
  const statusMap = new Map<string, GitFileStatus>();

  try {
    const { stdout } = await runGit(gitRoot, [
      "status",
      "--porcelain=v2",
      "--untracked-files=all",
    ]);

    const lines = stdout.split("\n");
    for (const line of lines) {
      const status = parseGitStatusLine(line.trim(), gitRoot);
      if (status) {
        statusMap.set(status.relativePath, status);
      }
    }
  } catch (error) {
    console.error("[gitStatus] Failed to get git status for HEAD:", error);
    // Return empty map on error (repo might not be initialized yet)
  }

  return statusMap;
}

/**
 * Get git status for a single file
 *
 * @param gitRoot - Path to the git repository root
 * @param filePath - Absolute path to the file
 * @returns Git status for the file, or null if unmodified
 */
export async function getGitStatusForFile(
  gitRoot: string,
  filePath: string,
): Promise<GitFileStatus | null> {
  try {
    // Compute relative path from git root
    const relativePath = path.relative(gitRoot, filePath);
    if (relativePath.startsWith("..")) {
      // File is outside git repo
      return null;
    }

    // Convert to forward slashes for git
    const gitPath = relativePath.split(path.sep).join("/");

    const { stdout } = await runGit(gitRoot, [
      "status",
      "--porcelain=v2",
      "--",
      gitPath,
    ]);

    const lines = stdout.split("\n");
    for (const line of lines) {
      const status = parseGitStatusLine(line.trim(), gitRoot);
      if (status) {
        return status;
      }
    }

    // No output means file is unmodified or untracked
    return null;
  } catch (error) {
    console.error(
      `[gitStatus] Failed to get git status for file ${filePath}:`,
      error,
    );
    return null;
  }
}

/**
 * Get git status relative to a base branch
 * Includes all files that differ between the base branch and current HEAD,
 * plus any uncommitted changes
 *
 * @param gitRoot - Path to the git repository root
 * @param baseBranch - Name of the base branch to compare against
 * @returns Map of relative file paths to their git status
 */
export async function getGitStatusRelativeToBranch(
  gitRoot: string,
  baseBranch: string,
): Promise<GitStatusMap> {
  const statusMap = new Map<string, GitFileStatus>();

  try {
    // First, get files changed between base branch and HEAD
    const { stdout: diffOutput } = await runGit(gitRoot, [
      "diff",
      "--name-status",
      `${baseBranch}...HEAD`,
    ]);

    const diffLines = diffOutput.split("\n");
    for (const line of diffLines) {
      if (!line.trim()) continue;

      const parts = line.split("\t");
      if (parts.length < 2) continue;

      const statusCode = parts[0]?.trim();

      if (!statusCode) continue;

      let status: GitFileStatus["status"] = "modified";
      let filePath: string;
      let originalPath: string | undefined;

      if (statusCode.startsWith("A")) {
        status = "added";
        filePath = parts[1]?.trim() || "";
      } else if (statusCode.startsWith("D")) {
        status = "deleted";
        filePath = parts[1]?.trim() || "";
      } else if (statusCode.startsWith("M")) {
        status = "modified";
        filePath = parts[1]?.trim() || "";
      } else if (statusCode.startsWith("R")) {
        // Renamed: R100\told-path\tnew-path
        status = "renamed";
        originalPath = parts[1]?.trim();
        filePath = parts[2]?.trim() || parts[1]?.trim() || "";
      } else if (statusCode.startsWith("C")) {
        // Copied: C100\told-path\tnew-path
        status = "copied";
        originalPath = parts[1]?.trim();
        filePath = parts[2]?.trim() || parts[1]?.trim() || "";
      } else {
        filePath = parts[1]?.trim() || "";
      }

      if (!filePath) continue;

      statusMap.set(filePath, {
        status,
        staged: true, // Changes in commits are considered "staged"
        relativePath: filePath,
        originalPath,
      });
    }

    // Then, overlay working tree changes (uncommitted)
    const workingTreeStatus = await getGitStatusForHead(gitRoot);
    for (const [relativePath, status] of workingTreeStatus) {
      // Working tree changes override committed changes
      statusMap.set(relativePath, status);
    }
  } catch (error) {
    console.error(
      `[gitStatus] Failed to get git status relative to branch ${baseBranch}:`,
      error,
    );
    // Return empty map on error
  }

  return statusMap;
}

/**
 * Get list of branches sorted by most recent commit
 *
 * @param gitRoot - Path to the git repository root
 * @returns Array of branch information
 */
export async function listBranches(gitRoot: string): Promise<Branch[]> {
  const branchMap = new Map<string, Branch>();

  try {
    const { stdout } = await runGit(gitRoot, [
      "for-each-ref",
      "--sort=-committerdate",
      "--format=%(refname:short)|%(committerdate:iso8601)|%(objectname:short)|%(subject)|%(HEAD)",
      "refs/heads/",
      "refs/remotes/",
    ]);

    const lines = stdout.split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;

      const parts = line.split("|");
      if (parts.length < 4) continue;

      const name = parts[0]?.trim() || "";
      const dateStr = parts[1]?.trim() || "";
      const hash = parts[2]?.trim() || "";
      const message = parts[3]?.trim() || "";
      const isCurrentMarker = parts[4]?.trim() || "";

      if (!name) continue;

      // Remove remote prefix for remote branches (e.g., "origin/", "upstream/")
      // Handle any remote, not just "origin"
      const isRemote = name.includes("/");
      const cleanName = isRemote ? name.split("/").slice(1).join("/") : name;
      const isCurrent = isCurrentMarker === "*";

      const branch: Branch = {
        name: cleanName,
        isRemote,
        isCurrent,
        lastCommitDate: new Date(dateStr),
        lastCommitHash: hash,
        lastCommitMessage: message,
      };

      // Deduplicate branches by name only
      // Priority: current > local > remote
      const existing = branchMap.get(cleanName);
      if (!existing) {
        branchMap.set(cleanName, branch);
      } else {
        // Calculate priority for comparison
        const getPriority = (b: Branch) => {
          if (b.isCurrent) return 3; // Current branch has highest priority
          if (!b.isRemote) return 2; // Local branch has medium priority
          return 1; // Remote branch has lowest priority
        };

        const existingPriority = getPriority(existing);
        const branchPriority = getPriority(branch);

        // Replace if new branch has higher priority
        if (branchPriority > existingPriority) {
          branchMap.set(cleanName, branch);
        }
      }
    }
  } catch (error) {
    console.error("[gitStatus] Failed to list branches:", error);
    // Return empty array on error
  }

  // Convert map to array, maintaining sort order
  return Array.from(branchMap.values());
}

/**
 * Get git status for a directory (convenience wrapper)
 * Automatically finds git root and returns status
 *
 * @param cwd - Current working directory
 * @param baseBranch - Optional base branch to compare against
 * @returns Map of relative file paths to their git status, or null if not in git repo
 */
export async function getGitStatus(
  cwd: string,
  baseBranch?: string | null,
): Promise<GitStatusMap | null> {
  const gitRoot = await findRepoRoot(cwd);
  if (!gitRoot) {
    return null;
  }

  if (baseBranch) {
    return getGitStatusRelativeToBranch(gitRoot, baseBranch);
  }

  return getGitStatusForHead(gitRoot);
}

/**
 * Get the most recently modified dirty file (file with uncommitted changes)
 * Uses a single shell pipeline for maximum efficiency
 *
 * @param cwd - Current working directory
 * @returns Relative path of the most recently modified dirty file, or null
 */
export async function getMostRecentDirtyFile(
  cwd: string,
): Promise<string | null> {
  try {
    const gitRoot = await findRepoRoot(cwd);
    if (!gitRoot) {
      return null;
    }

    return new Promise((resolve) => {
      // Get ALL dirty files (staged + unstaged + untracked) and find most recent:
      // 1. git status -z gets all dirty files with null delimiters
      // 2. Strip status codes and handle renames (format: XY filename or XY old -> new)
      // 3. Expand directories to their files, preserving full paths
      // 4. Pass to ls -t (sorts by modification time, newest first)
      // 5. head -1 gets the most recent file
      const pipeline = `git status --porcelain -z | \
        tr '\\0' '\\n' | \
        sed 's/^...//' | \
        sed 's/ -> .*//' | \
        grep -v '^$' | \
        while IFS= read -r path; do
          if [ -d "$path" ]; then
            find "$path" -type f
          elif [ -f "$path" ]; then
            echo "$path"
          fi
        done | \
        tr '\\n' '\\0' | \
        xargs -0 ls -t1 2>/dev/null | head -1`;

      const child = spawn("sh", ["-c", pipeline], {
        cwd: gitRoot,
        stdio: ["ignore", "pipe", "ignore"],
      });

      let output = "";
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });

      child.once("error", () => resolve(null));
      child.once("close", (code: number | null) => {
        if (code !== 0 || !output.trim()) {
          resolve(null);
          return;
        }

        const filePath = output.trim();
        resolve(filePath || null);
      });
    });
  } catch (error) {
    console.error("Failed to get most recent dirty file:", error);
    return null;
  }
}

/**
 * Get the most recently modified file from recent git history
 * Uses a single shell pipeline for maximum efficiency
 *
 * @param cwd - Current working directory
 * @param commitLimit - Number of recent commits to check (default: 10)
 * @returns Relative path of the most recently modified file, or null
 */
export async function getMostRecentTrackedFile(
  cwd: string,
  commitLimit = 10,
): Promise<string | null> {
  try {
    const gitRoot = await findRepoRoot(cwd);
    if (!gitRoot) {
      return null;
    }

    return new Promise((resolve) => {
      // Optimized pipeline using ls -t (2x faster than stat + sort):
      // 1. git log gets files from recent commits with null delimiters
      // 2. tr removes null bytes and newlines, deduplicates with sort -u
      // 3. xargs -0 passes to ls -t (sorts by modification time, newest first)
      // 4. head -1 gets the most recent file
      const pipeline = `git log --name-only --pretty=format: -n${commitLimit} -z | \
        tr '\\0' '\\n' | grep -v '^$' | sort -u | tr '\\n' '\\0' | \
        xargs -0 ls -t1 2>/dev/null | head -1`;

      const child = spawn("sh", ["-c", pipeline], {
        cwd: gitRoot,
        stdio: ["ignore", "pipe", "ignore"],
      });

      let output = "";
      child.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });

      child.once("error", () => resolve(null));
      child.once("close", (code: number | null) => {
        if (code !== 0 || !output.trim()) {
          resolve(null);
          return;
        }

        const filePath = output.trim();
        resolve(filePath || null);
      });
    });
  } catch (error) {
    console.error("Failed to get most recent tracked file:", error);
    return null;
  }
}
