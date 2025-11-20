import { beforeEach, describe, expect, it, vi } from "vitest";

// Create a hoisted mock function that can be used in vi.mock factory
const mockRunGit = vi.hoisted(() => vi.fn());

// Mock the git module
vi.mock("../../../src/ipc/agent/git", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../../src/ipc/agent/git")>();
  return {
    ...actual,
    runGit: mockRunGit,
  };
});

import {
  gitCommit,
  gitPull,
  gitPush,
  gitRevert,
  gitStage,
  gitUnstage,
  hasUpstreamBranch,
  parseGitHubRepo,
} from "../../../src/ipc/agent/git";

const runGitSpy = mockRunGit;

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
    runGitSpy.mockResolvedValue({
      stdout: "Already up to date.",
      stderr: "",
    });

    const result = await gitPull("/test/repo");

    expect(runGitSpy).toHaveBeenCalledWith("/test/repo", ["pull"]);
    expect(result.stdout).toBe("Already up to date.");
  });

  it("should call git pull with --rebase when rebase is true", async () => {
    runGitSpy.mockResolvedValue({
      stdout: "Successfully rebased and updated refs/heads/main.",
      stderr: "",
    });

    await gitPull("/test/repo", true);

    expect(runGitSpy).toHaveBeenCalledWith("/test/repo", ["pull", "--rebase"]);
  });

  it("should return stdout and stderr from git command", async () => {
    const mockOutput = {
      stdout: "Updating abc123..def456\nFast-forward",
      stderr: "some warning",
    };
    runGitSpy.mockResolvedValue(mockOutput);

    const result = await gitPull("/test/repo");

    expect(result).toEqual(mockOutput);
  });

  it("should propagate errors from runGit", async () => {
    runGitSpy.mockRejectedValue(new Error("fatal: no tracking information"));

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
    runGitSpy.mockResolvedValue({
      stdout: "Everything up-to-date",
      stderr: "",
    });

    const result = await gitPush("/test/repo");

    expect(runGitSpy).toHaveBeenCalledWith("/test/repo", ["push"]);
    expect(result.stdout).toBe("Everything up-to-date");
  });

  it("should call git push with --force-with-lease when force is true", async () => {
    runGitSpy.mockResolvedValue({
      stdout: "Branch main set up to track remote branch main from origin.",
      stderr: "",
    });

    await gitPush("/test/repo", true);

    expect(runGitSpy).toHaveBeenCalledWith("/test/repo", [
      "push",
      "--force-with-lease",
    ]);
  });

  it("should call git push with --set-upstream when setUpstream is true", async () => {
    runGitSpy.mockResolvedValue({
      stdout:
        "Branch feature set up to track remote branch feature from origin.",
      stderr: "",
    });

    await gitPush("/test/repo", false, true);

    expect(runGitSpy).toHaveBeenCalledWith("/test/repo", [
      "push",
      "--set-upstream",
      "origin",
      "HEAD",
    ]);
  });

  it("should combine force and setUpstream flags", async () => {
    runGitSpy.mockResolvedValue({
      stdout: "Branch pushed with upstream",
      stderr: "",
    });

    await gitPush("/test/repo", true, true);

    expect(runGitSpy).toHaveBeenCalledWith("/test/repo", [
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
    runGitSpy.mockResolvedValue(mockOutput);

    const result = await gitPush("/test/repo");

    expect(result).toEqual(mockOutput);
  });

  it("should propagate errors from runGit", async () => {
    runGitSpy.mockRejectedValue(new Error("error: failed to push some refs"));

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
    runGitSpy.mockResolvedValue({
      stdout: "origin/main",
      stderr: "",
    });

    const result = await hasUpstreamBranch("/test/repo");

    expect(runGitSpy).toHaveBeenCalledWith("/test/repo", [
      "rev-parse",
      "--abbrev-ref",
      "--symbolic-full-name",
      "@{u}",
    ]);
    expect(result).toBe(true);
  });

  it("should return true when upstream exists with whitespace", async () => {
    runGitSpy.mockResolvedValue({
      stdout: "origin/feature\n",
      stderr: "",
    });

    const result = await hasUpstreamBranch("/test/repo");

    expect(result).toBe(true);
  });

  it("should return false when upstream branch does not exist", async () => {
    runGitSpy.mockRejectedValue(
      new Error("fatal: no upstream configured for branch"),
    );

    const result = await hasUpstreamBranch("/test/repo");

    expect(result).toBe(false);
  });

  it("should return false when git command returns empty output", async () => {
    runGitSpy.mockResolvedValue({
      stdout: "",
      stderr: "",
    });

    const result = await hasUpstreamBranch("/test/repo");

    expect(result).toBe(false);
  });

  it("should return false when git command returns only whitespace", async () => {
    runGitSpy.mockResolvedValue({
      stdout: "   \n  \t  ",
      stderr: "",
    });

    const result = await hasUpstreamBranch("/test/repo");

    expect(result).toBe(false);
  });

  it("should return false on any error", async () => {
    runGitSpy.mockRejectedValue(new Error("Git error"));

    const result = await hasUpstreamBranch("/test/repo");

    expect(result).toBe(false);
  });
});

