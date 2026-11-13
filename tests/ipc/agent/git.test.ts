import { beforeEach, describe, expect, it, vi } from "vitest";

// Create a callback-style mock function that promisify can work with
const mockExecFileImpl = vi.hoisted(() => vi.fn());
const mockStatImpl = vi.hoisted(() => vi.fn());

// Mock child_process module with a proper callback-style function
vi.mock("node:child_process", () => ({
  execFile: mockExecFileImpl,
  default: {
    execFile: mockExecFileImpl,
  },
}));

// Mock fs promises for findRepoRoot
vi.mock("node:fs/promises", () => ({
  stat: mockStatImpl,
  default: {
    stat: mockStatImpl,
  },
}));

const execFile = mockExecFileImpl;
const stat = mockStatImpl;
import {
  gitCommit,
  gitPull,
  gitPush,
  gitRevert,
  gitStage,
  gitUnstage,
  hasUpstreamBranch,
} from "../../../src/ipc/agent/git";

describe("gitPull", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call git pull without rebase by default", async () => {
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(null, { stdout: "Already up to date.", stderr: "" });
    });

    const result = await gitPull("/test/repo");

    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["pull"],
      expect.objectContaining({ cwd: "/test/repo" }),
      expect.any(Function),
    );
    expect(result.stdout).toBe("Already up to date.");
  });

  it("should call git pull with --rebase when rebase is true", async () => {
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(null, {
        stdout: "Successfully rebased and updated refs/heads/main.",
        stderr: "",
      });
    });

    await gitPull("/test/repo", true);

    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["pull", "--rebase"],
      expect.objectContaining({ cwd: "/test/repo" }),
      expect.any(Function),
    );
  });

  it("should return stdout and stderr from git command", async () => {
    const mockOutput = {
      stdout: "Updating abc123..def456\nFast-forward",
      stderr: "some warning",
    };
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(null, mockOutput);
    });

    const result = await gitPull("/test/repo");

    expect(result).toEqual(mockOutput);
  });

  it("should propagate errors from git command", async () => {
    const error: any = new Error("fatal: no tracking information");
    error.code = 1;
    error.stderr = "fatal: no tracking information";
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(error);
    });

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
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(null, { stdout: "Everything up-to-date", stderr: "" });
    });

    const result = await gitPush("/test/repo");

    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["push"],
      expect.objectContaining({ cwd: "/test/repo" }),
      expect.any(Function),
    );
    expect(result.stdout).toBe("Everything up-to-date");
  });

  it("should call git push with --force-with-lease when force is true", async () => {
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(null, {
        stdout: "Branch main set up to track remote branch main from origin.",
        stderr: "",
      });
    });

    await gitPush("/test/repo", true);

    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["push", "--force-with-lease"],
      expect.objectContaining({ cwd: "/test/repo" }),
      expect.any(Function),
    );
  });

  it("should call git push with --set-upstream when setUpstream is true", async () => {
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(null, {
        stdout:
          "Branch feature set up to track remote branch feature from origin.",
        stderr: "",
      });
    });

    await gitPush("/test/repo", false, true);

    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["push", "--set-upstream", "origin", "HEAD"],
      expect.objectContaining({ cwd: "/test/repo" }),
      expect.any(Function),
    );
  });

  it("should combine force and setUpstream flags", async () => {
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(null, { stdout: "Branch pushed with upstream", stderr: "" });
    });

    await gitPush("/test/repo", true, true);

    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["push", "--force-with-lease", "--set-upstream", "origin", "HEAD"],
      expect.objectContaining({ cwd: "/test/repo" }),
      expect.any(Function),
    );
  });

  it("should return stdout and stderr from git command", async () => {
    const mockOutput = {
      stdout: "To github.com:user/repo.git\n   abc123..def456  main -> main",
      stderr: "",
    };
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(null, mockOutput);
    });

    const result = await gitPush("/test/repo");

    expect(result).toEqual(mockOutput);
  });

  it("should propagate errors from git command", async () => {
    const error: any = new Error("error: failed to push some refs");
    error.code = 1;
    error.stderr = "error: failed to push some refs";
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(error);
    });

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
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(null, { stdout: "origin/main", stderr: "" });
    });

    const result = await hasUpstreamBranch("/test/repo");

    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      expect.objectContaining({ cwd: "/test/repo" }),
      expect.any(Function),
    );
    expect(result).toBe(true);
  });

  it("should return true when upstream exists with whitespace", async () => {
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(null, { stdout: "origin/feature\n", stderr: "" });
    });

    const result = await hasUpstreamBranch("/test/repo");

    expect(result).toBe(true);
  });

  it("should return false when upstream branch does not exist", async () => {
    const error: any = new Error("fatal: no upstream configured for branch");
    error.code = 128;
    error.stderr = "fatal: no upstream configured for branch";
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(error);
    });

    const result = await hasUpstreamBranch("/test/repo");

    expect(result).toBe(false);
  });

  it("should return false when git command returns empty output", async () => {
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(null, { stdout: "", stderr: "" });
    });

    const result = await hasUpstreamBranch("/test/repo");

    expect(result).toBe(false);
  });

  it("should return false when git command returns only whitespace", async () => {
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(null, { stdout: "   \n  \t  ", stderr: "" });
    });

    const result = await hasUpstreamBranch("/test/repo");

    expect(result).toBe(false);
  });

  it("should return false on any error", async () => {
    const error: any = new Error("Git error");
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(error);
    });

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
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(null, { stdout: "", stderr: "" });
    });

    await gitStage("/test/repo", ["file1.ts"]);

    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["add", "--", "file1.ts"],
      expect.objectContaining({ cwd: "/test/repo" }),
      expect.any(Function),
    );
  });

  it("should call git add with multiple files", async () => {
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(null, { stdout: "", stderr: "" });
    });

    await gitStage("/test/repo", ["file1.ts", "file2.ts", "src/index.ts"]);

    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["add", "--", "file1.ts", "file2.ts", "src/index.ts"],
      expect.objectContaining({ cwd: "/test/repo" }),
      expect.any(Function),
    );
  });

  it("should return stdout and stderr from git command", async () => {
    const mockOutput = {
      stdout: "",
      stderr: "warning: LF will be replaced by CRLF",
    };
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(null, mockOutput);
    });

    const result = await gitStage("/test/repo", ["file1.ts"]);

    expect(result).toEqual(mockOutput);
  });

  it("should propagate errors from git command", async () => {
    const error: any = new Error(
      "fatal: pathspec 'file.ts' did not match any files",
    );
    error.code = 128;
    error.stderr = "fatal: pathspec 'file.ts' did not match any files";
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(error);
    });

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
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(null, {
        stdout: "Unstaged changes after reset:\nM\tfile1.ts",
        stderr: "",
      });
    });

    await gitUnstage("/test/repo", ["file1.ts"]);

    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["reset", "HEAD", "--", "file1.ts"],
      expect.objectContaining({ cwd: "/test/repo" }),
      expect.any(Function),
    );
  });

  it("should call git reset HEAD with multiple files", async () => {
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(null, {
        stdout: "Unstaged changes after reset:\nM\tfile1.ts\nM\tfile2.ts",
        stderr: "",
      });
    });

    await gitUnstage("/test/repo", ["file1.ts", "file2.ts"]);

    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["reset", "HEAD", "--", "file1.ts", "file2.ts"],
      expect.objectContaining({ cwd: "/test/repo" }),
      expect.any(Function),
    );
  });

  it("should return stdout and stderr from git command", async () => {
    const mockOutput = {
      stdout: "Unstaged changes after reset:\nM\tfile1.ts",
      stderr: "",
    };
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(null, mockOutput);
    });

    const result = await gitUnstage("/test/repo", ["file1.ts"]);

    expect(result).toEqual(mockOutput);
  });

  it("should propagate errors from git command", async () => {
    const error: any = new Error("fatal: ambiguous argument 'HEAD'");
    error.code = 128;
    error.stderr = "fatal: ambiguous argument 'HEAD'";
    (execFile as any).mockImplementation((cmd, args, opts, callback) => {
      callback(error);
    });

    await expect(gitUnstage("/test/repo", ["file.ts"])).rejects.toThrow(
      "ambiguous argument",
    );
  });
});

