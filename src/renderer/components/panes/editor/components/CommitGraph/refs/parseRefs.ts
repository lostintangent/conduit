/**
 * Ref Parsing Utilities
 *
 * Parses raw git ref strings from git log --decorate format (%D) into
 * structured GitRef objects for display in the commit graph.
 *
 * Git ref format examples:
 * - "HEAD -> main" - HEAD pointing to local branch 'main'
 * - "HEAD" - Detached HEAD (no branch)
 * - "origin/main" - Remote tracking branch
 * - "origin/HEAD" - Remote HEAD reference (skip this)
 * - "tag: v1.0.0" - Tag
 * - "main, origin/main" - Multiple refs (comma-separated)
 *
 * @see types.ts for GitRef interface
 */

import type { GitRef, RefType } from "../types";

// =============================================================================
// Constants
// =============================================================================

/**
 * Pattern to match "HEAD -> branchname" format.
 * Captures the branch name after the arrow.
 */
const HEAD_ARROW_PATTERN = /^HEAD -> (.+)$/;

/**
 * Pattern to match "tag: tagname" format.
 * Captures the tag name after "tag: ".
 */
const TAG_PATTERN = /^tag: (.+)$/;

/**
 * Pattern to match remote refs like "origin/main".
 * Captures the remote name and branch name.
 */
const REMOTE_PATTERN = /^([^/]+)\/(.+)$/;

// =============================================================================
// Parsing Functions
// =============================================================================

/**
 * Parse a single ref string into a GitRef object.
 *
 * @param refString - Raw ref string from git (e.g., "HEAD -> main", "origin/main")
 * @returns Parsed GitRef, or null if the ref should be skipped
 *
 * @example
 * ```ts
 * parseRef("HEAD -> main")     // { type: "head", name: "main", isHead: true }
 * parseRef("origin/main")      // { type: "remote", name: "main", remote: "origin" }
 * parseRef("tag: v1.0.0")      // { type: "tag", name: "v1.0.0" }
 * parseRef("main")             // { type: "head", name: "main" }
 * parseRef("HEAD")             // null (skip standalone HEAD)
 * parseRef("origin/HEAD")      // null (skip remote HEAD)
 * ```
 */
export function parseRef(refString: string): GitRef | null {
  const trimmed = refString.trim();

  if (!trimmed) {
    return null;
  }

  // Skip standalone HEAD (detached HEAD indicator without branch)
  if (trimmed === "HEAD") {
    return null;
  }

  // Check for "HEAD -> branchname" pattern (current branch)
  const headMatch = HEAD_ARROW_PATTERN.exec(trimmed);
  if (headMatch) {
    return {
      type: "head",
      name: headMatch[1],
      isHead: true,
    };
  }

  // Check for "tag: tagname" pattern
  const tagMatch = TAG_PATTERN.exec(trimmed);
  if (tagMatch) {
    return {
      type: "tag",
      name: tagMatch[1],
    };
  }

  // Check for "remote/branch" pattern
  const remoteMatch = REMOTE_PATTERN.exec(trimmed);
  if (remoteMatch) {
    const [, remote, name] = remoteMatch;

    // Skip origin/HEAD and similar remote HEAD refs
    if (name === "HEAD") {
      return null;
    }

    return {
      type: "remote",
      name,
      remote,
    };
  }

  // Default: treat as local branch
  return {
    type: "head",
    name: trimmed,
  };
}

/**
 * Parse an array of raw ref strings into GitRef objects.
 *
 * Filters out null results (skipped refs) and returns only valid refs.
 * Results are sorted for consistent display order:
 * 1. HEAD (current branch) first
 * 2. Local branches
 * 3. Remote branches
 * 4. Tags
 *
 * @param refs - Array of raw ref strings from git
 * @returns Array of parsed GitRef objects, sorted for display
 *
 * @example
 * ```ts
 * parseRefs(["HEAD -> main", "origin/main", "tag: v1.0"])
 * // Returns:
 * // [
 * //   { type: "head", name: "main", isHead: true },
 * //   { type: "remote", name: "main", remote: "origin" },
 * //   { type: "tag", name: "v1.0" }
 * // ]
 * ```
 */
