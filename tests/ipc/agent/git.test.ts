import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock runGit before importing anything
vi.mock("../../../src/ipc/agent/git", async () => {
  const actual = await vi.importActual<
    typeof import("../../../src/ipc/agent/git")
  >("../../../src/ipc/agent/git");
  return {
    ...actual,
    runGit: vi.fn(),
  };
});

import {
  gitPull,
  gitPush,
  hasUpstreamBranch,
  parseGitHubRepo,
  runGit,
} from "../../../src/ipc/agent/git";

describe("parseGitHubRepo", () => {
  it("should parse HTTPS GitHub URL", () => {
    const result = parseGitHubRepo("https://github.com/owner/repo.git");
    expect(result).toEqual({
      owner: "owner",
      name: "repo",
    });
  });

  it("should parse HTTPS GitHub URL without .git", () => {
    const result = parseGitHubRepo("https://github.com/owner/repo");
    expect(result).toEqual({
      owner: "owner",
      name: "repo",
    });
  });

  it("should parse SSH GitHub URL", () => {
    const result = parseGitHubRepo("git@github.com:owner/repo.git");
    expect(result).toEqual({
      owner: "owner",
      name: "repo",
    });
  });

  it("should parse SSH GitHub URL without .git", () => {
    const result = parseGitHubRepo("git@github.com:owner/repo");
    expect(result).toEqual({
      owner: "owner",
      name: "repo",
    });
  });

  it("should return null for non-GitHub URLs", () => {
    const result = parseGitHubRepo("https://gitlab.com/owner/repo.git");
    expect(result).toBeNull();
  });

  it("should return null for invalid URLs", () => {
    const result = parseGitHubRepo("not-a-url");
    expect(result).toBeNull();
  });
});

describe("gitPull", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call git pull without rebase by default", async () => {
    (runGit as any).mockResolvedValue({
      stdout: "Already up to date.",
      stderr: "",
    });

    const result = await gitPull("/test/repo");

    expect(runGit).toHaveBeenCalledWith("/test/repo", ["pull"]);
    expect(result.stdout).toBe("Already up to date.");
  });

  it("should call git pull with --rebase when rebase is true", async () => {
    (runGit as any).mockResolvedValue({
      stdout: "Successfully rebased and updated refs/heads/main.",
      stderr: "",
    });

    await gitPull("/test/repo", true);

    expect(runGit).toHaveBeenCalledWith("/test/repo", ["pull", "--rebase"]);
  });

  it("should return stdout and stderr from git command", async () => {
    const mockOutput = {
      stdout: "Updating abc123..def456\nFast-forward",
      stderr: "some warning",
    };
    (runGit as any).mockResolvedValue(mockOutput);

    const result = await gitPull("/test/repo");

    expect(result).toEqual(mockOutput);
  });

  it("should propagate errors from runGit", async () => {
    (runGit as any).mockRejectedValue(
      new Error("fatal: no tracking information"),
    );

    await expect(gitPull("/test/repo")).rejects.toThrow(
      "no tracking information",
    );
  });
});

describe("gitPush", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call git push without flags by default", async () => {
    (runGit as any).mockResolvedValue({
      stdout: "Everything up-to-date",
      stderr: "",
    });

    const result = await gitPush("/test/repo");

    expect(runGit).toHaveBeenCalledWith("/test/repo", ["push"]);
    expect(result.stdout).toBe("Everything up-to-date");
  });

  it("should call git push with --force-with-lease when force is true", async () => {
    (runGit as any).mockResolvedValue({
      stdout: "Branch main set up to track remote branch main from origin.",
      stderr: "",
    });

    await gitPush("/test/repo", true);

    expect(runGit).toHaveBeenCalledWith("/test/repo", [
      "push",
      "--force-with-lease",
    ]);
  });

  it("should call git push with --set-upstream when setUpstream is true", async () => {
    (runGit as any).mockResolvedValue({
      stdout:
        "Branch feature set up to track remote branch feature from origin.",
      stderr: "",
    });

    await gitPush("/test/repo", false, true);

    expect(runGit).toHaveBeenCalledWith("/test/repo", [
      "push",
      "--set-upstream",
      "origin",
      "HEAD",
    ]);
  });

  it("should combine force and setUpstream flags", async () => {
    (runGit as any).mockResolvedValue({
      stdout: "Branch pushed with upstream",
      stderr: "",
    });

    await gitPush("/test/repo", true, true);

    expect(runGit).toHaveBeenCalledWith("/test/repo", [
      "push",
      "--force-with-lease",
      "--set-upstream",
      "origin",
      "HEAD",
    ]);
  });

  it("should return stdout and stderr from git command", async () => {
    const mockOutput = {
      stdout: "To github.com:user/repo.git\n   abc123..def456  main -> main",
      stderr: "",
    };
    (runGit as any).mockResolvedValue(mockOutput);

    const result = await gitPush("/test/repo");

    expect(result).toEqual(mockOutput);
  });

  it("should propagate errors from runGit", async () => {
    (runGit as any).mockRejectedValue(
      new Error("error: failed to push some refs"),
    );

    await expect(gitPush("/test/repo")).rejects.toThrow(
      "failed to push some refs",
    );
  });
});

describe("hasUpstreamBranch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return true when upstream branch exists", async () => {
    (runGit as any).mockResolvedValue({
      stdout: "origin/main",
      stderr: "",
    });

    const result = await hasUpstreamBranch("/test/repo");

    expect(runGit).toHaveBeenCalledWith("/test/repo", [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{u}",
    ]);
    expect(result).toBe(true);
  });

  it("should return true when upstream exists with whitespace", async () => {
    (runGit as any).mockResolvedValue({
      stdout: "origin/feature\n",
      stderr: "",
    });

    const result = await hasUpstreamBranch("/test/repo");

    expect(result).toBe(true);
  });

  it("should return false when upstream branch does not exist", async () => {
    (runGit as any).mockRejectedValue(
      new Error("fatal: no upstream configured for branch"),
    );

    const result = await hasUpstreamBranch("/test/repo");

    expect(result).toBe(false);
  });

  it("should return false when git command returns empty output", async () => {
    (runGit as any).mockResolvedValue({
      stdout: "",
      stderr: "",
    });

    const result = await hasUpstreamBranch("/test/repo");

    expect(result).toBe(false);
  });

  it("should return false when git command returns only whitespace", async () => {
    (runGit as any).mockResolvedValue({
      stdout: "   \n  \t  ",
      stderr: "",
    });

    const result = await hasUpstreamBranch("/test/repo");

    expect(result).toBe(false);
  });

  it("should return false on any error", async () => {
    (runGit as any).mockRejectedValue(new Error("Git error"));

    const result = await hasUpstreamBranch("/test/repo");

    expect(result).toBe(false);
  });
});
