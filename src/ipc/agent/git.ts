import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function fileExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

/**
 * Find the main repository root from any git directory (including worktrees).
 * For worktrees, this returns the main repository path, not the worktree path.
 * This ensures operations like `git worktree list/remove` work correctly.
 */
export async function findRepoRoot(startPath: string): Promise<string | null> {
  try {
    // Use git rev-parse --git-common-dir to find the main .git directory
    // This works correctly for both regular repos and worktrees
    const { stdout } = await execFileAsync(
      "git",
      ["rev-parse", "--git-common-dir"],
      {
        cwd: startPath,
        env: {
          ...process.env,
          LC_ALL: "C",
        },
        windowsHide: true,
      },
    );

    const gitCommonDir = stdout.trim();

    // If gitCommonDir is ".git", we're in the main repo - find the toplevel
    if (gitCommonDir === ".git") {
      const { stdout: toplevel } = await execFileAsync(
        "git",
        ["rev-parse", "--show-toplevel"],
        {
          cwd: startPath,
          env: {
            ...process.env,
            LC_ALL: "C",
          },
          windowsHide: true,
        },
      );
      return toplevel.trim();
    }

    // Otherwise, gitCommonDir is an absolute or relative path to the main .git
    // The main repo root is the parent of the .git directory
    const absoluteGitDir = path.isAbsolute(gitCommonDir)
      ? gitCommonDir
      : path.resolve(startPath, gitCommonDir);

    // The main repo root is the parent directory of .git
    return path.dirname(absoluteGitDir);
  } catch {
    // Fall back to manual traversal if git command fails (e.g., not in a git repo)
    return findRepoRootManual(startPath);
  }
}

/**
 * Manual fallback for finding repo root by traversing directories.
 * Used when git commands fail (e.g., git not installed or not in a repo).
 */
async function findRepoRootManual(startPath: string): Promise<string | null> {
  let current = path.resolve(startPath);

  while (true) {
    const gitPath = path.join(current, ".git");
    if (await fileExists(gitPath)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

export async function runGit(
  cwd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      env: {
        ...process.env,
        LC_ALL: "C",
      },
      windowsHide: true,
    });

    return {
      stdout: stdout?.toString() ?? "",
      stderr: stderr?.toString() ?? "",
    };
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };

    const stdout = execError.stdout ? execError.stdout.toString() : "";
    const stderr = execError.stderr ? execError.stderr.toString() : "";

    const message = stderr.trim().length > 0 ? stderr.trim() : stdout.trim();
    throw new Error(
      `Failed to run git ${args.join(" ")} (code ${execError.code ?? "unknown"}): ${message}`,
    );
  }
}

/**
 * Run git diff command - exit code 1 means differences found, which is expected
 */
async function runGitDiff(
  cwd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync("git", args, {
      cwd,
      env: {
        ...process.env,
        LC_ALL: "C",
      },
      windowsHide: true,
    });

    return {
      stdout: stdout?.toString() ?? "",
      stderr: stderr?.toString() ?? "",
    };
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      code?: number;
    };

    // Exit code 1 for git diff means differences were found - this is not an error
    if (execError.code === 1) {
      return {
        stdout: execError.stdout ? execError.stdout.toString() : "",
        stderr: execError.stderr ? execError.stderr.toString() : "",
      };
    }

    const stdout = execError.stdout ? execError.stdout.toString() : "";
    const stderr = execError.stderr ? execError.stderr.toString() : "";
    const message = stderr.trim().length > 0 ? stderr.trim() : stdout.trim();
    throw new Error(
      `Failed to run git ${args.join(" ")} (code ${execError.code ?? "unknown"}): ${message}`,
    );
  }
}

export async function safeGitCommand(cwd: string, args: string[]) {
  try {
    await runGit(cwd, args);
  } catch (error) {
    console.warn(`Failed to run git ${args.join(" ")}:`, error);
  }
}

export async function hasGitRepository(cwd: string): Promise<boolean> {
  try {
    const repoRoot = await findRepoRoot(cwd);
    return repoRoot !== null;
  } catch {
    return false;
  }
}

/**
 * Get the current git branch name
 */
