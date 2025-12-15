/**
 * VMGitProvider - Git provider implementation for cloud VM operations.
 *
 * This provider implements the GitProvider interface for remote VMs,
 * routing all git operations through the sandbox-ipc WebSocket connection
 * to the VM's sandbox-ipc-provider-go server.
 *
 * Architecture:
 * ```
 * VMGitProvider
 * └── SandboxIPCClient (WebSocket to VM)
 *     └── sandbox-ipc-provider-go (in VM)
 *         └── Git repository in VM
 * ```
 *
 * Key differences from DiskGitProvider:
 * 1. All operations are RPC calls over WebSocket
 * 2. Git status events come from the VM's watcher
 * 3. No local caching (VM server handles caching)
 */

import { EventEmitter } from "../../shared/EventEmitter";
import type { Event } from "../fsv2/types";
import type { SandboxIPCClient } from "../vm/sandbox-ipc-client";
import type {
  GitBranch,
  GitBranchChangedEvent,
  GitCommit,
  GitCommitCreatedEvent,
  GitCommitOptions,
  GitDiffStats,
  GitFileStatus,
  GitHeadChangedEvent,
  GitProvider,
  GitStatus,
  GitStatusChangedEvent,
} from "./types";

// ============================================================================
// Types matching sandbox-ipc-provider-go responses
// ============================================================================

interface VMGitStatus {
  branch: string;
  upstream?: string;
  ahead: number;
  behind: number;
  files: Record<string, GitFileStatus>;
}

interface VMGitBranch {
  name: string;
  isRemote: boolean;
  isCurrent: boolean;
  commit: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  lastCommitDate?: number;
  lastCommitMessage?: string;
}

interface VMGitCommit {
  hash: string;
  shortHash: string;
  author: string;
  email: string;
  date: number;
  message: string;
  parents: string[];
}

interface VMDiffStats {
  added: number;
  removed: number;
  files: number;
}

// ============================================================================
// VMGitProvider
// ============================================================================

/**
 * Git provider implementation for cloud VM operations.
 *
 * Routes all git operations through the sandbox-ipc WebSocket
 * connection to the VM's sandbox-ipc-provider-go server.
 *
 * @example
 * ```typescript
 * const sandboxClient = await getSandboxClient(vmId);
 * const provider = new VMGitProvider('/home/user/project', sandboxClient);
 *
 * // Get git status from VM
 * const status = await provider.getStatus();
 *
 * // Subscribe to status changes from VM
 * provider.onStatusChanged((event) => {
 *   console.log('Git status changed in VM:', event.added.length, 'new files');
 * });
 * ```
 */
export class VMGitProvider implements GitProvider {
  readonly gitRoot: string;
  readonly cwd: string;
  private disposed = false;
  private eventCleanups: Array<() => void> = [];

  // -------------------------------------------------------------------------
  // Event Emitters
  // -------------------------------------------------------------------------

  private readonly _onStatusChanged = new EventEmitter<GitStatusChangedEvent>();
  private readonly _onBranchChanged = new EventEmitter<GitBranchChangedEvent>();
  private readonly _onCommitCreated = new EventEmitter<GitCommitCreatedEvent>();
  private readonly _onHeadChanged = new EventEmitter<GitHeadChangedEvent>();

  readonly onStatusChanged: Event<GitStatusChangedEvent> =
    this._onStatusChanged.event;
  readonly onBranchChanged: Event<GitBranchChangedEvent> =
    this._onBranchChanged.event;
  readonly onCommitCreated: Event<GitCommitCreatedEvent> =
    this._onCommitCreated.event;
  readonly onHeadChanged: Event<GitHeadChangedEvent> =
    this._onHeadChanged.event;

  // -------------------------------------------------------------------------
  // Constructor
  // -------------------------------------------------------------------------

