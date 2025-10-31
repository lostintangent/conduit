const api = window.conduit;

/**
 * Result of git repository verification
 */
export interface GitRepoHandlerResult {
  success: boolean;
  error?: string;
}

/**
 * Verify that a directory is inside a git repository
 *
 * This handler checks if the specified directory is part of a git repository.
 * Useful for validating that git-related commands will work before executing them.
 *
 * @param cwd The directory to check
 * @returns Result indicating success or failure with error message
 */
export async function verifyGitRepoHandler(
  cwd: string
): Promise<GitRepoHandlerResult> {
  try {
    const hasGitRepo = await api.hasGitRepository(cwd);

    if (!hasGitRepo) {
      return {
        success: false,
        error: `Not a git repository: ${cwd}`,
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      success: false,
      error: `Failed to check git repository: ${errorMessage}`,
    };
  }
}
