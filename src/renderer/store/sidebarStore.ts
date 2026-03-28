/**
 * Sidebar store - centralized state management for the sidebar panel.
 *
 * This store manages:
 * 1. Core sidebar UI state (open/close, view selection, navigation)
 * 2. Per-CWD metadata cache (editor file, browser URL per directory)
 * 3. Global browser fallback URL (last manually browsed URL)
 * 4. Pane ID generators for sidebar views
 *
 * State is session-scoped (in-memory) - it survives view switches but not app restart.
 * User preferences like treeMode/changesViewMode that should survive restart
 * are stored separately via usePersistedState (localStorage).
 */

import { atom, getDefaultStore } from "jotai";

// =============================================================================
// Types
// =============================================================================

/** Sidebar view types - which view is shown in the sidebar */
export type SidebarView = "editor" | "canvas" | "browser";

/**
 * One-shot navigation request for deep linking into sidebar views.
 * Each view component consumes only the fields it cares about, then clears.
 *
 * - cwd: Target CWD for this navigation (updates lock target if locked)
 * - browserUrl: Navigate the sidebar browser to this URL
 * - editorTreeMode: Set the editor tree to "all" or "changes" mode
 * - editorFile: Open this file in the sidebar editor
 */
export type SidebarNavigation = {
  /** Target CWD - if sidebar is locked, updates the lock to this CWD */
  cwd?: string;
  browserUrl?: string;
  editorTreeMode?: "all" | "changes";
  editorFile?: string;
};

/**
 * Unified sidebar state - combines open state, view, and optional navigation.
 * Navigation is one-shot: view components consume it and clear it.
 */
export type SidebarState = {
  isOpen: boolean;
  view: SidebarView;
  navigation?: SidebarNavigation;
};

/** Per-CWD metadata for sidebar views (session-scoped, not persisted to disk) */
interface CwdMetadata {
  /** Currently open file in the editor view */
  editorFile?: string;
  /** Last browser URL visited for this CWD (from deep-linking) */
  browserUrl?: string;
}

// =============================================================================
// Atoms
// =============================================================================

/** Core sidebar UI state (open/close, view selection, navigation) */
export const sidebarStateAtom = atom<SidebarState>({
  isOpen: false,
  view: "editor",
});

/** Per-CWD metadata cache - survives view switches within a session */
const cwdMetadataAtom = atom<Map<string, CwdMetadata>>(new Map());

/**
 * Global browser fallback URL - used when no CWD-specific URL exists.
 * This is the "last manually browsed URL" that has no project association.
 */
const browserFallbackUrlAtom = atom(undefined as string | undefined);

// =============================================================================
// Store Access
// =============================================================================

const store = getDefaultStore();

// --- Sidebar Actions ---

/** Close the sidebar */
export function closeSidebar(): void {
  store.set(sidebarStateAtom, (prev) => ({ ...prev, isOpen: false }));
}

// --- CWD Metadata (Editor) ---

export function getCwdEditorFile(cwd: string): string | undefined {
  return store.get(cwdMetadataAtom).get(cwd)?.editorFile;
}

export function setCwdEditorFile(cwd: string, file: string): void {
  store.set(cwdMetadataAtom, (current) => {
    const next = new Map(current);
    const metadata = next.get(cwd) ?? {};
    next.set(cwd, { ...metadata, editorFile: file });
    return next;
  });
}

export function clearCwdEditorFile(cwd: string): void {
  store.set(cwdMetadataAtom, (current) => {
    const next = new Map(current);
    const metadata = next.get(cwd);
    if (metadata) {
      const { editorFile: _, ...rest } = metadata;
      if (Object.keys(rest).length > 0) {
        next.set(cwd, rest);
      } else {
        next.delete(cwd);
      }
    }
    return next;
  });
}

// --- CWD Metadata (Browser) ---

export function getCwdBrowserUrl(cwd: string): string | undefined {
  return store.get(cwdMetadataAtom).get(cwd)?.browserUrl;
}

export function setCwdBrowserUrl(cwd: string, url: string): void {
  store.set(cwdMetadataAtom, (current) => {
    const next = new Map(current);
    const metadata = next.get(cwd) ?? {};
    next.set(cwd, { ...metadata, browserUrl: url });
    return next;
  });
}

// --- Browser Fallback URL ---

export function getBrowserFallbackUrl(): string | undefined {
  return store.get(browserFallbackUrlAtom);
}

export function setBrowserFallbackUrl(url: string): void {
  store.set(browserFallbackUrlAtom, url);
}

// =============================================================================
// Pane ID Generators
// =============================================================================

/**
 * Sidebar pane ID generators - produce stable, unique IDs.
 *
 * These IDs are used to:
 * 1. Identify DOM elements (webviews, canvases) for CLI operations
 * 2. Cache state per working directory (when unlocked)
 * 3. Enable deep linking to specific sidebar content
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
