import type { TrackedBranch, TrackedBranchType } from "@/api/GitV2API";

/** Builds a tracked branch the way DiskGitProvider reports it. */
export function trackedBranch(
  type: TrackedBranchType,
  name: string,
  commitId: string,
): TrackedBranch {
  const slash = name.indexOf("/");
  return {
    name,
    displayName: name,
    type,
    commitId,
    remote: type !== "current" && slash > 0 ? name.slice(0, slash) : undefined,
  };
}
