import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { createGit } from "./createGit";

const shellEnv = {
  GIT_AUTHOR_NAME: "Shell Author",
  GIT_AUTHOR_EMAIL: "shell@example.com",
  GIT_EDITOR: "shell-editor",
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "conduit.probe",
  GIT_CONFIG_VALUE_0: "from-shell",
};

// Under a git hook or `git rebase --exec`, these point git at the repo the
// tests run in, and a fixture would be committed there. GIT_OPTIONAL_LOCKS is
// cleared too, since a parent process that sets it would hide the lock.
const clearedEnv = [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_OPTIONAL_LOCKS",
];

describe("createGit", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const key of [...Object.keys(shellEnv), ...clearedEnv]) {
      if (originalEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  });

  it("runs git with the shell's git variables", async () => {
    Object.assign(process.env, shellEnv);
    const git = createGit(os.tmpdir());

    const author = await git.raw(["var", "GIT_AUTHOR_IDENT"]);
    const editor = await git.raw(["var", "GIT_EDITOR"]);
    const config = await git.raw(["config", "--get", "conduit.probe"]);

    expect(author).toContain("Shell Author <shell@example.com>");
    expect(editor.trim()).toBe("shell-editor");
    expect(config.trim()).toBe("from-shell");
  });

  it("reads status without blocking the user's own stage and unstage", async () => {
    for (const key of clearedEnv) delete process.env[key];
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "conduit-git-lock-"));
    // The user's git, as their terminal runs it.
    const userGit = (...args: string[]) =>
      promisify(execFile)("git", args, {
        cwd: repo,
        env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null" },
      });

    try {
      fs.writeFileSync(path.join(repo, "notes.txt"), "one\n");
      await userGit("init", "-q");
      await userGit("add", ".");
      await userGit(
        "-c",
        "user.name=Test",
        "-c",
        "user.email=test@example.com",
        "commit",
        "-q",
        "-m",
        "Initial commit",
      );
      fs.appendFileSync(path.join(repo, "notes.txt"), "two\n");
      // Without the flag, status holds the lock while it scans for untracked
      // files, so a lot of them make a collision all but certain.
      fs.mkdirSync(path.join(repo, "untracked"));
      for (let i = 0; i < 5000; i++) {
        fs.writeFileSync(path.join(repo, "untracked", `${i}.txt`), "");
      }

      const git = createGit(repo);
      let staging = true;
      const backgroundStatus = (async () => {
        while (staging) await git.status();
      })();

      try {
        for (let i = 0; i < 30; i++) {
          await userGit("add", "notes.txt");
          await userGit("reset", "-q", "HEAD", "--", "notes.txt");
        }
      } finally {
        staging = false;
        await backgroundStatus;
      }

      const { stdout } = await userGit("diff", "--name-only");
      expect(stdout).toBe("notes.txt\n");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
