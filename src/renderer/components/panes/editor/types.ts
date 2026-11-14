/**
 * Editor - Core Type Definitions
 *
 * This module defines types for the Editor component architecture.
 * These types are used by the global registries, hooks, and components.
 */

import type * as monaco from "monaco-editor";
import type { GitFileStatusCode } from "@/api/GitV2API";

// ============================================================================
// Common Types
// ============================================================================

// Defined locally to avoid barrel file import issues

/**
 * Disposable - An object that can be disposed to clean up resources.
 *
 * Common pattern for cleanup in VS Code-style APIs.
 */
export interface Disposable {
  dispose(): void;
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

  /** Timestamp when model was last accessed (for LRU eviction) */
  lastUsed: number;

  /** Last checked file mtime (for background freshness checks) */
  lastCheckedMtime?: number;
}

// ============================================================================
// File Node Type
// ============================================================================

/**
 * Represents a file or directory in the file tree.
 *
 * This is used throughout the editor for file selection and display.
 * Note: For "Showing only changed files" mode, the selected entry
 * (staged vs unstaged) is tracked separately via selectedMapKey.
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
 *
 * Modes are organized into categories:
 *
 * **Working Tree Modes** (current state):
 * - `editor`: Standard code editor for viewing/editing files
 * - `diff`: Side-by-side diff comparing file to a git ref
 * - `changesReview`: Multi-file review of all working tree changes
 *
 * **Historical Modes** (read-only, viewing past commits):
 * - `commitFileDiff`: Diff of a single file between commit and parent
 * - `commitReview`: Multi-file review of all changes in a commit
 */
export type ViewMode =
  // Working tree modes
  | { type: "editor" }
  | { type: "preview" }
  | { type: "diff"; filePath: string; baseBranch?: string }
  | { type: "changesReview"; baseBranch?: string }
  // Historical commit modes (read-only)
  | {
      type: "commitFileDiff";
      /** Absolute path to the file */
      filePath: string;
      /** Commit containing the change */
      commitId: string;
      /** Parent commit for comparison (first parent for merges) */
      parentCommitId: string;
      /** File status (added, modified, deleted, etc.) */
      fileStatus?: GitFileStatusCode;
      /** Original path before rename/copy (for renamed/copied files) */
      originalPath?: string;
    }
  | {
      type: "commitReview";
      /** Commit to review */
      commitId: string;
      /** Parent commit for comparison */
      parentCommitId: string;
    };

/**
 * Tree view mode - what the file tree displays.
 */
export type TreeViewMode = "files" | "changes";

// ============================================================================
// Branded Types for Type Safety
// ============================================================================

/**
 * Branded type for git status Map keys.
 *
 * MapKey is used to look up entries in the git status Map. For partially staged
 * files, the unstaged entry has a special suffix (\0unstaged) to distinguish it
 * from the staged entry.
 *
 * Use the helpers in gitStatusHelpers.ts to create and parse MapKeys:
 * - makeMapKey(path, staged) - create a MapKey
 * - parseMapKey(mapKey) - extract path and staged boolean
 * - mapKeyToPath(mapKey) - get just the path
 *
 * @example
 * // Staged entry for src/file.ts
 * const stagedKey: MapKey = "src/file.ts" as MapKey;
 *
 * // Unstaged entry for same file (partially staged)
 * const unstagedKey: MapKey = "src/file.ts\0unstaged" as MapKey;
 */
declare const MapKeyBrand: unique symbol;
export type MapKey = string & { readonly [MapKeyBrand]: unique symbol };

/**
 * Branded type for file system paths.
 *
 * FilePath represents an actual file system path (relative or absolute).
 * Unlike MapKey, it never contains the unstaged suffix.
 *
 * Use mapKeyToPath() to convert a MapKey to a FilePath.
 */
declare const FilePathBrand: unique symbol;
export type FilePath = string & { readonly [FilePathBrand]: unique symbol };

/**
 * Cast a string to a MapKey.
 *
 * Use this when you have a string that you know is a valid MapKey
 * (e.g., from iterating over gitStatus.keys()).
 */
export function asMapKey(key: string): MapKey {
  return key as MapKey;
}

/**
 * Cast a string to a FilePath.
 *
 * Use this when you have a string that you know is a valid file path
 * (e.g., from status.path or file system operations).
 */
export function asFilePath(path: string): FilePath {
  return path as FilePath;
}

// ============================================================================
// Content Source Types
// ============================================================================

/**
 * Specifies where to load file content from.
 *
 * - `'head'`: Content from the HEAD commit
 * - `'index'`: Content from the git staging area
 * - `'workingDirectory'`: Content from the filesystem (current working state)
 * - Any other string: Content from that git ref (branch name, commit SHA, etc.)
 *
 * Note: All sources except 'workingDirectory' are inherently read-only since
 * you cannot edit a git commit or the staging area directly.
 */
export type ContentSource =
  "head" | "index" | "workingDirectory" | (string & NonNullable<unknown>);

/**
 * Check if a content source refers to git content (not working directory).
 *
 * Git sources are inherently read-only since they reference committed or
 * staged content that cannot be directly edited.
 */
export function isGitSource(source: ContentSource): boolean {
  return source !== "workingDirectory";
}

/**
 * Convert a ContentSource to the git ref string used by git commands.
 *
 * - 'head' → 'HEAD'
 * - 'index' → '' (empty string means staging area in git show :path)
 * - other refs → passed through as-is
 *
 * Note: 'workingDirectory' should not be passed to this function.
 */
export function contentSourceToGitRef(source: ContentSource): string {
  switch (source) {
    case "head":
      return "HEAD";
    case "index":
      return "";
    case "workingDirectory":
      throw new Error(
        "contentSourceToGitRef: 'workingDirectory' is not a git source",
      );
    default:
      return source;
  }
}

// ============================================================================
// File Change Display Types
// ============================================================================

/**
 * Display-focused representation of a changed file.
 *
 * This is a presentation type used by file change components. Unlike
 * `GitFileStatus` (which includes working-tree concepts like `staged`) or
 * `CommitFile` (which includes statistics), this type focuses on what's
 * needed for display:
 *
 * - The file path and status for rendering
 * - Optional original path for renames
 * - No `staged` field - that's a working tree concept, not a display concept
 *
 * Use `commitFileToFileChange()` to create one from a historical commit file.
 */
export interface FileChangeDisplay {
  /** Relative path from repository root */
  path: string;

  /** Type of change - matches GitFileStatusCode for compatibility */
  status: GitFileStatusCode;

  /** Original path before rename/copy (only present for renamed/copied files) */
  originalPath?: string;
}
