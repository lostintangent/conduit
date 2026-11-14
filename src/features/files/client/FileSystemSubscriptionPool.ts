import { FileSystemSubscription } from "./FileSystemSubscription";
import { normalizePathForKey } from "@/utils/pathUtils";
import { createSharedAPIPool } from "@/services/SharedAPIPool";

/**
 * Shared FileSystemSubscription instances, one per cwd (case-folded on
 * case-insensitive file systems). Wrapped by useFileSystemSubscription.
 */
export const FileSystemSubscriptionPool = createSharedAPIPool(
  (cwd) => new FileSystemSubscription(cwd),
  normalizePathForKey,
);
