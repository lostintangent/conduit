import { GitSubscription } from "./GitSubscription";
import { createSubscriptionPool } from "@/services/SubscriptionPool";

/**
 * Shared GitSubscription instances, one per cwd. Keyed by the cwd passed to
 * acquire, so "/project/src" and "/project" get separate instances even though
 * they resolve to the same repository. Wrapped by useGitSubscription.
 */
export const GitSubscriptionPool = createSubscriptionPool(
  (cwd) => new GitSubscription(cwd),
);
