/**
 * Editor v2 - Core Type Definitions
 *
 * This module defines types for the Editor v2 component architecture.
 * These types are used by the global registries, hooks, and components.
 *
 * @see docs/architecture/editor-v2-design-narrative.md
 */

import type * as monaco from "monaco-editor";

// ============================================================================
// Common Types
// ============================================================================

/**
 * A disposable resource that can be cleaned up.
 *
 * This matches VS Code's Disposable pattern for consistency.
 */
export interface Disposable {
  dispose(): void;
}

/**
 * Event subscription function type.
 *
 * Call with a listener to subscribe, returns a disposable to unsubscribe.
 * This pattern matches VS Code's event system.
 */
export type Event<T> = (listener: (e: T) => void) => Disposable;

// ============================================================================
// Editor Mode Types
// ============================================================================

/**
 * The mode in which an editor displays a file.
 *
 * - `editor`: Standard code editor for viewing/editing
 * - `diff`: Side-by-side diff view comparing versions
 */
export type EditorMode =
  | { type: "editor" }
  | { type: "diff"; baseBranch?: string };

/**
 * Event fired when a file's editor mode changes.
 */
export interface EditorModeChangedEvent {
  /** Path of the file whose mode changed */
  filePath: string;

  /** Previous mode (undefined if file was not tracked) */
  oldMode: EditorMode | undefined;

  /** New mode */
  newMode: EditorMode;
}

// ============================================================================
// Model State Types
// ============================================================================

/**
 * State of a Monaco text model managed by MonacoModelRegistry.
 *
 * This tracks the editing state relative to the file on disk.
 */
export interface ModelState {
  /** Model has unsaved changes (version differs from saved) */
  isDirty: boolean;

  /** File was deleted externally while model exists */
  isOrphaned: boolean;

  /** File was modified externally while model has unsaved changes */
  hasExternalChanges: boolean;
}

/**
 * Events fired by MonacoModelRegistry when model state changes.
 */
export type ModelStateEvent =
  | {
      type: "dirty";
      uri: string;
      isDirty: boolean;
    }
  | {
      type: "orphaned";
      uri: string;
      isOrphaned: boolean;
    }
  | {
      type: "externalChange";
      uri: string;
      /** True if model is dirty (conflict), false if auto-reloaded */
      hasConflict: boolean;
    }
  | {
      type: "saved";
      uri: string;
    }
  | {
      type: "reloaded";
      uri: string;
    }
  | {
      type: "fileSizeWarning";
      uri: string;
      /** File size in bytes */
      fileSize: number;
    }
  | {
      type: "renamed";
      /** Old URI before rename */
      oldUri: string;
      /** New URI after rename */
      newUri: string;
    };

/**
 * Error thrown when a file exceeds the maximum size limit.
 */
export class FileTooLargeError extends Error {
  constructor(
    public readonly filePath: string,
    public readonly fileSize: number,
    public readonly maxFileSize: number,
  ) {
    super(
      `File "${filePath}" (${(fileSize / 1024 / 1024).toFixed(2)} MB) exceeds maximum size limit (${(maxFileSize / 1024 / 1024).toFixed(2)} MB)`,
    );
    this.name = "FileTooLargeError";
  }
}

// ============================================================================
// Editor Registry Types
// ============================================================================

/**
 * Metadata tracked for each editor instance in EditorRegistry.
 */
export interface EditorMetadata {
  /** Timestamp when editor was created */
  createdAt: number;

  /** Timestamp when editor was last used (for LRU eviction) */
  lastUsed: number;
}

/**
 * Internal entry for tracking an editor in EditorRegistry.
 */
export interface EditorEntry {
  /** The Monaco editor instance */
  editor: monaco.editor.IStandaloneCodeEditor;

  /** The DOM container element the editor is rendered in */
  container: HTMLElement;

  /** Metadata for lifecycle management */
  metadata: EditorMetadata;
}

// ============================================================================
// Model Registry Types
// ============================================================================

/**
 * Internal entry for tracking a model in MonacoModelRegistry.
 */
export interface ModelEntry {
  /** The Monaco text model */
  model: monaco.editor.ITextModel;

  /** Set of editor IDs currently using this model (reference counting) */
  references: Set<string>;

  /** Working directory this model belongs to */
  cwd: string;

  /** Absolute file path (updated on rename to keep callbacks working) */
  filePath: string;

  /** alternativeVersionId at the time of last save */
  savedVersionId: number;

  /** Model has unsaved changes */
  isDirty: boolean;

  /** File was deleted externally */
  isOrphaned: boolean;

  /** File was modified externally while dirty */
  hasExternalChanges: boolean;

  /** Whether an auto-reload is currently in progress */
  isReloading: boolean;

  /** Subscription to model content changes */
  contentChangeDisposable: monaco.IDisposable;

  /** Subscriptions to filesystem events */
  fileWatchDisposables: Disposable[];

  /** Timer for grace period before disposal */
  disposeTimer?: ReturnType<typeof setTimeout>;
}

// ============================================================================
// File Node Type
// ============================================================================

/**
 * Represents a file or directory in the file tree.
 *
 * This is used throughout the editor for file selection and display.
 */
export interface FileNode {
  /** File or directory name */
  name: string;

  /** Absolute path */
  path: string;

  /** Whether this is a file or directory */
  type: "file" | "directory";
}

// ============================================================================
// View Mode Types
// ============================================================================

/**
 * The current view mode of the editor panel.
 *
 * Controls what is displayed in the main editor area.
 */
export type ViewMode =
  | { type: "editor" }
  | { type: "diff"; filePath: string; baseBranch?: string }
  | { type: "changesReview"; baseBranch?: string };

/**
 * Tree view mode - what the file tree displays.
 */
export type TreeViewMode = "files" | "changes";
