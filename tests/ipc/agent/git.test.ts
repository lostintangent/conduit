import { beforeEach, describe, expect, it, vi } from "vitest";

// Create a callback-style mock function that promisify can work with
const mockExecFileImpl = vi.hoisted(() => vi.fn());
const mockStatImpl = vi.hoisted(() => vi.fn());
const mockRealpathImpl = vi.hoisted(() => vi.fn());

// Mock child_process module with a proper callback-style function
vi.mock("node:child_process", () => ({
  execFile: mockExecFileImpl,
  default: {
    execFile: mockExecFileImpl,
  },
}));

// Mock fs promises for findRepoRoot
vi.mock("node:fs/promises", () => ({
  realpath: mockRealpathImpl,
  stat: mockStatImpl,
  default: {
    realpath: mockRealpathImpl,
    stat: mockStatImpl,
  },
}));

const execFile = mockExecFileImpl;
const stat = mockStatImpl;
import { findRepoRoot, runGit } from "../../../src/ipc/agent/git";

// These cover what the removed legacy git tests exercised incidentally:
// repo-root discovery for agent worktrees and runGit's output and errors.
describe("findRepoRoot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRealpathImpl.mockImplementation(async (p: string) => p);
  });

  it("resolves the repo root from a subdirectory", async () => {
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
        callback(null, { stdout: "", stderr: "" });
      },
    );

    await expect(findRepoRoot("/test/repo/src/components")).resolves.toBe(
      "/test/repo",
    );
  });

  it("reports the root under the path the caller used", async () => {
    // git prints realpaths, like /private/tmp/repo for a repo opened as /tmp/repo.
    mockRealpathImpl.mockImplementation(async (p: string) =>
      p.replace(/^\/tmp\//, "/private/tmp/"),
    );
    (execFile as any).mockImplementation(
      (cmd: string, args: string[], opts: any, callback: any) => {
        const stdout =
          args[1] === "--git-common-dir" ? ".git\n" : "/private/tmp/repo\n";
        callback(null, { stdout, stderr: "" });
      },
    );

    await expect(findRepoRoot("/tmp/repo/src")).resolves.toBe("/tmp/repo");
  });

  it("returns null outside a git repository", async () => {
    (stat as any).mockImplementation(() => {
      const error: any = new Error("ENOENT");
      error.code = "ENOENT";
      return Promise.reject(error);
    });
    (execFile as any).mockImplementation(
      (cmd: string, args: string[], opts: any, callback: any) => {
        const error: any = new Error(
          "fatal: not a git repository (or any of the parent directories)",
        );
        error.code = 128;
        callback(error);
      },
    );

    await expect(findRepoRoot("/some/random/path")).resolves.toBeNull();
  });
});

describe("runGit", () => {
  it("returns git's output, run in cwd under the C locale", async () => {
    execFile.mockImplementation((_cmd, _args, _opts, callback) => {
      callback(null, { stdout: "main\n", stderr: "" });
    });

    await expect(
      runGit("/test/repo", ["rev-parse", "--abbrev-ref", "HEAD"]),
    ).resolves.toEqual({ stdout: "main\n", stderr: "" });
    expect(execFile).toHaveBeenCalledWith(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      expect.objectContaining({
        cwd: "/test/repo",
        env: expect.objectContaining({ LC_ALL: "C" }),
      }),
      expect.any(Function),
    );
  });

  it("propagates errors from the git command", async () => {
    (execFile as any).mockImplementation(
      (cmd: string, args: string[], opts: any, callback: any) => {
        const error: any = new Error(
          "error: pathspec 'file.ts' did not match any files",
        );
        error.code = 1;
        error.stderr = "error: pathspec 'file.ts' did not match any files";
        callback(error);
      },
    );

    await expect(
      runGit("/test/repo", ["restore", "--", "file.ts"]),
    ).rejects.toThrow("did not match any files");
  });
});
