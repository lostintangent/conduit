/**
 * useDiffContent Hook
 *
 * Provides the original and modified content for a diff view. Supports
 * configurable content sources for both sides of the diff.
 *
 * Content sources:
 * - 'head': Content from HEAD commit
 * - 'index': Content from git staging area
 * - 'workingDirectory': Content from filesystem (only valid for modified side)
 * - Any other string: Content from that git ref
 *
 * Git sides are read through `gitQueries.fileAtRef` once the cwd is watched,
 * so diffs of the same file share a read. The working directory side comes
 * from the model editors share.
 *
 * @example
 * ```tsx
 * // Staged changes: HEAD → Index
 * const diff = useDiffContent(filePath, cwd, {
 *   originalSource: 'head',
 *   modifiedSource: 'index',
 * });
 *
 * // Unstaged changes: HEAD → Working Directory
 * const diff = useDiffContent(filePath, cwd, {
 *   originalSource: 'head',
 *   modifiedSource: 'workingDirectory',
 * });
 *
 * // Partially staged: Index → Working Directory
 * const diff = useDiffContent(filePath, cwd, {
 *   originalSource: 'index',
 *   modifiedSource: 'workingDirectory',
 * });
 * ```
 */

import type { GitV2API } from "@features/git/client/GitV2API";
import { gitQueries } from "@features/git/client/queries";
import { useGitV2 } from "@features/git/components/useGitV2";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { MonacoModelRegistry, createModelKey } from "../registry";
import { type ContentSource, contentSourceToGitRef } from "../types";
import { isBinaryContent } from "../utils";

// ============================================================================
// Error Types
// ============================================================================

/**
 * Specific error types for diff content loading.
 */
export type DiffErrorType =
  | "not_tracked" // File is not tracked by git (new file)
  | "not_committed" // File is tracked but has no committed version yet
  | "ref_not_found" // Git ref (branch/commit) doesn't exist
  | "binary_file" // File appears to be binary
  | "file_not_found" // File doesn't exist in working directory
  | "unknown"; // Other/unexpected error

/**
 * Structured error information for diff loading failures.
 */
export interface DiffError {
  /** The type of error for programmatic handling */
  type: DiffErrorType;

  /** Human-readable error message */
  message: string;
}

/**
 * Result returned by useDiffContent hook.
 */
export interface DiffContent {
  /** Original content from the original source */
  original: string | null;

  /** Modified content from the modified source */
  modified: string | null;

  /** Whether content is currently being loaded */
  isLoading: boolean;

  /** Structured error information if loading failed */
  error: DiffError | null;

  /** Legacy: Simple error message (for backwards compatibility) */
  errorMessage: string | null;

  /** Whether the modified side is editable (only true for workingDirectory) */
  isModifiedEditable: boolean;
}

/**
 * Options for useDiffContent hook.
 */
export interface UseDiffContentOptions {
  /** Source for original content (default: 'head') */
  originalSource?: ContentSource;

  /** Source for modified content (default: 'workingDirectory') */
  modifiedSource?: ContentSource;

  /**
   * For renamed/copied files, the original path before the rename.
   * When provided, this path is used to fetch content from originalSource,
   * while filePath is used for modifiedSource.
   */
  originalFilePath?: string;
}

/**
 * Create a DiffError from an error object and context.
 *
 * Uses a priority-ordered approach to classify errors:
 * 1. Binary file detection (most specific)
 * 2. Git ref/revision not found
 * 3. File not committed yet
 * 4. File not tracked in git
 * 5. Unknown error (fallback with original message)
 *
 * The order matters because some error messages may match multiple patterns.
 */
function createDiffError(
  error: unknown,
  ref: string,
  filePath: string,
): DiffError {
  const originalMessage =
    error instanceof Error ? error.message : String(error);
  const errorMsg = originalMessage.toLowerCase();

  // Priority 1: Binary file (most specific)
  if (errorMsg.includes("binary")) {
    return {
      type: "binary_file",
      message: `File "${filePath}" appears to be a binary file`,
    };
  }

  // Priority 2: Git ref/revision not found
  // Common git error patterns:
  // - "fatal: bad revision 'nonexistent'"
  // - "unknown revision or path not in the working tree"
  // - "ambiguous argument 'nonexistent': unknown revision"
  if (
    (errorMsg.includes("bad revision") ||
      errorMsg.includes("unknown revision") ||
      errorMsg.includes("ambiguous argument")) &&
    !errorMsg.includes("exists in index")
  ) {
    return {
      type: "ref_not_found",
      message: `Git ref "${ref}" not found`,
    };
  }

  // Priority 3: File exists but has no committed version
  // Git error: "fatal: path 'file' exists on disk, but not in 'HEAD'"
  if (errorMsg.includes("exists on disk") && errorMsg.includes("fatal")) {
    return {
      type: "not_committed",
      message: `File "${filePath}" has no committed version yet`,
    };
  }

  // Priority 4: File not tracked in git
  // Common git error patterns:
  // - "fatal: path 'file' does not exist in 'HEAD'"
  // - "error: pathspec 'file' did not match any file(s)"
  // - "fatal: Path 'file' does not exist"
  if (
    errorMsg.includes("does not exist") ||
    errorMsg.includes("did not match") ||
    (errorMsg.includes("pathspec") && errorMsg.includes("error"))
  ) {
    return {
      type: "not_tracked",
      message: `File "${filePath}" is not tracked in git at ${ref}`,
    };
  }

  // Priority 5: Unknown error - preserve the original error message
  // This ensures we don't lose important debugging information
  return {
    type: "unknown",
    message: originalMessage || "Failed to load diff content",
  };
}

