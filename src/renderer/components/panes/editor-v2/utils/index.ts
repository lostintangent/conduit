/**
 * Editor v2 utilities.
 */

// Re-export EventEmitter from shared location
export { EventEmitter } from "@shared/EventEmitter";
export { detectLanguage } from "./languageDetection";
export {
  pathsEqual,
  isCaseInsensitiveFs,
  getParentPaths,
  normalizePathForKey,
} from "./pathUtils";
export { formatRelativeTime } from "./timeFormat";