describe("gitRevert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock stat to simulate .git directory exists at /test/repo
    (stat as any).mockImplementation((path: string) => {
      if (path === "/test/repo/.git") {
        return Promise.resolve({}); // Simulates .git exists
      }
      const error: any = new Error("ENOENT");
      error.code = "ENOENT";
      return Promise.reject(error);
    });
  });

  // Helper to create a mock that handles both findRepoRoot and the actual git command
  const setupExecFileMock = (
    restoreCallback?: (args: string[]) => void,
    restoreShouldFail = false,
  ) => {
    (execFile as any).mockImplementation(
      (cmd: string, args: string[], opts: any, callback: any) => {
        // Handle findRepoRoot's git rev-parse --git-common-dir call
        if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
          callback(null, { stdout: ".git\n", stderr: "" });
          return;
        }
        // Handle findRepoRoot's git rev-parse --show-toplevel call
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
          callback(null, { stdout: "/test/repo\n", stderr: "" });
          return;
        }
        // Handle git restore
        if (args[0] === "restore") {
          if (restoreCallback) restoreCallback(args);
          if (restoreShouldFail) {
            const error: any = new Error("git: 'restore' is not a git command");
            error.code = 1;
            callback(error);
          } else {
            callback(null, { stdout: "", stderr: "" });
          }
          return;
        }
        // Handle git checkout (fallback)
        if (args[0] === "checkout") {
          callback(null, { stdout: "", stderr: "" });
          return;
        }
        // Default
        callback(null, { stdout: "", stderr: "" });
      },
    );
  };

  it("should use git restore for modern git versions", async () => {
    setupExecFileMock();

    await gitRevert("/test/repo", ["file1.ts"]);

    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["restore", "--", "file1.ts"],
      expect.objectContaining({ cwd: "/test/repo" }),
      expect.any(Function),
    );
  });

  it("should fallback to git checkout if git restore fails", async () => {
    setupExecFileMock(undefined, true); // Make restore fail

    await gitRevert("/test/repo", ["file1.ts"]);

    // Should have called: rev-parse --git-common-dir, rev-parse --show-toplevel, restore, checkout
    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["restore", "--", "file1.ts"],
      expect.objectContaining({ cwd: "/test/repo" }),
      expect.any(Function),
    );
    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["checkout", "--", "file1.ts"],
      expect.objectContaining({ cwd: "/test/repo" }),
      expect.any(Function),
    );
  });

  it("should handle multiple files", async () => {
    setupExecFileMock();

    await gitRevert("/test/repo", ["file1.ts", "file2.ts", "src/index.ts"]);

    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["restore", "--", "file1.ts", "file2.ts", "src/index.ts"],
      expect.objectContaining({ cwd: "/test/repo" }),
      expect.any(Function),
    );
  });

  it("should handle deleted files by restoring from index", async () => {
    setupExecFileMock();

    await gitRevert("/test/repo", ["deleted-file.ts"]);

    // git restore (without HEAD) restores from index, which works for deleted files
    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["restore", "--", "deleted-file.ts"],
      expect.objectContaining({ cwd: "/test/repo" }),
      expect.any(Function),
    );
  });

  it("should sanitize Windows-style paths to forward slashes", async () => {
    setupExecFileMock();

    await gitRevert("/test/repo", ["src\\components\\Button.tsx"]);

    // Backslashes should be converted to forward slashes
    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["restore", "--", "src/components/Button.tsx"],
      expect.objectContaining({ cwd: "/test/repo" }),
      expect.any(Function),
    );
  });

  it("should convert absolute paths to relative paths from git root", async () => {
    setupExecFileMock();

    await gitRevert("/test/repo", ["/test/repo/src/file.ts"]);

    // Absolute path should be converted to relative
    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["restore", "--", "src/file.ts"],
      expect.objectContaining({ cwd: "/test/repo" }),
      expect.any(Function),
    );
  });

  it("should work when called from a subdirectory", async () => {
    // Mock to return the subdirectory's repo root correctly
    (execFile as any).mockImplementation(
      (cmd: string, args: string[], opts: any, callback: any) => {
        if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
          callback(null, { stdout: ".git\n", stderr: "" });
          return;
        }
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
          callback(null, { stdout: "/test/repo\n", stderr: "" });
          return;
        }
        if (args[0] === "restore") {
          callback(null, { stdout: "", stderr: "" });
          return;
        }
        callback(null, { stdout: "", stderr: "" });
      },
    );

    // Even if cwd is a subdirectory, it should find the git root
    await gitRevert("/test/repo/src/components", ["Button.tsx"]);

    // Should run git from repo root with correct relative path
    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["restore", "--", "Button.tsx"],
      expect.objectContaining({ cwd: "/test/repo" }),
      expect.any(Function),
    );
  });

  it("should return stdout and stderr from git command", async () => {
    setupExecFileMock();

    const result = await gitRevert("/test/repo", ["file1.ts"]);

    expect(result).toEqual({ stdout: "", stderr: "" });
  });

  it("should throw error if not in a git repository", async () => {
    // Mock stat to never find .git directory (simulating non-git directory)
    (stat as any).mockImplementation((path: string) => {
      const error: any = new Error("ENOENT");
      error.code = "ENOENT";
      return Promise.reject(error);
    });

    // Mock execFile to fail for git rev-parse (simulating not in git repo)
    (execFile as any).mockImplementation(
      (cmd: string, args: string[], opts: any, callback: any) => {
        if (args[0] === "rev-parse") {
          const error: any = new Error(
            "fatal: not a git repository (or any of the parent directories)",
          );
          error.code = 128;
          callback(error);
          return;
        }
        callback(null, { stdout: "", stderr: "" });
      },
    );

    // gitRevert should throw before calling execFile if findRepoRoot returns null
    await expect(gitRevert("/some/random/path", ["file.ts"])).rejects.toThrow(
      "Not in a git repository",
    );
  });

  it("should propagate errors from git command", async () => {
    (execFile as any).mockImplementation(
      (cmd: string, args: string[], opts: any, callback: any) => {
        if (args[0] === "rev-parse" && args[1] === "--git-common-dir") {
          callback(null, { stdout: ".git\n", stderr: "" });
          return;
        }
        if (args[0] === "rev-parse" && args[1] === "--show-toplevel") {
          callback(null, { stdout: "/test/repo\n", stderr: "" });
          return;
        }
        if (args[0] === "restore") {
          const error: any = new Error(
            "error: pathspec 'file.ts' did not match any files",
          );
          error.code = 1;
          error.stderr = "error: pathspec 'file.ts' did not match any files";
          callback(error);
          return;
        }
        if (args[0] === "checkout") {
          const error: any = new Error(
            "error: pathspec 'file.ts' did not match any files",
          );
          error.code = 1;
          error.stderr = "error: pathspec 'file.ts' did not match any files";
          callback(error);
          return;
        }
        callback(null, { stdout: "", stderr: "" });
      },
    );

    await expect(gitRevert("/test/repo", ["file.ts"])).rejects.toThrow(
      "did not match any files",
    );
  });
});
