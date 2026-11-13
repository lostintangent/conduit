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
