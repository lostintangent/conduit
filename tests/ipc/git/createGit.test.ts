import { spawn } from "node:child_process";
import * as os from "node:os";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createGit } from "../../../src/ipc/git/createGit";

const shellEnv = {
  GIT_AUTHOR_NAME: "Shell Author",
  GIT_AUTHOR_EMAIL: "shell@example.com",
  GIT_EDITOR: "shell-editor",
  GIT_CONFIG_COUNT: "1",
  GIT_CONFIG_KEY_0: "conduit.probe",
  GIT_CONFIG_VALUE_0: "from-shell",
};

describe("createGit", () => {
  const originalEnv = { ...process.env };

  // Under `bun test`, a fresh worker's first spawn can be slow enough that a
  // fast child like `git var` exits before spawn() returns. Bun then emits its
  // exit and close, and drops its stdout, before simple-git can listen, so the
  // call never settles. Pay that first spawn on `cat`, which can't exit until
  // its stdin closes after spawn() has returned.
  beforeAll(async () => {
    const cat = spawn("cat");
    const closed = new Promise((resolve) => cat.on("close", resolve));
    cat.stdin.end();
    await closed;
  });

  afterEach(() => {
    for (const key of Object.keys(shellEnv)) {
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
});