export function parseRefs(refs: string[] | undefined): GitRef[] {
  if (!refs || refs.length === 0) {
    return [];
  }

  const parsed: GitRef[] = [];

  for (const ref of refs) {
    const gitRef = parseRef(ref);
    if (gitRef) {
      parsed.push(gitRef);
    }
  }

  // Sort for consistent display order
  return sortRefs(parsed);
}

/**
 * Filter refs for display, matching VS Code's selective approach.
 *
 * VS Code's logic:
 * 1. For HEAD commit: show current branch + its upstream remote
 * 2. For other commits: only show tags
 *
 * This reduces noise by not showing every branch that points to a commit.
 *
 * @param refs - Array of parsed GitRef objects
 * @returns Filtered array with only refs worth displaying
 *
 * @example
 * ```ts
 * // HEAD commit with multiple branches
 * filterRefsForDisplay([
 *   { type: "head", name: "main", isHead: true },
 *   { type: "head", name: "testtest" },           // filtered out
 *   { type: "remote", name: "main", remote: "origin" },
 *   { type: "remote", name: "diff-view", remote: "origin" }, // filtered out
 * ])
 * // Returns: [{ type: "head", name: "main", isHead: true }, { type: "remote", name: "main", remote: "origin" }]
 * ```
 */
export function filterRefsForDisplay(refs: GitRef[]): GitRef[] {
  if (refs.length === 0) {
    return [];
  }

  // Find the HEAD ref (current branch)
  const headRef = refs.find((r) => r.isHead);

  // If this commit has HEAD, show current branch + its upstream + tags
  if (headRef) {
    return refs.filter((ref) => {
      // Always show HEAD (current branch)
      if (ref.isHead) return true;

      // Show the upstream of the current branch (origin/branchname)
      if (ref.type === "remote" && ref.name === headRef.name) {
        return true;
      }

      // Always show tags
      if (ref.type === "tag") return true;

      // Filter out other branches
      return false;
    });
  }

  // For non-HEAD commits, only show tags
  return refs.filter((ref) => ref.type === "tag");
}

/**
 * Sort refs for display.
 *
 * Order:
 * 1. HEAD (current branch) - always first
 * 2. Local branches (alphabetically)
 * 3. Remote branches (alphabetically by remote, then name)
 * 4. Tags (alphabetically)
 *
 * @param refs - Array of GitRef objects to sort
 * @returns Sorted array (original array is not modified)
 */
export function sortRefs(refs: GitRef[]): GitRef[] {
  return [...refs].sort((a, b) => {
    // HEAD always first
    if (a.isHead && !b.isHead) return -1;
    if (!a.isHead && b.isHead) return 1;

    // Type priority: head > remote > tag
    const typePriority: Record<RefType, number> = {
      head: 0,
      remote: 1,
      tag: 2,
    };

    const typeCompare = typePriority[a.type] - typePriority[b.type];
    if (typeCompare !== 0) return typeCompare;

    // For remote refs, sort by remote name first
    if (a.type === "remote" && b.type === "remote") {
      const remoteCompare = (a.remote || "").localeCompare(b.remote || "");
      if (remoteCompare !== 0) return remoteCompare;
    }

    // Finally, sort by name
    return a.name.localeCompare(b.name);
  });
}

/**
 * Filter refs to only include specific types.
 *
 * @param refs - Array of GitRef objects
 * @param types - Types to include
 * @returns Filtered array
 *
 * @example
 * ```ts
 * filterRefsByType(refs, ["head", "remote"])  // Only branches, no tags
 * filterRefsByType(refs, ["tag"])             // Only tags
 * ```
 */
export function filterRefsByType(refs: GitRef[], types: RefType[]): GitRef[] {
  return refs.filter((ref) => types.includes(ref.type));
}

/**
 * Get the HEAD ref from a list of refs.
 *
 * @param refs - Array of GitRef objects
 * @returns The HEAD ref, or undefined if not found
 */
export function getHeadRef(refs: GitRef[]): GitRef | undefined {
  return refs.find((ref) => ref.isHead);
}

/**
 * Check if a commit has any refs.
 *
 * @param refs - Raw refs array from HistoryCommit
 * @returns True if the commit has at least one displayable ref
 */
export function hasRefs(refs: string[] | undefined): boolean {
  if (!refs || refs.length === 0) {
    return false;
  }

  // Check if any ref parses to a valid GitRef
  return refs.some((ref) => parseRef(ref) !== null);
}
