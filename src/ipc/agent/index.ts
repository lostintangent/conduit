import { ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  AgentSessionCleanupRequest,
  AgentSessionCleanupResult,
  AgentSessionFinalizeRequest,
  AgentSessionFinalizeResult,
  AgentSessionInfo,
  AgentSessionSpawnRequest,
} from "../../shared/types";
import { getTerminal } from "../terminal/store";
import { getVMAgentClient } from "../vm/agent-client";
import {
  applyDiffPatch,
  createDiffPatch,
  fileExists,
  findRepoRoot,
  getCurrentBranch,
  getGitHubRepoInfo,
  getRemoteOriginUrl,
  gitCommit,
  gitPull,
  gitPush,
  gitRevert,
  gitStage,
  gitUnstage,
  hasGitRepository,
  hasUncommittedChanges,
  hasUnpushedCommits,
  hasUpstreamBranch,
  parseGitHubRepo,
  pushCommitsViaSSH,
  runGit,
  safeGitCommand,
} from "./git";

export type AgentSessionRecord = AgentSessionInfo & {
  worktreeSlug: string;
};

const agentSessions = new Map<string, AgentSessionRecord>();

/**
 * Load existing worktrees from disk and populate the sessions map
 * This is called on startup to restore session state after app restart
 */
async function loadExistingWorktrees(): Promise<void> {
  try {
    const worktreesBase = path.join(os.homedir(), ".conduit", "worktrees");

    // Check if the worktrees directory exists
    const exists = await fileExists(worktreesBase);
    if (!exists) {
      return;
    }

    // Get all repo directories
    const repoDirectories = await readdir(worktreesBase, {
      withFileTypes: true,
    });

    for (const repoDir of repoDirectories) {
      if (!repoDir.isDirectory()) continue;

      const repoWorktreesPath = path.join(worktreesBase, repoDir.name);

      // Get all worktree directories for this repo
      const worktreeDirs = await readdir(repoWorktreesPath, {
        withFileTypes: true,
      });

      for (const worktreeDir of worktreeDirs) {
        if (!worktreeDir.isDirectory()) continue;

        const worktreePath = path.join(repoWorktreesPath, worktreeDir.name);

        // Verify the worktree still exists and is valid
        const stillExists = await fileExists(worktreePath);
        if (!stillExists) continue;

        try {
          // Find the repo root for this worktree
          const repoRoot = await findRepoRoot(worktreePath);
          if (!repoRoot) continue;

          // Get the branch name from the worktree
          const branchResult = await runGit(worktreePath, [
            "rev-parse",
            "--abbrev-ref",
            "HEAD",
          ]);
          const branchName = branchResult.stdout.trim();

          // Get the base ref (the commit this worktree was created from)
          const baseRefResult = await runGit(worktreePath, [
            "rev-parse",
            "HEAD",
          ]);
          const baseRef = baseRefResult.stdout.trim();

          // Try to get the base branch if available
          // For worktrees, we can check the reflog or parse the branch name
          let baseBranch: string | null = null;
          try {
            const reflogResult = await runGit(repoRoot, [
              "reflog",
              "show",
              branchName,
              "-1",
              "--format=%gs",
            ]);
            const reflogMsg = reflogResult.stdout.trim();
            // Message format is like "branch: Created from main"
            const match = reflogMsg.match(/Created from (\S+)/);
            if (match) {
              baseBranch = match[1];
            }
          } catch {
            // If we can't get base branch from reflog, that's okay
          }

          // Parse the worktree slug from the directory name
          const worktreeSlug = worktreeDir.name;

          // Generate a deterministic session ID from the worktree slug
          // This ensures the same worktree gets the same ID across restarts
          const sessionId = randomUUID();

          // Get creation time from directory (best effort - fallback to now)
          const createdAt = Date.now();

          const session: AgentSessionRecord = {
            id: sessionId,
            repoRoot,
            worktreePath,
            branchName,
            baseRef,
            baseBranch,
            createdAt,
            worktreeSlug,
          };

          agentSessions.set(sessionId, session);
          console.log(
            `[Agent] Loaded existing worktree: ${branchName} at ${worktreePath}`,
          );
        } catch (error) {
          console.warn(
            `[Agent] Failed to load worktree ${worktreePath}:`,
            error,
          );
        }
      }
    }

    console.log(`[Agent] Loaded ${agentSessions.size} existing worktrees`);
  } catch (error) {
    console.error("[Agent] Failed to load existing worktrees:", error);
  }
}