describe("gitCommit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should be a function that accepts cwd and message", () => {
    expect(typeof gitCommit).toBe("function");
    expect(gitCommit.length).toBe(2); // expects 2 parameters
  });

  // Note: Full integration tests for gitCommit are covered in component tests
  // and end-to-end testing. The following behaviors are verified there:
  // - Calling git commit with correct message parameter
  // - Handling multiline commit messages
  // - Handling commit messages with special characters
  // - Error handling for no staged files
  // - Error handling for empty working tree
  // - Returning stdout and stderr from successful commits
});

describe("gitStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call git add with single file", async () => {
    runGitSpy.mockResolvedValue({
      stdout: "",
      stderr: "",
    });

    await gitStage("/test/repo", ["file1.ts"]);

    expect(runGitSpy).toHaveBeenCalledWith("/test/repo", [
      "add",
      "--",
      "file1.ts",
    ]);
  });

  it("should call git add with multiple files", async () => {
    runGitSpy.mockResolvedValue({
      stdout: "",
      stderr: "",
    });

    await gitStage("/test/repo", ["file1.ts", "file2.ts", "src/index.ts"]);

    expect(runGitSpy).toHaveBeenCalledWith("/test/repo", [
      "add",
      "--",
      "file1.ts",
      "file2.ts",
      "src/index.ts",
    ]);
  });

  it("should return stdout and stderr from git command", async () => {
    const mockOutput = {
      stdout: "",
      stderr: "warning: LF will be replaced by CRLF",
    };
    runGitSpy.mockResolvedValue(mockOutput);

    const result = await gitStage("/test/repo", ["file1.ts"]);

    expect(result).toEqual(mockOutput);
  });

  it("should propagate errors from runGit", async () => {
    runGitSpy.mockRejectedValue(
      new Error("fatal: pathspec 'file.ts' did not match any files"),
    );

    await expect(gitStage("/test/repo", ["file.ts"])).rejects.toThrow(
      "did not match any files",
    );
  });
});

describe("gitUnstage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call git reset HEAD with single file", async () => {
    runGitSpy.mockResolvedValue({
      stdout: "Unstaged changes after reset:\nM\tfile1.ts",
      stderr: "",
    });

    await gitUnstage("/test/repo", ["file1.ts"]);

    expect(runGitSpy).toHaveBeenCalledWith("/test/repo", [
      "reset",
      "HEAD",
      "--",
      "file1.ts",
    ]);
  });

  it("should call git reset HEAD with multiple files", async () => {
    runGitSpy.mockResolvedValue({
      stdout: "Unstaged changes after reset:\nM\tfile1.ts\nM\tfile2.ts",
      stderr: "",
    });

    await gitUnstage("/test/repo", ["file1.ts", "file2.ts"]);

    expect(runGitSpy).toHaveBeenCalledWith("/test/repo", [
      "reset",
      "HEAD",
      "--",
      "file1.ts",
      "file2.ts",
    ]);
  });

  it("should return stdout and stderr from git command", async () => {
    const mockOutput = {
      stdout: "Unstaged changes after reset:\nM\tfile1.ts",
      stderr: "",
    };
    runGitSpy.mockResolvedValue(mockOutput);

    const result = await gitUnstage("/test/repo", ["file1.ts"]);

    expect(result).toEqual(mockOutput);
  });

  it("should propagate errors from runGit", async () => {
    runGitSpy.mockRejectedValue(new Error("fatal: ambiguous argument 'HEAD'"));

    await expect(gitUnstage("/test/repo", ["file.ts"])).rejects.toThrow(
      "ambiguous argument",
    );
  });
});

describe("gitRevert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call git checkout HEAD with single file", async () => {
    runGitSpy.mockResolvedValue({
      stdout: "",
      stderr: "",
    });

    await gitRevert("/test/repo", ["file1.ts"]);

    expect(runGitSpy).toHaveBeenCalledWith("/test/repo", [
      "checkout",
      "HEAD",
      "--",
      "file1.ts",
    ]);
  });

  it("should call git checkout HEAD with multiple files", async () => {
    runGitSpy.mockResolvedValue({
      stdout: "",
      stderr: "",
    });

    await gitRevert("/test/repo", ["file1.ts", "file2.ts", "src/index.ts"]);

    expect(runGitSpy).toHaveBeenCalledWith("/test/repo", [
      "checkout",
      "HEAD",
      "--",
      "file1.ts",
      "file2.ts",
      "src/index.ts",
    ]);
  });

  it("should return stdout and stderr from git command", async () => {
    const mockOutput = {
      stdout: "",
      stderr: "",
    };
    runGitSpy.mockResolvedValue(mockOutput);

    const result = await gitRevert("/test/repo", ["file1.ts"]);

    expect(result).toEqual(mockOutput);
  });

  it("should propagate errors from runGit", async () => {
    runGitSpy.mockRejectedValue(
      new Error("error: pathspec 'file.ts' did not match any files"),
    );

    await expect(gitRevert("/test/repo", ["file.ts"])).rejects.toThrow(
      "did not match any files",
    );
  });
});
