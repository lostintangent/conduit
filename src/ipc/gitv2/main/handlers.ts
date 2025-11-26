/**
 * Git v2 IPC Handlers - Main process handlers for git operations.
 *
 * This module registers IPC handlers that expose the GitProvider API
 * to renderer processes. It handles:
 * - Git status and diff operations
 * - Staging and commit operations
 * - Branch operations
 * - Event subscriptions for status/branch changes
 *
 * IPC Channels:
 * - `git-v2:status` - Get git status
 * - `git-v2:file-status` - Get status for a specific file
 * - `git-v2:file-diff` - Get file diff
 * - `git-v2:file-at-ref` - Get file content at a specific ref
 * - `git-v2:stage` - Stage files
 * - `git-v2:unstage` - Unstage files
 * - `git-v2:commit` - Create a commit
 * - `git-v2:branch` - Get current branch
 * - `git-v2:branches` - Get all branches
 * - `git-v2:checkout` - Checkout a branch or ref
 * - `git-v2:has-uncommitted-changes` - Check if repo has uncommitted changes
 * - `git-v2:has-unpushed-commits` - Check if repo has unpushed commits
 * - `git-v2:changed-files-from-branch` - Get files changed from base branch
 * - `git-v2:uncommitted-diff-stats` - Get diff stats for uncommitted changes
 * - `git-v2:most-recent-dirty-file` - Get most recently modified dirty file
 * - `git-v2:most-recent-committed-file` - Get most recently modified file from commits
 * - `git-v2:revert` - Discard local file changes
 * - `git-v2:subscribe` - Subscribe to git events
 * - `git-v2:unsubscribe` - Unsubscribe from events
 * - `git-v2:release` - Release provider reference
 *
 * Map Serialization:
 * Git status contains a Map<string, GitFileStatus>. Since Maps can't be
 * serialized over IPC, we convert them to plain objects for transport and
 * the renderer reconstructs the Map.
 *
 * @see docs/architecture/filesystem-provider-design-narrative.md
 */

import { ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import type { DiskGitProvider } from "../providers/DiskGitProvider";
import type {
  GitStatus,
  GitFileStatus,
  GitCommit,
  GitBranch,
  GitCommitOptions,
} from "../types";
import {
  getGitProvider,
  releaseGitProvider,
  addGitSubscription,
} from "../../fsv2/main/windowTracking";

// ============================================================================
// Types
// ============================================================================

/**
 * Serialized git status for IPC transport.
 *
 * The files Map is converted to a plain object.
 */
interface SerializedGitStatus {
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  files: Record<string, GitFileStatus>;
}

/**
 * Serialized git commit for IPC transport.
 */
interface SerializedGitCommit {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: number; // Timestamp instead of Date
  message: string;
  parents: string[];
}

/**
 * Serialized git branch for IPC transport.
 */
interface SerializedGitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  commit: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  lastCommitDate?: number; // Timestamp instead of Date
  lastCommitMessage?: string;
}

/**
 * Serialized diff stats for IPC transport.
 */
interface SerializedDiffStats {
  added: number;
  removed: number;
  files: number;
}

/**
 * Subscription tracking for event forwarding.
 */
interface Subscription {
  id: string;
  windowId: number;
  gitRoot: string;
  dispose: () => void;
}

// ============================================================================
// State
// ============================================================================

/** Active subscriptions by ID */
const subscriptions = new Map<string, Subscription>();

/** Counter for generating unique subscription IDs */
let subscriptionIdCounter = 0;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get window ID from IPC event.
 */
function getWindowId(event: IpcMainInvokeEvent): number {
  return event.sender.id;
}

/**
 * Generate a unique subscription ID.
 */
function generateSubscriptionId(): string {
  return `git-sub-${++subscriptionIdCounter}`;
}

/**
 * Serialize a GitStatus for IPC transport.
 *
 * Converts the files Map to a plain object.
 */
function serializeGitStatus(status: GitStatus): SerializedGitStatus {
  const files: Record<string, GitFileStatus> = {};

  for (const [path, fileStatus] of status.files) {
    files[path] = fileStatus;
  }

  return {
    branch: status.branch,
    upstream: status.upstream,
    ahead: status.ahead,
    behind: status.behind,
    files,
  };
}

/**
 * Serialize a GitCommit for IPC transport.
 */
function serializeGitCommit(commit: GitCommit): SerializedGitCommit {
  return {
    hash: commit.hash,
    shortHash: commit.shortHash,
    author: commit.author,
    email: commit.email,
    date: commit.date.getTime(),
    message: commit.message,
    parents: commit.parents,
  };
}

/**
 * Serialize a GitBranch for IPC transport.
 */
