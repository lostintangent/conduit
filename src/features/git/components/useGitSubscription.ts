/**
 * React hook returning the GitSubscription instance shared by every component
 * using the same cwd (see GitSubscriptionPool), held while the component is
 * mounted and shown (see useSharedAPI).
 */

import type { GitSubscription } from "../client/GitSubscription";
import { GitSubscriptionPool } from "../client/GitSubscriptionPool";
import { useSharedAPI } from "@/services/SharedAPIPool";

export function useGitSubscription(cwd: string): GitSubscription {
  return useSharedAPI(GitSubscriptionPool.getInstance(), cwd);
}