function formatTimestampSlug(date: Date) {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(
    date.getHours(),
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function sanitizeForBranch(candidate: string) {
  return candidate.replace(/[^a-zA-Z0-9-]+/g, "-");
}

async function ensureParentDirectories(target: string) {
  const parent = path.dirname(target);
  await mkdir(parent, { recursive: true });
}

export async function spawnAgentSession(
  payload: AgentSessionSpawnRequest,
): Promise<AgentSessionInfo> {
  if (!payload.cwd) {
    throw new Error(
      "A current working directory is required to spawn a session",
    );
  }

  const repoRoot = await findRepoRoot(payload.cwd);
  if (!repoRoot) {
    throw new Error(
      `Unable to find a Git repository root above ${path.resolve(payload.cwd)}`,
    );
  }

  // Try to get the current branch/commit
  let baseRef: string;
  let baseBranch: string | null;

  try {
    const baseBranchResult = await runGit(repoRoot, [
      "rev-parse",
      "--abbrev-ref",
      "HEAD",
    ]);
    baseRef = baseBranchResult.stdout.trim();
    if (baseRef.length === 0) {
      baseRef = "HEAD";
    }

    baseBranch = baseRef === "HEAD" ? null : baseRef;

    if (baseRef === "HEAD") {
      const commit = await runGit(repoRoot, ["rev-parse", "HEAD"]);
      baseRef = commit.stdout.trim();
    }
  } catch (error) {
    // Repository has no commits yet - can't create worktree
    throw new Error(
      "Cannot create worktree: Repository has no commits yet. Please make an initial commit first.",
    );
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

  // Create a unique identifier for this repo based on its path
  const repoIdentifier = path.basename(repoRoot);

  // Use ~/.conduit/worktrees/<repo>/<worktreeSlug> instead of repo/.conduit/worktrees/<worktreeSlug>
  const worktreePath = path.join(
    os.homedir(),
    ".conduit",
    "worktrees",
    repoIdentifier,
    worktreeSlug,
  );

  await ensureParentDirectories(worktreePath);

  const worktreeExists = await fileExists(worktreePath);
  if (worktreeExists) {
    throw new Error(
      `Worktree destination already exists: ${worktreePath}. Please remove it and retry.`,
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
    ({ worktreeSlug: _ignored, ...session }) => ({ ...session }),
  );
}

export async function finalizeAgentSession(
  payload: AgentSessionFinalizeRequest,
): Promise<AgentSessionFinalizeResult> {
  const session = agentSessions.get(payload.sessionId);
  if (!session) {
    throw new Error(
      `Unable to merge agent session ${payload.sessionId}; it no longer exists.`,
    );
  }

  const worktreeExists = await fileExists(session.worktreePath);
  if (!worktreeExists) {
    agentSessions.delete(payload.sessionId);
    throw new Error(
      `Worktree ${session.worktreePath} is missing; cannot finalize session.`,
    );
  }

  const repoStatus = await runGit(session.repoRoot, ["status", "--porcelain"]);
  if (repoStatus.stdout.trim().length > 0) {
    throw new Error(
      "Primary repository has uncommitted changes. Please stash or commit before finalizing an agent session.",
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

    await safeGitCommand(session.repoRoot, [
      "branch",
      "-D",
      session.branchName,
    ]);

    agentSessions.delete(payload.sessionId);

    return {
      status: mergeStdout.includes("Already up to date") ? "noop" : "merged",
      message,
    };
  } catch (error) {
    const message = (error as Error).message ?? "";
    if (/conflict/i.test(message)) {
      await safeGitCommand(session.repoRoot, ["merge", "--abort"]);
      return {
        status: "conflict",
        message: `Merge conflicts detected while integrating ${session.branchName}. Resolve conflicts in ${session.repoRoot}, commit the result, then rerun merge and close or terminate the session.`,
      };
    }

    throw error;
  }
}

export async function cleanupAgentSession(
  payload: AgentSessionCleanupRequest,
): Promise<AgentSessionCleanupResult> {
  const session = agentSessions.get(payload.sessionId);
  if (!session) {
    throw new Error(
      `Unable to clean up agent session ${payload.sessionId}; it no longer exists.`,
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

export async function initializeAgentHandlers() {
  // Load existing worktrees on startup
  await loadExistingWorktrees();

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

  ipcMain.handle("agent:has-git-repo", async (_event, cwd: string) => {
    return await hasGitRepository(cwd);
  });

  ipcMain.handle("agent:get-current-branch", async (_event, cwd: string) => {
    return await getCurrentBranch(cwd);
  });

  ipcMain.handle("agent:get-remote-origin-url", async (_event, cwd: string) => {
    return await getRemoteOriginUrl(cwd);
  });

  ipcMain.handle("agent:get-github-repo-info", async (_event, cwd: string) => {
    return await getGitHubRepoInfo(cwd);
  });

  ipcMain.handle(
    "agent:has-uncommitted-changes",
    async (_event, cwd: string) => {
      return await hasUncommittedChanges(cwd);
    },
  );

  ipcMain.handle("agent:has-unpushed-commits", async (_event, cwd: string) => {
    return await hasUnpushedCommits(cwd);
  });

  ipcMain.handle(
    "agent:push-commits-via-ssh",
    async (
      _event,
      cwd: string,
      sshHost: string,
      sshPort: number,
      sshKeyPath: string,
      remotePath?: string,
    ) => {
      return await pushCommitsViaSSH(
        cwd,
        sshHost,
        sshPort,
        sshKeyPath,
        remotePath,
      );
    },
  );

  ipcMain.handle("agent:create-diff-patch", async (_event, cwd: string) => {
    return await createDiffPatch(cwd);
  });

  ipcMain.handle(
    "agent:apply-diff-patch",
    async (_event, cwd: string, patchData: Buffer) => {
      return await applyDiffPatch(cwd, patchData);
    },
  );

  ipcMain.handle(
    "agent:git-pull",
    async (_event, cwd: string, rebase = false) => {
      return await gitPull(cwd, rebase);
    },
  );

  ipcMain.handle(
    "agent:git-push",
    async (_event, cwd: string, force = false, setUpstream = false) => {
      return await gitPush(cwd, force, setUpstream);
    },
  );

  ipcMain.handle("agent:has-upstream-branch", async (_event, cwd: string) => {
    return await hasUpstreamBranch(cwd);
  });

  ipcMain.handle(
    "agent:git-commit",
    async (_event, cwd: string, message: string) => {
      return await gitCommit(cwd, message);
    },
  );

  ipcMain.handle(
    "agent:git-stage",
    async (_event, cwd: string, files: string[], sessionId?: string) => {
      // Check if this is for a cloud VM session
      if (sessionId) {
        const terminal = getTerminal(sessionId);
        if (terminal?.cloudEnvironment) {
          const vmAgent = getVMAgentClient();
          await vmAgent.gitStage(terminal.cloudEnvironment, cwd, files);
          return { stdout: "", stderr: "" };
        }
      }

      // Local git operation
      return await gitStage(cwd, files);
    },
  );

  ipcMain.handle(
    "agent:git-unstage",
    async (_event, cwd: string, files: string[], sessionId?: string) => {
      // Check if this is for a cloud VM session
      if (sessionId) {
        const terminal = getTerminal(sessionId);
        if (terminal?.cloudEnvironment) {
          const vmAgent = getVMAgentClient();
          await vmAgent.gitUnstage(terminal.cloudEnvironment, cwd, files);
          return { stdout: "", stderr: "" };
        }
      }

      // Local git operation
      return await gitUnstage(cwd, files);
    },
  );

  ipcMain.handle(
    "agent:git-revert",
    async (_event, cwd: string, files: string[], sessionId?: string) => {
      // Check if this is for a cloud VM session
      if (sessionId) {
        const terminal = getTerminal(sessionId);
        if (terminal?.cloudEnvironment) {
          const vmAgent = getVMAgentClient();
          await vmAgent.gitRevert(terminal.cloudEnvironment, cwd, files);
          return { stdout: "", stderr: "" };
        }
      }

      // Local git operation
      return await gitRevert(cwd, files);
    },
  );
}

export {
  getCurrentBranch,
  getGitHubRepoInfo,
  getRemoteOriginUrl,
  hasGitRepository,
  parseGitHubRepo,
};
