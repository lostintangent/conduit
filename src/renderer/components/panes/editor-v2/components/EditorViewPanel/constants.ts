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
 * Used when editors are embedded in scrollable containers like ChangesReviewPane.
 */
export const EDITOR_MIN_HEIGHT = 100;

/**
 * Default maximum height for auto-sizing editors (in pixels).
 * Editors will grow up to this height before enabling internal scrolling.
 */
export const EDITOR_MAX_HEIGHT = 400;

// ============================================================================
// Auto-Sizing Configuration
// ============================================================================

/**
 * Configuration for editor auto-sizing behavior.
 */
export interface AutoSizeConfig {
  /** Minimum height in pixels */
  minHeight: number;
  /** Maximum height in pixels */
  maxHeight: number;
}

/**
 * Default auto-size configuration for editors in review mode.
 */
export const DEFAULT_AUTO_SIZE_CONFIG: AutoSizeConfig = {
  minHeight: EDITOR_MIN_HEIGHT,
  maxHeight: EDITOR_MAX_HEIGHT,
};
