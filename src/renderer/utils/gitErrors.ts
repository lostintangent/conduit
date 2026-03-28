/**
 * Extracts all hint lines from a git error message and combines them
 */
function extractGitHints(gitError: string): string | null {
  const hintLines = gitError.match(/^hint: (.+)$/gm);
  if (hintLines && hintLines.length > 0) {
    return hintLines
      .map((line) => line.replace(/^hint: /, ""))
      .join(" ")
      .trim();
  }
  return null;
}

/**
 * Cleans up git error messages to be more user-friendly
 */
export function cleanGitError(error: unknown): {
  message: string;
  details?: string;
} {
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Extract the actual git error from our wrapper format:
  // "Failed to run git <command> (code <code>): <actual error>"
  // Use [\s\S]+ to match across newlines
  const wrapperMatch = errorMessage.match(
    /Failed to run git .+ \(code .+?\): ([\s\S]+)/,
  );
  const gitError = wrapperMatch ? wrapperMatch[1] : errorMessage;

  // Common git error patterns
  if (
    gitError.includes("no tracking information") ||
    gitError.includes("no upstream branch")
  ) {
    return {
      message: "No upstream branch configured",
      details:
        "This branch doesn't have a remote tracking branch. Use 'Publish' to push it to the remote.",
    };
  }

  if (
    gitError.includes("uncommitted changes") ||
    gitError.includes("would be overwritten")
  ) {
    return {
      message: "Uncommitted changes would be overwritten",
      details: "Commit or stash your changes before pulling.",
    };
  }

  if (gitError.includes("merge conflict") || gitError.includes("CONFLICT")) {
    return {
      message: "Merge conflict detected",
      details: "Resolve conflicts in the affected files before continuing.",
    };
  }

  if (gitError.includes("not a git repository")) {
    return {
      message: "Not a git repository",
      details: "This directory is not inside a git repository.",
    };
  }

  if (
    gitError.includes("Permission denied") ||
    gitError.includes("permission denied")
  ) {
    return {
      message: "Permission denied",
      details: "You don't have permission to perform this operation.",
    };
  }

  if (
    gitError.includes("Authentication failed") ||
    gitError.includes("authentication failed")
  ) {
    return {
      message: "Authentication failed",
      details: "Check your git credentials and try again.",
    };
  }

  if (gitError.includes("failed to push") || gitError.includes("rejected")) {
    const hints = extractGitHints(gitError);
    const details =
      hints ||
      "The remote contains commits you don't have locally. Pull first, then push.";

    return {
      message: "Push rejected",
      details,
    };
  }

  if (gitError.includes("nothing to commit")) {
    return {
      message: "Nothing to commit",
      details: "There are no staged changes to commit.",
    };
  }

  if (
    gitError.includes("pathspec") &&
    gitError.includes("did not match any files")
  ) {
    return {
      message: "File not found",
      details: "The specified file doesn't exist in the repository.",
    };
  }

  if (gitError.includes("fatal:")) {
    // Extract the fatal message (may span multiple lines)
    const fatalMatch = gitError.match(
      /fatal: ([\s\S]+?)(?:\nhint:|\nerror:|\n(?![ \t])|$)/,
    );
    if (fatalMatch) {
      const hints = extractGitHints(gitError);
      return {
        message: "Git error",
        details: hints || fatalMatch[1].trim(),
      };
    }
  }

  if (gitError.includes("error:")) {
    // Extract the error message (may span multiple lines)
    const errorMatch = gitError.match(
      /error: ([\s\S]+?)(?:\nhint:|\nfatal:|\n(?![ \t])|$)/,
    );
    if (errorMatch) {
      const hints = extractGitHints(gitError);
      return {
        message: "Git error",
        details: hints || errorMatch[1].trim(),
      };
    }
  }

  // If no specific pattern matched, return the cleaned error
  // Check for hints first, otherwise use the cleaned error
  const hints = extractGitHints(gitError);
  if (hints) {
    return {
      message: "Git operation failed",
      details: hints,
    };
  }

  // Remove common prefixes
  const cleanedError = gitError
    .replace(/^fatal: /, "")
    .replace(/^error: /, "")
    .trim();

  return {
    message: "Git operation failed",
    details: cleanedError,
  };
}
