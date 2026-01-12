/**
 * Sidebar utilities - centralized helpers for sidebar-related operations.
 *
 * This module provides consistent pane ID generation for all sidebar views,
 * allowing CLI resolution and other cross-cutting concerns to locate
 * sidebar webviews and canvases.
 */

/**
 * Sidebar pane ID generators - produce stable, unique IDs.
 *
 * These IDs are used to:
 * 1. Identify DOM elements (webviews, canvases) for CLI operations
 * 2. Cache state per working directory (when unlocked)
 * 3. Enable deep linking to specific sidebar content
 *
 * Some views support both per-CWD (unlocked) and global (locked) modes.
 */
export const sidebarPaneIds = {
  /** ID for the sidebar browser webview (always global) */
  browser: () => "sidebar-browser",

  /** ID for the sidebar editor pane (per-CWD) */
  editor: (cwd: string) => `sidebar-editor-${cwd}`,

  /** ID for the sidebar canvas pane */
  canvas: {
    /** Per-CWD canvas ID (unlocked mode) */
    forCwd: (cwd: string) => `sidebar-canvas-${cwd}`,
    /** Global canvas ID (locked mode) */
    global: () => "sidebar-canvas",
  },
} as const;

// =============================================================================
// CWD Metadata Cache
// =============================================================================

/**
 * Module-level cache for per-CWD metadata (e.g., current file, current URL).
 * Survives component unmount/remount (e.g., when switching sidebar views).
 */
const cwdMetadataCache = new Map<string, string>();

/**
 * Cache for storing metadata per CWD.
 *
 * Used to persist values like the current editor file or browser URL
 * across sidebar view switches. Without this, switching from Editor → Canvas → Editor
 * would lose track of which file was open.
 *
 * @example
 * ```ts
 * // Store the current file for a CWD
 * cwdCache.set(cwd, "editor-file", "/path/to/file.ts");
 *
 * // Retrieve it later (even after component remount)
 * const file = cwdCache.get(cwd, "editor-file");
 *
 * // Clear when file is closed
 * cwdCache.clear(cwd, "editor-file");
 * ```
 */
export const cwdCache = {
  get: (cwd: string, key: string): string | undefined =>
    cwdMetadataCache.get(`${key}:${cwd}`),

  set: (cwd: string, key: string, value: string): void => {
    cwdMetadataCache.set(`${key}:${cwd}`, value);
  },

  clear: (cwd: string, key: string): void => {
    cwdMetadataCache.delete(`${key}:${cwd}`);
  },
};
