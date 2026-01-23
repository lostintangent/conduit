/**
 * Editor Registries
 *
 * Global singleton registries that manage expensive resources:
 * - EditorRegistry: Monaco editor instances
 * - MonacoModelRegistry: Monaco text models (one per file)
 * - ViewStateRegistry: Monaco ViewState per (editor, file) pair
 * - EditorPaneRegistry: EditorPane component instances (global container pattern)
 */

export {
  EditorPaneRegistry,
  type EditorPaneConfig,
  type EditorPaneRegistryEvent,
} from "./EditorPaneRegistry";
export { EditorRegistry } from "./EditorRegistry";
export {
  MonacoModelRegistry,
  createModelKey,
  pathToUri,
  uriToPath,
} from "./MonacoModelRegistry";
export { ViewStateRegistry } from "./ViewStateRegistry";

// Re-export FileTooLargeError for convenience
export { FileTooLargeError } from "../types";
