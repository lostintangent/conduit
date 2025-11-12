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

export async function findRepoRoot(startPath: string): Promise<string | null> {
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
 * Push commits to a remote VM via SSH
 * This uses git push directly over SSH instead of creating bundles
 *
 * @param cwd - Current working directory
 * @param sshHost - SSH host (IP or hostname)
 * @param sshPort - SSH port
 * @param sshKeyPath - Path to SSH private key
 * @param remotePath - Path to git repository on remote VM (e.g., /workspace)
 * @returns true if successful, false otherwise
 */
export async function pushCommitsViaSSH(
  cwd: string,
  sshHost: string,
  sshPort: number,
  sshKeyPath: string,
  remotePath = "/workspace",
): Promise<boolean> {
  try {
    const repoRoot = await findRepoRoot(cwd);
    if (!repoRoot) {
      console.error("[Git] No git repository found");
      return false;
    }

    const branch = await getCurrentBranch(repoRoot);
    if (!branch) {
      console.error("[Git] No current branch");
      return false;
    }

    // Check if there are unpushed commits
    const hasUnpushed = await hasUnpushedCommits(repoRoot);
    if (!hasUnpushed) {
      console.log("[Git] No unpushed commits to transfer");
      return true; // Not an error
    }

    // Create temporary remote name
    const remoteName = `conduit-vm-${Date.now()}`;
    const remoteUrl = `ssh://ace@${sshHost}:${sshPort}${remotePath}`;

    console.log(`[Git] Adding temporary remote: ${remoteName} -> ${remoteUrl}`);

    try {
      // Add temporary remote
      await runGit(repoRoot, ["remote", "add", remoteName, remoteUrl]);

      // Configure SSH to use our key and skip host verification
      const sshCommand = `ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -i "${sshKeyPath}" -p ${sshPort}`;

      // Push to the VM using the temporary remote
      // Use --force to handle cases where we're creating a new branch or rebasing
      console.log(`[Git] Pushing ${branch} to VM...`);
      await runGit(repoRoot, [
        "-c",
        `core.sshCommand=${sshCommand}`,
        "push",
        "--force",
        remoteName,
        `${branch}:${branch}`,
      ]);

      console.log(`[Git] Successfully pushed commits to VM`);
      return true;
    } finally {
      // Always remove the temporary remote, even if push failed
      try {
        await runGit(repoRoot, ["remote", "remove", remoteName]);
        console.log(`[Git] Removed temporary remote ${remoteName}`);
      } catch (error) {
        console.warn(`[Git] Failed to remove temporary remote:`, error);
      }
    }
  } catch (error) {
    console.error("[Git] Failed to push commits via SSH:", error);
    return false;
  }
}

/**
 * Create a binary diff patch that includes ONLY working tree changes
 * (staged/unstaged/untracked files), NOT unpushed commits.
 * Unpushed commits are transferred via pushCommitsViaSSH() to preserve history.
 *
 * This creates a patch that can be applied with `git apply` in the VM
 *
 * @param cwd - Current working directory
 * @returns Binary diff as Buffer, or null if no working tree changes
 */
export async function createDiffPatch(cwd: string): Promise<Buffer | null> {
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

    let diffOutput = "";

    // Part 1: Get diff from HEAD to working tree
    // This includes staged and unstaged changes, but NOT unpushed commits
    // By diffing HEAD (not origin/branch), we only get working tree changes
    try {
      const { stdout } = await runGitDiff(repoRoot, [
        "diff",
        "HEAD",
        "--binary",
      ]);
      diffOutput += stdout;
    } catch (error) {
      console.warn("[Git] Failed to create diff from HEAD:", error);
    }

    // Part 2: Handle untracked files by creating patches for them
    const { stdout: statusOutput } = await runGit(repoRoot, [
      "status",
      "--porcelain",
    ]);
    const untrackedFiles = statusOutput
      .split("\n")
      .filter((line) => line.startsWith("??"))
      .map((line) => line.substring(3).trim())
      .filter((file) => file.length > 0);

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

          diffOutput += "\n" + adjustedDiff;
        } catch (error) {
          console.warn(
            `[Git] Failed to create patch for untracked file ${file}:`,
            error,
          );
        }
      }
    }

    if (!diffOutput || diffOutput.trim().length === 0) {
      return null;
    }

    console.log(`[Git] Created working tree patch: ${diffOutput.length} bytes`);
    return Buffer.from(diffOutput, "utf-8");
  } catch (error) {
    console.error("Failed to create diff patch:", error);
    return null;
  }
}

/**
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
