/**
 * Shared constants for EditorViewPanel components.
 *
 * These constants are used by both RegularEditorWrapper and DiffEditorWrapper
 * to ensure consistent behavior across editor types.
 */

// ============================================================================
// Auto-Sizing Constants
// ============================================================================

/**
 * Default minimum height for auto-sizing editors (in pixels).
 * Editors will be at least this tall even with minimal content.
 */
export const EDITOR_MIN_HEIGHT = 100;

/**
 * Default maximum height for auto-sizing editors (in pixels).
 * Editors will grow up to this height before enabling internal scrolling.
 */
export const EDITOR_MAX_HEIGHT = 400;