  /**
   * Create a new VM git provider.
   *
   * @param gitRoot - The git root directory in the VM
   * @param sandboxClient - The sandbox-ipc WebSocket client for the VM
   * @param cwd - The working directory (defaults to gitRoot)
   */
  constructor(
    gitRoot: string,
    private readonly sandboxClient: SandboxIPCClient,
    cwd?: string,
  ) {
    this.gitRoot = gitRoot;
    this.cwd = cwd ?? gitRoot;
    this.setupEventListeners();
  }

  // -------------------------------------------------------------------------
  // Event Setup
  // -------------------------------------------------------------------------

  /**
   * Set up listeners for git events from the VM.
   */
  private setupEventListeners(): void {
    // Listen for git status changes from VM
    const unsubStatusChanged = this.sandboxClient.on(
      "gitStatusChanged",
      (data: unknown) => {
        const event = data as {
          status: VMGitStatus;
          added: string[];
          modified: string[];
          removed: string[];
        };
        this._onStatusChanged.fire({
          status: this.convertVMStatus(event.status),
          added: event.added,
          modified: event.modified,
          removed: event.removed,
        });
      },
    );
    this.eventCleanups.push(unsubStatusChanged);

    // Listen for branch changes from VM
    const unsubBranchChanged = this.sandboxClient.on(
      "gitBranchChanged",
      (data: unknown) => {
        const event = data as {
          previousBranch: string;
          currentBranch: string;
        };
        this._onBranchChanged.fire(event);
      },
    );
    this.eventCleanups.push(unsubBranchChanged);
  }

  // -------------------------------------------------------------------------
  // Helper Methods
  // -------------------------------------------------------------------------

  /**
   * Convert VM status response to GitStatus.
   */
  private convertVMStatus(vmStatus: VMGitStatus | undefined): GitStatus {
    // Handle missing or malformed response
    if (!vmStatus) {
      return {
        branch: "unknown",
        upstream: undefined,
        ahead: 0,
        behind: 0,
        files: new Map(),
      };
    }

    const files = new Map<string, GitFileStatus>();
    if (vmStatus.files) {
      for (const [path, status] of Object.entries(vmStatus.files)) {
        files.set(path, status);
      }
    }
    return {
      branch: vmStatus.branch ?? "unknown",
      upstream: vmStatus.upstream,
      ahead: vmStatus.ahead ?? 0,
      behind: vmStatus.behind ?? 0,
      files,
    };
  }

  /**
   * Convert VM branch response to GitBranch.
   */
  private convertVMBranch(vmBranch: VMGitBranch): GitBranch {
    return {
      name: vmBranch.name,
      isRemote: vmBranch.isRemote,
      isCurrent: vmBranch.isCurrent,
      commit: vmBranch.commit,
      upstream: vmBranch.upstream,
      ahead: vmBranch.ahead,
      behind: vmBranch.behind,
      lastCommitDate: vmBranch.lastCommitDate
        ? new Date(vmBranch.lastCommitDate)
        : undefined,
      lastCommitMessage: vmBranch.lastCommitMessage,
    };
  }

  /**
   * Convert VM commit response to GitCommit.
   */
  private convertVMCommit(vmCommit: VMGitCommit): GitCommit {
    return {
      hash: vmCommit.hash,
      shortHash: vmCommit.shortHash,
      author: vmCommit.author,
      email: vmCommit.email,
      date: new Date(vmCommit.date),
      message: vmCommit.message,
      parents: vmCommit.parents,
    };
  }

  // -------------------------------------------------------------------------
  // State Queries
  // -------------------------------------------------------------------------

  /**
   * Get complete repository status from the VM.
   */
  async getStatus(): Promise<GitStatus> {
    this.ensureNotDisposed();

    try {
      // The sandbox-ipc server returns GitStatus directly (not wrapped in {status: ...})
      const result = await this.sandboxClient.call<VMGitStatus>(
        "git.status",
        {},
      );

      const converted = this.convertVMStatus(result);
      return converted;
    } catch (error) {
      console.error("[VMGitProvider] getStatus error:", error);
      // Return empty status on error
      return {
        branch: "unknown",
        upstream: undefined,
        ahead: 0,
        behind: 0,
        files: new Map(),
      };
    }
  }

