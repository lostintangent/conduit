import { FileSystemSubscription } from "./FileSystemSubscription";
import { normalizePathForKey } from "@/utils/pathUtils";
import { createSubscriptionPool } from "@/services/SubscriptionPool";

/**
 * Shared FileSystemSubscription instances, one per cwd (case-folded on
 * case-insensitive file systems). Wrapped by useFileSystemSubscription.
 */
export const FileSystemSubscriptionPool = createSubscriptionPool(
  (cwd) => new FileSystemSubscription(cwd),
  normalizePathForKey,
);
