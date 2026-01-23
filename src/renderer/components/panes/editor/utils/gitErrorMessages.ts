/**
 * Git error message utilities.
 *
 * Provides user-friendly error messages for common git errors.
 * Based on error patterns from dugite (GitHub Desktop's git library).
 *
 * @see https://github.com/desktop/dugite/blob/main/lib/errors.ts
 */

/**
 * Mapping of regex patterns to user-friendly error messages.
 * Patterns are tested against the raw error message in order.
 * First match wins.
 */
const GitErrorPatterns: Array<{
  pattern: RegExp;
  message: string;
  details?: string;
}> = [
  // Push/Pull errors
  {
    pattern: /\(non-fast-forward\)|fetch first|failed to push some refs/i,
    message: "Push rejected",
    details:
      "The remote has changes you don't have locally. Pull to update your branch first.",
  },
  {
    pattern: /tip of your current branch is behind/i,
    message: "Branch is behind",
    details: "Pull the latest changes before pushing.",
  },

  // Authentication errors
  {
    pattern: /Authentication failed for 'https?:\/\//i,
    message: "Authentication failed",
    details: "Check your credentials or try signing in again.",
  },
  {
    pattern: /fatal: Authentication failed/i,
    message: "Authentication failed",
    details: "SSH authentication failed. Check your SSH key configuration.",
  },
  {
    pattern: /Could not read from remote repository/i,
    message: "Repository access denied",
    details: "Check your permissions and that the repository exists.",
  },
  {
    pattern: /The requested URL returned error: 403/i,
    message: "Access forbidden",
    details: "You don't have permission to access this repository.",
  },

  // Network errors
  {
    pattern: /the remote end hung up unexpectedly/i,
    message: "Connection lost",
    details:
      "The connection to the remote was interrupted. Check your network and try again.",
  },
  {
    pattern: /Failed to connect to .+: Host is down/i,
    message: "Host unreachable",
    details:
      "The remote server is not responding. Check your network connection.",
  },
  {
    pattern: /Could not resolve host/i,
    message: "Network error",
    details:
      "Could not reach the remote server. Check your internet connection.",
  },

  // Repository errors
  {
    pattern: /repository '.*' not found/i,
    message: "Repository not found",
    details: "The repository doesn't exist or you don't have access to it.",
  },
  {
    pattern: /Repository not found/i,
    message: "Repository not found",
    details: "The repository doesn't exist or you don't have access to it.",
  },
  {
    pattern: /not a git repository/i,
    message: "Not a git repository",
    details: "This directory is not a git repository.",
  },

  // Merge/Rebase conflicts
  {
    pattern: /Merge conflict|Automatic merge failed/i,
    message: "Merge conflict",
    details: "There are conflicts that need to be resolved manually.",
  },
  {
    pattern: /Resolve all conflicts manually/i,
    message: "Rebase conflict",
    details: "There are conflicts that need to be resolved before continuing.",
  },
  {
    pattern: /refusing to merge unrelated histories/i,
    message: "Cannot merge unrelated histories",
    details:
      "The branches have no common ancestor. Use --allow-unrelated-histories if intended.",
  },

  // Local changes errors
  {
    pattern:
      /local changes to the following files would be overwritten|uncommitted changes/i,
    message: "Uncommitted changes would be overwritten",
    details: "Commit or stash your changes before switching branches.",
  },
  {
    pattern: /cannot (pull with rebase|rebase): You have unstaged changes/i,
    message: "Cannot rebase with local changes",
    details: "Commit or stash your changes before rebasing.",
  },
  {
    pattern:
      /Your local changes to the following files would be overwritten by merge/i,
    message: "Cannot merge with local changes",
    details: "Commit or stash your changes before merging.",
  },

  // Commit errors
  {
    pattern: /nothing to commit/i,
    message: "Nothing to commit",
    details: "There are no staged changes to commit.",
  },
  {
    pattern: /empty commit message/i,
    message: "Empty commit message",
    details: "Please provide a commit message.",
  },

  // Branch errors
  {
    pattern: /branch named '.*' already exists/i,
    message: "Branch already exists",
    details: "A branch with this name already exists.",
  },
  {
    pattern: /Branch rename failed/i,
    message: "Branch rename failed",
    details: "Could not rename the branch.",
  },
  {
    pattern: /unable to delete '.*': remote ref does not exist/i,
    message: "Branch not found on remote",
    details: "The branch doesn't exist on the remote.",
  },
  {
    pattern: /deletion of the current branch prohibited/i,
    message: "Cannot delete current branch",
    details: "You cannot delete the branch you're currently on.",
  },

  // Protected branch errors (GitHub-specific)
  {
    pattern: /Protected branch update failed.*At least one approved review/i,
    message: "Review required",
    details: "This branch requires an approved review before pushing.",
  },
  {
    pattern: /Protected branch update failed.*Cannot force-push/i,
    message: "Force push not allowed",
    details: "Force pushing to this protected branch is not allowed.",
  },
  {
    pattern: /Protected branch update failed.*Cannot delete/i,
    message: "Cannot delete protected branch",
    details: "This branch is protected and cannot be deleted.",
  },
  {
    pattern: /Protected branch update failed.*Required status check/i,
    message: "Status checks required",
    details: "Required status checks have not passed.",
  },

  // GitHub-specific errors
  {
    pattern: /GH001:/i,
    message: "File too large",
    details:
      "This file exceeds GitHub's file size limit. Consider using Git LFS.",
  },
  {
    pattern: /GH007:.*private email/i,
    message: "Private email blocked",
    details:
      "Your push would publish a private email. Update your git config or GitHub settings.",
  },
  {
    pattern: /force-pushing to .+ is not allowed/i,
    message: "Force push rejected",
    details: "Force pushing to this branch is not allowed.",
  },
  {
    pattern: /Push cannot contain secrets/i,
    message: "Secret detected",
    details:
      "GitHub detected a secret in your push. Remove or rotate the secret before pushing.",
  },

  // Lock file errors
  {
    pattern: /Another git process seems to be running|\.lock.*File exists/i,
    message: "Git is busy",
    details:
      "Another git process is running. Wait for it to finish or remove stale lock files.",
  },

  // Misc errors
  {
    pattern: /bad revision/i,
    message: "Invalid reference",
    details: "The specified commit, branch, or tag doesn't exist.",
  },
  {
    pattern: /path '.*' does not exist/i,
    message: "Path not found",
    details: "The specified file or directory doesn't exist.",
  },
  {
    pattern: /gpg failed to sign/i,
    message: "GPG signing failed",
    details: "Could not sign the commit. Check your GPG configuration.",
  },
  {
    pattern: /detected dubious ownership/i,
    message: "Unsafe directory",
    details:
      "Git detected the repository may be owned by another user. Add it to safe.directory if trusted.",
  },
  {
    pattern: /tag '.*' already exists/i,
    message: "Tag already exists",
    details: "A tag with this name already exists.",
  },
  {
    pattern: /remote .* already exists/i,
    message: "Remote already exists",
    details: "A remote with this name already exists.",
  },
];