  /**
   * Get status for a specific file.
   */
  async getFileStatus(filePath: string): Promise<GitFileStatus | null> {
    this.ensureNotDisposed();

    // The sandbox-ipc server returns GitFileStatus directly (not wrapped)
    const result = await this.sandboxClient.call<GitFileStatus | null>(
      "git.fileStatus",
      { path: filePath },
    );

    return result;
  }

  /**
   * Get current branch name.
   */
  async getCurrentBranch(): Promise<string> {
    this.ensureNotDisposed();

    const result = await this.sandboxClient.call<{ branch: string }>(
      "git.branch",
      {},
    );

    return result.branch;
  }

  /**
   * Get all branches (local and remote).
   */
  async getBranches(): Promise<GitBranch[]> {
    this.ensureNotDisposed();

    const result = await this.sandboxClient.call<{ branches: VMGitBranch[] }>(
      "git.branches",
      {},
    );

    return result.branches.map((b) => this.convertVMBranch(b));
  }

  /**
   * Get diff for a specific file.
   */
  async getFileDiff(filePath: string, staged?: boolean): Promise<string> {
    this.ensureNotDisposed();

    const result = await this.sandboxClient.call<{ diff: string }>("git.diff", {
      path: filePath,
      staged: staged ?? false,
    });

    return result.diff;
  }

  /**
   * Get file content at a specific ref.
   */
  async getFileAtRef(filePath: string, ref: string): Promise<string> {
    this.ensureNotDisposed();

    const result = await this.sandboxClient.call<{ content: string }>(
      "git.fileAtRef",
      { path: filePath, ref },
    );

    return result.content;
  }

  /**
   * Check if there are uncommitted changes.
   */
  async hasUncommittedChanges(): Promise<boolean> {
    this.ensureNotDisposed();

    const result = await this.sandboxClient.call<{ hasChanges: boolean }>(
      "git.hasUncommittedChanges",
      {},
    );

    return result.hasChanges;
  }

  /**
   * Check if there are commits not pushed to upstream.
   */
  async hasUnpushedCommits(): Promise<boolean> {
    this.ensureNotDisposed();

    const result = await this.sandboxClient.call<{ hasUnpushed: boolean }>(
      "git.hasUnpushedCommits",
      {},
    );

    return result.hasUnpushed;
  }

  /**
   * Get files changed between current HEAD and a base branch.
   */
  async getChangedFilesFromBranch(baseBranch: string): Promise<string[]> {
    this.ensureNotDisposed();

    const result = await this.sandboxClient.call<{ files: string[] }>(
      "git.changedFilesFromBranch",
      { baseBranch },
    );

    return result.files;
  }

  /**
   * Get git status relative to a base branch.
   */
  async getStatusFromBranch(
    baseBranch: string,
  ): Promise<Map<string, GitFileStatus>> {
    this.ensureNotDisposed();

    // The sandbox-ipc server returns GitStatus directly (like getStatus)
    const result = await this.sandboxClient.call<VMGitStatus>(
      "git.statusFromBranch",
      { baseBranch },
    );

    const files = new Map<string, GitFileStatus>();
    if (result?.files) {
      for (const [path, status] of Object.entries(result.files)) {
        files.set(path, status);
      }
    }
    return files;
  }

  /**
   * Get diff statistics for uncommitted changes.
   */
  async getUncommittedDiffStats(): Promise<GitDiffStats> {
    this.ensureNotDisposed();

    // The sandbox-ipc server returns DiffStats directly (not wrapped)
    const result = await this.sandboxClient.call<VMDiffStats>(
      "git.uncommittedDiffStats",
      {},
    );

    return result ?? { added: 0, removed: 0, files: 0 };
  }