export async function getCurrentBranch(cwd: string): Promise<string | null> {
  try {
    const repoRoot = await findRepoRoot(cwd);
    if (!repoRoot) {
      return null;
    }

    const { stdout } = await runGit(repoRoot, [
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Get the remote origin URL
 */
export async function getRemoteOriginUrl(cwd: string): Promise<string | null> {
  try {
    const repoRoot = await findRepoRoot(cwd);
    if (!repoRoot) {
      return null;
    }

    const { stdout } = await runGit(repoRoot, [
      "config",
      "--get",
      "remote.origin.url",
    ]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/**
 * Parse GitHub owner and repo name from a git remote URL
 * Supports both HTTPS and SSH formats:
 * - https://github.com/owner/repo.git
 * - git@github.com:owner/repo.git
 */
export function parseGitHubRepo(
  remoteUrl: string,
): { owner: string; name: string } | null {
  try {
    // Remove trailing .git if present
    const cleanUrl = remoteUrl.replace(/\.git$/, "");

    // Try HTTPS format: https://github.com/owner/repo
    const httpsMatch = cleanUrl.match(
      /https?:\/\/github\.com\/([^/]+)\/([^/]+)/,
    );
    if (httpsMatch) {
      return {
        owner: httpsMatch[1],
        name: httpsMatch[2],
      };
    }

    // Try SSH format: git@github.com:owner/repo
    const sshMatch = cleanUrl.match(/git@github\.com:([^/]+)\/(.+)/);
    if (sshMatch) {
      return {
        owner: sshMatch[1],
        name: sshMatch[2],
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get GitHub repository info (owner, repo, branch) from current directory
 * Also checks if the current branch exists on remote
 */
export async function getGitHubRepoInfo(cwd: string): Promise<{
  owner: string;
  name: string;
  branch: string;
  branchExistsOnRemote: boolean;
  defaultBranch: string;
} | null> {
  try {
    const [remoteUrl, branch] = await Promise.all([
      getRemoteOriginUrl(cwd),
      getCurrentBranch(cwd),
    ]);

    if (!remoteUrl || !branch) {
      return null;
    }

    const repoInfo = parseGitHubRepo(remoteUrl);
    if (!repoInfo) {
      return null;
    }

    const repoRoot = await findRepoRoot(cwd);
    if (!repoRoot) {
      return null;
    }

    // Check if current branch exists on remote
    const branchExists = await branchExistsOnRemote(cwd, branch);

    // Get the actual default branch from remote
    let defaultBranch = "main"; // fallback
    try {
      const { stdout } = await runGit(repoRoot, [
        "ls-remote",
        "--symref",
        "origin",
        "HEAD",
      ]);
      // Output is like "ref: refs/heads/main	HEAD"
      const match = stdout.match(/ref: refs\/heads\/(\S+)/);
      if (match) {
        defaultBranch = match[1];
      }
    } catch {
      // Fallback: assume main, or master if main doesn't exist
      const mainExists = await branchExistsOnRemote(cwd, "main");
      if (!mainExists) {
        defaultBranch = "master";
      }
    }

    return {
      owner: repoInfo.owner,
      name: repoInfo.name,
      branch,
      branchExistsOnRemote: branchExists,
      defaultBranch,
    };
  } catch {
    return null;
  }
}

/**
 * Check if there are uncommitted changes (staged or unstaged)
 */
export async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  try {
    const repoRoot = await findRepoRoot(cwd);
    if (!repoRoot) {
      return false;
    }

    const { stdout } = await runGit(repoRoot, ["status", "--porcelain"]);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if a branch exists on the remote origin
 * @param cwd - Current working directory
 * @param branch - Branch name to check
 * @returns true if branch exists on remote, false otherwise
 */
export async function branchExistsOnRemote(
  cwd: string,
  branch: string,
): Promise<boolean> {
  try {
    const repoRoot = await findRepoRoot(cwd);
    if (!repoRoot) {
      return false;
    }

    // Check if origin/branch exists
    const { stdout } = await runGit(repoRoot, [
      "ls-remote",
      "--heads",
      "origin",
      branch,
    ]);

    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if there are unpushed commits on the current branch
 */
export async function hasUnpushedCommits(cwd: string): Promise<boolean> {
  try {
    const repoRoot = await findRepoRoot(cwd);
    if (!repoRoot) {
      return false;
    }

    const branch = await getCurrentBranch(repoRoot);
    if (!branch) {
      return false;
    }

    // Check if remote tracking branch exists
    try {
      const { stdout } = await runGit(repoRoot, [
        "rev-list",
        `origin/${branch}..HEAD`,
        "--count",
      ]);
      const count = parseInt(stdout.trim(), 10);
      return count > 0;
    } catch {
      // Remote branch might not exist yet, check if we have any commits
      const { stdout } = await runGit(repoRoot, [
        "rev-list",
        "HEAD",
        "--count",
      ]);
      const count = parseInt(stdout.trim(), 10);
      return count > 0;
    }
  } catch {
    return false;
  }
}

/**
 * Create a binary diff patch that includes ONLY working tree changes
 * (staged/unstaged/untracked files), NOT unpushed commits.
 *
 * This creates patches that preserve staging state when applied with `git apply`
 *
 * @param cwd - Current working directory
 * @returns Object with staged and unstaged patches, or null if no working tree changes
 */
export async function createDiffPatch(cwd: string): Promise<{
  stagedPatch: Buffer | null;
  unstagedPatch: Buffer | null;
  untrackedPatch: Buffer | null;
} | null> {
  try {
    const repoRoot = await findRepoRoot(cwd);
    if (!repoRoot) {
      return null;
    }

    // Check if there are any uncommitted changes
    const hasUncommitted = await hasUncommittedChanges(repoRoot);
    if (!hasUncommitted) {
      return null;
    }

    let stagedDiff = "";
    let unstagedDiff = "";
    let untrackedDiff = "";

    // Part 1: Get diff for staged changes (index vs HEAD)
    try {
      const { stdout } = await runGitDiff(repoRoot, [
        "diff",
        "--cached",
        "--binary",
      ]);
      stagedDiff = stdout;
    } catch (error) {
      console.warn("[Git] Failed to create staged diff:", error);
    }

    // Part 2: Get diff for unstaged changes (working tree vs index)
    try {
      const { stdout } = await runGitDiff(repoRoot, ["diff", "--binary"]);
      unstagedDiff = stdout;
    } catch (error) {
      console.warn("[Git] Failed to create unstaged diff:", error);
    }

    // Part 3: Handle untracked files by creating patches for them
    const { stdout: statusOutput } = await runGit(repoRoot, [
      "status",
      "--porcelain",
    ]);
    const untrackedEntries = statusOutput
      .split("\n")
      .filter((line) => line.startsWith("??"))
      .map((line) => line.substring(3).trim())
      .filter((entry) => entry.length > 0);

    // Expand directories to individual files
    const untrackedFiles: string[] = [];
    for (const entry of untrackedEntries) {
      if (entry.endsWith("/")) {
        // It's a directory - find all files inside it
        try {
          const dirPath = entry.slice(0, -1); // Remove trailing slash
          const { stdout: filesInDir } = await runGit(repoRoot, [
            "ls-files",
            "--others",
            "--exclude-standard",
            dirPath,
          ]);
          const files = filesInDir
            .split("\n")
            .map((f) => f.trim())
            .filter((f) => f.length > 0);
          untrackedFiles.push(...files);
          console.log(
            `[Git] Expanded directory ${entry} to ${files.length} files`,
          );
        } catch (error) {
          console.warn(`[Git] Failed to expand directory ${entry}:`, error);
        }
      } else {
        untrackedFiles.push(entry);
      }
    }

    if (untrackedFiles.length > 0) {
      console.log(
        `[Git] Found ${untrackedFiles.length} untracked files, adding to patch`,
      );

      for (const file of untrackedFiles) {
        try {
          // Create a patch for adding this new file
          const { stdout: fileDiff } = await runGitDiff(repoRoot, [
            "diff",
            "--no-index",
            "--binary",
            "/dev/null",
            file,
          ]);

          // Adjust diff headers to use a/file and b/file format
          const adjustedDiff = fileDiff
            .replace(/^--- \/dev\/null/m, "--- /dev/null")
            .replace(/^\+\+\+ .*$/m, `+++ b/${file}`);

          untrackedDiff += (untrackedDiff ? "\n" : "") + adjustedDiff;
        } catch (error) {
          console.warn(
            `[Git] Failed to create patch for untracked file ${file}:`,
            error,
          );
        }
      }
    }

    // Return null if no changes at all
    if (!stagedDiff.trim() && !unstagedDiff.trim() && !untrackedDiff.trim()) {
      return null;
    }

    const result = {
      stagedPatch: stagedDiff.trim() ? Buffer.from(stagedDiff, "utf-8") : null,
      unstagedPatch: unstagedDiff.trim()
        ? Buffer.from(unstagedDiff, "utf-8")
        : null,
      untrackedPatch: untrackedDiff.trim()
        ? Buffer.from(untrackedDiff, "utf-8")
        : null,
    };

    console.log(`[Git] Created patches:`);
    if (result.stagedPatch) {
      console.log(`  - Staged: ${result.stagedPatch.length} bytes`);
    }
    if (result.unstagedPatch) {
      console.log(`  - Unstaged: ${result.unstagedPatch.length} bytes`);
    }
    if (result.untrackedPatch) {
      console.log(`  - Untracked: ${result.untrackedPatch.length} bytes`);
    }

    return result;
  } catch (error) {
    console.error("Failed to create diff patch:", error);
    return null;
  }
} /**
 * Apply a diff patch to the working directory
 *
 * @param cwd - Current working directory
 * @param patchData - The patch data as Buffer
 * @returns true if successful, false otherwise
 */
export async function applyDiffPatch(
  cwd: string,
  patchData: Buffer,
): Promise<boolean> {
  try {
    const repoRoot = await findRepoRoot(cwd);
    if (!repoRoot) {
      return false;
    }

    // Apply the patch using git apply
    // --binary flag handles binary files
    // --index applies to both index and working tree
    const { spawn } = await import("node:child_process");

    return new Promise((resolve) => {
      const gitApply = spawn("git", ["apply", "--binary", "--index"], {
        cwd: repoRoot,
        env: {
          ...process.env,
          LC_ALL: "C",
        },
      });

      gitApply.stdin.write(patchData);
      gitApply.stdin.end();

      let stderr = "";

      gitApply.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      gitApply.on("close", (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          console.error("Failed to apply patch:", stderr);
          resolve(false);
        }
      });

      gitApply.on("error", (error) => {
        console.error("Failed to spawn git apply:", error);
        resolve(false);
      });
    });
  } catch (error) {
    console.error("Failed to apply diff patch:", error);
    return false;
  }
}

/**
 * Pull changes from remote repository
 */
export async function gitPull(
  cwd: string,
  rebase = false,
): Promise<{ stdout: string; stderr: string }> {
  const args = ["pull"];
  if (rebase) {
    args.push("--rebase");
  }

  return await runGit(cwd, args);
}

/**
 * Push changes to remote repository
 */
export async function gitPush(
  cwd: string,
  force = false,
  setUpstream = false,
): Promise<{ stdout: string; stderr: string }> {
  const args = ["push"];
  if (force) {
    args.push("--force-with-lease");
  }
  if (setUpstream) {
    args.push("--set-upstream", "origin", "HEAD");
  }

  return await runGit(cwd, args);
}

/**
 * Check if the current branch has an upstream (tracking) branch
 */
export async function hasUpstreamBranch(cwd: string): Promise<boolean> {
  try {
    const result = await runGit(cwd, [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{u}",
    ]);
    return result.stdout.trim().length > 0;
  } catch {
    // Command fails if no upstream is set
    return false;
  }
}

/**
 * Commit staged changes with a message
 */
export async function gitCommit(
  cwd: string,
  message: string,
): Promise<{ stdout: string; stderr: string }> {
  const args = ["commit", "-m", message];
  return await runGit(cwd, args);
}

/**
 * Stage files (add to index)
 */
export async function gitStage(
  cwd: string,
  files: string[],
): Promise<{ stdout: string; stderr: string }> {
  const args = ["add", "--", ...files];
  return await runGit(cwd, args);
}

/**
 * Unstage files (reset from index)
 */
export async function gitUnstage(
  cwd: string,
  files: string[],
): Promise<{ stdout: string; stderr: string }> {
  const args = ["reset", "HEAD", "--", ...files];
  return await runGit(cwd, args);
}

/**
 * Sanitize file path to use forward slashes (required for git on Windows)
 */
function sanitizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

/**
 * Revert/discard changes to files (restore from index/HEAD)
 * This handles deleted files, modified files, and staged changes.
 */
export async function gitRevert(
  cwd: string,
  files: string[],
): Promise<{ stdout: string; stderr: string }> {
  // Find git repository root
  const gitRoot = await findRepoRoot(cwd);
  if (!gitRoot) {
    throw new Error("Not in a git repository");
  }

  // Convert file paths to be relative to git root and sanitize
  const relativePaths = files.map((file) => {
    // If path is already relative, use it as-is
    if (!path.isAbsolute(file)) {
      return sanitizePath(file);
    }
    // Convert absolute path to relative path from git root
    const relative = path.relative(gitRoot, file);
    return sanitizePath(relative);
  });

  // Use git restore if available (Git 2.23+), otherwise fall back to checkout
  // git restore is the modern way to discard changes
  try {
    // Try git restore first (restores working tree from index)
    const args = ["restore", "--", ...relativePaths];
    return await runGit(gitRoot, args);
  } catch {
    // Fall back to git checkout for older git versions
    const args = ["checkout", "--", ...relativePaths];
    return await runGit(gitRoot, args);
  }
}
