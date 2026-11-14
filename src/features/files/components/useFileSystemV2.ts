/**
 * React hook returning the FileSystemV2API instance shared by every component
 * using the same cwd (see FileSystemV2APIService), held while the component is
 * mounted and shown (see useSharedAPI).
 *
 * @example
 * ```tsx
 * const fs = useFileSystemV2(projectPath);
 * useEffect(() => fs.onDirectoryListingChanged(projectPath, setEntries), [fs, projectPath]);
 * ```
 */

import { FileSystemV2API } from "../client/FileSystemV2API";
import { FileSystemV2APIService } from "../client/FileSystemV2APIService";
import { useSharedAPI } from "@/services/SharedAPIPool";

export function useFileSystemV2(cwd: string): FileSystemV2API {
  return useSharedAPI(FileSystemV2APIService.getInstance(), cwd);
}

export type {
  Cleanup,
  DirectoryListingChangedCallback,
  FileContentChangedCallback,
  FileDeletedCallback,
  FileRenamedCallback,
} from "../client/FileSystemV2API";

export { FileSystemV2API } from "../client/FileSystemV2API";