  /**
   * Get the most recently modified dirty file.
   */
  async getMostRecentDirtyFile(): Promise<string | null> {
    this.ensureNotDisposed();

    const result = await this.sandboxClient.call<{ file: string | null }>(
      "git.mostRecentDirtyFile",
      {},
    );

    return result.file;
  }

  /**
   * Get the most recently modified file from recent commits.
   */
  async getMostRecentCommittedFile(
    commitLimit?: number,
  ): Promise<string | null> {
    this.ensureNotDisposed();

    const result = await this.sandboxClient.call<{ file: string | null }>(
      "git.mostRecentCommittedFile",
      { commitLimit: commitLimit ?? 10 },
    );

    return result.file;
  }

  /**
   * Revert changes to files.
   */
  async revert(files: string[]): Promise<void> {
    this.ensureNotDisposed();

    await this.sandboxClient.call("git.revert", { files });
  }

  // -------------------------------------------------------------------------
  // Operations
  // -------------------------------------------------------------------------

  /**
   * Stage files for commit.
   */
  async stage(files: string[]): Promise<void> {
    this.ensureNotDisposed();

    await this.sandboxClient.stageFiles(files);
  }

  /**
   * Unstage files.
   */
  async unstage(files: string[]): Promise<void> {
    this.ensureNotDisposed();

    await this.sandboxClient.unstageFiles(files);
  }

  /**
   * Create a commit.
   */
  async commit(
    message: string,
    options?: GitCommitOptions,
  ): Promise<GitCommit> {
    this.ensureNotDisposed();

    const result = await this.sandboxClient.call<{ commit: VMGitCommit }>(
      "git.commit",
      { message, options },
    );

    const commit = this.convertVMCommit(result.commit);

    // Fire commit created event
    this._onCommitCreated.fire({ commit });

    return commit;
  }

  /**
   * Checkout a branch or ref.
   */
  async checkout(ref: string): Promise<void> {
    this.ensureNotDisposed();

    await this.sandboxClient.call("git.checkout", { ref });
  }

  /**
   * Stash current uncommitted changes.
   */
  async stash(message?: string): Promise<void> {
    this.ensureNotDisposed();

    await this.sandboxClient.call("git.stash", { message: message ?? "" });
  }

  /**
   * Apply and remove the most recent stash entry.
   */
  async stashPop(): Promise<void> {
    this.ensureNotDisposed();

    await this.sandboxClient.call("git.stashPop", {});
  }

  /**
   * Push commits to remote.
   */
  async push(force?: boolean, setUpstream?: boolean): Promise<void> {
    this.ensureNotDisposed();

    await this.sandboxClient.call("git.push", {
      force: force ?? false,
      setUpstream: setUpstream ?? false,
    });
  }

  /**
   * Pull changes from remote.
   */
  async pull(rebase?: boolean): Promise<void> {
    this.ensureNotDisposed();

    await this.sandboxClient.call("git.pull", { rebase: rebase ?? false });
  }

  /**
   * Check if the current branch has an upstream configured.
   */
  async hasUpstream(): Promise<boolean> {
    this.ensureNotDisposed();

    const result = await this.sandboxClient.call<{ hasUpstream: boolean }>(
      "git.hasUpstream",
      {},
    );

    return result.hasUpstream;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Clean up resources.
   */
  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;

    // Clean up event listeners
    for (const cleanup of this.eventCleanups) {
      cleanup();
    }
    this.eventCleanups = [];

    // Dispose emitters
    this._onStatusChanged.dispose();
    this._onBranchChanged.dispose();
    this._onCommitCreated.dispose();
    this._onHeadChanged.dispose();
  }

  /**
   * Ensure the provider has not been disposed.
   */
  private ensureNotDisposed(): void {
    if (this.disposed) {
      throw new Error("VMGitProvider has been disposed");
    }
  }
}