export interface FriendlyGitError {
  /** User-friendly error title/message */
  message: string;
  /** Optional details explaining the error and how to fix it */
  details?: string;
  /** The original raw error message (for logging/debugging) */
  rawMessage: string;
}

/**
 * Converts a raw git error message to a user-friendly format.
 *
 * Matches the error against known patterns and returns a friendly message.
 * Falls back to extracting a clean message from the raw error if no pattern matches.
 *
 * @param error - The error object or string
 * @returns A friendly error object with message, optional details, and raw message
 *
 * @example
 * ```ts
 * const result = getFriendlyGitError(error);
 * console.error(result.rawMessage); // Log raw for debugging
 * showToast({ message: result.message, details: result.details });
 * ```
 */
export function getFriendlyGitError(error: unknown): FriendlyGitError {
  const rawMessage = error instanceof Error ? error.message : String(error);

  // Try to match against known patterns
  for (const { pattern, message, details } of GitErrorPatterns) {
    if (pattern.test(rawMessage)) {
      return { message, details, rawMessage };
    }
  }

  // Fallback: try to extract a cleaner message from common git error formats
  const cleanedMessage = cleanGitErrorMessage(rawMessage);

  return {
    message: cleanedMessage,
    rawMessage,
  };
}

/**
 * Attempts to clean up a raw git error message for display.
 * Extracts the most relevant part of verbose git output.
 */
function cleanGitErrorMessage(raw: string): string {
  // Remove common prefixes
  let cleaned = raw
    .replace(/^Error invoking remote method '[^']+': /i, "")
    .replace(/^Error: /i, "")
    .replace(/^fatal: /gim, "")
    .replace(/^error: /gim, "");

  // If there are multiple lines, try to get the most relevant one
  const lines = cleaned.split("\n").filter((line) => {
    const trimmed = line.trim();
    // Skip empty lines and hint lines
    return (
      trimmed.length > 0 &&
      !trimmed.startsWith("hint:") &&
      !trimmed.startsWith("remote:")
    );
  });

  if (lines.length > 0) {
    // Return the first meaningful line, capped at reasonable length
    const firstLine = lines[0].trim();
    if (firstLine.length > 100) {
      return firstLine.substring(0, 100) + "...";
    }
    return firstLine;
  }

  // Last resort: return truncated original
  if (raw.length > 100) {
    return raw.substring(0, 100) + "...";
  }

  return raw || "An unknown git error occurred";
}
