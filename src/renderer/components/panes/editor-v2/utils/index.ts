/**
 * Editor v2 utilities.
 */

// Re-export EventEmitter from shared location
export { EventEmitter } from "@shared/EventEmitter";
export { detectLanguage } from "./languageDetection";
export {
  UNSTAGED_KEY_SUFFIX,
  getRelativePath,
  getFileStatusForEntry,
  isDiffableStatus,
  computeStagedForChangesMode,
  getFileEntryPresence,
} from "./gitStatusHelpers";
export {
  pathsEqual,
  isCaseInsensitiveFs,
  getParentPaths,
  normalizePathForKey,
  joinCwdPath,
} from "./pathUtils";
export { formatRelativeTime } from "./timeFormat";
export { forceTokenizeVisibleLines } from "./tokenization";
