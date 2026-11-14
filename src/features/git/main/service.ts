/**
 * Git for the renderer, by the cwd it works in.
 *
 * A subscription holds its repository's provider, and with it the watcher,
 * until it's released. Reads and writes use the provider something already
 * holds (a subscription, or the file system's watcher for the same repo):
 * reads fall back to an empty value without one, and writes fail. History is
 * the exception, since the commit graph can read it before the pane's
 * subscription lands.
 */

import type {
  GetCommitHistoryOptions,
  GitCommitOptions,
  GitFileStatus,
} from "../model";
import { emit } from "./events";
import { GitProviderService } from "./GitProviderService";

const providers = () => GitProviderService.getInstance();

async function existing(cwd: string) {
  return (await providers().getExistingProviderByCwd(cwd))?.provider ?? null;
}

async function required(cwd: string) {
  const provider = await existing(cwd);
  if (!provider) {
    throw new Error(`No active git provider for: ${cwd}`);
  }
  return provider;
}

/** The repository's provider, created if nothing holds it. Null outside one. */
async function created(cwd: string) {
  try {
    return (await providers().getProvider(cwd)).provider;
  } catch {
    return null;
  }
}

/** Each live subscription's release, by id. */
const subscriptions = new Map<string, () => void>();
let lastSubscriptionId = 0;

const service = {
  async getStatus(cwd: string) {
    return (await existing(cwd))?.getStatus() ?? null;
  },

  /** Null when HEAD is detached. */
  async getCurrentBranch(cwd: string) {
    return (await existing(cwd))?.getCurrentBranch() ?? null;
  },

  async getBranches(cwd: string) {
    return (await existing(cwd))?.getBranches() ?? [];
  },

  findRoot(cwd: string) {
    return providers().findGitRoot(cwd);
  },

  /** Changes since `baseBranch`, overlaid with the working tree's. */
  async getStatusFromBranch(cwd: string, baseBranch: string) {
    return (
      (await existing(cwd))?.getStatusFromBranch(baseBranch) ??
      new Map<string, GitFileStatus>()
    );
  },

  async getUncommittedDiffStats(cwd: string) {
    return (
      (await existing(cwd))?.getUncommittedDiffStats() ?? {
        added: 0,
        removed: 0,
        files: 0,
      }
    );
  },

  async getPerFileDiffStats(cwd: string) {
    return (
      (await existing(cwd))?.getPerFileDiffStats() ?? {
        staged: new Map(),
        unstaged: new Map(),
      }
    );
  },

  /** For opening a relevant file when the editor mounts. */
  async getMostRecentDirtyFile(cwd: string) {
    return (await existing(cwd))?.getMostRecentDirtyFile() ?? null;
  },

  /** The fallback when nothing's dirty, from the last `commitLimit` commits. */
  async getMostRecentCommittedFile(cwd: string, commitLimit?: number) {
    return (
      (await existing(cwd))?.getMostRecentCommittedFile(commitLimit) ?? null
    );
  },

  async getFileAtRef(cwd: string, filePath: string, ref: string) {
    return (await existing(cwd))?.getFileAtRef(filePath, ref) ?? null;
  },

  /** Newest first, in topological order, as the commit graph lays it out. */
  async getCommitHistory(cwd: string, options?: GetCommitHistoryOptions) {
    return (
      (await created(cwd))?.getCommitHistory(options) ?? {
        commits: [],
        hasMore: false,
      }
    );
  },

  async getCommit(cwd: string, commitId: string) {
    return (await created(cwd))?.getCommit(commitId) ?? null;
  },

  async getCommitFiles(cwd: string, commitId: string) {
    return (await created(cwd))?.getCommitFiles(commitId) ?? [];
  },

  /** The current branch, its upstream and its base, which color the graph. */
  async getTrackedBranches(cwd: string) {
    return (
      (await created(cwd))?.getTrackedBranches() ?? {
        current: null,
        upstream: null,
        base: null,
      }
    );
  },

  isGitAvailable() {
    return providers().isGitAvailable();
  },

  async stage(cwd: string, files: string[]) {
    return (await required(cwd)).stage(files);
  },

  async unstage(cwd: string, files: string[]) {
    return (await required(cwd)).unstage(files);
  },

  /** Discard the files' changes, back to HEAD. */
  async revert(cwd: string, files: string[]) {
    return (await required(cwd)).revert(files);
  },

  async commit(cwd: string, message: string, options?: GitCommitOptions) {
    return (await required(cwd)).commit(message, options);
  },

  async pull(cwd: string, rebase?: boolean) {
    return (await required(cwd)).pull(rebase);
  },

  /** `setUpstream` publishes a branch that doesn't track one yet. */
  async push(cwd: string, force?: boolean, setUpstream?: boolean) {
    return (await required(cwd)).push(force, setUpstream);
  },

  /** `force` discards local changes that checkout would overwrite. */
  async checkout(cwd: string, ref: string, force?: boolean) {
    return (await required(cwd)).checkout(ref, { force });
  },

  async stash(cwd: string, message?: string) {
    return (await required(cwd)).stash(message);
  },

  async stashPop(cwd: string) {
    return (await required(cwd)).stashPop();
  },

  async createBranch(
    cwd: string,
    branchName: string,
    checkout = true,
    startPoint?: string,
  ) {
    return (await required(cwd)).createBranch(branchName, checkout, startPoint);
  },

  /**
   * Watch `cwd`'s repository until `unsubscribe`. Its events carry the id
   * this returns, which is null outside a repository.
   */
  async subscribe(cwd: string) {
    let acquired;
    try {
      acquired = await providers().getProvider(cwd);
    } catch {
      return null;
    }
    const { provider, gitRoot } = acquired;
    const subscriptionId = `git-sub-${++lastSubscriptionId}`;
    const listeners = [
      provider.onStatusChanged((event) =>
        emit("statusChanged", { subscriptionId, ...event }),
      ),
      provider.onBranchChanged((event) =>
        emit("branchChanged", { subscriptionId, ...event }),
      ),
      provider.onHeadChanged((event) =>
        emit("headChanged", { subscriptionId, ...event }),
      ),
    ];
    subscriptions.set(subscriptionId, () => {
      for (const listener of listeners) {
        listener.dispose();
      }
      providers().releaseProvider(gitRoot);
    });
    return subscriptionId;
  },

  unsubscribe(subscriptionId: string) {
    subscriptions.get(subscriptionId)?.();
    subscriptions.delete(subscriptionId);
  },
};

export default service;

declare module "@shared/rpc" {
  interface Services {
    git: typeof service;
  }
}

/**
 * Release every subscription, when the page that made them reloads or closes.
 * Providers outlive their last reference by a grace period, so a reloaded
 * page that subscribes again reuses the same watchers.
 */
export function releaseGitSubscriptions(): void {
  for (const release of subscriptions.values()) {
    release();
  }
  subscriptions.clear();
}