function serializeGitBranch(branch: GitBranch): SerializedGitBranch {
  return {
    name: branch.name,
    isCurrent: branch.isCurrent,
    isRemote: branch.isRemote,
    commit: branch.commit,
    upstream: branch.upstream,
    ahead: branch.ahead,
    behind: branch.behind,
    lastCommitDate: branch.lastCommitDate?.getTime(),
    lastCommitMessage: branch.lastCommitMessage,
  };
}

/**
 * Send event to renderer if the WebContents is still valid.
 */
function sendToRenderer(
  sender: WebContents,
  channel: string,
  payload: unknown,
): void {
  if (!sender.isDestroyed()) {
    sender.send(channel, payload);
  }
}

// ============================================================================
// IPC Handlers
// ============================================================================

/**
 * Initialize all Git v2 IPC handlers.
 *
 * Call this during main process initialization.
 */
export function initializeGitV2Handlers(): void {
  // -------------------------------------------------------------------------
  // Status Operations
  // -------------------------------------------------------------------------

  ipcMain.handle(
    "git-v2:status",
    async (
      event,
      params: { cwd: string },
    ): Promise<SerializedGitStatus | null> => {
      const windowId = getWindowId(event);
      const result = await getGitProvider(windowId, params.cwd);

      if (!result) {
        return null; // Not a git repository
      }

      const { provider, gitRoot } = result;

      try {
        const status = await provider.getStatus();
        return serializeGitStatus(status);
      } finally {
        releaseGitProvider(windowId, gitRoot);
      }
    },
  );

  ipcMain.handle(
    "git-v2:file-status",
    async (
      event,
      params: { cwd: string; filePath: string },
    ): Promise<GitFileStatus | null> => {
      const windowId = getWindowId(event);
      const result = await getGitProvider(windowId, params.cwd);

      if (!result) {
        return null;
      }

      const { provider, gitRoot } = result;

      try {
        return await provider.getFileStatus(params.filePath);
      } finally {
        releaseGitProvider(windowId, gitRoot);
      }
    },
  );

  ipcMain.handle(
    "git-v2:has-uncommitted-changes",
    async (event, params: { cwd: string }): Promise<boolean> => {
      const windowId = getWindowId(event);
      const result = await getGitProvider(windowId, params.cwd);

      if (!result) {
        return false;
      }

      const { provider, gitRoot } = result;

      try {
        return await provider.hasUncommittedChanges();
      } finally {
        releaseGitProvider(windowId, gitRoot);
      }
    },
  );

  ipcMain.handle(
    "git-v2:has-unpushed-commits",
    async (event, params: { cwd: string }): Promise<boolean> => {
      const windowId = getWindowId(event);
      const result = await getGitProvider(windowId, params.cwd);

      if (!result) {
        return false;
      }

      const { provider, gitRoot } = result;

      try {
        return await provider.hasUnpushedCommits();
      } finally {
        releaseGitProvider(windowId, gitRoot);
      }
    },
  );

  ipcMain.handle(
    "git-v2:changed-files-from-branch",
    async (
      event,
      params: { cwd: string; baseBranch: string },
    ): Promise<string[]> => {
      const windowId = getWindowId(event);
      const result = await getGitProvider(windowId, params.cwd);

      if (!result) {
        return [];
      }

      const { provider, gitRoot } = result;

      try {
        return await provider.getChangedFilesFromBranch(params.baseBranch);
      } finally {
        releaseGitProvider(windowId, gitRoot);
      }
    },
  );

  ipcMain.handle(
    "git-v2:uncommitted-diff-stats",
    async (event, params: { cwd: string }): Promise<SerializedDiffStats> => {
      const windowId = getWindowId(event);
      const result = await getGitProvider(windowId, params.cwd);

      if (!result) {
        return { added: 0, removed: 0, files: 0 };
      }

      const { provider, gitRoot } = result;

      try {
        return await provider.getUncommittedDiffStats();
      } finally {
        releaseGitProvider(windowId, gitRoot);
      }
    },
  );

  ipcMain.handle(
    "git-v2:most-recent-dirty-file",
    async (event, params: { cwd: string }): Promise<string | null> => {
      const windowId = getWindowId(event);
      const result = await getGitProvider(windowId, params.cwd);

      if (!result) {
        return null;
      }

      const { provider, gitRoot } = result;

      try {
        return await provider.getMostRecentDirtyFile();
      } finally {
        releaseGitProvider(windowId, gitRoot);
      }
    },
  );

  ipcMain.handle(
    "git-v2:most-recent-committed-file",
    async (
      event,
      params: { cwd: string; commitLimit?: number },
    ): Promise<string | null> => {
      const windowId = getWindowId(event);
      const result = await getGitProvider(windowId, params.cwd);

      if (!result) {
        return null;
      }

      const { provider, gitRoot } = result;

      try {
        return await provider.getMostRecentCommittedFile(params.commitLimit);
      } finally {
        releaseGitProvider(windowId, gitRoot);
      }
    },
  );

  ipcMain.handle(
    "git-v2:revert",
    async (event, params: { cwd: string; files: string[] }): Promise<void> => {
      const windowId = getWindowId(event);
      const result = await getGitProvider(windowId, params.cwd);

      if (!result) {
        throw new Error("Not a git repository");
      }

      const { provider, gitRoot } = result;

      try {
        await provider.revert(params.files);
      } finally {
        releaseGitProvider(windowId, gitRoot);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Diff Operations
  // -------------------------------------------------------------------------

  ipcMain.handle(
    "git-v2:file-diff",
    async (
      event,
      params: { cwd: string; filePath: string; staged?: boolean },
    ): Promise<string | null> => {
      const windowId = getWindowId(event);
      const result = await getGitProvider(windowId, params.cwd);

      if (!result) {
        return null;
      }

      const { provider, gitRoot } = result;

      try {
        return await provider.getFileDiff(params.filePath, params.staged);
      } finally {
        releaseGitProvider(windowId, gitRoot);
      }
    },
  );

  ipcMain.handle(
    "git-v2:file-at-ref",
    async (
      event,
      params: { cwd: string; filePath: string; ref: string },
    ): Promise<string | null> => {
      const windowId = getWindowId(event);
      const result = await getGitProvider(windowId, params.cwd);

      if (!result) {
        return null;
      }

      const { provider, gitRoot } = result;

      try {
        return await provider.getFileAtRef(params.filePath, params.ref);
      } finally {
        releaseGitProvider(windowId, gitRoot);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Staging Operations
  // -------------------------------------------------------------------------

  ipcMain.handle(
    "git-v2:stage",
    async (event, params: { cwd: string; files: string[] }): Promise<void> => {
      const windowId = getWindowId(event);
      const result = await getGitProvider(windowId, params.cwd);

      if (!result) {
        throw new Error("Not a git repository");
      }

      const { provider, gitRoot } = result;

      try {
        await provider.stage(params.files);
      } finally {
        releaseGitProvider(windowId, gitRoot);
      }
    },
  );

  ipcMain.handle(
    "git-v2:unstage",
    async (event, params: { cwd: string; files: string[] }): Promise<void> => {
      const windowId = getWindowId(event);
      const result = await getGitProvider(windowId, params.cwd);

      if (!result) {
        throw new Error("Not a git repository");
      }

      const { provider, gitRoot } = result;

      try {
        await provider.unstage(params.files);
      } finally {
        releaseGitProvider(windowId, gitRoot);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Commit Operations
  // -------------------------------------------------------------------------

  ipcMain.handle(
    "git-v2:commit",
    async (
      event,
      params: { cwd: string; message: string; options?: GitCommitOptions },
    ): Promise<SerializedGitCommit | null> => {
      const windowId = getWindowId(event);
      const result = await getGitProvider(windowId, params.cwd);

      if (!result) {
        throw new Error("Not a git repository");
      }

      const { provider, gitRoot } = result;

      try {
        const commit = await provider.commit(params.message, params.options);
        return serializeGitCommit(commit);
      } finally {
        releaseGitProvider(windowId, gitRoot);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Branch Operations
  // -------------------------------------------------------------------------

  ipcMain.handle(
    "git-v2:branch",
    async (event, params: { cwd: string }): Promise<string | null> => {
      const windowId = getWindowId(event);
      const result = await getGitProvider(windowId, params.cwd);

      if (!result) {
        return null;
      }

      const { provider, gitRoot } = result;

      try {
        return await provider.getCurrentBranch();
      } finally {
        releaseGitProvider(windowId, gitRoot);
      }
    },
  );

  ipcMain.handle(
    "git-v2:branches",
    async (event, params: { cwd: string }): Promise<SerializedGitBranch[]> => {
      const windowId = getWindowId(event);
      const result = await getGitProvider(windowId, params.cwd);

      if (!result) {
        return [];
      }

      const { provider, gitRoot } = result;

      try {
        const branches = await provider.getBranches();
        return branches.map(serializeGitBranch);
      } finally {
        releaseGitProvider(windowId, gitRoot);
      }
    },
  );

  ipcMain.handle(
    "git-v2:checkout",
    async (event, params: { cwd: string; ref: string }): Promise<void> => {
      const windowId = getWindowId(event);
      const result = await getGitProvider(windowId, params.cwd);

      if (!result) {
        throw new Error("Not a git repository");
      }

      const { provider, gitRoot } = result;

      try {
        await provider.checkout(params.ref);
      } finally {
        releaseGitProvider(windowId, gitRoot);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Event Subscriptions
  // -------------------------------------------------------------------------

  ipcMain.handle(
    "git-v2:subscribe",
    async (event, params: { cwd: string }): Promise<string | null> => {
      const windowId = getWindowId(event);
      const result = await getGitProvider(windowId, params.cwd);

      if (!result) {
        return null; // Not a git repository
      }

      const { provider, gitRoot } = result;
      const subscriptionId = generateSubscriptionId();

      const disposables: Array<{ dispose: () => void }> = [];

      // Subscribe to status changes
      const statusSub = provider.onStatusChanged((e) => {
        sendToRenderer(event.sender, "git-v2:status-changed", {
          subscriptionId,
          gitRoot,
          status: serializeGitStatus(e.status),
          added: e.added,
          modified: e.modified,
          removed: e.removed,
        });
      });
      disposables.push(statusSub);

      // Subscribe to branch changes
      const branchSub = provider.onBranchChanged((e) => {
        sendToRenderer(event.sender, "git-v2:branch-changed", {
          subscriptionId,
          gitRoot,
          previousBranch: e.previousBranch,
          currentBranch: e.currentBranch,
        });
      });
      disposables.push(branchSub);

      // Subscribe to commit creation
      const commitSub = provider.onCommitCreated((e) => {
        sendToRenderer(event.sender, "git-v2:commit-created", {
          subscriptionId,
          gitRoot,
          commit: serializeGitCommit(e.commit),
        });
      });
      disposables.push(commitSub);

      // Subscribe to HEAD changes
      const headSub = provider.onHeadChanged((e) => {
        sendToRenderer(event.sender, "git-v2:head-changed", {
          subscriptionId,
          gitRoot,
          previousHead: e.previousHead,
          currentHead: e.currentHead,
          isBranchSwitch: e.isBranchSwitch,
        });
      });
      disposables.push(headSub);

      // Create combined dispose function
      const dispose = () => {
        for (const d of disposables) {
          d.dispose();
        }
      };

      // Track the subscription
      const subscription: Subscription = {
        id: subscriptionId,
        windowId,
        gitRoot,
        dispose,
      };

      subscriptions.set(subscriptionId, subscription);

      // Register cleanup with window tracking
      addGitSubscription(windowId, gitRoot, () => {
        subscriptions.delete(subscriptionId);
        dispose();
      });

      // Clean up if window is destroyed
      event.sender.once("destroyed", () => {
        const sub = subscriptions.get(subscriptionId);
        if (sub) {
          sub.dispose();
          subscriptions.delete(subscriptionId);
        }
      });

      return subscriptionId;
    },
  );

  ipcMain.handle(
    "git-v2:unsubscribe",
    async (_, params: { subscriptionId: string }): Promise<void> => {
      const subscription = subscriptions.get(params.subscriptionId);
      if (subscription) {
        subscription.dispose();
        subscriptions.delete(params.subscriptionId);
        releaseGitProvider(subscription.windowId, subscription.gitRoot);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Provider Lifecycle
  // -------------------------------------------------------------------------

  ipcMain.handle(
    "git-v2:release",
    async (event, params: { gitRoot: string }): Promise<void> => {
      const windowId = getWindowId(event);
      releaseGitProvider(windowId, params.gitRoot);
    },
  );

  // -------------------------------------------------------------------------
  // Utility
  // -------------------------------------------------------------------------

  ipcMain.handle(
    "git-v2:find-root",
    async (event, params: { cwd: string }): Promise<string | null> => {
      const windowId = getWindowId(event);
      const result = await getGitProvider(windowId, params.cwd);

      if (!result) {
        return null;
      }

      const { gitRoot } = result;

      // Immediately release since we just wanted to find the root
      releaseGitProvider(windowId, gitRoot);

      return gitRoot;
    },
  );
}

/**
 * Clean up handlers and resources.
 *
 * Call this during application shutdown.
 */
export function cleanupGitV2Handlers(): void {
  // Dispose all active subscriptions
  for (const subscription of subscriptions.values()) {
    try {
      subscription.dispose();
    } catch (error) {
      console.error("[Git-V2] Error disposing subscription:", error);
    }
  }

  subscriptions.clear();
}

/**
 * Handle window close event.
 *
 * This should be called when a window closes to clean up its subscriptions.
 *
 * @param windowId - The ID of the window that closed
 */
export function handleGitWindowClose(windowId: number): void {
  for (const [id, subscription] of subscriptions) {
    if (subscription.windowId === windowId) {
      try {
        subscription.dispose();
      } catch (error) {
        console.error("[Git-V2] Error disposing subscription:", error);
      }
      subscriptions.delete(id);
    }
  }
}
