import { exec } from "node:child_process";
import * as path from "node:path";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Find the git repository root for a given directory
 */
export async function findGitRoot(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync("git rev-parse --show-toplevel", {
      cwd,
    });
    return stdout.trim();
  } catch {
    return null;
  }
}

/**
 * Get git status for all files in the repository
 */
export async function getGitStatus(
  cwd: string,
  _baseBranch?: string | null,
): Promise<Record<string, any>> {
  try {
    const gitRoot = await findGitRoot(cwd);
    if (!gitRoot) {
      return {};
    }

    // Get status in porcelain v2 format
    const { stdout } = await execAsync("git status --porcelain=v2", {
      cwd: gitRoot,
    });

    const statusMap: Record<string, any> = {};

    for (const line of stdout.split("\n")) {
      if (!line || line.startsWith("#")) continue;

      const parts = line.split(" ");

      // Untracked file
      if (parts[0] === "?") {
        const relativePath = parts.slice(1).join(" ");
        statusMap[relativePath] = {
          status: "untracked",
          staged: false,
          relativePath,
        };
        continue;
      }

      // Changed entry (1 = ordinary, 2 = renamed/copied, u = unmerged)
      if (parts[0] === "1" || parts[0] === "2" || parts[0] === "u") {
        const xy = parts[1];
        const filePath =
          parts[0] === "2"
            ? parts.slice(9).join(" ")
            : parts.slice(8).join(" ");

        let relativePath = filePath;
        if (parts[0] === "2") {
          const pathParts = filePath.split("\t");
          relativePath = pathParts[0] || filePath;
        }

        const indexStatus = xy[0];
        const wtStatus = xy[1];

        // Parse staged status (X)
        let stagedStatus:
          | "modified"
          | "added"
          | "deleted"
          | "renamed"
          | "copied"
          | undefined = undefined;
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
        let unstagedStatus:
          | "modified"
          | "added"
          | "deleted"
          | "untracked"
          | undefined = undefined;
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
        let status: "modified" | "added" | "deleted" | "renamed" | "copied" =
          "modified";
        let staged = false;

        // If we have a staged change, use that as primary status
        if (stagedStatus) {
          status = stagedStatus;
          staged = true;
        } else if (unstagedStatus) {
          // Otherwise use unstaged status
          status = unstagedStatus as typeof status;
          staged = false;
        }

        statusMap[relativePath] = {
          status,
          staged,
          relativePath,
          stagedStatus,
          unstagedStatus,
        };
      }
    }

    return statusMap;
  } catch (error) {
    console.error("[Git] Error getting git status:", error);
    return {};
  }
}

/**
 * Get list of git branches
 */
export async function getGitBranches(cwd: string): Promise<any[]> {
  try {
    const gitRoot = await findGitRoot(cwd);
    if (!gitRoot) {
      return [];
    }

    // Get current branch
    let currentBranch = "";
    try {
      const { stdout: currentBranchOut } = await execAsync(
        "git rev-parse --abbrev-ref HEAD",
        { cwd: gitRoot },
      );
      currentBranch = currentBranchOut.trim();
    } catch {
      // Might be in detached HEAD state
    }

    // Get all branches with commit info
    const { stdout } = await execAsync(
      'git branch -a --format="%(refname:short)|%(upstream:short)|%(upstream:track)|%(objectname:short)|%(committerdate:iso8601)|%(contents:subject)"',
      { cwd: gitRoot },
    );

    const branches = [];
    for (const line of stdout.trim().split("\n")) {
      if (!line) continue;

      const parts = line.split("|");
      const name = parts[0];
      const upstream = parts[1];
      const track = parts[2];
      const commitHash = parts[3] || "";
      const commitDate = parts[4] || "";
      const commitMessage = parts[5] || "";

      branches.push({
        name,
        isCurrent: name === currentBranch,
        isRemote: name.startsWith("remotes/") || name.includes("/"),
        upstream: upstream || null,
        ahead: track ? parseInt(track.match(/ahead (\d+)/)?.[1] || "0") : 0,
        behind: track ? parseInt(track.match(/behind (\d+)/)?.[1] || "0") : 0,
        lastCommitHash: commitHash,
        lastCommitDate: commitDate,
        lastCommitMessage: commitMessage,
      });
    }

    return branches;
  } catch (error) {
    console.error("[Git] Error getting branches:", error);
    return [];
  }
}

