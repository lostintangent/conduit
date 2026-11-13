/**
 * Editor Registries
 *
 * Global singleton registries that manage expensive resources:
 * - MonacoModelRegistry: Monaco text models (one per file)
 * - ViewStateRegistry: Monaco ViewState per (editor, file) pair
 * - EditorPaneRegistry: EditorPane component instances (global container pattern)
 */

export {
  EditorPaneRegistry,
  type EditorPaneConfig,
  type EditorPaneRegistryEvent,
} from "./EditorPaneRegistry";
export {
  MonacoModelRegistry,
  createModelKey,
  pathToUri,
  uriToPath,
} from "./MonacoModelRegistry";
export { ViewStateRegistry } from "./ViewStateRegistry";

// Re-export FileTooLargeError for convenience
export { FileTooLargeError } from "../types";
