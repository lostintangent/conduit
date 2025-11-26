/**
 * Editor v2 Registries
 *
 * Global singleton registries that manage expensive resources:
 * - EditorRegistry: Monaco editor instances
 * - MonacoModelRegistry: Monaco text models (one per file)
 * - EditorModeRegistry: Editor mode (regular vs diff) per file
 * - ViewStateRegistry: Monaco ViewState per (editor, file) pair
 *
 * @see docs/architecture/editor-v2-design-narrative.md (Part III: State Management)
 */

export { EditorRegistry } from "./EditorRegistry";
export {
  MonacoModelRegistry,
  pathToUri,
  uriToPath,
} from "./MonacoModelRegistry";
export { EditorModeRegistry } from "./EditorModeRegistry";
export { ViewStateRegistry } from "./ViewStateRegistry";
