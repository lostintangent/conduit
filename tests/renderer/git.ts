import { vi } from "vitest";

const resolves = <T>(make: () => T) => vi.fn(async (..._args: any[]) => make());

function conduitGit(mocks: object) {
  const conduit = ((window as any).conduit ??= {});
  conduit.git = Object.assign(conduit.git ?? {}, mocks);
}

/**
 * Mock the IPC calls git reads make, each resolving to what main sends
 * outside a repository, and return them. Call it before each test, since it
 * replaces the last mocks.
 */
export function mockGitReads() {
  const reads = {
    getStatus: resolves<any>(() => null),
    getCurrentBranch: resolves<any>(() => null),
    getBranches: resolves<any>(() => []),
    findRoot: resolves<any>(() => null),
    getStatusFromBranch: resolves<any>(() => new Map()),
    getUncommittedDiffStats: resolves<any>(() => ({
      added: 0,
      removed: 0,
      files: 0,
    })),
    getPerFileDiffStats: resolves<any>(() => ({
      staged: new Map(),
      unstaged: new Map(),
    })),
    getMostRecentDirtyFile: resolves<any>(() => null),
    getMostRecentCommittedFile: resolves<any>(() => null),
    getFileAtRef: resolves<any>(() => null),
    getCommitHistory: resolves<any>(() => ({ commits: [], hasMore: false })),
    getCommit: resolves<any>(() => null),
    getCommitFiles: resolves<any>(() => []),
    getTrackedBranches: resolves<any>(() => ({
      current: null,
      upstream: null,
      base: null,
    })),
  };
  conduitGit(reads);
  return reads;
}

/**
 * Mock the IPC calls `gitMutations` make, each resolving by default, and
 * return them. Call it before each test, since it replaces the last mocks.
 */
export function mockGitWrites() {
  const writes = {
    stage: resolves<any>(() => undefined),
    unstage: resolves<any>(() => undefined),
    revert: resolves<any>(() => undefined),
    commit: resolves<any>(() => undefined),
    pull: resolves<any>(() => undefined),
    push: resolves<any>(() => undefined),
    checkout: resolves<any>(() => undefined),
    createBranch: resolves<any>(() => undefined),
    stash: resolves<any>(() => undefined),
    stashPop: resolves<any>(() => undefined),
  };
  conduitGit(writes);
  return writes;
}
