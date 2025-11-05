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

    const { stdout } = await runGit(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
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

    const { stdout } = await runGit(repoRoot, ["config", "--get", "remote.origin.url"]);
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
export function parseGitHubRepo(remoteUrl: string): { owner: string; name: string } | null {
  try {
    // Remove trailing .git if present
    const cleanUrl = remoteUrl.replace(/\.git$/, "");

    // Try HTTPS format: https://github.com/owner/repo
    const httpsMatch = cleanUrl.match(/https?:\/\/github\.com\/([^/]+)\/([^/]+)/);
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
 */
export async function getGitHubRepoInfo(cwd: string): Promise<{
  owner: string;
  name: string;
  branch: string;
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

    return {
      owner: repoInfo.owner,
      name: repoInfo.name,
      branch,
    };
  } catch {
    return null;
  }
}
