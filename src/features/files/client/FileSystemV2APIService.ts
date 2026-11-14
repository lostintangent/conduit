import { FileSystemV2API } from "./FileSystemV2API";
import { normalizePathForKey } from "@/utils/pathUtils";
import { createSharedAPIPool } from "@/services/SharedAPIPool";

/**
 * Shared FileSystemV2API instances, one per cwd (case-folded on
 * case-insensitive file systems). Wrapped by useFileSystemV2.
 */
export const FileSystemV2APIService = createSharedAPIPool(
  (cwd) => new FileSystemV2API(cwd),
  normalizePathForKey,
);