/**
 * Get diff for a specific file
 */
export async function getFileDiff(
  cwd: string,
  filePath: string,
  _baseBranch?: string | null,
): Promise<any> {
  try {
    const gitRoot = await findGitRoot(cwd);
    if (!gitRoot) {
      return null;
    }

    const relativePath = path.relative(gitRoot, filePath);

    // Check if file exists
    const { stdout: statusOut } = await execAsync(
      `git status --porcelain -- "${relativePath}"`,
      { cwd: gitRoot },
    );

    if (!statusOut) {
      return null; // File not modified
    }

    const statusCode = statusOut.substring(0, 2);
    let status: "modified" | "added" | "deleted" | "binary" = "modified";

    if (statusCode.includes("A")) {
      status = "added";
    } else if (statusCode.includes("D")) {
      status = "deleted";
    }

    // Get file contents
    let originalContent = "";
    let modifiedContent = "";

    if (status !== "added") {
      try {
        const { stdout: headContent } = await execAsync(
          `git show HEAD:"${relativePath}"`,
          { cwd: gitRoot },
        );
        originalContent = headContent;
      } catch {
        originalContent = "";
      }
    }

    if (status !== "deleted") {
      try {
        const fs = await import("node:fs/promises");
        modifiedContent = await fs.readFile(
          path.join(gitRoot, relativePath),
          "utf-8",
        );
      } catch {
        modifiedContent = "";
      }
    }

    return {
      originalContent,
      modifiedContent,
      status,
      isBinary: false,
    };
  } catch (error) {
    console.error("[Git] Error getting file diff:", error);
    return null;
  }
}

/**
 * Stage files for commit
 */
export async function gitStage(cwd: string, files: string[]): Promise<void> {
  const gitRoot = await findGitRoot(cwd);
  if (!gitRoot) {
    throw new Error("Not a git repository");
  }

  // Convert files to relative paths from git root
  const relativePaths = files.map((file) => {
    const absolutePath = path.isAbsolute(file) ? file : path.join(cwd, file);
    return path.relative(gitRoot, absolutePath);
  });

  await execAsync(`git add ${relativePaths.map((f) => `"${f}"`).join(" ")}`, {
    cwd: gitRoot,
  });
}

/**
 * Unstage files from staging area
 */
export async function gitUnstage(cwd: string, files: string[]): Promise<void> {
  const gitRoot = await findGitRoot(cwd);
  if (!gitRoot) {
    throw new Error("Not a git repository");
  }

  // Convert files to relative paths from git root
  const relativePaths = files.map((file) => {
    const absolutePath = path.isAbsolute(file) ? file : path.join(cwd, file);
    return path.relative(gitRoot, absolutePath);
  });

  await execAsync(
    `git reset HEAD ${relativePaths.map((f) => `"${f}"`).join(" ")}`,
    { cwd: gitRoot },
  );
}

/**
 * Revert/discard changes to files
 */
export async function gitRevert(cwd: string, files: string[]): Promise<void> {
  const gitRoot = await findGitRoot(cwd);
  if (!gitRoot) {
    throw new Error("Not a git repository");
  }

  // Convert files to relative paths from git root
  const relativePaths = files.map((file) => {
    const absolutePath = path.isAbsolute(file) ? file : path.join(cwd, file);
    return path.relative(gitRoot, absolutePath);
  });

  await execAsync(
    `git checkout HEAD ${relativePaths.map((f) => `"${f}"`).join(" ")}`,
    { cwd: gitRoot },
  );
}
