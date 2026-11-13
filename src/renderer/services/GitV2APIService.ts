import { GitV2API } from "../api/GitV2API";
import { createSharedAPIPool } from "./SharedAPIPool";

/**
 * Shared GitV2API instances, one per cwd. Keyed by the cwd passed to acquire,
 * so "/project/src" and "/project" get separate instances even though they
 * resolve to the same repository. Wrapped by useGitV2.
 */
export const GitV2APIService = createSharedAPIPool((cwd) => new GitV2API(cwd));
