import { GitSubscription } from "./GitSubscription";
import { createSharedAPIPool } from "@/services/SharedAPIPool";

/**
 * Shared GitSubscription instances, one per cwd. Keyed by the cwd passed to
 * acquire, so "/project/src" and "/project" get separate instances even though
 * they resolve to the same repository. Wrapped by useGitSubscription.
 */
export const GitSubscriptionPool = createSharedAPIPool(
  (cwd) => new GitSubscription(cwd),
);
