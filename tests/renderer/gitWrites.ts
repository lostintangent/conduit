import { vi } from "vitest";

const resolved = () => vi.fn().mockResolvedValue(undefined);

/**
 * Mock the IPC calls `gitMutations` make, each resolving by default, and
 * return them. Call it before each test, since it replaces the last mocks.
 */
export function mockGitWrites() {
  const writes = {
    stage: resolved(),
    unstage: resolved(),
    revert: resolved(),
    commit: resolved(),
    pull: resolved(),
    push: resolved(),
    checkout: resolved(),
    createBranch: resolved(),
    stash: resolved(),
    stashPop: resolved(),
  };
  const conduit = ((window as any).conduit ??= {});
  conduit.git = Object.assign(conduit.git ?? {}, writes);
  return writes;
}
