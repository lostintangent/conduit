/**
 * Editor v2 utilities.
 */

// Re-export EventEmitter from shared location
export { EventEmitter } from "@shared/EventEmitter";
export { detectLanguage } from "./languageDetection";
export { pathsEqual, isCaseInsensitiveFs, getParentPaths } from "./pathUtils";
