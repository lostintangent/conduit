/**
 * React hook returning the GitSubscription instance shared by every component
 * using the same cwd (see GitSubscriptionPool), held while the component is
 * mounted and shown (see usePooledSubscription).
 */

import type { GitSubscription } from "../client/GitSubscription";
import { GitSubscriptionPool } from "../client/GitSubscriptionPool";
import { usePooledSubscription } from "@/services/SubscriptionPool";

export function useGitSubscription(cwd: string): GitSubscription {
  return usePooledSubscription(GitSubscriptionPool.getInstance(), cwd);
}
