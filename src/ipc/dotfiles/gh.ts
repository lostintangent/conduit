/**
 * GitHub CLI interactions for dotfiles repository.
 */

import { spawn } from "node:child_process";

/**
 * Normalize a dotfiles repository URL or owner/repo string into a full GitHub HTTPS URL.
 *
 * Supports formats like:
 * - owner/repo
 * - github.com/owner/repo
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo.git
 *
 * @param input - The repository identifier to normalize
 * @returns Full HTTPS GitHub URL, or null if input is invalid
 */
export function normalizeDotfilesRepo(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Remove trailing .git extension for consistent pattern matching
  const withoutGit = trimmed.replace(/\.git$/, "");

  // Extract owner/repo from GitHub URLs or simple format
  const githubMatch = withoutGit.match(
    /(?:(?:https?:\/\/)?(?:www\.)?github\.com\/)?([^/\s]+)\/([^/\s]+)$/,
  );

  if (githubMatch) {
    const [, owner, repo] = githubMatch;
    return `https://github.com/${owner}/${repo}.git`;
  }

  // Non-GitHub URL (e.g., GitLab, Bitbucket) - return as-is
  if (/^https?:\/\//.test(trimmed)) {
    return trimmed;
  }

  return null;
}

interface GitHubRepo {
  name: string;
  sshUrl: string;
  url: string;
}

/**
 * Executes a command and returns stdout.
 */
function exec(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => (stdout += data.toString()));
    child.stderr.on("data", (data: Buffer) => (stderr += data.toString()));

    child.on("close", (code: number) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`Command failed with code ${code}: ${stderr}`));
    });

    child.on("error", (err: Error) => reject(err));
  });
}

/**
 * Checks if the user has a "dotfiles" repository on GitHub.
 * Returns the HTTPS URL if found, undefined otherwise.
 */
export async function discoverDotfilesRepo(): Promise<string | undefined> {
  try {
    // Check if gh CLI is available
    try {
      await exec("gh", ["--version"]);
    } catch {
      return undefined;
    }

    // List user's repos and look for one named "dotfiles"
    const output = await exec("gh", [
      "repo",
      "list",
      "--json",
      "name,sshUrl,url",
      "--limit",
      "100",
    ]);

    const repos = JSON.parse(output) as GitHubRepo[];
    const dotfilesRepo = repos.find((r) => r.name === "dotfiles");

    return dotfilesRepo?.url;
  } catch (error) {
    console.error("Failed to auto-discover dotfiles repo:", error);
    return undefined;
  }
}

/**
 * Creates a new private "dotfiles" repository on GitHub.
 * Returns the HTTPS URL of the created repository.
 */
export async function createDotfilesRepo(): Promise<string> {
  // Create private repo named 'dotfiles'
  await exec("gh", ["repo", "create", "dotfiles", "--private"]);

  // Get the clone URL
  const output = await exec("gh", [
    "repo",
    "view",
    "dotfiles",
    "--json",
    "url",
  ]);
  const { url } = JSON.parse(output);

  return url;
}
