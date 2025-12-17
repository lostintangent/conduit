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
 * Architecture:
 * - Subscriptions own the provider lifecycle - they acquire a provider
 *   reference on subscribe and release it on unsubscribe/window close.
 * - One-shot operations (status, diff, etc.) use the existing provider
 *   without reference counting. This requires an active subscription or
 *   a FileSystemProvider holding a reference (for the same git root).
 * - This design eliminates race conditions and simplifies the code.
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
 * - `git-v2:checkout` - Checkout a branch or ref (with optional force)
 * - `git-v2:create-branch` - Create a new branch (with optional checkout)
 * - `git-v2:stash` - Stash uncommitted changes
 * - `git-v2:stash-pop` - Apply and remove most recent stash
 * - `git-v2:push` - Push commits to remote (with optional setUpstream for new branches)
 * - `git-v2:pull` - Pull changes from remote
 * - `git-v2:has-upstream` - Check if branch has upstream tracking
 * - `git-v2:has-uncommitted-changes` - Check if repo has uncommitted changes
 * - `git-v2:has-unpushed-commits` - Check if repo has unpushed commits
 * - `git-v2:changed-files-from-branch` - Get files changed from base branch
 * - `git-v2:uncommitted-diff-stats` - Get diff stats for uncommitted changes
 * - `git-v2:most-recent-dirty-file` - Get most recently modified dirty file
 * - `git-v2:most-recent-committed-file` - Get most recently modified file from commits
 * - `git-v2:revert` - Discard local file changes
 * - `git-v2:subscribe` - Subscribe to git events
 * - `git-v2:unsubscribe` - Unsubscribe from events
 *
 * Map Serialization:
 * Git status contains a Map<string, GitFileStatus>. Since Maps can't be
 * serialized over IPC, we convert them to plain objects for transport and
 * the renderer reconstructs the Map.
 *
 * @see docs/architecture/filesystem-provider-design-narrative.md
 */

import { ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import { getSandboxClient, onSessionEvent } from "../vm/store";
import { GitProviderService } from "./GitProviderService";
import type {
  FileWithTime,
  GitBranch,
  GitCommit,
  GitCommitOptions,
  GitFileStatus,
  GitStatus,
} from "./types";
import { VMGitProvider } from "./VMGitProvider";

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

/** VM git providers by vmId */
const vmProviders = new Map<string, VMGitProvider>();

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

/**
 * Get the git provider service singleton.
 */
function getService(): GitProviderService {
  return GitProviderService.getInstance();
}

/**
 * Get or create VM git provider for a given vmId.
 *
 * The provider needs access to the VM's sandbox-ipc client for
 * making git operations via WebSocket.
 * Will wait for sandbox connection if not yet established.
 */
async function getOrCreateVMProvider(
  vmId: string,
  cwd = "/workspace",
): Promise<VMGitProvider> {
  // Check if we already have a provider for this VM
  let provider = vmProviders.get(vmId);
  if (provider) {
    return provider;
  }

  // Get the sandbox client, connecting if needed (this will wait for connection)
  const sandboxClient = await getSandboxClient(vmId);
  if (!sandboxClient) {
    throw new Error(`VM ${vmId} does not have an active sandbox connection`);
  }

  // Create and cache the provider
  provider = new VMGitProvider(cwd, sandboxClient, cwd);
  vmProviders.set(vmId, provider);

  return provider;
}

/**
 * Clean up the VM git provider for a specific VM.
 * Called when a VM session is disposed.
 */
export function disposeVMProvider(vmId: string): void {
  const provider = vmProviders.get(vmId);
  if (provider) {
    try {
      provider.dispose();
    } catch (error) {
      console.error(`[Git-V2] Error disposing VM provider for ${vmId}:`, error);
    }
    vmProviders.delete(vmId);
  }
}

/**
 * Get the existing provider for a cwd, returning null if none exists.
 *
 * If vmId is provided, returns a VM git provider instead.
 * Operations use this to access the provider held by an active subscription
 * or FileSystemProvider. Returns null for non-git directories or when no
 * provider exists.
 */
async function getExistingProvider(cwd: string, vmId?: string) {
  // Route to VM provider if vmId is specified
  if (vmId) {
    const provider = await getOrCreateVMProvider(vmId, cwd);
    // For VM providers, we use cwd as the gitRoot since we don't have
    // the same discovery mechanism as local providers
    return { provider, gitRoot: cwd };
  }
  return getService().getExistingProviderByCwd(cwd);
}

/**
 * Get the existing provider for a cwd, throwing if none exists.
 *
 * If vmId is provided, returns a VM git provider instead.
 * Use this for operations that require an active provider.
 */
async function requireProvider(cwd: string, vmId?: string) {
  const result = await getExistingProvider(cwd, vmId);
  if (!result) {
    throw new Error(`No active git provider for: ${cwd}`);
  }
  return result;
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
  const service = getService();

  // Subscribe to VM session events to clean up providers when VMs are disposed
  onSessionEvent((vmId, _session, event) => {
    if (event === "disposed") {
      const provider = vmProviders.get(vmId);
      if (provider) {
        try {
          provider.dispose();
        } catch (error) {
          console.error(
            `[Git-V2] Error disposing VM provider for ${vmId}:`,
            error,
          );
        }
        vmProviders.delete(vmId);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Status Operations
  //
  // All operations use the existing provider held by an active subscription
  // or FileSystemProvider. No reference counting needed - subscription owns
  // the lifecycle. Operations return null or default values if no provider
  // exists or on error.
  // -------------------------------------------------------------------------

  /**
   * Get full repository status.
   * Returns branch info, upstream tracking, and status for all modified files.
   * Returns null if path is not in a git repository or no active provider.
   */
  ipcMain.handle(
    "git-v2:status",
    async (
      _,
      params: { cwd: string; vmId?: string },
    ): Promise<SerializedGitStatus | null> => {
      const result = await getExistingProvider(params.cwd, params.vmId);
      if (!result) {
        return null;
      }
      const status = await result.provider.getStatus();
      return serializeGitStatus(status);
    },
  );

  /**
   * Get status for a specific file.
   * Returns the file's index and working tree status, or null if not found.
   */
  ipcMain.handle(
    "git-v2:file-status",
    async (
      _,
      params: { cwd: string; filePath: string; vmId?: string },
    ): Promise<GitFileStatus | null> => {
      const result = await getExistingProvider(params.cwd, params.vmId);
      if (!result) {
        return null;
      }
      return result.provider.getFileStatus(params.filePath);
    },
  );

  /**
   * Check if repository has uncommitted changes.
   * Returns true if there are staged or unstaged modifications.
   * Returns false if no active provider.
   */
  ipcMain.handle(
    "git-v2:has-uncommitted-changes",
    async (_, params: { cwd: string; vmId?: string }): Promise<boolean> => {
      const result = await getExistingProvider(params.cwd, params.vmId);
      if (!result) {
        return false;
      }
      return result.provider.hasUncommittedChanges();
    },
  );

  /**
   * Check if repository has unpushed commits.
   * Returns true if local branch is ahead of its upstream.
   * Returns false if no active provider or no upstream is configured.
   */
  ipcMain.handle(
    "git-v2:has-unpushed-commits",
    async (_, params: { cwd: string; vmId?: string }): Promise<boolean> => {
      const result = await getExistingProvider(params.cwd, params.vmId);
      if (!result) {
        return false;
      }
      return result.provider.hasUnpushedCommits();
    },
  );

  /**
   * Get list of files changed compared to a base branch.
   * Useful for showing only files modified in a feature branch.
   * Returns empty array if no active provider.
   */
  ipcMain.handle(
    "git-v2:changed-files-from-branch",
    async (
      _,
      params: { cwd: string; baseBranch: string; vmId?: string },
    ): Promise<string[]> => {
      const result = await getExistingProvider(params.cwd, params.vmId);
      if (!result) {
        return [];
      }
      return result.provider.getChangedFilesFromBranch(params.baseBranch);
    },
  );

  /**
   * Get git status relative to a base branch.
   * Returns files with proper status (added, modified, deleted, renamed).
   * Returns empty object if no active provider.
   */
  ipcMain.handle(
    "git-v2:status-from-branch",
    async (
      _,
      params: { cwd: string; baseBranch: string; vmId?: string },
    ): Promise<Record<string, GitFileStatus>> => {
      const result = await getExistingProvider(params.cwd, params.vmId);
      if (!result) {
        return {};
      }
      const statusMap = await result.provider.getStatusFromBranch(
        params.baseBranch,
      );
      // Convert Map to plain object for IPC
      return Object.fromEntries(statusMap);
    },
  );

  /**
   * Get aggregate diff statistics for all uncommitted changes.
   * Returns counts of lines added, removed, and files changed.
   * Returns zeros if no active provider.
   */
  ipcMain.handle(
    "git-v2:uncommitted-diff-stats",
    async (
      _,
      params: { cwd: string; vmId?: string },
    ): Promise<SerializedDiffStats> => {
      const result = await getExistingProvider(params.cwd, params.vmId);
      if (!result) {
        return { added: 0, removed: 0, files: 0 };
      }
      return result.provider.getUncommittedDiffStats();
    },
  );

  /**
   * Get the most recently modified file with uncommitted changes.
   * Used for auto-open functionality to open a relevant file on editor mount.
   * Returns null if no dirty files or no active provider.
   */
  ipcMain.handle(
    "git-v2:most-recent-dirty-file",
    async (
      _,
      params: { cwd: string; vmId?: string },
    ): Promise<string | null> => {
      const result = await getExistingProvider(params.cwd, params.vmId);
      if (!result) {
        return null;
      }
      return result.provider.getMostRecentDirtyFile();
    },
  );

  /**
   * Get the most recently modified file from recent commits.
   * Used as fallback for auto-open when no dirty files exist.
   * Searches the specified number of recent commits for file modifications.
   * Returns null if no files found or no active provider.
   */
  ipcMain.handle(
    "git-v2:most-recent-committed-file",
    async (
      _,
      params: { cwd: string; commitLimit?: number; vmId?: string },
    ): Promise<string | null> => {
      const result = await getExistingProvider(params.cwd, params.vmId);
      if (!result) {
        return null;
      }
      return result.provider.getMostRecentCommittedFile(params.commitLimit);
    },
  );

  /**
   * Get all dirty files with their modification timestamps.
   * Returns files sorted by modification time (most recent first).
   * Returns empty array if no dirty files or no active provider.
   */
  ipcMain.handle(
    "git-v2:dirty-files-with-times",
    async (
      _,
      params: { cwd: string; vmId?: string },
    ): Promise<FileWithTime[]> => {
      const result = await getExistingProvider(params.cwd, params.vmId);
      if (!result) {
        return [];
      }
      return result.provider.getDirtyFilesWithTimes();
    },
  );

  /**
   * Discard local changes to specified files.
   * Reverts files to their state in HEAD.
   * Throws if no active provider or on git error.
   */
  ipcMain.handle(
    "git-v2:revert",
    async (
      _,
      params: { cwd: string; files: string[]; vmId?: string },
    ): Promise<void> => {
      const { provider } = await requireProvider(params.cwd, params.vmId);
      await provider.revert(params.files);
    },
  );

  // -------------------------------------------------------------------------
  // Diff Operations
  //
  // Operations for retrieving file content differences and historical versions.
  // -------------------------------------------------------------------------

  /**
   * Get unified diff for a specific file.
   * Can retrieve staged or unstaged diff based on the staged parameter.
   * Returns null if file has no changes or no active provider.
   */
  ipcMain.handle(
    "git-v2:file-diff",
    async (
      _,
      params: {
        cwd: string;
        filePath: string;
        staged?: boolean;
        vmId?: string;
      },
    ): Promise<string | null> => {
      const result = await getExistingProvider(params.cwd, params.vmId);
      if (!result) {
        return null;
      }
      return result.provider.getFileDiff(params.filePath, params.staged);
    },
  );

  /**
   * Get file content at a specific git reference (commit, branch, tag).
   * Used for displaying historical versions in diff views.
   * Returns null if file doesn't exist at that ref or no active provider.
   */
  ipcMain.handle(
    "git-v2:file-at-ref",
    async (
      _,
      params: { cwd: string; filePath: string; ref: string; vmId?: string },
    ): Promise<string | null> => {
      const result = await getExistingProvider(params.cwd, params.vmId);
      if (!result) {
        return null;
      }
      return result.provider.getFileAtRef(params.filePath, params.ref);
    },
  );

  // -------------------------------------------------------------------------
  // Staging Operations
  //
  // Operations for managing the git staging area (index).
  // These modify repository state and may trigger status change events.
  // -------------------------------------------------------------------------

  /**
   * Stage files for the next commit.
   * Adds files to the git index.
   * Triggers status change events for subscribers.
   */
  ipcMain.handle(
    "git-v2:stage",
    async (
      _,
      params: { cwd: string; files: string[]; vmId?: string },
    ): Promise<void> => {
      const { provider } = await requireProvider(params.cwd, params.vmId);
      await provider.stage(params.files);
    },
  );

  /**
   * Unstage files from the index.
   * Removes files from staging while preserving working directory changes.
   * Triggers status change events for subscribers.
   */
  ipcMain.handle(
    "git-v2:unstage",
    async (
      _,
      params: { cwd: string; files: string[]; vmId?: string },
    ): Promise<void> => {
      const { provider } = await requireProvider(params.cwd, params.vmId);
      await provider.unstage(params.files);
    },
  );

  // -------------------------------------------------------------------------
  // Commit Operations
  //
  // Operations for creating git commits.
  // These modify repository history and trigger commit/status events.
  // -------------------------------------------------------------------------

  /**
   * Create a new commit with staged changes.
   * Commits all staged files with the provided message.
   * Returns the created commit metadata.
   * Triggers commit created and status change events.
   */
  ipcMain.handle(
    "git-v2:commit",
    async (
      _,
      params: {
        cwd: string;
        message: string;
        options?: GitCommitOptions;
        vmId?: string;
      },
    ): Promise<SerializedGitCommit> => {
      const { provider } = await requireProvider(params.cwd, params.vmId);
      const commit = await provider.commit(params.message, params.options);
      return serializeGitCommit(commit);
    },
  );

  // -------------------------------------------------------------------------
  // Branch Operations
  //
  // Operations for querying and switching branches.
  // Checkout operations may trigger branch and HEAD change events.
  // -------------------------------------------------------------------------

  /**
   * Get the current branch name.
   * Returns null if in detached HEAD state or no active provider.
   */
  ipcMain.handle(
    "git-v2:branch",
    async (
      _,
      params: { cwd: string; vmId?: string },
    ): Promise<string | null> => {
      const result = await getExistingProvider(params.cwd, params.vmId);
      if (!result) {
        return null;
      }
      return result.provider.getCurrentBranch();
    },
  );

  /**
   * Get all local and remote branches.
   * Returns branch metadata including current status, upstream tracking, and commit info.
   * Returns empty array if no active provider.
   */
  ipcMain.handle(
    "git-v2:branches",
    async (
      _,
      params: { cwd: string; vmId?: string },
    ): Promise<SerializedGitBranch[]> => {
      const result = await getExistingProvider(params.cwd, params.vmId);
      if (!result) {
        return [];
      }
      const branches = await result.provider.getBranches();
      return branches.map(serializeGitBranch);
    },
  );

  /**
   * Checkout a branch, tag, or commit.
   * Switches the working directory to the specified ref.
   * Optionally force checkout to discard local changes.
   * Triggers branch change and HEAD change events for subscribers.
   */
  ipcMain.handle(
    "git-v2:checkout",
    async (
      _,
      params: { cwd: string; ref: string; force?: boolean; vmId?: string },
    ): Promise<void> => {
      const { provider } = await requireProvider(params.cwd, params.vmId);
      await provider.checkout(params.ref, { force: params.force });
    },
  );

  /**
   * Create a new branch and optionally switch to it.
   * Triggers branch change events when checkout is true.
   */
  ipcMain.handle(
    "git-v2:create-branch",
    async (
      _,
      params: {
        cwd: string;
        branchName: string;
        checkout?: boolean;
        startPoint?: string;
      },
    ): Promise<void> => {
      const { provider } = await requireProvider(params.cwd);
      await provider.createBranch(
        params.branchName,
        params.checkout ?? true,
        params.startPoint,
      );
    },
  );

  /**
   * Stash current uncommitted changes.
   * Saves both staged and unstaged changes to the stash.
   * Optionally includes a message to identify the stash.
   */
  ipcMain.handle(
    "git-v2:stash",
    async (
      _,
      params: { cwd: string; message?: string; vmId?: string },
    ): Promise<void> => {
      const { provider } = await requireProvider(params.cwd, params.vmId);
      await provider.stash(params.message);
    },
  );

  /**
   * Apply and remove the most recent stash entry.
   * Restores the previously stashed changes to the working directory.
   */
  ipcMain.handle(
    "git-v2:stash-pop",
    async (_, params: { cwd: string; vmId?: string }): Promise<void> => {
      const { provider } = await requireProvider(params.cwd, params.vmId);
      await provider.stashPop();
    },
  );

  // -------------------------------------------------------------------------
  // Remote Operations
  //
  // Operations for pushing and pulling from remote repositories.
  // These may trigger status change events when successful.
  // -------------------------------------------------------------------------

  /**
   * Push commits to remote.
   * Optionally force push with --force-with-lease or set upstream for new branches.
   * Triggers status change events on success.
   */
  ipcMain.handle(
    "git-v2:push",
    async (
      _,
      params: {
        cwd: string;
        force?: boolean;
        setUpstream?: boolean;
        vmId?: string;
      },
    ): Promise<void> => {
      const { provider } = await requireProvider(params.cwd, params.vmId);
      await provider.push(params.force, params.setUpstream);
    },
  );

  /**
   * Pull changes from remote.
   * Optionally use rebase instead of merge.
   * Triggers status change events on success.
   */
  ipcMain.handle(
    "git-v2:pull",
    async (
      _,
      params: { cwd: string; rebase?: boolean; vmId?: string },
    ): Promise<void> => {
      const { provider } = await requireProvider(params.cwd, params.vmId);
      await provider.pull(params.rebase);
    },
  );

  /**
   * Check if the current branch has an upstream (tracking) branch.
   * Returns true if upstream is configured, false otherwise.
   * Returns false if no active provider.
   */
  ipcMain.handle(
    "git-v2:has-upstream",
    async (_, params: { cwd: string; vmId?: string }): Promise<boolean> => {
      const result = await getExistingProvider(params.cwd, params.vmId);
      if (!result) {
        return false;
      }
      return result.provider.hasUpstream();
    },
  );

  // -------------------------------------------------------------------------
  // Event Subscriptions
  //
  // Subscriptions hold a provider reference until explicitly unsubscribed
  // or the window closes. Events are forwarded to the renderer via IPC.
  //
  // Event types subscribed:
  // - onStatusChanged: File status changes (modified, staged, etc.)
  // - onBranchChanged: Current branch switches
  // - onCommitCreated: New commit creation
  // - onHeadChanged: HEAD reference changes
  // -------------------------------------------------------------------------

  /**
   * Subscribe to all git repository events.
   * Returns a subscription ID for later unsubscription.
   * Returns null if path is not in a git repository.
   * Events are sent to renderer via git-v2:* channels.
   */
  ipcMain.handle(
    "git-v2:subscribe",
    async (
      event,
      params: { cwd: string; vmId?: string },
    ): Promise<string | null> => {
      const windowId = getWindowId(event);

      let provider:
        | Awaited<ReturnType<typeof service.getProvider>>["provider"]
        | VMGitProvider;
      let gitRoot: string;
      let isVMProvider = false;

      // Route to VM provider if vmId is specified
      if (params.vmId) {
        provider = await getOrCreateVMProvider(params.vmId, params.cwd);
        gitRoot = params.cwd; // Use cwd as gitRoot for VM providers
        isVMProvider = true;
      } else {
        try {
          const result = await service.getProvider(params.cwd);
          provider = result.provider;
          gitRoot = result.gitRoot;
        } catch {
          return null; // Not a git repository
        }
      }
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

      // Create combined dispose function that also releases the provider
      const dispose = () => {
        for (const d of disposables) {
          d.dispose();
        }
        // Only release provider reference for local providers
        if (!isVMProvider) {
          service.releaseProvider(gitRoot);
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

  /**
   * Unsubscribe from git events.
   * Disposes event listeners and releases the provider reference.
   */
  ipcMain.handle(
    "git-v2:unsubscribe",
    async (_, params: { subscriptionId: string }): Promise<void> => {
      const subscription = subscriptions.get(params.subscriptionId);
      if (subscription) {
        subscription.dispose();
        subscriptions.delete(params.subscriptionId);
      }
    },
  );

  // -------------------------------------------------------------------------
  // Utility
  //
  // Helper operations for git repository discovery and availability checks.
  // -------------------------------------------------------------------------

  /**
   * Find the git root directory for a given path.
   * Traverses parent directories to find .git folder.
   * Returns null if not in a git repository.
   * For VM providers, returns the cwd as the git root (simplified behavior).
   */
  ipcMain.handle(
    "git-v2:find-root",
    async (
      _,
      params: { cwd: string; vmId?: string },
    ): Promise<string | null> => {
      // For VM providers, we assume cwd is the git root (simplified for now)
      if (params.vmId) {
        return params.cwd;
      }
      return service.findGitRoot(params.cwd);
    },
  );

  // -------------------------------------------------------------------------
  // Git Availability Check
  // -------------------------------------------------------------------------

  /**
   * Check if git is available on the system.
   * Verifies that the git executable can be found and executed.
   * Returns false if git is not installed or not in PATH.
   */
  ipcMain.handle("git-v2:is-available", async (): Promise<boolean> => {
    return service.isGitAvailable();
  });
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

  // Dispose all VM git providers
  for (const provider of vmProviders.values()) {
    try {
      provider.dispose();
    } catch (error) {
      console.error("[Git-V2] Error disposing VM provider:", error);
    }
  }

  vmProviders.clear();
}

/**
 * Handle window close event.
 *
 * Cleans up all subscriptions for the closing window.
 * Provider lifecycle is managed by the service's grace period.
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
