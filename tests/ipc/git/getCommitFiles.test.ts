import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DiskGitProvider } from "../../../src/ipc/git/DiskGitProvider";

describe("DiskGitProvider.getCommitFiles", () => {
  let repo: string;

  // Runs git in the repo without the user's config, which could sign commits.
  const git = (...args: string[]) =>
    execFileSync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
      {
        cwd: repo,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
        },
      },
    ).trim();

  beforeAll(() => {
    // Under a git hook or `git rebase --exec`, these point git at the repo the
    // tests run in, and the fixture would be committed there.
    for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"]) {
      delete process.env[key];
    }
  });

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), "conduit-commit-files-"));
    git("init", "-q");
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it("lists the files a root commit adds", async () => {
    fs.writeFileSync(path.join(repo, "README.md"), "one\ntwo\n");
    git("add", "README.md");
    git("commit", "-q", "-m", "Initial commit");

    const provider = new DiskGitProvider(repo, repo);
    const files = await provider.getCommitFiles(git("rev-parse", "HEAD"));

    expect(files).toEqual([
      expect.objectContaining({
        path: "README.md",
        status: "added",
        additions: 2,
        deletions: 0,
      }),
    ]);
  });
});