/** What one side of the diff read: its content, or why it couldn't. */
type Read = { content: string | null } | { error: unknown };

export function useDiffContent(
  filePath: string | null,
  cwd: string,
  options: UseDiffContentOptions = {},
): DiffContent {
  const {
    originalSource = "head",
    modifiedSource = "workingDirectory",
    originalFilePath,
  } = options;

  // Determine if modified side is editable (only workingDirectory is editable)
  const isModifiedEditable = modifiedSource === "workingDirectory";

  const git = useGitV2(cwd);
  const originalRef = contentSourceToGitRef(originalSource);
  const modifiedRef = isModifiedEditable
    ? null
    : contentSourceToGitRef(modifiedSource);

  // For renamed files, the original side is read at the path before the rename
  const originalPath = filePath === null ? null : originalFilePath || filePath;
  const original = useFileAtRef(git, originalPath, originalRef);
  const modifiedFromGit = useFileAtRef(
    git,
    modifiedRef === null ? null : filePath,
    modifiedRef ?? "",
  );
  const workingCopy = useWorkingCopy(isModifiedEditable ? filePath : null, cwd);
  const modified = isModifiedEditable ? workingCopy : modifiedFromGit;

  if (
    filePath === null ||
    originalPath === null ||
    original === undefined ||
    modified === undefined
  ) {
    return {
      original: null,
      modified: null,
      isLoading: filePath !== null,
      error: null,
      errorMessage: null,
      isModifiedEditable,
    };
  }

  const diff = compare(
    filePath,
    { read: original, ref: originalRef, path: originalPath },
    { read: modified, ref: modifiedRef },
  );
  return {
    ...diff,
    isLoading: false,
    errorMessage: diff.error?.message ?? null,
    isModifiedEditable,
  };
}

/** A file's content at a git ref, or undefined while it loads. */
function useFileAtRef(
  git: GitV2API,
  filePath: string | null,
  ref: string,
): Read | undefined {
  const query = useQuery({
    ...gitQueries.fileAtRef(git, filePath ?? "", ref),
    enabled: filePath !== null,
  });
  if (query.isSuccess) return { content: query.data };
  if (query.isError) return { error: query.error };
  return undefined;
}

/**
 * The working copy's content when the diff opens, from the model editors
 * share, or undefined while it loads. Later edits reach the diff through that
 * model rather than through this.
 */
function useWorkingCopy(
  filePath: string | null,
  cwd: string,
): Read | undefined {
  const [loaded, setLoaded] = useState<{
    filePath: string;
    cwd: string;
    read: Read;
  } | null>(null);

  useEffect(() => {
    if (filePath === null) return;
    let current = true;
    void readWorkingCopy(filePath, cwd).then((read) => {
      if (current) setLoaded({ filePath, cwd, read });
    });
    return () => {
      current = false;
    };
  }, [filePath, cwd]);

  return loaded?.filePath === filePath && loaded.cwd === cwd
    ? loaded.read
    : undefined;
}

async function readWorkingCopy(filePath: string, cwd: string): Promise<Read> {
  const registry = MonacoModelRegistry.getInstance();
  const modelKey = createModelKey(filePath);

  // An open model has the content, along with any unsaved edits
  if (registry.getModelState(modelKey) !== undefined) {
    return { content: registry.getModel(modelKey)?.getValue() ?? null };
  }
  try {
    return {
      content: (await registry.getOrCreateModel(filePath, cwd)).getValue(),
    };
  } catch (error) {
    return { error };
  }
}

/**
 * Diff what each side read. A file that's missing from the original side but
 * present on the modified side is shown as added. Otherwise the original
 * side's error wins, and the modified side isn't shown.
 */
function compare(
  filePath: string,
  original: { read: Read; ref: string; path: string },
  modified: { read: Read; ref: string | null },
): Pick<DiffContent, "original" | "modified" | "error"> {
  let originalContent: string | null = null;
  let modifiedContent: string | null = null;
  let error: DiffError | null = null;

  if ("error" in original.read) {
    error = createDiffError(original.read.error, original.ref, original.path);
  } else if (
    original.read.content !== null &&
    isBinaryContent(original.read.content)
  ) {
    error = binaryFile(filePath);
  } else {
    originalContent = original.read.content;
  }

  if (error === null || isMissing(error)) {
    if ("error" in modified.read) {
      error ??=
        modified.ref === null
          ? { type: "file_not_found", message: `File "${filePath}" not found` }
          : createDiffError(modified.read.error, modified.ref, filePath);
    } else if (
      error === null &&
      modified.read.content !== null &&
      isBinaryContent(modified.read.content)
    ) {
      error = binaryFile(filePath);
    } else {
      modifiedContent = modified.read.content;
    }
  }

  if (error !== null && isMissing(error) && modifiedContent !== null) {
    return { original: "", modified: modifiedContent, error: null };
  }
  return { original: originalContent, modified: modifiedContent, error };
}

/** Whether the original side lacks the file, as it does for a new one. */
function isMissing(error: DiffError): boolean {
  return error.type === "not_tracked" || error.type === "not_committed";
}

function binaryFile(filePath: string): DiffError {
  return {
    type: "binary_file",
    message: `File "${filePath}" appears to be a binary file`,
  };
}
