/**
 * Editor v2 utilities.
 */

// Re-export EventEmitter from shared location
export { EventEmitter } from "@shared/EventEmitter";
export { detectLanguage } from "./languageDetection";
export {
  // Constants
  UNSTAGED_KEY_SUFFIX,
  // MapKey helpers (centralized operations)
  makeMapKey,
  parseMapKey,
  mapKeyToPath,
  isUnstagedMapKey,
  normalizeMapKey,
  // Status lookup helpers
  getRelativePath,
  getFileStatusForEntry,
  isDiffableStatus,
  isDeletedOnRevert,
  computeStagedForChangesMode,
  getFileEntryPresence,
  // FileChangeDisplay converters
  commitFileToFileChange,
} from "./gitStatusHelpers";
export {
  pathsEqual,
  getFileName,
  getParentPath,
  getDirectoryPath,
  getParentPaths,
  normalizePathForKey,
  joinCwdPath,
} from "./pathUtils";
export { formatRelativeTime, formatFullDate } from "./timeFormat";
export { forceTokenizeVisibleLines } from "./tokenization";
export {
  filterDirtyFilesForStaging,
  notifyDirtyFilesSkipped,
  canStageFile,
} from "./stagingHelpers";
export {
  selectNextAvailableFile,
  relativePathToFileNode,
  type SelectNextFileOptions,
  type SelectNextFileResult,
} from "./fileSelectionHelpers";
export { hasUnicodeBOM, isBinaryContent } from "./binaryDetection";
export {
  getFriendlyGitError,
  type FriendlyGitError,
} from "./gitErrorMessages";
export { configureMonaco } from "./monacoSetup";
