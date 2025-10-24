import { ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type {
  AgentSessionCleanupRequest,
  AgentSessionCleanupResult,
  AgentSessionFinalizeRequest,
  AgentSessionFinalizeResult,
  AgentSessionInfo,
  AgentSessionSpawnRequest,
} from "../../shared/types";

const execFileAsync = promisify(execFile);

export type AgentSessionRecord = AgentSessionInfo & {
  worktreeSlug: string;
};

const agentSessions = new Map<string, AgentSessionRecord>();

async function fileExists(target: string) {
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

async function findRepoRoot(startPath: string): Promise<string | null> {
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

async function runGit(
  cwd: string,
  args: string[]
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

    const stdout = execError.stdout
      ? execError.stdout.toString()
      : "";
    const stderr = execError.stderr
      ? execError.stderr.toString()
      : "";

    const message = stderr.trim().length > 0 ? stderr.trim() : stdout.trim();
    throw new Error(
      `Failed to run git ${args.join(" ")} (code ${execError.code ?? "unknown"}): ${message}`
    );
  }
}

function formatTimestampSlug(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function sanitizeForBranch(candidate: string) {
  return candidate.replace(/[^a-zA-Z0-9\-]+/g, "-");
}

async function ensureParentDirectories(target: string) {
  const parent = path.dirname(target);
  await mkdir(parent, { recursive: true });
}

export async function spawnAgentSession(
  payload: AgentSessionSpawnRequest
): Promise<AgentSessionInfo> {
  if (!payload.cwd) {
    throw new Error("A current working directory is required to spawn a session");
  }

  const repoRoot = await findRepoRoot(payload.cwd);
  if (!repoRoot) {
    throw new Error(
      `Unable to find a Git repository root above ${path.resolve(payload.cwd)}`
    );
  }

  const baseBranchResult = await runGit(repoRoot, [
    "rev-parse",
    "--abbrev-ref",
    "HEAD",
  ]);
  let baseRef = baseBranchResult.stdout.trim();
  if (baseRef.length === 0) {
    baseRef = "HEAD";
  }

  const baseBranch = baseRef === "HEAD" ? null : baseRef;

  if (baseRef === "HEAD") {
    const commit = await runGit(repoRoot, ["rev-parse", "HEAD"]);
    baseRef = commit.stdout.trim();
  }

  const now = new Date();
  const timestampSlug = formatTimestampSlug(now);
  const sessionId = randomUUID();
  let branchBase = payload.preferredName
    ? sanitizeForBranch(payload.preferredName)
    : "session";
  if (!branchBase || branchBase === "-") {
    branchBase = "session";
  }
  const shortId = sessionId.slice(0, 8);
  const branchName = `agent/${timestampSlug}-${branchBase}-${shortId}`;
  const worktreeSlug = `${timestampSlug}-${shortId}`;
  const worktreePath = path.join(repoRoot, ".conduit", "worktrees", worktreeSlug);

  await ensureParentDirectories(worktreePath);

  const worktreeExists = await fileExists(worktreePath);
  if (worktreeExists) {
    throw new Error(
      `Worktree destination already exists: ${worktreePath}. Please remove it and retry.`
    );
  }

  await runGit(repoRoot, [
    "worktree",
    "add",
    "-b",
    branchName,
    worktreePath,
    baseRef,
  ]);

  const session: AgentSessionRecord = {
    id: sessionId,
    repoRoot,
    worktreePath,
    branchName,
    baseRef,
    baseBranch,
    createdAt: now.getTime(),
    worktreeSlug,
  };

  agentSessions.set(sessionId, session);

  return {
    id: session.id,
    repoRoot: session.repoRoot,
    worktreePath: session.worktreePath,
    branchName: session.branchName,
    baseRef: session.baseRef,
    baseBranch: session.baseBranch,
    createdAt: session.createdAt,
  };
}

export function listAgentSessions(): AgentSessionInfo[] {
  return Array.from(agentSessions.values()).map(
    ({ worktreeSlug: _ignored, ...session }) => ({ ...session })
  );
}

async function safeGitCommand(cwd: string, args: string[]) {
  try {
    await runGit(cwd, args);
  } catch (error) {
    console.warn(`Failed to run git ${args.join(" ")}:`, error);
  }
}

export async function finalizeAgentSession(
  payload: AgentSessionFinalizeRequest
): Promise<AgentSessionFinalizeResult> {
  const session = agentSessions.get(payload.sessionId);
  if (!session) {
    throw new Error(
      `Unable to finalize agent session ${payload.sessionId}; it no longer exists.`
    );
  }

  const worktreeExists = await fileExists(session.worktreePath);
  if (!worktreeExists) {
    agentSessions.delete(payload.sessionId);
    throw new Error(
      `Worktree ${session.worktreePath} is missing; cannot finalize session.`
    );
  }

  const repoStatus = await runGit(session.repoRoot, [
    "status",
    "--porcelain",
  ]);
  if (repoStatus.stdout.trim().length > 0) {
    throw new Error(
      "Primary repository has uncommitted changes. Please stash or commit before finalizing an agent session."
    );
  }

  if (session.baseBranch) {
    const currentBranchResult = await runGit(session.repoRoot, [
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]);
    const currentBranch = currentBranchResult.stdout.trim();
    if (currentBranch !== session.baseBranch) {
      await runGit(session.repoRoot, ["checkout", session.baseBranch]);
    }
  }

  const worktreeStatus = await runGit(session.worktreePath, [
    "status",
    "--porcelain",
  ]);

  if (worktreeStatus.stdout.trim().length > 0) {
    await runGit(session.worktreePath, ["add", "-A"]);
    try {
      await runGit(session.worktreePath, [
        "commit",
        "-m",
        `Finalize ${session.branchName}`,
      ]);
    } catch (error) {
      const message = (error as Error).message ?? "";
      if (!/nothing to commit/i.test(message)) {
        throw error;
      }
    }
  }

  try {
    const mergeResult = await runGit(session.repoRoot, [
      "merge",
      "--no-ff",
      session.branchName,
    ]);

    const mergeStdout = mergeResult.stdout.trim();
    const message = mergeStdout.includes("Already up to date")
      ? `No new changes to merge from ${session.branchName}.`
      : `Merged ${session.branchName} into ${session.baseBranch ?? "current branch"}.`;

    await runGit(session.repoRoot, [
      "worktree",
      "remove",
      "--force",
      session.worktreePath,
    ]);

    await safeGitCommand(session.repoRoot, ["branch", "-D", session.branchName]);

    agentSessions.delete(payload.sessionId);

    return {
      status: mergeStdout.includes("Already up to date")
        ? "noop"
        : "merged",
      message,
    };
  } catch (error) {
    const message = (error as Error).message ?? "";
    if (/conflict/i.test(message)) {
      await safeGitCommand(session.repoRoot, ["merge", "--abort"]);
      return {
        status: "conflict",
        message:
          `Merge conflicts detected while integrating ${session.branchName}. Resolve conflicts in ${session.repoRoot}, commit the result, then rerun finalize or abandon the session if you no longer need it.`,
      };
    }

    throw error;
  }
}

export async function cleanupAgentSession(
  payload: AgentSessionCleanupRequest
): Promise<AgentSessionCleanupResult> {
  const session = agentSessions.get(payload.sessionId);
  if (!session) {
    throw new Error(
      `Unable to clean up agent session ${payload.sessionId}; it no longer exists.`
    );
  }

  const worktreeExists = await fileExists(session.worktreePath);
  if (worktreeExists) {
    await runGit(session.repoRoot, [
      "worktree",
      "remove",
      "--force",
      session.worktreePath,
    ]);
  }

  await safeGitCommand(session.repoRoot, ["branch", "-D", session.branchName]);

  agentSessions.delete(payload.sessionId);

  return {
    status: worktreeExists ? "removed" : "missing",
    message: worktreeExists
      ? `Removed agent worktree ${session.branchName}.`
      : `Worktree already missing; cleaned up metadata for ${session.branchName}.`,
  };
}

export function initializeAgentHandlers() {
  ipcMain.handle("agent:spawn-session", async (_event, payload) => {
    return await spawnAgentSession(payload);
  });

  ipcMain.handle("agent:list-sessions", async () => listAgentSessions());

  ipcMain.handle("agent:finalize-session", async (_event, payload) => {
    return await finalizeAgentSession(payload);
  });

  ipcMain.handle("agent:cleanup-session", async (_event, payload) => {
    return await cleanupAgentSession(payload);
  });
}
