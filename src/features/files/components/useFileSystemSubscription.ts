/**
 * React hook returning the FileSystemSubscription instance shared by every
 * component using the same cwd (see FileSystemSubscriptionPool), held while the
 * component is mounted and shown (see usePooledSubscription).
 *
 * @example
 * ```tsx
 * const fs = useFileSystemSubscription(projectPath);
 * useEffect(() => fs.onDirectoryListingChanged(projectPath, setEntries), [fs, projectPath]);
 * ```
 */

import { FileSystemSubscription } from "../client/FileSystemSubscription";
import { FileSystemSubscriptionPool } from "../client/FileSystemSubscriptionPool";
import { usePooledSubscription } from "@/services/SubscriptionPool";

export function useFileSystemSubscription(cwd: string): FileSystemSubscription {
  return usePooledSubscription(FileSystemSubscriptionPool.getInstance(), cwd);
}

export type {
  Cleanup,
  DirectoryListingChangedCallback,
  FileContentChangedCallback,
  FileDeletedCallback,
  FileRenamedCallback,
} from "../client/FileSystemSubscription";

export { FileSystemSubscription } from "../client/FileSystemSubscription";
