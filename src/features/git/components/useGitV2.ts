/**
 * React hook returning the GitV2API instance shared by every component using
 * the same cwd (see GitV2APIService), held while the component is mounted and
 * shown (see useSharedAPI).
 */

import type { GitV2API } from "../client/GitV2API";
import { GitV2APIService } from "../client/GitV2APIService";
import { useSharedAPI } from "@/services/SharedAPIPool";

export function useGitV2(cwd: string): GitV2API {
  return useSharedAPI(GitV2APIService.getInstance(), cwd);
}
