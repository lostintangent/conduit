/**
 * React hook returning the FileSystemSubscription instance shared by every
 * component using the same cwd (see FileSystemSubscriptionPool), held while the
 * component is mounted and shown (see useSharedAPI).
 *
 * @example
 * ```tsx
 * const fs = useFileSystemSubscription(projectPath);
 * useEffect(() => fs.onDirectoryListingChanged(projectPath, setEntries), [fs, projectPath]);
 * ```
 */

import { FileSystemSubscription } from "../client/FileSystemSubscription";
import { FileSystemSubscriptionPool } from "../client/FileSystemSubscriptionPool";
import { useSharedAPI } from "@/services/SharedAPIPool";

export function useFileSystemSubscription(cwd: string): FileSystemSubscription {
  return useSharedAPI(FileSystemSubscriptionPool.getInstance(), cwd);
}

export type {
  Cleanup,
  DirectoryListingChangedCallback,
  FileContentChangedCallback,
  FileDeletedCallback,
  FileRenamedCallback,
} from "../client/FileSystemSubscription";

export { FileSystemSubscription } from "../client/FileSystemSubscription";
