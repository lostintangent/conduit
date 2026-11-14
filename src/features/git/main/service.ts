/**
 * Git for the renderer, by the cwd it works in.
 *
 * A subscription holds its repository's provider, and with it the watcher,
 * until it's released. Reads use the provider something already holds (a
 * subscription, or the file system's watcher for the same repo), and fall back
 * to an empty value without one. History and writes borrow a provider for just
 * the call instead: the commit graph can read history before the pane's
 * subscription lands, and a write queued behind a slow one can run after its
 * pane has closed.
 */

import type {
  GetCommitHistoryOptions,
  GitCommitOptions,
  GitFileStatus,
} from "../model";
import type { DiskGitProvider } from "./DiskGitProvider";
import { emit } from "./events";
import { GitProviderService } from "./GitProviderService";

const providers = () => GitProviderService.getInstance();

async function existing(cwd: string) {
  return (await providers().getExistingProviderByCwd(cwd))?.provider ?? null;
}

/**
 * Run `call` with the repository's provider, created if nothing holds it, and
 * let it go after. Outside a repository, resolves to `outside`, or throws
 * without it.
 */
async function borrowed<T>(
  cwd: string,
  call: (provider: DiskGitProvider) => Promise<T>,
  outside?: T,
): Promise<T> {
  let acquired;
  try {
    acquired = await providers().getProvider(cwd);
  } catch (error) {
    if (outside === undefined) {
      throw error;
    }
    return outside;
  }
  try {
    return await call(acquired.provider);
  } finally {
    providers().releaseProvider(acquired.gitRoot);
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
    return borrowed(cwd, (provider) => provider.getCommitHistory(options), {
      commits: [],
      hasMore: false,
    });
  },

  async getCommit(cwd: string, commitId: string) {
    return borrowed(cwd, (provider) => provider.getCommit(commitId), null);
  },

  async getCommitFiles(cwd: string, commitId: string) {
    return borrowed(cwd, (provider) => provider.getCommitFiles(commitId), []);
  },

  /** The current branch, its upstream and its base, which color the graph. */
  async getTrackedBranches(cwd: string) {
    return borrowed(cwd, (provider) => provider.getTrackedBranches(), {
      current: null,
      upstream: null,
      base: null,
    });
  },

  isGitAvailable() {
    return providers().isGitAvailable();
  },

  async stage(cwd: string, files: string[]) {
    return borrowed(cwd, (provider) => provider.stage(files));
  },

  async unstage(cwd: string, files: string[]) {
    return borrowed(cwd, (provider) => provider.unstage(files));
  },

  /** Discard the files' changes, back to HEAD. */
  async revert(cwd: string, files: string[]) {
    return borrowed(cwd, (provider) => provider.revert(files));
  },

  async commit(cwd: string, message: string, options?: GitCommitOptions) {
    return borrowed(cwd, (provider) => provider.commit(message, options));
  },

  async pull(cwd: string, rebase?: boolean) {
    return borrowed(cwd, (provider) => provider.pull(rebase));
  },

  /** `setUpstream` publishes a branch that doesn't track one yet. */
  async push(cwd: string, force?: boolean, setUpstream?: boolean) {
    return borrowed(cwd, (provider) => provider.push(force, setUpstream));
  },

  /** `force` discards local changes that checkout would overwrite. */
  async checkout(cwd: string, ref: string, force?: boolean) {
    return borrowed(cwd, (provider) => provider.checkout(ref, { force }));
  },

  async stash(cwd: string, message?: string) {
    return borrowed(cwd, (provider) => provider.stash(message));
  },

  async stashPop(cwd: string) {
    return borrowed(cwd, (provider) => provider.stashPop());
  },

  async createBranch(
    cwd: string,
    branchName: string,
    checkout = true,
    startPoint?: string,
  ) {
    return borrowed(cwd, (provider) =>
      provider.createBranch(branchName, checkout, startPoint),
    );
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
