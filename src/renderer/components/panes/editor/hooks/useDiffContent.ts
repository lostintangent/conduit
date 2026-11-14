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
import {
  binaryFileError,
  type ContentError,
  gitReadError,
  isBinaryContent,
} from "../utils";

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
  error: ContentError | null;

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
  let error: ContentError | null = null;

  if ("error" in original.read) {
    error = gitReadError(original.read.error, original.ref, original.path);
  } else if (
    original.read.content !== null &&
    isBinaryContent(original.read.content)
  ) {
    error = binaryFileError(filePath);
  } else {
    originalContent = original.read.content;
  }

  if (error === null || isMissing(error)) {
    if ("error" in modified.read) {
      error ??=
        modified.ref === null
          ? { type: "file_not_found", message: `File "${filePath}" not found` }
          : gitReadError(modified.read.error, modified.ref, filePath);
    } else if (
      error === null &&
      modified.read.content !== null &&
      isBinaryContent(modified.read.content)
    ) {
      error = binaryFileError(filePath);
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
function isMissing(error: ContentError): boolean {
  return error.type === "not_tracked" || error.type === "not_committed";
}
